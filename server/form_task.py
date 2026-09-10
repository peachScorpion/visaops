#!/usr/bin/env python3
"""填表任务：把「官方表格上要填哪些格」变成「这个人这张表填到哪了」。

字段库（formver / form_field）是模板，一个国家一套；
填表任务（form_task / form_answer）是实例，一个申请人一张。
模板不能存答案，答案也不能只存成一个 JSON——理由写在 schema.sql 的建表注释里。

—— 关于「AI 预填」这四个字，先把话说清楚 ——
这个原型没有接任何 OCR 引擎。DS-160 里标 src='ocr' 的 18 个格子，
数据实际来自 applicant 表里已经录好的证件信息（姓名拼音、性别、出生日期、
护照号、有效期、签发地……这些本来就是收单时照着证件抄进系统的）。
真实环境里这一层换成护照 MRZ / 身份证 OCR 的识别结果，映射规则不用改。
所以下面这套引擎准确的叫法是「按已有结构化数据自动带出」，不是「AI 识别」。

硬规矩：匹配不上的格子一律留空，不猜、不推断、不编。
少填一格专员补一下就行，编错一格是虚假陈述——DS-160 里 15 个高风险字段
填错的后果是拒签甚至永久拒签记录，宁可空着。
"""
import json
import re
import uuid
from datetime import datetime, timedelta

# 状态与角色文案。三个入口填同一张表，所以「谁填的」必须单独记一列。
STATUS = {"wait": "待填写", "filling": "填写中", "submitted": "已提交待复核",
          "confirmed": "专员已确认", "official": "已在官网录入"}
FILLED_BY = {"self": "客人自填", "sales": "销售代填", "agent": "专员代填"}
SRC_TEXT = {"ocr": "证件信息带出", "sys": "系统带出", "ask": "客户必答", "agent": "专员官网操作"}
# 角色 → 这张表算谁填的。销售和专员都能替客人填，出了错要分得清责任。
ROLE_FILLED_BY = {"customer": "self", "csp": "sales", "uom": "agent",
                  "lead": "agent", "ops": "agent"}
SHARE_DAYS = 7  # 分享链接有效期：表单里全是护照号、家庭住址，链接不能永久有效

# 预填能覆盖的来源：agent 的 4 个格子是专员在官网上的动作（设密保、审查、打印确认页），
# 系统里根本没有对应的「值」可填；ask 的 34 个格子只有客户本人知道。
AUTO_SRC = ("ocr", "sys")

# —— 高风险题的默认答案 ——
# 业务口径（唐美芳 2026-08-26 定）：签证专员现行流程里根本不会向客人提起这几题的存在，
# 一律按「否」走；客人端不出现这些题，除必要信息外其余由系统处理。
# 所以这 15 格由系统写「否」，但**必须与客人自己答的「否」区分开**：
# 答案 src 记成 'default'，专员复核页单独列出，界面写明「未与客户核对」。
# 这不是多余的谨慎——DS-160 这几题答错属虚假陈述，后果是永久不可入境记录，
# 真出事时唯一能自证的就是这条记录：到底是系统默认的，还是客人亲口答的。
RISK_DEFAULT = "否"
DEFAULT_SRC = "default"
DEFAULT_BY = "系统默认"


def now(d=0):
    return (datetime.now() + timedelta(days=d)).strftime("%Y-%m-%d %H:%M:%S")


# app.py 里有同名小工具，这里不 import app 是为了避免循环引用（app 要 import 本模块）。
def _rows(c, sql, args=()):
    return [dict(r) for r in c.execute(sql, args).fetchall()]


def _one(c, sql, args=()):
    r = c.execute(sql, args).fetchone()
    return dict(r) if r else None


# ============================ 任务的建立 ============================

