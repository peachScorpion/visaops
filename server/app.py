#!/usr/bin/env python3
"""VisaOps 后端：按角色操作链路组织的 API。"""
import io
import json
import os
import re
import html as html_lib
from html.parser import HTMLParser
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

import en_trans
import form_task  # 填表任务：预填引擎与进度/校验，逻辑较重，单独一个文件

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "visaops.db")
WEB = os.path.abspath(os.path.join(HERE, "..", "web"))
PREFIX = "/visaops"
PORT = 8820
MAX_UPLOAD = 12 * 1024 * 1024
# 材料样例走图片/PDF；表格是给「字段表批量导入」用的，运营上传官方字段表后系统自动建库
# .docx：官方字段表也常以 Word 表格形式流转（唐美芳 2026-08-31：
# 「官方字段表可以支持doc文件不」）。.doc 老二进制格式解不了，故意不放进来——
# 放进来只会让人传上去再吃一个「解析失败」，不如上传时就拦住并说清怎么办。
# .doc / .xls 收下来是为了给出一句人话提示（见 form_import._OLD_MSG）：
# 97-2003 的老格式解析不了表格结构，但直接卡在「扩展名不支持」上，
# 人不知道该怎么办。收下、解析、告诉他去另存为，比拒收有用。
ALLOW_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf",
             ".xlsx", ".xls", ".csv", ".docx", ".doc"}

TOKENS = {}
# 分享链接填表的客人不是系统用户，事件流水里用这个虚拟操作人署名
PUB_ACTOR = {"id": None, "name": "客户本人（分享链接）"}
# 自动取消这类没有具体操作人的动作，流水里署名「系统」
SYS_ACTOR = {"id": None, "name": "系统"}
LOCK = threading.Lock()

# 办签进度（唐美芳 2026-09-02 重新定的六步）：
#   下单即按办签人生成工单进「待收料」→ 客人交完材料「待审核」→
#   材料过审且表填完「待提交至官网」→ 提交官网并回填 Application ID「待预约」→
#   登记预约「待出签」→ 出签或拒签都算「已完成」。
#
# 与旧十步的两处实质变化，都是她这次点名要改的：
#   1. 工单不再等财务确认收款才生成——「在正式提交美国签证中心网站之前，
#      都和支付状态无关，点提交时确认下订单付款状态即可」。所以支付校验
#      从建单口移到了「提交至官网」这一口。
#   2. 递交/面签/行政审查不再各占一个进度。递交与面签是「待出签」区间里的事实，
#      行政审查是出签前的一个分支标记（applicant.ap_due），不是主干节点——
#      主干上多一个节点，专员就多一次不知道该干什么的停顿。
# 资料返还仍在（送签批次 / 资料返还两个页签），但它发生在「已完成」之后，
# 不再占用主干进度。
PROGRESS = [
    ("P1", "待收料"), ("P2", "待审核"), ("P3", "待提交至官网"),
    # P5 2026-09-03 从「待出签」改叫「待出结果」：需面签的产品客人本人到馆，
    # 材料不经我们的手，没有「送签」这个动作，叫「待出签」会让人以为还要我们递交
    # （唐美芳：「待出签状态，不需要送签了，现在签证中心都是线上办理了」）。
    ("P4", "待预约"), ("P5", "待出结果"), ("P6", "已完成"),
]
# 旧十步 → 新六步。存量工单迁移与任何还在传老码的地方都走这张表。
PROG_MIGRATE = {"P1": "P1", "P2": "P2", "P3": "P3", "P4": "P3",
                "P5": "P4", "P6": "P5", "P7": "P5", "P8": "P5",
                "P9": "P6", "P10": "P6"}
PORDER = [p[0] for p in PROGRESS]
PNAME = dict(PROGRESS)

# 通用三态（唐美芳 2026-09-04：「国家签证办理中心挪到供应商去，且里面的流程节点弄成通用的，
# 可以让他们直接跳过中间流程，直接标记最后是否出签，怕他们觉得标记系统太过麻烦，
# 增加他们的工作量」）。
#
# 上面那六步是<b>美签的作业口径</b>——「待提交至官网」「待预约」这些动作，
# 换成日本、韩国就不成立（日本递纸质、韩国走代传，都没有官网提交这一步）。
# 供应商那边一是国家五花八门，二是他们只关心「收到没 / 在办 / 出没出」，
# 所以对外只给三档，六步仍在底层记录，众信自己的工单台照旧看得到细节。
#
# G_ENTRY 是「跳到某一档时落在哪个细节节点」：set_progress() 本身支持跳跃并自动补齐
# 中间环节，所以供应商从「待收料」一步点到「已出结果」，底层照样留下完整轨迹。
GSTAGE = [("G1", "待收料"), ("G2", "处理中"), ("G3", "已出结果")]
GNAME = dict(GSTAGE)
G_OF = {"P1": "G1", "P2": "G1", "P3": "G2", "P4": "G2", "P5": "G2", "P6": "G3"}
G_ENTRY = {"G1": "P1", "G2": "P3", "G3": "P6"}


def gstage(progress):
    return G_OF.get(progress or "P1", "G1")
# 客户端话术。上面那六个是<b>专员工位名</b>（待收料 / 待提交至官网 …），
# 直接抛给客人他看不懂「待提交至官网」是要提交什么、谁去提交
# （唐美芳 2026-09-03：「话术如果要展示的话，尽量专业友好的角度」）。
# 这里换成「我们正在为你做什么」，客人一句话知道现在轮到谁动。
CUST_PROG = {
    "待收料": "等待你提交签证材料",
    "待审核": "材料核验中",
    "待提交至官网": "正在为你填报官方申请表",
    "待预约": "正在为你预约面签时间",
    "待出结果": "已递交使领馆，等待签发结果",
    "待出签": "已递交使领馆，等待签发结果",          # 旧名，历史事件里还有
    "已完成": "签证结果已出",
    # 旧十步流程留在事件表里的状态名。进度页读的是历史事件，
    # 这些词还会一直出现在老订单上，不翻译就会漏出「表单填写中」这种内部说法。
    "待收材料": "等待你提交签证材料",
    "材料审核中": "材料核验中",
    "材料已齐备": "材料已收齐",
    "表单填写中": "正在为你填报官方申请表",
    "待预约面签": "正在为你预约面签时间",
    "已预约待面签": "面签已约好，请按通知时间到馆",
    "已递交/已面签": "材料已递交使领馆",
    "行政审查中": "使领馆行政审查中，请耐心等待",
    "已出结果": "签证结果已出",
    "已交付客户": "护照与资料已交付",
}
# 客人要动手的节点：进度页上要给一句明确的行动指引，不要让他干等
CUST_PROG_TODO = {
    "待收料": "请按材料清单逐项上传或寄出原件",
    "待审核": "无需操作，如有材料不合格我们会发补料通知",
    "待提交至官网": "无需操作，官方申请表由签证顾问代为填报",
    "待预约": "无需操作，约到号后会第一时间通知你面签时间与地点",
    "待出结果": "无需操作，结果由使领馆签发，出结果当天回填",
    "待出签": "无需操作，结果由使领馆签发，出结果当天回填",
    "已完成": "结果与护照已处理完毕，可在下方查看寄回信息",
}

CROWD = {"job": "在职人员", "free": "自由职业", "student": "在校学生",
         "retire": "退休人员", "child": "学龄前儿童"}
WAY = {"mail": "邮寄/自送", "upload": "电子上传", "carry": "面试携带"}
# 签证有效期单位。原来只有年 / 天两档，2026-09-07 唐美芳要求补上「月」——
# 半年多次、3 个月单次这类产品按天写成 90 天、按年写不出来，供应商只能填个近似值。
VALID_UNIT = {"year": "年", "month": "个月", "day": "天"}


def valid_text(p):
    """有效期的展示文本。没填天数就返回空串，不摆一个「0年」出来。"""
    n = p["valid_num"] if hasattr(p, "keys") else (p or {}).get("valid_num")
    t = p["valid_type"] if hasattr(p, "keys") else (p or {}).get("valid_type")
    if not n:
        return ""
    return "%d%s" % (n, VALID_UNIT.get(t, "年"))
# 受理居住地范围（唐美芳 2026-09-04）：「部分国家严控只能在指定区域才能办理签证。
# 对于日本签证，严格依据居住地受理是官方的硬性规定——客人住北京却买了「上海送签」的
# 日本签证产品，是办不成的」。所以产品要能声明「只受理哪些省份居住的申请人」。
# 留空＝全国受理，不做限制；做成通用能力而不是给日本开后门，韩国、意大利等
# 按领区划分的国家都用得上。
PROVINCES = ["北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江",
             "上海", "江苏", "浙江", "安徽", "福建", "江西", "山东", "河南", "湖北",
             "湖南", "广东", "广西", "海南", "重庆", "四川", "贵州", "云南", "西藏",
             "陕西", "甘肃", "青海", "宁夏", "新疆", "香港", "澳门", "台湾"]


def clean_provs(v):
    """洗成合法省份列表。全选等同于不限，一律存空——
    存 34 个省和存空是同一个意思，但前者会让展示侧摆出一大片标签。"""
    out = [x for x in (v or []) if x in PROVINCES]
    return [] if len(out) >= len(PROVINCES) else out



ATTR = {"origin": "原件", "copy": "复印件"}
NEC = {"must": "必须材料", "suggest": "建议材料"}
# 服务保障：C 端详情页最上面那条绿色保障栏，三个来源合成，供应商只能勾第三种。
# 前两种不给供应商改——平台能力对所有产品一样，拒签退/免面签是套餐与签证属性的事实，
# 让供应商自由填会出现「保证出签」这类没法兑现又要担责的话。
SVC_FIXED = ["电子材料上传", "全程进度可查", "7×12 小时在线客服"]
SVC_OPTS = ["材料预审", "顺丰包邮取送", "专人陪同面签", "加急代约号",
            "专属签证专员", "使馆直递", "拒签重申免服务费"]

# 单个供应商产品最多挂几个套餐。原来没有上限（唐美芳 2026-08-27 问到）。
PKG_MAX = 12


def svc_list(sp, p, pks):
    """按 免面签（自动）→ 供应商勾选 → 平台固定 的优先级合成，去重后最多 6 条。
    原来第一条是「拒签退款保障」，唐美芳 2026-08-31 明确没有这个服务、拒签本来就退，已去掉。"""
    out = []
    if not p["need_interview"]:
        out.append("免面签")
    for t in jl(sp["svc_tags"], []) + SVC_FIXED:
        if t not in out:
            out.append(t)
    return out[:6]
# 完整版清单的唯一键是「国家 + 签证类型」，两项都必须从字典里选。
# 允许自由输入会出现「美国 / 美國 / USA」三种写法，清单就挂不上目录产品了。
COUNTRIES = ["美国", "日本", "韩国", "英国", "申根", "澳大利亚", "新西兰", "加拿大",
             "新加坡", "泰国", "越南", "马来西亚", "印度尼西亚", "阿联酋",
             "沙特阿拉伯", "土耳其", "俄罗斯", "埃及", "南非", "巴西"]
# 签证类型（受控枚举，唐美芳 2026-08-31 给的口径，参照携程）。
# 它跟 VISA_TYPES 不是一回事，见 web/js/core.js VISA_CATS 处的注释：
# VISA_CATS 是「办的是哪一类事」，VISA_TYPES 是签证的官方名称。
VISA_CATS = ["旅游", "商务", "探亲访友", "EVUS登记更新", "留学",
             "ESTA登记更新", "工作", "转移", "其他"]
VISA_TYPES = ["个人旅游签证", "个人旅游签证（B1/B2）", "商务签证", "探亲访友签证",
              "标准访问签证（Standard Visitor）", "访客签证 600 类别",
              "F1 学生签证", "工作签证", "过境签证", "落地签证",
              "三年多次旅游签证", "五年多次旅游签证", "十年多次旅游签证"]
FV_STATUS = {"draft": "待发布", "published": "已发布", "withdrawn": "已撤回"}
# 订单状态只管钱走到哪，5 个值，对齐凯撒 PRD。「办理中」不在这条线上——
# 它是由办签人进度算出来的派生值 work_status，见 work_status()。
# 唐美芳 2026-08-31：「订单状态里很少有办理中这种中间态的，先去掉吧」。
# 下单后必须在这个时限内把办签人的签证资料录齐，否则订单自动取消。
# 唐美芳 2026-09-01：「必须设定 1 个时间，比如下单后 24 个小时内录入办签人的资料，
# 否则自动取消订单。所以录入客人资料这个操作，必须在支付之前。」
# 签证跟跟团游不一样：资料不齐就排不进送签批次，占着名额却推不动，
# 与其让它挂在那儿，不如到点释放。
# 国家 → 洲际分区。跟 C 端「按目的地找签证」的页签是同一套口径，
# 工单台上要按洲看工单（唐美芳 2026-09-01：「每个工单应该列出办理的国家、洲、签证类型」）。
CONTINENT = {
    "亚洲": ["日本", "韩国", "新加坡", "泰国", "马来西亚", "越南", "菲律宾", "印度尼西亚",
             "柬埔寨", "印度", "阿联酋", "土耳其", "以色列", "斯里兰卡", "尼泊尔"],
    "欧洲": ["英国", "法国", "德国", "意大利", "西班牙", "瑞士", "荷兰", "希腊", "俄罗斯",
             "葡萄牙", "捷克", "匈牙利", "北欧", "申根"],
    "美洲": ["美国", "加拿大", "墨西哥", "巴西", "阿根廷", "智利", "秘鲁"],
    "澳新非": ["澳大利亚", "新西兰", "南非", "埃及", "摩洛哥", "肯尼亚", "毛里求斯"],
}


def continent_of(country):
    for k, v in CONTINENT.items():
        if country in v:
            return k
    return "其他"


INFO_HOURS = 24
# 「录入客人签证资料」这一步必须填齐的字段。比下单时那几格严：
# 送签要用的是护照上的完整信息，缺一项使领馆就会退件。
INFO_REQUIRED = [("name_cn", "中文姓名"), ("name_en", "英文姓名"),
                 ("sex", "性别"), ("birth", "出生日期"),
                 ("id_no", "证件号码"), ("id_expiry", "证件有效期"),
                 ("id_place", "证件签发地"), ("phone", "手机号"),
                 ("crowd", "适用人群")]

ORD_STATUS = {"created": "待付款", "paid": "已付款",
              "done": "已完成", "cancelled": "已取消", "refunded": "已退款"}
LIABILITY = {"company": "我司责任", "customer": "客户责任",
             "official": "使领馆/第三方", "none": "未判定"}
RESULT = {"pass": "出签", "reject": "拒签", "withdraw": "撤签", "ap": "行政审查"}
# 送签批次的递交方式（2026-09-01 从 courier 字段里拆出来）
DELIVER_WAY = {"courier": "快递送达", "staff": "专人递交", "self": "使馆自取"}
REJECT_CATE = ["移民倾向", "材料不实", "资金约束不足", "行程不合理",
               "面签表现", "过往拒签史", "使领馆未说明"]


def now(d=0, hours=0):
    return (datetime.now() + timedelta(days=d, hours=hours)).strftime("%Y-%m-%d %H:%M:%S")


def conn():
    c = sqlite3.connect(DB, timeout=15)
    c.row_factory = sqlite3.Row
    return c


def rows(c, sql, args=()):
    return [dict(r) for r in c.execute(sql, args).fetchall()]


def one(c, sql, args=()):
    r = c.execute(sql, args).fetchone()
    return dict(r) if r else None


def jl(s, default=None):
    try:
        return json.loads(s) if s else (default if default is not None else [])
    except Exception:
        return default if default is not None else []


def nextno(c, k):
    with LOCK:
        c.execute("update seq set v=v+1 where k=?", (k,))
        v = c.execute("select v from seq where k=?", (k,)).fetchone()[0]
    return "%s-%s%04d" % (k, datetime.now().strftime("%y%m"), v)


def log(c, scope, ref, ord_id, user, action, detail=""):
    c.execute("insert into event(scope,ref_id,ord_id,actor,actor_name,action,detail,created_at)"
              " values(?,?,?,?,?,?,?,?)",
              (scope, ref, ord_id, user["id"] if user else None,
               user["name"] if user else "系统", action, detail, now()))


def aud(d, r):
    """把审计字段透传到接口返回：列表要答得出这条记录谁建的、最后谁动的。
    手工拼装的返回体不会自动带上，统一走这个函数补。"""
    for k in ("created_by_name", "created_at", "updated_by_name", "updated_at"):
        try:
            d[k] = r[k]
        except (KeyError, IndexError):
            pass
    return d


STAY_UNIT = {"day": "天", "month": "个月", "year": "年"}
STAY_DAYS = {"day": 1, "month": 30, "year": 365}


def stay_text(p):
    """停留期文案。区间就写区间，min==max 就写一个数。
    唐美芳 2026-08-31：「停留天数需支持区间，可选择天/月/年时间单位」。
    老数据没有 stay_min 时退回 stay_days，不编造。"""
    u = STAY_UNIT.get(p["stay_unit"] if "stay_unit" in p.keys() else "day", "天")
    mn = p["stay_min"] if "stay_min" in p.keys() and p["stay_min"] is not None else p["stay_days"]
    mx = p["stay_max"] if "stay_max" in p.keys() and p["stay_max"] is not None else p["stay_days"]
    if not mn and not mx:
        return "以签证页为准"
    if mn == mx or not mn:
        return "%d %s" % (mx or mn, u)
    return "%d–%d %s" % (mn, mx, u)


# 供应商填的富文本要落到客户端渲染，必须服务端过滤——
# 只放行排版用的这几个标签，其余一律转义。
# 唐美芳 2026-09-01：「套餐说明、预订须知应该是富文本框」。
# 前端编辑器只产出这些标签，但不能只靠前端：接口是可以直接调的。
# ── 富文本白名单 ──────────────────────────────────────────────────────────
# 唐美芳 2026-09-01 验收：从携程页面复制粘贴过来的套餐说明，保存后满屏是
# 「&lt;dl class="detail_date" style="margin:0px..."&gt;」这样的代码。
# 原因是旧版把不认识的标签整个转义成文本「让人看得见」——想法是好的，
# 实际效果是把别人网站的样式代码原样贴到了客户眼前。
# 改成标准做法：不认识的标签直接脱掉，只留里面的文字；块级标签换成段落。
RICH_TAGS = {"b", "strong", "i", "em", "u", "s", "strike", "sub", "sup",
             "p", "br", "ul", "ol", "li", "div", "span", "font",
             "h3", "h4", "blockquote"}
# 脱掉标签、但要留一个段落分隔的（否则几段文字会黏成一坨）
RICH_BLOCK = {"dt", "dd", "td", "th", "section", "article", "header", "footer",
              "h1", "h2", "h5", "h6", "pre", "figcaption", "address", "center"}
# 纯容器：标签脱掉即可，不要再生成一层段落，否则 <dl><dd> 会洗成 <p><p>…</p></p>
RICH_WRAP = {"dl", "table", "thead", "tbody", "tfoot", "tr", "colgroup", "figure",
             "html", "body", "main", "nav", "aside", "form", "label", "a"}
# 标签连同里面的内容一起丢掉——留下 script 里的文字等于把代码贴给客户看
RICH_DROP = {"script", "style", "noscript", "iframe", "object", "embed", "template"}
# 允许保留的属性：只够表达「字号、颜色、粗细、对齐」，不放行 class 与任何布局属性
RICH_ATTR = {"font": {"size", "color"}, "span": {"style"}, "p": {"style"},
             "div": {"style"}, "li": {"style"}, "h3": {"style"}, "h4": {"style"}}
RICH_CSS = {"font-size", "font-weight", "font-style", "text-decoration",
            "text-align", "color"}
_VOID = {"br"}


def _clean_style(v):
    """只留白名单里的 CSS 属性，且值里不许出现 url( / expression( 这类东西。"""
    out = []
    for seg in (v or "").split(";"):
        if ":" not in seg:
            continue
        k, _, val = seg.partition(":")
        k, val = k.strip().lower(), val.strip()
        if k not in RICH_CSS or not val:
            continue
        if re.search(r"(?i)url\s*\(|expression|javascript:", val):
            continue
        out.append("%s:%s" % (k, val))
    return ";".join(out)


class _RichCleaner(HTMLParser):
    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=True)
        self.buf = []
        self.skip = 0   # >0 表示正处在 script/style 这类要整段丢掉的标签里

    def _attrs(self, tag, attrs):
        allow = RICH_ATTR.get(tag)
        if not allow:
            return ""
        out = []
        for k, v in attrs:
            k = (k or "").lower()
            if k not in allow or not v:
                continue
            if k == "style":
                v = _clean_style(v)
                if not v:
                    continue
            elif re.search(r"(?i)javascript:", v):
                continue
            out.append(' %s="%s"' % (k, html_lib.escape(v, quote=True)))
        return "".join(out)

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in RICH_DROP:
            self.skip += 1
            return
        if self.skip:
            return
        if tag in RICH_TAGS:
            self.buf.append("<%s%s%s>" % (tag, self._attrs(tag, attrs),
                                          " /" if tag in _VOID else ""))
        elif tag in RICH_BLOCK:
            self.buf.append("<p>")

    def handle_startendtag(self, tag, attrs):
        if tag.lower() in RICH_TAGS:
            self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in RICH_DROP:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if tag in RICH_TAGS and tag not in _VOID:
            self.buf.append("</%s>" % tag)
        elif tag in RICH_BLOCK:
            self.buf.append("</p>")

    def handle_data(self, data):
        if self.skip:
            return
        self.buf.append(html_lib.escape(data, quote=False))


def clean_rich(html):
    """把编辑器/粘贴板送来的 HTML 洗成一份只含排版语义的干净片段。

    规矩三条：认识的标签留下（属性只留字号/颜色/对齐那几样）、
    块级标签脱成段落、其余标签脱掉只留文字。任何情况下都不再把标签
    转义成可见文本——那是把源码摆到客户眼前。"""
    if not html:
        return ""
    p = _RichCleaner()
    p.feed(html)
    p.close()
    txt = "".join(p.buf)
    # 脱标签会留下大量空段落，收干净；再压掉连续换行
    for _ in range(3):
        t2 = re.sub(r"<p>(?:\s|&nbsp;|<br\s*/?>)*</p>", "", txt)
        t2 = re.sub(r"<div>(?:\s|&nbsp;)*</div>", "", t2)
        if t2 == txt:
            break
        txt = t2
    txt = re.sub(r"(?:<br\s*/?>){3,}", "<br /><br />", txt)
    txt = re.sub(r"[ \t]{2,}", " ", txt)
    return txt.strip()[:8000]


def info_state(o):
    """订单的资料录入状态。返回 (状态码, 文案)。
    状态码：done 已录齐 / wait 待录入 / expired 已超时（等待下一次访问时被取消）。"""
    if o["info_done_at"]:
        return "done", "资料已录入"
    dl = o["info_deadline"] or ""
    if dl and dl <= now():
        return "expired", "资料录入已超时"
    return "wait", "待录入客人签证资料"


def info_left_text(o):
    """离截止还有多久，给界面显示。已录齐或没有截止时间时返回空串。"""
    if o["info_done_at"] or not o["info_deadline"]:
        return ""
    try:
        dl = datetime.strptime(o["info_deadline"], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return ""
    sec = (dl - datetime.now()).total_seconds()
    if sec <= 0:
        return "已超时"
    h = int(sec // 3600)
    return "剩 %d 小时" % h if h else "剩 %d 分钟" % max(1, int(sec // 60))


def info_sweep(c, ids=None):
    """把超时仍未录齐资料的待付款订单自动取消。

    演示环境没有常驻定时任务，改成惰性清扫：每次读订单列表/详情时顺手扫一遍。
    只动 status='created' 且没有任何收款记录的单子——已经付过钱的绝不自动取消，
    那是要走退款流程的。"""
    q = ("select * from ord where status='created' and info_done_at='' "
         "and info_deadline!='' and info_deadline<=?")
    args = [now()]
    if ids:
        q += " and id in (%s)" % ",".join("?" * len(ids))
        args += list(ids)
    hit = rows(c, q, args)
    for o in hit:
        paid = c.execute("select count(*) from pay where ord_id=? and kind='in'",
                         (o["id"],)).fetchone()[0]
        if paid:
            continue
        c.execute("update ord set status='cancelled',updated_at=? where id=?", (now(), o["id"]))
        c.execute("update applicant set state='cancelled' where ord_id=?", (o["id"],))
        log(c, "ord", o["id"], o["id"], SYS_ACTOR, "系统自动取消",
            "下单后 %d 小时内未录入客人签证资料" % INFO_HOURS)
    return len(hit)


def ap_form_brief(c, a):
    """一位办签人的官方申请表进度摘要：订单详情与资料页取同一份，免得两处对不上。"""
    t = one(c, "select * from form_task where applicant_id=?", (a["id"],))
    if not t:
        return None
    st = form_task.stat(c, t)
    return {"task_id": t["id"], "status": t["status"],
            "status_text": form_task.STATUS.get(t["status"], t["status"]),
            "filled": st["filled"], "fillable": st["fillable"],
            "ask_left": st["ask_left"],
            "shared": bool(t["share_token"] and (t["share_expire"] or "") > now())}


def flow_of(c, sp, pr):
    """一条产品对客展示的办理流程：产品自配 → 该国家默认 → 平台默认，取第一个非空。

    注意「非空」要按解析后的列表判断：清空流程时字段里存的是 "[]" 而不是空串，
    只看字段真假会把它当成「配过了」，于是回落链断在这里，客户端一步都不显示。"""
    def pick(v):
        return jl(v, []) if v else []
    f = pick(sp["flow"] if sp else "")
    if f:
        return f
    country = (pr["country"] if pr else "") or ""
    if country:
        r = one(c, "select flow from country_cfg where country=? and active=1", (country,))
        f = pick(r["flow"] if r else "")
        if f:
            return f
    r = one(c, "select flow from country_cfg where country=''")
    return pick(r["flow"] if r else "")


def mask_name(s):
    if not s:
        return s
    return s[0] + "*" * (len(s) - 1) if len(s) <= 3 else s[0] + "**" + s[-1]


def mask_phone(s):
    return re.sub(r"^(\d{3})\d{4}(\d{4})$", r"\1****\2", s or "")


def mask_org(s):
    return (s[:2] + "***" + s[-2:]) if s and len(s) > 5 else s


class Err(Exception):
    def __init__(self, msg, code=400):
        self.msg, self.code = msg, code


# ============================ 审计：谁建的、最后谁动的 ============================
# 出了问题要追得到人，这是系统能不能上线的底线之一。
# 不在每个写接口里手写一遍——写一百处就会漏一处；统一在连接层拦截 insert/update，
# 自动补上创建人/创建时间/最近操作人/最近操作时间，任何新接口天然带审计。

AUDIT_TABLES = {
    "org", "user", "addr", "sample_tpl", "fullver", "fullver_item",
    "product", "sup_product", "pkg", "chan_group", "chan_rule", "chan_pub",
    "ord", "applicant", "mat", "supp", "wo", "batch", "deliver",
    "pay", "refund", "payable", "advance",
    # 运营配置也要留痕：谁把某个国家的头图换了、谁改了平台默认流程
    "home_cfg", "country_cfg",
}
INS_RE = re.compile(r"^\s*insert\s+into\s+(\w+)\s*\(([^)]*)\)\s*values\s*\((.+)\)\s*$",
                    re.I | re.S)
UPD_RE = re.compile(r"^\s*update\s+(\w+)\s+set\s+(.+?)(\s+where\s+.+)?$", re.I | re.S)


class AuditConn:
    """sqlite 连接的透明代理：写语句自动带上操作人。读语句原样透传。"""

    def __init__(self, c, user):
        self._c = c
        self.uid = user["id"] if user else None
        self.uname = (user["name"] if user else None) or "系统"

    def __getattr__(self, k):
        return getattr(self._c, k)

    def execute(self, sql, args=()):
        sql, args = self._stamp(sql, list(args))
        return self._c.execute(sql, args)

    def _stamp(self, sql, args):
        m = INS_RE.match(sql)
        if m and m.group(1).lower() in AUDIT_TABLES:
            cols = [x.strip().lower() for x in m.group(2).split(",")]
            add = [("created_by", self.uid), ("created_by_name", self.uname),
                   ("created_at", now()), ("updated_by", self.uid),
                   ("updated_by_name", self.uname), ("updated_at", now())]
            add = [p for p in add if p[0] not in cols]
            if not add:
                return sql, args
            sql = "insert into %s(%s,%s) values(%s,%s)" % (
                m.group(1), m.group(2), ",".join(p[0] for p in add),
                m.group(3), ",".join("?" * len(add)))
            return sql, args + [p[1] for p in add]
        m = UPD_RE.match(sql)
        if m and m.group(1).lower() in AUDIT_TABLES:
            sets = m.group(2)
            add = [("updated_by", self.uid), ("updated_by_name", self.uname),
                   ("updated_at", now())]
            add = [p for p in add if not re.search(r"\b%s\s*=" % p[0], sets, re.I)]
            if not add:
                return sql, args
            sql = "update %s set %s,%s%s" % (
                m.group(1), sets, ",".join(p[0] + "=?" for p in add), m.group(3) or "")
            # 新占位符插在 set 子句末尾，参数也必须插在同一位置，
            # 直接 append 会跑到 where 的参数后面，把值串错位
            n = re.sub(r"'[^']*'", "", sets).count("?")
            return sql, args[:n] + [p[1] for p in add] + args[n:]
        return sql, args


# ============================ 领域逻辑 ============================

def sample_of(c, tpl_id):
    """材料项挂的样例模版。运营在平台配置里维护一次，三端清单里直接给客人看。"""
    if not tpl_id:
        return None
    t = one(c, "select id,code,name,mat_name,files,countries,visa_types from sample_tpl"
               " where id=?", (tpl_id,))
    if not t:
        return None
    return {"id": t["id"], "code": t["code"], "name": t["name"],
            "mat_name": t["mat_name"], "files": jl(t["files"]),
            "countries": jl(t["countries"], []), "visa_types": jl(t["visa_types"], [])}


def mat_list(c, aid):
    """某位办签人的材料清单（带交付方式、样例、状态）。
    /my/checklist 与免登录分享页 /pub/task 共用一份，避免两处各拼一遍拼出差异。"""
    ms = rows(c, "select * from mat where applicant_id=? order by id", (aid,))
    for m in ms:
        m["provide_way"] = jl(m["provide_way"])
        m["way_text"] = "、".join(WAY.get(w, w) for w in m["provide_way"])
        m["attr_text"] = ATTR.get(m["attr"], m["attr"])
        m["nec_text"] = NEC.get(m["necessity"], m["necessity"])
        it = one(c, "select sample_tpl_id from fullver_item where id=?", (m["item_id"],))
        m["sample"] = sample_of(c, (it or {}).get("sample_tpl_id"))
    return ms


# 客人能看到哪些事件，以及在客人那边叫什么名字。
# 白名单而不是黑名单：事件表里全是内部动作名（「财务确认收款并放行」「并入送签批次」
# 「生成填表分享链接」），原样吐给客人既看不懂又漏内部信息——
# 之前客人的进度里就真的出现过「应付挂账 3400」「生成工单 VW-26080037」和三条
# 「生成填表分享链接」。白名单漏掉一个只是少显示一条，黑名单漏掉一个就是泄露。
# 文案对齐唐美芳给的闪签原型（「商家已收到资料」「商家资料审核完成」「使馆受理中」）。
# 2026-09-03 全表按「专业、友好、站在为客人做事的角度」重写了一遍
# （唐美芳：「话术如果要展示的话，尽量专业友好的角度」）。
# 三条原则：
#   1. 不说「商家」——签证是受托办理，说「我们」；
#   2. 每条都说清「谁做了什么」，别用「待 XX」这种内部工位名；
#   3. 要客人动手的那几条，把该做的事写进去，客人不用再猜。
CUST_EVENT = [
    ("创建订单", "订单提交成功"),
    ("客户支付", "付款成功"),
    ("财务确认收款到账", "已收到款项，我们开始为你办理"),
    # 客人自己做过的动作要留：他要看到「我交的东西到了」
    ("客户提交材料", "已收到你提交的材料"),
    ("提交材料", "已收到你提交的材料"),
    ("材料审核驳回", "有材料需要重新提交，详见补料通知"),
    ("发出补料单", "我们发来一条补料通知，请及时处理"),
    ("客户填写表单", "签证申请表填写中"),
    ("客户提交表单", "签证申请表已填写完成"),
    ("表单复核确认", "签证顾问已复核申请表"),
    ("资料返还寄出", "护照与资料已寄回"),
    ("客户签收资料", "你已签收寄回的资料"),
    ("取消订单", "订单已取消"),
    ("发起退款申请", "退款申请已提交，我们会尽快处理"),
    # 「材料审核通过」「登记预约」「并入送签批次」「回填签证结果」「行政审查」
    # 故意不在这里：这几个动作紧跟着就有一条「进度更新」讲同一个节点
    # （登记预约 → 已预约待面签、并入送签批次 → 已递交/已面签），
    # 两边都放会让客人看到同一件事说两遍。节点统一由「进度更新」出。
]


def cust_events(c, a, o):
    """把内部事件流翻译成客人看得懂、也能看的那几条。
    只给动作文案与时间，不给 detail——detail 里常带工单号、应付金额、批次号这些
    内部信息，逐条清洗不如不给：客人要的是「办到哪了」，不是内部流水。

    「进度更新」是例外：它的 detail 写成「旧状态 → 新状态；内部说明」，
    箭头右边那个状态名本身就是客人语言（材料已齐备 / 已递交、已面签 / 已出结果），
    正好把整条链补齐。只取箭头右边、括号与分号之前那一截，其余照样不给。"""
    out = []
    for e in rows(c, "select action,detail,created_at from event"
                     " where (scope='applicant' and ref_id=?)"
                     " or (scope='ord' and ref_id=?) order by id", (a["id"], o["id"])):
        txt, key = None, None
        if "进度更新" in e["action"]:
            m = re.search(r"→\s*([^（(；;]+)", e["detail"] or "")
            if m:
                txt, key = m.group(1).strip(), "进度更新"
                # 箭头右边可能是专员工位名（待收料 / 待提交至官网 …），
                # 那是内部说法，换成客人话术再给出去（2026-09-03）
                txt = CUST_PROG.get(txt, txt)
        else:
            for k, t in CUST_EVENT:
                if k in e["action"]:
                    txt, key = t, k
                    break
        if not txt:
            continue
        # 同一句连着来好几条（比如逐项材料审核通过）只留最后一条，
        # 客人看的是节点不是流水
        if out and out[-1]["text"] == txt:
            out[-1]["at"] = e["created_at"]
        else:
            out.append({"text": txt, "at": e["created_at"], "key": key})
    return out


def pub_track(c, a, o):
    """客人可见的办理进度。事件走 cust_events 白名单翻译，
    不暴露内部工单、供应商结算与同行其他客人的信息。"""
    dl = one(c, "select * from deliver where ord_id=? order by id desc limit 1", (o["id"],))
    pn = PNAME[a["progress"]]
    return {"progress": a["progress"], "progress_text": pn,
            # 客户端专用：节点的客人话术 + 这一步要不要他动手，
            # 再加一个「第几步 / 共几步」让进度页能画步骤条（2026-09-03）
            "stage_text": CUST_PROG.get(pn, pn),
            "stage_todo": CUST_PROG_TODO.get(pn, ""),
            "step": PORDER.index(a["progress"]) + 1 if a["progress"] in PORDER else 1,
            "steps": [{"k": k, "t": CUST_PROG.get(t, t)} for k, t in PROGRESS],
            "result": RESULT.get(a["visa_result"], ""),
            "appt_at": a["appt_at"], "appt_place": a["appt_place"],
            "express": (dl or {}).get("express"), "express_no": (dl or {}).get("express_no"),
            "events": cust_events(c, a, o)}


def mail_addr_of(c, ord_row):
    """原件寄到哪儿：供应商的收料地址。"""
    sp = one(c, "select * from sup_product where id=?", (ord_row["sup_product_id"],))
    a = one(c, "select * from addr where id=?", ((sp or {}).get("addr_id"),))
    if not a:
        return None
    return {"text": "%s %s（%s %s）" % (a["region"], a["detail"], a["contact"], a["phone"]),
            "region": a["region"], "detail": a["detail"],
            "contact": a["contact"], "phone": a["phone"]}


def _fmt_item(it):
    it["crowds"] = jl(it["crowds"]) if isinstance(it.get("crowds"), str) else (it.get("crowds") or [])
    it["provide_way"] = (jl(it["provide_way"]) if isinstance(it.get("provide_way"), str)
                         else (it.get("provide_way") or []))
    it["way_text"] = "、".join(WAY.get(w, w) for w in it["provide_way"])
    it["attr_text"] = ATTR.get(it["attr"], it["attr"])
    it["nec_text"] = NEC.get(it["necessity"], it["necessity"])
    return it


def way_split(ways, need_interview):
    """按产品是否需要面签，把「提供方式」收敛成这条产品真实成立的那一种。

    唐美芳 2026-09-07 定的口径，起因是「免面签续签护照送中信银行算不算寄原件」：
      · **需面签**：客人本人带着护照去使领馆，原件全程在他自己手上 → 面试携带，不寄；
      · **免面签（dropbox）**：护照原件连同旧护照一起交到指定的中信银行网点，
        或走 EMS 上门取件送使领馆，出签后再从网点 / EMS 取回 → 这就是<b>寄原件</b>。
    同一份清单要同时服务这两类产品，所以材料项上两种方式都勾着，
    到了具体产品这一层再按 need_interview 分流，运营不必维护两套清单。

    电子上传不受影响：扫描件预审两类产品都要做。
    只勾了一种方式的项不动——那是运营明确指定的，不替他做主。
    """
    ws = list(ways or [])
    if "upload" in ws and len(ws) == 1:
        return ws
    has_mail, has_carry = "mail" in ws, "carry" in ws
    if not (has_mail and has_carry):
        return ws                                   # 只勾了一种，按运营录的执行
    drop = "mail" if need_interview else "carry"
    return [w for w in ws if w != drop]


def checklist_for(c, fullver_id, crowd, sup_product=None, need_interview=None):
    """按人群裁剪完整版材料清单。

    sup_product 传进来时，再叠一层<b>供应商的定制</b>
    （唐美芳 2026-09-03：「可以让供应商自定义材料清单」）。

    定制的边界是想清楚才定的：
      · **平台的必交项不能删** —— 那是这个国家签证成功率的底线，
        删了客人到使领馆才发现少材料，砸的是我们的招牌；
      · 平台的<b>建议项</b>可以标「本产品不需要」 —— 那本来就是加分项，
        不同供应商对加分项的判断确实不同；
      · 可以<b>追加</b>本供应商额外要的材料，列表里明确标出「本供应商额外要求」，
        客人一眼知道这不是使领馆的硬性要求。
    这样既让供应商能体现差异，又守住「同一国家基本口径一致」——
    原来一刀切写死「供应商不可自建」，供应商的真实差异就只能塞进说明文字里，没人看。
    """
    custom = {}
    if sup_product:
        try:
            custom = json.loads(sup_product["mat_custom"] or "{}") or {}
        except Exception:
            custom = {}
    skip = set(int(x) for x in (custom.get("skip") or []) if str(x).isdigit())
    out = []
    for it in rows(c, "select * from fullver_item where fullver_id=? order by sort", (fullver_id,)):
        if crowd and crowd not in jl(it["crowds"]):
            continue
        # 必交项不允许被供应商去掉，即使它被写进了 skip
        if it["id"] in skip and it["necessity"] != "must":
            continue
        it = _fmt_item(it)
        if need_interview is not None:
            it["provide_way"] = way_split(it["provide_way"], need_interview)
            it["way_text"] = "、".join(WAY.get(w, w) for w in it["provide_way"])
        it["sample"] = sample_of(c, it["sample_tpl_id"])
        it["by_sup"] = 0
        out.append(it)
    for i, ex in enumerate(custom.get("add") or []):
        cw = ex.get("crowds") or list(CROWD.keys())
        if crowd and crowd not in cw:
            continue
        it = {"id": -(i + 1), "fullver_id": fullver_id,
              "mat_name": ex.get("mat_name") or "", "attr": ex.get("attr") or "copy",
              "provide_way": ex.get("provide_way") or ["upload", "carry"],
              "copies": int(ex.get("copies") or 1),
              # 供应商追加的一律算「建议」：使领馆没要求，是这家供应商的收料偏好，
              # 标成必交会让客人以为不交就办不了
              # 用 suggest 不是 advise —— NEC 字典里的键是 suggest，
              # 写错会让清单上显示成英文原文
              "necessity": "suggest", "require_text": ex.get("require_text") or "",
              "sample_tpl_id": None, "files": None, "crowds": cw, "sort": 900 + i,
              "by_us": 0}
        it = _fmt_item(it)
        if need_interview is not None:
            it["provide_way"] = way_split(it["provide_way"], need_interview)
            it["way_text"] = "、".join(WAY.get(w, w) for w in it["provide_way"])
        it["sample"] = None
        it["by_sup"] = 1
        out.append(it)
    return out


def fv_can_edit(user, f):
    """能不能改这份清单版本。

    唐美芳 2026-09-04（语音）：「UBK 的系统新增产品需要把 UOM 里的国家材料库
    也有一个入口可以去添加，要同步挪到 UBK 里，跟 UOM 一模一样」。
    搬过去之后归属必须分清，否则同一个国家会冒出十几份互相打架的清单，
    客人在两家下单收到两套材料，出了问题说不清是谁的口径：

      · owner_org = 0        平台版本，运营维护，<b>所有供应商可选用但只读</b>；
      · owner_org = <org_id> 该供应商自建，只有他自己能改、也只有他自己能选用；
        运营也能改 —— 供应商把自己的清单编坏了要有人能兜底救场。
    """
    if user["role"] == "ops":
        return True
    return user["role"] == "ubk" and (f["owner_org"] or 0) == user["org_id"]


def fv_visible(user, f):
    """能不能看见。

    供应商侧只给两类：**平台已发布的版本**，和自己建的（含草稿）。
    唐美芳 2026-09-04：「ubk 里的国家送签材料库查询的数据范围，应该是只有 uom
    平台侧已发布的数据，只能查看，不能编辑」——平台的草稿与已撤回版本是运营
    还在改、或已经决定不用的东西，露给供应商只会让他照着一份不作数的清单去收料。
    """
    if user["role"] != "ubk":
        return True
    own = f["owner_org"] or 0
    if own == user["org_id"]:
        return True
    return own == 0 and f["status"] == "published"


def fv_guard(user, f, edit=True):
    if not f:
        raise Err("材料清单版本不存在", 404)
    if not fv_visible(user, f):
        raise Err("无权查看该清单版本", 403)
    if edit and not fv_can_edit(user, f):
        raise Err("该版本由平台统一维护，供应商可选用但不可修改。"
                  "如仅需针对单条产品增减材料，请在新增或编辑产品时使用「调整本产品清单」；"
                  "如需另行制定收料口径，请对该版本执行「复制新版」后在副本上调整", 403)
    return f


def clean_mat_custom(c, fullver_id, data):
    """把前端传来的清单定制洗成入库格式。新增产品与产品详情两个入口共用一份，
    免得一边把住了边界、另一边能绕过去。

    洗出来的结构：{"add": [...], "skip": [平台项 id]}，语义见 checklist_for()。
    """
    data = data or {}
    add = data.get("add") or []
    skip = data.get("skip") or []
    if len(add) > 10:
        raise Err("补充材料最多 10 项。材料要求过多将显著影响申请人的下单意愿，"
                  "非必要的提示性内容建议填写至产品的「受理范围说明」")
    clean = []
    for x in add:
        nm = (x.get("mat_name") or "").strip()
        if not nm:
            continue
        clean.append({"mat_name": nm[:40],
                      "attr": x.get("attr") if x.get("attr") in ATTR else "copy",
                      "provide_way": [w for w in (x.get("provide_way") or [])
                                      if w in WAY] or ["upload", "carry"],
                      "copies": max(1, min(int(x.get("copies") or 1), 5)),
                      "require_text": (x.get("require_text") or "").strip()[:200],
                      "crowds": [k for k in (x.get("crowds") or []) if k in CROWD]
                                or list(CROWD.keys())})
    skip = [int(i) for i in skip if str(i).isdigit()]
    # 必交项挡在这儿：前端不给勾，接口也不能被绕过
    must = set(r["id"] for r in rows(
        c, "select id from fullver_item where fullver_id=? and necessity='must'",
        (fullver_id,)))
    if [i for i in skip if i in must]:
        raise Err("必交材料不可取消。该类材料为目的国送签的基本要求，"
                  "缺项将直接导致受理失败，平台不予放开")
    return json.dumps({"add": clean, "skip": skip}, ensure_ascii=False)


def mat_stat(c, applicant_id):
    """材料统计。2026-09-03 拆细，起因是唐美芳问「材料审核清单里的字段都是客人必填的字段么，
    在客人未填写之前，也不需要审核啊，所以这个审核清单存在的意义是什么」。

    查下来这张表把三类东西混在一起，难怪看不懂：
      1. **客人现在手上就有的**（护照、身份证、在职证明、流水…）—— 待收料就该催他交；
      2. **我方办出来才有的**（DS-160 确认页要专员在官网填完才能打印、面签预约确认单要约到号、
         签证费收据要缴完费）—— 在待收料催客人交，客人手上根本没有，催也交不出来；
      3. **建议项**（房产车产、行程单、邀请函）—— 不交也能送签，不该跟必交项一起算进「还差 N 项」。
    所以除了总数，还要分别给出「客人该交的必交项」和「等我方产出的」。"""
    ms = rows(c, "select status,necessity,by_us from mat where applicant_id=?", (applicant_id,))
    st = {"total": len(ms), "must": 0, "pass": 0, "review": 0, "reject": 0, "wait": 0,
          # 客人这边：必交且要他自己提供的，还差几项
          # cust_wait 含「已上传待审核」；cust_todo 只数**客人还得动手**的
          # （未提交 / 被驳回）——催办要用后者，已上传待审核的催他也没用
          # （2026-09-08：供应商催办按钮与后端校验口径原来不一致，一个说缺 1 项、
          #  一个说已交齐）。
          "cust_must": 0, "cust_wait": 0, "cust_todo": 0,
          # 我方这边：办出来才有的，还差几项
          "ours_total": 0, "ours_wait": 0,
          # 建议项单独计，催客人时不算数
          "opt_total": 0, "opt_wait": 0}
    for m in ms:
        st[m["status"] if m["status"] != "pass" else "pass"] += 1
        if m["necessity"] == "must":
            st["must"] += 1
        if m["by_us"]:
            st["ours_total"] += 1
            if m["status"] != "pass":
                st["ours_wait"] += 1
        elif m["necessity"] == "must":
            st["cust_must"] += 1
            if m["status"] != "pass":
                st["cust_wait"] += 1
            # ⚠️ 驳回写进库里的是 'reject'（见 /mat/review），这里原来写的是 'rejected'，
            # 永远不命中——材料被驳回了，「客户还得动手」的计数却当它不存在。
            # 2026-09-09 唐美芳要驳回按钮时暴露：驳回完客户端既不标红也不计数，
            # 等于客户根本不知道自己哪一项被打回来了。前后端共 5 处同款笔误，一并改。
            if m["status"] in ("wait", "reject", "rejected"):
                st["cust_todo"] += 1
        else:
            st["opt_total"] += 1
            if m["status"] != "pass":
                st["opt_wait"] += 1
    # 「材料齐了没有」只看<b>客人该交的必交项</b>。
    # by_us 那三项（DS-160 确认页 / 面签预约确认单 / 签证费收据）是我方后面几步
    # 才办得出来的凭证，把它们算进去，客人材料交齐了进度也永远推不到「待提交至官网」
    # ——2026-09-03 实测：整单审核通过后 7/7 必交项已过，进度仍卡在待审核。
    st["ready"] = bool(ms) and all(
        m["status"] == "pass" for m in ms
        if m["necessity"] == "must" and not m["by_us"])
    return st


def set_progress(c, applicant_id, target, user, note=""):
    """推进进度；跳跃时中间环节自动补齐（凯撒 PRD 的勾选规则）。"""
    a = one(c, "select * from applicant where id=?", (applicant_id,))
    if not a:
        raise Err("办签人不存在")
    if target not in PORDER:
        raise Err("非法进度")
    cur, tgt = PORDER.index(a["progress"]), PORDER.index(target)
    passed = []
    if tgt > cur:
        passed = PORDER[cur + 1:tgt + 1]
    elif tgt < cur:
        passed = [target]
    c.execute("update applicant set progress=? where id=?", (target, applicant_id))
    log(c, "applicant", applicant_id, a["ord_id"], user, "进度更新",
        "%s → %s%s%s" % (PNAME[a["progress"]], PNAME[target],
                         ("（自动补齐 " + "、".join(PNAME[p] for p in passed[:-1]) + "）")
                         if len(passed) > 1 else "", ("；" + note) if note else ""))
    sync_order(c, a["ord_id"])
    return passed


# 订单办理状态：凯撒 PRD 的「订单办理状态」，由全部办签人的签证办理进度派生，不落库。
#   未放行 → 未开始（专员根本看不到这张单）
#   全部办签人到 P10 → 已完成
#   其余 → 办理中；全员还停在 P1 时也算「未开始」，避免一步没办却显示办理中
def crm_addrs(c, g):
    """客户的收货地址簿（凯撒 PRD 4.11 用户管理-收货地址管理）。
    地址挂在下单人（user）名下；这里同时统计每条地址被哪些订单在用——
    客服改地址前必须先知道「改了会影响哪几张在办的单」。"""
    uids = {o["buyer_user"] for o in g["orders"] if o["buyer_user"]}
    if not uids:
        return []
    q = "(" + ",".join("?" * len(uids)) + ")"
    out = []
    for a in rows(c, "select * from addr where owner_kind='user' and owner_id in " + q +
                     " order by is_default desc, id", tuple(uids)):
        used = [o["no"] for o in g["orders"] if o["recv_addr_id"] == a["id"]]
        live = [o["no"] for o in g["orders"]
                if o["recv_addr_id"] == a["id"] and o["status"] in ("paid", "created")]
        out.append({"id": a["id"], "contact": a["contact"], "phone": a["phone"],
                    "region": a["region"], "detail": a["detail"],
                    "is_default": a["is_default"], "used": len(used), "live": live,
                    "updated_by_name": a["updated_by_name"], "updated_at": a["updated_at"]})
    return out



# ---------------------------------------------------------------
# 支付状态 / 收款状态（2026-09-03）
#
# 唐美芳：「订单列表直接增加一个支付状态展示吧，别展示待财务确认到账了，
# 几个系统都需要同步……支付状态有待支付、已支付、部分支付，ubk 对应收款状态有
# 待收款、部分收款、已收全款，因为 uom 和 csp 是内部系统运营视角，
# ubk 是外部供应商收款视角，注意甄别」。
#
# 两个要点：
# 1. 只看钱到没到，**不看财务有没有核对过水单**。财务确认是内部审核环节，
#    不是支付状态——客人付了就是付了，确不确认是我们内部的事。
#    （原来订单列表挂「待财务确认到账」标识，客人明明付过款，看着像没付。）
# 2. 两个视角是两笔不同的钱，不能混用同一个字段：
#    - 客户 → 平台：pay(kind='in')，UOM / CSP / 有米 / C 端都看这个，叫「支付状态」；
#    - 平台 → 供应商：payable，UBK 只看这个，叫「收款状态」。
# 状态码统一 unpaid / part / paid，中文措辞由各端按自己的立场给。
# ---------------------------------------------------------------
def money_state(due, got):
    """按「该收多少 / 已收多少」算三态。金额比较留 1 分钱容差，避免浮点误差误判。"""
    due = float(due or 0)
    got = float(got or 0)
    if got <= 0.009:
        return "unpaid"
    if due - got > 0.009:
        return "part"
    return "paid"


def pay_state(c, o, recv=None, refunded=None):
    """客户支付状态。已付里包含还没被财务确认的那笔。
    已退的钱从应收里扣掉——整单退完之后不该还挂着「待支付」。"""
    if recv is None:
        recv = c.execute("select ifnull(sum(amount),0) from pay where ord_id=? and kind='in'",
                         (o["id"],)).fetchone()[0]
    if refunded is None:
        refunded = c.execute("select ifnull(sum(amount),0) from refund"
                             " where ord_id=? and status='done'", (o["id"],)).fetchone()[0]
    return money_state((o["amount"] or 0) - (refunded or 0), recv)


PAY_ST_TEXT = {"unpaid": "待支付", "part": "部分支付", "paid": "已支付"}
# 供应商站在收钱那头，同一个状态码换一套措辞
RECV_ST_TEXT = {"unpaid": "待收款", "part": "部分收款", "paid": "已收全款"}


def work_status(c, o):
    # 办理状态不再看 gate：下单就建工单、就开始收料，与收没收到款无关
    # （唐美芳 2026-09-02：「在正式提交美国签证中心网站之前，都和支付状态无关」）。
    #
    # 2026-09-03 改成三态：未完成 / 部分完成 / 已完成
    # （唐美芳：「订单状态里的办签状态，应该和订单合同状态一样，有未完成、部分完成、
    # 已完成，而不是像现在这样，只有 1 个人完成，办签状态也是已完成状态」）。
    #
    # 关键在**分母取全部办签人，不剔除已退款/已取消的那些**。原来只统计 state='normal'，
    # 一张 2 人单退了 1 人、剩下那个走完，整单就报「已完成」——可这张单实际上只有
    # 一半的人拿到结果。谁没走完在下面那行「N 人已完成 / N 人已退出」里看得到。
    aps = rows(c, "select progress,state from applicant where ord_id=?", (o["id"],))
    if not aps:
        return "未完成"
    done = sum(1 for a in aps if a["state"] == "normal" and a["progress"] == "P6")
    if done == 0:
        return "未完成"
    if done == len(aps):
        return "已完成"
    return "部分完成"


def sync_order(c, ord_id):
    ps = [r["progress"] for r in rows(
        c, "select progress from applicant where ord_id=? and state='normal'", (ord_id,))]
    if not ps:
        return
    o = one(c, "select * from ord where id=?", (ord_id,))
    # 「1 个订单里的全部办签人都是已完成状态，那么订单才可流转至已完成，
    #   否则还是已支付」（唐美芳 2026-09-02）
    if o["status"] == "paid" and all(p == "P6" for p in ps):
        c.execute("update ord set status='done' where id=?", (ord_id,))


# 各国「提交至官网」拿到的那串号叫法不同：美国 DS-160 给 Application ID，
# 澳大利亚 ImmiAccount 给 TRN，申根走 VFS/TLS 给的是预约参考号。
# 字段仍统一存 applicant.app_id，只是对外的叫法按国家取——
# 让专员看到的是他在官网上真实看到的那个词，而不是所有国家都叫 Application ID。
OFFICIAL_ID_NAME = {
    "美国": "Application ID（DS-160）",
    "澳大利亚": "TRN 申请编号（ImmiAccount）",
    "英国": "GWF 参考号",
    "加拿大": "UCI / 申请号",
    "日本": "受理番号",
    "韩国": "申请受理编号",
}
SCHENGEN = ["法国", "德国", "意大利", "西班牙", "荷兰", "比利时", "瑞士",
            "奥地利", "希腊", "葡萄牙", "捷克", "匈牙利", "波兰", "北欧"]


def fee_item_of(country):
    """签证费在各国的叫法不一样，缴费弹窗的「费用项」默认值按国家给。
    美国是 CGI（在线缴费系统），申根走 VFS/TLS 代收，澳洲在 ImmiAccount 直缴。"""
    return {"美国": "CGI 签证费", "英国": "VFS 服务费",
            "澳大利亚": "签证申请费", "日本": "签证费",
            "新加坡": "签证费", "韩国": "签证费"}.get(country, "签证费")


def official_id_name(country):
    if country in OFFICIAL_ID_NAME:
        return OFFICIAL_ID_NAME[country]
    if country in SCHENGEN:
        return "签证中心受理号（VFS / TLS）"
    return "官网受理号"


def next_after_official(c, a):
    """提交至官网之后进哪一步：要面签的去「待预约」，免面签的直接「待出签」。

    唐美芳 2026-09-02 问「未来扩展到澳大利亚、申根，流程是不是能复用」——
    六步主干是通用的，唯一会空转的是「待预约」：澳洲 600 类别、新加坡、韩国、
    日本这些免面签的国家根本不需要抢号，卡在「待预约」会让专员以为还有事要做。
    产品上本来就有 need_interview 这个属性，这里让它真正决定流程走向。
    """
    o = one(c, "select * from ord where id=?", (a["ord_id"],))
    pr = one(c, "select * from product where id=?", (o["product_id"],)) if o else None
    return "P4" if (pr and pr["need_interview"]) else "P5"


def pay_guard(c, ord_id):
    """提交至官网前的唯一一道付款校验。

    唐美芳 2026-09-02：「在正式提交美国签证中心网站之前，都和支付状态无关，
    点提交时，确认下订单付款状态即可」。收料、审材料、填表都不看钱，
    真要往官方渠道递之前才卡一次——递出去就产生了不可逆的官方成本。
    """
    o = one(c, "select * from ord where id=?", (ord_id,))
    if not o:
        raise Err("订单不存在", 404)
    if o["status"] in ("cancelled", "refunded"):
        raise Err("订单已%s，不能再提交至官网" % ORD_STATUS[o["status"]])
    if o["status"] == "created":
        raise Err("订单尚未付款，不能提交至官网。请先完成收款（订单 %s，应收 %.0f 元）"
                  % (o["no"], o["amount"]))
    return o


def barcode_of(app_id):
    """DS-160 的条形码就是 Application ID 本身的编码，不是另一串号。

    唐美芳 2026-09-02 问「是不是系统可以做到自动回填 Application ID 和条形码」——
    **Application ID 自动回填不了**：CEAC 官网没有公开 API、也不授权程序化提交，
    这串号只有在专员于官网提交成功后的页面上才拿得到，只能人工粘回来。
    但条形码可以：拿到 App ID 之后，条码由它派生，不需要再问客户或官网要一次。
    """
    return (app_id or "").strip().upper()


def open_wo(c, ord_id, user):
    o = one(c, "select * from ord where id=?", (ord_id,))
    sp = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
    pk = one(c, "select lead_days from pkg where id=?", (o["pkg_id"],))
    ops = rows(c, "select id from user where role='uom' order by id")
    made = []
    for i, a in enumerate(rows(c, "select * from applicant where ord_id=?", (ord_id,))):
        if one(c, "select id from wo where applicant_id=?", (a["id"],)):
            continue
        no = nextno(c, "VW")
        c.execute("insert into wo(no,ord_id,applicant_id,owner_user,sup_org,sla_due,status,created_at)"
                  " values(?,?,?,?,?,?,'open',?)",
                  (no, ord_id, a["id"], ops[i % len(ops)]["id"] if ops else None,
                   sp["org_id"] if sp else None, now((pk or {}).get("lead_days", 15)), now()))
        made.append(no)
        log(c, "wo", c.execute("select last_insert_rowid()").fetchone()[0], ord_id, user,
            "工单生成", no + " / " + a["name_cn"])
    return made


def sup_on(sp, track):
    """这条产品此刻是否真的在某一端展示。

    三个条件缺一不可：供应商已提交上架（status）、勾了这一端（to_b/to_c）、
    这一端的运营审核通过（review_b/review_c）。B 端过审即在 CSP 展示，
    C 端过审即在客户小程序展示，两端互不影响（唐美芳 2026-08-27 定）。
    """
    #  第四个条件（2026-09-09 加）：平台没有把它强制停售。
    #  off_sale 是运营手里的开关，**不动审核结论**——出问题时先停售，
    #  查清楚再启售，不用重走一遍审核。
    if "off_sale" in sp.keys() and sp["off_sale"]:
        return False
    return (sp["status"] == "published" and sp["to_" + track] == 1
            and sp["review_" + track] == "approved")


def sup_state(sp):
    """供应商产品对外只有两个状态：待发布 / 已发布（唐美芳 2026-08-26 定）。
    status（供应商是否提交）和审核结论是两个内部维度，
    列表页签按它们切四五个格子，供应商根本分不清「草稿」和「被驳回」该干什么不一样的事。
    细分结论仍然逐条展示在「审核状态」列里，只是不再当页签用。
    只要有任意一端在售就算已发布。"""
    return "on" if (sup_on(sp, "b") or sup_on(sp, "c")) else "off"


def sup_policy(sp, ord_cnt=0):
    """一条产品此刻哪些字段能改。UI 和接口共用这一份，避免前端灰掉、接口照收。

    2026-09-04 唐美芳整体放开：「编辑产品信息允许编辑吧，都是基础内容，应该允许编辑，
    即便是有单子了。但是编辑的时候，自动下架。另外编辑套餐信息的时候，允许上架，
    上架后不需要 uom 审核就直接上架了」。

    所以锁只剩一条：**审核中不能改**——改完不重新送审，运营审的就不是最终版本。
    在售、已成交都不再拦：改动会触发 auto_offline() 自动下架，
    供应商改完自己点「提交上架」即刻恢复展示，不必再过一遍审核。
    风险由三件事兜住：① 下架只影响新单，已成交订单一律按下单时的快照执行；
    ② 每次改动与自动下架都进操作日志；③ 运营在产品详情的日志页签里看得到。
    """
    pending = sp["review_b"] == "pending" or sp["review_c"] == "pending"
    onsale = sup_state(sp) == "on"
    sold = ord_cnt > 0
    return {"pending": pending, "onsale": onsale, "sold": sold,
            "name": not pending,
            "feature": not pending,
            "scope": not pending,
            "addr": not pending,
            "price": not pending,
            "pkg_add": not pending,
            "notice": not pending}


POLICY_WHY = {
    "name": "审核中不可修改，请先撤回审核",
    "price": "审核中不可修改，请先撤回审核",
    "pkg_add": "审核中不可修改，请先撤回审核",
    "feature": "审核中不可修改，请先撤回审核",
    "scope": "审核中不可修改，请先撤回审核",
    "addr": "审核中不可修改，请先撤回审核",
    "notice": "审核中不可修改，请先撤回审核",
}


def sup_guard(pol, key):
    if not pol[key]:
        raise Err(POLICY_WHY[key])


def auto_offline(c, sp, user, why):
    """在售产品改了实质内容 → 自动下架（唐美芳 2026-09-04：「编辑的时候，自动下架」）。

    为什么必须下架而不是静默改：门店与客户端正按旧的价格、材料要求、收料地址在卖，
    改完不下架就会出现「下单时看到的 ≠ 成交时执行的」。
    **审核结论不清空**——重新上架时沿用原结论直接恢复展示，这是她要的「不需要 uom 审核」。
    """
    if sp["status"] != "published":
        return False
    c.execute("update sup_product set status='draft',updated_at=? where id=?", (now(), sp["id"]))
    log(c, "sup_product", sp["id"], None, user, "修改后自动下架",
        why + "；完成后点击「提交上架」即时恢复展示，无需再次审核")
    return True


def pkg_prices(body, cur=None):
    """套餐的四个价格：签证费 / 商家服务费 / 结算价 / 建议零售价，带业务校验。

    唐美芳 2026-09-07：「套餐报价的录入结算价不是签证费+服务费，允许自己输入，
    但是结算价肯定不能低于签证费，建议零售价不能低于结算价」。
    在此之前结算价是 visa_fee + service_fee 算出来的，供应商改不了——
    而结算价是平台与供应商谈定的价，本来就不一定等于两项之和。
    校验只做这两条硬约束：签证费是使领馆实收，低于它等于倒贴；
    建议零售价低于结算价则渠道卖一单亏一单。
    """
    cur = cur or {}

    def num(k, dft=0):
        v = body.get(k, cur.get(k, dft))
        try:
            return float(v if v not in (None, "") else 0)
        except (TypeError, ValueError):
            raise Err("%s 必须是数字" % k)

    vf, sf, st, rt = num("visa_fee"), num("service_fee"), num("settle_price"), num("suggest_retail")
    if st <= 0:
        raise Err("请填写结算价")
    if st < vf:
        raise Err("结算价 %.0f 元不得低于签证费 %.0f 元" % (st, vf))
    if rt <= 0:
        raise Err("请填写建议零售价")
    if rt < st:
        raise Err("建议零售价 %.0f 元不得低于结算价 %.0f 元" % (rt, st))
    return vf, sf, st, rt


def chan_price(rule, settle, sf):
    """按渠道组策略算出该渠道的结算价。基数是套餐自己的结算价。"""
    if not rule:
        return settle
    if rule.get("mode") == "percent":
        if rule["base"] == "service":
            return round(settle + sf * rule["val"] / 100.0, 2)
        return round(settle * (1 + rule["val"] / 100.0), 2)
    if rule.get("mode") == "fixed":
        return settle + rule["val"]
    return settle


def reprice_pkg(c, pkg_id):
    """套餐价格变动后，重算它在各渠道组的投放价与报价预警。"""
    pk = one(c, "select * from pkg where id=?", (pkg_id,))
    if not pk:
        return
    for cp in rows(c, "select * from chan_pub where pkg_id=?", (pkg_id,)):
        rule = one(c, "select * from chan_rule where group_id=?", (cp["group_id"],))
        settle = chan_price(dict(rule) if rule else None, pk["settle_price"], pk["service_fee"])
        retail = cp["retail_price"] or pk["suggest_retail"]
        c.execute("update chan_pub set settle_price=?,suggest_price=?,warn=?,updated_at=?"
                  " where id=?",
                  (settle, pk["suggest_retail"], 1 if settle > retail else 0, now(), cp["id"]))


def task_load(c, tid=None, applicant_id=None):
    """取一张填表任务。传 applicant_id 时顺手补建——本次改造之前下的单没有任务记录，
    第一次被打开时补上，比写一次性迁移脚本可靠（新老数据走同一条路径）。"""
    if not tid and not applicant_id:
        raise Err("缺少参数 id 或 applicant_id")
    if tid:
        t = one(c, "select * from form_task where id=?", (int(tid),))
    else:
        a = one(c, "select * from applicant where id=?", (int(applicant_id),))
        if not a:
            raise Err("办签人不存在", 404)
        t = form_task.ensure_task(c, a)
        if not t:
            raise Err("该产品所属国家还没有已发布的官方表单模板，无法建表", 400)
    if not t:
        raise Err("填表任务不存在", 404)
    a = one(c, "select * from applicant where id=?", (t["applicant_id"],))
    o = one(c, "select * from ord where id=?", (a["ord_id"],))
    return t, a, o


def sp_pick(c, user, sp_id):
    """取一条供应商产品：供应商只能碰自己 org 的，平台运营（ops）不受此限。

    2026-09-09 唐美芳要求 UOM 的产品管理也能「编辑产品 / 编辑套餐」——
    总部替供应商改是常事（报价谈完了对方半天不改、材料要求要统一口径）。
    改动仍然全程留痕（updated_by / updated_by_name），供应商能看到是谁改的。
    """
    if user["role"] == "ops":
        sp = one(c, "select * from sup_product where id=?", (sp_id,))
    else:
        sp = one(c, "select * from sup_product where id=? and org_id=?",
                 (sp_id, user["org_id"]))
    return sp


def sup_wo_guard(c, user, applicant_id):
    """供应商只能碰派发到自己公司、且资金闸门已开的那些办签人。
    2026-09-09 材料审核下放给供应商后，这段归属校验有五处要用，抽出来一份，
    免得哪个接口漏写一段（/result/save、/sup/progress 那两处当时就是各写各的）。

    ⚠️ 不要叫 sup_guard——那个名字上面已经被「供应商产品政策校验」占了
    （sup_guard(pol, key)）。第一版就是这么撞的：Python 里后定义的把先定义的
    整个覆盖掉，产品改价那几个接口全炸成
    「sup_guard() missing 1 required positional argument」，e2e 一跑就现形。"""
    w = one(c, "select * from wo where applicant_id=? and sup_org=?",
            (int(applicant_id), user["org_id"]))
    if not w:
        raise Err("该办签人不在派发至贵司的工单范围内", 403)
    o = one(c, "select gate from ord where id=?", (w["ord_id"],))
    if not o or not o["gate"]:
        raise Err("该工单尚未派发至贵司（平台财务确认收款到账后自动派发）", 403)
    return w


def task_guard(c, user, o, write=False):
    """谁能看这张表：专员/主管/运营看全部，销售看自己或本门店的单，客户看自己的单。
    2026-09-08 唐美芳定：「需要放开，之前我是放在了 uom 里，现在相当于下放权限到 ubk，
    因为真正干活办理签证的人，还是供应商」。在此之前供应商被整体挡在填表任务之外
    （理由是表里有护照号、家庭住址、亲属信息）。现在按业务分工放开，
    但**边界收在工单归属上**：只能碰派发到自己公司的那些办签人，不是全量，且全程留操作日志。
    财务（fin）仍然拿不到——他的岗位跟填表无关。"""
    if not user:
        raise Err("未登录", 401)
    r = user["role"]
    if r in ("uom", "lead", "ops"):
        return
    if r == "csp" and (o["agent_user"] == user["id"] or
                       (o["org_id"] and o["org_id"] == user["org_id"])):
        return
    if r == "customer" and o["buyer_user"] == user["id"]:
        return
    if r == "ubk" and c.execute(
            "select count(*) from wo where ord_id=? and sup_org=?",
            (o["id"], user["org_id"])).fetchone()[0]:
        return
    raise Err("无权访问该填表任务", 403)


def task_brief(c, t, a, o):
    """列表项：一行答清楚「谁的表、填到哪、谁在填、卡在谁手上」。"""
    st = form_task.stat(c, t)
    fv = one(c, "select * from formver where id=?", (t["formver_id"],)) or {}
    return {
        "task_id": t["id"], "applicant_id": a["id"], "name": a["name_cn"],
        "ord_id": o["id"], "ord_no": o["no"], "channel": o["channel"],
        "progress": a["progress"], "progress_text": PNAME.get(a["progress"], a["progress"]),
        "status": t["status"], "status_text": form_task.STATUS.get(t["status"], t["status"]),
        "filled_by": t["filled_by"],
        "filled_by_text": form_task.FILLED_BY.get(t["filled_by"], ""),
        "form_code": fv.get("form_code"), "ver_no": fv.get("ver_no"),
        # 还差几格必填、其中几格是「系统带不出来、只能人工补」的——
        # 专员在列表上就要看出来「这张表卡在谁手里」，而不是点进去逐格找
        # （唐美芳 2026-09-01：「流程卡住没了」）。
        "miss": (lambda ms: {
            "total": len(ms),
            "ask": len([x for x in ms if x["src"] == "ask"]),
            "agent": len([x for x in ms if x["src"] != "ask"]),
            "names": [x["name"] for x in ms[:3]],
        })(form_task.missing_required(c, t)),
        "stat": st, "prefill_at": t["prefill_at"], "submit_at": t["submit_at"],
        "confirm_at": t["confirm_at"], "confirm_by": t["confirm_by"],
        "official_app_id": t["official_app_id"],
        "share_expire": t["share_expire"],
        "shared": bool(t["share_token"] and (t["share_expire"] or "") > now()),
    }


def fullver_of_order(c, o):
    """这张订单该用哪份送签材料清单版本：供应商产品上的优先，没有再退回平台产品的。
    表模板由清单版本引用（产品 → 清单版本 → 表模板），所以判断「有没有在线申请表」
    也必须从这里出发，不能拿国家去猜（2026-09-09 唐美芳纠正的那条链）。"""
    if not o:
        return None
    sp = one(c, "select fullver_id from sup_product where id=?", (o["sup_product_id"],))
    if sp and sp["fullver_id"]:
        return sp["fullver_id"]
    pr = one(c, "select fullver_id from product where id=?", (o["product_id"],))
    return (pr or {}).get("fullver_id")


def wo_view(c, w, desensitize=False, memo=None):
    """把一张工单摊成列表/详情要用的那一坨字段。

    `memo` 是**请求级只读缓存**，列表接口传一个 dict 进来，同一次请求里
    订单 / 产品 / 套餐 / 账号 / 组织这些维表只查一次。
    原来 298 张工单每张都要重查一遍，`/sup/orders` 单次 1.7–3.2 秒，
    页面在高负载时干脆渲染不出来（2026-09-10 scan 报「几乎空白」查到这儿）。
    只缓存**只读维表**；办签人、材料、补料单、填表任务每张工单各不相同，照旧直查。
    单条调用不传 memo，行为与从前完全一致。
    """
    memo = {} if memo is None else memo

    def m1(key, sql, args):
        k = (key, args)
        if k not in memo:
            memo[k] = one(c, sql, args)
        return memo[k]

    a = one(c, "select * from applicant where id=?", (w["applicant_id"],))
    o = m1("ord", "select * from ord where id=?", (w["ord_id"],))
    p = m1("prod", "select * from product where id=?", (o["product_id"],))
    owner = m1("user", "select name from user where id=?", (w["owner_user"],)) or {}
    st = mat_stat(c, a["id"])
    supp = one(c, "select * from supp where applicant_id=? and status='open'", (a["id"],))
    d = {
        "no": w["no"], "wo_id": w["id"], "status": w["status"], "hold_reason": w["hold_reason"],
        "sla_due": w["sla_due"], "created_at": w["created_at"],
        "owner": owner.get("name"), "applicant_id": a["id"],
        "name": mask_name(a["name_cn"]) if desensitize else a["name_cn"],
        "phone": "" if desensitize else a["phone"],
        "crowd": CROWD.get(a["crowd"], a["crowd"]), "progress": a["progress"],
        "progress_text": PNAME.get(a["progress"], a["progress"]),
        # 通用三态：供应商侧只按这一档展示与操作，六步细节留给众信自己的工单台
        "stage": gstage(a["progress"]), "stage_text": GNAME.get(gstage(a["progress"]), ""),
        "visa_result": a["visa_result"], "result_text": RESULT.get(a["visa_result"], ""),
        "liability": a["liability"], "liability_text": LIABILITY.get(a["liability"], ""),
        # 供应商：UOM 侧的办理中心要能看出这张单派给了谁
        # （唐美芳 2026-09-04：「uom 里应该也能看到这个签证办理中心，供应商处理的进度，
        # 所以 uom 系统也需要保留这个模块，但是需要加入供应商字段」）
        "sup_org": w["sup_org"],
        "supplier": (m1("org", "select short from org where id=?", (w["sup_org"],)) or {}).get("short")
        if w["sup_org"] else "",
        # 供应商公司内部谁在办这一单（2026-09-09 加，UBK 侧的「改派」指派的就是他）。
        # 与 owner（众信侧承办专员）是两个人：一单两边各有一个负责人。
        "sup_owner": w["sup_owner"] if "sup_owner" in w.keys() else None,
        "sup_owner_name": (m1("user", "select name from user where id=?",
                               (w["sup_owner"],)) or {}).get("name")
        if ("sup_owner" in w.keys() and w["sup_owner"]) else "",
        "ord_no": o["no"], "ord_id": o["id"], "channel": o["channel"],
        # 套餐名：列表把「订单号」和「签证产品」拆成两列之后，产品那一列
        # 下面要带出买的是哪个套餐（2026-09-09）。原来只有 /sup/orders 单独拼过。
        "pkg_name": (m1("pkg", "select name from pkg where id=?", (o["pkg_id"],)) or {}).get("name"),
        "product": p["name"] if p else "", "country": p["country"] if p else "",
        # 国家 / 洲 / 签证类型：工单台列表要按这三样归类与筛选
        "continent": continent_of(p["country"]) if p else "",
        "visa_type": p["visa_type"] if p else "",
        "visa_cat": (p["visa_cat"] or "") if p else "",
        "submit_city": p["submit_city"] if p else "",
        "need_interview": p["need_interview"] if p else 0,
        "need_fingerprint": p["need_fingerprint"] if p else 0,
        # 官网受理号的叫法按国家给：美国 Application ID、澳洲 TRN、申根 VFS 受理号。
        # 前端照这个渲染标签，专员看到的就是他在官网上真实看到的那个词。
        "official_id_name": official_id_name(p["country"] if p else ""),
        # 预约的三个前置条件，前端据此在「待预约」这一步提示还差什么
        "appt_ready": {"app_id": bool(a["app_id"]), "fee": bool(a["cgi_receipt"]),
                       "passport": bool(a["id_no"])},
        # 办理进展三件套：官网受理号 / 缴费收据 / 面签预约。2026-09-09 起供应商
        # 也能回传，所以列表和弹窗都要读得到当前值（原来只有 UOM 的工单详情在用）。
        "app_id": a["app_id"], "cgi_receipt": a["cgi_receipt"],
        "appt_no": a["appt_no"], "appt_at": a["appt_at"], "appt_place": a["appt_place"],
        "mat": st, "supp_no": supp["no"] if supp else None,
        # 填表任务进度：办理中心的「代填申请表」按钮上要显示还差几题
        # （2026-09-08 权限下放给供应商后才需要）
        "form": (lambda t: {"task_id": t["id"], "ask_left": form_task.stat(c, t)["ask_left"],
                            "status": t["status"]} if t else None)(
            one(c, "select * from form_task where applicant_id=?", (a["id"],))),
        # 这个国家到底有没有「在线申请表」这一层。没有的（日本、泰国这类递交纸质表，
        # 或者模板还在草稿没发布）压根建不出填表任务，前端就不该摆「填申请表」按钮——
        # 摆了点下去只会弹「该产品所属国家还没有已发布的官方表单模板，无法建表」
        # （唐美芳 2026-09-09：「为什么点击填申请表提示 VS-26090400 程雨桐，
        # 提示模板不存在呢，可是下单关联的产品都有清单啊，是不是哪里逻辑不对」——
        # 她说的「清单」是送签材料清单，跟官方申请表模板是两样东西，这一层要在界面上分清）。
        # 这一项要顺着「产品 → 清单版本 → 表模板」查三张表，而结果只取决于
        # (product_id, fullver_id)——同一产品的一批工单答案完全相同，按这个键缓存。
        "form_avail": (lambda k: memo.setdefault(
            k, bool(form_task.pick_formver(c, p, fullver_of_order(c, o)))))(
            ("form_avail", o["product_id"], o["sup_product_id"])),
        "supp_due": supp["due_at"] if supp else None,
        "appt_no": a["appt_no"], "appt_at": a["appt_at"], "app_id": a["app_id"],
        "cgi_receipt": a["cgi_receipt"], "batch_id": a["batch_id"], "ap_due": a["ap_due"],
    }
    if w["sla_due"]:
        d["overdue"] = w["sla_due"] < now() and a["progress"] != "P6"
    return aud(d, w)


# ============================ API ============================

# 表模板里「来源载体」→ 材料清单项的对应关系。
# 唐美芳 2026-09-01：「我已经建了evus的签证表模板，但是新建国家送签材料库后，
# 怎么没有把材料清单里的字段自动带出来呢，还得二次手动新建材料项」。
#
# 这个因果本来就写在页面的操作说明里——标注为「证件识别」的字段，其来源载体
# （护照资料页 / 身份证 / 在职证明…）就是客户必须交的件。说明写了，功能却没做，
# 等于让运营照着说明手抄一遍。这里按来源载体去重，自动生成材料项草稿。
#
# 只带得出「填表要用的证件」这一类。使领馆单独要看的件（资金证明、行程单、
# 酒店与机票预订单）跟表单字段没有对应关系，系统推不出来，仍需人工补——
# 操作说明第 3 步已经写明这一点。
# 表模板里「这一格从哪张证件识别出来」→ 平台清单里的**标准材料名**。
# ⚠️ 名字必须与平台清单里已有的材料一字不差，否则「按表模板补带材料项」会建出一条
# 内容相同、名字不同的材料，跟已有那条并排摆着。
# 2026-09-09 唐美芳问「材料库 14 项跟表模板对不上」时查出来的：
# 「身份证 / 户口本」原来映射成「身份证与户口本复印件」，而平台清单里是
# 「身份证正反面复印件」＋「户口本整本复印件」两条，一补就重。
# 一个载体可以对应多条材料，所以值统一写成**列表**。
CARRIER_MAT = {
    "护照资料页": [("护照", "origin", ["mail"], 1, "must",
                    "有效期需超过预计离境日期 6 个月以上；含所有旧护照及签证页")],
    "护照签证页与出入境章": [("护照签证页与出入境记录", "copy", ["mail", "upload"], 1, "suggest",
                              "近 5 年出入境章与有效签证页，用于佐证出行史")],
    "身份证": [("身份证正反面复印件", "copy", ["upload"], 1, "must",
                "复印在同一张 A4 纸正面，需清晰可辨")],
    "身份证 / 户口本": [
        ("身份证正反面复印件", "copy", ["upload"], 1, "must",
         "复印在同一张 A4 纸正面，需清晰可辨"),
        ("户口本整本复印件", "copy", ["upload"], 1, "must",
         "含户主页、本人页；集体户提供户籍证明"),
    ],
    "在职证明": [("在职证明", "origin", ["mail", "upload"], 1, "must",
                  "公司抬头纸打印，注明职位、入职时间、年薪、准假期限，加盖公章并留负责人签字与联系方式")],
    "户口本": [("户口本整本复印件", "copy", ["upload"], 1, "must",
                "含户主页、本人页；集体户提供户籍证明")],
}
# 所有人群都要交（材料清单按人群裁剪是下一层的事，这里给全集，运营再按需收窄）
ALL_CROWD = ["job", "free", "student", "retire", "child"]


def items_from_formver(c, fvid, fullver_id, start_sort=0):
    """按表模板里 src='ocr' 的字段的来源载体，生成材料项。返回新增条数。"""
    if not fvid:
        return 0
    fv = one(c, "select country from fullver where id=?", (fullver_id,))
    fv_country = (fv or {}).get("country") or ""
    carriers = []
    for r in rows(c, "select distinct src_from from form_field where formver_id=? and src='ocr'"
                     " and ifnull(src_from,'')<>'' order by src_from", (fvid,)):
        carriers.append(r["src_from"])
    have = {r["mat_name"] for r in rows(
        c, "select mat_name from fullver_item where fullver_id=?", (fullver_id,))}
    n, sort = 0, start_sort
    for car in carriers:
        ms = CARRIER_MAT.get(car)
        if not ms:
            # 没配过对应关系的载体，仍然带出来占位，名字直接用载体名，
            # 让运营看得见「这一项是表单需要的」，而不是被静默丢掉
            ms = [(car, "copy", ["upload"], 1, "must",
                   "由「%s」自动带出，请补充具体要求" % car)]
        for name, attr, way, copies, nec, req in ms:
            if name in have:
                continue
            # 材料样例库里有同名范本就顺手挂上。
            # 2026-09-07 样例带了适用国家后，同名范本可能有多条（通用一条 + 各国专用），
            # 按本清单的国家优先取专用，取不到再退到通用；
            # 否则日签清单会挂上美签的照片规格图。
            cands = rows(c, "select id,countries from sample_tpl where mat_name=? order by id",
                         (name,))
            tpl = next((x for x in cands if fv_country in jl(x["countries"], [])), None) \
                or next((x for x in cands if not jl(x["countries"], [])), None)
            sort += 1
            c.execute("insert into fullver_item(fullver_id,mat_name,attr,provide_way,copies,"
                      "necessity,require_text,sample_tpl_id,files,crowds,sort)"
                      " values(?,?,?,?,?,?,?,?,'[]',?,?)",
                      (fullver_id, name, attr, json.dumps(way), copies, nec, req,
                       (tpl or {}).get("id"), json.dumps(ALL_CROWD), sort))
            have.add(name)
            n += 1
    return n


def api(path, q, body, user, c):
    # UOM 运营平台内部是「一套系统四种身份」：平台配置 / 专员 / 主管 / 财务。
    # 平台配置管理员（ops）是这套系统的超级管理员，拥有另外三个身份的全部权限。
    # 但不越界到 csp / ubk / customer —— 那是另外三个独立系统，各自有自己的数据边界。
    # 唐美芳 2026-08-31：「UOM 管理员应该是全部权限啊，你得把全部角色的菜单权限和操作按钮都放出来」。
    UOM_ROLES = ("uom", "lead", "fin", "ops")

    def need(*roles):
        if not user:
            raise Err("未登录", 401)
        if roles and user["role"] not in roles:
            if user["role"] == "ops" and set(roles) & set(UOM_ROLES):
                return
            raise Err("无权访问：%s" % user["role"], 403)

    def arg(k, req=True, d=None):
        v = body.get(k, q.get(k, [d])[0] if k in q else d)
        if req and (v is None or v == ""):
            raise Err("缺少参数 " + k)
        return v

    # ---------- 通用 ----------
    if path == "/login":
        u = one(c, "select * from user where login=? and pwd=?",
                (body.get("login"), body.get("pwd")))
        if not u:
            raise Err("账号或密码错误", 401)
        t = uuid.uuid4().hex
        TOKENS[t] = u["id"]
        org = one(c, "select * from org where id=?", (u["org_id"],)) or {}
        return {"token": t, "user": {"id": u["id"], "name": u["name"], "role": u["role"],
                                     "login": u["login"], "org": org.get("name"),
                                     "org_id": u["org_id"]}}

    if path == "/me":
        need()
        org = one(c, "select * from org where id=?", (user["org_id"],)) or {}
        return {"user": {"id": user["id"], "name": user["name"], "role": user["role"],
                         "org": org.get("name"), "org_id": user["org_id"]}}

    if path == "/dict":
        return {"progress": PROGRESS, "crowd": CROWD, "way": WAY, "attr": ATTR,
                "necessity": NEC, "ord_status": ORD_STATUS, "liability": LIABILITY,
                "result": RESULT, "reject_cate": REJECT_CATE,
                "countries": [r["country"] for r in rows(
                    c, "select distinct country from product where status='published'")]}

    # ---------- C1 客户 / C2 门店销售：选品 ----------
    if path == "/shop/products":
        country = q.get("country", [None])[0]
        sql = "select * from product where status='published'"
        args = []
        if country:
            sql += " and country=?"
            args.append(country)
        # 上架范围：客户端只看勾了「上架 C 端」且过了 C 端审核的；CSP 本身就是渠道，看 B 端那一套
        track = "c" if (user or {}).get("role") == "customer" else "b"
        scope = "to_" + track
        out = []
        for p in rows(c, sql, args):
            sups = []
            # 只有「供应商已上架 + 这一端运营审核通过」的产品才对外可售
            for sp in rows(c, "select * from sup_product where product_id=? and status='published'"
                              " and review_{0}='approved' and to_{0}=1".format(track), (p["id"],)):
                pks = rows(c, "select * from pkg where sup_product_id=?"
                              " and ifnull(status,'on')='on' order by settle_price",
                           (sp["id"],))
                if not pks:
                    continue
                org = one(c, "select * from org where id=?", (sp["org_id"],))
                sups.append({"sup_product_id": sp["id"], "name": sp["name"],
                             "hero_img": sp["hero_img"] or "",
                             "feature": sp["feature"], "supplier": org["short"],
                             "price_min": min(k["suggest_retail"] for k in pks),
                             "price_max": max(k["suggest_retail"] for k in pks),
                             "lead_min": min(k["lead_days"] for k in pks),
                             "pkg_count": len(pks),
                             # 套餐随列表一起下发（唐美芳 2026-09-07）。
                             # 原来列表只给 price_min 与 lead_min，这两个数常常来自不同套餐：
                             # 「¥1,980 起 · 最快 7 个工作日」——1,980 那档要 15 天，
                             # 7 天那档要 2,480，客人按哪个点进来都对不上。
                             # 价格与时效必须成对给出，所以把套餐摆到列表卡上。
                             "pkgs": [{"id": k["id"], "name": k["name"],
                                       "lead_days": k["lead_days"],
                                       "retail": k["suggest_retail"],
                                       "refund_insured": k["refund_insured"],
                                       # 结算价与毛利只给 B 端渠道，客户端看不到
                                       "margin": (k["suggest_retail"] - k["settle_price"]
                                                  if scope == "to_b" else None)}
                                      for k in sorted(pks, key=lambda x: x["suggest_retail"])],
                             "svc": svc_list(sp, p, pks),
                             # 上架时间与毛利只给 B 端渠道：门店销售的「新品抢先」「利润拔尖」
                             # 要按真实数据排，客户端看不到也不需要看结算价差
                             "listed_at": sp["updated_at"],
                             "margin": (max(k["suggest_retail"] - k["settle_price"] for k in pks)
                                        if scope == "to_b" else None),
                             })
            if sups:
                out.append({"product_id": p["id"], "name": p["name"], "country": p["country"],
                            "visa_type": p["visa_type"], "visa_cat": p["visa_cat"] or "",
                            "submit_city": p["submit_city"],
                            "entries": p["entries"], "stay_days": p["stay_days"],
                            "stay_text": stay_text(p),
                            "valid": valid_text(p),
                            "need_interview": p["need_interview"],
                            "need_fingerprint": p["need_fingerprint"],
                            "accept_note": p["accept_note"], "suppliers": sups})
        return {"list": out}

    if path == "/shop/product":
        sp = one(c, "select * from sup_product where id=?", (arg("id"),))
        if not sp:
            raise Err("产品不存在", 404)
        p = one(c, "select * from product where id=?", (sp["product_id"],))
        org = one(c, "select * from org where id=?", (sp["org_id"],))
        addr = one(c, "select * from addr where id=?", (sp["addr_id"],))
        fvid = sp["fullver_id"] or p["fullver_id"]
        fv = one(c, "select * from fullver where id=?", (fvid,)) if fvid else None
        # 停售的套餐不下发给客人侧——挂出来客人选了也下不了单
        # （唐美芳 2026-09-03：套餐可单独起售停售）
        pks = rows(c, "select * from pkg where sup_product_id=? and ifnull(status,'on')='on'"
                      " order by settle_price", (sp["id"],))
        return {
            "sup_product_id": sp["id"], "name": sp["name"], "feature": sp["feature"],
            # 供应商自己传的头图；为空由前端回落到该国家的默认风景图
            "hero_img": sp["hero_img"] or "",
            # 这条产品此刻在哪一端可售。前端拿它把「未上架」拦在下单页门口——
            # 光靠 /order/create 兜底的话，销售是填完整张表才被告知不能下单。（2026-08-27）
            "on_b": sup_on(sp, "b"), "on_c": sup_on(sp, "c"),
            "supplier": org["short"], "product": p,
            "accept_provinces": jl(p["accept_provinces"]),
            "svc": svc_list(sp, p, pks),
            # 供应商自配的办理流程；为空时前端回落到平台默认 5 步
            # 办理流程三级回落：产品自配 → 该国默认 → 平台默认。
            # 原来产品没配时前端拿写死的 5 步兜底，运营改不了
            # （唐美芳 2026-09-01：默认流程也统一放进运营配置）。
            "flow": flow_of(c, sp, p),
            "packages": pks,
            "fullver": fv,
            # 提供方式按本产品是否需要面签分流：免面签要寄护照原件，需面签是本人携带
            "checklist": {k: checklist_for(c, fvid, k, sp, p["need_interview"])
                          for k in CROWD} if fvid else {},
            "mail_addr": ("%s %s（%s %s）" % (addr["region"], addr["detail"],
                                             addr["contact"], addr["phone"])) if addr else None,
        }

    # ---------- C1 客户：下单 → 支付 → 交材料 ----------
    if path == "/order/create":
        need("customer", "csp")
        sp = one(c, "select * from sup_product where id=?", (arg("sup_product_id"),))
        pk = one(c, "select * from pkg where id=?", (arg("pkg_id"),))
        # 停售的套餐挡在这儿：页面缓存旧数据、或者直接调接口都下不了单
        if pk and (pk["status"] or "on") == "off":
            raise Err("该套餐已停售，请选择其他套餐；如页面仍显示该套餐，请刷新后重试")
        if not sp or not pk or pk["sup_product_id"] != sp["id"]:
            raise Err("产品或套餐无效")
        # 下单渠道决定看哪一端的审核：客户走 C 端，门店/同业走 B 端
        track = "c" if user["role"] == "customer" else "b"
        if not sup_on(sp, track):
            raise Err("该产品未在%s上架或未通过%s审核，不能下单"
                      % (("客户端", "C 端") if track == "c" else ("门店渠道", "B 端")))
        pax = body.get("applicants") or []
        # 「下单后再填写办签人资料」：只报人数，先把单占住，资料在 INFO_HOURS 小时内补
        # （唐美芳 2026-09-01：「办签人信息加个开关，可以预订下单后再填写，
        # 因为订单有不填写资料就会自动取消订单，所以这块不用担心」）。
        # 生成占位办签人，info_done=0——付款前必须补齐，逾期整单自动取消，两道闸都在。
        later = int(body.get("pax_later") or 0)
        if later and not pax:
            if later < 1 or later > 9:
                raise Err("办签人数需在 1–9 人之间")
            pax = [{"name_cn": "待补充 %d" % (i + 1), "crowd": "job"} for i in range(later)]
        if not pax:
            raise Err("请至少选择一位办签人，或选择「下单后再填写」并填写人数")
        p = one(c, "select * from product where id=?", (sp["product_id"],))
        channel = "C" if user["role"] == "customer" else (
            "CSP" if (one(c, "select kind from org where id=?", (user["org_id"],)) or {}
                      ).get("kind") == "store" else "B")
        retail = pk["suggest_retail"]
        if channel != "C":
            deal = float(body.get("deal_price") or retail)
            if deal < pk["settle_price"]:
                raise Err("成交价 %.0f 低于结算价 %.0f，不可下单" % (deal, pk["settle_price"]))
            if deal > retail * 1.5:
                raise Err("成交价超出建议零售价 150%%（上限 %.0f）" % (retail * 1.5))
            retail = deal
        no = nextno(c, "VS")
        # 直客单也要有归属：C 端客人注册时绑定了一位门店销售（user.owner_user），
        # 这张单就挂在他和他门店名下，CSP / 有米才看得到，几个端才是一套数据
        # （唐美芳 2026-09-02：「C 端小程序这个账号，也帮我默认绑定到这个有米和 csp
        #  账号名下，这样下的单，几个端都能统一看见了」）。
        # 注意 channel 仍是 'C'：渠道说的是这单从哪来，归属说的是算谁的业绩，
        # 两件事不能混，否则直客成交会被统计成门店成交。
        own = one(c, "select * from user where id=?", (user["owner_user"],)) \
            if channel == "C" and user["owner_user"] else None
        oorg = user["org_id"] if channel != "C" else (own["org_id"] if own else None)
        oagent = user["id"] if channel != "C" else (own["id"] if own else None)
        # 出行日期必填（唐美芳 2026-09-08：「订单列表中的出行日期不可能为空的啊」）。
        # 它决定倒排办理进度与时效风险提示，没有它这一单在工单台上排不了优先级。
        # 三端下单页本来就有前端校验，这里补上接口层，防止绕过前端或老调用写进空值。
        depart = (body.get("depart_date") or "").strip()
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", depart):
            raise Err("请填写预计出行日期")
        cur = c.execute(
            # product_name 是成交那一刻的产品名快照。2026-09-04 放开了「签证名称、
            # 名称后缀随时可改」，不存快照的话，供应商今天改个名，三个月前那张订单
            # 在列表、对账单、合同上显示的就是新名字，跟客人手里的合同对不上。
            "insert into ord(no,channel,org_id,buyer_user,agent_user,product_id,sup_product_id,"
            "pkg_id,pax,amount,settle_amount,status,depart_date,contact_name,contact_phone,"
            "contact_email,recv_addr_id,settle_entity,invoice_entity,created_at,info_deadline,"
            "product_name)"
            " values(?,?,?,?,?,?,?,?,?,?,?,'created',?,?,?,?,?,?,?,?,?,?)",
            (no, channel, oorg, user["id"],
             oagent, sp["product_id"], sp["id"], pk["id"],
             len(pax), retail * len(pax), pk["settle_price"] * len(pax),
             depart, body.get("contact_name") or user["name"],
             body.get("contact_phone") or user["phone"], body.get("contact_email"),
             body.get("recv_addr_id"), body.get("settle_entity") or "众信旅游集团",
             body.get("invoice_entity") or "众信旅游集团", now(),
             now(hours=INFO_HOURS), sp["name"]))
        oid = cur.lastrowid
        fvid = sp["fullver_id"] or p["fullver_id"]
        for a in pax:
            ac = c.execute(
                "insert into applicant(ord_id,name_cn,name_en,sex,birth,id_type,id_no,id_expiry,"
                "id_place,phone,crowd,consulate_region) values(?,?,?,?,?,?,?,?,?,?,?,?)",
                (oid, a.get("name_cn"), a.get("name_en"), a.get("sex"), a.get("birth"),
                 a.get("id_type") or "护照", a.get("id_no"), a.get("id_expiry"),
                 a.get("id_place"), a.get("phone"), a.get("crowd") or "job",
                 p["submit_city"].replace("送签", "领区")))
            aid = ac.lastrowid
            # 下单就把填表任务建出来，不再等有人打开填表中心才惰性补建——
            # 销售在订单详情里要能立刻看到「官方申请表」这一行并发给客人
            # （唐美芳 2026-09-01：「在有米小程序的订单详情里也应该有这样 1 个按钮，
            # 发给客人填写。也可以帮客人填」）。
            try:
                a0 = one(c, "select * from applicant where id=?", (aid,))
                t0 = form_task.ensure_task(c, a0)
                # 下单时填齐的资料直接带进官方申请表，销售/客人打开就有一半是填好的
                if t0:
                    form_task.prefill(c, t0, a0, by_name="系统预填（下单时）")
            except Exception:
                pass   # 该国家还没建表模板时不影响下单，填表中心那边仍会惰性补建
            # 下单时资料就填齐的（从档案里选出来的人多半是齐的），直接标已录入，
            # 免得客人再进一次「录入客人签证资料」按一遍保存
            if not [1 for k, _ in INFO_REQUIRED if not (a.get(k) or "")]:
                c.execute("update applicant set info_done=1,info_at=? where id=?", (now(), aid))
            # 带上 sp：这一单的材料快照要包含供应商自己定制过的那部分
            # 下单即写快照：提供方式也按本产品的面签属性定死，之后产品改了不影响这一单
            for it in (checklist_for(c, fvid, a.get("crowd") or "job", sp, p["need_interview"])
                       if fvid else []):
                c.execute(
                    "insert into mat(applicant_id,item_id,mat_name,attr,provide_way,copies,"
                    "necessity,require_text,status,updated_at) values(?,?,?,?,?,?,?,?,'wait',?)",
                    # 供应商追加项的 id 是负数（不对应 fullver_item 行），存 0 表示「无来源行」
                    (aid, max(it["id"], 0), it["mat_name"], it["attr"],
                     json.dumps(it["provide_way"]),
                     it["copies"], it["necessity"], it["require_text"], now()))
            # 下单即生成待填的官方表：表单版本在此刻快照，之后官网改版不影响这一单
            form_task.ensure_task(c, one(c, "select * from applicant where id=?", (aid,)), p)
        log(c, "ord", oid, oid, user, "创建订单", "%s，%d 人，%.0f 元" % (no, len(pax), retail * len(pax)))
        # 全部办签人的资料都齐了，订单直接进「资料已录入」，可以马上收款
        if not c.execute("select count(*) from applicant where ord_id=? and info_done=0",
                         (oid,)).fetchone()[0]:
            c.execute("update ord set info_done_at=? where id=?", (now(), oid))

        # 下单即按办签人生成签证工单，直接进「待收料」——不再等财务确认收款
        # （唐美芳 2026-09-02：「正常流程应该是，下单后，默认就会根据办签人流转到待收料里」）。
        # 收料、审材料、填表这几步与钱无关；支付状态在「提交至官网」那一步才校验。
        wos = open_wo(c, oid, user)

        return {"no": no, "ord_id": oid, "amount": retail * len(pax), "wo": wos}

    if path == "/order/pay":
        need("customer", "csp")
        o = one(c, "select * from ord where no=?", (arg("no"),))
        if not o or o["status"] != "created":
            raise Err("订单状态不允许支付")
        # 资料没录齐原来是**硬拦**在付款之前的，结果 CSP / 有米下完单一律付不了款，
        # 验收在「待付款」这一步就断了（唐美芳 2026-09-02：「现在订单上到待付款
        # 这里无法支付，流程走不下去了」）。改成不拦，只提醒，理由有三条：
        #   1. 她 2026-09-01 定过口径——「办签人信息加个开关，可以预订下单后再填写，
        #      因为订单有不填写资料就会自动取消订单，所以这块不用担心」；
        #   2. 未付款单的兜底已经在 info_sweep 里：超时未录资料自动取消，
        #      而 info_sweep 明确跳过任何有收款记录的单，收了钱的不会被清掉；
        #   3. 付了款、资料没齐的单，工单停在 P1「待收材料」——那本来就是专员
        #      催收材料的正常状态，不是异常，没有必要在收款口再拦一道。
        info_sweep(c, [o["id"]])
        o = one(c, "select * from ord where id=?", (o["id"],))
        if o["status"] != "created":
            raise Err("订单已因超时未录入客人签证资料被自动取消")
        miss = rows(c, "select name_cn from applicant where ord_id=? and state='normal'"
                       " and info_done=0", (o["id"],)) if not o["info_done_at"] else []

        # 收款单的渠道 / 方式按下单端给默认值，与财务侧历史单据同一套口径
        # （门店走钱包资金池、直客走第三方支付、同业走对公银行）。
        # 原来只写 method='对公转账'，收款单号、收款渠道、付款人全是空的，
        # 财务点进收款单详情看到一排「—」，下一步同样走不下去。
        cate, chan, method = {
            "CSP": ("门店钱包", "资金池", "余额支付"),
            "C": ("第三方支付", "易宝支付", "微信"),
            "B": ("银行", "中信银行北京瑞城中心支行", "汇款"),
        }.get(o["channel"], ("银行", "中信银行北京瑞城中心支行", "汇款"))
        cate = body.get("cate") or cate
        chan = body.get("channel_name") or chan
        method = body.get("method") or method
        today = now()[:10]
        cur = c.execute(
            "insert into pay(ord_id,kind,amount,method,cate,channel_name,cust_type,item,"
            "arrive_amount,fee,payer_name,pay_date,arrive_date,audit_status,acct_type,"
            "trade_no,created_at)"
            " values(?,'in',?,?,?,?,?,'团款',?,0,?,?,?,'wait',?,?,?)",
            (o["id"], o["amount"], method, cate, chan,
             "同业客户" if o["channel"] == "B" else "个人客户",
             o["amount"], body.get("payer_name") or o["contact_name"] or "—",
             today, today, "对公" if o["channel"] == "B" else "个人",
             body.get("trade_no") or ("TR" + uuid.uuid4().hex[:12].upper()), now()))
        pid = cur.lastrowid
        c.execute("update pay set no=? where id=?",
                  ("S%s%04d" % (today.replace("-", "")[2:], pid), pid))
        c.execute("update ord set status='paid' where id=?", (o["id"],))
        log(c, "ord", o["id"], o["id"], user, "客户支付",
            "%.0f 元（%s · %s），待财务确认到账" % (o["amount"], cate, method))
        # 工单在下单时就已生成并开始收料，这里不再说「待财务确认才派单」
        msg = "支付成功。工单已在办理中，财务确认收款到账后对供应商挂应付"
        if miss:
            msg += "。客人签证资料尚未录齐（%s），请在送签前补齐" % (
                "、".join(x["name_cn"] or "未具名" for x in miss))
        return {"ok": True, "msg": msg, "info_miss": len(miss)}

    if path == "/order/info":
        # 「录入客人签证资料」的读取端：把这一单每位办签人的资料与录入状态给出来。
        # 对应 CSP 旅游订单上的「录入客人资料」按钮，签证订单同样放在收款之前。
        need("customer", "csp", "uom", "lead", "ops")
        o = one(c, "select * from ord where no=?", (arg("no"),))
        if not o:
            raise Err("订单不存在", 404)
        if user["role"] == "customer" and o["buyer_user"] != user["id"]:
            raise Err("无权查看该订单", 403)
        if user["role"] == "csp" and o["agent_user"] != user["id"] \
                and o["org_id"] != user["org_id"]:
            raise Err("无权查看该订单", 403)
        info_sweep(c, [o["id"]])
        o = one(c, "select * from ord where id=?", (o["id"],))
        st, st_text = info_state(o)
        pr0 = one(c, "select * from product where id=?", (o["product_id"],))
        aps = []
        for a in rows(c, "select * from applicant where ord_id=? and state='normal' order by id",
                      (o["id"],)):
            d = dict(a)
            d["crowd_text"] = CROWD.get(a["crowd"], a["crowd"])
            d["missing"] = [lb for k, lb in INFO_REQUIRED if not (a[k] or "")]
            # 老订单是在「下单即建填表任务」之前下的，这里补建一次，
            # 否则这些单子在资料页上看不到官方申请表那一行
            try:
                form_task.ensure_task(c, a)
            except Exception:
                pass
            # 官方申请表（DS-160 这类）的进度与分享状态：
            # 「录入客人签证资料」是送签前的基础信息，官方申请表是几十格的正式表单，
            # 两件事在同一页给出入口，销售不用去别处找
            t2 = one(c, "select * from form_task where applicant_id=?", (a["id"],))
            if t2:
                st2 = form_task.stat(c, t2)
                d["form"] = {"task_id": t2["id"], "status": t2["status"],
                             "status_text": form_task.STATUS.get(t2["status"], t2["status"]),
                             "filled": st2["filled"], "fillable": st2["fillable"],
                             "ask_left": st2["ask_left"],
                             "shared": bool(t2["share_token"] and
                                            (t2["share_expire"] or "") > now()),
                             "share_expire": t2["share_expire"] or ""}
            else:
                # 该国家还没有已发布的官方表模板（比如日本这条线，模板还在草稿）。
                # 这时候页面上要说清楚「为什么没有填表这一步」，而不是什么都不显示——
                # 空着看起来就像流程断了（唐美芳 2026-09-01：「流程卡住没了」）。
                d["form"] = None
                d["form_note"] = "%s尚无已发布的官方申请表模板，本单暂不需要在线填表；" \
                                 "如需启用，请运营在 UOM「国家签证表模板」中发布对应版本。" \
                                 % ((pr0["country"] + "「" + (pr0["visa_type"] or "") + "」")
                                    if pr0 else "该国家")
            aps.append(d)
        ra = one(c, "select * from addr where id=?", (o["recv_addr_id"],)) if o["recv_addr_id"] else None
        return {"no": o["no"], "status": o["status"],
                "status_text": ORD_STATUS.get(o["status"], o["status"]),
                # 收货地址（护照原件寄回）与资料录入放在同一页操作
                "recv_addr": (dict(ra) if ra else None),
                "info_state": st, "info_state_text": st_text,
                "deadline": o["info_deadline"] or "", "left_text": info_left_text(o),
                "done_at": o["info_done_at"] or "", "hours": INFO_HOURS,
                "applicants": aps,
                "crowds": [{"v": k, "t": v} for k, v in CROWD.items()],
                "required": [{"k": k, "t": lb} for k, lb in INFO_REQUIRED]}

    if path == "/order/recv_addr":
        # 订单的收货地址（护照原件寄回哪儿）。跟「录入客人签证资料」放在一处操作
        # （唐美芳 2026-09-01：「填写订单的收货人地址信息，是不是可以和录入资料放到一起呢」）——
        # 两件事都是「送签前要补齐的东西」，分在两个页面客人会漏掉一个。
        need("customer", "csp", "uom", "lead", "ops")
        o = one(c, "select * from ord where no=?", (body.get("no"),))
        if not o:
            raise Err("订单不存在", 404)
        if user["role"] == "customer" and o["buyer_user"] != user["id"]:
            raise Err("无权修改该订单", 403)
        if user["role"] == "csp" and o["agent_user"] != user["id"] \
                and o["org_id"] != user["org_id"]:
            raise Err("无权修改该订单", 403)
        if o["status"] in ("cancelled", "refunded"):
            raise Err("订单已%s，不能再修改收货地址" % ORD_STATUS.get(o["status"], o["status"]))
        for k in ("contact", "phone", "region", "detail"):
            if not (body.get(k) or "").strip():
                raise Err("收货人、联系电话、所在地区、详细地址都要填写")
        aid = int(body.get("addr_id") or 0)
        a = one(c, "select * from addr where id=? and owner_kind='user' and owner_id=?",
                (aid, o["buyer_user"])) if aid else None
        if a:
            c.execute("update addr set contact=?,phone=?,region=?,detail=? where id=?",
                      (body["contact"], body["phone"], body["region"], body["detail"], a["id"]))
            rid = a["id"]
        else:
            cur2 = c.execute("insert into addr(owner_kind,owner_id,region,detail,contact,phone,"
                             "is_default) values('user',?,?,?,?,?,0)",
                             (o["buyer_user"], body["region"], body["detail"],
                              body["contact"], body["phone"]))
            rid = cur2.lastrowid
        c.execute("update ord set recv_addr_id=?,updated_at=? where id=?", (rid, now(), o["id"]))
        log(c, "ord", o["id"], o["id"], user, "维护收货地址",
            "%s %s（%s %s）" % (body["region"], body["detail"], body["contact"], body["phone"]))
        return {"ok": True, "addr_id": rid, "msg": "收货地址已保存"}

    if path == "/order/info/save":
        # 保存某一位办签人的完整签证资料。全员录齐时把订单标成「资料已录入」，
        # 这一步之后才允许付款。
        # 客人、销售、签证人员三方都能填改（唐美芳 2026-09-01：
        # 「相当于客人、销售、签证办理人员都有填写修改入口」）——
        # 原来只放行 customer/csp，专员用平台管理员身份点进来就报「无权访问：ops」。
        need("customer", "csp", "uom", "lead", "ops")
        o = one(c, "select * from ord where no=?", (body.get("no"),))
        if not o:
            raise Err("订单不存在", 404)
        if user["role"] == "customer" and o["buyer_user"] != user["id"]:
            raise Err("无权修改该订单", 403)
        if user["role"] == "csp" and o["agent_user"] != user["id"] \
                and o["org_id"] != user["org_id"]:
            raise Err("无权修改该订单", 403)
        if o["status"] not in ("created", "paid"):
            raise Err("订单已%s，不能再修改客人资料" % ORD_STATUS.get(o["status"], o["status"]))
        a = one(c, "select * from applicant where id=? and ord_id=?",
                (body.get("applicant_id"), o["id"]))
        if not a:
            raise Err("办签人不存在", 404)
        vals, miss = {}, []
        for k, lb in INFO_REQUIRED:
            v = (body.get(k) or "").strip()
            if not v:
                miss.append(lb)
            vals[k] = v
        if miss:
            raise Err("还差：%s" % "、".join(miss))
        if vals["crowd"] not in CROWD:
            raise Err("适用人群取值不正确")
        for k in ("name_en", "sex", "birth", "id_type", "id_expiry", "id_place", "nation"):
            vals[k] = (body.get(k) or a[k] or "").strip()
        c.execute("update applicant set name_cn=?,name_en=?,sex=?,birth=?,id_type=?,id_no=?,"
                  "id_expiry=?,id_place=?,nation=?,phone=?,crowd=?,info_done=1,info_at=?,"
                  "updated_at=? where id=?",
                  (vals["name_cn"], vals["name_en"], vals["sex"], vals["birth"],
                   vals["id_type"] or "护照", vals["id_no"], vals["id_expiry"],
                   vals["id_place"], vals["nation"] or "中国", vals["phone"], vals["crowd"],
                   now(), now(), a["id"]))
        # 刚录进去的姓名 / 拼音 / 证件号 / 生日这些，正是官方申请表要用的东西。
        # 录完顺手预填一次（只补空格，不覆盖已填），销售和客人打开 DS-160
        # 就能看到已经带出来的部分，不用再抄一遍
        # （唐美芳 2026-09-01：「客人或销售手动录入完的信息，是不是应该在 uom 里
        # 填表中心里反显」）。
        try:
            a2 = one(c, "select * from applicant where id=?", (a["id"],))
            t2 = form_task.ensure_task(c, a2)
            if t2 and t2["status"] in ("wait", "filling"):
                form_task.prefill(c, t2, a2, by_name="系统预填（录入客人签证资料后）")
        except Exception:
            pass   # 没有表模板的国家不影响资料录入本身

        left = c.execute("select count(*) from applicant where ord_id=? and state='normal'"
                         " and info_done=0", (o["id"],)).fetchone()[0]
        if not left and not o["info_done_at"]:
            c.execute("update ord set info_done_at=?,updated_at=? where id=?",
                      (now(), now(), o["id"]))
            log(c, "ord", o["id"], o["id"], user, "客人签证资料录入完成",
                "%d 位办签人资料齐备，可以收款" % o["pax"])
        else:
            log(c, "applicant", a["id"], o["id"], user, "录入客人签证资料", vals["name_cn"])
        return {"ok": True, "left": left,
                "msg": "已保存" + ("" if left else "，资料已录齐，可以收款")}

    if path == "/order/cancel":
        need("customer", "csp")
        o = one(c, "select * from ord where no=?", (arg("no"),))
        if not o:
            raise Err("订单不存在")
        # 2026-09-08 唐美芳：「取消订单只能订单未支付前可操作，支付了只能退款了」。
        # 原来「已付款但财务未确认到账」也允许直接取消并原路退回——那笔钱已经进了账，
        # 走「取消」等于绕开退款审批与财务出账，账上对不平。改成只认「一分钱都没收到」。
        if o["status"] != "created":
            raise Err("订单已支付，请提交退款申请")
        paid_any = c.execute("select count(*) from pay where ord_id=? and kind='in'",
                             (o["id"],)).fetchone()[0]
        if paid_any:
            raise Err("该订单已有收款记录，请提交退款申请")
        c.execute("update ord set status='cancelled' where id=?", (o["id"],))
        c.execute("update applicant set state='cancelled' where ord_id=?", (o["id"],))
        log(c, "ord", o["id"], o["id"], user, "取消订单",
            body.get("reason") or "客户主动取消")
        return {"ok": True, "msg": "订单已取消"}

    if path == "/my/orders":
        need("customer", "csp")
        # 惰性清扫：没有常驻定时任务，超时未录资料的单子在这里被自动取消
        info_sweep(c)
        where = "buyer_user=?" if user["role"] == "customer" else "(agent_user=? or org_id=%d)" % (
            user["org_id"] or 0)
        # 每位办签人还欠多少材料 / 有几条补料未处理。C 端「我的材料」按订单分组时要用它
        # 判断哪些单还真需要客人动手（唐美芳 2026-09-02：「我的材料里怎么好多重复数据」）。
        # 一次全表聚合而不是按人查——这个列表动辄几十单上百人，N+1 会把页面拖慢。
        mat_wait_map = dict(c.execute(
            "select applicant_id, count(*) from mat where status in ('wait','reject','rejected')"
            " group by applicant_id").fetchall())
        supp_open_map = dict(c.execute(
            "select applicant_id, count(*) from supp where status='open'"
            " group by applicant_id").fetchall())
        out = []
        for o in rows(c, "select * from ord where " + where + " order by id desc", (user["id"],)):
            sp = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
            pk = one(c, "select * from pkg where id=?", (o["pkg_id"],))
            aps = rows(c, "select * from applicant where ord_id=?", (o["id"],))
            todo = ""
            if o["status"] == "created":
                # 待付款的待办文案分端给，因为两端的目标不一样：
                # C 端以成交为先——不催资料、不显示倒计时，只说「待付款」
                # （唐美芳 2026-09-02：「正常 C 端未支付之前不用强制填写资料，
                #  要以成交为主，先支付啊」「C 端不需要体现待录入客人资料还剩多少小时」）；
                # 销售端（CSP / 有米）反过来要看见资料缺口和剩余时限，那是他们的跟单抓手。
                if o["info_done_at"] or user["role"] == "customer":
                    todo = "待付款"
                else:
                    todo = "待录入客人签证资料" + (
                        "（%s）" % info_left_text(o) if info_left_text(o) else "")
            elif o["status"] == "cancelled":
                todo = ""
            else:
                # 已付款 / 已完成共用一套待办口径。
                # 原来已付款一律写「已付款，待财务确认到账」——那是总部财务核对水单的
                # 内部环节，门店销售和客户既看不懂也做不了，看着还像自己的钱出了问题
                # （唐美芳 2026-09-03：「别展示待财务确认到账了」）。
                # 换成这一步真正该做的事：先看补料，再看材料，都齐了就是办理中。
                sp_open = c.execute(
                    "select count(*) from supp s join applicant a on a.id=s.applicant_id"
                    " where a.ord_id=? and s.status='open'", (o["id"],)).fetchone()[0]
                if sp_open:
                    todo = "有 %d 份补料通知待处理" % sp_open
                elif any(m["status"] == "wait" for a in aps for m in rows(
                        c, "select status from mat where applicant_id=?", (a["id"],))):
                    todo = "待提交材料"
                elif o["status"] == "paid":
                    todo = "办理中"
            # 门店销售要在列表上直接看到「这单收齐了没」，不用点进详情
            recv = c.execute("select ifnull(sum(amount),0) from pay where ord_id=? and kind='in'"
                             " and fin_confirmed=1", (o["id"],)).fetchone()[0]
            recv_wait = c.execute("select ifnull(sum(amount),0) from pay where ord_id=? and kind='in'"
                                  " and fin_confirmed=0", (o["id"],)).fetchone()[0]
            refunded = c.execute("select ifnull(sum(amount),0) from refund where ord_id=?"
                                 " and status='done'", (o["id"],)).fetchone()[0]
            # 与 UOM 侧字段拉齐（唐美芳 2026-08-31：「uom 和 csp 所有的内容和字段最好是尽量
            # 保持一致，但对于特殊的操作，肯定销售是没有权限的」）。CSP 要显示供应商信息。
            # C 端客户仍看不到结算价与毛利。
            g2 = lambda q, a2: c.execute(q, a2).fetchone()[0]
            pay_open = g2("select ifnull(sum(amount),0) from payable where ord_id=? and status='open'",
                          (o["id"],))
            pay_done = g2("select ifnull(sum(amount),0) from payable where ord_id=? and status='paid'",
                          (o["id"],))
            supo = one(c, "select short,name from org where id=?",
                       (sp["org_id"] if sp else 0,)) or {}
            org2 = one(c, "select name from org where id=?", (o["org_id"],)) or {}
            sale2 = one(c, "select name from user where id=?", (o["agent_user"],)) or {}
            buyer2 = one(c, "select name from user where id=?", (o["buyer_user"],)) or {}
            ist, ist_text = info_state(o)
            pst = money_state((o["amount"] or 0) - refunded, recv + recv_wait)
            row = {"no": o["no"], "ord_id": o["id"], "status": o["status"],
                   "pay_state": pst, "pay_state_text": PAY_ST_TEXT[pst],
                   "info_state": ist, "info_state_text": ist_text,
                   "info_deadline": o["info_deadline"] or "",
                   "info_left": info_left_text(o),
                   "info_done_at": o["info_done_at"] or "",
                        "status_text": ORD_STATUS[o["status"]],
                        "work_status": work_status(c, o), "amount": o["amount"],
                        "product": o["product_name"] or (sp["name"] if sp else ""), "pkg": pk["name"] if pk else "",
                        # 列表上点产品名跳产品详情（唐美芳 2026-09-08）
                        "sup_product_id": o["sup_product_id"],
                        "pax": o["pax"], "created_at": o["created_at"], "todo": todo,
                        "depart_date": o["depart_date"], "channel": o["channel"],
                        "contact": o["contact_name"] or "", "phone": o["contact_phone"] or "",
                        "recv": recv, "recv_wait": recv_wait, "refunded": refunded,
                        # 欠款＝客人还欠我们多少。已付款但财务还没核对到账的那笔（recv_wait）
                        # 也要算进已收——钱客人确实付了，确不确认是我们内部的事。
                        # 原来只减 fin_confirmed=1 的部分，销售在列表上看到「已付款」的单
                        # 却挂着全额欠款，会以为客人没给钱（唐美芳 2026-09-02）。
                        "owe": max(0.0, o["amount"] - recv - recv_wait - refunded),
                        "gate": o["gate"],
                        "org": org2.get("name") or "直客",
                        "sale_name": sale2.get("name") or buyer2.get("name") or "—",
                        "contract_status": "未签约",
                        "applicants": [{"id": a["id"], "name": a["name_cn"],
                                        "progress": a["progress"],
                                        "progress_text": PNAME[a["progress"]],
                                        "result": RESULT.get(a["visa_result"], ""),
                                        "mat_wait": mat_wait_map.get(a["id"], 0),
                                        "supp_open": supp_open_map.get(a["id"], 0),
                                        "state": a["state"]} for a in aps]}
            if user["role"] == "csp":
                row["supplier"] = supo.get("short") or supo.get("name") or ""
                row["settle_amount"] = o["settle_amount"]
                row["payable_open"] = pay_open
                row["payable_paid"] = pay_done
                row["gross"] = o["amount"] - o["settle_amount"]
            out.append(row)
        return {"list": out}

    if path == "/my/last_contact":
        # 我上一次下单填的订单联系人。门店销售常连着给同一位客人、或干脆用自己
        # 当联系人下好几单，每次重敲姓名手机邮箱是纯浪费
        # （唐美芳 2026-09-03：「有米和 csp 下单填写的时候，联系人信息为什么没有
        # 自动带出来上次填写的呢」）。
        #
        # 9-02 在有米做过一版，但存的是浏览器内存（S.cache），**刷新就没了、
        # 换台电脑也没有**，而且 CSP 那边压根没做。改成后端按用户查，两端共用。
        need("csp", "customer")
        o = one(c, "select contact_name,contact_phone,contact_email,created_at from ord"
                   " where (agent_user=? or buyer_user=?) and ifnull(contact_name,'')<>''"
                   " order by id desc limit 1", (user["id"], user["id"]))
        if not o:
            return {"contact": None}
        return {"contact": {"name": o["contact_name"] or "",
                            "phone": o["contact_phone"] or "",
                            "email": o["contact_email"] or "",
                            "at": o["created_at"]}}

    if path == "/my/travelers":
        # C 端「常用办签人」（凯撒 PRD 4.14.4 常旅客）。客户第二次下单不用重填护照信息。
        need("customer", "csp")
        out = []
        for t in rows(c, "select * from traveler where owner_user=? order by is_self desc, id",
                      (user["id"],)):
            d = dict(t)
            d["crowd_text"] = CROWD.get(t["crowd"], t["crowd"])
            # 证件有效期预警：签证要求护照剩余有效期通常 ≥6 个月
            d["expiry_warn"] = ""
            if t["id_expiry"]:
                try:
                    from datetime import date
                    y, mo, dd = [int(x) for x in t["id_expiry"].split("-")]
                    left = (date(y, mo, dd) - date.today()).days
                    if left < 0:
                        d["expiry_warn"] = "证件已过期"
                    elif left < 183:
                        d["expiry_warn"] = "剩余有效期不足 6 个月"
                except Exception:
                    pass
            d["used"] = c.execute(
                "select count(*) from applicant a join ord o on o.id=a.ord_id"
                " where o.buyer_user=? and a.id_no=? and a.id_no is not null",
                (user["id"], t["id_no"])).fetchone()[0]
            out.append(d)
        return {"list": out, "crowds": [{"v": k, "t": v} for k, v in CROWD.items()]}

    if path == "/my/traveler/save":
        need("customer", "csp")
        f = body
        vals = (f.get("name_cn"), f.get("name_en"), f.get("sex"), f.get("birth"),
                f.get("id_type") or "护照", f.get("id_no"), f.get("id_expiry"),
                f.get("id_place"), f.get("nation") or "中国", f.get("phone"),
                f.get("crowd") or "job")
        if not f.get("name_cn"):
            raise Err("请填写中文姓名")
        if f.get("id"):
            t = one(c, "select * from traveler where id=? and owner_user=?",
                    (int(f["id"]), user["id"]))
            if not t:
                raise Err("办签人不存在")
            c.execute("update traveler set name_cn=?,name_en=?,sex=?,birth=?,id_type=?,id_no=?,"
                      "id_expiry=?,id_place=?,nation=?,phone=?,crowd=?,updated_at=? where id=?",
                      vals + (now(), t["id"]))
            rid = t["id"]
        else:
            # 同一账号下证件号不重复建档
            if f.get("id_no"):
                dup = one(c, "select * from traveler where owner_user=? and id_no=?",
                          (user["id"], f["id_no"]))
                if dup:
                    raise Err("证件号 %s 已在常用办签人里（%s）" % (f["id_no"], dup["name_cn"]))
            cur = c.execute("""insert into traveler(owner_user,name_cn,name_en,sex,birth,id_type,
                               id_no,id_expiry,id_place,nation,phone,crowd,created_at,updated_at)
                               values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                            (user["id"],) + vals + (now(), now()))
            rid = cur.lastrowid
        # 「本人」在一个账号下只能有一个：设了新的就把旧的取消掉。
        # 唐美芳 2026-09-01：「包括标记本人等，默认带出本人的办签人信息」——
        # 下单页要靠它决定默认带谁，两条都标本人就不知道该带哪个了。
        # （种子数据里一个账号 18 条有 17 条 is_self=1，就是因为原来这里根本不写这个字段。）
        if "is_self" in f:
            if f.get("is_self"):
                c.execute("update traveler set is_self=0 where owner_user=?", (user["id"],))
                c.execute("update traveler set is_self=1 where id=?", (rid,))
            else:
                c.execute("update traveler set is_self=0 where id=?", (rid,))
        return {"ok": True, "id": rid}

    if path == "/my/traveler/self":
        # 单独一个接口用于「标记本人」，列表页点一下就切，不用进编辑弹窗
        need("customer", "csp")
        t = one(c, "select * from traveler where id=? and owner_user=?",
                (arg("id"), user["id"]))
        if not t:
            raise Err("办签人不存在", 404)
        c.execute("update traveler set is_self=0 where owner_user=?", (user["id"],))
        c.execute("update traveler set is_self=1,updated_at=? where id=?", (now(), t["id"]))
        return {"ok": True, "id": t["id"], "name": t["name_cn"]}

    if path == "/my/traveler/del":
        need("customer", "csp")
        t = one(c, "select * from traveler where id=? and owner_user=?",
                (arg("id"), user["id"]))
        if not t:
            raise Err("办签人不存在")
        c.execute("delete from traveler where id=?", (t["id"],))
        return {"ok": True}

    if path == "/my/addrs":
        # C 端「收货地址」。签证办完把护照原件寄回，寄到哪就取这里。
        need("customer", "csp")
        out = []
        for a in rows(c, "select * from addr where owner_kind='user' and owner_id=?"
                         " order by is_default desc, id", (user["id"],)):
            d = dict(a)
            d["live"] = [o["no"] for o in rows(
                c, "select no from ord where recv_addr_id=? and buyer_user=?"
                   " and status in ('created','paid')", (a["id"], user["id"]))]
            out.append(d)
        return {"list": out}

    if path == "/my/addr/save":
        need("customer", "csp")
        f = body
        for k in ("contact", "phone", "region", "detail"):
            if not f.get(k):
                raise Err("收货人、电话、地区、详细地址都要填")
        if f.get("id"):
            a = one(c, "select * from addr where id=? and owner_kind='user' and owner_id=?",
                    (int(f["id"]), user["id"]))
            if not a:
                raise Err("地址不存在")
            c.execute("update addr set contact=?,phone=?,region=?,detail=?,"
                      "updated_by=?,updated_by_name=?,updated_at=? where id=?",
                      (f["contact"], f["phone"], f["region"], f["detail"],
                       user["id"], user["name"], now(), a["id"]))
            rid = a["id"]
        else:
            cur = c.execute("""insert into addr(owner_kind,owner_id,region,detail,contact,phone,
                               is_default,created_by,created_by_name,created_at,
                               updated_by,updated_by_name,updated_at)
                               values('user',?,?,?,?,?,0,?,?,?,?,?,?)""",
                            (user["id"], f["region"], f["detail"], f["contact"], f["phone"],
                             user["id"], user["name"], now(), user["id"], user["name"], now()))
            rid = cur.lastrowid
        if f.get("is_default") in (1, "1", True, "true"):
            c.execute("update addr set is_default=0 where owner_kind='user' and owner_id=?",
                      (user["id"],))
            c.execute("update addr set is_default=1 where id=?", (rid,))
        return {"ok": True, "id": rid}

    if path == "/my/addr/del":
        need("customer", "csp")
        a = one(c, "select * from addr where id=? and owner_kind='user' and owner_id=?",
                (arg("id"), user["id"]))
        if not a:
            raise Err("地址不存在")
        n = c.execute("select count(*) from ord where recv_addr_id=? and status in"
                      " ('created','paid')", (a["id"],)).fetchone()[0]
        if n:
            raise Err("有 %d 张在办订单正用这个地址寄回资料，不能删除" % n)
        c.execute("delete from addr where id=?", (a["id"],))
        return {"ok": True}

    if path == "/my/checklist":
        # 供应商也要能看材料清单（唐美芳 2026-09-08：「待收料这个 tab 里……」）——
        # 护照原件本来就寄到供应商手上，他要知道客人还缺哪几项才收得了料。
        # ⚠️ 只放开**材料清单**，不放开填表任务：申请表里是护照号、家庭住址、亲属信息，
        # 供应商是外部公司，那一层仍由 task_guard 拒绝（理由见该函数注释）。
        need("customer", "csp", "uom", "lead", "ubk")
        aid = int(arg("applicant_id"))
        a = one(c, "select * from applicant where id=?", (aid,))
        if user["role"] == "ubk":
            # 只能看派发到本公司的工单对应的办签人
            own = c.execute("select count(*) from wo where applicant_id=? and sup_org=?",
                            (aid, user["org_id"])).fetchone()[0]
            if not own:
                raise Err("该办签人未派发至贵司", 403)
        ms = mat_list(c, aid)
        o = one(c, "select * from ord where id=?", (a["ord_id"],))
        ma = mail_addr_of(c, o)
        # 免面签的单要寄护照原件，需面签的只传扫描件——客人最容易搞混的就是这一条，
        # 所以把产品的面签属性下发给客户端，让它当面说清楚（唐美芳 2026-09-07）
        pr = one(c, "select * from product where id=?", (o["product_id"],)) or {}
        # 「清单是不是漏了」这个疑问要在页面上答掉（唐美芳 2026-09-08：
        # 「点进去看材料清单也不全呢」）——清单是按<b>适用人群</b>裁剪的，
        # 不是漏。把平台清单总项数与被裁掉的项一并下发，页面上直接说明。
        sp0 = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
        fvid = (sp0["fullver_id"] if sp0 else None) or (pr.get("fullver_id") if pr else None)
        excluded, total = [], 0
        if fvid:
            for it in rows(c, "select * from fullver_item where fullver_id=? order by sort, id",
                           (fvid,)):
                total += 1
                cr = jl(it["crowds"], [])
                if cr and a["crowd"] not in cr:
                    excluded.append({"name": it["mat_name"],
                                     "crowds": "、".join(CROWD.get(k, k) for k in cr)})
        return {"applicant": {"id": a["id"], "name": a["name_cn"],
                              "crowd": CROWD.get(a["crowd"]), "progress": a["progress"],
                              "progress_text": PNAME[a["progress"]]},
                "need_interview": pr.get("need_interview", 1),
                "stat": mat_stat(c, aid), "list": ms,
                "fv_total": total, "excluded": excluded,
                "mail_addr": ma["text"] if ma else None}

    if path == "/mat/upload":
        # 供应商是实际收料方（2026-09-08 权限下放），代客上传一并放开；
        # 归属校验同 /my/checklist：只能碰派发到本公司的办签人。
        need("customer", "csp", "uom", "ubk")
        m = one(c, "select * from mat where id=?", (arg("mat_id"),))
        if not m:
            raise Err("材料不存在")
        if user["role"] == "ubk" and not c.execute(
                "select count(*) from wo where applicant_id=? and sup_org=?",
                (m["applicant_id"], user["org_id"])).fetchone()[0]:
            raise Err("该办签人未派发至贵司", 403)
        fn = body.get("file_name") or ""
        url = body.get("file_url") or ""
        if not url:
            raise Err("请先选择文件上传")
        ai = ai_precheck(m["mat_name"], fn)
        c.execute("update mat set status='review',file_name=?,file_url=?,ai_msg=?,"
                  "reject_reason=null,updated_at=? where id=?",
                  (fn, url, ai, now(), m["id"]))
        a = one(c, "select * from applicant where id=?", (m["applicant_id"],))
        if a["progress"] == "P1":
            set_progress(c, a["id"], "P2", user)
        log(c, "applicant", a["id"], a["ord_id"], user, "提交材料", m["mat_name"])
        return {"ok": True, "ai_msg": ai}

    if path == "/my/supp":
        need("customer", "csp")
        out = []
        for s in rows(c, "select s.* from supp s join applicant a on a.id=s.applicant_id"
                         " join ord o on o.id=a.ord_id where o.buyer_user=? or o.agent_user=?"
                         " order by s.id desc", (user["id"], user["id"])):
            a = one(c, "select * from applicant where id=?", (s["applicant_id"],))
            o = one(c, "select no from ord where id=?", (a["ord_id"],))
            left = (datetime.strptime(s["due_at"], "%Y-%m-%d %H:%M:%S") - datetime.now()).days
            out.append({"no": s["no"], "ord_no": o["no"], "name": a["name_cn"],
                        "applicant_id": a["id"], "reason": s["reason"], "round": s["round"],
                        "due_at": s["due_at"], "days_left": left, "status": s["status"],
                        "items": rows(c, "select id,mat_name,reject_reason,status from mat"
                                         " where id in (%s)" % (
                                             ",".join(str(int(i)) for i in jl(s["mat_ids"])) or "0"))})
        return {"list": out}

    # ---------- C5 财务：收款放行 ----------
    if path == "/fin/inbox":
        need("fin")
        out = []
        # 待办口径＝待审核。标了「有误」的在等销售核实，不算财务待办，否则侧栏角标
        # 会比「待审核」页签多，两处对不上。（2026-08-31）
        for p in rows(c, "select * from pay where kind='in' and fin_confirmed=0"
                         " and COALESCE(audit_status,'wait')='wait' order by id desc"):
            o = one(c, "select * from ord where id=?", (p["ord_id"],))
            sp = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
            org = one(c, "select * from org where id=?", (o["org_id"],)) or {}
            out.append({"pay_id": p["id"], "ord_no": o["no"], "amount": p["amount"],
                        "method": p["method"], "trade_no": p["trade_no"],
                        "channel": o["channel"], "org": org.get("name") or "直客",
                        "product": o["product_name"] or (sp["name"] if sp else ""), "pax": o["pax"],
                        "settle_amount": o["settle_amount"], "created_at": p["created_at"]})
        return {"list": out}

    if path == "/fin/receipts":
        # 收款单台账。字段口径对齐众信「财务管理 › 业务资金管理 › 收款管理」。
        # CSP 只读本店单据，看不到应付供应商与凭证号（唐美芳 2026-08-31）。
        need("fin", "lead", "ops", "csp")
        is_csp = user["role"] == "csp"
        # readonly＝能不能点审核/放行/生成凭证。只有财务能点，运营与主管进来是只读台账。
        can_op = user["role"] in ("fin", "ops")
        out = []
        for p in rows(c, "select * from pay where kind='in' order by id desc"):
            o = one(c, "select * from ord where id=?", (p["ord_id"],))
            if is_csp and o["agent_user"] != user["id"] and o["org_id"] != user["org_id"]:
                continue
            sp = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
            org = one(c, "select * from org where id=?", (o["org_id"],)) or {}
            fu = one(c, "select name from user where id=?", (p["fin_user"],)) or {}
            sale = one(c, "select name from user where id=?", (o["agent_user"],)) or {}
            aud_st = p["audit_status"] or ("pass" if p["fin_confirmed"] else "wait")
            r = {"pay_id": p["id"], "no": p["no"] or ("SK-%05d" % p["id"]), "ord_no": o["no"],
                 "trade_no": p["trade_no"], "channel": o["channel"],
                 "cate": p["cate"], "channel_name": p["channel_name"], "method": p["method"],
                 "cust_type": p["cust_type"], "org": org.get("name") or "直客",
                 "sale": sale.get("name"), "item": p["item"],
                 "product": o["product_name"] or (sp["name"] if sp else ""), "pax": o["pax"],
                 "amount": p["amount"], "arrive_amount": p["arrive_amount"], "fee": p["fee"],
                 "payer_name": p["payer_name"], "pay_date": p["pay_date"],
                 "arrive_date": p["arrive_date"],
                 "audit_status": aud_st, "confirmed": p["fin_confirmed"],
                 "fin_user": fu.get("name"), "fin_at": p["fin_at"],
                 "sale_note": p["sale_note"], "fin_note": p["fin_note"],
                 "created_at": p["created_at"], "created_by_name": p["created_by_name"],
                 "ord_status": o["status"], "gate": o["gate"]}
            if not is_csp:
                r["settle_amount"] = o["settle_amount"]
                r["voucher_no"] = p["voucher_no"]
            out.append(r)
        return {"list": out, "readonly": not can_op, "narrow": is_csp,
                "wait_amt": sum(x["amount"] for x in out if x["audit_status"] == "wait"),
                "done_amt": sum(x["amount"] for x in out if x["audit_status"] == "pass")}

    if path == "/fin/receipt":
        # 收款单详情。结构对齐众信「收款管理 › 单据详情」：
        # 订单信息 + 本次收款 + 水单 + 财务审核日志，底部四个动作。
        need("fin", "lead", "ops", "csp")
        p = one(c, "select * from pay where no=? and kind='in'", (arg("no"),))
        if not p:
            raise Err("收款单不存在", 404)
        o = one(c, "select * from ord where id=?", (p["ord_id"],))
        if user["role"] == "csp" and o["agent_user"] != user["id"] \
                and o["org_id"] != user["org_id"]:
            raise Err("无权查看该单据", 403)
        sp = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
        org = one(c, "select * from org where id=?", (o["org_id"],)) or {}
        sale = one(c, "select name from user where id=?", (o["agent_user"],)) or {}
        buyer = one(c, "select name from user where id=?", (o["buyer_user"],)) or {}
        fu = one(c, "select name from user where id=?", (p["fin_user"],)) or {}
        aud_st = p["audit_status"] or ("pass" if p["fin_confirmed"] else "wait")
        logs = [{"i": i + 1, "status": e["action"], "actor": e["actor_name"],
                 "at": e["created_at"], "note": e["detail"]}
                for i, e in enumerate(rows(
                    c, "select * from event where scope='pay' and ref_id=? order by id",
                    (p["id"],)))]
        return {
            "can_op": user["role"] in ("fin", "ops"),
            "ord": {"no": o["no"], "created_at": o["created_at"],
                    "product": o["product_name"] or (sp["name"] if sp else ""),
                    "sale_org": org.get("name") or "直客",
                    "channel_name": {"C": "客户小程序", "CSP": org.get("name") or "门店",
                                     "B": org.get("name") or "同业"}.get(o["channel"], ""),
                    "sale": sale.get("name") or buyer.get("name") or "—",
                    "svc_start": o["depart_date"],
                    "svc_end": None,
                    "cust_type": p["cust_type"] or "个人客户"},
            "pay": {"no": p["no"], "item": p["item"], "cate": p["cate"],
                    "channel_name": p["channel_name"], "method": p["method"],
                    "acct_type": p["acct_type"], "amount": p["amount"],
                    "fee": p["fee"] or 0,
                    "net": round((p["arrive_amount"] if p["arrive_amount"] is not None
                                  else p["amount"]) - (p["fee"] or 0), 2),
                    "arrive_amount": p["arrive_amount"], "trade_no": p["trade_no"],
                    "pay_date": p["pay_date"], "arrive_date": p["arrive_date"],
                    "acct_no": p["acct_no"], "payer_name": p["payer_name"],
                    "receipt_img": p["receipt_img"],
                    "audit_status": aud_st, "confirmed": p["fin_confirmed"],
                    "fin_user": fu.get("name"), "fin_at": p["fin_at"],
                    "voucher_no": p["voucher_no"],
                    "sale_note": p["sale_note"], "fin_note": p["fin_note"],
                    "pay_id": p["id"]},
            "logs": logs}

    if path == "/fin/audit":
        # 标记有误 / 撤回有误。放行走 /fin/confirm（那个动作不可撤销，单独保留）
        need("fin")
        p = one(c, "select * from pay where id=?", (arg("pay_id"),))
        if not p:
            raise Err("单据不存在")
        act = arg("action")
        if act == "noarrive":
            # 众信那张单据详情底部的「未到账」：钱没到，单据留在待审核池，不放行。
            if p["fin_confirmed"]:
                raise Err("已确认到账的单据不能再标为未到账")
            c.execute("update pay set audit_status='wait',arrive_amount=0,arrive_date=null,"
                      "fin_note=? where id=?",
                      (body.get("note") or "核对未到账，等待客户重新支付或提供水单", p["id"]))
            log(c, "pay", p["id"], p["ord_id"], user, "标记未到账", body.get("note") or "")
            return {"ok": True, "msg": "已标记未到账，单据留在待审核"}
        if act == "error":
            if p["fin_confirmed"]:
                raise Err("已确认到账的单据不能再标记有误")
            c.execute("update pay set audit_status='error',fin_note=? where id=?",
                      (body.get("note") or "金额或流水号存疑，待销售核实", p["id"]))
            log(c, "pay", p["id"], p["ord_id"], user, "收款单标记有误", body.get("note") or "")
            return {"ok": True, "msg": "已标记有误"}
        if act == "revert":
            c.execute("update pay set audit_status='wait',fin_note=null where id=?", (p["id"],))
            log(c, "pay", p["id"], p["ord_id"], user, "收款单撤回有误标记", "")
            return {"ok": True, "msg": "已撤回，回到待审核"}
        raise Err("未知动作")

    if path == "/fin/voucher":
        need("fin")
        p = one(c, "select * from pay where id=?", (arg("pay_id"),))
        if not p or p["audit_status"] != "pass":
            raise Err("只有已审核的单据可以生成凭证")
        if p["voucher_no"]:
            raise Err("该单据已生成凭证 %s" % p["voucher_no"])
        vno = "PZ%s%04d" % (now()[2:10].replace("-", ""), p["id"])
        c.execute("update pay set voucher_no=? where id=?", (vno, p["id"]))
        log(c, "pay", p["id"], p["ord_id"], user, "生成记账凭证", vno)
        return {"ok": True, "msg": "已生成凭证 " + vno, "voucher_no": vno}

    if path == "/fin/confirm":
        need("fin")
        p = one(c, "select * from pay where id=?", (arg("pay_id"),))
        if not p or p["fin_confirmed"]:
            raise Err("流水不存在或已确认")
        c.execute("update pay set fin_confirmed=1,fin_user=?,fin_at=? where id=?",
                  (user["id"], now(), p["id"]))
        # 放行只开资金闸门，不动订单状态——订单仍是「已付款」，
        # 「有没有在办」由办签人进度派生，不再挤进订单状态。
        c.execute("update ord set gate=1 where id=?", (p["ord_id"],))
        o = one(c, "select * from ord where id=?", (p["ord_id"],))
        sp = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
        c.execute("insert into payable(ord_id,sup_org,amount,status,created_at)"
                  " values(?,?,?,'open',?)",
                  (o["id"], sp["org_id"] if sp else None, o["settle_amount"], now()))
        # 工单在下单那一刻就建好了，这里不再建单——财务确认只做两件事：
        # 开资金闸门（供应商可见、可结算）和对供应商挂应付
        # （唐美芳 2026-09-02：流程流转与支付状态解耦，只在「提交至官网」那一步校验）。
        # 兜底补建：极早期的存量订单可能没有工单。
        wos = open_wo(c, o["id"], user)
        log(c, "ord", o["id"], o["id"], user, "财务确认收款到账",
            ("补建工单 %s；" % "、".join(wos) if wos else "") +
            "应付挂账 %.0f" % o["settle_amount"])
        return {"ok": True, "wo": wos,
                "msg": "已确认收款到账，应付已挂账" +
                       ("，补建 %d 个工单" % len(wos) if wos else "")}

    if path == "/fin/payables":
        need("fin")
        out = []
        for r in rows(c, "select * from payable order by id desc"):
            o = one(c, "select no from ord where id=?", (r["ord_id"],)) or {}
            org = one(c, "select short from org where id=?", (r["sup_org"],)) or {}
            out.append(dict(r, ord_no=o.get("no"), sup=org.get("short")))
        return {"list": out}

    if path == "/fin/pay":
        need("fin")
        c.execute("update payable set status='paid',paid_at=? where id=?", (now(), arg("id")))
        return {"ok": True}

    if path == "/fin/advance":
        # ops 也放行：垫付台账对运营是只读的账，要核「这条产品线一共垫出去多少」
        need("fin", "uom", "ops")
        out = []
        for r in rows(c, "select * from advance order by id desc"):
            a = one(c, "select name_cn,ord_id from applicant where id=?", (r["applicant_id"],))
            o = one(c, "select no from ord where id=?", (a["ord_id"],))
            out.append(dict(r, name=a["name_cn"], ord_no=o["no"]))
        return {"list": out, "total": sum(r["amount"] for r in out)}

    # ---------- C3 签证操作专员 ----------
    if path == "/wo/list":
        need("uom", "lead")
        scope = q.get("scope", ["mine"])[0]
        sql = "select * from wo where 1=1"
        args = []
        if scope == "mine":
            sql += " and owner_user=?"
            args.append(user["id"])
        elif scope == "hold":
            sql += " and status='hold'"
        elif scope == "unassigned":
            sql += " and owner_user is null"
        sql += " order by (status='done'), sla_due"
        memo = {}                       # 整张列表共用一份只读维表缓存
        lst = [wo_view(c, w, memo=memo) for w in rows(c, sql, args)]
        # 一个页签＝一个明确动作。原来 P3/P4/P5 都算「待预约」，
        # 可 P3 该去填表、P4 该确认并录官网、P5 才是抢号——名字与动作对不上
        # （唐美芳 2026-09-01 对照业务流程图验收时指出）。拆出「待填表」。
        # 页签＝新六步，一个页签一个明确动作（唐美芳 2026-09-02 重定义流程）
        buckets = {"待收料": 0, "待审核": 0, "补料中": 0, "待提交至官网": 0,
                   "待预约": 0, "待出签": 0, "已完成": 0, "超期": 0}
        for d in lst:
            if d["status"] == "done" or d["progress"] == "P6":
                buckets["已完成"] += 1
            elif d["supp_no"]:
                buckets["补料中"] += 1
            elif d["progress"] == "P1":
                buckets["待收料"] += 1
            elif d["progress"] == "P2":
                buckets["待审核"] += 1
            elif d["progress"] == "P3":
                buckets["待提交至官网"] += 1
            elif d["progress"] == "P4":
                buckets["待预约"] += 1
            else:
                buckets["待出签"] += 1
            if d.get("overdue"):
                buckets["超期"] += 1
        # 工单台空的时候要能说清楚「为什么空」：已付款但财务还没确认到账的单，
        # 工单根本还没生成。不然专员/演示的人对着一张白板不知道卡在哪
        # （唐美芳 2026-09-02：「下订单后，怎么国家签证办理中心的数据怎么是空的，
        #  我刚刚下的单，都填写完资料了，也没有数据，后续办签进度怎么流转啊」）。
        pending = c.execute(
            "select count(*) from ord where status='paid' and gate=0").fetchone()[0]
        return {"list": lst, "buckets": buckets, "pending_gate": pending}

    if path == "/wo/detail":
        # 2026-09-09 放开给供应商：办理中心两端整合后，UBK 侧的「查看详情」进的是
        # 同一个工单详情页（唐美芳：「材料清单统一改成查看详情，点击进入工单详情页」）。
        # 归属仍由 sup_wo_guard 兜住，金额侧的商业信息在下面按角色裁掉。
        need("uom", "lead", "fin", "ubk", "ops")
        w = one(c, "select * from wo where no=?", (arg("no"),))
        if not w:
            raise Err("工单不存在", 404)
        if user["role"] == "ubk":
            sup_wo_guard(c, user, w["applicant_id"])
        d = wo_view(c, w)
        a = one(c, "select * from applicant where id=?", (w["applicant_id"],))
        o = one(c, "select * from ord where id=?", (w["ord_id"],))
        sp = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
        pk = one(c, "select * from pkg where id=?", (o["pkg_id"],))
        pr0c = one(c, "select * from product where id=?", (o["product_id"],))
        ms = rows(c, "select * from mat where applicant_id=? order by id", (a["id"],))
        for m in ms:
            m["provide_way"] = jl(m["provide_way"])
            m["way_text"] = "、".join(WAY.get(x, x) for x in m["provide_way"])
            m["attr_text"] = ATTR.get(m["attr"], m["attr"])
            m["nec_text"] = NEC.get(m["necessity"], m["necessity"])
            it = one(c, "select sample_tpl_id from fullver_item where id=?", (m["item_id"],))
            m["sample"] = sample_of(c, (it or {}).get("sample_tpl_id"))
        d.update({
            "applicant": a, "order": dict(o, status_text=ORD_STATUS[o["status"]]),
            "sup_product": sp["name"] if sp else "", "pkg": pk["name"] if pk else "",
            "materials": ms,
            "supps": rows(c, "select * from supp where applicant_id=? order by id desc", (a["id"],)),
            # 操作日志分两段：这位办签人自己的，和整张订单的。
            # 一单多人时混在一起看不出哪条是谁的
            # （唐美芳 2026-09-01：「每个客人的签证办理，详情里也需要有详细的操作日志」）。
            "events": [dict(e, mine=(e["scope"] == "applicant" and e["ref_id"] == a["id"]))
                       for e in rows(c, "select * from event where ord_id=?"
                                        " order by id desc limit 80", (o["id"],))],
            # 官方申请表：工单台里也要能看到「这张表填到哪了」并直接去改，
            # 不用切到填表中心（唐美芳 2026-09-01：「签证人员也应该有修改填写的入口」）
            "form": (lambda t: {
                "task_id": t["id"], "status": t["status"],
                "status_text": form_task.STATUS.get(t["status"], t["status"]),
                "filled_by_text": form_task.FILLED_BY.get(t["filled_by"], ""),
                "official_app_id": t["official_app_id"] or "",
                "shared": bool(t["share_token"] and (t["share_expire"] or "") > now()),
                "share_expire": t["share_expire"] or "",
                "stat": form_task.stat(c, t),
                # 还有几格中文没译成英文——底部动作条上直接标出来
                "en_left": c.execute(
                    "select count(*) from form_field f"
                    " left join form_answer a on a.task_id=? and a.field_id=f.id"
                    " where f.formver_id=? and f.need_en=1"
                    "   and ifnull(a.value,'')<>'' and ifnull(a.value_en,'')=''",
                    (t["id"], t["formver_id"])).fetchone()[0],
                "miss": (lambda ms2: {
                    "total": len(ms2),
                    "ask": len([x for x in ms2 if x["src"] == "ask"]),
                    "agent": len([x for x in ms2 if x["src"] != "ask"]),
                })(form_task.missing_required(c, t)),
            } if t else None)(one(c, "select * from form_task where applicant_id=?", (a["id"],))),
            "progress_list": PROGRESS,
            # 官费按产品套餐真实带出，前端不要再写死一个数字
            # （2026-09-03 走查发现缴费弹窗把金额写死成 1240，那是美签的数，
            # 换个国家就是错的；专员照着点确认，垫付台账里的钱就记错了）。
            "visa_fee": (pk or {}).get("visa_fee") or 0,
            "fee_item": fee_item_of(pr0c["country"] if pr0c else ""),
        })
        if user["role"] == "ubk":
            # 客户成交价、平台毛利、收款流水不下发给外部供应商——他只该看到
            # 「平台付我多少」，那在结算管理里，不在工单详情里。
            d["order"] = {k: v for k, v in d["order"].items()
                          if k not in ("amount", "settle_amount", "invoice_entity",
                                       "settle_entity", "buyer_user", "agent_user")}
        return d

    if path == "/mat/review":
        # 2026-09-09 唐美芳拍板下放给供应商：「按照你建议的来」＋「如果是客户填写的材料，
        # 还是需要有驳回通过按钮的，让客户知道自己填的有问题」。
        # 供应商是实际收料方（护照原件寄到他那儿），原来只有众信能点通过，
        # 结果是他收齐了料工单也推不动，必须等专员点一下——走查时这是最卡的一环。
        # 边界仍收在工单归属上：只能审派发到自己公司的那些办签人。
        need("uom", "ubk")
        m = one(c, "select * from mat where id=?", (arg("mat_id"),))
        if user["role"] == "ubk":
            sup_wo_guard(c, user, m["applicant_id"])
        act = arg("action")
        if act == "pass":
            c.execute("update mat set status='pass',reject_reason=null,updated_at=? where id=?",
                      (now(), m["id"]))
        elif act == "reject":
            c.execute("update mat set status='reject',reject_reason=?,updated_at=? where id=?",
                      (arg("reason"), now(), m["id"]))
        else:
            raise Err("非法动作")
        a = one(c, "select * from applicant where id=?", (m["applicant_id"],))
        for s in rows(c, "select * from supp where applicant_id=? and status='open'", (a["id"],)):
            ids = [int(i) for i in jl(s["mat_ids"])]
            if ids and all(one(c, "select status from mat where id=?", (i,))["status"] == "pass"
                           for i in ids):
                c.execute("update supp set status='done',closed_at=? where id=?", (now(), s["id"]))
                log(c, "applicant", a["id"], a["ord_id"], user, "补料单关闭", s["no"])
        log(c, "applicant", a["id"], a["ord_id"], user,
            "材料审核" + ("通过" if act == "pass" else "驳回"),
            m["mat_name"] + (("：" + body.get("reason", "")) if act == "reject" else ""))
        st = mat_stat(c, a["id"])
        if st["ready"] and a["progress"] in ("P1", "P2"):
            set_progress(c, a["id"], "P3", user, "必交材料全部通过")
        return {"ok": True, "stat": st}

    if path == "/mat/passall":
        # 整单材料审核通过。「待审核」这一步专员最常做的就是这个动作：
        # 客人把材料发过来了（线上传的、微信发的、当面交的），逐项核完一次性放行。
        # 原来只有逐项按钮、而且只在客人已提交(review)的行上才出现，
        # 客人线下给的材料专员在页面上一个能点的都没有
        # （唐美芳 2026-09-03：「待审核状态，没有审核通过、驳回按钮」）。
        #
        # 只放行**必交且要客人提供**的：建议项不交也能送签，
        # 我方产出的凭证（DS-160 确认页 / 预约单 / 缴费收据）还没办出来，
        # 一起标通过就是假数据。
        need("uom", "ubk")
        a = one(c, "select * from applicant where id=?", (arg("applicant_id"),))
        if not a:
            raise Err("办签人不存在")
        if user["role"] == "ubk":
            sup_wo_guard(c, user, a["id"])
        ms = rows(c, "select * from mat where applicant_id=? and necessity='must'"
                     " and ifnull(by_us,0)=0 and status<>'pass'", (a["id"],))
        if not ms:
            # 没有待审项，但必交项其实已经齐了、进度还卡在收料/审核——
            # 多半是判定口径改过之后的历史遗留。这里补一次推进，别让专员干瞪眼。
            st0 = mat_stat(c, a["id"])
            if st0["ready"] and a["progress"] in ("P1", "P2"):
                set_progress(c, a["id"], "P3", user, "必交材料已全部通过")
                return {"ok": True, "n": 0, "stat": st0,
                        "msg": "必交材料本来就已全部通过，已转入「待提交至官网」"}
            raise Err("没有待审核的必交材料")
        for m in ms:
            c.execute("update mat set status='pass',reject_reason=null,updated_at=? where id=?",
                      (now(), m["id"]))
        # 补料单里的项全通过了就关单
        for sp in rows(c, "select * from supp where applicant_id=? and status='open'", (a["id"],)):
            ids = [int(i) for i in jl(sp["mat_ids"])]
            if ids and all(one(c, "select status from mat where id=?", (i,))["status"] == "pass"
                           for i in ids):
                c.execute("update supp set status='done',closed_at=? where id=?", (now(), sp["id"]))
                log(c, "applicant", a["id"], a["ord_id"], user, "补料单关闭", sp["no"])
        log(c, "applicant", a["id"], a["ord_id"], user, "材料审核通过",
            "一次性放行 %d 项必交材料：%s%s"
            % (len(ms), "、".join(m["mat_name"][:10] for m in ms[:4]),
               " 等" if len(ms) > 4 else ""))
        st = mat_stat(c, a["id"])
        nxt = ""
        if st["ready"] and a["progress"] in ("P1", "P2"):
            set_progress(c, a["id"], "P3", user, "必交材料全部通过")
            nxt = "，已转入「待提交至官网」"
        return {"ok": True, "n": len(ms), "stat": st,
                "msg": "已通过 %d 项必交材料%s" % (len(ms), nxt)}

    if path == "/supp/create":
        need("uom")
        aid = int(arg("applicant_id"))
        ids = body.get("mat_ids") or []
        if not ids:
            raise Err("请选择需要补交的材料")
        n = c.execute("select count(*) from supp where applicant_id=?", (aid,)).fetchone()[0]
        if n >= 3:
            raise Err("该办签人补料已达 3 次上限，请走挂起或退款流程")
        no = nextno(c, "BL")
        c.execute("insert into supp(no,applicant_id,mat_ids,reason,round,due_at,status,created_at)"
                  " values(?,?,?,?,?,?,'open',?)",
                  (no, aid, json.dumps(ids), body.get("reason"), n + 1, now(7), now()))
        for i in ids:
            c.execute("update mat set status='reject',round=? where id=?", (n + 1, i))
        a = one(c, "select * from applicant where id=?", (aid,))
        log(c, "applicant", aid, a["ord_id"], user, "发出补料单",
            "%s，第 %d 次，%d 项，7 天内补齐" % (no, n + 1, len(ids)))
        return {"ok": True, "no": no, "due_at": now(7)}

    if path == "/progress/set":
        need("uom", "lead")
        # 人工在官方渠道办完后回填的凭证写进流水，日后可追溯谁在何时宣称办了什么
        note = body.get("note") or ""
        if body.get("proof"):
            note = ("人工回填凭证 %s%s" % (body["proof"],
                    "（办理日期 %s）" % body["proof_at"] if body.get("proof_at") else "")
                    + ("；" + note if note else ""))
        passed = set_progress(c, int(arg("applicant_id")), arg("progress"), user, note)
        return {"ok": True, "auto_filled": [PNAME[p] for p in passed[:-1]]}

    if path == "/appt/save":
        need("uom", "ubk")
        aid = int(arg("applicant_id"))
        a = one(c, "select * from applicant where id=?", (aid,))
        if user["role"] == "ubk":
            sup_wo_guard(c, user, aid)
        # 预约面签的硬前置：官方预约系统要「护照号 + 缴费收据编号 + DS-160 十位条形码」
        # 三样齐了才让约号。缴费没回填就来登记预约，等于在系统里记了一条官网根本约不上的号。
        # （2026-09-02 核对 ustraveldocs 官方流程后补的校验；缴费不单独占进度节点，
        #  只在这一口卡住，不动六步主干。）
        if not a["cgi_receipt"]:
            raise Err("还没有回填签证费缴费收据编号。官方预约系统要「护照号 + 缴费收据编号 + "
                      "DS-160 条形码」三样才能约号，请先在「回填缴费」里登记收据编号。")
        if not a["app_id"]:
            raise Err("还没有回填官网受理号（DS-160 条形码），无法登记预约。")
        chg = a["appt_change"] + (1 if a["appt_no"] else 0)
        c.execute("update applicant set appt_no=?,appt_at=?,appt_place=?,appt_change=? where id=?",
                  (arg("appt_no"), arg("appt_at"), body.get("appt_place"), chg, aid))
        log(c, "applicant", aid, a["ord_id"], user,
            "改期预约" if a["appt_no"] else "登记预约",
            "预约号 %s，%s %s%s" % (arg("appt_no"), arg("appt_at"), body.get("appt_place") or "",
                                   ("（第 %d 次改期）" % chg) if chg else ""))
        # 登记预约 → 待出签（唐美芳 2026-09-02：「办签人员线下操作预约后，
        # 并和客人确认预约时间后，回填登记预约，到了面试预约时间后，待出签」）
        if PORDER.index(a["progress"]) < PORDER.index("P5"):
            set_progress(c, aid, "P5", user)
        return {"ok": True, "appt_change": chg}

    if path == "/form/save":
        # 2026-09-09 一并放开给供应商（唐美芳：「我记得这个回传预约号、预约面签时间
        # 之前都有功能的呀，怎么都下掉了」——这三个回填一直在 UOM 运营端，
        # 供应商侧从建立起就没有过，9-04 定「供应商走通用三态、可跳过中间流程」时
        # 也没给。现在按她的意思补上：**选填**，不填照样能直接登记结果，
        # 填了众信与客户就能看到办到哪一步了）。
        need("uom", "ubk")
        aid = int(arg("applicant_id"))
        a = one(c, "select * from applicant where id=?", (aid,))
        if user["role"] == "ubk":
            sup_wo_guard(c, user, aid)
        # 回填 Application ID ＝ 已经在官网提交过了，这一步要校验订单付款状态
        # （唐美芳 2026-09-02：「点提交时，确认下订单付款状态即可」）
        pay_guard(c, a["ord_id"])
        c.execute("update applicant set app_id=?,barcode=? where id=?",
                  (arg("app_id"), body.get("barcode") or barcode_of(arg("app_id")), aid))
        o0 = one(c, "select * from ord where id=?", (a["ord_id"],))
        pr0 = one(c, "select * from product where id=?", (o0["product_id"],)) if o0 else None
        idname = official_id_name(pr0["country"] if pr0 else "")
        log(c, "applicant", aid, a["ord_id"], user, "提交至官网并回填",
            "%s %s，条形码 %s" % (idname, arg("app_id"), body.get("barcode") or "-"))
        # 免面签的国家（澳洲 600、新加坡、韩国、日本…）不需要抢号，直接进「待出签」
        nxt = next_after_official(c, a)
        if PORDER.index(a["progress"]) < PORDER.index(nxt):
            set_progress(c, aid, nxt, user,
                         "" if nxt == "P4" else "该产品免面签，无需预约，直接进入待出签")
        return {"ok": True, "next": nxt, "id_name": idname}

    # ========== 填表任务：下单后每位办签人一张官方表 ==========
    # 业务口径（唐美芳）：字段模板由签证人员在 UOM 后台定义好，下单后
    # 客人可以自己填、销售可以帮客人填、也可以生成链接分享给客人填。
    # 三个入口填的是同一张 form_task，不同的只是「谁在填」。
    #
    # 边界（不可越过）：CEAC / ustraveldocs 没有公开 API，也不授权抓取。
    # 这套系统能做到的最后一步是：专员确认 → 把整理好的答案给专员 →
    # 专员到官网人工录入 → 回填 Application ID。没有、也不会有自动提交官网的接口。
    if path == "/task/list":
        need("uom", "lead", "ops", "csp", "customer", "ubk")
        if user["role"] in ("uom", "lead", "ops"):
            where, args = "1=1", []
        elif user["role"] == "csp":
            where, args = "(o.agent_user=? or o.org_id=?)", [user["id"], user["org_id"] or 0]
        else:
            where, args = "o.buyer_user=?", [user["id"]]
        # 补建：老订单没有任务记录，这里按可见范围补齐，保证列表和订单数对得上
        for a in rows(c, "select a.* from applicant a join ord o on o.id=a.ord_id"
                         " where a.state='normal' and " + where, args):
            form_task.ensure_task(c, a)
        out, stat = [], {k: 0 for k in form_task.STATUS}
        for t in rows(c, "select t.* from form_task t join applicant a on a.id=t.applicant_id"
                         " join ord o on o.id=a.ord_id where " + where + " order by t.id desc",
                      args):
            a = one(c, "select * from applicant where id=?", (t["applicant_id"],))
            o = one(c, "select * from ord where id=?", (a["ord_id"],))
            stat[t["status"]] = stat.get(t["status"], 0) + 1
            b = task_brief(c, t, a, o)
            if q.get("status", [""])[0] and q["status"][0] != t["status"]:
                continue
            kw = (q.get("kw", [""])[0] or "").strip()
            if kw and kw not in (a["name_cn"] or "") and kw not in o["no"]:
                continue
            out.append(b)
        stat["total"] = sum(stat.values())
        return {"list": out, "stat": stat, "status_dict": form_task.STATUS,
                "filled_by_dict": form_task.FILLED_BY}

    if path == "/task/get":
        t, a, o = task_load(c, tid=q.get("id", [None])[0] or body.get("id"),
                            applicant_id=body.get("applicant_id") or
                            q.get("applicant_id", [None])[0])
        task_guard(c, user, o)
        # 默认值追平：运营在表模板上给某一格新配了默认值之后，
        # **已经预填过的存量任务不会自动跟上**——那些格子还空着，
        # 客人打开还是要自己答。2026-09-03 走查时发现 8-26 预填的一张老单
        # 仍显示「客户必答剩余 21 题」，而模板层面早就只剩 10 题了。
        # default_risk 只补空格子、不覆盖任何人答过的值，所以这里补跑是安全的。
        if t["prefill_at"]:
            _dft = form_task.default_risk(c, t)
            if _dft:
                log(c, "form", t["id"], o["id"], user, "补齐表模板新增的默认值",
                    "%d 格" % len(_dft))
        # 客人看的是客人视角：挂着系统默认「否」的高风险题整格不下发
        # （业务口径是不向客人提起，那就不能在页面上露出来）。
        # 专员端仍看全表——他要复核我们替客人默认了什么。
        cust = user["role"] == "customer"
        secs, fields, answers = form_task.sections(c, t, for_customer=cust)
        if cust:
            # 官方板块（个人 1 / 个人 2 / 家庭：配偶…）归并成中国人办签习惯的那几步
            secs = form_task.merge_for_customer(secs)
        fv = one(c, "select * from formver where id=?", (t["formver_id"],))
        d = task_brief(c, t, a, o)
        # 客人端的「共几题」只能数他看得见的题，跟 /pub/task 同一套算法：
        # 直接下发全局 ask_total 会出现「已答 19 / 34」，客人翻遍页面也找不到那 15 题
        vis = [i for sec in secs for i in sec["items"] if i["src"] == "ask" and i["required"]]
        st = form_task.stat(c, t)
        if cust:
            st = dict(st, ask_total=len(vis),
                      ask_left=len([i for i in vis if not i["value"]]))
        d.update({"formver": fv, "sections": secs, "stat": st,
                  "missing": form_task.missing_required(c, t),
                  "official_url": (fv or {}).get("official_url"),
                  # 专员在官网上要现做的动作（设密保问题、最终审查、打印确认页），
                  # 系统里没有对应的格子可填，单独列出来当操作提示
                  "agent_steps": [f["name"] for f in fields if f["src"] == "agent"],
                  # 这一页只从工单详情进来（填表中心 2026-09-01 起不单独占菜单），
                  # 返回按钮要能回到那张工单
                  "wo_no": (one(c, "select no from wo where applicant_id=? order by id desc limit 1",
                                (a["id"],)) or {}).get("no")})
        return d

    if path == "/task/prefill":
        need("uom", "lead", "csp", "customer", "ubk")
        t, a, o = task_load(c, tid=body.get("id"), applicant_id=body.get("applicant_id"))
        task_guard(c, user, o, True)
        if t["status"] in ("confirmed", "official"):
            raise Err("表单已确认，如需重填请先由专员撤回")
        r = form_task.prefill(c, t, a, by_name="系统预填（%s 触发）" % user["name"],
                              force=bool(body.get("force")))
        log(c, "applicant", a["id"], o["id"], user, "表单预填",
            "%s：自动带出 %d / 应带 %d 格，%d 格无数据源需人工填"
            % ((one(c, "select form_code from formver where id=?", (t["formver_id"],)) or {}
                ).get("form_code") or "官方表单", r["filled"], r["target"], r["gap"]))
        # 填表本身不推进主干进度：材料齐了就是「待提交至官网」，
        # 表填到哪一步由填表任务自己的 status 表达，主干上不再多一个停顿节点
        r["stat"] = form_task.stat(c, t)
        return r

    if path == "/task/answer/save":
        need("uom", "lead", "csp", "customer", "ubk")
        t, a, o = task_load(c, tid=body.get("id"), applicant_id=body.get("applicant_id"))
        task_guard(c, user, o, True)
        if t["status"] in ("confirmed", "official"):
            raise Err("表单已确认，不能再改；如需修改请联系专员撤回")
        items = body.get("answers") or ([{"field_id": body.get("field_id"),
                                          "value": body.get("value")}]
                                        if body.get("field_id") else [])
        if not items:
            raise Err("没有要保存的内容")
        # 校验不过的整条拒绝并把原因报出来（form_task.value_error），
        # 不静默丢弃——静默丢弃会让专员以为存上了，到官网对照单那步才发现是空的
        try:
            n = form_task.save_answers(c, t, items, "manual", user["name"])
        except ValueError as ve:
            raise Err(str(ve))
        # filled_by 记最后一次实际动手的角色：责任认定时要分得清是客人自填还是我司代填
        upd = {"filled_by": form_task.ROLE_FILLED_BY.get(user["role"], "agent")}
        if t["status"] == "wait":
            upd["status"] = "filling"
        form_task.touch(c, t["id"], **upd)
        log(c, "applicant", a["id"], o["id"], user, "填写表单", "保存 %d 格" % n)
        return {"ok": True, "saved": n, "stat": form_task.stat(c, t)}

    if path == "/task/submit":
        need("uom", "lead", "csp", "customer", "ubk")
        t, a, o = task_load(c, tid=body.get("id"), applicant_id=body.get("applicant_id"))
        task_guard(c, user, o, True)
        if t["status"] in ("confirmed", "official"):
            raise Err("表单已确认，无需重复提交")
        miss = form_task.missing_required(c, t)
        form_task.touch(c, t["id"], status="submitted", submit_at=now(),
                        filled_by=t["filled_by"] or
                        form_task.ROLE_FILLED_BY.get(user["role"], "agent"))
        log(c, "applicant", a["id"], o["id"], user, "表单提交",
            "待专员复核；仍有 %d 格未填" % len(miss) if miss else "待专员复核；必填项已齐")
        return {"ok": True, "missing": miss,
                "msg": "已提交，专员会复核后到官方网站录入"
                       + ("；还有 %d 格没填，专员可能会再找您补" % len(miss) if miss else "")}

    if path == "/task/confirm":
        need("uom", "lead")
        t, a, o = task_load(c, tid=body.get("id"), applicant_id=body.get("applicant_id"))
        miss = form_task.missing_required(c, t)
        if miss:
            # 硬拦：官网录入是一次性动作，带着空格去录等于白跑一趟，
            # 高风险字段空着更可能被当成隐瞒
            raise Err("还有 %d 格必填未完成，不能确认：%s%s"
                      % (len(miss), "、".join(m["name"][:14] for m in miss[:3]),
                         " 等" if len(miss) > 3 else ""))
        # 高风险题按业务口径由系统默认「否」，不向客人提起。复核这一步是唯一的人工关口：
        # 专员必须看过这份默认清单并签字，签的是自己的名字，流水上记得住。
        dft = [i for s in form_task.sections(c, t)[0] for i in s["items"]
               if i["risk"] and i["value_src"] == form_task.DEFAULT_SRC]
        if dft and not body.get("risk_ack"):
            raise Err("还有 %d 道高风险题是系统默认「否」、未与客户核对，"
                      "请先在页面上逐条过一遍并勾选确认" % len(dft))
        form_task.touch(c, t["id"], status="confirmed", confirm_at=now(),
                        confirm_by=user["name"])
        log(c, "applicant", a["id"], o["id"], user, "表单复核确认",
            "全部必填已齐；其中 %d 道高风险题为系统默认「否」，"
            "已由 %s 确认无异议，可到官方网站人工录入" % (len(dft), user["name"])
            if dft else "全部必填已齐，可由专员到官方网站人工录入")
        return {"ok": True, "msg": "已确认。请到官方网站人工录入后回填 Application ID",
                "official_url": (one(c, "select official_url from formver where id=?",
                                     (t["formver_id"],)) or {}).get("official_url")}

    if path == "/task/en/gen":
        # 一键生成英文。客人填的是中文，DS-160 官网只收英文/拼音，这一步一直缺着
        # （唐美芳 2026-09-03：「填写完所有资料后，还得翻译成英文……最后才是提交到官网」）。
        # 人名走本地拼音（规则确定、秒出），地址/单位/职位/职责/地名走 AI 批量翻一次。
        # **结果一律当草稿**：写进 value_en 后专员逐格核，改完才算数——
        # 地址、单位名错一个词就可能被使领馆问。
        need("uom", "lead")
        t, a, o = task_load(c, tid=body.get("id"), applicant_id=body.get("applicant_id"))
        if t["status"] == "official":
            raise Err("本表已提交至官网，不能再改")
        fs = rows(c, "select id,name,en_rule from form_field"
                     " where formver_id=? and need_en=1 order by sort", (t["formver_id"],))
        ans = {r["field_id"]: r["value"] for r in rows(
            c, "select field_id,value from form_answer where task_id=?", (t["id"],))}
        force = bool(body.get("force"))
        have = {r["field_id"]: r["value_en"] for r in rows(
            c, "select field_id,value_en from form_answer where task_id=?", (t["id"],))}
        todo = [f for f in fs if force or not (have.get(f["id"]) or "").strip()]
        if not todo:
            return {"ok": True, "n": 0, "msg": "英文都已生成，如需重做请选「重新生成」"}
        out, by_ai, failed = en_trans.build(todo, ans)
        for fid, en in out.items():
            c.execute("update form_answer set value_en=?, updated_at=? where task_id=? and field_id=?",
                      (en, now(), t["id"], fid))
        log(c, "applicant", a["id"], o["id"], user, "生成英文译文",
            "共 %d 格：AI 翻译 %d 格、拼音转写 %d 格%s"
            % (len(out), len(by_ai), len(out) - len(by_ai),
               ("；%d 格未翻出，需人工填" % len(failed)) if failed else ""))
        return {"ok": True, "n": len(out), "ai": len(by_ai), "failed": len(failed),
                "msg": "已生成 %d 格英文%s，请逐格核对后再去官网录入"
                       % (len(out), ("，%d 格没翻出来要人工填" % len(failed)) if failed else "")}

    if path == "/task/en/save":
        # 单格改英文。机器翻的只是草稿，专员核对时改哪格存哪格。
        need("uom", "lead")
        t, a, o = task_load(c, tid=body.get("id"), applicant_id=body.get("applicant_id"))
        if t["status"] == "official":
            raise Err("本表已提交至官网，不能再改")
        fid = int(body.get("field_id") or 0)
        f = one(c, "select * from form_field where id=? and formver_id=?", (fid, t["formver_id"]))
        if not f:
            raise Err("字段不存在")
        v = (body.get("value_en") or "").strip()
        c.execute("insert into form_answer(task_id,field_id,value,value_en,src,\"by\",updated_at)"
                  " values(?,?,'',?,'manual',?,?)"
                  " on conflict(task_id,field_id) do update set"
                  " value_en=excluded.value_en, updated_at=excluded.updated_at",
                  (t["id"], fid, v, user["name"], now()))
        log(c, "applicant", a["id"], o["id"], user, "修改英文译文",
            "%s → %s" % (f["name"][:20], v[:40] or "（清空）"))
        return {"ok": True}

    if path == "/task/unconfirm":
        # 撤回复核确认，把表退回「填写中」，之后才能再改格子。
        # 2026-09-03 加：唐美芳要求官网填表对照单上「允许二次修改调整」，
        # 但已确认的表直接放开改会绕过复核关口——高风险题的人工签字就白签了。
        # 所以走「先撤回、再修改、再重新确认」，每一步都留痕。
        # 已经录进官网的（official）不给撤回：官网那边已经是提交状态，
        # 系统里改成什么样都不会同步过去，改了只会让两边对不上。
        need("uom", "lead")
        t, a, o = task_load(c, tid=body.get("id"), applicant_id=body.get("applicant_id"))
        if t["status"] == "official":
            raise Err("本表已提交至官网并回填了受理号，不能再撤回修改；"
                      "如官网信息有误，请在官网上修改后同步更正这里")
        if t["status"] != "confirmed":
            raise Err("只有已确认的表才需要撤回")
        form_task.touch(c, t["id"], status="filling", confirm_at=None, confirm_by=None)
        log(c, "applicant", a["id"], o["id"], user, "撤回表单确认",
            "%s 撤回复核，表退回「填写中」，可继续修改" % user["name"])
        return {"ok": True, "msg": "已撤回确认，现在可以修改"}

    # 专员在官网人工录完之后回填 Application ID：这是系统与官网之间唯一的衔接点。
    if path == "/task/official":
        need("uom", "lead")
        t, a, o = task_load(c, tid=body.get("id"), applicant_id=body.get("applicant_id"))
        if t["status"] not in ("confirmed", "official"):
            raise Err("请先完成复核确认，再到官网录入")
        app_id = arg("app_id")
        # 提交至官网这一步才校验付款：在此之前收料、审材料、填表都与钱无关
        pay_guard(c, o["id"])
        form_task.touch(c, t["id"], status="official", official_app_id=app_id)
        c.execute("update applicant set app_id=?,barcode=? where id=?",
                  (app_id, body.get("barcode") or a["barcode"] or barcode_of(app_id), a["id"]))
        pr1 = one(c, "select * from product where id=?", (o["product_id"],))
        idname = official_id_name(pr1["country"] if pr1 else "")
        log(c, "applicant", a["id"], o["id"], user, "提交至官网并回填",
            "%s %s（专员在官方网站人工提交后回填）" % (idname, app_id))
        nxt = next_after_official(c, a)
        if PORDER.index(a["progress"]) < PORDER.index(nxt):
            set_progress(c, a["id"], nxt, user,
                         "" if nxt == "P4" else "该产品免面签，无需预约，直接进入待出签")
        return {"ok": True, "next": nxt, "id_name": idname}

    if path == "/task/share":
        # 下单人也能分享：一张单多个办签人，家人各填各的是常态
        # （唐美芳 2026-08-31：「这个页面后续分享客人之后，还能直接填写呢」）。
        # 客户只能分享自己订单里的人，这一条由下面的归属校验兜底。
        need("uom", "lead", "csp", "customer", "ubk")
        t, a, o = task_load(c, tid=body.get("id"), applicant_id=body.get("applicant_id"))
        if user["role"] == "customer":
            if o["buyer_user"] != user["id"]:
                raise Err("无权分享该订单", 403)
        else:
            task_guard(c, user, o, True)
        if t["status"] in ("confirmed", "official"):
            raise Err("表单已确认，不再开放客户填写")
        days = int(body.get("days") or form_task.SHARE_DAYS)
        # 传 0 或负数会生成一条「一出生就过期」的链接，发出去客人只会看到报错
        if days < 1 or days > 30:
            raise Err("分享有效期需在 1–30 天之间")
        token = form_task.new_token()
        form_task.touch(c, t["id"], share_token=token, share_expire=now(days))
        log(c, "applicant", a["id"], o["id"], user, "生成填表分享链接",
            "%s 有效期 %d 天" % (a["name_cn"], days))
        return {"ok": True, "token": token, "expire": now(days),
                # 前端自己决定路由形式，这里只给 token 和一个可直接用的相对路径
                # 免登录页就是 fill.html，直接给能点开的地址，前端不用再拼
                "url": "%s/fill.html?token=%s" % (PREFIX, token)}

    # ---------- 免登录：分享链接给客人填 ----------
    # 客人不是系统用户，不该为了填张表去注册账号。所以走 token，不走登录态。
    # 代价是必须脱敏：这个接口只回填表需要的东西，订单金额、结算价、同行其他办签人的
    # 证件信息一概不回——链接可能被转发到家庭群里。
    if path in ("/pub/task", "/pub/task/save", "/pub/task/submit", "/pub/task/upload"):
        token = arg("token")
        t = one(c, "select * from form_task where share_token=?", (token,))
        if not t:
            raise Err("链接无效", 404)
        if (t["share_expire"] or "") < now():
            raise Err("链接已过期，请联系为您服务的顾问重新发送", 403)
        a = one(c, "select * from applicant where id=?", (t["applicant_id"],))
        o = one(c, "select * from ord where id=?", (a["ord_id"],))
        p = one(c, "select * from product where id=?", (o["product_id"],)) or {}
        fv = one(c, "select * from formver where id=?", (t["formver_id"],)) or {}
        # 传材料跟填表是两件事：表被专员确认了，材料照样可以补传，
        # 所以这一支单独走，不受下面「表单已确认」的锁。
        if path == "/pub/task/upload":
            m = one(c, "select * from mat where id=? and applicant_id=?",
                    (arg("mat_id"), a["id"]))
            if not m:
                # 只认这位办签人自己的材料。token 在客人手里，请求可以伪造，
                # 不能靠前端只渲染自己的项来保证。
                raise Err("材料不存在", 404)
            if "upload" not in jl(m["provide_way"]):
                raise Err("这一项需要寄原件或面试当天携带，不支持线上提交")
            fn = body.get("file_name") or ""
            url = body.get("file_url") or ""
            if not url:
                raise Err("请先选择文件")
            ai = ai_precheck(m["mat_name"], fn)
            c.execute("update mat set status='review',file_name=?,file_url=?,ai_msg=?,"
                      "reject_reason=null,updated_at=? where id=?",
                      (fn, url, ai, now(), m["id"]))
            if a["progress"] == "P1":
                set_progress(c, a["id"], "P2", PUB_ACTOR)
            log(c, "applicant", a["id"], o["id"], PUB_ACTOR, "客户提交材料",
                "%s（分享链接上传）" % m["mat_name"])
            return {"ok": True, "ai_msg": ai,
                    "materials": mat_list(c, a["id"]), "mat_stat": mat_stat(c, a["id"])}

        if path != "/pub/task":
            if t["status"] in ("confirmed", "official"):
                raise Err("表单已由专员确认，如需修改请联系顾问")
            if path == "/pub/task/save":
                items = body.get("answers") or \
                    ([{"field_id": body.get("field_id"), "value": body.get("value")}]
                     if body.get("field_id") else [])
                # 页面上看不见的格子，接口上也不许写。token 在客人手里，
                # 请求是可以伪造的，不能只靠前端不渲染来保证。
                shown = {i["field_id"] for s in form_task.sections(c, t, for_customer=True)[0]
                         for i in s["items"]}
                items = [i for i in items if i.get("field_id") in shown]
                try:
                    n = form_task.save_answers(c, t, items, "manual", "客户本人")
                except ValueError as ve:
                    raise Err(str(ve))
                form_task.touch(c, t["id"], filled_by="self",
                                status="filling" if t["status"] == "wait" else t["status"])
                # 免登录填写没有系统账号，流水上记成「客户本人」而不是「系统」，
                # 否则事后追责时分不清是客人自己填的还是我司代填的
                log(c, "applicant", a["id"], o["id"], PUB_ACTOR, "客户填写表单",
                    "分享链接填写，保存 %d 格" % n)
                return {"ok": True, "saved": n, "stat": form_task.stat(c, t)}
            miss = form_task.missing_required(c, t)
            # 客人只该看到「你还没答的」。ocr/sys 空着是我们这边没数据源，
            # 把「护照号未填」列给客人看，他打开证件一看明明有，只会以为系统坏了。
            ask = [m for m in miss if m["src"] == "ask"]
            form_task.touch(c, t["id"], status="submitted", submit_at=now(), filled_by="self")
            log(c, "applicant", a["id"], o["id"], PUB_ACTOR, "客户提交表单",
                "分享链接提交；客户待答 %d 格、待专员补 %d 格" % (len(ask), len(miss) - len(ask)))
            return {"ok": True, "missing": [m["name"] for m in ask],
                    "missing_ask": ask, "missing_agent": len(miss) - len(ask),
                    "msg": "已提交，顾问会复核后到官方网站录入"}
        secs, fields, _ = form_task.sections(c, t, for_customer=True)
        # 分享页与小程序里看到的分步必须一致，两边用同一份归并
        secs = form_task.merge_for_customer(secs)
        # 客人端的「共几题」必须只数他看得见的题。全局 stat 里 ask_total 是 34，
        # 含 15 道已被系统默认掉、页面上根本不存在的高风险题——
        # 直接下发会出现「已答 19 / 34」，客人翻遍页面也找不到那 15 题。
        vis = [i for s in secs for i in s["items"] if i["src"] == "ask" and i["required"]]
        st = dict(form_task.stat(c, t),
                  ask_total=len(vis),
                  ask_left=len([i for i in vis if not i["value"]]))
        return {"task_id": t["id"], "status": t["status"],
                "status_text": form_task.STATUS.get(t["status"]),
                "name": a["name_cn"], "ord_no": o["no"],
                "product": p.get("name"), "country": p.get("country"),
                "form_code": fv.get("form_code"), "form_name": fv.get("name"),
                "ver_no": fv.get("ver_no"), "expire": t["share_expire"],
                "stat": st, "sections": secs,
                # 唐美芳 2026-08-31：「这个页面后续分享客人之后，还能直接填写呢」——
                # 客人一个链接就该把该办的都办了：表填了，材料也传了。
                # 原来分享页只有表单，材料得客人回小程序自己找，等于把活儿又推回去。
                "materials": mat_list(c, a["id"]),
                "mat_stat": mat_stat(c, a["id"]),
                "mail_addr": mail_addr_of(c, o),
                # 进度也放进来。唐美芳 2026-08-31 给的「闪签原型」里，客人端是三步：
                # 上传资料 / 填申请表 / 进度跟踪。我们分享页原来只有前两步，
                # 客人交完东西就不知道办到哪了，只能回头问顾问。
                "track": pub_track(c, a, o),
                "notice": "本表信息将用于向美国使领馆提交签证申请，请如实填写；"
                          "带「重要」标记的题目填错可能导致拒签。"}

    if path == "/fee/save":
        need("uom", "ubk")
        aid = int(arg("applicant_id"))
        a = one(c, "select * from applicant where id=?", (aid,))
        if user["role"] == "ubk":
            sup_wo_guard(c, user, aid)
        amt = float(arg("amount"))
        c.execute("update applicant set cgi_receipt=?,fee_amount=? where id=?",
                  (arg("receipt_no"), amt, aid))
        # ⚠️ advance 是**众信的垫付台账**，记的是「我方替客户垫了多少、回头要收回」。
        # 供应商缴的官费是他自己的成本，已经含在结算价里，写进这张台账会让众信
        # 凭空多出一笔应收。所以供应商回填只更新收据号，不入台账。
        if user["role"] != "ubk":
            c.execute("insert into advance(applicant_id,item,amount,receipt_no,op_user,created_at)"
                      " values(?,?,?,?,?,?)",
                      (aid, body.get("item") or "CGI 签证费", amt, arg("receipt_no"),
                       user["id"], now()))
        log(c, "applicant", aid, a["ord_id"], user, "缴费回填",
            "%s %.0f 元，收据号 %s%s" % (body.get("item") or "CGI 签证费", amt,
                                          arg("receipt_no"),
                                          "（供应商回传，不入垫付台账）"
                                          if user["role"] == "ubk" else "（已入垫付台账）"))
        return {"ok": True}

    if path == "/batch/list":
        need("uom", "lead")
        out = []
        for b in rows(c, "select * from batch order by id desc"):
            aps = rows(c, "select a.id,a.name_cn,a.progress,o.no as ord_no from applicant a"
                          " join ord o on o.id=a.ord_id where a.batch_id=?", (b["id"],))
            out.append(dict(b, applicants=aps, count=len(aps),
                            deliver_way_text=DELIVER_WAY.get(
                                b["deliver_way"] if "deliver_way" in b.keys() else "courier",
                                "快递送达")))
        return {"list": out, "deliver_ways": [[k, v] for k, v in DELIVER_WAY.items()]}

    if path == "/batch/create":
        need("uom")
        ids = body.get("applicant_ids") or []
        if not ids:
            raise Err("请选择办签人")
        no = nextno(c, "ST")
        # 递交方式与快递单号分两个字段存（2026-09-01 拆开，见 mig_batchway.py）：
        # 原来一个 courier 里塞的是「顺丰 SF000069453」，
        # 结果列表筛选「递交方式」的下拉列出了 19 个快递单号当选项，没法按方式筛。
        way = body.get("deliver_way")
        cr, ex = body.get("courier"), body.get("express")
        if way not in DELIVER_WAY:
            # 兼容只传一个 courier 的老调用（e2e、旧客户端）：
            # 「顺丰 SF000069453」这种拆成公司 + 单号，「专人递交」直接认方式，
            # 免得又攒出一批方式与单号糊在一起的数据。
            raw = (cr or "").strip()
            mm = re.match(r"^(顺丰|京东|中通|圆通|申通|韵达|EMS)\s*(\S+)?$", raw)
            if mm:
                way, cr, ex = "courier", mm.group(1), mm.group(2) or ex
            elif "专人" in raw or "自送" in raw:
                way, cr, ex = "staff", None, None
            elif "自取" in raw:
                way, cr, ex = "self", None, None
            else:
                way = "courier"
        cur = c.execute("insert into batch(no,submit_city,submit_date,deliver_way,courier,"
                        "express,status,created_at) values(?,?,?,?,?,?,'open',?)",
                        (no, body.get("submit_city") or "北京送签",
                         body.get("submit_date") or now()[:10], way,
                         cr if way == "courier" else None,
                         ex if way == "courier" else None, now()))
        bid = cur.lastrowid
        for i in ids:
            c.execute("update applicant set batch_id=? where id=?", (bid, i))
            a = one(c, "select * from applicant where id=?", (i,))
            log(c, "applicant", i, a["ord_id"], user, "并入送签批次", no)
        return {"ok": True, "no": no}

    if path == "/batch/send":
        need("uom")
        b = one(c, "select * from batch where no=?", (arg("no"),))
        c.execute("update batch set status='sent' where id=?", (b["id"],))
        for a in rows(c, "select * from applicant where batch_id=?", (b["id"],)):
            # 递交不再单独占一个进度：预约登记后就是「待出签」，
            # 送签递交是这个区间里的一个动作，记事件即可
            log(c, "applicant", a["id"], a["ord_id"], user, "随批次递交",
                "批次 %s 已送达使领馆" % b["no"])
            if PORDER.index(a["progress"]) < PORDER.index("P5"):
                set_progress(c, a["id"], "P5", user, "随批次 %s 递交" % b["no"])
        return {"ok": True}

    if path == "/result/save":
        # 供应商也能登记结果（唐美芳 2026-09-04：办理中心挪到供应商，
        # 让他们「直接标记最后是否出签」）。只能登记派给自己的那些工单。
        need("uom", "ubk")
        aid = int(arg("applicant_id"))
        a = one(c, "select * from applicant where id=?", (aid,))
        if user["role"] == "ubk":
            mine = c.execute("select count(*) from wo where applicant_id=? and sup_org=?",
                             (aid, user["org_id"])).fetchone()[0]
            if not mine:
                raise Err("该办签人不在派发至贵司的工单范围内", 403)
            # 与列表可见性同口径：没开资金闸门的工单供应商在界面上看不到，
            # 接口也不该让它写结果（2026-09-09 走查发现界面挡住、接口没挡）。
            og = one(c, "select gate from ord where id=?", (a["ord_id"],))
            if not og["gate"]:
                raise Err("该工单尚未派发至贵司（平台财务确认收款到账后自动派发）", 403)
        r = arg("result")
        if r not in RESULT:
            raise Err("非法结果")
        if r == "ap":
            # 行政审查是出签前的分支，不是主干节点——留在「待出签」，挂一个复查日
            c.execute("update applicant set visa_result='ap',ap_due=? where id=?", (now(15), aid))
            if PORDER.index(a["progress"]) < PORDER.index("P5"):
                set_progress(c, aid, "P5", user, "转行政审查，15 天后人工复查")
            log(c, "applicant", aid, a["ord_id"], user, "行政审查",
                "预计 %s 前复查（官方无 API，需人工查询后回填）" % now(15)[:10])
            return {"ok": True, "ap_due": now(15)}
        c.execute("update applicant set visa_result=?,visa_no=?,visa_valid_to=?,visa_stay=?,"
                  "reject_reason=?,reject_cate=?,ap_due=null where id=?",
                  (r, body.get("visa_no"), body.get("visa_valid_to"), body.get("visa_stay"),
                   body.get("reject_reason"), body.get("reject_cate"), aid))
        # 出签或拒签都算「已完成」（唐美芳 2026-09-02）
        set_progress(c, aid, "P6", user, RESULT[r])
        log(c, "applicant", aid, a["ord_id"], user, "回填签证结果",
            RESULT[r] + (("，签证号 %s，有效期至 %s" % (body.get("visa_no"),
                                                       body.get("visa_valid_to")))
                         if r == "pass" else ("，原因：%s" % (body.get("reject_reason") or ""))))
        return {"ok": True}

    if path == "/liability/set":
        need("uom", "lead")
        aid = int(arg("applicant_id"))
        lb = arg("liability")
        if lb not in LIABILITY:
            raise Err("非法责任类型")
        a = one(c, "select * from applicant where id=?", (aid,))
        c.execute("update applicant set liability=? where id=?", (lb, aid))
        log(c, "applicant", aid, a["ord_id"], user, "责任判定",
            LIABILITY[lb] + (("：" + body["note"]) if body.get("note") else ""))
        return {"ok": True, "refund_hint": refund_rule(c, aid, lb)}

    if path == "/deliver/create":
        need("uom")
        o = one(c, "select * from ord where no=?", (arg("ord_no"),))
        no = nextno(c, "CL")
        c.execute("insert into deliver(no,ord_id,addr_id,express,express_no,status,created_at)"
                  " values(?,?,?,?,?,'sent',?)",
                  (no, o["id"], o["recv_addr_id"], body.get("express"),
                   body.get("express_no"), now()))
        # 一单多人时按人返还：只推选中的办签人，不能因为寄了一份就把全单标成已交付
        pick = body.get("applicant_ids") or []
        for a in rows(c, "select * from applicant where ord_id=? and state='normal'", (o["id"],)):
            if pick and a["id"] not in pick:
                continue
            # 资料返还发生在「已完成」之后，不再占主干进度，只记事件
            log(c, "applicant", a["id"], o["id"], user, "资料返还", no)
        log(c, "ord", o["id"], o["id"], user, "资料返还寄出",
            "%s %s %s" % (no, body.get("express") or "", body.get("express_no") or ""))
        return {"ok": True, "no": no}

    if path == "/deliver/sign":
        need("customer", "csp")
        d = one(c, "select * from deliver where no=?", (arg("no"),))
        c.execute("update deliver set sign_name=?,signed_at=?,status='signed' where id=?",
                  (arg("sign_name"), now(), d["id"]))
        log(c, "ord", d["ord_id"], d["ord_id"], user, "客户签收资料", arg("sign_name"))
        return {"ok": True}

    if path == "/deliver/list":
        need("customer", "csp", "uom")
        out = []
        for d in rows(c, "select * from deliver order by id desc"):
            o = one(c, "select * from ord where id=?", (d["ord_id"],))
            if user["role"] == "customer" and o["buyer_user"] != user["id"]:
                continue
            # 门店只能看自己或本机构的返还单，不能看到别家门店的客户资料流向
            if user["role"] == "csp" and o["agent_user"] != user["id"] \
                    and o["org_id"] != (user["org_id"] or 0):
                continue
            out.append(dict(d, ord_no=o["no"]))
        return {"list": out}

    if path == "/wo/hold":
        need("uom", "lead")
        w = one(c, "select * from wo where no=?", (arg("no"),))
        st = "open" if w["status"] == "hold" else "hold"
        c.execute("update wo set status=?,hold_reason=? where id=?",
                  (st, body.get("reason"), w["id"]))
        log(c, "wo", w["id"], w["ord_id"], user,
            "解除挂起" if st == "open" else "挂起工单", body.get("reason") or "")
        return {"ok": True, "status": st}

    if path == "/wo/assign":
        need("lead")
        w = one(c, "select * from wo where no=?", (arg("no"),))
        u2 = one(c, "select * from user where id=?", (arg("owner_user"),))
        c.execute("update wo set owner_user=? where id=?", (u2["id"], w["id"]))
        log(c, "wo", w["id"], w["ord_id"], user, "派单/改派", "指派给 " + u2["name"])
        return {"ok": True}

    # ---------- C4 主管 ----------
    if path == "/lead/board":
        need("lead", "ops")
        ws = rows(c, "select * from wo")
        by_owner = {}
        for w in ws:
            u2 = one(c, "select name from user where id=?", (w["owner_user"],)) or {"name": "未派单"}
            b = by_owner.setdefault(u2["name"], {"owner": u2["name"], "total": 0,
                                                 "open": 0, "hold": 0, "overdue": 0})
            b["total"] += 1
            if w["status"] == "hold":
                b["hold"] += 1
            elif w["status"] != "done":
                b["open"] += 1
                if w["sla_due"] and w["sla_due"] < now():
                    b["overdue"] += 1
        cates = {}
        for a in rows(c, "select reject_cate from applicant where visa_result='reject'"):
            k = a["reject_cate"] or "未归因"
            cates[k] = cates.get(k, 0) + 1
        tot = c.execute("select count(*) from applicant where visa_result in "
                        "('pass','reject')").fetchone()[0]
        ok = c.execute("select count(*) from applicant where visa_result='pass'").fetchone()[0]
        return {"owners": list(by_owner.values()), "reject_cate": cates,
                "pass_rate": round(ok * 100.0 / tot, 1) if tot else None,
                "uoms": rows(c, "select id,name from user where role='uom'"),
                "hold": [wo_view(c, w) for w in rows(c, "select * from wo where status='hold'")],
                "refunds": rows(c, "select * from refund where status='applying'")}

    # ---------- 退款链路 ----------
    if path == "/refund/apply":
        need("customer", "csp")
        o = one(c, "select * from ord where no=?", (arg("no"),))
        ids = body.get("applicant_ids") or []
        if not ids:
            raise Err("请选择要退款的办签人")
        amt = 0.0
        pk = one(c, "select * from pkg where id=?", (o["pkg_id"],))
        unit = o["amount"] / max(o["pax"], 1)
        for i in ids:
            a = one(c, "select * from applicant where id=?", (i,))
            amt += refund_amount(unit, pk, a)
        no = nextno(c, "RF")
        c.execute("insert into refund(no,ord_id,applicant_ids,reason,reason_cate,amount,status,"
                  "created_at) values(?,?,?,?,?,?,'applying',?)",
                  (no, o["id"], json.dumps(ids), body.get("reason"),
                   body.get("reason_cate"), round(amt, 2), now()))
        log(c, "ord", o["id"], o["id"], user, "发起退款申请",
            "%s，%d 人，试算 %.0f 元" % (no, len(ids), amt))
        return {"ok": True, "no": no, "amount": round(amt, 2)}

    if path == "/refund/quote":
        need("customer", "csp")
        o = one(c, "select * from ord where no=?", (arg("no"),))
        pk = one(c, "select * from pkg where id=?", (o["pkg_id"],))
        unit = o["amount"] / max(o["pax"], 1)
        out = []
        for a in rows(c, "select * from applicant where ord_id=?", (o["id"],)):
            amt, why = refund_amount(unit, pk, a, True)
            out.append({"id": a["id"], "name": a["name_cn"], "state": a["state"],
                        "progress_text": PNAME[a["progress"]],
                        "result": RESULT.get(a["visa_result"], ""),
                        "liability_text": LIABILITY.get(a["liability"], ""),
                        "paid": round(unit, 2), "refundable": round(amt, 2), "rule": why})
        return {"unit": round(unit, 2), "pkg": pk["name"],
                "list": out}

    if path == "/refund/list":
        # 字段口径对齐众信「退款管理」。CSP 只读，看本店单。
        need("lead", "fin", "ops", "csp", "customer")
        is_csp = user["role"] == "csp"
        can_op = user["role"] in ("fin", "ops")
        out = []
        for r in rows(c, "select * from refund order by id desc"):
            o = one(c, "select * from ord where id=?", (r["ord_id"],))
            if user["role"] == "customer" and o["buyer_user"] != user["id"]:
                continue
            if is_csp and o["agent_user"] != user["id"] and o["org_id"] != user["org_id"]:
                continue
            names = [one(c, "select name_cn from applicant where id=?", (i,))["name_cn"]
                     for i in jl(r["applicant_ids"])]
            org = one(c, "select * from org where id=?", (o["org_id"],)) or {}
            sale = one(c, "select name from user where id=?", (o["agent_user"],)) or {}
            l1 = one(c, "select name from user where id=?", (r["l1_user"],)) or {}
            fu = one(c, "select name from user where id=?", (r["fin_user"],)) or {}
            # 原收款单：取该订单第一笔已放行的收款，退款原路退回的追溯依据
            src = one(c, "select * from pay where ord_id=? and kind='in' and fin_confirmed=1"
                         " order by id limit 1", (o["id"],)) or {}
            out.append(dict(r, ord_no=o["no"], names="、".join(names),
                            liability_text=LIABILITY.get(r["liability"], ""),
                            channel=o["channel"], org=org.get("name") or "直客",
                            cust_type=(src.get("cust_type") or "个人客户"),
                            sale=sale.get("name"), pax=o["pax"],
                            src_no=src.get("no"), src_trade_no=src.get("trade_no"),
                            cate=src.get("cate"), method=src.get("method") or "原路退回",
                            channel_name=src.get("channel_name"),
                            l1_name=l1.get("name"), fin_name=fu.get("name")))
        # 按订单汇总（凯撒 PRD 4.13.2「待退款订单」是订单视角，不是单据视角）：
        # 一张订单退了几个人、合计多少、走到哪一步，单据列表里要自己拼。
        agg = {}
        for r in out:
            g = agg.setdefault(r["ord_no"], {
                "ord_no": r["ord_no"], "channel": r.get("channel"), "org": r.get("org"),
                "sale": r.get("sale"), "pax": r.get("pax"), "n": 0, "names": [],
                "amount": 0.0, "done_amount": 0.0, "first_at": r["created_at"],
                "last_at": r["created_at"], "sts": []})
            g["n"] += 1
            g["names"] += [x for x in (r["names"] or "").split("、") if x]
            g["amount"] += r["amount"] or 0
            if r["status"] == "done":
                g["done_amount"] += r["amount"] or 0
            g["sts"].append(r["status"])
            if r["created_at"] and r["created_at"] < g["first_at"]:
                g["first_at"] = r["created_at"]
            if r["created_at"] and r["created_at"] > g["last_at"]:
                g["last_at"] = r["created_at"]
        for g in agg.values():
            st = g.pop("sts")
            # 订单级状态取「最不完成」的那个：只要还有在途的，整单就算退款中
            g["status"] = ("applying" if "applying" in st else
                           "l1" if "l1" in st else
                           "done" if all(x == "done" for x in st) else
                           "reject" if all(x == "reject" for x in st) else "part")
            g["status_text"] = {"applying": "待审核", "l1": "主管已批待出账",
                                "done": "已退完", "reject": "已驳回",
                                "part": "部分完成"}[g["status"]]
            g["names"] = "、".join(g["names"])
        return {"list": out, "by_order": sorted(agg.values(), key=lambda x: x["last_at"], reverse=True),
                "readonly": not can_op, "narrow": is_csp}

    if path == "/refund/detail":
        # 退款单详情。结构照收款单详情来：订单信息 + 退款单据 + 办签人明细 + 审批出账日志，
        # 底部按角色给动作（主管审批 / 财务出账）。
        # 唐美芳 2026-09-02：「uom 的收款管理、退款管理，为什么没有查看详情的页面呢」——
        # 收款那边 8-31 已经有了，退款一直只有列表。
        need("fin", "lead", "ops", "csp", "customer")
        r = one(c, "select * from refund where no=?", (arg("no"),))
        if not r:
            raise Err("退款单不存在", 404)
        o = one(c, "select * from ord where id=?", (r["ord_id"],))
        if user["role"] == "customer" and o["buyer_user"] != user["id"]:
            raise Err("无权查看该单据", 403)
        if user["role"] == "csp" and o["agent_user"] != user["id"] \
                and o["org_id"] != user["org_id"]:
            raise Err("无权查看该单据", 403)
        sp = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
        pk = one(c, "select * from pkg where id=?", (o["pkg_id"],))
        org = one(c, "select * from org where id=?", (o["org_id"],)) or {}
        sale = one(c, "select name from user where id=?", (o["agent_user"],)) or {}
        buyer = one(c, "select name from user where id=?", (o["buyer_user"],)) or {}
        l1 = one(c, "select name from user where id=?", (r["l1_user"],)) or {}
        fu = one(c, "select name from user where id=?", (r["fin_user"],)) or {}
        # 原收款单＝退款原路退回的追溯依据，口径与列表一致（该订单第一笔已放行的收款）
        src = one(c, "select * from pay where ord_id=? and kind='in' and fin_confirmed=1"
                     " order by id limit 1", (o["id"],)) or {}
        # 退款出账流水：出账时写在 pay(kind='out')，没出账就没有
        outp = one(c, "select * from pay where ord_id=? and kind='out' order by id desc",
                   (o["id"],)) or {}
        unit = o["amount"] / max(o["pax"], 1)
        ids = jl(r["applicant_ids"])
        # 全体办签人都列出来，本单退的标出来 —— 财务出账前要看清这一单退的是哪几个人、
        # 剩下的人还在办，不能只列被退的那几个。
        items = []
        for a in rows(c, "select * from applicant where ord_id=? order by id", (o["id"],)):
            amt, why = refund_amount(unit, pk, a, True)
            items.append({"id": a["id"], "name": a["name_cn"],
                          "id_type": a["id_type"] or "护照", "id_no": a["id_no"] or "",
                          "in_bill": a["id"] in ids,
                          "progress_text": PNAME[a["progress"]],
                          "result": RESULT.get(a["visa_result"], ""),
                          "state": a["state"], "paid": round(unit, 2),
                          "refundable": round(amt, 2), "rule": why})
        # 申请那条日志记在 ord 域（发起时退款单还没 id），审批与出账记在 refund 域。
        # 一张订单可能有多张退款单，所以 ord 域的只认 detail 里带了本单号的。
        evs = []
        for e in rows(c, "select * from event where ord_id=? order by id", (o["id"],)):
            if e["scope"] == "refund":
                if e["ref_id"] == r["id"]:
                    evs.append(e)
            elif "退款" in (e["action"] or "") and r["no"] in (e["detail"] or ""):
                evs.append(e)
        logs = [{"i": i + 1, "status": e["action"], "actor": e["actor_name"],
                 "at": e["created_at"], "note": e["detail"]} for i, e in enumerate(evs)]
        # 申请当时的试算金额。refund 表没存这个数，但发起时的日志里写了
        # （「RF-xxx，N 人，试算 M 元」）。已出账的单不能拿当前状态重算——
        # 人已经被标成 refunded，重算永远是 0，详情里就成了「试算 0 元却退了 460」。
        q_apply = None
        for e in evs:
            mm = re.search(r"试算\s*([\d.]+)\s*元", e["detail"] or "")
            if mm:
                q_apply = float(mm.group(1))
                break
        ST = {"applying": "待主管审批", "l1": "待财务出账", "done": "已出账", "reject": "已驳回"}
        return {
            "can_pay": user["role"] == "fin" and r["status"] == "l1",
            "can_approve": user["role"] == "lead" and r["status"] == "applying",
            "ord": {"no": o["no"], "created_at": o["created_at"],
                    "product": o["product_name"] or (sp["name"] if sp else ""),
                    "pkg": pk["name"] if pk else "",
                    "amount": o["amount"], "pax": o["pax"],
                    "sale_org": org.get("name") or "直客",
                    "channel_name": {"C": "客户小程序", "CSP": org.get("name") or "门店",
                                     "B": org.get("name") or "同业"}.get(o["channel"], ""),
                    "sale": sale.get("name") or buyer.get("name") or "—",
                    "depart_date": o["depart_date"],
                    "cust_type": src.get("cust_type") or "个人客户"},
            "rf": {"no": r["no"], "status": r["status"],
                   "status_text": ST.get(r["status"], r["status"]),
                   "amount": r["amount"], "reason": r["reason"],
                   "quote_apply": q_apply,
                   "settled": r["status"] in ("done", "reject"),
                   "reason_cate": r["reason_cate"],
                   "liability": r["liability"] or "none",
                   "liability_text": LIABILITY.get(r["liability"], ""),
                   "note": r["note"], "created_at": r["created_at"],
                   "created_by_name": r["created_by_name"] or (evs[0]["actor_name"] if evs else ""),
                   "n": len(ids),
                   "src_no": src.get("no"), "src_trade_no": src.get("trade_no"),
                   "src_cate": src.get("cate"), "src_method": src.get("method"),
                   "channel_name": src.get("channel_name"),
                   "method": "原路退回",
                   "out_trade_no": outp.get("trade_no") if r["status"] == "done" else None,
                   "l1_name": l1.get("name"), "l1_at": r["l1_at"],
                   "fin_name": fu.get("name"), "fin_at": r["fin_at"]},
            "items": items, "logs": logs,
            "liabilities": [{"v": k, "t": v} for k, v in LIABILITY.items()]}

    if path == "/refund/approve":
        need("lead")
        r = one(c, "select * from refund where no=?", (arg("no"),))
        if r["status"] != "applying":
            raise Err("状态不允许审批")
        if arg("action") == "reject":
            c.execute("update refund set status='reject',note=?,l1_user=?,l1_at=? where id=?",
                      (body.get("note"), user["id"], now(), r["id"]))
            log(c, "refund", r["id"], r["ord_id"], user, "退款驳回", body.get("note") or "")
            return {"ok": True}
        amt = float(body.get("amount") or r["amount"])
        c.execute("update refund set status='l1',amount=?,liability=?,l1_user=?,l1_at=?,note=?"
                  " where id=?", (amt, body.get("liability") or "none", user["id"], now(),
                                  body.get("note"), r["id"]))
        log(c, "refund", r["id"], r["ord_id"], user, "主管批准退款",
            "%.0f 元，责任：%s" % (amt, LIABILITY.get(body.get("liability") or "none")))
        return {"ok": True}

    if path == "/refund/pay":
        need("fin")
        r = one(c, "select * from refund where no=?", (arg("no"),))
        if r["status"] != "l1":
            raise Err("需主管先审批")
        c.execute("update refund set status='done',fin_user=?,fin_at=? where id=?",
                  (user["id"], now(), r["id"]))
        c.execute("insert into pay(ord_id,kind,amount,method,trade_no,fin_confirmed,fin_user,"
                  "fin_at,created_at) values(?,'out',?,'原路退回',?,1,?,?,?)",
                  (r["ord_id"], r["amount"], "RT" + uuid.uuid4().hex[:10].upper(),
                   user["id"], now(), now()))
        for i in jl(r["applicant_ids"]):
            c.execute("update applicant set state='refunded' where id=?", (i,))
        left = c.execute("select count(*) from applicant where ord_id=? and state='normal'",
                         (r["ord_id"],)).fetchone()[0]
        if not left:
            c.execute("update ord set status='refunded' where id=?", (r["ord_id"],))
        log(c, "refund", r["id"], r["ord_id"], user, "退款出账", "%.0f 元" % r["amount"])
        return {"ok": True}

    # ---------- C6 供应商 ----------
    if path == "/sup/products":
        # 2026-09-09 对 ops 放开：UOM 的产品管理要能直接「编辑产品 / 编辑套餐」，
        # 而那两个页面读的就是这个接口。供应商仍只看自己的，平台运营看全部。
        need("ubk", "ops")
        out = []
        _q = ("select * from sup_product" if user["role"] == "ops"
              else "select * from sup_product where org_id=?")
        _a = () if user["role"] == "ops" else (user["org_id"],)
        for sp in rows(c, _q, _a):
            p = one(c, "select * from product where id=?", (sp["product_id"],))
            pks = rows(c, "select * from pkg where sup_product_id=?", (sp["id"],))
            # 逐个套餐带上「已成交多少单」：有订单的套餐永远不能删，改价也要看这个数。
            for k in pks:
                k["used"] = c.execute("select count(*) from ord where pkg_id=?",
                                      (k["id"],)).fetchone()[0]
            ord_cnt = sum(k["used"] for k in pks)
            out.append({"id": sp["id"], "code": sp["code"], "name": sp["name"],
                        "name_suffix": sp["name_suffix"],
                        "country": p["country"],
                        "visa_type": p["visa_type"], "visa_cat": p["visa_cat"] or "",
                        "vendor_code": sp["vendor_code"] or "",
                        "hero_img": sp["hero_img"] or "",
                        # 办理流程三级回落：产品自配 → 该国默认 → 平台默认。
            # 原来产品没配时前端拿写死的 5 步兜底，运营改不了
            # （唐美芳 2026-09-01：默认流程也统一放进运营配置）。
            "flow": flow_of(c, sp, p),
                        "submit_city": p["submit_city"],
                        # 受理居住地范围与受理说明落在平台目录产品上，供应商侧也要能改
                        "accept_provinces": jl(p["accept_provinces"]),
                        "accept_note": p["accept_note"] or "",
                        "status": sp["status"], "feature": sp["feature"],
                        "svc_tags": jl(sp["svc_tags"], []),
                        "review_b": sp["review_b"], "review_b_note": sp["review_b_note"],
                        "review_b_at": sp["review_b_at"], "review_b_by": sp["review_b_by"],
                        "review_b_imgs": jl(sp["review_b_imgs"], []),
                        "review_c": sp["review_c"], "review_c_note": sp["review_c_note"],
                        "review_c_at": sp["review_c_at"], "review_c_by": sp["review_c_by"],
                        "review_c_imgs": jl(sp["review_c_imgs"], []),
                        "on_b": sup_on(sp, "b"), "on_c": sup_on(sp, "c"),
                        "to_b": sp["to_b"], "to_c": sp["to_c"], "addr_id": sp["addr_id"],
                        "fullver_id": sp["fullver_id"] or p["fullver_id"],
                        # 清单的版本号与名称也要下发：产品列表要按清单筛选
                        # （材料库列表点「关联签证产品」跳过来时带的就是版本号），
                        # 原来只给 id，前端拿不到能显示、能比对的值（2026-09-09）。
                        "fullver": (one(c, "select ver_no from fullver where id=?",
                                        (sp["fullver_id"] or p["fullver_id"],)) or {}).get("ver_no"),
                        "fullver_name": (one(c, "select name from fullver where id=?",
                                             (sp["fullver_id"] or p["fullver_id"],)) or {}).get("name"),
                        # 本产品对平台清单做过的增删，详情页要照它还原成实际清单
                        "mat_custom": jl(sp["mat_custom"], {"add": [], "skip": []}),
                        "base_settle": min([k["settle_price"] for k in pks] or [0]),
                        "packages": pks, "ord_cnt": ord_cnt,
                        "state": sup_state(sp), "policy": sup_policy(sp, ord_cnt),
                        # 报价倒挂：结算价比自己定的建议零售价还高，卖一单亏一单。
                        # 原来这个预警是从渠道分组投放价算的，而渠道上是供应商统一定的售价
                        # （唐美芳 2026-08-26），分组价那一层不存在，只能拿套餐本身算。
                        "warn": any(k["settle_price"] > k["suggest_retail"] > 0 for k in pks)})
            aud(out[-1], sp)
        return {"list": out, "visa_cats": VISA_CATS,
                "svc_opts": SVC_OPTS, "svc_fixed": SVC_FIXED, "pkg_max": PKG_MAX}

    if path == "/sup/pkg/save":
        need("ubk", "ops")
        pk = one(c, "select * from pkg where id=?", (arg("id"),))
        sp = sp_pick(c, user, pk["sup_product_id"]) if pk else None
        if not sp:
            raise Err("套餐不存在", 404)
        pol = sup_policy(sp, c.execute("select count(*) from ord where pkg_id in"
                                       " (select id from pkg where sup_product_id=?)",
                                       (sp["id"],)).fetchone()[0])
        # 预订须知、拒签保障不涉及价格，在售也能改；价格与时效受在售锁约束
        PRICE_KEYS = ("visa_fee", "service_fee", "settle_price", "suggest_retail", "lead_days")
        if any(k in body for k in PRICE_KEYS):
            sup_guard(pol, "price")
        vf, sf, st, rt = pkg_prices(body, pk)
        if any(k in body for k in ("book_notice", "pkg_desc", "refund_insured")):
            sup_guard(pol, "notice")
        c.execute("update pkg set name=?,visa_fee=?,service_fee=?,settle_price=?,suggest_retail=?,"
                  "lead_days=?,book_notice=?,pkg_desc=?,refund_insured=? where id=?",
                  (body.get("name") or pk["name"], vf, sf, st, rt,
                   int(body.get("lead_days", pk["lead_days"])),
                   clean_rich(body.get("book_notice", pk["book_notice"])),
                   clean_rich(body.get("pkg_desc", pk["pkg_desc"])),
                   1 if body.get("refund_insured", pk["refund_insured"]) else 0, pk["id"]))
        reprice_pkg(c, pk["id"])
        log(c, "pkg", pk["id"], None, user, "调整套餐报价",
            "%s：签证费 %.0f / 服务费 %.0f / 结算价 %.0f / 建议零售价 %.0f"
            % (pk["name"], vf, sf, st, rt))
        # 改价改时效＝客人看到的和成交的会不一致，先下架；改完点上架即刻恢复，不用再过审
        off = auto_offline(c, sp, user, "套餐「%s」报价 / 时效有调整" % pk["name"]) \
            if any(k in body for k in PRICE_KEYS) else False
        return {"ok": True, "settle_price": st, "auto_off": off}

    if path == "/sup/orders":
        need("ubk")
        out = []
        # 被「财务确认收款到账」挡在外面的工单要计数并说明原因，
        # 否则供应商看到的是一张空表，只能来问「订单都收款了怎么没数据」
        # （唐美芳 2026-09-08 就是这么问的）。
        gate_wait = 0
        memo = {}                       # 整张列表共用一份只读维表缓存
        for w in rows(c, "select * from wo where sup_org=? order by sla_due", (user["org_id"],)):
            o = one(c, "select * from ord where id=?", (w["ord_id"],))
            if not o["gate"]:
                # 只统计「客人已付款、等财务核对水单」这一档；待付款和已取消的不算，
                # 那两种本来就轮不到供应商开工
                if o["status"] == "paid":
                    gate_wait += 1
                continue
            # 办签人姓名与手机号在这里<b>不脱敏</b>（唐美芳 2026-09-04：
            # 「ubk 里的签证办理中心，办签人信息不用打*吧」）。
            # 业务上也说得通：护照姓名必须一字不差才办得成签证，面签时间也要供应商直接通知本人，
            # 给个「李**」等于让他没法干活。订单列表与订单详情那两处仍按原口径脱敏。
            v = wo_view(c, w, memo=memo)
            # 供应商视角的金额口径：结算价是我方收入，签证费是官方成本，服务费是毛利
            pk = memo.setdefault(("pkg2", o["pkg_id"]),
                                 one(c, "select * from pkg where id=?", (o["pkg_id"],)) or {})
            v["ord_no"] = o["no"]
            v["pkg_name"] = pk.get("name")
            v["income"] = pk.get("settle_price") or 0        # 平台应付我方（每人）
            v["cost"] = pk.get("visa_fee") or 0              # 官费等硬成本（每人）
            v["profit"] = (pk.get("settle_price") or 0) - (pk.get("visa_fee") or 0)
            v["margin"] = round(v["profit"] / v["income"] * 100, 1) if v["income"] else 0
            pay = one(c, "select * from payable where ord_id=?", (o["id"],))
            v["settle_status"] = pay["status"] if pay else "none"
            out.append(v)
        return {"list": out, "gate_wait": gate_wait,
                "sum_income": sum(x["income"] for x in out),
                "sum_cost": sum(x["cost"] for x in out),
                "sum_profit": sum(x["profit"] for x in out),
                "note": "仅显示财务已确认收款到账的工单"}

    if path == "/sup/orderlist":
        # 供应商视角的**订单**列表（不是工单列表）。
        # 唐美芳 2026-08-31：「ubk 里的订单管理是不是和 csp、uom 订单管理有点脱节了，
        # 我看状态不太一样」——原来 UBK「订单列表」列的是工单（一人一张 VW），
        # 而 UOM/CSP 列的是订单，对账时说「这张订单」两边指的不是一个东西。
        # 现在统一成订单粒度，三端同一套七段结构；工单仍在，作为订单下的办签人明细。
        need("ubk")
        out = []
        for o in rows(c, "select * from ord where gate=1 order by id desc"):
            sp = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
            if not sp or sp["org_id"] != user["org_id"]:
                continue
            pk = one(c, "select * from pkg where id=?", (o["pkg_id"],)) or {}
            aps = rows(c, "select * from applicant where ord_id=? order by id", (o["id"],))
            ws = {w["applicant_id"]: w for w in rows(
                c, "select * from wo where ord_id=? and sup_org=?", (o["id"], user["org_id"]))}
            pay = one(c, "select * from payable where ord_id=?", (o["id"],))
            pb_due = c.execute("select ifnull(sum(amount),0) from payable where ord_id=?"
                               " and sup_org=?", (o["id"], user["org_id"])).fetchone()[0]
            pb_got = c.execute("select ifnull(sum(amount),0) from payable where ord_id=?"
                               " and sup_org=? and status='paid'",
                               (o["id"], user["org_id"])).fetchone()[0]
            rst = money_state(pb_due, pb_got) if pb_due else "unpaid"
            n = len(aps) or 1
            # 供应商视角的金额：结算价是我方收入，签证费是硬成本，差额是毛利。
            # 客户成交价与平台毛利不下发——那是平台与客户之间的价。
            income = (pk.get("settle_price") or 0) * n
            cost = (pk.get("visa_fee") or 0) * n
            out.append({
                "no": o["no"], "channel": o["channel"], "created_at": o["created_at"],
                "depart_date": o["depart_date"], "pax": o["pax"],
                "status": o["status"], "status_text": ORD_STATUS[o["status"]],
                "work_status": work_status(c, o), "gate": o["gate"],
                # 2026-09-07 唐美芳确认：供应商侧的联系人与办签人信息不再脱敏。
                # 办签本来就要按护照姓名一字不差地填，收料、通知面签时间都要直接联系本人；
                # 打了星号等于让供应商没法干活，还得回头找众信要一遍。
                # 金额侧的商业信息（客户成交价、平台毛利、收款流水）仍然不下发。
                "contact": o["contact_name"] or "",
                "phone": o["contact_phone"] or "",
                "product": sp["name"], "pkg": pk.get("name"),
                # 列表上点产品名跳产品详情（唐美芳 2026-09-08）
                "sup_product_id": sp["id"],
                "settle_amount": income, "cost": cost, "profit": income - cost,
                "margin": round((income - cost) / income * 100, 1) if income else 0,
                "settle_status": pay["status"] if pay else "none",
                "settle_text": {"open": "待结算", "paid": "已结算"}.get(
                    pay["status"] if pay else "none", "未挂账"),
                # 供应商看的是「平台什么时候把结算款付给我」，跟客户付没付钱是两笔账。
                # 一单目前只挂一条应付，将来分期挂多条时 part 自然就出现了。
                "recv_state": rst, "recv_state_text": RECV_ST_TEXT[rst],
                "applicants": [{
                    "id": a["id"], "name": a["name_cn"],
                    "progress": a["progress"], "progress_text": PNAME[a["progress"]],
                    "state": a["state"], "result": RESULT.get(a["visa_result"], ""),
                    "wo_no": (ws.get(a["id"]) or {}).get("no"),
                    "sla_due": (ws.get(a["id"]) or {}).get("sla_due"),
                    "overdue": bool((ws.get(a["id"]) or {}).get("sla_due")
                                    and ws[a["id"]]["sla_due"] < now()
                                    and a["progress"] != "P6")
                } for a in aps]})
        return {"list": out,
                "sum_income": sum(x["settle_amount"] for x in out),
                "sum_cost": sum(x["cost"] for x in out),
                "sum_profit": sum(x["profit"] for x in out),
                "note": "仅显示财务已确认收款到账的订单；客户姓名与手机号已脱敏"}

    # 「提醒客人补交材料」整个功能已于 2026-09-09 撤掉（唐美芳：「提醒客人补交材料，
    # 去掉这个功能，包括 C 端也去掉」）。原 /sup/urge 只登记一条催办事件、
    # 不实际发通知，对供应商是个没有反馈的空动作；催料该由众信侧统一发起。

    if path == "/sup/assign":
        # 供应商内部改派（唐美芳 2026-09-09：「uom 有改派，ubk 应该也有」）。
        # 只能指派给**本公司**的账号：跨公司改派等于把单子转给同行，
        # 那是众信的调度权，不是供应商能自己决定的。
        need("ubk")
        w = one(c, "select * from wo where no=? and sup_org=?", (arg("no"), user["org_id"]))
        if not w:
            raise Err("工单不存在或未派发至贵司", 403)
        uid = int(arg("sup_owner"))
        u2 = one(c, "select * from user where id=? and org_id=? and role='ubk'",
                 (uid, user["org_id"]))
        if not u2:
            raise Err("该经办人不在贵司账号内", 400)
        c.execute("update wo set sup_owner=?,updated_at=? where id=?", (uid, now(), w["id"]))
        a2 = one(c, "select * from applicant where id=?", (w["applicant_id"],))
        log(c, "applicant", a2["id"], w["ord_id"], user, "供应商改派经办人",
            "%s → %s" % (a2["name_cn"], u2["name"]))
        return {"ok": True, "name": u2["name"]}

    if path == "/sup/members":
        # 本公司可承接工单的账号，改派下拉用
        need("ubk")
        return {"list": [{"id": r["id"], "name": r["name"]} for r in rows(
            c, "select id,name from user where org_id=? and role='ubk' order by id",
            (user["org_id"],))]}

    if path == "/sup/progress":
        need("ubk")
        w = one(c, "select * from wo where no=? and sup_org=?", (arg("no"), user["org_id"]))
        if not w:
            raise Err("工单不存在或无权访问", 403)
        # 2026-09-04 起供应商侧走通用三态（G1 待收料 / G2 处理中 / G3 已出结果），
        # 不再要求他们按美签那六步逐个点。老的 P 码仍然收，免得旧客户端报错。
        new = arg("progress")
        tgt = G_ENTRY.get(new, new)
        if tgt not in PORDER:
            raise Err("非法进度")
        a = one(c, "select * from applicant where id=?", (w["applicant_id"],))
        # 未开资金闸门的工单在列表里对供应商是不可见的，接口这一层原来没跟上——
        # 界面上看不到、拿 applicant_id 直接调却能推进（2026-09-09 走查发现）。
        o2 = one(c, "select * from ord where id=?", (w["ord_id"],))
        if not o2["gate"]:
            raise Err("该工单尚未派发至贵司（平台财务确认收款到账后自动派发）", 403)
        if PORDER.index(tgt) <= PORDER.index(a["progress"]):
            raise Err("办理进度仅可向前推进，「%s」不在当前节点之后"
                      % GNAME.get(new, PNAME.get(tgt, new)), 400)
        # 「开始处理」必须以材料齐备为前提（唐美芳 2026-09-04：「不应该是真的要操作
        # 收齐资料么」）。这条口径 UI 上一直挡着（按钮只在 mat.ready 时渲染），
        # 但接口没挡——2026-09-09 走查里必交材料一项没收到，照样能标成「处理中」。
        if tgt == G_ENTRY["G2"]:
            st2 = mat_stat(c, a["id"])
            if not st2["ready"]:
                raise Err("必交材料尚未齐备（还差 %d 项），收齐并通过审核后方可标记「处理中」"
                          % (st2["cust_todo"] or st2["must"] - st2["pass"]), 400)
        # 「已出结果」必须带上出签还是拒签：只把人推到已完成、不写结果，
        # 客人在小程序上看到「已完成」却查不到签证结果，客服解释不了
        if tgt == "P6":
            raise Err("标记「已出结果」请使用「登记签证结果」，需同时填写出签或拒签", 400)
        set_progress(c, w["applicant_id"], tgt, user, "供应商回传")
        return {"ok": True, "stage": gstage(tgt)}

    if path == "/sup/settle":
        need("ubk")
        ps = rows(c, "select * from payable where sup_org=? order by id desc", (user["org_id"],))
        for p in ps:
            p["ord_no"] = (one(c, "select no from ord where id=?", (p["ord_id"],)) or {}).get("no")
        return {"list": ps, "open": sum(p["amount"] for p in ps if p["status"] == "open"),
                "paid": sum(p["amount"] for p in ps if p["status"] == "paid")}

    if path == "/sup/prepays":
        # UBK 结算管理 › 预付款管理。按众信「结算管理 › 付款管理 › 预付款管理」复刻。
        # 三条状态线各自独立：申请状态（平台审申请）/ 发票状态（平台审发票）/ 付款状态（财务打没打款）。
        need("ubk", "fin", "ops", "lead")
        w, a = ("where sup_org=?", (user["org_id"],)) if user["role"] == "ubk" else ("", ())
        AS = {"pending": "待审核", "approved": "已审核", "rejected": "已驳回"}
        IS = {"pending": "待审核", "approved": "已审核", "none": "未提交", "rejected": "已驳回"}
        PS = {"unpaid": "未付款", "paid": "已付款", "part": "部分付款"}
        out = [dict(r, apply_text=AS.get(r["apply_status"], r["apply_status"]),
                    invoice_text=IS.get(r["invoice_status"], "未提交"),
                    pay_text=PS.get(r["pay_status"], r["pay_status"]))
               for r in rows(c, "select * from prepay " + w + " order by id desc", a)]
        return {"list": out,
                "wait_apply": len([x for x in out if x["apply_status"] == "pending"]),
                "wait_pay": sum(x["amount"] for x in out
                                if x["apply_status"] == "approved" and x["pay_status"] == "unpaid"),
                "paid": sum(x["amount"] for x in out if x["pay_status"] == "paid"),
                "owe_inv": len([x for x in out if x["pay_status"] == "paid"
                                and x["invoice_status"] != "approved"])}

    if path == "/sup/bills":
        # UBK 结算管理 › 账单管理。金额分两组：账单总额/已收/请款，应付/已付/未付。
        need("ubk", "fin", "ops", "lead")
        w, a = ("where sup_org=?", (user["org_id"],)) if user["role"] == "ubk" else ("", ())
        AS = {"pending": "待审核", "approved": "已审核", "rejected": "已驳回"}
        IS = {"pending": "待审核", "approved": "已审核", "none": "未提交", "rejected": "已驳回"}
        PS = {"unpaid": "未付款", "paid": "已付款", "part": "部分付款"}
        out = []
        for r in rows(c, "select * from bill " + w + " order by id desc", a):
            d = dict(r, apply_text=AS.get(r["apply_status"], r["apply_status"]),
                     invoice_text=IS.get(r["invoice_status"], "未提交"),
                     pay_text=PS.get(r["pay_status"], r["pay_status"]))
            d["unpaid_amount"] = round((r["payable_amount"] or 0) - (r["paid_amount"] or 0), 2)
            out.append(d)
        return {"list": out,
                "wait_apply": len([x for x in out if x["apply_status"] == "pending"]),
                "wait_pay": sum(x["unpaid_amount"] for x in out if x["apply_status"] == "approved"),
                "paid": sum(x["paid_amount"] for x in out),
                "owe_inv": len([x for x in out if x["invoice_status"] in ("none", "rejected")])}

    if path == "/sup/refunds":
        # 供应商预付款退款单（UBK 结算管理 › 预付款退款管理）。
        # 客户退款出账后，平台已对供应商挂的结算款要按办签进度冲减——
        # 在此之前钱退给客户了、账还挂在供应商名下，是个真实缺口。
        need("ubk", "fin", "ops", "lead")
        w, a = ("where sr.sup_org=?", (user["org_id"],)) if user["role"] == "ubk" else ("", ())
        out = []
        for r in rows(c, "select sr.* from sup_refund sr " + w + " order by sr.id desc", a):
            o = one(c, "select * from ord where id=?", (r["ord_id"],))
            sp = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
            rf = one(c, "select * from refund where id=?", (r["refund_id"],)) or {}
            pa = one(c, "select * from payable where id=?", (r["payable_id"],)) or {}
            AS2 = {"pending": "待审核", "approved": "已审核", "rejected": "已驳回"}
            IS2 = {"pending": "待审核", "approved": "已审核", "rejected": "已驳回"}
            out.append(dict(r, ord_no=o["no"], product=sp["name"] if sp else "",
                            progress_text=PNAME.get(r["progress"], r["progress"]),
                            cust_refund_no=rf.get("no"), cust_refund_amt=rf.get("amount"),
                            payable_status=pa.get("status"),
                            apply_text=AS2.get(r["apply_status"], "待审核"),
                            invoice_text=IS2.get(r["invoice_status"], "—"),
                            status_text={"pending": "未退款", "confirmed": "待退款",
                                         "done": "已退款", "rejected": "有异议"}[r["status"]]))
        return {"list": out,
                "pending_amt": sum(x["amount"] for x in out if x["status"] == "pending"),
                "confirmed_amt": sum(x["amount"] for x in out if x["status"] == "confirmed"),
                "done_amt": sum(x["amount"] for x in out if x["status"] == "done")}

    if path == "/sup/refund/act":
        # 供应商确认 / 提异议；平台财务标记已收到退回款
        need("ubk", "fin", "ops")
        r = one(c, "select * from sup_refund where no=?", (arg("no"),))
        if not r:
            raise Err("退款单不存在")
        if user["role"] == "ubk" and r["sup_org"] != user["org_id"]:
            raise Err("无权操作该单据", 403)
        act = arg("action")
        if act == "confirm":
            if r["status"] != "pending":
                raise Err("只有待确认的单据可以确认")
            c.execute("update sup_refund set status='confirmed',confirm_at=? where id=?",
                      (now(), r["id"]))
            log(c, "sup_refund", r["id"], r["ord_id"], user, "供应商确认退款金额", r["no"])
            return {"ok": True, "msg": "已确认，等待退回结算款"}
        if act == "reject":
            if r["status"] != "pending":
                raise Err("只有待确认的单据可以提异议")
            c.execute("update sup_refund set status='rejected',note=? where id=?",
                      (body.get("note") or "对冲减金额有异议", r["id"]))
            log(c, "sup_refund", r["id"], r["ord_id"], user, "供应商提出异议",
                body.get("note") or "")
            return {"ok": True, "msg": "已提交异议，平台财务会联系你核对"}
        if act == "done":
            # 只有平台财务能确认收到退回款；同时冲减那笔应付
            if user["role"] not in ("fin", "ops"):
                raise Err("只有平台财务可以确认收款", 403)
            if r["status"] != "confirmed":
                raise Err("供应商尚未确认")
            c.execute("update sup_refund set status='done',done_at=? where id=?", (now(), r["id"]))
            if r["payable_id"]:
                pa = one(c, "select * from payable where id=?", (r["payable_id"],))
                if pa:
                    c.execute("update payable set amount=? where id=?",
                              (max(0.0, (pa["amount"] or 0) - (r["amount"] or 0)), pa["id"]))
            log(c, "sup_refund", r["id"], r["ord_id"], user, "确认收到退回结算款",
                "%s 冲减应付 %.0f" % (r["no"], r["amount"] or 0))
            return {"ok": True, "msg": "已确认收款并冲减应付"}
        raise Err("未知动作")

    # ---------- C6 供应商：收料地址 ----------
    if path == "/sup/addrs":
        # ops 代供应商编辑产品时要选收货地址，所以放开为全部机构的地址；
        # 供应商自己仍然只看得到本公司的（2026-09-09）。
        need("ubk", "ops")
        if user["role"] == "ops":
            return {"list": rows(c, "select * from addr where owner_kind='org'"
                                    " order by owner_id, is_default desc, id")}
        return {"list": rows(c, "select * from addr where owner_kind='org' and owner_id=?"
                                " order by is_default desc, id", (user["org_id"],))}

    if path == "/sup/addr/save":
        need("ubk")
        f = (arg("region"), arg("detail"), arg("contact"), arg("phone"),
             1 if body.get("is_default") else 0)
        if body.get("is_default"):
            c.execute("update addr set is_default=0 where owner_kind='org' and owner_id=?",
                      (user["org_id"],))
        if body.get("id"):
            c.execute("update addr set region=?,detail=?,contact=?,phone=?,is_default=?"
                      " where id=? and owner_id=?", f + (body["id"], user["org_id"]))
            aid = int(body["id"])
            act = "修改收料地址"
        else:
            c.execute("insert into addr(owner_kind,owner_id,region,detail,contact,phone,is_default)"
                      " values('org',?,?,?,?,?,?)", (user["org_id"],) + f)
            aid = c.execute("select last_insert_rowid()").fetchone()[0]
            act = "新增收料地址"
        log(c, "addr", aid, None, user, act, f[0] + f[1])
        return {"ok": True, "id": aid}

    if path == "/sup/addr/del":
        need("ubk")
        aid = int(arg("id"))
        used = c.execute("select count(*) from sup_product where addr_id=?", (aid,)).fetchone()[0]
        if used:
            raise Err("该地址已被 %d 个产品使用，不能删除" % used)
        c.execute("delete from addr where id=? and owner_kind='org' and owner_id=?",
                  (aid, user["org_id"]))
        log(c, "addr", aid, None, user, "删除收料地址", "")
        return {"ok": True}

    # ---------- C6 供应商：渠道组与加价策略 ----------
    if path == "/sup/groups":
        need("ubk")
        out = []
        for g in rows(c, "select * from chan_group where org_id=? order by id", (user["org_id"],)):
            r = one(c, "select * from chan_rule where group_id=?", (g["id"],))
            mids = jl(g["members"])
            names = [mask_org((one(c, "select name from org where id=?", (i,)) or {}).get("name")
                              or "") for i in mids]
            out.append({"id": g["id"], "name": g["name"], "members": mids,
                        "member_names": names, "member_count": len(mids),
                        "rule": dict(r) if r else {"countries": "[]", "base": "settle",
                                                   "mode": "origin", "val": 0},
                        "countries": jl(r["countries"]) if r else [],
                        "pub_count": c.execute(
                            "select count(*) from chan_pub where group_id=? and on_shelf=1",
                            (g["id"],)).fetchone()[0]})
            aud(out[-1], g)
        chans = [dict(o, name=mask_org(o["name"])) for o in rows(
            c, "select id,name,short,kind from org where kind in ('store','agency')")]
        return {"list": out, "channels": chans,
                "countries": [r["country"] for r in rows(
                    c, "select distinct country from product where status='published'")]}

    if path == "/sup/group/save":
        need("ubk")
        name = arg("name")
        members = json.dumps(body.get("members") or [])
        if body.get("id"):
            gid = int(body["id"])
            g = one(c, "select * from chan_group where id=? and org_id=?", (gid, user["org_id"]))
            if not g:
                raise Err("渠道组不存在", 404)
            c.execute("update chan_group set name=?,members=?,updated_at=? where id=?",
                      (name, members, now(), gid))
            act = "修改渠道组"
        else:
            c.execute("insert into chan_group(org_id,name,members,updated_at) values(?,?,?,?)",
                      (user["org_id"], name, members, now()))
            gid = c.execute("select last_insert_rowid()").fetchone()[0]
            act = "新建渠道组"
        base = body.get("base") or "settle"
        mode = body.get("mode") or "origin"
        val = float(body.get("val") or 0)
        cs = json.dumps(body.get("countries") or [])
        r = one(c, "select * from chan_rule where group_id=?", (gid,))
        if r:
            c.execute("update chan_rule set countries=?,base=?,mode=?,val=? where id=?",
                      (cs, base, mode, val, r["id"]))
        else:
            c.execute("insert into chan_rule(group_id,countries,base,mode,val) values(?,?,?,?,?)",
                      (gid, cs, base, mode, val))
        for cp in rows(c, "select distinct pkg_id from chan_pub where group_id=?", (gid,)):
            reprice_pkg(c, cp["pkg_id"])
        log(c, "chan", gid, None, user, act,
            "%s · %d 个渠道 · 策略 %s" % (name, len(body.get("members") or []),
                                        {"origin": "沿用基础结算价", "percent": "百分比加价",
                                         "fixed": "固定加价"}.get(mode, mode)))
        return {"ok": True, "id": gid}

    if path == "/sup/group/del":
        need("ubk")
        gid = int(arg("id"))
        on = c.execute("select count(*) from chan_pub where group_id=? and on_shelf=1",
                       (gid,)).fetchone()[0]
        if on:
            raise Err("该渠道组仍有 %d 个在架套餐，请先下架" % on)
        c.execute("delete from chan_pub where group_id=?", (gid,))
        c.execute("delete from chan_rule where group_id=?", (gid,))
        c.execute("delete from chan_group where id=? and org_id=?", (gid, user["org_id"]))
        log(c, "chan", gid, None, user, "删除渠道组", "")
        return {"ok": True}

    # ---------- C6 供应商：新增产品（三步） ----------
    if path == "/sup/catalog":
        need("ubk", "ops")
        out = []
        for p in rows(c, "select * from product where status='published' order by country, id"):
            fv = one(c, "select * from fullver where id=?", (p["fullver_id"],)) or {}
            out.append({"id": p["id"], "name": p["name"], "country": p["country"],
                        "visa_type": p["visa_type"], "visa_cat": p["visa_cat"] or "",
                        "submit_city": p["submit_city"],
                        "entries": p["entries"], "stay_days": p["stay_days"],
                        "stay_text": stay_text(p),
                        "valid": valid_text(p),
                        # ⚠️ 这几个原始字段必须下发：编辑产品页要拿它们回填表单。
                        # 2026-09-04 放开签证属性编辑时只下发了展示用的 valid / stay_text，
                        # 结果编辑页读 cat.valid_num 拿到 undefined、显示成「0 年」，
                        # 供应商一保存就把有效期和停留期写成 0（2026-09-07 发现）。
                        "valid_num": p["valid_num"], "valid_type": p["valid_type"],
                        "stay_min": p["stay_min"], "stay_max": p["stay_max"],
                        "stay_unit": p["stay_unit"],
                        "need_interview": p["need_interview"],
                        "need_fingerprint": p["need_fingerprint"],
                        "accept_note": p["accept_note"],
                        "fullver_id": p["fullver_id"], "fullver": fv.get("ver_no"),
                        "fullver_name": fv.get("name"),
                        "items": c.execute("select count(*) from fullver_item where fullver_id=?",
                                           (p["fullver_id"],)).fetchone()[0],
                        "mine": c.execute("select count(*) from sup_product where product_id=?"
                                          " and org_id=?",
                                          (p["id"], user["org_id"])).fetchone()[0]})
        # 可选的清单版本 = 平台统一版本 + 本供应商自己建并发布的那些
        # （唐美芳 2026-09-04：材料库入口同步挪到 UBK，跟 UOM 一模一样）。
        # 别家供应商建的版本不在其中——那是人家的收料口径，不该被拿去用。
        fvs = []
        for f in rows(c, "select * from fullver where status='published'"
                         " and owner_org in (0,?) order by owner_org, country",
                      (user["org_id"],)):
            fvs.append(dict(f, items=c.execute(
                "select count(*) from fullver_item where fullver_id=?", (f["id"],)).fetchone()[0]))
        return {"list": out, "fullvers": fvs, "visa_cats": VISA_CATS,
                "provinces": PROVINCES,
                "svc_opts": SVC_OPTS, "svc_fixed": SVC_FIXED,
                "addrs": rows(c, "select * from addr where owner_kind='org' and owner_id=?"
                                 " order by is_default desc", (user["org_id"],))}

    if path == "/sup/product/create":
        need("ubk")
        v = body.get("visa") or None
        if v:
            # 供应商自己录签证属性并选完整版材料清单，平台目录由系统按
            # 国家+签证类型+送签地 去重维护，不再需要运营先手工建一条目录产品
            for k in ("country", "visa_type", "submit_city"):
                if not (v.get(k) or "").strip():
                    raise Err("请填写国家、签证名称与送签地")
            vcat = (v.get("visa_cat") or "").strip()
            if vcat not in VISA_CATS:
                raise Err("请选择签证类型")
            fvid = int(v.get("fullver_id") or body.get("fullver_id") or 0)
            fv = one(c, "select * from fullver where id=?", (fvid,))
            if not fv or fv["status"] != "published":
                raise Err("请选择一份已发布的材料清单版本")
            country = v["country"].strip()
            visa_type = v["visa_type"].strip()
            city = v["submit_city"].strip()
            p = one(c, "select * from product where country=? and visa_type=? and submit_city=?",
                    (country, visa_type, city))
            provs = json.dumps(clean_provs(v.get("accept_provinces")), ensure_ascii=False)
            if p:
                # 同一条平台目录产品可能已有别家在卖，受理省份是官方领区规则、不是各家的自选项，
                # 所以只在原来没填时补齐，不覆盖——两家填得不一样就该由运营去核，
                # 而不是谁后上架谁说了算。
                c.execute("update product set status='published', fullver_id=coalesce(fullver_id,?),"
                          " visa_cat=coalesce(nullif(visa_cat,''),?),"
                          " accept_provinces=case when ifnull(accept_provinces,'[]') in ('','[]')"
                          " then ? else accept_provinces end, updated_at=? where id=?",
                          (fvid, vcat, provs, now(), p["id"]))
            else:
                # 产品名 = 送签地 + 国家 + 签证名称。但运营填的「签证名称」里
                # 常常已经带了国家与送签地（唐美芳 2026-09-01 建的那条 EVUS 产品
                # 就拼成了「上海美国美国EVUS登记更新…上海送签」，国家与送签地各重了一次）。
                # 已经含有的就不再拼，避免同一个词在产品名里出现两遍。
                nm = visa_type
                if country not in nm:
                    nm = country + nm
                if city not in nm and city.replace("送签", "") not in nm:
                    nm = city + nm
                code = "P%s" % datetime.now().strftime("%y%m%d%H%M%S")
                # 停留期是区间 + 单位；stay_days 仍写一份折算成天的值，
                # 供还没改过来的老展示逻辑兜底（见 mig_stay.py）
                su = v.get("stay_unit") if v.get("stay_unit") in STAY_DAYS else "day"
                smn = int(v.get("stay_min") or 0)
                smx = int(v.get("stay_max") or 0) or smn
                if smn and smx and smn > smx:
                    smn, smx = smx, smn
                c.execute("insert into product(code,country,visa_type,visa_cat,submit_city,name,"
                          "accept_note,accept_provinces,valid_type,valid_num,entries,stay_days,"
                          "stay_min,stay_max,"
                          "stay_unit,need_interview,need_fingerprint,fullver_id,status,updated_at)"
                          " values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'published',?)",
                          (code, country, visa_type, vcat, city, nm, v.get("accept_note"), provs,
                           (v.get("valid_type") if v.get("valid_type") in VALID_UNIT
                            else "year"), int(v.get("valid_num") or 0),
                           v.get("entries") or "single", smx * STAY_DAYS[su], smn, smx, su,
                           1 if v.get("need_interview") else 0,
                           1 if v.get("need_fingerprint") else 0, fvid, now()))
                pid = c.execute("select last_insert_rowid()").fetchone()[0]
                log(c, "product", pid, None, user, "平台目录自动登记",
                    "%s（由供应商上品时创建）" % nm)
            p = one(c, "select * from product where country=? and visa_type=? and submit_city=?",
                    (country, visa_type, city))
            body["fullver_id"] = fvid
        else:
            p = one(c, "select * from product where id=?", (arg("product_id"),))
            if not p or p["status"] != "published":
                raise Err("平台产品不存在或未发布")
        # 套餐报价允许留到之后再补（唐美芳 2026-09-04：「如果产品信息只创建产品基础信息
        # 但退出了，这个产品信息仍旧创建成功，只不过完整度只有基础信息，没有套餐报价」）。
        # 上架时仍会校验至少一个套餐——见 /sup/product/save 里 st == "published" 那段。
        pkgs = body.get("packages") or []
        if len(pkgs) > PKG_MAX:
            raise Err("单个产品最多 %d 个套餐，如需更多请拆成多条产品上架" % PKG_MAX)
        if not body.get("addr_id"):
            raise Err("请选择收料地址")
        suffix = (body.get("name_suffix") or "").strip()
        to_c = 1 if body.get("to_c") else 0
        svc = [t for t in (body.get("svc_tags") or []) if t in SVC_OPTS]
        # 办理流程：供应商可按产品配，为空时前端回落到平台默认 5 步
        flow = body.get("flow") or []
        flow = json.dumps([{"t": (x.get("t") or "")[:20], "d": (x.get("d") or "")[:60]}
                           for x in flow if (x.get("t") or "").strip()][:8],
                          ensure_ascii=False) if flow else None
        hero = (body.get("hero_img") or "").strip()[:300]
        if hero and not hero.startswith((PREFIX + "/uploads/", "uploads/", "img/")):
            raise Err("头图请通过上传控件选择，不接受外部链接")
        # 材料清单定制在新增第一步就能填，跟着产品一起落库——
        # 要是只能等产品建完再回详情页调，供应商上完品就走了，清单永远是平台原版
        fvid_new = int(body.get("fullver_id") or p["fullver_id"])
        mc = clean_mat_custom(c, fvid_new, body.get("mat_custom")) \
            if body.get("mat_custom") else None
        c.execute("insert into sup_product(product_id,org_id,name_suffix,name,feature,svc_tags,"
                  "addr_id,fullver_id,to_b,to_c,status,vendor_code,flow,hero_img,mat_custom,"
                  "updated_at)"
                  " values(?,?,?,?,?,?,?,?,1,?,'draft',?,?,?,?,?)",
                  (p["id"], user["org_id"], suffix, p["name"] + (" " + suffix if suffix else ""),
                   body.get("feature"), json.dumps(svc, ensure_ascii=False), int(body["addr_id"]),
                   fvid_new, to_c,
                   (body.get("vendor_code") or "").strip(), flow, hero, mc, now()))
        spid = c.execute("select last_insert_rowid()").fetchone()[0]
        # 产品编码 Q+6 位（唐美芳 2026-08-31）。列表上原来露的是自增主键，
        # 那是内部实现细节，供应商跟平台对账、报编号时用不了。
        with LOCK:
            c.execute("update seq set v=v+1 where k='sup_product_code'")
            code = c.execute("select v from seq where k='sup_product_code'").fetchone()[0]
        c.execute("update sup_product set review_b='none',review_c='none',code=? where id=?",
                  ("Q%06d" % code, spid))
        for k in pkgs:
            vf, sf, st, rt = pkg_prices(k)
            c.execute("insert into pkg(sup_product_id,name,sup_code,visa_fee,service_fee,"
                      "settle_price,suggest_retail,lead_days,book_notice,pkg_desc,refund_insured)"
                      " values(?,?,?,?,?,?,?,?,?,?,?)",
                      (spid, k.get("name") or "普通办理", k.get("sup_code"), vf, sf, st,
                       rt, int(k.get("lead_days") or 15),
                       clean_rich(k.get("book_notice")), clean_rich(k.get("pkg_desc")),
                       1 if k.get("refund_insured") else 0))
        log(c, "sup_product", spid, None, user, "新增产品",
            "%s，%s，待上架" % (p["name"],
                              "%d 个套餐" % len(pkgs) if pkgs else "尚未录入套餐报价"))
        return {"ok": True, "id": spid, "no_pkg": not pkgs}

    if path == "/sup/product/save":
        need("ubk", "ops")
        sp = sp_pick(c, user, arg("id"))
        if not sp:
            raise Err("产品不存在", 404)
        p = one(c, "select * from product where id=?", (sp["product_id"],))
        st = body.get("status") or sp["status"]
        if st == "published":
            n = c.execute("select count(*) from pkg where sup_product_id=?",
                          (sp["id"],)).fetchone()[0]
            if not n:
                raise Err("没有套餐报价，不能上架")
            if not sp["addr_id"] and not body.get("addr_id"):
                raise Err("没有收料地址，不能上架")
        ord_cnt = c.execute("select count(*) from ord where pkg_id in"
                            " (select id from pkg where sup_product_id=?)",
                            (sp["id"],)).fetchone()[0]
        pol = sup_policy(sp, ord_cnt)
        suffix = body.get("name_suffix", sp["name_suffix"]) or ""
        to_c = 1 if body.get("to_c", sp["to_c"]) else 0
        to_b = 1 if body.get("to_b", sp["to_b"]) else 0
        # 改到「客人看得见、履约算得上」的内容就要自动下架（唐美芳 2026-09-04）。
        # 逐项记下改了什么，日志里写清楚，运营在详情页的日志页签能看到是哪一次改的。
        chg = []
        # 上下架本身不受锁约束（下架恰恰是解锁的手段），锁的是随请求一起改的字段
        if suffix != (sp["name_suffix"] or ""):
            sup_guard(pol, "name")
            chg.append("产品名后缀")
        if "feature" in body and body["feature"] != sp["feature"]:
            sup_guard(pol, "feature")
            chg.append("产品特色")
        # 服务保障是对客承诺，跟产品特色一样属于「在售期间不能悄悄改」的文案
        svc = sp["svc_tags"]
        if "svc_tags" in body:
            svc = json.dumps([t for t in (body["svc_tags"] or []) if t in SVC_OPTS],
                             ensure_ascii=False)
            if svc != (sp["svc_tags"] or json.dumps([])):
                sup_guard(pol, "feature")
                chg.append("服务保障")
        if to_b != sp["to_b"] or to_c != sp["to_c"]:
            sup_guard(pol, "scope")
            chg.append("上架范围")
        if body.get("addr_id") and int(body["addr_id"]) != (sp["addr_id"] or 0):
            sup_guard(pol, "addr")
            chg.append("收料地址")
        # 供应商自有编码只是对外对码用的备注，不影响客户看到的东西、也不影响履约，
        # 所以不进 sup_guard：产品在售期间也允许随时改。
        if "vendor_code" in body:
            vc = (body.get("vendor_code") or "").strip()
            if vc != (sp["vendor_code"] or ""):
                c.execute("update sup_product set vendor_code=? where id=?", (vc, sp["id"]))
        # 产品头图：只是展示图，换图不改变履约内容与价格，所以不进 sup_guard，
        # 在售期间也允许换（唐美芳 2026-09-01：「ubk 上品的时候没有上传图片的位置」）。
        if "hero_img" in body:
            hi = (body.get("hero_img") or "").strip()[:300]
            if hi and not hi.startswith(("/visaops/uploads/", "uploads/", "img/")):
                raise Err("头图请通过上传控件选择，不接受外部链接")
            if hi != (sp["hero_img"] or ""):
                c.execute("update sup_product set hero_img=? where id=?", (hi, sp["id"]))
        # 办理流程跟产品特色同一档约束：对客承诺，在售期间不能悄悄改
        if "flow" in body:
            fl = body.get("flow") or []
            fl = json.dumps([{"t": (x.get("t") or "")[:20], "d": (x.get("d") or "")[:60]}
                             for x in fl if (x.get("t") or "").strip()][:8],
                            ensure_ascii=False) if fl else None
            if fl != sp["flow"]:
                sup_guard(pol, "feature")
                chg.append("办理流程")
                c.execute("update sup_product set flow=? where id=?", (fl, sp["id"]))
        # 换材料清单版本＝换客人要交的材料，跟改收料地址同一档约束
        if body.get("fullver_id") and int(body["fullver_id"]) != (sp["fullver_id"] or 0):
            sup_guard(pol, "addr")
            chg.append("材料清单版本")
        # 签证属性：2026-09-04 唐美芳「ubk 里的签证名称、自定义名称后缀能不能都允许修改，
        # 修改的时候自动下架就行」。原来整块只读，录错一个字只能重建产品重新报价。
        #
        # 改<b>签证名称</b>要特别处理：它是平台目录的主键之一（国家+签证名称+送签地），
        # 直接改会把别家供应商正在卖的那条签证一起改掉。所以改名时按新名字
        # <b>找一条目录产品，没有就建一条，把这条产品换绑过去</b>，老目录留给别家。
        # 其余属性（有效期、入境次数、停留期、面签/指纹）仍是这条签证的客观事实，
        # 直接写在目录上，对所有卖这条签证的供应商生效——那本来就该一致。
        # 国家与送签地不放开：改这两个等于卖另一条签证了，应该新建产品，
        # 否则历史订单会挂在一条「国家都变了」的目录上。
        if "visa" in body:
            vb = body["visa"] or {}
            vt = (vb.get("visa_type") or p["visa_type"]).strip()
            if not vt:
                raise Err("签证名称不能为空")
            if vt != p["visa_type"]:
                sup_guard(pol, "name")
                chg.append("签证名称")
                tgt = one(c, "select * from product where country=? and visa_type=?"
                             " and submit_city=?", (p["country"], vt, p["submit_city"]))
                if not tgt:
                    nm2 = vt
                    if p["country"] not in nm2:
                        nm2 = p["country"] + nm2
                    if p["submit_city"] not in nm2 and \
                            p["submit_city"].replace("送签", "") not in nm2:
                        nm2 = p["submit_city"] + nm2
                    c.execute(
                        "insert into product(code,country,visa_type,visa_cat,submit_city,name,"
                        "accept_note,accept_provinces,valid_type,valid_num,entries,stay_days,"
                        "stay_min,stay_max,stay_unit,need_interview,need_fingerprint,fullver_id,"
                        "status,updated_at)"
                        " select ?,country,?,visa_cat,submit_city,?,accept_note,accept_provinces,"
                        "valid_type,valid_num,entries,stay_days,stay_min,stay_max,stay_unit,"
                        "need_interview,need_fingerprint,fullver_id,'published',?"
                        " from product where id=?",
                        ("P%s" % datetime.now().strftime("%y%m%d%H%M%S"), vt, nm2, now(), p["id"]))
                    tgt = one(c, "select * from product where id=?",
                              (c.execute("select last_insert_rowid()").fetchone()[0],))
                    log(c, "product", tgt["id"], None, user, "平台目录自动登记",
                        "%s（由供应商改签证名称时创建）" % nm2)
                c.execute("update sup_product set product_id=? where id=?", (tgt["id"], sp["id"]))
                p = tgt
            # 其余属性直接落在（换绑后的）目录产品上
            fields, vals = [], []
            for k, cur in (("visa_cat", p["visa_cat"]), ("valid_type", p["valid_type"]),
                           ("entries", p["entries"])):
                if k in vb and (vb.get(k) or "") != (cur or ""):
                    v2 = vb.get(k)
                    if k == "valid_type" and v2 not in VALID_UNIT:
                        continue                    # 非法单位直接忽略，不写坏目录
                    fields.append(k + "=?"); vals.append(v2)
            for k, cur in (("valid_num", p["valid_num"]),
                           ("need_interview", p["need_interview"]),
                           ("need_fingerprint", p["need_fingerprint"])):
                if k in vb and int(vb.get(k) or 0) != (cur or 0):
                    fields.append(k + "=?"); vals.append(int(vb.get(k) or 0))
            if any(k in vb for k in ("stay_min", "stay_max", "stay_unit")):
                su = vb.get("stay_unit") if vb.get("stay_unit") in STAY_DAYS else p["stay_unit"]
                smn = int(vb.get("stay_min") or 0)
                smx = int(vb.get("stay_max") or 0) or smn
                if smn and smx and smn > smx:
                    smn, smx = smx, smn
                if (smn, smx, su) != (p["stay_min"], p["stay_max"], p["stay_unit"]):
                    fields += ["stay_min=?", "stay_max=?", "stay_unit=?", "stay_days=?"]
                    vals += [smn, smx, su, smx * STAY_DAYS[su or "day"]]
            if fields:
                sup_guard(pol, "scope")
                chg.append("签证属性")
                c.execute("update product set %s,updated_at=? where id=?" % ",".join(fields),
                          tuple(vals) + (now(), p["id"]))
                p = one(c, "select * from product where id=?", (p["id"],))
        # 受理居住地范围落在平台目录产品上——领区规则是官方定的，不是各家的自选项
        # （唐美芳 2026-09-04：日本签证按居住地受理，住北京买「上海送签」办不成）。
        if "accept_provinces" in body:
            pv = json.dumps(clean_provs(body.get("accept_provinces")), ensure_ascii=False)
            if pv != (p["accept_provinces"] or "[]"):
                sup_guard(pol, "scope")
                chg.append("受理居住地范围")
                c.execute("update product set accept_provinces=?,updated_at=? where id=?",
                          (pv, now(), p["id"]))
        # 受理范围说明 2026-09-07 起是富文本，跟套餐说明同一套白名单过滤
        if "accept_note" in body and clean_rich(body.get("accept_note")) != (p["accept_note"] or ""):
            sup_guard(pol, "scope")
            chg.append("受理范围说明")
            c.execute("update product set accept_note=?,updated_at=? where id=?",
                      (clean_rich(body.get("accept_note")), now(), p["id"]))
        if not to_b and not to_c:
            raise Err("上架范围至少要选一个：B 端（CSP 门店/同业）或 C 端（客户小程序）")
        # 改了实质内容就自动下架，改完供应商自己点上架、即刻恢复展示
        # （唐美芳 2026-09-04：「编辑的时候，自动下架」「上架后不需要 uom 审核」）。
        # 只在「没有显式带上下架动作」时才这么做——供应商本来就是在点上架 / 下架的，
        # 不该被这一脚踢回草稿。
        auto_off = False
        if chg and "status" not in body and sp["status"] == "published":
            st = "draft"
            auto_off = True
        # 上架＝向两端运营分别送审，勾了哪端就送哪端。
        # 中途新勾一端，只把那一端置为待审，不动另一端已经通过的结论——
        # 否则供应商想加个 C 端就会把在售的 B 端打下来。
        # resubmit 用于被驳回后原地重新送审，前端传 'b' / 'c'。
        want = {"b": to_b, "c": to_c}
        rvs, sub = {"b": sp["review_b"], "c": sp["review_c"]}, sp["submit_at"]
        resub = body.get("resubmit")
        for t in ("b", "c"):
            if not want[t]:
                rvs[t] = "none"                 # 取消了这一端的上架申请，结论作废
            elif st != "published":
                # 下架<b>不清空</b>审核结论——重新上架要靠它免审直接恢复展示
                # （唐美芳 2026-09-04）。sup_on() 同时看 status，下架期间照样不展示，
                # 留着结论不会让产品偷偷挂在前台。
                # 2026-09-04 踩过：这里原来置 none，于是「改一次→下架→再上架」
                # 每次都要重审，她要的免审等于没生效。
                pass
            elif resub == t:
                rvs[t] = "pending"          # 被驳回后原地重提，这个必须再审
            elif sp["status"] != "published" or not sp["to_" + t]:
                # 2026-09-04 唐美芳：「上架后不需要 uom 审核就直接上架了」。
                # 这一端曾经审过并通过的，重新上架沿用原结论即刻恢复展示；
                # 从没审过、或者上次是被驳回的，仍要走一次审核——
                # 那两种情况平台根本没看过这条产品，直接放出去等于没有审核。
                rvs[t] = "approved" if sp["review_" + t] == "approved" else "pending"
        if st == "published" and (sp["status"] != "published" or resub):
            sub = now()
        c.execute("update sup_product set name_suffix=?,name=?,feature=?,svc_tags=?,addr_id=?,"
                  "fullver_id=?,to_b=?,to_c=?,status=?,review_b=?,review_c=?,submit_at=?,"
                  "updated_at=? where id=?",
                  (suffix, p["name"] + (" " + suffix if suffix else ""),
                   body.get("feature", sp["feature"]), svc,
                   int(body.get("addr_id") or sp["addr_id"] or 0) or None,
                   int(body.get("fullver_id") or sp["fullver_id"] or 0) or None,
                   to_b, to_c, st, rvs["b"], rvs["c"], sub, now(), sp["id"]))
        if auto_off:
            log(c, "sup_product", sp["id"], None, user, "修改后自动下架",
                "修改项：" + "、".join(chg) + "；点击「提交上架」即时恢复展示，无需再次审核")
        elif st != sp["status"]:
            # 曾经审过的那端重新上架不再进审核队列，日志得写清楚是哪一种
            direct = st == "published" and "pending" not in (rvs["b"], rvs["c"])
            log(c, "sup_product", sp["id"], None, user,
                ("直接上架（沿用原审核结论）" if direct else "提交上架待审核")
                if st == "published" else "产品下架", sp["name"])
        elif resub:
            log(c, "sup_product", sp["id"], None, user,
                "重新提交" + resub.upper() + " 端审核", sp["name"])
        else:
            log(c, "sup_product", sp["id"], None, user, "修改产品信息",
                sp["name"] + ("（改动：" + "、".join(chg) + "）" if chg else ""))
        return {"ok": True, "status": st, "review_b": rvs["b"], "review_c": rvs["c"],
                "auto_off": auto_off, "changed": chg}

    if path == "/sup/pkg/add":
        need("ubk")
        sp = one(c, "select * from sup_product where id=? and org_id=?",
                 (arg("sup_product_id"), user["org_id"]))
        if not sp:
            raise Err("产品不存在", 404)
        sup_guard(sup_policy(sp), "pkg_add")
        # 套餐数量上限（唐美芳 2026-08-27 问「后台是不是有添加套餐数量的限制」——原来没有）。
        # 12 是从展示端倒推的：详情页套餐区一屏最多摆得下 12 张卡，再多客人根本比不过来，
        # 门店销售在下单页的下拉里也会翻不到底。真要更多品类应该拆成多条产品，而不是堆套餐。
        cur = c.execute("select count(*) from pkg where sup_product_id=?", (sp["id"],)).fetchone()[0]
        if cur >= PKG_MAX:
            raise Err("单个产品最多 %d 个套餐，当前已有 %d 个；"
                      "如需更多请拆成多条产品上架" % (PKG_MAX, cur))
        vf, sf, st, rt = pkg_prices(body)
        c.execute("insert into pkg(sup_product_id,name,visa_fee,service_fee,settle_price,"
                  "suggest_retail,lead_days,book_notice,pkg_desc,refund_insured)"
                  " values(?,?,?,?,?,?,?,?,?,?)",
                  (sp["id"], arg("name"), vf, sf, st,
                   rt, int(body.get("lead_days") or 15),
                   clean_rich(body.get("book_notice")), clean_rich(body.get("pkg_desc")),
                   1 if body.get("refund_insured") else 0))
        log(c, "pkg", c.execute("select last_insert_rowid()").fetchone()[0], None, user,
            "新增套餐", sp["name"] + " · " + arg("name"))
        off = auto_offline(c, sp, user, "新增套餐「%s」" % arg("name"))
        return {"ok": True, "auto_off": off}

    if path == "/sup/mat/custom":
        # 供应商在平台清单基础上做定制（唐美芳 2026-09-03：「可以让供应商自定义材料清单」）。
        # 边界见 checklist_for()：必交项删不掉、追加项一律算「建议」并标明是本供应商要求。
        need("ubk", "ops")
        sp = one(c, "select * from sup_product where id=?", (arg("id"),))
        if not sp:
            raise Err("产品不存在")
        if user["role"] == "ubk" and sp["org_id"] != user["org_id"]:
            raise Err("无权操作该产品", 403)
        # 改清单＝改客人要交的材料，跟换清单版本、改收料地址同一档：审核中不能动，
        # 否则运营审的是一份清单、客人收到的是另一份。
        ord_cnt = c.execute("select count(*) from ord where pkg_id in"
                            " (select id from pkg where sup_product_id=?)",
                            (sp["id"],)).fetchone()[0]
        sup_guard(sup_policy(sp, ord_cnt), "addr")
        # 清单版本可能挂在平台产品上（供应商没单独绑过），必交项要照实际生效的那份查
        pp = one(c, "select * from product where id=?", (sp["product_id"],))
        fvid = sp["fullver_id"] or (pp and pp["fullver_id"])
        if not fvid:
            raise Err("该产品尚未绑定材料清单版本，请先绑定后再行调整")
        mc = clean_mat_custom(c, fvid, body)
        c.execute("update sup_product set mat_custom=?,updated_at=?,updated_by=?,updated_by_name=?"
                  " where id=?", (mc, now(), user["id"], user["name"], sp["id"]))
        d = json.loads(mc)
        log(c, "product", sp["id"], 0, user, "调整材料清单",
            "追加 %d 项、去掉 %d 项建议材料" % (len(d["add"]), len(d["skip"])))
        # 改的是客人要交的材料，跟改价同一档：在售的先下架，改完点上架即刻恢复
        off = auto_offline(c, sp, user, "调整了本产品的材料清单") if user["role"] == "ubk" else False
        return {"ok": True, "auto_off": off,
                "msg": ("已保存，产品已自动下架。完成后点击「提交上架」即时恢复展示，无需再次审核"
                        if off else "已保存。已成交订单按下单时的清单快照执行，不受影响")}

    if path == "/sup/pkg/status":
        # 套餐单独起售 / 停售（唐美芳 2026-09-03：「套餐可以单独起售停售和产品信息一样」）。
        # 真实场景：加急套餐旺季名额满了要临时停，普通办理照常卖；
        # 以前只能整个产品下架，把还能卖的也一起停了。
        # **停售只影响新单**：已成交订单照常办，价格与时效走下单时的快照。
        need("ubk", "ops")
        k = one(c, "select * from pkg where id=?", (arg("id"),))
        if not k:
            raise Err("套餐不存在")
        sp = one(c, "select * from sup_product where id=?", (k["sup_product_id"],))
        if user["role"] == "ubk" and (not sp or sp["org_id"] != user["org_id"]):
            raise Err("无权操作该套餐", 403)
        st = arg("status")
        if st not in ("on", "off"):
            raise Err("非法状态")
        # 最后一个在售套餐不让停——产品还挂在架上却一个套餐都选不了，
        # 客人点进详情页会看到一个买不了的产品。要停就整个产品下架。
        if st == "off":
            left = c.execute("select count(*) from pkg where sup_product_id=? and id<>?"
                             " and ifnull(status,'on')='on'",
                             (k["sup_product_id"], k["id"])).fetchone()[0]
            if not left and sp and sp["status"] == "on":
                raise Err("该套餐为本产品最后一个在售套餐，停售后客户进入详情页将无套餐可选。"
                          "如确需停售，请将整个产品下架")
        c.execute("update pkg set status=?,updated_at=?,updated_by=?,updated_by_name=?"
                  " where id=?", (st, now(), user["id"], user["name"], k["id"]))
        log(c, "product", sp["id"] if sp else 0, 0, user,
            "套餐" + ("恢复起售" if st == "on" else "停售"), k["name"])
        return {"ok": True, "msg": "已" + ("恢复起售" if st == "on" else "停售")}

    if path == "/sup/pkg/del":
        need("ubk")
        pk = one(c, "select * from pkg where id=?", (arg("id"),))
        sp = one(c, "select * from sup_product where id=? and org_id=?",
                 (pk["sup_product_id"], user["org_id"]))
        if not sp:
            raise Err("套餐不存在", 404)
        sup_guard(sup_policy(sp), "pkg_add")
        used = c.execute("select count(*) from ord where pkg_id=?", (pk["id"],)).fetchone()[0]
        if used:
            raise Err("该套餐已产生 %d 笔订单，不可删除；如需停止销售请将其停售" % used)
        c.execute("delete from chan_pub where pkg_id=?", (pk["id"],))
        c.execute("delete from pkg where id=?", (pk["id"],))
        log(c, "pkg", pk["id"], None, user, "删除套餐", pk["name"])
        return {"ok": True}

    # ---------- C6 供应商：渠道投放 ----------
    if path == "/sup/pub":
        need("ubk")
        gs = rows(c, "select * from chan_group where org_id=? order by id", (user["org_id"],))
        pk_rows = rows(c, "select pkg.*,sp.name as sp_name,sp.status as sp_status,p.country"
                          " from pkg join sup_product sp on sp.id=pkg.sup_product_id"
                          " join product p on p.id=sp.product_id"
                          " where sp.org_id=? order by sp.id, pkg.settle_price",
                       (user["org_id"],))
        pubs = {}
        for cp in rows(c, "select * from chan_pub where group_id in (%s)"
                       % (",".join(str(g["id"]) for g in gs) or "0")):
            pubs["%d:%d" % (cp["group_id"], cp["pkg_id"])] = dict(cp)
        return {"groups": [{"id": g["id"], "name": g["name"]} for g in gs],
                "packages": pk_rows, "pubs": pubs}

    if path == "/sup/pub/batch":
        need("ubk")
        gids = [int(x) for x in (body.get("group_ids") or [])]
        pids = [int(x) for x in (body.get("pkg_ids") or [])]
        if not gids or not pids:
            raise Err("请选择渠道组与套餐")
        on = 0 if body.get("off") else 1
        n = 0
        for gid in gids:
            g = one(c, "select * from chan_group where id=? and org_id=?", (gid, user["org_id"]))
            if not g:
                continue
            rule = one(c, "select * from chan_rule where group_id=?", (gid,))
            cs = jl(rule["countries"]) if rule else []
            for pid in pids:
                pk = one(c, "select pkg.*,p.country from pkg"
                            " join sup_product sp on sp.id=pkg.sup_product_id"
                            " join product p on p.id=sp.product_id"
                            " where pkg.id=? and sp.org_id=?", (pid, user["org_id"]))
                if not pk:
                    continue
                if cs and pk["country"] not in cs:
                    continue
                settle = chan_price(dict(rule) if rule else None,
                                    pk["visa_fee"], pk["service_fee"])
                cp = one(c, "select * from chan_pub where group_id=? and pkg_id=?", (gid, pid))
                retail = (cp["retail_price"] if cp else None) or pk["suggest_retail"]
                warn = 1 if settle > retail else 0
                if cp:
                    c.execute("update chan_pub set on_shelf=?,settle_price=?,suggest_price=?,"
                              "warn=?,updated_at=? where id=?",
                              (on, settle, pk["suggest_retail"], warn, now(), cp["id"]))
                else:
                    c.execute("insert into chan_pub(group_id,pkg_id,on_shelf,settle_price,"
                              "suggest_price,retail_price,agented,warn,updated_at)"
                              " values(?,?,?,?,?,?,0,?,?)",
                              (gid, pid, on, settle, pk["suggest_retail"],
                               pk["suggest_retail"], warn, now()))
                n += 1
        log(c, "chan", 0, None, user, "批量投放" if on else "批量下架",
            "%d 个渠道组 × %d 个套餐，生效 %d 条" % (len(gids), len(pids), n))
        return {"ok": True, "count": n,
                "note": "渠道组设了国家范围的，只对范围内国家生效" if n < len(gids) * len(pids)
                        else ""}

    if path == "/sup/pub/price":
        need("ubk")
        cp = one(c, "select cp.* from chan_pub cp join chan_group cg on cg.id=cp.group_id"
                    " where cp.id=? and cg.org_id=?", (arg("id"), user["org_id"]))
        if not cp:
            raise Err("投放记录不存在", 404)
        rt = float(body.get("retail_price", cp["retail_price"]))
        on = 1 if body.get("on_shelf", cp["on_shelf"]) else 0
        c.execute("update chan_pub set retail_price=?,on_shelf=?,agented=?,warn=?,updated_at=?"
                  " where id=?",
                  (rt, on, 1 if body.get("agented", cp["agented"]) else 0,
                   1 if cp["settle_price"] > rt else 0, now(), cp["id"]))
        log(c, "chan", cp["group_id"], None, user, "调整渠道零售价", "%.0f 元" % rt)
        return {"ok": True, "warn": 1 if cp["settle_price"] > rt else 0}

    # ---------- 签证政策内容 ----------
    # 产品回答「这条产品怎么卖」，政策回答「这个国家现在什么规矩」。两者变动频率差着数量级，
    # 所以政策不挂在产品下面，单独由总部运营维护，B 端与 C 端读同一份（唐美芳 2026-08-27）。
    if path == "/shop/policies":
        # 对外只给已发布的。scope='b' 的条目是给门店销售的内部口径，不能发到客户端去。
        country = q.get("country", [None])[0]
        sql = "select * from visa_policy where status='published'"
        args = []
        if (user or {}).get("role") == "customer":
            sql += " and scope='all'"
        if country:
            # 通用政策（country='*'）对每个目的地都适用，查某国时一并带出
            sql += " and country in (?,'*')"
            args.append(country)
        return {"list": rows(c, sql + " order by pin desc, country='*', effect_at desc, id desc",
                             args)}

    if path == "/ops/policies":
        need("ops", "uom")
        return {"list": rows(c, "select * from visa_policy order by pin desc, id desc")}

    if path == "/ops/policy/save":
        need("ops")
        f = {k: (body.get(k) or "").strip() for k in
             ("country", "kind", "title", "summary", "body", "stay",
              "effect_at", "source", "source_url", "scope", "status")}
        if not f["country"] or not f["title"]:
            raise Err("目的地与标题必填")
        if f["kind"] not in ("free", "landing", "evisa", "change", "notice"):
            raise Err("政策类型不合法")
        # 政策是要拿给客人看的，没写来源就发布，出了错没人能追。
        if f["status"] == "published" and not f["source"]:
            raise Err("发布前请填写来源，注明是哪个使领馆 / 官网的口径")
        pin = 1 if body.get("pin") else 0
        vals = (f["country"], f["kind"], f["title"], f["summary"], f["body"], f["stay"],
                f["effect_at"], f["source"], f["source_url"], f["scope"] or "all",
                f["status"] or "draft", pin, now(), user["name"])
        if body.get("id"):
            c.execute("update visa_policy set country=?,kind=?,title=?,summary=?,body=?,stay=?,"
                      "effect_at=?,source=?,source_url=?,scope=?,status=?,pin=?,updated_at=?,"
                      "updated_by=? where id=?", vals + (int(body["id"]),))
            pid, act = int(body["id"]), "修改签证政策"
        else:
            c.execute("insert into visa_policy(country,kind,title,summary,body,stay,effect_at,"
                      "source,source_url,scope,status,pin,updated_at,updated_by,created_at)"
                      " values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", vals + (now(),))
            pid, act = c.execute("select last_insert_rowid()").fetchone()[0], "新增签证政策"
        log(c, "policy", pid, None, user, act, "%s · %s" % (f["country"], f["title"]))
        return {"ok": True, "id": pid}

    if path == "/ops/policy/del":
        need("ops")
        pid = int(arg("id"))
        p = one(c, "select * from visa_policy where id=?", (pid,))
        if not p:
            raise Err("政策不存在", 404)
        c.execute("delete from visa_policy where id=?", (pid,))
        log(c, "policy", pid, None, user, "删除签证政策", "%s · %s" % (p["country"], p["title"]))
        return {"ok": True}

    # ---------- C7 运维 / 运营 ----------
    if path == "/ops/samples":
        # 供应商编自己的材料项时要能挑样例，所以放开读；建/删样例仍只有运营能做
        need("ops", "ubk")
        out = rows(c, "select * from sample_tpl order by id")
        for r in out:
            r["files"] = jl(r["files"])
            # 适用范围是多值（唐美芳 2026-09-07：一份范本常同时适用多个国家）。
            # 空列表＝通用：countries 空＝不限国家，visa_types 空＝所选国家的全部类型。
            r["countries"] = jl(r["countries"], [])
            r["visa_types"] = jl(r["visa_types"], [])
            r["used"] = c.execute("select count(*) from fullver_item where sample_tpl_id=?",
                                  (r["id"],)).fetchone()[0]
        # 可选项跟表模板 / 材料库同源，避免三处各列一份对不上
        return {"list": out, "countries": COUNTRIES, "visa_types": VISA_TYPES}

    # ========== 表单字段库：官方申请表要填哪些格 ==========
    # 和材料库分开的原因写在 schema.sql 里：一个管「交什么件」，一个管「填什么格」，混在一起清单会炸。
    if path == "/ops/formvers":
        need("ops", "uom")
        out = []
        for f in rows(c, "select * from formver order by ifnull(created_at,'') desc, id desc"):
            st = {}
            for r in rows(c, "select src,count(*) n from form_field where formver_id=?"
                             " group by src", (f["id"],)):
                st[r["src"]] = r["n"]
            f["src_stat"] = st
            f["fields"] = sum(st.values())
            # AI 能自动带出的格数 = 证件识别 + 系统带出，这个比例就是这套系统提效的上限
            f["auto"] = st.get("ocr", 0) + st.get("sys", 0)
            f["uncovered"] = c.execute("select count(*) from form_field where formver_id=?"
                                       " and covered='none'", (f["id"],)).fetchone()[0]
            f["risk"] = c.execute("select count(*) from form_field where formver_id=? and risk=1",
                                  (f["id"],)).fetchone()[0]
            # 「必须客户本人提交」要扣掉系统默认代答否的高风险题——那些客人根本不会看到。
            # 不扣的话这个数虚高一倍，运营据此判断「客人到底要填多少」就是错的。
            f["ask_net"] = c.execute("select count(*) from form_field where formver_id=?"
                                     " and src='ask' and dft_no=0", (f["id"],)).fetchone()[0]
            f["ask_dft"] = st.get("ask", 0) - f["ask_net"]
            f["status_text"] = FV_STATUS.get(f["status"], f["status"])
            out.append(f)
        # 国家与签证类型下拉的选项源（唐美芳 2026-08-31：
        # 「签证类型、国家也应该是下拉选择的」）。常量与现有数据取并集：
        # 常量保证新国家能建，现有数据保证老记录不会因为不在常量里而选不中。
        return {"list": out,
                "countries": sorted(set(COUNTRIES) | {f["country"] for f in out if f["country"]}),
                "visa_cats": VISA_CATS}

    if path == "/ops/formver":
        need("ops", "uom")
        f = one(c, "select * from formver where id=?", (arg("id"),))
        if not f:
            raise Err("表单版本不存在", 404)
        fs = rows(c, "select * from form_field where formver_id=? order by sort", (f["id"],))
        secs = []
        for x in fs:
            if not secs or secs[-1]["name"] != x["section"]:
                secs.append({"name": x["section"], "items": []})
            secs[-1]["items"].append(x)
        # 详情页也能直接改抬头，下拉的选项源要跟着给，否则从详情进编辑时国家只剩当前值
        return {"formver": f, "sections": secs, "fields": fs,
                "countries": sorted(set(COUNTRIES) | {r["country"] for r in rows(
                    c, "select distinct country from formver where country<>''")}),
                "visa_cats": VISA_CATS}

    # 表模板本身的信息（国家、签证类型、表格代码、名称、官方入口）也要能改。
    # 原来只有「导入」这一条入口，写错个名字就只能重导一遍整张表——字段和分类全得重来。
    # 这里只改抬头信息，不碰 form_field，改名不会影响任何已标好的字段分类。
    if path == "/ops/formver/save":
        need("ops")
        f = one(c, "select * from formver where id=?", (body.get("id") or 0,))
        if not f:
            # 没带 id 就是新建一张空模板。唐美芳 2026-08-31：
            # 「表格代码、官方字段表是不是可以不用填」——先把模板抬头建起来，
            # 字段表回头再导，不必攒齐了才能落一条记录。
            if body.get("id"):
                raise Err("表单版本不存在", 404)
            ver = "V" + uuid.uuid4().hex[:5].upper()
            c.execute("insert into formver(ver_no,country,visa_type,form_code,name,official_url,"
                      "status,effective_at,active,created_at,updated_at)"
                      " values(?,?,?,?,?,?,'draft',?,1,?,?)",
                      (ver, arg("country"), body.get("visa_type") or "",
                       body.get("form_code") or "", arg("name"),
                       body.get("official_url") or "", now(), now(), now()))
            f = one(c, "select * from formver where id=?",
                    (c.execute("select last_insert_rowid()").fetchone()[0],))
            log(c, "formver", f["id"], None, user, "新建表模板",
                "%s · %s（暂无字段，待导入字段表）" % (arg("country"), arg("name")))
            return {"ok": True, "id": f["id"], "created": True}
        c.execute("update formver set country=?,visa_type=?,form_code=?,name=?,official_url=?,"
                  "updated_at=? where id=?",
                  (arg("country"), body.get("visa_type") or "", body.get("form_code") or "",
                   arg("name"), body.get("official_url") or "", now(), f["id"]))
        log(c, "formver", f["id"], None, user, "修改模板信息", arg("country") + " · " + arg("name"))
        return {"ok": True, "id": f["id"]}

    # 表模板是底层被引用的字典，不存在「草稿→发布」的生命周期，只有「还能不能被引用」，
    # 所以状态就是启用/禁用一个开关，落在 active 列上。
    # 「表模板发布 / 撤回」2026-09-09 加上又当天退回。唐美芳纠正了架构：
    # 表模板是**底层字典**，被国家送签材料库的清单版本引用，一份模板可被多个清单版本引用；
    # 一份模板能不能用，由引用它的清单版本决定，它自己只需要启用 / 禁用。
    # 我当时看到「日本模板 status=draft 导致建不出表」，就顺手给它加了一层发布状态，
    # 属于在错误的地基上加东西——真正的问题是 pick_formver 按国家去猜模板、
    # 绕开了清单版本上的关联。已改回走引用链（见 form_task.pick_formver）。
    # formver.status 这一列自此不再参与任何判断。

    if path == "/ops/formver/toggle":
        need("ops")
        f = one(c, "select * from formver where id=?", (body.get("id") or 0,))
        if not f:
            raise Err("表单版本不存在", 404)
        act = 0 if f["active"] else 1
        c.execute("update formver set active=?,updated_at=? where id=?", (act, now(), f["id"]))
        log(c, "formver", f["id"], None, user, "启用" if act else "禁用", f["name"])
        return {"ok": True, "active": act}

    # 有 id 就是改，没 id 就是新增。官网偶尔加格子（社交媒体、网站/应用信息就是这么加的），
    # 运营不该为了补一格去重新导一遍整张表。
    if path == "/ops/form/field/save":
        need("ops")
        fid = int(body.get("id") or 0)
        vals = (arg("src"), body.get("src_from") or "",
                1 if body.get("risk") else 0, 1 if body.get("required") else 0,
                1 if body.get("dft_no") else 0,
                body.get("ftype") or "text", body.get("options") or "",
                body.get("fill_note") or "")
        if fid:
            c.execute("update form_field set src=?,src_from=?,risk=?,required=?,dft_no=?,"
                      "ftype=?,options=?,fill_note=? where id=?", vals + (fid,))
            f = one(c, "select * from form_field where id=?", (fid,))
            log(c, "formver", f["formver_id"], None, user, "修改字段", f["name"])
        else:
            fv = int(body["formver_id"])
            sec, name = arg("section"), arg("name")
            if one(c, "select id from form_field where formver_id=? and section=? and name=?",
                   (fv, sec, name)):
                raise Err("这个板块下已经有同名字段了", 400)
            # 新增的排在同板块最后一格之后，不打乱官方表原有顺序
            nxt = c.execute("select ifnull(max(sort),0)+1 from form_field where formver_id=?"
                            " and section=?", (fv, sec)).fetchone()[0]
            c.execute("update form_field set sort=sort+1 where formver_id=? and sort>=?",
                      (fv, nxt))
            c.execute("insert into form_field(formver_id,section,name,src,src_from,risk,"
                      "required,dft_no,ftype,options,fill_note,covered,sort)"
                      " values(?,?,?,?,?,?,?,?,?,?,?,'none',?)",
                      (fv, sec, name) + vals + (nxt,))
            log(c, "formver", fv, None, user, "新增字段", sec + " · " + name)
        return {"ok": True}

    if path == "/ops/form/field/del":
        need("ops")
        f = one(c, "select * from form_field where id=?", (int(body["id"]),))
        if not f:
            raise Err("字段不存在", 404)
        # 已经有客人答过的格子不能删——删了答案就成了孤儿，也说不清客人当初答的是哪一题
        n = c.execute("select count(*) from form_answer where field_id=?", (f["id"],)).fetchone()[0]
        if n:
            raise Err("已有 %d 位办签人填过这一格，不能删除；如已停用请改说明标注" % n, 400)
        c.execute("delete from form_field where id=?", (f["id"],))
        log(c, "formver", f["formver_id"], None, user, "删除字段", f["section"] + " · " + f["name"])
        return {"ok": True}

    # 表格导入：运营把官方字段表传上来，系统解析后先给预览（新增/变更/未在表内），确认了才入库。
    # 不做「传上来直接覆盖」——覆盖掉运营已经标好的字段来源分类，等于白干一遍。
    if path == "/ops/form/tpl":
        # 官方字段表的标准模板（唐美芳 2026-09-01：「官方字段表，是不是应该有个模板下载才对」）。
        # 运营拿到的官方表格式五花八门，给一份带表头与示例行的空模板，
        # 照着填再上传，解析一次就能过——比传上来被拒再回去改列名省事。
        need("ops")
        import form_tpl
        url = form_tpl.build(WEB, PREFIX)
        return {"ok": True, "url": url, "name": "官方字段表模板.xlsx"}

    if path in ("/ops/form/import", "/ops/form/import/commit"):
        need("ops")
        import form_import
        url = arg("url")
        fp = os.path.join(WEB, url.split(PREFIX + "/", 1)[-1]) if PREFIX in url else ""
        if not fp or not os.path.exists(fp):
            raise Err("文件不存在，请重新上传", 400)
        try:
            sheet, incoming = form_import.parse(fp)
        except Exception as e:
            raise Err("表格解析失败：%s" % e, 400)
        fv = one(c, "select * from formver where id=?", (body.get("formver_id") or 0,))
        existing = rows(c, "select * from form_field where formver_id=?",
                        (fv["id"],)) if fv else []
        d = form_import.diff(existing, incoming)
        if path.endswith("/commit"):
            if not fv:
                ver = "V" + uuid.uuid4().hex[:5].upper()
                c.execute("insert into formver(ver_no,country,visa_type,form_code,name,"
                          "official_url,status,effective_at,active,created_at,updated_at)"
                          # 新导进来的模板直接启用：下游的送签材料库、产品都要引用它，
                          # 默认禁用会让整条链静默断掉，比默认启用危险。
                          " values(?,?,?,?,?,?,'draft',?,1,?,?)",
                          (ver, arg("country"), body.get("visa_type"),
                           body.get("form_code") or "", arg("name"),
                           body.get("official_url") or "", now(), now(), now()))
                fv = one(c, "select * from formver where id=?",
                         (c.execute("select last_insert_rowid()").fetchone()[0],))
            for f in d["add"]:
                c.execute("insert into form_field(formver_id,section,name,fill_note,help_text,"
                          "notice,src,src_from,required,covered,risk,dft_no,ftype,options,sort)"
                          " values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                          (fv["id"], f["section"], f["name"], f["fill_note"], f["help_text"],
                           f["notice"], f["src"], f["src_from"], f["required"], f["covered"],
                           f["risk"], f.get("dft_no", 0), f.get("ftype") or "text",
                           f.get("options") or "", f["sort"]))
            for f in d["upd"]:
                c.execute("update form_field set fill_note=?,help_text=?,notice=?,covered=?,"
                          "sort=? where formver_id=? and section=? and name=?",
                          (f["fill_note"], f["help_text"], f["notice"], f["covered"],
                           f["sort"], fv["id"], f["section"], f["name"]))
            c.execute("update formver set updated_at=? where id=?", (now(), fv["id"]))
            log(c, "formver", fv["id"], None, user, "表格导入",
                "新增 %d / 更新 %d" % (len(d["add"]), len(d["upd"])))
            return {"ok": True, "formver_id": fv["id"],
                    "add": len(d["add"]), "upd": len(d["upd"])}
        # 预览：字段名和板块可能很长，只回前 30 条给人看个数和样子
        cut = lambda xs: [{"section": x["section"], "name": x["name"], "src": x["src"],
                           "covered": x["covered"]} for x in xs[:30]]
        # 自动分析：这张表传上来后，系统按字段名关键词把每一格判给四类来源之一。
        # 运营最想先看到的就是「客人到底还要自己填几格」，所以这里直接把净值和明细算好。
        stat = {}
        for x in incoming:
            stat[x["src"]] = stat.get(x["src"], 0) + 1
        ask_self = [x for x in incoming if x["src"] == "ask" and not x.get("dft_no")]
        return {"sheet": sheet, "total": len(incoming),
                "add": len(d["add"]), "upd": len(d["upd"]),
                "same": len(d["same"]), "gone": len(d["gone"]),
                "add_list": cut(d["add"]), "upd_list": cut(d["upd"]),
                "gone_list": cut(d["gone"]),
                "src_stat": stat,
                "auto": stat.get("ocr", 0) + stat.get("sys", 0),
                "risk": len([x for x in incoming if x["risk"]]),
                "ask_dft": len([x for x in incoming if x["src"] == "ask" and x.get("dft_no")]),
                "ask_net": len(ask_self),
                "ask_list": [{"section": x["section"], "name": x["name"],
                              "risk": x["risk"]} for x in ask_self]}

    if path == "/ops/fullvers":
        need("ops", "ubk")
        out = []
        # 列表按创建时间倒序：新建的版本要出现在第一行，运营刚建完就能接着编
        for f in rows(c, "select * from fullver order by ifnull(created_at,'') desc, id desc"):
            # 供应商只看平台版本 + 自己建的，看不到同行的清单
            if not fv_visible(user, f):
                continue
            f["mine"] = 1 if (f["owner_org"] or 0) == (user["org_id"] or -1) else 0
            f["can_edit"] = 1 if fv_can_edit(user, f) else 0
            f["owner_text"] = ("平台统一版本" if not f["owner_org"] else
                               (one(c, "select short from org where id=?",
                                    (f["owner_org"],)) or {}).get("short") or "供应商自建")
            f["items"] = c.execute("select count(*) from fullver_item where fullver_id=?",
                                   (f["id"],)).fetchone()[0]
            # 引用这份清单的产品。**按角色算，不能一把梭**：
            # 平台运营看平台产品 + 全部供应商产品；供应商只看自己公司的产品——
            # 他在自己的产品管理里根本看不到平台产品，把平台产品算进「关联 N 条」，
            # 点进去就是一张空表（2026-09-09 实测踩到）。
            # ⚠️ 供应商产品的清单是**可继承的**：sp.fullver_id 为空时用平台产品那份。
            # 统计口径必须跟产品列表里显示的那一列一致（列表用的就是
            # coalesce(sp.fullver_id, p.fullver_id)），否则会出现「关联 1 条、
            # 点进去筛出 2 条」（2026-09-09 实测踩到）。
            SUP_USED = ("select sp.name, o2.short sup from sup_product sp"
                        " join product p on p.id=sp.product_id"
                        " left join org o2 on o2.id=sp.org_id"
                        " where coalesce(sp.fullver_id, p.fullver_id)=?")
            if user["role"] == "ubk":
                f["used_by"] = [r["name"] for r in rows(
                    c, SUP_USED + " and sp.org_id=?", (f["id"], user["org_id"]))]
            else:
                # 平台产品与供应商产品同名是常态（供应商就是照着平台目录建的），
                # 直接拼在一起会出现「4 条」里两两重名，看着像重复数据。
                # 平台的直接给名字，供应商的在后面标出是谁家的（2026-09-09）。
                f["used_by"] = [r["name"] for r in rows(
                    c, "select name from product where fullver_id=?", (f["id"],))] + \
                    ["%s（%s）" % (r["name"], r["sup"] or "供应商")
                     for r in rows(c, SUP_USED, (f["id"],))]
            f["status_text"] = FV_STATUS.get(f["status"], f["status"])
            fv = one(c, "select ver_no,form_code,name,active from formver where id=?",
                     (f["formver_id"] or 0,))
            f["form"] = ({"ver_no": fv["ver_no"], "form_code": fv["form_code"],
                          "name": fv["name"], "active": fv["active"]} if fv else None)
            out.append(f)
        # 建清单时要选「关联哪张国家签证表模板」，选项就是表模板库里还启用的那些
        forms = [{"id": r["id"], "ver_no": r["ver_no"], "form_code": r["form_code"],
                  "name": r["name"], "country": r["country"], "visa_type": r["visa_type"]}
                 for r in rows(c, "select * from formver where active=1 order by country, id")]
        return {"list": out, "forms": forms,
                "countries": sorted(set(COUNTRIES) | {f["country"] for f in out if f["country"]}),
                "visa_cats": VISA_CATS,
                "visa_types": sorted(set(VISA_TYPES) | {f["visa_type"] for f in out if f["visa_type"]})}

    if path == "/ops/fullver":
        need("ops", "ubk")
        f = fv_guard(user, one(c, "select * from fullver where id=?", (arg("id"),)), edit=False)
        f["can_edit"] = 1 if fv_can_edit(user, f) else 0
        f["owner_text"] = ("平台统一版本" if not f["owner_org"] else
                           (one(c, "select short from org where id=?",
                                (f["owner_org"],)) or {}).get("short") or "供应商自建")
        f["form"] = one(c, "select id,ver_no,form_code,name from formver where id=?",
                        (f["formver_id"] or 0,))
        return {"fullver": f, "items": checklist_for(c, f["id"], None),
                "by_crowd": {k: [i["mat_name"] for i in checklist_for(c, f["id"], k)]
                             for k in CROWD}}

    if path == "/ops/products":
        # 签证产品：供应商在 UBK 上的每一条产品都在这里过总部采购审核
        need("ops")
        out = []
        for sp in rows(c, "select * from sup_product order by id desc"):
            p = one(c, "select * from product where id=?", (sp["product_id"],))
            org = one(c, "select * from org where id=?", (sp["org_id"],))
            fvid = sp["fullver_id"] or p["fullver_id"]
            fv = one(c, "select ver_no,name from fullver where id=?", (fvid,)) or {}
            addr = one(c, "select * from addr where id=?", (sp["addr_id"],))
            pks = rows(c, "select * from pkg where sup_product_id=? order by settle_price",
                       (sp["id"],))
            ords = c.execute("select count(*) from ord where sup_product_id=?",
                             (sp["id"],)).fetchone()[0]
            out.append({
                "id": sp["id"], "name": sp["name"], "feature": sp["feature"],
                "supplier": org["short"], "supplier_full": org["name"],
                "code": sp["code"] or p["code"],       # 平台发的产品编码 Q+6 位
                "cat_code": p["code"],                  # 平台目录码，两者不是一回事
                "vendor_code": sp["vendor_code"] or "",  # 供应商自己系统里的编码

                "country": p["country"], "visa_type": p["visa_type"],
                "visa_cat": p["visa_cat"] or "",
                "submit_city": p["submit_city"], "entries": p["entries"],
                "stay_days": p["stay_days"], "stay_text": stay_text(p),
                "accept_note": p["accept_note"],
                "valid": valid_text(p),
                "need_interview": p["need_interview"],
                "need_fingerprint": p["need_fingerprint"],
                "fullver": fv.get("ver_no"), "fullver_name": fv.get("name"),
                "mail_addr": ("%s %s" % (addr["region"], addr["detail"])) if addr else None,
                "to_b": sp["to_b"], "to_c": sp["to_c"], "status": sp["status"],
                "review_b": sp["review_b"], "review_b_note": sp["review_b_note"],
                "review_b_by": sp["review_b_by"], "review_b_at": sp["review_b_at"],
                "review_b_imgs": jl(sp["review_b_imgs"], []),
                "review_c": sp["review_c"], "review_c_note": sp["review_c_note"],
                "review_c_by": sp["review_c_by"], "review_c_at": sp["review_c_at"],
                "review_c_imgs": jl(sp["review_c_imgs"], []),
                "on_b": sup_on(sp, "b"), "on_c": sup_on(sp, "c"),
                "off_sale": 1 if ("off_sale" in sp.keys() and sp["off_sale"]) else 0,
                "submit_at": sp["submit_at"], "updated_at": sp["updated_at"],
                "pkg_count": len(pks),
                "pkgs": [{"name": k["name"], "settle_price": k["settle_price"],
                          "suggest_retail": k["suggest_retail"], "lead_days": k["lead_days"],
                          "refund_insured": k["refund_insured"]} for k in pks],
                "settle_min": min([k["settle_price"] for k in pks] or [0]),
                "settle_max": max([k["settle_price"] for k in pks] or [0]),
                "retail_min": min([k["suggest_retail"] for k in pks] or [0]),
                "retail_max": max([k["suggest_retail"] for k in pks] or [0]),
                "lead_min": min([k["lead_days"] for k in pks] or [0]),
                "lead_max": max([k["lead_days"] for k in pks] or [0]),
                "gross_min": min([k["suggest_retail"] - k["settle_price"] for k in pks] or [0]),
                # 2026-09-09 按唐美芳给的众信旅游产品列表结构补齐（她给了截图）：
                # 团队游那张表是「线路数 / 团期数、结算价区间、零售价区间、利润率区间、
                # 销售状态、C 端是否上架、创建 / 最近更新」，签证这边按同一骨架换字段——
                # 「团期」换成「套餐」，「出发地 / 目的地」换成「送签地 / 目的地国家」。
                "pkg_on": len([k for k in pks if (k["status"] or "on") == "on"]),
                "margin_max": round(max(
                    [(k["suggest_retail"] - k["settle_price"]) / k["suggest_retail"] * 100
                     for k in pks if k["suggest_retail"]] or [0]), 2),
                "margin_min": round(min(
                    [(k["suggest_retail"] - k["settle_price"]) / k["suggest_retail"] * 100
                     for k in pks if k["suggest_retail"]] or [0]), 2),
                # 「供应商计调」：签证这边没有计调岗，对应的是供应商侧建这条产品的人，
                # 出问题时众信就是找他。取 sup_product 的创建人。
                "sup_owner_name": sp["created_by_name"] or "",
                "ord_count": ords,
            })
            aud(out[-1], sp)
        return {"list": out}

    if path == "/ops/product":
        # 运营端的单产品详情。列表只回答「这条产品现在什么状态、缺什么」，
        # 详情要回答「它到底是怎么配的」——采购在放行前得看全：签证属性、办理要求、
        # 受理范围、收料地址、绑的哪一版材料清单、每个套餐的价怎么拆、两端审核结论与操作日志。
        # 之前这里只有一个「套餐与报价」弹窗，采购看不到别的，只能跑去 UBK 侧看，
        # 等于让运营去翻供应商的后台（唐美芳 2026-08-27）。
        need("ops")
        sp = one(c, "select * from sup_product where id=?", (arg("id"),))
        if not sp:
            raise Err("产品不存在", 404)
        p = one(c, "select * from product where id=?", (sp["product_id"],))
        org = one(c, "select * from org where id=?", (sp["org_id"],))
        addr = one(c, "select * from addr where id=?", (sp["addr_id"],))
        fvid = sp["fullver_id"] or p["fullver_id"]
        fv = one(c, "select * from fullver where id=?", (fvid,)) if fvid else None
        pks = rows(c, "select * from pkg where sup_product_id=? order by settle_price",
                   (sp["id"],))
        # 运营看到的必须是「客人实际会收到的那一份」：平台清单叠上该供应商的定制。
        # 原来直接读 fullver_item 原表，运营审的是平台原版、客人收到的是定制版，
        # 这种落差最难查（2026-09-04）。
        items = checklist_for(c, fvid, None, sp, p["need_interview"]) if fvid else []
        evs = rows(c, "select * from event where scope='sup_product' and ref_id=?"
                      " order by id desc limit 40", (sp["id"],))
        ords = c.execute("select count(*) from ord where sup_product_id=?",
                         (sp["id"],)).fetchone()[0]
        d = {
            "id": sp["id"], "name": sp["name"], "feature": sp["feature"],
            # 审核页上运营可改的对客文案（2026-09-09 按她给的众信审核页截图补）
            "subtitle": sp["subtitle"] if "subtitle" in sp.keys() else "",
            "share_text": sp["share_text"] if "share_text" in sp.keys() else "",
            "sup_code": sp["code"],       # 平台给的产品编码 Q+6 位
            # 供应商自己 ERP 里的产品编码，选填，只用来跟外部对码，系统内不做唯一约束
            # ——唐美芳 2026-08-31：「以防万一外部供应商有自己的产品编码，能够和我们系统里的对应上」
            "vendor_code": sp["vendor_code"] or "",
            # 办理流程三级回落：产品自配 → 该国默认 → 平台默认。
            # 原来产品没配时前端拿写死的 5 步兜底，运营改不了
            # （唐美芳 2026-09-01：默认流程也统一放进运营配置）。
            "flow": flow_of(c, sp, p),
            "code": p["code"],
            "supplier": org["short"], "supplier_full": org["name"],
            "product": dict(p), "accept_provinces": jl(p["accept_provinces"]),
            "svc": svc_list(sp, p, pks),
            "packages": [dict(k) for k in pks],
            "fullver": dict(fv) if fv else None,
            "items": items,
            "mat_custom": jl(sp["mat_custom"], {"add": [], "skip": []}),
            "addr": dict(addr) if addr else None,
            "to_b": sp["to_b"], "to_c": sp["to_c"], "status": sp["status"],
            "on_b": sup_on(sp, "b"), "on_c": sup_on(sp, "c"),
            "submit_at": sp["submit_at"], "ord_count": ords,
            # 审核页要直接摆出来的展示值（2026-09-09）：原来这些只在列表接口里算好，
            # 详情页拿不到，审核页上就出现了「— · —」和「[object Object]」。
            "valid": valid_text(p), "stay_text": stay_text(p),
            "entries": p["entries"],
            "fullver_ver": (fv or {}).get("ver_no") or "",
            "fullver_name": (fv or {}).get("name") or "",
            "mail_addr": ("%s %s" % (addr["region"], addr["detail"])) if addr else "",
            "svc_tags": jl(sp["svc_tags"], []),
            "svc_opts": SVC_OPTS,
            "hero_img": sp["hero_img"] or "",
            "sup_owner_name": sp["created_by_name"] or "",
            "events": [dict(e) for e in evs],
        }
        for t in ("b", "c"):
            for k in ("", "_note", "_by", "_at"):
                d["review_" + t + k] = sp["review_" + t + k]
            # 驳回截图单独取：它是 JSON 数组，不能跟上面那几个字符串字段混在一个循环里
            d["review_" + t + "_imgs"] = jl(sp["review_" + t + "_imgs"], [])
        aud(d, sp)
        return d

    if path == "/ops/product/onsale":
        # 平台侧启售 / 停售（唐美芳 2026-09-09：「销售状态可以操作开关控制启停售状态」）。
        # 与「撤销上架」不同：撤销会把审核结论清成待审，恢复要重走一遍审核；
        # 这个开关只挂一个 off_sale 标记，审核结论原样保留。
        need("ops")
        sp = one(c, "select * from sup_product where id=?", (arg("id"),))
        if not sp:
            raise Err("产品不存在", 404)
        off = 1 if body.get("off") else 0
        c.execute("update sup_product set off_sale=?,updated_by=?,updated_by_name=?,updated_at=?"
                  " where id=?", (off, user["id"], user["name"], now(), sp["id"]))
        log(c, "sup_product", sp["id"], None, user, "停售" if off else "启售", sp["name"])
        return {"ok": True, "off_sale": off,
                "msg": "已停售，客户端与门店端立即不再展示" if off
                else "已启售，按各端审核结论恢复展示"}

    if path == "/ops/product/market":
        # 产品审核页上运营可编辑的**对客文案**：产品名称 / 副标题 / 服务标签 /
        # 主图 / 分享推广语。唐美芳 2026-09-09：「审核产品的页面支持部分字段编辑」。
        # 只开这几样——价格、材料清单、受理范围是供应商的口径，运营要改得回到
        # 「编辑产品 / 编辑套餐」，那两处会触发自动下架与重新送审。
        need("ops")
        sp = one(c, "select * from sup_product where id=?", (arg("id"),))
        if not sp:
            raise Err("产品不存在", 404)
        svc = [t for t in (body.get("svc_tags") or []) if t in SVC_OPTS]
        c.execute("update sup_product set name=?,subtitle=?,feature=?,svc_tags=?,"
                  "hero_img=?,share_text=?,updated_by=?,updated_by_name=?,updated_at=?"
                  " where id=?",
                  (arg("name"), body.get("subtitle") or "", body.get("feature") or "",
                   json.dumps(svc, ensure_ascii=False), body.get("hero_img") or "",
                   body.get("share_text") or "", user["id"], user["name"], now(), sp["id"]))
        log(c, "sup_product", sp["id"], None, user, "审核页修改对客信息",
            "产品名称 / 副标题 / 标签 / 主图 / 推广语")
        return {"ok": True}

    if path == "/ops/product/review":
        # 上架审核：通过 / 驳回 / 对已通过的产品撤销上架。
        # track=b 是渠道运营审 CSP 上架，track=c 是内容运营审客户小程序上架，
        # 两拨人各审各的，一端的动作绝不改动另一端的结论。
        need("ops")
        sp = one(c, "select * from sup_product where id=?", (arg("id"),))
        if not sp:
            raise Err("产品不存在", 404)
        track = arg("track")
        if track not in ("b", "c"):
            raise Err("请指定审核端 track=b|c")
        side = "B 端" if track == "b" else "C 端"
        if not sp["to_" + track]:
            raise Err("该产品未申请上架 %s，无需审核" % side)
        act = arg("action")
        note = (body.get("note") or "").strip()
        # 驳回截图：最多 5 张，只收本站上传下来的相对路径，防止把外链塞进来
        imgs = [u for u in (body.get("note_imgs") or [])
                if isinstance(u, str) and u.startswith(PREFIX + "/uploads/")][:5]
        if act == "approve":
            if not c.execute("select count(*) from pkg where sup_product_id=?",
                             (sp["id"],)).fetchone()[0]:
                raise Err("该产品没有套餐报价，不能通过")
            c.execute("update sup_product set review_{0}='approved',review_{0}_note=?,"
                      "review_{0}_imgs=null,review_{0}_by=?,review_{0}_at=? where id=?"
                      .format(track),
                      (note, user["name"], now(), sp["id"]))
            log(c, "sup_product", sp["id"], None, user, side + "上架审核通过",
                "%s（%s）" % (sp["name"], note or "无备注"))
        elif act in ("reject", "revoke"):
            if not note:
                raise Err("请填写驳回原因，供应商要照着改")
            c.execute("update sup_product set review_{0}='rejected',review_{0}_note=?,"
                      "review_{0}_imgs=?,review_{0}_by=?,review_{0}_at=? where id=?"
                      .format(track),
                      (note, json.dumps(imgs) if imgs else None,
                       user["name"], now(), sp["id"]))
            log(c, "sup_product", sp["id"], None, user,
                side + ("上架审核驳回" if act == "reject" else "撤销已上架产品"),
                "%s：%s%s" % (sp["name"], note,
                             "（附截图 %d 张）" % len(imgs) if imgs else ""))
        else:
            raise Err("未知的审核动作")
        return {"ok": True}

    if path == "/ops/sample/save":
        need("ops")
        files = json.dumps(body.get("files") or [])
        # 适用范围：多选，留空＝通用。受控枚举之外的值不落库，
        # 否则筛选下拉会被拼写不一的自由文本撑爆（「美国」「美国 」「USA」）。
        def scope(key, allow, label):
            v = body.get(key) or []
            if isinstance(v, str):        # 兼容单值老调用
                v = [v] if v.strip() else []
            v = [x.strip() for x in v if str(x).strip()]
            bad = [x for x in v if x not in allow]
            if bad:
                raise Err("%s不在受控列表中：%s" % (label, "、".join(bad)))
            # 去重且保持录入顺序，展示时不会出现重复标签
            return list(dict.fromkeys(v))

        countries = scope("countries", COUNTRIES, "适用国家")
        visa_types = scope("visa_types", VISA_TYPES, "适用签证类型")
        if visa_types and not countries:
            raise Err("选择签证类型时必须同时选择适用国家，否则无法判定适用范围")
        cs = json.dumps(countries, ensure_ascii=False)
        vs = json.dumps(visa_types, ensure_ascii=False)
        if body.get("id"):
            c.execute("update sample_tpl set name=?,mat_name=?,files=?,countries=?,visa_types=?"
                      " where id=?",
                      (arg("name"), arg("mat_name"), files, cs, vs, body["id"]))
            sid, act = int(body["id"]), "修改样例模版"
        else:
            code = body.get("code") or ("TPL" + uuid.uuid4().hex[:6].upper())
            c.execute("insert into sample_tpl(code,name,mat_name,files,countries,visa_types,created_at)"
                      " values(?,?,?,?,?,?,?)",
                      (code, arg("name"), arg("mat_name"), files, cs, vs, now()))
            sid, act = c.execute("select last_insert_rowid()").fetchone()[0], "新建样例模版"
        log(c, "sample", sid, None, user, act, arg("name"))
        return {"ok": True, "id": sid}

    if path == "/ops/sample/del":
        need("ops")
        sid = int(arg("id"))
        used = c.execute("select count(*) from fullver_item where sample_tpl_id=?",
                         (sid,)).fetchone()[0]
        if used:
            raise Err("已被 %d 条材料项引用，不能删除" % used)
        c.execute("delete from sample_tpl where id=?", (sid,))
        log(c, "sample", sid, None, user, "删除样例模版", "")
        return {"ok": True}

    if path == "/ops/fullver/save":
        need("ops", "ubk")
        # 关联表模板：0/空都存 NULL，表示还没挂
        fvid = int(body.get("formver_id") or 0) or None
        gen = 0
        # 供应商建的版本归自己所有；运营建的是平台统一版本
        mine_org = user["org_id"] if user["role"] == "ubk" else 0
        if body.get("id"):
            fid = int(body["id"])
            fv_guard(user, one(c, "select * from fullver where id=?", (fid,)))
            c.execute("update fullver set country=?,visa_type=?,name=?,formver_id=?,updated_at=?"
                      " where id=?",
                      (arg("country"), body.get("visa_type"), arg("name"), fvid, now(), fid))
            act = "修改完整版"
        else:
            # 「复制新版」的源版本得是自己看得见的那些——供应商不能拿同行的清单来抄
            if body.get("from_id"):
                fv_guard(user, one(c, "select * from fullver where id=?",
                                   (int(body["from_id"]),)), edit=False)
            ver = body.get("ver_no") or ("V" + uuid.uuid4().hex[:5].upper())
            c.execute("insert into fullver(ver_no,country,visa_type,name,formver_id,owner_org,"
                      "from_id,status,effective_at,active,created_at,updated_at)"
                      " values(?,?,?,?,?,?,?,'draft',?,0,?,?)",
                      (ver, arg("country"), body.get("visa_type"), arg("name"), fvid, mine_org,
                       body.get("from_id"), now(), now(), now()))
            fid = c.execute("select last_insert_rowid()").fetchone()[0]
            act = "新建完整版"
            if body.get("from_id"):
                for it in rows(c, "select * from fullver_item where fullver_id=? order by sort",
                               (int(body["from_id"]),)):
                    c.execute("insert into fullver_item(fullver_id,mat_name,attr,provide_way,"
                              "copies,necessity,require_text,sample_tpl_id,files,crowds,sort)"
                              " values(?,?,?,?,?,?,?,?,?,?,?)",
                              (fid, it["mat_name"], it["attr"], it["provide_way"], it["copies"],
                               it["necessity"], it["require_text"], it["sample_tpl_id"],
                               it["files"], it["crowds"], it["sort"]))
                act = "复制完整版"
            else:
                # 新建（非复制）时按关联的表模板自动带出材料项，省掉一遍手抄
                # （唐美芳 2026-09-01：「怎么没有把材料清单里的字段自动带出来呢，
                # 还得二次手动新建材料项，这样是不是有点重复工作了」）。
                gen = items_from_formver(c, fvid, fid)
        log(c, "fullver", fid, None, user, act, arg("country") + " · " + arg("name") +
            ("；按表模板自动带出 %d 项材料" % gen if not body.get("id") and gen else ""))
        return {"ok": True, "id": fid, "generated": gen}

    if path == "/ops/fullver/regen":
        # 已建好的清单也能再按表模板补带一次：换绑了表模板、或者表模板补了新的
        # 证件识别字段之后，不用重新建一版。已存在的同名材料项不会重复添加。
        need("ops", "ubk")
        f = fv_guard(user, one(c, "select * from fullver where id=?", (arg("id"),)))
        if f["status"] == "published":
            raise Err("已发布的版本不能改，请用「复制新版」")
        if not f["formver_id"]:
            raise Err("该版本还没有关联国家签证表模板，先在「编辑信息」里关联")
        mx = c.execute("select ifnull(max(sort),0) from fullver_item where fullver_id=?",
                       (f["id"],)).fetchone()[0]
        n = items_from_formver(c, f["formver_id"], f["id"], mx)
        log(c, "fullver", f["id"], None, user, "按表模板补带材料项", "新增 %d 项" % n)
        return {"ok": True, "added": n}

    if path == "/ops/fullver/publish":
        need("ops", "ubk")
        f = fv_guard(user, one(c, "select * from fullver where id=?", (arg("id"),)))
        if arg("action", False, "publish") == "unpublish":
            # 平台版本挂在平台目录产品上，供应商自建的版本挂在他自己的产品上，
            # 两边都要查——只查 product 的话，供应商撤回自己在售产品用的清单，
            # 客人当场就看不到该交什么材料了
            used = c.execute("select count(*) from product where fullver_id=? and"
                             " status='published'", (f["id"],)).fetchone()[0]
            used += c.execute("select count(*) from sup_product where fullver_id=? and"
                              " status='published'", (f["id"],)).fetchone()[0]
            if used:
                raise Err("已被 %d 个在架产品使用，不能撤回发布" % used)
            # 撤回是独立状态，不是退回草稿——运营要能一眼分清「还没发过」和「发过又收回」
            c.execute("update fullver set status='withdrawn',active=0,updated_at=? where id=?",
                      (now(), f["id"]))
            log(c, "fullver", f["id"], None, user, "撤回发布", f["ver_no"])
            return {"ok": True, "status": "withdrawn"}
        n = c.execute("select count(*) from fullver_item where fullver_id=?",
                      (f["id"],)).fetchone()[0]
        if not n:
            raise Err("材料清单为空，不能发布")
        # 发布即生效。原来还有个「生效日期」做定时生效，实际业务里使领馆改要求当天就得换，
        # 没人会提前排期，那个字段只制造了「已发布但没生效」这种没人看得懂的中间态。
        c.execute("update fullver set status='published',effective_at=?,active=1,updated_at=?"
                  " where id=?", (now(), now(), f["id"]))
        log(c, "fullver", f["id"], None, user, "发布完整版", "%s · %d 项材料" % (f["ver_no"], n))
        return {"ok": True, "status": "published"}

    if path == "/ops/fullver/del":
        # 删清单版本（唐美芳 2026-09-04：「ubk 系统里自己创建的数据，uom 也能看到、
        # 编辑、删除」）。运营是平台的兜底管理员，供应商建歪了要有人能收拾；
        # 供应商也能删自己建的，但删不了平台的。
        need("ops", "ubk")
        f = fv_guard(user, one(c, "select * from fullver where id=?", (arg("id"),)))
        # 引用检查放在最前：清单被产品绑着，删掉客人就不知道该交什么材料了。
        # 平台目录产品与供应商产品分别挂在 product / sup_product 上，两边都要查。
        used = [r["name"] for r in rows(
            c, "select name from product where fullver_id=?", (f["id"],))]
        used += [r["name"] for r in rows(
            c, "select name from sup_product where fullver_id=?", (f["id"],))]
        if used:
            raise Err("该版本已被 %d 个产品绑定，不可删除：%s。"
                      "请先在产品中更换所绑定的清单版本" % (len(used), "、".join(used[:3])))
        # 订单的材料清单在下单时已快照进 mat 表，不读 fullver；
        # 但材料<b>样例图</b>仍是拿 mat.item_id 回查 fullver_item 实时取的，
        # 删了材料项，历史订单里那些样例就打不开了。所以有历史引用的一律不让删。
        ref = c.execute("select count(*) from mat where item_id in"
                        " (select id from fullver_item where fullver_id=?)",
                        (f["id"],)).fetchone()[0]
        if ref:
            raise Err("该版本的材料项已被 %d 条历史订单材料引用，不可删除。"
                      "如不再使用，请将其撤回发布" % ref)
        n_item = c.execute("select count(*) from fullver_item where fullver_id=?",
                           (f["id"],)).fetchone()[0]
        c.execute("delete from fullver_item where fullver_id=?", (f["id"],))
        c.execute("delete from fullver where id=?", (f["id"],))
        log(c, "fullver", f["id"], None, user, "删除清单版本",
            "%s %s（含 %d 条材料项）" % (f["ver_no"], f["name"], n_item))
        return {"ok": True}

    if path == "/ops/item/save":
        need("ops", "ubk")
        f = (arg("mat_name"), arg("attr"), json.dumps(body.get("provide_way") or ["mail"]),
             int(body.get("copies") or 1), arg("necessity"), body.get("require_text"),
             int(body.get("sample_tpl_id") or 0) or None,
             json.dumps(body.get("crowds") or list(CROWD.keys())),
             int(body.get("sort") or 0))
        if body.get("id"):
            c.execute("update fullver_item set mat_name=?,attr=?,provide_way=?,copies=?,"
                      "necessity=?,require_text=?,sample_tpl_id=?,crowds=?,sort=? where id=?",
                      f + (body["id"],))
            iid, act = int(body["id"]), "修改材料项"
            fid = one(c, "select fullver_id from fullver_item where id=?", (iid,))["fullver_id"]
            fv_guard(user, one(c, "select * from fullver where id=?", (fid,)))
        else:
            fid = int(arg("fullver_id"))
            fv_guard(user, one(c, "select * from fullver where id=?", (fid,)))
            mx = c.execute("select ifnull(max(sort),0) from fullver_item where fullver_id=?",
                           (fid,)).fetchone()[0]
            f = f[:8] + (int(body.get("sort") or mx + 10),)
            c.execute("insert into fullver_item(fullver_id,mat_name,attr,provide_way,copies,"
                      "necessity,require_text,sample_tpl_id,crowds,sort)"
                      " values(?,?,?,?,?,?,?,?,?,?)", (fid,) + f)
            iid, act = c.execute("select last_insert_rowid()").fetchone()[0], "新增材料项"
        c.execute("update fullver set updated_at=? where id=?", (now(), fid))
        log(c, "fullver", fid, None, user, act, arg("mat_name"))
        return {"ok": True, "id": iid}

    if path == "/ops/item/del":
        need("ops", "ubk")
        it = one(c, "select * from fullver_item where id=?", (arg("id"),))
        if not it:
            raise Err("材料项不存在", 404)
        fv_guard(user, one(c, "select * from fullver where id=?", (it["fullver_id"],)))
        c.execute("delete from fullver_item where id=?", (it["id"],))
        log(c, "fullver", it["fullver_id"], None, user, "删除材料项", it["mat_name"])
        return {"ok": True}

    if path == "/ops/orders":
        need("ops", "lead", "fin")
        out = []
        g = lambda s, a: c.execute(s, a).fetchone()[0]
        for o in rows(c, "select * from ord order by id desc"):
            sp = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
            pk = one(c, "select * from pkg where id=?", (o["pkg_id"],))
            org = one(c, "select name from org where id=?", (o["org_id"],)) or {}
            sup = one(c, "select short from org where id=?",
                      (sp["org_id"] if sp else 0,)) or {}
            p0 = one(c, "select * from product where id=?",
                     (sp["product_id"] if sp else 0,)) or {}
            # 金额分四块：客户侧收了多少、还欠多少；供应商侧该付多少、付了没有；再算毛利
            recv = g("select ifnull(sum(amount),0) from pay"
                     " where ord_id=? and kind='in' and fin_confirmed=1", (o["id"],))
            waitc = g("select ifnull(sum(amount),0) from pay"
                      " where ord_id=? and kind='in' and fin_confirmed=0", (o["id"],))
            refunded = g("select ifnull(sum(amount),0) from refund"
                         " where ord_id=? and status='done'", (o["id"],))
            pay_open = g("select ifnull(sum(amount),0) from payable"
                         " where ord_id=? and status='open'", (o["id"],))
            pay_done = g("select ifnull(sum(amount),0) from payable"
                         " where ord_id=? and status='paid'", (o["id"],))
            adv = g("select ifnull(sum(a.amount),0) from advance a"
                    " join applicant ap on ap.id=a.applicant_id where ap.ord_id=?", (o["id"],))
            sale = one(c, "select name from user where id=?", (o["agent_user"],)) or {}
            buyer = one(c, "select name from user where id=?", (o["buyer_user"],)) or {}
            # 办签进度：UOM 侧列表原来没有，唐美芳 2026-08-31 要求与 CSP 字段拉齐
            apl = [{"id": a["id"], "name": mask_name(a["name_cn"]),
                    "progress": a["progress"], "progress_text": PNAME[a["progress"]],
                    "state": a["state"], "result": RESULT.get(a["visa_result"], "")}
                   for a in rows(c, "select * from applicant where ord_id=? order by id", (o["id"],))]
            pst = money_state((o["amount"] or 0) - refunded, recv + waitc)
            out.append({"no": o["no"], "channel": o["channel"], "status": o["status"],
                        "status_text": ORD_STATUS[o["status"]], "gate": o["gate"],
                        # 支付状态＝钱到没到，与「财务确认到账」是两件事
                        "pay_state": pst, "pay_state_text": PAY_ST_TEXT[pst],
                        "work_status": work_status(c, o),
                        "sale_name": sale.get("name") or buyer.get("name") or "—",
                        "contract_status": "未签约", "applicants": apl,
                        "pkg_code": None,
                        "amount": o["amount"], "settle_amount": o["settle_amount"],
                        "recv": recv, "recv_wait": waitc,
                        # 欠款＝客人还欠我们多少。已付款但财务还没核对到账的那笔（recv_wait）
                        # 也要算进已收——钱客人确实付了，确不确认是我们内部的事。
                        # 原来只减 fin_confirmed=1 的部分，销售在列表上看到「已付款」的单
                        # 却挂着全额欠款，会以为客人没给钱（唐美芳 2026-09-02）。
                        "owe": max(0.0, o["amount"] - recv - waitc - refunded),
                        "refunded": refunded,
                        "payable_open": pay_open, "payable_paid": pay_done,
                        "advance": adv,
                        "gross": o["amount"] - o["settle_amount"],
                        "pax": o["pax"], "product": o["product_name"] or (sp["name"] if sp else ""),
                        "pkg": pk["name"] if pk else "",
                        "supplier": sup.get("short") or "",
                        # 运营端订单列表不再对客户名字与机构名脱敏
                        # （唐美芳 2026-09-08：「客户信息，客户名字不用脱敏」）——
                        # 这张表只有运营 / 主管 / 财务能进，本来就是内部作业页，
                        # 名字脱敏成「周**」的结果是电话核单时对不上人。
                        # 手机号仍脱敏：它是最容易被整段导出外流的字段，
                        # 需要完整号码时到订单详情看。
                        "org": org.get("name") or "直客",
                        "contact": o["contact_name"],
                        "phone": mask_phone(o["contact_phone"]),
                        "depart_date": o["depart_date"],
                        # 2026-09-08：订单列表按众信酒店订单的筛选结构重做，
                        # 目的地 / 送签地 / 签证类型 / 产品编码这几项要能筛，随列表一起下发。
                        # 酒店那边的「目的城市」在签证里拆成「目的地国家 + 送签地」——
                        # 领区决定材料与预约规则，只给国家筛不出运营真正要的那一批单。
                        # 开票抬头：批量开票要按抬头分组，不同抬头不能开在一张票上
                        "invoice_entity": o["invoice_entity"] or "",
                        "country": p0.get("country") or "",
                        "submit_city": p0.get("submit_city") or "",
                        "visa_cat": p0.get("visa_cat") or "",
                        "code": (sp["code"] if sp else None) or p0.get("code") or "",
                        # 列表上点产品名要跳产品详情（唐美芳 2026-09-08），三端都要用
                        "sup_product_id": o["sup_product_id"],
                        # 办签人姓名（已脱敏）拼一串，供「办签人」关键词筛选用
                        "ap_names": " ".join(a["name"] for a in apl),
                        "created_at": o["created_at"],
                        "created_by_name": o["created_by_name"],
                        "updated_by_name": o["updated_by_name"],
                        "updated_at": o["updated_at"]})
        return {"list": out, "countries": sorted({x["country"] for x in out if x["country"]}),
                "cities": sorted({x["submit_city"] for x in out if x["submit_city"]}),
                "visa_cats": VISA_CATS}

    if path == "/order/detail":
        # 订单详情。结构对齐众信「销售管理 › 订单」详情页：
        # 头部产品条 + 订单信息 / 联系人信息 / 办签人信息 / 交易信息 四块 + 操作日志。
        # 三端共用一个接口，靠 view 字段区分可见范围（唐美芳 2026-08-31：
        # 「ubk、uom、csp 都需要有」「字段尽量一致，差异在操作权限」）。
        need("ops", "lead", "fin", "uom", "csp", "ubk", "customer")
        role = user["role"]
        o = one(c, "select * from ord where no=?", (arg("no"),))
        if not o:
            raise Err("订单不存在", 404)
        sp = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
        pk = one(c, "select * from pkg where id=?", (o["pkg_id"],))
        pr = one(c, "select * from product where id=?", (o["product_id"],))
        org = one(c, "select * from org where id=?", (o["org_id"],)) or {}
        supo = one(c, "select * from org where id=?", (sp["org_id"] if sp else 0,)) or {}
        sale = one(c, "select * from user where id=?", (o["agent_user"],)) or {}
        buyer = one(c, "select * from user where id=?", (o["buyer_user"],)) or {}

        # 可见性：客户只看自己的；CSP 看本店；UBK 只看派到自己的单
        if role == "customer" and o["buyer_user"] != user["id"]:
            raise Err("无权查看该订单", 403)
        if role == "csp" and o["agent_user"] != user["id"] and o["org_id"] != user["org_id"]:
            raise Err("无权查看该订单", 403)
        if role == "ubk":
            if not o["gate"]:
                raise Err("该订单财务尚未确认收款到账，供应商侧不可见", 403)
            if sp and sp["org_id"] != user["org_id"]:
                raise Err("无权查看该订单", 403)

        full = role in ("ops", "lead", "fin", "uom")     # 平台侧看全量金额
        sup_view = role == "ubk"                          # 供应商只看结算侧

        g = lambda q, a: c.execute(q, a).fetchone()[0]
        recv = g("select ifnull(sum(amount),0) from pay where ord_id=? and kind='in'"
                 " and fin_confirmed=1", (o["id"],))
        recv_wait = g("select ifnull(sum(amount),0) from pay where ord_id=? and kind='in'"
                      " and fin_confirmed=0", (o["id"],))
        refunded = g("select ifnull(sum(amount),0) from refund where ord_id=? and status='done'",
                     (o["id"],))
        pay_open = g("select ifnull(sum(amount),0) from payable where ord_id=? and status='open'",
                     (o["id"],))
        pay_done = g("select ifnull(sum(amount),0) from payable where ord_id=? and status='paid'",
                     (o["id"],))
        _pst_d = money_state((o["amount"] or 0) - refunded, recv + recv_wait)
        _rst_d = money_state(pay_open + pay_done, pay_done) if (pay_open + pay_done) else "unpaid"
        adv = g("select ifnull(sum(a.amount),0) from advance a join applicant ap"
                " on ap.id=a.applicant_id where ap.ord_id=?", (o["id"],))

        aps = []
        for a in rows(c, "select * from applicant where ord_id=? order by id", (o["id"],)):
            w = one(c, "select * from wo where applicant_id=? order by id desc limit 1", (a["id"],))
            owner = one(c, "select name from user where id=?", (w["owner_user"],)) if w else None
            aps.append({"id": a["id"], "name": a["name_cn"], "name_en": a["name_en"],
                        "sex": a["sex"], "birth": a["birth"],
                        "id_type": a["id_type"],
                        # 证件号供应商也要看到——DS-160 等官方表都要一字不差地填护照号
                        "id_no": a["id_no"],
                        "id_expiry": a["id_expiry"],
                        "id_place": a["id_place"], "nation": a["nation"],
                        # 手机号按「是不是供应商」脱敏，而不是按 full。
                        # full 原本管的是金额可见范围，拿来管手机号会把门店销售也挡在外面——
                        # 销售正是要打这个号联系客人的（2026-09-01 在订单详情里发现）。
                        "phone": a["phone"],
                        "crowd": CROWD.get(a["crowd"], a["crowd"]),
                        "progress": a["progress"], "progress_text": PNAME[a["progress"]],
                        "state": a["state"],
                        "result": RESULT.get(a["visa_result"], ""),
                        "consulate_region": a["consulate_region"],
                        "appt_at": a["appt_at"], "appt_place": a["appt_place"],
                        "owner": (owner or {}).get("name"),
                        "sla_due": w["sla_due"] if w else None,
                        "wo_status": w["status"] if w else None,
                        # 「录入客人签证资料」的状态与缺项，直接在订单详情里改
                        # （唐美芳 2026-09-01：「客人签证资料的调整应该放到订单详情里，
                        # 这样操作就不散着了，还得每个按钮一个页面」）
                        "crowd_k": a["crowd"],
                        "info_done": a["info_done"],
                        "info_at": a["info_at"] or "",
                        "missing": [lb for k, lb in INFO_REQUIRED if not (a[k] or "")],
                        # 官方申请表（DS-160 那 68 格）的进度也带出来。
                        # 「录入资料」只有 11 格基础信息，销售在订单详情里看不出
                        # 正式表单还差多少，也没有代填入口
                        # （唐美芳 2026-09-02：「点录入资料，为什么资料特别少，
                        #  销售如何在 csp 帮客人代填呢」）。
                        "form": ap_form_brief(c, a)})

        pays = [{"no": p["no"], "cate": p["cate"], "method": p["method"], "item": p["item"],
                 "amount": p["amount"], "arrive_amount": p["arrive_amount"],
                 "audit_status": p["audit_status"], "confirmed": p["fin_confirmed"],
                 "trade_no": p["trade_no"], "created_at": p["created_at"]}
                for p in rows(c, "select * from pay where ord_id=? and kind='in' order by id",
                              (o["id"],))] if not sup_view else []

        refs = [{"no": r["no"], "amount": r["amount"], "status": r["status"],
                 "status_text": {"applying": "待主管审批", "l1": "主管已批待出账",
                                 "done": "已出账", "reject": "已驳回"}.get(r["status"], r["status"]),
                 "reason": r["reason"], "liability_text": LIABILITY.get(r["liability"], ""),
                 "l1_at": r["l1_at"], "fin_at": r["fin_at"], "created_at": r["created_at"]}
                for r in rows(c, "select * from refund where ord_id=? order by id", (o["id"],))]

        logs = [{"actor": e["actor_name"], "action": e["action"], "detail": e["detail"],
                 "scope": e["scope"], "at": e["created_at"]}
                for e in rows(c, "select * from event where ord_id=? order by id desc", (o["id"],))]

        # 当前角色可执行的操作。送签处理只有 UOM 有，销售只能看——唐美芳 2026-08-31。
        acts = []
        # 收款：待付款时销售在详情页就能收，不用退回列表
        # （唐美芳 2026-09-01：「收款操作你得保留下，不然现在订单到待支付了，
        # 验收测试就进行不下去了」）。2026-09-02 起后端也不再拦，资料没齐只提示。
        if role in ("csp", "customer") and o["status"] == "created":
            acts.append({"k": "pay", "t": "收款 ¥%s" % ("{:,.0f}".format(o["amount"])), "p": 1})
        # 取消只在「未支付」时给（2026-09-08）：已收到钱的单一律走退款，
        # 否则钱已进账却用取消结束订单，退款审批与财务出账那条线就被绕过去了。
        paid_cnt = c.execute("select count(*) from pay where ord_id=? and kind='in'",
                             (o["id"],)).fetchone()[0]
        if role in ("csp", "customer") and o["status"] == "created" and not paid_cnt:
            acts.append({"k": "cancel", "t": "取消订单", "p": 0})
        if role in ("csp", "customer") and (o["status"] == "paid" or paid_cnt):
            acts.append({"k": "refund", "t": "申请退款", "p": 0})
        if role in ("uom", "ops") and o["gate"]:
            acts.append({"k": "progress", "t": "送签处理", "p": 1})
        # 运营 / 主管同理：已收款的单不给「取消」，只能走退款
        if role in ("lead", "ops") and o["status"] == "created" and not paid_cnt:
            acts.append({"k": "cancel", "t": "取消订单", "p": 0})
        acts.append({"k": "log", "t": "订单日志", "p": 0})

        d = {"view": role, "full": full, "sup_view": sup_view,
             "ord": {"no": o["no"], "created_at": o["created_at"],
                     "status": o["status"], "status_text": ORD_STATUS[o["status"]],
                     "work_status": work_status(c, o),
                     "gate": o["gate"],
                     # 「资金放行」是内部黑话，普通人看不懂（唐美芳 2026-09-02）。
                     # 但它也不等于「支付状态」——订单状态里已经有「已付款」了，
                     # 这一步是财务核对水单、确认钱真的到账，到账后才派工单。
                     # 所以按它的实际动作改叫「财务确认收款」。
                     "gate_text": "已确认到账" if o["gate"] else "待财务确认",
                     # 支付状态是给所有人看的（钱到没到）；上面那个 gate 是财务内部的
                     # 核对环节，只在财务视角与交易信息里出现，不再当订单状态摆在列表上。
                     # UBK 是外部供应商，他关心的是「平台把结算款付给我没有」，
                     # 所以同一张单他看到的是收款状态，口径与金额都另算一套。
                     "pay_state": _pst_d, "pay_state_text": PAY_ST_TEXT[_pst_d],
                     "recv_state": _rst_d, "recv_state_text": RECV_ST_TEXT[_rst_d],
                     "channel": o["channel"],
                     "channel_text": {"C": "直客 C 端", "CSP": "门店 CSP",
                                      "B": "同业 B 端"}.get(o["channel"], o["channel"]),
                     "biz_source": {"C": "零售/散客", "CSP": "门店零售",
                                    "B": "同业分销"}.get(o["channel"], ""),
                     "client": {"C": "客户小程序", "CSP": "门店 PC 端",
                                "B": "同业 PC 端"}.get(o["channel"], ""),
                     "cust_type": "同业客户" if o["channel"] == "B" else "个人客户",
                     "cust_name": org.get("name") or "直客",
                     "sale_name": sale.get("name") or buyer.get("name") or "—",
                     "sale_org": org.get("name") or "直客",
                     "buyer_name": buyer.get("name") or "—",
                     "pax": o["pax"], "depart_date": o["depart_date"],
                     "contract_status": "未签约",
                     # 客人签证资料的录入状态与截止时间：付款前必须录齐
                     "info_state": info_state(o)[0], "info_state_text": info_state(o)[1],
                     "info_left": info_left_text(o), "info_deadline": o["info_deadline"] or "",
                     "info_done_at": o["info_done_at"] or "", "info_hours": INFO_HOURS,
                     "created_by_name": o["created_by_name"],
                     "updated_by_name": o["updated_by_name"], "updated_at": o["updated_at"],
                     "settle_entity": o["settle_entity"], "invoice_entity": o["invoice_entity"],
                     "third_no": o["no"].replace("VS-", "TP")},
             "product": {"name": sp["name"] if sp else "", "code": pk["sup_code"] if pk else "",
                         "country": pr["country"] if pr else "",
                         "visa_type": pr["visa_type"] if pr else "",
                         "entries": pr["entries"] if pr else "",
                         "stay_days": pr["stay_days"] if pr else 0,
                         "stay_text": stay_text(pr) if pr else "",
                         # 有效期：详情页顶部「有效期与停留」一格要用（2026-09-08）
                         "valid": valid_text(pr) if pr else "",
                         "pkg": pk["name"] if pk else "",
                         "lead_days": pk["lead_days"] if pk else 0,
                         "submit_city": pr["submit_city"] if pr else "",
                         "need_interview": pr["need_interview"] if pr else 0,
                         "need_fingerprint": pr["need_fingerprint"] if pr else 0,
                         "supplier": supo.get("name") or "", "supplier_short": supo.get("short") or "",
                         "book_notice": pk["book_notice"] if pk else ""},
             # ubk 与 csp 一样看到完整联系人：一个要收料办签、一个要直接服务客户，
             # 两边都得能打通电话（唐美芳 2026-09-07 确认放开供应商侧）
             "contact": {"name": o["contact_name"] if full or role in ("csp", "ubk")
                         else mask_name(o["contact_name"] or ""),
                         "phone": o["contact_phone"] if full or role in ("csp", "ubk")
                         else mask_phone(o["contact_phone"] or ""),
                         "email": o["contact_email"] if full or role in ("csp", "ubk") else ""},
             # 收货人信息：签证办完要把护照原件寄回给客户，这是 PRD 4.8.2 / 4.13.3 的必列项
             "receiver": (lambda ad: {
                 "id": ad["id"] if ad else 0,
                 "name": ad["contact"] if ad else None,
                 # 签证办完要把护照原件寄回客户，寄件人得看得到收件电话
                 "phone": ad["phone"] if ad else None,
                 # region / detail 分开给：详情页要能就地改这条地址
                 "region": ad["region"] if ad else "",
                 "detail": ad["detail"] if ad else "",
                 "addr": ((ad["region"] or "") + (ad["detail"] or "")) if ad else None
             })(one(c, "select * from addr where id=?", (o["recv_addr_id"],))),
             "applicants": aps, "pays": pays, "refunds": refs, "logs": logs, "actions": acts,
             # 人群下拉与必填项清单：详情页里就地编辑客人签证资料要用
             "crowds": [{"v": k, "t": v} for k, v in CROWD.items()],
             "info_required": [{"k": k, "t": lb} for k, lb in INFO_REQUIRED]}

        # 交易明细：销售侧 / 结算侧两栏，对齐众信「交易明细」。
        # C 端客户只看自己付了多少，看不到结算价与毛利（沿用 2026-07 定的口径：
        # 客户看到的是渠道零售价，看不到结算价与供应商成本结构）。
        d["trade"] = {}
        if role != "customer":
            d["trade"]["settle"] = {"settle_amount": o["settle_amount"],
                                    "payable_open": pay_open, "payable_paid": pay_done,
                                    "advance": adv}
        if not sup_view:
            d["trade"]["sale"] = {"amount": o["amount"], "recv": recv, "recv_wait": recv_wait,
                                  # 欠款＝客人还欠我们多少。已付款但财务还没核对到账的那笔（recv_wait）
                        # 也要算进已收——钱客人确实付了，确不确认是我们内部的事。
                        # 原来只减 fin_confirmed=1 的部分，销售在列表上看到「已付款」的单
                        # 却挂着全额欠款，会以为客人没给钱（唐美芳 2026-09-02）。
                        "owe": max(0.0, o["amount"] - recv - recv_wait - refunded),
                                  "refunded": refunded, "invoiced": 0.0,
                                  "unit": round(o["amount"] / max(o["pax"], 1), 2)}
            if role != "customer":
                d["trade"]["gross"] = o["amount"] - o["settle_amount"]
        return d

    if path == "/ops/countries":
        # 国家展示与默认流程配置（唐美芳 2026-09-01：「都统一放在运营配置里吧」）。
        # 原来国家频道页大图、目的地卡片图、国旗、平台默认办理流程都写死在 v-cust.js，
        # 新开一个国家就得改代码发版。
        need("ops", "lead")
        out = []
        for r in rows(c, "select * from country_cfg where country!='' order by country"):
            d = dict(r)
            d["flow"] = jl(r["flow"], []) if r["flow"] else []
            d["products"] = c.execute(
                "select count(*) from product p join sup_product sp on sp.product_id=p.id"
                " where p.country=? and sp.to_c=1 and sp.review_c='approved'",
                (r["country"],)).fetchone()[0]
            out.append(d)
        dft = one(c, "select * from country_cfg where country=''") or {}
        # 平台在售国家里还没建配置的，列出来让运营一眼看到缺口
        have = [x["country"] for x in out]
        miss = [r[0] for r in c.execute("select distinct country from product where country!=''")
                if r[0] not in have]
        return {"list": out, "missing": miss,
                "default_flow": jl(dft["flow"], []) if dft and dft["flow"] else [],
                "flow_max": 8}

    if path == "/ops/country/save":
        need("ops", "lead")
        f = body
        cn = (f.get("country") or "").strip()
        # country 为空串这一行是平台默认配置，只允许改流程，不允许当成一个国家来建
        is_default = bool(f.get("is_default"))
        if not is_default and not cn:
            raise Err("请填写国家名称")
        flow = f.get("flow")
        if flow is not None:
            fl = [{"t": (x.get("t") or "")[:20], "d": (x.get("d") or "")[:60]}
                  for x in flow if (x.get("t") or "").strip()][:8]
            # 清空＝回落到上一级默认，存空串而不是 "[]"，否则回落链会断在这里
            flow = json.dumps(fl, ensure_ascii=False) if fl else ""
        for k in ("hero_img", "card_img", "flag_img"):
            v = (f.get(k) or "").strip()
            if v and not v.startswith((PREFIX + "/uploads/", "uploads/", "img/")):
                raise Err("图片请通过上传控件选择，不接受外部链接")
        key = "" if is_default else cn
        old = one(c, "select * from country_cfg where country=?", (key,))
        if is_default:
            if not old:
                raise Err("平台默认配置不存在", 404)
            c.execute("update country_cfg set flow=?,updated_at=? where id=?",
                      (flow if flow is not None else old["flow"], now(), old["id"]))
            log(c, "country_cfg", old["id"], None, user, "修改平台默认办理流程", "")
            return {"ok": True, "id": old["id"]}
        # 只更新请求里带了的字段。前端有几处是部分更新（停用/启用只传 active，
        # 改流程只传 flow），一律按「没传就当空」会把图和副标题一起抹掉——
        # 我自己测试时就先把日本的三张图清空了一次。
        def keep(k, cast=lambda v: (v or "").strip()):
            if k in f:
                return cast(f.get(k))
            return (old[k] if old else "")
        vals = (keep("hero_img"), keep("card_img"), keep("flag_img"),
                keep("intro", lambda v: (v or "").strip()[:120]),
                flow if flow is not None else (old["flow"] if old else ""),
                (1 if f.get("active") else 0) if "active" in f
                else (old["active"] if old else 1))
        if old:
            c.execute("update country_cfg set hero_img=?,card_img=?,flag_img=?,intro=?,"
                      "flow=?,active=?,updated_at=? where id=?", vals + (now(), old["id"]))
            rid = old["id"]
            act = "修改国家展示配置"
        else:
            cur2 = c.execute("insert into country_cfg(country,hero_img,card_img,flag_img,intro,"
                             "flow,active,created_at) values(?,?,?,?,?,?,?,?)",
                             (cn,) + vals + (now(),))
            rid = cur2.lastrowid
            act = "新建国家展示配置"
        log(c, "country_cfg", rid, None, user, act, cn)
        return {"ok": True, "id": rid}

    if path == "/ops/country/del":
        need("ops", "lead")
        r = one(c, "select * from country_cfg where id=?", (arg("id"),))
        if not r:
            raise Err("配置不存在", 404)
        if not r["country"]:
            raise Err("平台默认配置不能删除")
        c.execute("delete from country_cfg where id=?", (r["id"],))
        log(c, "country_cfg", r["id"], None, user, "删除国家展示配置", r["country"])
        return {"ok": True}

    if path == "/ops/home":
        # C 端签证频道首页配置（凯撒 PRD 4.12）。运营维护轮播图 / 热门国家 / 热门产品，
        # C 端读 /pub/home 渲染。在此之前这三块写死在前端，改一次要发一次版。
        need("ops", "lead")
        out = {"banner": [], "country": [], "product": []}
        for r in rows(c, "select * from home_cfg order by kind, grp, sort, id"):
            d = dict(r)
            if r["kind"] == "product" and r["link_val"]:
                sp = one(c, "select * from sup_product where id=?", (int(r["link_val"]),))
                d["product_name"] = sp["name"] if sp else "（产品已删除）"
                d["on_c"] = bool(sp and sp["to_c"] and sp["review_c"] == "approved") if sp else False
            out.setdefault(r["kind"], []).append(d)
        # 可选项：C 端在售的国家与产品，供配置时下拉选
        out["opt_country"] = [r[0] for r in c.execute(
            "select distinct p.country from product p join sup_product sp on sp.product_id=p.id"
            " where sp.to_c=1 and sp.review_c='approved' order by 1")]
        out["opt_product"] = [{"id": r["id"], "name": r["name"]} for r in rows(
            c, "select id,name from sup_product where to_c=1 and review_c='approved' order by id")]
        out["groups"] = ["热门", "亚洲", "欧洲", "美洲", "澳新非"]
        return out

    if path == "/ops/home/save":
        need("ops", "lead")
        f = body
        vals = (f.get("kind"), f.get("title"), f.get("subtitle"), f.get("img"),
                f.get("link_kind") or "none", f.get("link_val"), f.get("grp"),
                int(f.get("sort") or 0), 1 if f.get("active") in (1, "1", True, "true") else 0)
        if f.get("id"):
            c.execute("update home_cfg set kind=?,title=?,subtitle=?,img=?,link_kind=?,link_val=?,"
                      "grp=?,sort=?,active=?,updated_by_name=?,updated_at=? where id=?",
                      vals + (user["name"], now(), int(f["id"])))
            rid = int(f["id"])
        else:
            cur = c.execute("insert into home_cfg(kind,title,subtitle,img,link_kind,link_val,grp,"
                            "sort,active,created_by_name,created_at,updated_by_name,updated_at)"
                            " values(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                            vals + (user["name"], now(), user["name"], now()))
            rid = cur.lastrowid
        log(c, "home_cfg", rid, None, user, "维护首页配置",
            "%s · %s" % (f.get("kind"), f.get("title") or ""))
        return {"ok": True, "id": rid}

    if path == "/ops/home/del":
        need("ops", "lead")
        r = one(c, "select * from home_cfg where id=?", (arg("id"),))
        if not r:
            raise Err("配置不存在")
        c.execute("delete from home_cfg where id=?", (r["id"],))
        log(c, "home_cfg", r["id"], None, user, "删除首页配置", r["title"] or "")
        return {"ok": True}

    if path == "/ops/home/sort":
        # 上移 / 下移：同 kind 同 grp 内跟相邻一条交换 sort
        need("ops", "lead")
        r = one(c, "select * from home_cfg where id=?", (arg("id"),))
        if not r:
            raise Err("配置不存在")
        up = arg("dir") == "up"
        sib = one(c, "select * from home_cfg where kind=? and COALESCE(grp,'')=COALESCE(?,'')"
                     " and sort " + ("<" if up else ">") + " ? order by sort " +
                     ("desc" if up else "asc") + " limit 1",
                  (r["kind"], r["grp"], r["sort"]))
        if not sib:
            return {"ok": True, "msg": "已在" + ("最前" if up else "最后")}
        c.execute("update home_cfg set sort=? where id=?", (sib["sort"], r["id"]))
        c.execute("update home_cfg set sort=? where id=?", (r["sort"], sib["id"]))
        return {"ok": True}

    if path == "/pub/home":
        # C 端首页读这个。无需登录态之外的权限——它就是频道首页内容。
        need("customer", "csp", "ops", "lead", "uom", "fin", "ubk")
        out = {"banner": [], "country": [], "product": []}
        for r in rows(c, "select * from home_cfg where active=1 order by kind, grp, sort, id"):
            d = {"title": r["title"], "subtitle": r["subtitle"], "img": r["img"],
                 "link_kind": r["link_kind"], "link_val": r["link_val"], "grp": r["grp"]}
            if r["kind"] == "product" and r["link_val"]:
                sp = one(c, "select * from sup_product where id=?", (int(r["link_val"]),))
                if not sp or not sp["to_c"] or sp["review_c"] != "approved":
                    continue          # 下架或未过审的产品不往 C 端推
                d["sup_product_id"] = sp["id"]
                d["title"] = r["title"] or sp["name"]
            out[r["kind"]].append(d)
        # 分组顺序按业务口径给死（热门在最前），不能让前端按字母序排成「亚洲/澳新非/热门」
        out["groups"] = ["热门", "亚洲", "欧洲", "美洲", "澳新非"]
        # 国家展示配置：大图 / 卡片图 / 国旗，都由运营在 UOM 维护
        # （唐美芳 2026-09-01：「都统一放在运营配置里吧」）。
        # 没配的国家前端仍回落到内置图，不会开天窗。
        # 平台默认办理流程：C 端首页那一段展示它，运营在 UOM 里改完前端跟着变
        dft0 = one(c, "select flow from country_cfg where country=''")
        out["default_flow"] = jl(dft0["flow"], []) if dft0 and dft0["flow"] else []
        out["countries"] = {r["country"]: {
            "hero": r["hero_img"] or "", "card": r["card_img"] or "",
            "flag": r["flag_img"] or "", "intro": r["intro"] or ""}
            for r in rows(c, "select * from country_cfg where country!='' and active=1")}
        return out

    if path == "/ops/stats":
        need("ops", "lead", "fin")
        g = lambda s, a=(): c.execute(s, a).fetchone()[0]
        return {
            "orders": g("select count(*) from ord"),
            "gmv": g("select ifnull(sum(amount),0) from ord where gate=1"),
            "applicants": g("select count(*) from applicant"),
            "wo_open": g("select count(*) from wo where status!='done'"),
            "wo_overdue": g("select count(*) from wo where status='open' and sla_due<?", (now(),)),
            "pending_pay": g("select count(*) from pay where kind='in' and fin_confirmed=0"),
            "supp_open": g("select count(*) from supp where status='open'"),
            "refund_open": g("select count(*) from refund where status in ('applying','l1')"),
            "payable_open": g("select ifnull(sum(amount),0) from payable where status='open'"),
            "advance": g("select ifnull(sum(amount),0) from advance"),
            "by_progress": {PNAME[p]: g(
                "select count(*) from applicant where progress=?", (p,)) for p in PORDER},
        }

    # ========== 客户档案 ==========
    # 系统没有独立的客户表：客户是「同一个联系人手机号」在历次订单里沉淀出来的档案。
    # 以手机号为主键聚合订单与办签人，办签人再按证件号去重，
    # 这样客户第二次办签时护照信息与已交材料能直接回显复用，不必重复维护。
    def crm_scope():
        if user["role"] == "csp":
            return (" where org_id=? or agent_user=?", (user["org_id"] or 0, user["id"]))
        return ("", ())

    def crm_group():
        w, a = crm_scope()
        book = {}
        for o in rows(c, "select * from ord" + w + " order by id", a):
            key = (o["contact_phone"] or "").strip() or ("U%d" % (o["buyer_user"] or 0))
            g = book.setdefault(key, {"key": key, "name": o["contact_name"], "phone": o["contact_phone"],
                                      "email": o["contact_email"], "channels": [], "orgs": [],
                                      "orders": [], "amount": 0.0, "pax": 0,
                                      "first_at": o["created_at"], "last_at": o["created_at"]})
            if o["contact_name"]:
                g["name"] = o["contact_name"]
            if o["contact_email"] and not g["email"]:
                g["email"] = o["contact_email"]
            if o["channel"] not in g["channels"]:
                g["channels"].append(o["channel"])
            org = one(c, "select name from org where id=?", (o["org_id"],))
            if org and org["name"] not in g["orgs"]:
                g["orgs"].append(org["name"])
            g["orders"].append(o)
            g["amount"] += o["amount"] or 0
            g["pax"] += o["pax"] or 0
            g["last_at"] = max(g["last_at"] or "", o["created_at"] or "")
            g["first_at"] = min(g["first_at"] or "", o["created_at"] or "")
        return book

    if path == "/crm/customers":
        need("ops", "uom", "lead", "csp")
        out = []
        for g in crm_group().values():
            ids = set()
            done = 0
            for o in g["orders"]:
                for a in rows(c, "select id_no,visa_result from applicant where ord_id=?", (o["id"],)):
                    ids.add(a["id_no"] or "")
                    if a["visa_result"] == "pass":
                        done += 1
            last = g["orders"][-1]
            out.append({"key": g["key"], "name": g["name"], "phone": g["phone"],
                        "email": g["email"], "channels": g["channels"],
                        "org": "、".join(g["orgs"]) or "直客",
                        "orders": len(g["orders"]), "amount": g["amount"], "pax": g["pax"],
                        "persons": len([x for x in ids if x]), "approved": done,
                        "first_at": g["first_at"], "last_at": g["last_at"],
                        "last_no": last["no"], "last_status": ORD_STATUS[last["status"]],
                        "last_status_k": last["status"]})
        out.sort(key=lambda x: x["last_at"] or "", reverse=True)
        return {"list": out}

    if path == "/crm/customer":
        need("ops", "uom", "lead", "csp")
        key = arg("key")
        g = crm_group().get(key)
        if not g:
            raise Err("客户档案不存在", 404)
        orders, persons = [], {}
        for o in g["orders"]:
            sp = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
            pk = one(c, "select * from pkg where id=?", (o["pkg_id"],))
            aps = rows(c, "select * from applicant where ord_id=? order by id", (o["id"],))
            orders.append({"no": o["no"], "ord_id": o["id"], "channel": o["channel"],
                           "buyer_user": o["buyer_user"],
                           "product": o["product_name"] or (sp["name"] if sp else ""), "pkg": pk["name"] if pk else "",
                           "pax": o["pax"], "amount": o["amount"], "status": o["status"],
                           "status_text": ORD_STATUS[o["status"]], "depart_date": o["depart_date"],
                           "created_at": o["created_at"],
                           "applicants": [{"id": a["id"], "name": a["name_cn"],
                                           "progress_text": PNAME[a["progress"]],
                                           "result": RESULT.get(a["visa_result"], "")} for a in aps]})
            for a in aps:
                pk2 = (a["id_no"] or "").strip() or ("A%d" % a["id"])
                p = persons.setdefault(pk2, {"key": pk2, "times": 0, "records": []})
                p["times"] += 1
                # 取最新一次的证件信息作为档案主值，历史记录仍逐条留痕
                p.update({"name_cn": a["name_cn"], "name_en": a["name_en"], "sex": a["sex"],
                          "birth": a["birth"], "id_type": a["id_type"], "id_no": a["id_no"],
                          "id_expiry": a["id_expiry"], "id_place": a["id_place"],
                          "nation": a["nation"], "phone": a["phone"],
                          "crowd": CROWD.get(a["crowd"], a["crowd"]),
                          "crowd_k": a["crowd"]})
                mats = rows(c, "select mat_name,attr,status,file_name,file_url,round,updated_at"
                               " from mat where applicant_id=? order by id", (a["id"],))
                for m in mats:
                    m["attr_text"] = ATTR.get(m["attr"], m["attr"])
                p["records"].append({
                    "applicant_id": a["id"], "ord_no": o["no"], "ord_at": o["created_at"],
                    "product": o["product_name"] or (sp["name"] if sp else ""),
                    "progress_text": PNAME[a["progress"]],
                    "result": RESULT.get(a["visa_result"], ""), "visa_no": a["visa_no"],
                    "visa_valid_to": a["visa_valid_to"], "visa_stay": a["visa_stay"],
                    "reject_reason": a["reject_reason"],
                    "mats": mats,
                    "mat_done": len([m for m in mats if m["status"] == "pass"]),
                    "mat_total": len(mats)})
        for p in persons.values():
            p["records"].reverse()
        orders.reverse()
        return {"profile": {"key": g["key"], "name": g["name"], "phone": g["phone"],
                            "email": g["email"], "channels": g["channels"],
                            "org": "、".join(g["orgs"]) or "直客",
                            "orders": len(g["orders"]), "amount": g["amount"],
                            "first_at": g["first_at"], "last_at": g["last_at"]},
                "orders": orders,
                "persons": sorted(persons.values(), key=lambda x: -x["times"]),
                "addrs": crm_addrs(c, g)}

    if path == "/crm/addr/save":
        # 运营 / 客服替客户维护收货地址（PRD 4.11）。改地址前端会先提示影响哪几张在办单。
        need("ops", "lead", "uom", "csp")
        f = body
        if f.get("id"):
            ad = one(c, "select * from addr where id=?", (int(f["id"]),))
            if not ad or ad["owner_kind"] != "user":
                raise Err("地址不存在")
            c.execute("update addr set contact=?,phone=?,region=?,detail=?,"
                      "updated_by=?,updated_by_name=?,updated_at=? where id=?",
                      (f.get("contact"), f.get("phone"), f.get("region"), f.get("detail"),
                       user["id"], user["name"], now(), ad["id"]))
            rid = ad["id"]
            log(c, "addr", rid, None, user, "修改客户收货地址",
                "%s %s%s" % (f.get("contact") or "", f.get("region") or "", f.get("detail") or ""))
        else:
            uid = int(arg("owner_id"))
            cur = c.execute("insert into addr(owner_kind,owner_id,region,detail,contact,phone,"
                            "is_default,created_by,created_by_name,created_at,"
                            "updated_by,updated_by_name,updated_at)"
                            " values('user',?,?,?,?,?,0,?,?,?,?,?,?)",
                            (uid, f.get("region"), f.get("detail"), f.get("contact"),
                             f.get("phone"), user["id"], user["name"], now(),
                             user["id"], user["name"], now()))
            rid = cur.lastrowid
            log(c, "addr", rid, None, user, "新增客户收货地址", f.get("contact") or "")
        if f.get("is_default"):
            ad2 = one(c, "select * from addr where id=?", (rid,))
            c.execute("update addr set is_default=0 where owner_kind='user' and owner_id=?",
                      (ad2["owner_id"],))
            c.execute("update addr set is_default=1 where id=?", (rid,))
        return {"ok": True, "id": rid}

    if path == "/crm/addr/del":
        need("ops", "lead", "uom", "csp")
        ad = one(c, "select * from addr where id=?", (arg("id"),))
        if not ad:
            raise Err("地址不存在")
        n = c.execute("select count(*) from ord where recv_addr_id=? and status in"
                      " ('created','paid')", (ad["id"],)).fetchone()[0]
        if n:
            raise Err("该地址还有 %d 张在办订单在用，不能删除；可以先改成新地址" % n)
        c.execute("delete from addr where id=?", (ad["id"],))
        log(c, "addr", ad["id"], None, user, "删除客户收货地址", ad["contact"] or "")
        return {"ok": True}

    if path == "/events":
        need("ops", "lead")
        return {"list": rows(c, "select * from event order by id desc limit 100")}

    if path == "/my/track":
        # 后台三端也读这个接口：订单详情里点某位办签人的「查看」，看到的进度时间轴
        # 与客户端完全一致（唐美芳 2026-09-01：「每个办签人的办签进度不应该和 C 端
        # 一样有详情可以看么，一系列的子流程展示，前后端又不一致了」）。
        # 同一份数据、同一份文案，两端不会各说各话。
        need("customer", "csp", "uom", "lead", "fin", "ops", "ubk")
        aid = int(arg("applicant_id"))
        a = one(c, "select * from applicant where id=?", (aid,))
        if not a:
            raise Err("办签人不存在", 404)
        o = one(c, "select * from ord where id=?", (a["ord_id"],))
        if user["role"] in ("customer", "csp") \
                and user["id"] not in (o["buyer_user"], o["agent_user"]) \
                and o["org_id"] != user["org_id"]:
            raise Err("无权查看该订单", 403)
        if user["role"] == "ubk":
            sp0 = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
            if not sp0 or sp0["org_id"] != user["org_id"]:
                raise Err("无权查看该订单", 403)
        # 同一张订单的全部办签人，供页面顶部横向切换——一张单多个人，
        # 各人进度经常不同步（唐美芳给的 H5 设计图《签证状态办理跟踪》顶部就是这排人名）
        sibs = [{"id": x["id"], "name": x["name_cn"], "state": x["state"],
                 "progress_text": PNAME[x["progress"]]}
                for x in rows(c, "select * from applicant where ord_id=? order by id", (o["id"],))]
        # 事件走跟分享页同一份白名单翻译，两处口径必须一致：
        # 同一个人从小程序看和从分享链接看，进度不能是两套说法
        return dict(pub_track(c, a, o), name=a["name_cn"], ord_no=o["no"], siblings=sibs)

    if path == "/my/order/detail":
        # C 端订单详情。唐美芳 2026-08-31：「C端小程序页面补填资料的入口及办理进度
        # 从哪里查看，怎么没看到操作页面啊，这块是不完善的」——原来点订单卡片没反应，
        # 补料与进度只能从卡片里那两个小链接进，待支付订单干脆没有入口。
        # 字段按她给的 H5 设计图《订单详情》排：邮寄地址 / 产品 / 办签人 / 联系人 / 收货 / 发票。
        need("customer", "csp")
        o = one(c, "select * from ord where no=?", (arg("no"),))
        if not o:
            raise Err("订单不存在", 404)
        if user["role"] == "customer" and user["id"] != o["buyer_user"]:
            raise Err("无权查看该订单", 403)
        info_sweep(c, [o["id"]])
        o = one(c, "select * from ord where id=?", (o["id"],))
        sp = one(c, "select * from sup_product where id=?", (o["sup_product_id"],))
        pr = one(c, "select * from product where id=?", (o["product_id"],))
        pk = one(c, "select * from pkg where id=?", (o["pkg_id"],))
        # 资料邮寄地址＝供应商的收料地址，客户要把护照原件寄到这儿
        mail = one(c, "select * from addr where id=?", (sp["addr_id"],)) if sp and sp["addr_id"] else None
        # 收货地址＝办完把护照寄回客户的地址
        recv_addr = one(c, "select * from addr where id=?",
                        (o["recv_addr_id"],)) if o["recv_addr_id"] else None
        aps = []
        for a in rows(c, "select * from applicant where ord_id=? order by id", (o["id"],)):
            n_wait = c.execute("select count(*) from mat where applicant_id=? and status in"
                               " ('wait','rejected')", (a["id"],)).fetchone()[0]
            n_supp = c.execute("select count(*) from supp where applicant_id=? and status='open'",
                               (a["id"],)).fetchone()[0]
            aps.append({"id": a["id"], "name": a["name_cn"],
                        # 不打码：客户看的是自己的证件号，门店看的是自己代下单录的，
                        # 都要能核对填得对不对。打码的是 UOM 那种跨客户的聚合视图。
                        "id_type": a["id_type"] or "护照", "id_no": a["id_no"] or "",
                        "progress": a["progress"], "progress_text": PNAME[a["progress"]],
                        "result": RESULT.get(a["visa_result"], ""), "state": a["state"],
                        "mat_wait": n_wait, "supp_open": n_supp,
                        # 官方申请表进度：有米订单详情要跟 CSP 摆一样的动作
                        # （唐美芳 2026-09-02：「尽量保证 csp 和有米的功能操作一致的哈」）。
                        # C 端也吃这个接口，但客户端不渲染代填按钮，多给一个字段没副作用。
                        "form": ap_form_brief(c, a)})
        recv = c.execute("select ifnull(sum(amount),0) from pay where ord_id=? and kind='in'"
                         " and fin_confirmed=1", (o["id"],)).fetchone()[0]
        # 已付款但财务还没核对到账的那笔：销售端要能看出「钱客人已经给了，
        # 只是财务还没确认」，而不是显示成欠款（唐美芳 2026-09-02）
        recv_wait = c.execute("select ifnull(sum(amount),0) from pay where ord_id=? and kind='in'"
                              " and fin_confirmed=0", (o["id"],)).fetchone()[0]
        refunded = c.execute("select ifnull(sum(amount),0) from refund where ord_id=?"
                             " and status='done'", (o["id"],)).fetchone()[0]
        ist, ist_text = info_state(o)
        return {
            "no": o["no"], "ord_id": o["id"], "status": o["status"],
            "status_text": ORD_STATUS[o["status"]], "work_status": work_status(c, o),
            # 付款前必经的「录入客人签证资料」，前端据此决定底栏主按钮是去录资料还是去付款
            "info_state": ist, "info_state_text": ist_text,
            "info_left": info_left_text(o), "info_deadline": o["info_deadline"] or "",
            "info_hours": INFO_HOURS,
            "created_at": o["created_at"], "amount": o["amount"],
            "recv": recv, "recv_wait": recv_wait, "refunded": refunded, "gate": o["gate"],
            # 这张单到底有没有要寄原件的材料。美签的支持性文件是面签当天本人带着、
            # 没有寄原件这一步（唐美芳 2026-09-03 核对官网后指出，原材料库配错了）；
            # 申根、日本那类交代办社送签的仍然有。所以邮寄地址不是删掉，是按材料方式出现。
            "need_mail": c.execute(
                "select count(*) from mat m join applicant a on a.id=m.applicant_id"
                " where a.ord_id=? and m.provide_way like '%mail%'",
                (o["id"],)).fetchone()[0] > 0,
            # 支付状态与欠款：C 端订单详情也要显示（唐美芳 2026-09-03，五端同步）
            "pay_state": money_state((o["amount"] or 0) - refunded, recv + recv_wait),
            "pay_state_text": PAY_ST_TEXT[
                money_state((o["amount"] or 0) - refunded, recv + recv_wait)],
            "owe": max(0.0, (o["amount"] or 0) - recv - recv_wait - refunded),
            "depart_date": o["depart_date"], "pax": o["pax"],
            "product": o["product_name"] or (sp["name"] if sp else ""), "pkg": pk["name"] if pk else "",
            "country": pr["country"] if pr else "", "visa_type": pr["visa_type"] if pr else "",
            "visa_cat": (pr["visa_cat"] or "") if pr else "",
            "mail_addr": dict(mail) if mail else None,
            "recv_addr": dict(recv_addr) if recv_addr else None,
            "contact": {"name": o["contact_name"], "phone": o["contact_phone"],
                        "email": o["contact_email"]},
            # 系统本期只存开票抬头，没有发票申请流程，前端据此显示为只读
            "invoice": {"entity": o["invoice_entity"] or ""},
            "applicants": aps,
        }

    raise Err("接口不存在：" + path, 404)


def ai_precheck(mat_name, file_name):
    """材料 AI 预审提示（规则模拟，真实环境接 OCR/视觉模型）。"""
    fn = (file_name or "").lower()
    if "照片" in mat_name:
        return "AI 预审：已校验白底、无眼镜、头部占比 58%，尺寸 51×51mm 合格"
    if "护照" in mat_name:
        return "AI 预审：护照有效期至 2031-04，剩余 60 个月，满足离境后 6 个月要求"
    if "DS-160" in mat_name:
        return "AI 预审：已识别条形码与 Application ID，姓名拼写与护照一致"
    if "流水" in mat_name:
        return "AI 预审：近 6 个月进账 12 笔，期末余额 8.6 万，满足建议标准"
    if "在职证明" in mat_name:
        return "AI 预审：已识别公章与负责人签字，准假期限覆盖行程"
    if fn.endswith((".jpg", ".png", ".pdf")):
        return "AI 预审：文件可读，未发现明显缺页"
    return "AI 预审：已接收，待人工复核"


def refund_amount(unit, pkg, a, explain=False):
    """退款规则：按进度与责任判定可退金额。"""
    if a["state"] == "refunded":
        return (0.0, "已退款") if explain else 0.0
    p = PORDER.index(a["progress"])
    visa_fee = pkg["visa_fee"] if pkg else 0
    if a["visa_result"] == "reject":
        # 唐美芳 2026-08-31：「拒签退款保障没有这个服务，拒签也是退的」。
        # 所以不再分套餐档位：拒签一律退服务费，签证费是使领馆已收取的官费，各国均不退。
        # 我司责任导致的拒签（材料错送、漏交、超期）仍全额退，含签证费。
        if a["liability"] == "company":
            amt, why = unit, "我司责任导致拒签：全额退还（含签证费）"
        else:
            amt = max(unit - visa_fee, 0.0)
            why = "拒签退还服务费；签证费 %.0f 元为使领馆收取的官方费用，按各国规定不予退还" % visa_fee
    # 分档按新六步重排（唐美芳 2026-09-02：「在提交至官网前，都可支持退款」）：
    #   P1 待收料 / P2 待审核        → 全额退，什么成本都没发生
    #   P3 待提交至官网              → 材料已审、表已填，扣工本费；这是可退的最后一档
    #   P4 待预约起                  → 已在官网提交、签证费已缴使领馆，只退未发生部分
    #   P6 已完成                    → 出签不退；拒签走上面 visa_result 那条分支
    elif p <= 1:
        amt, why = unit, "尚未提交至官网：全额退还"
    elif p == 2:
        amt, why = unit - 200, "材料已审核、表单已填，扣除工本费 200 元（尚未提交至官网）"
    elif p <= 4:
        amt, why = max(unit - visa_fee - 200, 0), \
            "已提交至官网，签证费 %.0f 元已缴使领馆，仅退未发生部分" % visa_fee
    else:
        amt, why = 0.0, "已出结果，不予退款"
    amt = round(max(amt, 0.0), 2)
    return (amt, why) if explain else amt


def refund_rule(c, aid, liability):
    a = one(c, "select * from applicant where id=?", (aid,))
    o = one(c, "select * from ord where id=?", (a["ord_id"],))
    pk = one(c, "select * from pkg where id=?", (o["pkg_id"],))
    amt, why = refund_amount(o["amount"] / max(o["pax"], 1), pk, dict(a, liability=liability), True)
    return {"amount": amt, "rule": why}


# ============================ HTTP ============================

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass

    def _static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        fp = os.path.abspath(os.path.join(WEB, path.lstrip("/")))
        if not fp.startswith(WEB) or not os.path.isfile(fp):
            return self._send(404, "not found", "text/plain; charset=utf-8")
        ext = os.path.splitext(fp)[1]
        ct = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
              ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
              ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
              ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
              ".pdf": "application/pdf", ".woff2": "font/woff2"}.get(
                  ext.lower(), "application/octet-stream")
        with open(fp, "rb") as f:
            data = f.read()
        self._send(200, data, ct)

    def _upload(self):
        """真实文件上传：multipart/form-data → 落盘到 web/uploads/YYYYMM/，返回可直接访问的 URL。
        演示系统不接对象存储，但落的是真文件，链接点开就能看到，不是占位符。"""
        # 免登录分享链接也要能传材料（唐美芳 2026-08-31：「这个页面后续分享客人之后，
        # 还能直接填写呢」）。客人不是系统用户，没有 X-Token，只能拿分享 token 认人。
        # 放行条件跟 /pub/task 一致：token 存在且没过期。落盘仍受 ALLOW_EXT 白名单
        # 与 MAX_UPLOAD 上限约束，跟登录用户走同一套限制。
        if not TOKENS.get(self.headers.get("X-Token")):
            st = parse_qs(urlparse(self.path).query).get("token", [""])[0]
            ok = False
            if st:
                c0 = conn()
                try:
                    t0 = one(c0, "select * from form_task where share_token=?", (st,))
                    ok = bool(t0) and (t0["share_expire"] or "") >= now()
                finally:
                    c0.close()
            if not ok:
                return self._send(401, {"error": "未登录"})
        ct = self.headers.get("Content-Type") or ""
        mt = re.search(r'boundary="?([^";]+)"?', ct)
        if "multipart/form-data" not in ct or not mt:
            return self._send(400, {"error": "请以 multipart/form-data 提交文件"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0:
            return self._send(400, {"error": "空请求"})
        if n > MAX_UPLOAD:
            return self._send(400, {"error": "文件超过 %d MB 上限" % (MAX_UPLOAD // 1048576)})
        raw = b""
        while len(raw) < n:
            chunk = self.rfile.read(min(65536, n - len(raw)))
            if not chunk:
                break
            raw += chunk
        bd = b"--" + mt.group(1).encode()
        saved = []
        for part in raw.split(bd):
            head, _, data = part.partition(b"\r\n\r\n")
            fn = re.search(rb'filename="([^"]*)"', head)
            if not fn or not fn.group(1):
                continue
            data = data.rstrip(b"\r\n").rstrip(b"--").rstrip(b"\r\n")
            if not data:
                continue
            name = fn.group(1).decode("utf-8", "replace")
            ext = os.path.splitext(name)[1].lower()
            if ext not in ALLOW_EXT:
                return self._send(400, {"error": "不支持的文件类型 %s，只接受 %s"
                                        % (ext or "（无扩展名）", "/".join(sorted(ALLOW_EXT)))})
            sub = datetime.now().strftime("%Y%m")
            d = os.path.join(WEB, "uploads", sub)
            os.makedirs(d, exist_ok=True)
            key = uuid.uuid4().hex[:16] + ext
            with open(os.path.join(d, key), "wb") as f:
                f.write(data)
            saved.append({"name": name, "url": "%s/uploads/%s/%s" % (PREFIX, sub, key),
                          "size": len(data)})
        if not saved:
            return self._send(400, {"error": "没有读到文件"})
        self._send(200, {"files": saved})

    def _qr(self, q):
        """把一段文本渲染成二维码 SVG。

        唐美芳 2026-08-27：「要展示把材料发送给客人的入口，比如扫描二维码之类的，
        携程这块就有」。销售在门店当面接待时，让客人掏手机扫一下比抄链接现实得多。

        SVG 而不是 PNG：矢量放大不糊，客人举着手机离屏幕远一点也扫得上；
        而且不依赖 Pillow，只要 segno 一个纯 Python 包。
        segno 没装时返回 501 而不是 500，前端据此降级成「只给链接 + 一键复制」，
        不会整个入口点不开。
        """
        try:
            import segno
        except ImportError:
            return self._send(501, {"error": "服务器未安装二维码组件（segno），请改用复制链接"})
        d = (q.get("d") or [""])[0]
        if not d:
            return self._send(400, {"error": "缺少内容"})
        if len(d) > 900:
            return self._send(400, {"error": "内容过长，二维码装不下"})
        buf = io.BytesIO()
        segno.make(d, error="m").save(buf, kind="svg", scale=6, border=2,
                                      dark="#111827", light="#ffffff")
        self._send(200, buf.getvalue(), "image/svg+xml; charset=utf-8")

    def _route(self, method):
        u = urlparse(self.path)
        path = unquote(u.path)
        if path.startswith(PREFIX):
            path = path[len(PREFIX):]
        if path == "":
            self.send_response(301)
            self.send_header("Location", PREFIX + "/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if not path.startswith("/api/"):
            return self._static(path)
        if path == "/api/upload":
            return self._upload()
        if path == "/api/qr":
            return self._qr(parse_qs(u.query))

        body = {}
        n = int(self.headers.get("Content-Length") or 0)
        if n:
            try:
                body = json.loads(self.rfile.read(n) or b"{}")
            except Exception:
                body = {}
        c = conn()
        try:
            uid = TOKENS.get(self.headers.get("X-Token"))
            user = one(c, "select * from user where id=?", (uid,)) if uid else None
            out = api(path[4:], parse_qs(u.query), body, user, AuditConn(c, user))
            c.commit()
            self._send(200, out)
        except Err as e:
            c.rollback()
            self._send(e.code, {"error": e.msg})
        except Exception as e:
            c.rollback()
            import traceback
            traceback.print_exc()
            self._send(500, {"error": "%s: %s" % (type(e).__name__, e)})
        finally:
            c.close()

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")


if __name__ == "__main__":
    print("VisaOps on http://127.0.0.1:%d%s/" % (PORT, PREFIX))
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
