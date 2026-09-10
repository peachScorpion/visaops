#!/usr/bin/env python3
"""造演示订单：全部走真实接口跑出来，不直接写库，保证状态与业务规则一致。

十五种状态 × 三个下单渠道，订单状态与 P1–P10 办理进度节点各自都有数据可看：
待支付 / 待财务放行 / 待收材料 / 补料中 / 材料已齐备 / 表单填写中 / 待预约面签 /
已预约待面签 / 已递交使领馆 / 行政审查中 / 已出签待返还 / 已完成 / 退款审批中 /
已退款 / 已取消；渠道：直客 C 端、门店 CSP、同业 B 端。
"""
import json
import sys
import urllib.request
import urllib.error
from urllib.parse import quote

BASE = "http://127.0.0.1:8820/visaops/api"


def call(path, data=None, token=None):
    req = urllib.request.Request(
        BASE + quote(path, safe="/?=&-"),
        data=json.dumps(data).encode() if data is not None else None,
        headers={"Content-Type": "application/json", **({"X-Token": token} if token else {})},
        method="POST" if data is not None else "GET")
    try:
        return json.loads(urllib.request.urlopen(req).read())
    except urllib.error.HTTPError as e:
        return {"_http": e.code, **json.loads(e.read() or b"{}")}


T = {k: call("/login", {"login": k, "pwd": "888888"})["token"]
     for k in ("c1", "c2", "sales", "agent", "op1", "lead", "fin", "sup")}

US = [x for x in call("/shop/products?country=美国", token=T["sales"])["list"]][0]
SP = US["suppliers"][0]["sup_product_id"]
DET = call("/shop/product?id=%d" % SP)
PK_STD = [p for p in DET["packages"] if p["name"] == "普通办理"][0]
PK_FAST = [p for p in DET["packages"] if p["name"] == "加急办理"][0]
PK_INS = [p for p in DET["packages"] if p["refund_insured"]][0]


def order(who, pkg, pax, deal=None, **kw):
    d = {"sup_product_id": SP, "pkg_id": pkg["id"], "applicants": pax,
         "depart_date": "2026-11-20", "recv_addr_id": 3}
    d.update(kw)
    if deal:
        d["deal_price"] = deal
    r = call("/order/create", d, T[who])
    if "no" not in r:
        raise SystemExit("下单失败：%s" % r)
    return r["no"]


def pay(no, who):
    call("/order/pay", {"no": no}, T[who])


def gate(no):
    """财务确认收款并放行，返回该订单的工单列表。"""
    p = [x for x in call("/fin/inbox", token=T["fin"])["list"] if x["ord_no"] == no][0]
    call("/fin/confirm", {"pay_id": p["pay_id"]}, T["fin"])
    return [w for w in call("/wo/list?scope=all", token=T["lead"])["list"] if w["ord_no"] == no]


def upload_all(wo, who, skip=None):
    cl = call("/my/checklist?applicant_id=%d" % wo["applicant_id"], token=T[who])
    for m in cl["list"]:
        if skip and m["mat_name"] == skip:
            continue
        call("/mat/upload", {"mat_id": m["id"], "file_name": m["mat_name"] + ".jpg"}, T[who])


def review_all(wo, reject=None, reason=""):
    wd = call("/wo/detail?no=" + wo["no"], token=T["op1"])
    bad = None
    for m in wd["materials"]:
        if reject and m["mat_name"] == reject:
            bad = m
            call("/mat/review", {"mat_id": m["id"], "action": "reject", "reason": reason},
                 T["op1"])
        else:
            call("/mat/review", {"mat_id": m["id"], "action": "pass"}, T["op1"])
    return bad


def to_submitted(wo, city="北京送签"):
    """推到已递交 P7。"""
    aid = wo["applicant_id"]
    call("/form/save", {"applicant_id": aid, "app_id": "AA00%06d" % aid,
                        "barcode": "AA00%06d" % aid}, T["op1"])
    call("/fee/save", {"applicant_id": aid, "item": "CGI 签证费", "amount": 1240,
                       "receipt_no": "CGI20260820%05d" % aid}, T["op1"])
    call("/appt/save", {"applicant_id": aid, "appt_no": "AP2026%06d" % aid,
                        "appt_at": "2026-09-18 09:30",
                        "appt_place": "美国驻华大使馆（北京）"}, T["op1"])
    b = call("/batch/create", {"applicant_ids": [aid], "submit_city": city,
                               "submit_date": "2026-09-18",
                               "courier": "顺丰 SF%09d" % (aid * 7717)}, T["op1"])
    call("/batch/send", {"no": b["no"]}, T["op1"])