def pick_formver(c, product, fullver_id=None):
    """给这个产品挑它该用的官方表模板。

    ⚠️ 2026-09-09 改回引用链，唐美芳纠正：「正常产品上关联的是国家送签材料库里的
    清单版本，国家送签材料库里关联的是国家签证表模板，这是模板是底层，可以被
    国家送签材料库多次引用」。

        产品 / 供应商产品 —fullver_id→ 国家送签材料库（清单版本）
                          —formver_id→ 国家签证表模板（底层字典）

    原来这里是**按国家 + 签证类型去猜**（country 匹配 + status='published'），
    等于绕开了运营在清单版本上做的那次关联：同一个国家有两份模板时挑哪份全看 id 大小，
    而且逼着表模板自己也要有一套「发布」状态——那一层是多余的，
    表模板作为底层字典只需要启用 / 禁用，能不能用由**引用它的清单版本**决定。

    挑不到就不建任务：清单没关联表模板 = 这个国家递交纸质表，本来就没有在线填表这一层。
    """
    if not product and not fullver_id:
        return None
    if not fullver_id:
        keys = product.keys() if hasattr(product, "keys") else product
        fullver_id = product["fullver_id"] if "fullver_id" in keys else None
    if not fullver_id:
        return None
    fu = _one(c, "select * from fullver where id=?", (fullver_id,))
    if not fu or not fu["formver_id"]:
        return None
    # 只认启用中的模板：运营把某份模板停用，引用它的清单就跟着失效，
    # 不能出现「模板已停用、单子还在按它建表」。
    return _one(c, "select * from formver where id=? and active=1", (fu["formver_id"],))


def ensure_task(c, applicant, product=None):
    """下单后每个申请人一张表。这里做成幂等的 get-or-create：
    /order/create 时正常建一次；老订单（本次改造之前下的单）第一次打开列表时补建。"""
    t = _one(c, "select * from form_task where applicant_id=?", (applicant["id"],))
    if t:
        return t
    if product is None:
        o = _one(c, "select * from ord where id=?", (applicant["ord_id"],))
        product = _one(c, "select * from product where id=?", (o["product_id"],)) if o else None
    # 清单版本优先取供应商产品上的那份——同一条平台产品下，不同供应商可以
    # 各自维护收料要求（「复制新版」出来的自建版本），表模板也可能因此不同。
    fvid = None
    if product is None or "fullver_id" not in (product.keys() if hasattr(product, "keys") else product):
        product = None
    o2 = _one(c, "select * from ord where id=?", (applicant["ord_id"],))
    if o2:
        sp = _one(c, "select * from sup_product where id=?", (o2["sup_product_id"],))
        fvid = (sp or {}).get("fullver_id")
        if not fvid:
            pr = _one(c, "select * from product where id=?", (o2["product_id"],))
            fvid = (pr or {}).get("fullver_id")
    fv = pick_formver(c, product, fvid)
    if not fv:
        return None
    c.execute("insert into form_task(applicant_id,formver_id,status,created_at,updated_at)"
              " values(?,?,'wait',?,?)", (applicant["id"], fv["id"], now(), now()))
    return _one(c, "select * from form_task where applicant_id=?", (applicant["id"],))


def touch(c, task_id, **kw):
    kw["updated_at"] = now()
    c.execute("update form_task set %s where id=?" % ",".join(k + "=?" for k in kw),
              list(kw.values()) + [task_id])


def new_token():
    return uuid.uuid4().hex


# ============================ 真实数据 → 官方字段 的映射 ============================
# 匹配靠 form_field.name 里的关键词。官方字段名是中英对照原文（"姓氏 (Surnames) (e.g., ...)"），
# 用关键词而不是字段 id，是因为官方表单改版后 id 会变、措辞基本不变。
# not_kw 用来排掉「同名反问句」：官方表里「电话号码」和「过去五年里，您是否使用过其他电话号码？」
# 都含「电话号码」，后者问的是历史号码，系统里没有，绝不能拿当前号码去填。

def _split_en(name_en, part):
    """护照机读区姓名格式 SURNAME/GIVEN NAMES。拆不出来就返回空——
    拿中文名硬拼拼音是最典型的「填错姓名拼写」拒签原因。"""
    if not name_en or "/" not in name_en:
        return ""
    a, b = name_en.split("/", 1)
    return (a if part == "sur" else b).strip()


CROWD_OCCUPATION = {"job": "在职（受雇）", "free": "自由职业", "student": "学生",
                    "retire": "退休", "child": "无（学龄前儿童）"}


def _rules():
    """(标识, 必含关键词, 排除关键词, 取值函数, 数据来源说明)"""
    return [
        # ---- 证件信息（真实环境由护照/身份证 OCR 提供，本原型取收单时录入的证件字段）----
        ("surname", ("姓氏",), (), lambda d: _split_en(d["a"]["name_en"], "sur"),
         "护照资料页 · applicant.name_en"),
        ("given", ("名字",), (), lambda d: _split_en(d["a"]["name_en"], "given"),
         "护照资料页 · applicant.name_en"),
        ("native", ("母语",), (), lambda d: d["a"]["name_cn"], "护照资料页 · applicant.name_cn"),
        ("sex", ("性别",), (), lambda d: d["a"]["sex"], "护照资料页 · applicant.sex"),
        ("birth", ("出生日期",), (), lambda d: d["a"]["birth"], "护照资料页 · applicant.birth"),
        ("nation", ("国籍",), (), lambda d: d["a"]["nation"], "护照资料页 · applicant.nation"),
        # 系统里一个人只存一套证件号，护照号不能拿去填「国民身份证号码」——
        # 号码串错在 DS-160 里属于身份信息不实，只在 id_type 确实是身份证时才填。
        ("id_card", ("身份证号码",), (),
         lambda d: d["a"]["id_no"] if (d["a"]["id_type"] or "") == "身份证" else "",
         "身份证 · applicant.id_no（仅当证件类型为身份证）"),
        ("pp_type", ("护照", "类型"), (), lambda d: d["a"]["id_type"],
         "护照资料页 · applicant.id_type"),
        ("pp_no", ("护照", "号码"), ("遗失",), lambda d: d["a"]["id_no"],
         "护照资料页 · applicant.id_no"),
        ("pp_place", ("签发",), (), lambda d: d["a"]["id_place"],
         "护照资料页 · applicant.id_place"),
        ("pp_expiry", ("截止日期",), (), lambda d: d["a"]["id_expiry"],
         "护照资料页 · applicant.id_expiry"),
        ("occupation", ("职业",), (),
         lambda d: CROWD_OCCUPATION.get(d["a"]["crowd"], ""),
         "在职证明 · applicant.crowd（适用人群）"),
        # ---- 订单 / 产品 ----
        ("purpose", ("目的",), (), lambda d: (d["p"] or {}).get("visa_type"),
         "订单产品 · product.visa_type"),
        ("visa_type", ("签证类型",), (), lambda d: (d["p"] or {}).get("visa_type"),
         "订单产品 · product.visa_type"),
        ("has_plan", ("旅行计划",), (),
         lambda d: ("是，已确定出发日期 %s" % d["o"]["depart_date"])
         if d["o"] and d["o"]["depart_date"] else "",
         "订单 · ord.depart_date"),
        # 只带出发日期，不带停留天数：product.stay_days 是「签证允许最长停留」，
        # 不是「客人计划停留多久」，拿来填官方表就是编数据。
        ("arrive", ("到达日期",), (),
         lambda d: ("预计到达 %s（订单出发日期）" % d["o"]["depart_date"])
         if d["o"] and d["o"]["depart_date"] else "",
         "订单 · ord.depart_date"),
        ("companion", ("同行人员",), (), lambda d: d["companion"],
         "同订单其他申请人 · applicant"),
        ("mail_addr", ("邮寄地址",), (), lambda d: d["mail_addr"],
         "订单收件地址 · ord.recv_addr_id → addr"),
        ("phone", ("电话号码",), ("过去五年",),
         lambda d: d["a"]["phone"] or (d["o"] or {}).get("contact_phone"),
         "订单联系方式 · applicant.phone / ord.contact_phone"),
        ("email", ("电子邮箱",), ("过去五年",), lambda d: (d["o"] or {}).get("contact_email"),
         "订单联系方式 · ord.contact_email"),
        ("photo", ("照片",), (), lambda d: d["photo"], "材料库已收的签证照片 · mat"),
    ]


def _ctx(c, applicant):
    """一次性把这个申请人相关的真实数据装好，规则函数只管取，不再各自查库。"""
    o = _one(c, "select * from ord where id=?", (applicant["ord_id"],))
    p = _one(c, "select * from product where id=?", (o["product_id"],)) if o else None
    addr = _one(c, "select * from addr where id=?", (o["recv_addr_id"],)) \
        if o and o["recv_addr_id"] else None
    mates = _rows(c, "select name_cn from applicant where ord_id=? and id<>? and state='normal'",
                  (applicant["ord_id"], applicant["id"]))
    photo = _one(c, "select * from mat where applicant_id=? and mat_name like '%照片%'"
                    " and ifnull(file_url,'')<>'' order by id desc limit 1", (applicant["id"],))
    return {
        "a": applicant, "o": o, "p": p,
        "mail_addr": ("%s %s（收件人 %s %s）" % (addr["region"], addr["detail"],
                                                addr["contact"], addr["phone"])) if addr else "",
        # 同行人是订单里的客观事实，两个方向都算真实数据，可以填
        "companion": ("是，同订单同行 %d 人：%s" % (len(mates), "、".join(
            m["name_cn"] for m in mates))) if mates else "否，本订单仅本人一位申请人",
        "photo": ("已收：%s（%s）" % (photo["mat_name"], photo["file_name"] or "已上传"))
        if photo else "",
    }