P_JOB = {"name_cn": "陈立群", "name_en": "CHEN/LIQUN", "sex": "男", "birth": "1985-06-04",
         "id_no": "EK2201881", "id_expiry": "2032-03-11", "crowd": "job", "phone": "13801119988"}

made = []
SEQ = [0]


# 演示数据的护照姓名拼音。DS-160 的姓/名两格靠 name_en 带出，
# 全员共用一个 CHEN/LIQUN 会让「系统带出」看起来是错的，所以逐字给音。
PY = {
    "周": "ZHOU", "李": "LI", "张": "ZHANG", "孙": "SUN", "徐": "XU", "程": "CHENG",
    "汪": "WANG", "谢": "XIE", "钟": "ZHONG", "陆": "LU", "沈": "SHEN", "何": "HE",
    "褚": "CHU", "卫": "WEI", "吕": "LYU", "黄": "HUANG", "邓": "DENG", "袁": "YUAN",
    "傅": "FU", "石": "SHI", "柏": "BAI", "简": "JIAN", "路": "LU", "毕": "BI",
    "翁": "WENG", "章": "ZHANG", "施": "SHI", "戚": "QI", "叶": "YE", "任": "REN",
    "马": "MA", "武": "WU", "尚": "SHANG", "殷": "YIN", "封": "FENG", "宁": "NING",
    "阮": "RUAN", "梁": "LIANG", "薛": "XUE", "邹": "ZOU", "崔": "CUI", "潘": "PAN",
    "康": "KANG", "陈": "CHEN",
    "文": "WEN", "彦": "YAN", "佳": "JIA", "宁2": "NING", "思": "SI", "远": "YUAN",
    "婉": "WAN", "如": "RU", "家": "JIA", "俊": "JUN", "雨": "YU", "桐": "TONG",
    "敏": "MIN", "行": "XING", "承": "CHENG", "宇": "YU", "灵": "LING", "毓": "YU",
    "怀": "HUAI", "安": "AN", "知": "ZHI", "白": "BAI", "听": "TING", "澜": "LAN",
    "南": "NAN", "星": "XING", "长": "CHANG", "歌": "GE", "清": "QING", "让": "RANG",
    "志": "ZHI", "雅": "YA", "芝": "ZHI", "若": "RUO", "彤": "TONG", "明": "MING",
    "轩": "XUAN", "和": "HE", "言": "YAN", "瑾": "JIN", "舒": "SHU", "云": "YUN",
    "舟": "ZHOU", "慕": "MU", "青": "QING", "砚": "YAN", "望": "WANG", "山": "SHAN",
    "书": "SHU", "景": "JING", "博": "BO", "君": "JUN", "亭": "TING", "予": "YU",
    "涵": "HAN", "风": "FENG", "朝": "CHAO", "执": "ZHI", "中": "ZHONG", "秋": "QIU",
    "疏": "SHU", "影": "YING", "非": "FEI", "见": "JIAN", "立": "LI", "群": "QUN",
    "一": "YI", "诺": "NUO", "朔": "SHUO",
}
COMPOUND = {"夏侯": "XIAHOU", "东方": "DONGFANG"}


def py_name(nm):
    """中文姓名 → 护照式 SURNAME/GIVENNAME。查不到的字返回 None，宁可不填也不瞎拼。"""
    sur = next((s for s in COMPOUND if nm.startswith(s)), None)
    if sur:
        head, rest = COMPOUND[sur], nm[len(sur):]
    else:
        head, rest = PY.get(nm[0]), nm[1:]
    if not head:
        return None
    given = "".join(PY.get(ch, "") for ch in rest)
    if len(given) < len(rest):
        return None
    return head + "/" + given


def pax(nm, sex="男", crowd="job"):
    SEQ[0] += 1
    return [dict(P_JOB, name_cn=nm, name_en=py_name(nm) or P_JOB["name_en"],
                 sex=sex, crowd=crowd, id_no="EK%07d" % (3300000 + SEQ[0] * 137))]


# ---- 九种状态，每种写成一个函数，任意渠道都能跑一遍 ----
def st_created(who, nm, deal):
    return order(who, PK_STD, pax(nm), deal=deal, contact_name=nm, contact_phone="13800001111")