def match_rule(field):
    """字段名 → 映射规则。返回 None 表示系统里没有对应数据源，这格必须留空。"""
    if field["src"] not in AUTO_SRC:
        return None
    name = field["name"]
    for key, kw, not_kw, fn, origin in _rules():
        if all(k in name for k in kw) and not any(k in name for k in not_kw):
            return {"key": key, "fn": fn, "origin": origin}
    return None


# 带出的原始值 → 该格官方选项。选项表是照 CEAC / VFS 官网下拉一字不差录的，
# 填一个不在表里的值等于没填：专员在官网找不到这一项，还得自己重判一次。
# 匹配顺序：完全相同 → 互为子串 → 关键词表 → 放弃（留空，标进 gaps 让人工选）。
OPT_HINT = {
    "旅游观光": ("旅游", "观光", "自由行", "B2"),
    "商务出访": ("商务", "贸易", "会议", "B1"),
    "探亲访友": ("探亲", "访友", "亲属"),
    "过境": ("过境", "转机"),
    "就医": ("就医", "医疗"),
    "B1 商务": ("B1商务", "商务"),
    "B2 旅游": ("B2旅游", "旅游", "观光"),
    "B1/B2 商务旅游": ("B1/B2", "B1B2"),
    "普通护照": ("普通护照", "因私护照", "护照"),
    "公务护照": ("公务护照", "因公护照"),
    "外交护照": ("外交护照",),
    "旅行证": ("旅行证",),
}


def fit_option(field, v):
    """把 v 归到 field 的官方选项上。没有选项表的格子原样返回。
    归不上返回空字符串——宁可留空让人工选，也不填一个官网下拉里没有的值。"""
    if not v:
        return v
    try:
        opts = json.loads(field["options"]) if field["options"] else []
    except Exception:
        opts = []
    if not isinstance(opts, list) or not opts:
        return v
    if v in opts:
        return v
    flat = v.replace(" ", "").replace("（", "(").replace("）", ")")
    for o in opts:                                   # 互为子串（「护照」→「普通护照」）
        of = o.replace(" ", "")
        if of and (of in flat or flat in of):
            return o
    # 关键词命中可能不止一个：「个人旅游签证（B1/B2）」同时命中「B2 旅游」的
    # 「旅游」和「B1/B2 商务旅游」的「B1/B2」。取<b>命中关键词最长</b>的那一项——
    # B1/B2 是联合签证，归成 B2 会和 DS-160 上实际申请的类别对不上。
    best, blen = "", 0
    for o in opts:
        for kw in OPT_HINT.get(o, ()):
            k = kw.replace(" ", "")
            if k in flat and len(k) > blen:
                best, blen = o, len(k)
    return best


def prefill(c, task, applicant, by_name="系统预填", force=False):
    """把 src=ocr / sys 的格子按真实数据自动带出。

    force=False：只填空格子，不覆盖人工已经改过的值（客户自己改过的姓名拼写、
    专员核对过的护照号，都比系统带出的可信，不能被再跑一次预填冲掉）。
    force=True：连上一次 auto 填的值一起刷新（证件信息更正后重跑用），
    但仍然不动 src='manual' 的人工答案。
    """
    fields = _rows(c, "select * from form_field where formver_id=? order by sort",
                   (task["formver_id"],))
    have = {a["field_id"]: a for a in _rows(
        c, "select * from form_answer where task_id=?", (task["id"],))}
    d = _ctx(c, applicant)
    filled, kept, gaps = [], 0, []
    target = [f for f in fields if f["src"] in AUTO_SRC]
    for f in target:
        r = match_rule(f)
        if not r:
            gaps.append({"field_id": f["id"], "section": f["section"], "name": f["name"],
                         "src": f["src"], "risk": f["risk"],
                         "why": "系统内无对应数据源，需人工填写"})
            continue
        try:
            v = r["fn"](d)
        except Exception:
            v = ""
        v = (v or "").strip() if isinstance(v, str) else v
        # 带出来的值必须落在这一格的官方选项里。
        # 2026-09-03 走查发现三处一直在填官网下拉里根本没有的值：
        #   「此次美国之行的目的」= 个人旅游签证（B1/B2）  官方选项是 旅游观光 / 商务出访 …
        #   「具体签证类型」      = 个人旅游签证（B1/B2）  官方选项是 B1 商务 / B2 旅游 …
        #   「护照/旅行证件类型」  = 护照                 官方选项是 普通护照 / 公务护照 …
        # 专员照着对照单抄到 CEAC，下拉框里找不到这个值，只能自己重新判断——
        # 「系统带出 18 格」里有 3 格是白带的。对不上就留空并说明，不硬塞。
        v2 = fit_option(f, v)
        if v and not v2:
            gaps.append({"field_id": f["id"], "section": f["section"], "name": f["name"],
                         "src": f["src"], "risk": f["risk"],
                         "why": "带出的「%s」不在该格的官方选项内，请人工选择" % v})
            continue
        v = v2
        if not v:
            gaps.append({"field_id": f["id"], "section": f["section"], "name": f["name"],
                         "src": f["src"], "risk": f["risk"],
                         "why": "已映射到「%s」，但该客户此项为空" % r["origin"]})
            continue
        old = have.get(f["id"])
        if old and old["value"] and (old["src"] == "manual" or not force):
            kept += 1
            continue
        if old:
            c.execute("update form_answer set value=?,src='auto',\"by\"=?,updated_at=?"
                      " where id=?", (v, by_name, now(), old["id"]))
        else:
            c.execute("insert into form_answer(task_id,field_id,value,src,\"by\",updated_at)"
                      " values(?,?,?,'auto',?,?)", (task["id"], f["id"], v, by_name, now()))
        filled.append({"field_id": f["id"], "name": f["name"], "value": v,
                       "origin": r["origin"]})
    dft = default_risk(c, task, fields, have)
    touch(c, task["id"], prefill_at=now(),
          status="filling" if task["status"] == "wait" else task["status"])
    return {"filled": len(filled), "target": len(target), "total": len(fields),
            "kept": kept, "gap": len(gaps), "items": filled, "gaps": gaps,
            "default": len(dft), "default_items": dft}


def default_risk(c, task, fields=None, have=None):
    """给挂了 dft_no 的格子写默认值。只补空格子——客人或专员一旦亲手答过，
    哪怕答的也是「否」，也不能被系统默认值盖掉，否则那条人工确认的记录就没了。

    默认值取 form_field.dft_val，没配就退回「否」。加这个字段是因为
    唐美芳 2026-09-02 要「尽量少让客人填，能系统自动就自动」——
    但不同题的常见答案不一样：安全背景类默认「否」，曾用名 / SSN /
    护照遗失记录这类默认「无」，写死一个「否」会填出病句。

    看的是 dft_no 不是 risk：「是否去过美国」「是否持有过美国签证」同样是高风险题，
    但它们**不能默认**——移民局有出入境与签证底档，去过却填没去过属于虚假陈述，
    后果比拒签重得多。这两格照常问客人（唐美芳 2026-08-26 定，2026-09-02 复核仍成立）。"""
    if fields is None:
        fields = _rows(c, "select * from form_field where formver_id=? order by sort",
                       (task["formver_id"],))
    if have is None:
        have = {a["field_id"]: a for a in _rows(
            c, "select * from form_answer where task_id=?", (task["id"],))}
    out = []
    for f in fields:
        if not f["dft_no"] or f["src"] == "agent":
            continue
        old = have.get(f["id"])
        if (old or {}).get("value"):
            continue
        val = (f["dft_val"] if "dft_val" in f.keys() else "") or RISK_DEFAULT
        if old:  # 有行但值是空的：唯一索引在 (task_id, field_id) 上，只能改不能插
            c.execute("update form_answer set value=?,src=?,\"by\"=?,updated_at=? where id=?",
                      (val, DEFAULT_SRC, DEFAULT_BY, now(), old["id"]))
        else:
            c.execute("insert into form_answer(task_id,field_id,value,src,\"by\",updated_at)"
                      " values(?,?,?,?,?,?)",
                      (task["id"], f["id"], val, DEFAULT_SRC, DEFAULT_BY, now()))
        out.append({"field_id": f["id"], "section": f["section"], "name": f["name"]})
    return out


# ============================ 进度与校验 ============================