def st_paid(who, nm, deal):
    no = order(who, PK_FAST, pax(nm, crowd="free"), deal=deal, contact_name=nm,
               contact_phone="13800002222")
    pay(no, who)
    return no


def st_wait_mat(who, nm, deal):
    no = order(who, PK_STD, pax(nm), deal=deal, contact_name=nm, contact_phone="13800001111")
    pay(no, who)
    gate(no)
    return no


def st_supp(who, nm, deal):
    no = order(who, PK_STD, pax(nm, sex="女"), deal=deal, contact_name=nm,
               contact_phone="13800001111")
    pay(no, who)
    w = gate(no)[0]
    upload_all(w, who)
    bad = review_all(w, reject="近 6 个月银行流水", reason="流水未加盖银行公章，末月余额偏低")
    if bad:
        call("/supp/create", {"applicant_id": w["applicant_id"], "mat_ids": [bad["id"]],
                              "reason": "银行流水需重新打印并加盖银行公章"}, T["op1"])
    return no


def st_submitted(who, nm, deal):
    no = order(who, PK_STD, pax(nm), deal=deal, contact_name=nm, contact_phone="13901112233")
    pay(no, who)
    w = gate(no)[0]
    upload_all(w, who)
    review_all(w)
    to_submitted(w)
    return no


def st_visaed(who, nm, deal):
    no = order(who, PK_FAST, pax(nm, sex="女"), deal=deal, contact_name=nm,
               contact_phone="13901114455")
    pay(no, who)
    w = gate(no)[0]
    upload_all(w, who)
    review_all(w)
    to_submitted(w)
    call("/result/save", {"applicant_id": w["applicant_id"], "result": "pass",
                          "visa_no": "US2026091%05d" % w["applicant_id"],
                          "visa_valid_to": "2036-09-17", "visa_stay": 180}, T["op1"])
    return no


def st_done(who, nm, deal):
    no = st_visaed(who, nm, deal)
    w = [x for x in call("/wo/list?scope=all", token=T["lead"])["list"] if x["ord_no"] == no][0]
    d = call("/deliver/create", {"ord_no": no, "express": "顺丰",
                                 "express_no": "SF77%08d" % w["applicant_id"]}, T["op1"])
    signer = "c1" if who == "c1" else who
    call("/deliver/sign", {"no": d["no"], "sign_name": nm}, T[signer])
    return no


def _rejected(who, nm, deal, liability):
    no = order(who, PK_INS, pax(nm), deal=deal, contact_name=nm, contact_phone="13902223344")
    pay(no, who)
    w = gate(no)[0]
    upload_all(w, who)
    review_all(w)
    to_submitted(w)
    call("/result/save", {"applicant_id": w["applicant_id"], "result": "reject",
                          "reject_reason": "214(b) 未能证明足够的国内约束力",
                          "reject_cate": "移民倾向"}, T["op1"])
    call("/liability/set", {"applicant_id": w["applicant_id"], "liability": liability}, T["op1"])
    return no, w


def st_refunding(who, nm, deal):
    no, w = _rejected(who, nm, deal, "official")
    call("/refund/apply", {"no": no, "applicant_ids": [w["applicant_id"]],
                           "reason": "拒签，申请退还服务费",
                           "reason_cate": "拒签"}, T[who])
    return no


def st_refunded(who, nm, deal):
    no, w = _rejected(who, nm, deal, "customer")
    r = call("/refund/apply", {"no": no, "applicant_ids": [w["applicant_id"]],
                               "reason": "拒签，申请退还服务费",
                               "reason_cate": "拒签"}, T[who])
    call("/refund/approve", {"no": r["no"], "action": "pass", "amount": 1160,
                             "liability": "official", "note": "拒签退还服务费，签证费为使领馆官费不退"}, T["lead"])
    call("/refund/pay", {"no": r["no"]}, T["fin"])
    return no


def st_cancelled(who, nm, deal):
    no = order(who, PK_STD, pax(nm), deal=deal, contact_name=nm, contact_phone="13800003333")
    call("/order/cancel", {"no": no, "reason": "行程推迟，客户主动取消"}, T[who])
    return no


def _to_review_done(who, nm, deal, pkg=None):
    """推到 P3 材料已齐备：全部上传 + 全部审核通过。"""
    no = order(who, pkg or PK_STD, pax(nm), deal=deal, contact_name=nm,
               contact_phone="13800004444")
    pay(no, who)
    w = gate(no)[0]
    upload_all(w, who)
    review_all(w)
    return no, w