def stat(c, task, fields=None, answers=None):
    """一张表填到哪了。分母不是 72：agent 的 4 个格子是专员在官网上的动作，
    系统里没有值可填，算进分母会让进度条永远到不了 100%。"""
    if fields is None:
        fields = _rows(c, "select * from form_field where formver_id=?", (task["formver_id"],))
    if answers is None:
        answers = {a["field_id"]: a for a in _rows(
            c, "select * from form_answer where task_id=?", (task["id"],))}
    ok = lambda f: bool((answers.get(f["id"]) or {}).get("value"))
    fillable = [f for f in fields if f["src"] != "agent"]
    ask = [f for f in fields if f["src"] == "ask" and f["required"]]
    risk = [f for f in fields if f["risk"]]
    done = [f for f in fillable if ok(f)]
    return {
        "total": len(fields), "fillable": len(fillable), "filled": len(done),
        "auto": len([f for f in fillable if (answers.get(f["id"]) or {}).get("src") == "auto"]),
        "manual": len([f for f in fillable
                       if (answers.get(f["id"]) or {}).get("src") == "manual"]),
        "ask_total": len(ask), "ask_left": len([f for f in ask if not ok(f)]),
        "risk_total": len(risk), "risk_left": len([f for f in risk if not ok(f)]),
        # 高风险题里还挂着系统默认「否」、没人跟客户核对过的格数。
        # 这是复核页要盯的数字，不是进度条上的数字。
        "risk_default": len([f for f in risk
                             if (answers.get(f["id"]) or {}).get("src") == DEFAULT_SRC]),
        "agent_only": len(fields) - len(fillable),
        "percent": round(len(done) * 100.0 / len(fillable), 1) if fillable else 0.0,
    }


def missing_required(c, task):
    """专员确认前的必填校验。agent 类字段不算——那是专员到官网上现做的动作，
    不是系统里的一格。返回的每条都带板块和风险标记，方便前端定位。"""
    answers = {a["field_id"]: a for a in _rows(
        c, "select * from form_answer where task_id=?", (task["id"],))}
    out = []
    for f in _rows(c, "select * from form_field where formver_id=? order by sort",
                   (task["formver_id"],)):
        if f["src"] == "agent" or not f["required"]:
            continue
        if not (answers.get(f["id"]) or {}).get("value"):
            out.append({"field_id": f["id"], "section": f["section"], "name": f["name"],
                        "src": f["src"], "src_text": SRC_TEXT.get(f["src"], f["src"]),
                        "risk": f["risk"]})
    return out


# 是非题的两个合法值。判断一个格子是不是是非题看两处：ftype 标了 bool，
# 或者 options 里同时有「是」和「否」。
YESNO = ("是", "否")


def value_error(f, v):
    """这一格能不能存这个值。返回 None 表示可以，否则返回给人看的错误说明。

    2026-09-03 走查时发现的问题：一张演示任务里「婚姻状况」存着「否」、
    「出生城市」「国民身份证号码」「电子邮箱地址」也全是「否」——
    保存接口对任何格子都照单全收。这些值会原样出现在<b>官网填表对照单</b>上，
    专员照着抄进 CEAC，轻则表被退回重填，重则按虚假信息处理。
    所以在入口处按字段类型挡一道。空值一律放行（清空是合法操作）。"""
    if not v:
        return None
    opts = []
    try:
        opts = json.loads(f["options"]) if f["options"] else []
        if not isinstance(opts, list):
            opts = []
    except Exception:
        opts = []
    ft = f["ftype"] or "text"
    is_yesno = ft == "bool" or (set(YESNO) <= set(opts))
    if is_yesno:
        # 允许「是：2019 年 5 月在广州领馆被拒，理由 214(b)」这种带说明的写法——
        # DS-160 官网上勾了「是」之后本来就要展开补充，这个模板里合并成了一格，
        # 只认光秃秃的「是」「否」会把真实且有价值的答案挡掉。
        return None if v[0] in YESNO else "要以「是」或「否」开头"
    if ft == "select" and opts:
        return None if v in opts else "必须是下列选项之一：" + "、".join(opts[:8])
    # 非是非题却填了「是 / 否」，基本都是一路回车点出来的
    if v in YESNO:
        return "这一格要填具体内容，不是是非题"
    return None


def save_answers(c, task, items, src, by_name):
    """逐格 upsert。客户端是分板块提交的，整表覆盖会把别人刚填的板块洗掉。

    值按字段类型校验，不合法的<b>整条拒绝</b>并抛出，不做静默丢弃——
    静默丢弃会让填的人以为存上了，等到官网对照单那一步才发现是空的。"""
    n = 0
    bad = []
    for it in items or []:
        fid = int(it.get("field_id") or 0)
        f = _one(c, "select * from form_field where id=? and formver_id=?",
                 (fid, task["formver_id"]))
        if not f:
            continue  # 不属于这张表快照版本的字段，直接丢弃，不给跨版本写脏数据的机会
        v = it.get("value")
        v = v.strip() if isinstance(v, str) else ("" if v is None else str(v))
        err = value_error(f, v)
        if err:
            bad.append("%s：%s" % (f["name"], err))
            continue
        # 原子 upsert，不能「先查后插」：客户端边填边存，一格的 input 防抖与 blur
        # 可能几乎同时发两条请求，两条都查到不存在就会双双走 insert，
        # 第二条撞 UNIQUE(task_id, field_id) 直接 500
        # （2026-08-31 在 C 端填表页实测到 IntegrityError）。
        c.execute('insert into form_answer(task_id,field_id,value,src,"by",updated_at)'
                  " values(?,?,?,?,?,?)"
                  " on conflict(task_id,field_id) do update set"
                  ' value=excluded.value,src=excluded.src,"by"=excluded."by",'
                  " updated_at=excluded.updated_at",
                  (task["id"], fid, v, src, by_name, now()))
        n += 1
    if bad:
        raise ValueError("有 %d 格没通过校验，未保存：%s" % (len(bad), "；".join(bad[:3])))
    return n


# 客人视角的板块分组。唐美芳 2026-08-31：
# 「填写字段的页面，我觉得不用和美国签证官方一样，个人1、个人2这种吧，
#  要符合中国人的使用习惯……第一步是基础信息，第二步是xx信息之类的」。
#
# DS-160 的官方板块是按美国表格自己的结构切的：个人 1 / 个人 2 / 之前的美国旅行 /
# 家庭：亲属 / 家庭：配偶 / 其他工作、教育 …… 21 块，客人要答的 21 格散在 9 块里，
# 每块两三格，翻起来又碎又不知道自己在填什么。
# 这里按中国人办签的习惯归并成 6 步，官方结构照旧存在库里不动——
# 专员端仍按官方板块看，客人端看这一套，两边各自舒服。
# 匹配用关键词而不是全名：日本、泰国那些表的板块名本来就是这套叫法（基本信息 /
# 证件信息 / 家庭与职业信息 / 旅行信息），能直接对上，不用另配一份。
CUST_SEC = [
    ("基本信息", ("个人", "基本信息")),
    ("证件信息", ("护照", "证件")),
    ("联系方式与地址", ("地址和电话", "联系点", "联系方式")),
    ("家庭与职业信息", ("家庭", "工作", "教育", "培训", "职业")),
    ("旅行信息", ("旅行", "行程", "美国旅行")),
    ("安全与背景", ("安全", "背景")),
]


def cust_group(name):
    """官方板块名 → 客人看到的那一步。对不上的归到「其他信息」，不硬塞。"""
    n = re.sub(r"^\d+[\.、]\s*", "", (name or "").strip())
    for grp, keys in CUST_SEC:
        for k in keys:
            if k in n:
                return grp
    return "其他信息"


def cust_label(name):
    """字段名给客人看的版本。官方字段名带着英文原文与例子——
    「姓氏 (Surnames) (e.g., FERNANDEZ GARCIA)」「用母语字母拼写的全名(Full Name in
    Native Alphabet )」——在手机上一行放不下，中文客人也不需要看英文原名。
    去掉半角括号里不含中文的那几段；全角括号（B1/B2）这类保留，
    那种括号里装的是有效信息不是译名。原名不动库，只在下发时换个说法。"""
    n = (name or "").strip()
    n = re.sub(r"\s*\([^()]*\)", lambda m: "" if not re.search(r"[一-龥]", m.group()) else m.group(), n)
    return re.sub(r"\s{2,}", " ", n).strip() or (name or "")


def merge_for_customer(secs):
    """把 sections() 出来的官方板块按 CUST_SEC 归并成客人那几步，保持 CUST_SEC 的顺序。"""
    order = [g for g, _ in CUST_SEC] + ["其他信息"]
    box = {}
    for s in secs:
        g = cust_group(s.get("name"))
        box.setdefault(g, []).extend(s.get("items") or [])
    out = []
    for g in order:
        if not box.get(g):
            continue
        items = []
        for it in box[g]:
            d = dict(it)
            d["name"] = cust_label(d.get("name"))
            items.append(d)
        # 带上步骤序号：唐美芳 2026-08-31「第一步是基础信息，第二步是xx信息之类的」
        out.append({"name": g, "step": len(out) + 1, "items": items})
    return out