def st_ready(who, nm, deal):
    """P3 材料已齐备：等着填 DS-160。"""
    return _to_review_done(who, nm, deal)[0]


def st_forming(who, nm, deal):
    """P4 表单填写中：专员已经开始代填 DS-160，还没拿到 Application ID。"""
    no, w = _to_review_done(who, nm, deal)
    call("/progress/set", {"applicant_id": w["applicant_id"], "progress": "P4",
                           "note": "专员已开始代填 DS-160"}, T["lead"])
    return no


def st_wait_appt(who, nm, deal):
    """P5 待预约面签：DS-160 已回填并缴费，尚未约到号。"""
    no, w = _to_review_done(who, nm, deal)
    aid = w["applicant_id"]
    call("/form/save", {"applicant_id": aid, "app_id": "AA00%06d" % aid,
                        "barcode": "AA00%06d" % aid}, T["op1"])
    call("/fee/save", {"applicant_id": aid, "item": "CGI 签证费", "amount": 1240,
                       "receipt_no": "CGI20260821%05d" % aid}, T["op1"])
    return no


def st_appted(who, nm, deal):
    """P6 已预约待面签：号已约到，等客户去使馆。"""
    no = st_wait_appt(who, nm, deal)
    w = [x for x in call("/wo/list?scope=all", token=T["lead"])["list"] if x["ord_no"] == no][0]
    aid = w["applicant_id"]
    call("/appt/save", {"applicant_id": aid, "appt_no": "AP2026%06d" % aid,
                        "appt_at": "2026-09-25 10:15",
                        "appt_place": "美国驻华大使馆（北京）"}, T["op1"])
    return no


def st_ap(who, nm, deal):
    """P8 行政审查中：面签完被 221(g) 留档，官方无接口，只能人工复查。"""
    no = order(who, PK_FAST, pax(nm, sex="女"), deal=deal, contact_name=nm,
               contact_phone="13800005555")
    pay(no, who)
    w = gate(no)[0]
    upload_all(w, who)
    review_all(w)
    to_submitted(w, city="上海送签")
    call("/result/save", {"applicant_id": w["applicant_id"], "result": "ap"}, T["op1"])
    return no


STATES = [
    (st_created, "待支付"), (st_paid, "待财务放行"), (st_wait_mat, "办理中·待收材料"),
    (st_supp, "办理中·补料中"), (st_ready, "办理中·材料已齐备"),
    (st_forming, "办理中·表单填写中"), (st_wait_appt, "办理中·待预约面签"),
    (st_appted, "办理中·已预约待面签"), (st_submitted, "办理中·已递交使领馆"),
    (st_ap, "办理中·行政审查中"), (st_visaed, "办理中·已出签待返还"), (st_done, "已完成"),
    (st_refunding, "退款审批中"), (st_refunded, "已退款"), (st_cancelled, "已取消"),
]

# 每个渠道各跑一遍九种状态：直客自助、门店代客、同业代客
CHANNELS = [
    ("c1", "直客 C 端", None,
     ["周文彦", "李佳宁", "张思远", "孙婉如", "徐家俊", "程雨桐", "汪敏行", "谢承宇", "钟灵毓",
      "陆怀安", "沈知白", "何听澜", "褚南星", "卫长歌", "吕清让"]),
    ("sales", "门店 CSP", None,
     ["黄志远", "邓雅芝", "袁若彤", "傅明轩", "石家和", "柏思言", "简怀瑾", "路知远", "毕舒南",
      "翁云舟", "章慕青", "施砚白", "戚望山", "叶怀书", "任景行"]),
    ("agent", "同业 B 端", None,
     ["马文博", "武君亭", "尚予涵", "殷望舒", "封长风", "宁朝歌", "阮清和", "夏侯言", "东方朔",
      "梁执中", "薛砚秋", "邹疏影", "崔行舟", "潘知非", "康见山"]),
]

# 造数是副作用极大的操作（会往库里真写 45 条订单），只允许直接执行，
# 不允许被 import 触发——曾经 import 一次 py_name 就凭空多出 45 条订单。
if __name__ == "__main__":
    for who, label, deal, names in CHANNELS:
        for (fn, tag), nm in zip(STATES, names):
            made.append((fn(who, nm, deal), tag + " · " + label))

    for no, desc in made:
        print("  %-12s %s" % (no, desc))
    print("共造 %d 条演示订单" % len(made))
    sys.exit(0)