def _safe_opts(raw):
    try:
        return json.loads(raw) if raw else []
    except Exception:
        return []


def history_values(c, task):
    """同一个人以前填过的值。

    唐美芳 2026-09-03：「客人已填写的值和曾经历史填写的值默认带出来」。
    按<b>证件号</b>认人（同一个人可能在不同订单里以不同姓名录入，证件号才是唯一的），
    取他在别的填表任务里同名字段的最近一次答案。
    只做「提示 + 一键采用」，不自动写进去——上一次的地址、单位可能已经变了，
    静默带出等于替客人做了个可能错的决定。"""
    a = _one(c, "select * from applicant where id=?", (task["applicant_id"],))
    if not a or not (a["id_no"] or "").strip():
        return {}
    rows_ = _rows(c, """
        select f.name as fname, ans.value as v, ans.updated_at as at
          from form_answer ans
          join form_task t2 on t2.id = ans.task_id
          join applicant a2 on a2.id = t2.applicant_id
          join form_field f on f.id = ans.field_id
         where a2.id_no = ? and a2.id <> ?
           and ifnull(ans.value,'') <> ''
           and ans.src = 'manual'
         order by ans.updated_at desc""", (a["id_no"], a["id"]))
    out = {}
    for r in rows_:
        out.setdefault(r["fname"], r["v"])          # 已按时间倒序，第一条就是最近的
    return out


def sections(c, task, for_customer=False):
    """按官方板块分组返回字段与答案：客户端一屏一个板块，专员端一页看全。

    for_customer=True 时，挂着系统默认「否」的高风险题整格不下发。
    业务口径是这些题不向客人提起；既然不提，就不能在页面上露出来——
    露出来客人看见「是否曾被拒签」已经被填成否，反而要问我们凭什么替他答。
    客人自己动过的高风险题（value_src=manual）照常显示，那是他自己的答案。"""
    answers = {a["field_id"]: a for a in _rows(
        c, "select * from form_answer where task_id=?", (task["id"],))}
    fields = _rows(c, "select * from form_field where formver_id=? order by sort",
                   (task["formver_id"],))
    hist = history_values(c, task)
    secs = []
    for f in fields:
        a = answers.get(f["id"]) or {}
        if for_customer and f["risk"] and a.get("src") == DEFAULT_SRC:
            continue
        item = {"field_id": f["id"], "name": f["name"], "src": f["src"],
                "src_text": SRC_TEXT.get(f["src"], f["src"]), "src_from": f["src_from"],
                # 这一格系统里到底有没有对应的数据源。src_from 只是模板上写的
                # 「理论来源」，有没有真映射上要看 match_rule——官网填表对照单
                # 靠它区分「源为空、回去补」和「系统本来就没有、只能官网现填」
                # （唐美芳 2026-09-02 追问省不省人工时做的）。
                "mapped": bool(match_rule(f)),
                "required": f["required"], "risk": f["risk"], "covered": f["covered"],
                "fill_note": f["fill_note"], "help_text": f["help_text"], "notice": f["notice"],
                # 控件类型与选项：官网填表对照单要能就地改一格，
                # 按类型给对控件才不会又填出「婚姻状况 = 否」这种官网没有的值
                # （唐美芳 2026-09-03：「且允许二次修改调整」）。
                "ftype": f["ftype"] or "text",
                "options": (lambda o: o if isinstance(o, list) else [])(
                    _safe_opts(f["options"])),
                # 中译英：官网只收英文，这一格要不要英文、英文是什么
                # 这个人以前填过的同名字段值，空格子时提示「上次填的」
                "hist": hist.get(f["name"], ""),
                "need_en": bool(f["need_en"]) if "need_en" in f.keys() else False,
                "value_en": a.get("value_en") or "",
                "value": a.get("value") or "", "value_src": a.get("src"),
                "by": a.get("by"), "updated_at": a.get("updated_at")}
        if not secs or secs[-1]["name"] != f["section"]:
            secs.append({"name": f["section"], "items": []})
        secs[-1]["items"].append(item)
    # 安全/背景那 5 个板块整块都是高风险题，对客人隐藏后会剩下空壳，不能留在页面上
    secs = [s for s in secs if s["items"]]
    for s in secs:
        s["filled"] = len([i for i in s["items"] if i["value"]])
        s["fillable"] = len([i for i in s["items"] if i["src"] != "agent"])
        s["ask_left"] = len([i for i in s["items"]
                             if i["src"] == "ask" and i["required"] and not i["value"]])
    return secs, fields, answers
