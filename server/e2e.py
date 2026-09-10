#!/usr/bin/env python3
"""美国签证全链路端到端验收：客户下单 → 财务放行 → 专员办理 → 出结果 → 返还 → 拒签退款。"""
import json
import sys
import urllib.request
from urllib.parse import quote

BASE = "http://127.0.0.1:8820/visaops/api"
FAIL = []


def call(path, data=None, token=None, method=None):
    req = urllib.request.Request(
        BASE + quote(path, safe="/?=&-"),
        data=json.dumps(data).encode() if data is not None else None,
        headers={"Content-Type": "application/json", **({"X-Token": token} if token else {})},
        method=method or ("POST" if data is not None else "GET"))
    try:
        return json.loads(urllib.request.urlopen(req).read())
    except urllib.error.HTTPError as e:
        return {"_http": e.code, **json.loads(e.read() or b"{}")}


def login(u):
    return call("/login", {"login": u, "pwd": "888888"})["token"]


def ck(name, cond, extra=""):
    print(("  OK  " if cond else "  FAIL") + " " + name + (("  " + str(extra)) if extra else ""))
    if not cond:
        FAIL.append(name)


T = {k: login(k) for k in ("c1", "sales", "op1", "lead", "fin", "sup", "ops")}

print("\n[1] 客户选品：美国签证产品与按人群裁剪的材料清单")
sh = call("/shop/products?country=美国")
us = sh["list"][0]
ck("平台产品归类，多供应商可比价", len(us["suppliers"]) >= 2, [s["supplier"] for s in us["suppliers"]])
ck("面签+录指纹标记", us["need_interview"] == 1 and us["need_fingerprint"] == 1)
spid = us["suppliers"][0]["sup_product_id"]
d = call("/shop/product?id=%d" % spid)
ck("套餐层存在（普通/加急/代办面签陪同）", len(d["packages"]) == 3,
   [p["name"] for p in d["packages"]])
ck("材料清单按 5 类人群裁剪", len(d["checklist"]["job"]) != len(d["checklist"]["child"]),
   "在职 %d 项 / 儿童 %d 项" % (len(d["checklist"]["job"]), len(d["checklist"]["child"])))
ck("学生清单含在读证明", any("在读证明" == i["mat_name"] for i in d["checklist"]["student"]))
ck("儿童清单含出生证明", any("出生证明" in i["mat_name"] for i in d["checklist"]["child"]))
ck("在职清单不含出生证明", not any("出生证明" in i["mat_name"] for i in d["checklist"]["job"]))
ck("供应商收料地址可见", bool(d["mail_addr"]), d["mail_addr"])
pkg_std = [p for p in d["packages"] if p["name"] == "普通办理"][0]
# 「拒签退款保障」套餐 2026-08-31 已按业务口径去掉（拒签本来就退，不需要单独套餐）。
# 这里改成拿最贵的那个套餐，用途一样：验证门店代客下单时的价格护栏。
pkg_hi = sorted(d["packages"], key=lambda p: p["suggest_retail"])[-1]

print("\n[2] 下单：直客 2 人（在职 + 学生）")
r = call("/order/create", {
    "sup_product_id": spid, "pkg_id": pkg_std["id"], "depart_date": "2026-11-20",
    "contact_name": "张思远", "contact_phone": "13800001111", "recv_addr_id": 3,
    "applicants": [
        {"name_cn": "张思远", "name_en": "ZHANG/SIYUAN", "sex": "男", "birth": "1988-03-12",
         "id_no": "EJ1234567", "id_expiry": "2031-04-01", "crowd": "job", "phone": "13800001111"},
        {"name_cn": "张一诺", "name_en": "ZHANG/YINUO", "sex": "女", "birth": "2006-09-01",
         "id_no": "EJ7654321", "id_expiry": "2032-06-01", "crowd": "student"},
    ]}, T["c1"])
ONO = r["no"]
ck("订单创建", ONO.startswith("VS-"), "%s  %.0f 元" % (ONO, r["amount"]))

print("\n[3] 下单即建工单进「待收料」；收款前对供应商仍不可见")
# 2026-09-02 起流程与支付解耦：下单就按办签人建工单开始收料，
# 不再等财务确认（唐美芳：「下单后，默认就会根据办签人流转到待收料里」）。
# 但供应商可见性仍挂在资金闸门上——没收到钱不能让供应商开工。
_wo = [w for w in call("/wo/list?scope=all", token=T["lead"])["list"] if w.get("ord_no") == ONO]
ck("下单即生成 2 张工单", len(_wo) == 2, [w["no"] for w in _wo])
ck("工单初始进度为待收料", all(w["progress"] == "P1" for w in _wo),
   [w["progress_text"] for w in _wo])
ck("本单对供应商不可见", not [w for w in call("/sup/orders", token=T["sup"])["list"]
                              if w.get("ord_no") == ONO])

print("\n[3.5] 客人签证资料：付款前是推荐动作，不再是硬前置")
# 口径变过一次：2026-09-01 定的是「付款前必须录齐」，2026-09-02 她反馈
# 「csp 和有米下完单在待付款这里付不了款，流程走不下去」，改成不拦只提醒。
# 兜底仍在 info_sweep —— 未付款单超时未录资料自动取消，且明确跳过已收款的单。
# 这里另取一张待付款单验证「不拦」，主链路订单仍走「先录资料再付款」的正向流程。
# 排除主链路那张单：C 端客户绑定归属销售后（2026-09-02），直客单也会出现在
# sales 的订单列表里，不排掉就会把 ONO 先付掉，后面 [4] 再付必然失败。
_oth = [o for o in call("/my/orders", token=T["sales"])["list"]
        if o["status"] == "created" and o.get("info_state") != "done" and o["no"] != ONO]
if _oth:
    _r = call("/order/pay", {"no": _oth[0]["no"]}, T["sales"])
    ck("资料未录齐也能付款", _r.get("ok"), _r.get("msg"))
    ck("付款成功后提醒补齐资料", _r.get("info_miss", 0) > 0, _r.get("msg"))
else:
    ck("资料未录齐也能付款", True, "库中暂无资料未齐的待付款单，跳过")
info = call("/order/info?no=" + ONO, token=T["c1"])
ck("资料页列出缺项", all(a["missing"] for a in info["applicants"]),
   [(a["name_cn"], a["missing"]) for a in info["applicants"]])
ck("有 %d 小时时限" % info["hours"], bool(info["deadline"]), info["left_text"])
for a in info["applicants"]:
    f = {k: (a.get(k) or "") for k in ("name_cn", "name_en", "sex", "birth", "id_type",
                                       "id_no", "id_expiry", "id_place", "nation",
                                       "phone", "crowd")}
    f["id_place"] = f["id_place"] or "北京"
    f["phone"] = f["phone"] or "13800001111"
    rr = call("/order/info/save", dict(no=ONO, applicant_id=a["id"], **f), T["c1"])
    ck("录入 %s 的签证资料" % a["name_cn"], rr.get("ok"), rr.get("msg"))
ck("资料录齐后订单标记完成",
   bool(call("/order/info?no=" + ONO, token=T["c1"])["done_at"]))

print("\n[4] 支付 → 财务确认放行 → 自动派单")
r = call("/order/pay", {"no": ONO}, T["c1"])
ck("资料齐备后可付款", r.get("ok"), r.get("msg"))
inbox = call("/fin/inbox", token=T["fin"])
pay = [x for x in inbox["list"] if x["ord_no"] == ONO][0]
fc = call("/fin/confirm", {"pay_id": pay["pay_id"]}, T["fin"])
# 工单在下单时就建好了，财务确认只开资金闸门与挂应付，不再建单
ck("财务确认到账成功", fc.get("ok"), fc.get("msg"))
all_wo = [w for w in call("/wo/list?scope=all", token=T["lead"])["list"] if w["ord_no"] == ONO]
ck("工单台仍是这 2 张工单", len(all_wo) == 2, [w["no"] for w in all_wo])
sup_list = [w for w in call("/sup/orders", token=T["sup"])["list"] if w.get("ord_no") == ONO]
# 2026-09-04 办理中心取消脱敏，2026-09-07 订单列表与订单详情一并放开
# （唐美芳：办签本来就要按护照姓名一字不差地填，收料与通知面签都要直接联系本人）。
# 放开的只是联系人 / 办签人信息；金额侧的商业信息（客户成交价、平台毛利、收款流水）仍不下发。
ck("供应商可见且姓名不脱敏", len(sup_list) == 2 and "*" not in sup_list[0]["name"],
   "%d 条 · %s" % (len(sup_list), sup_list[0]["name"] if sup_list else "-"))
_ol = [o for o in call("/sup/orderlist", token=T["sup"])["list"] if o["no"] == ONO]
ck("供应商订单列表不脱敏", _ol and "*" not in (_ol[0].get("contact") or ""),
   _ol[0].get("contact") if _ol else "-")
_od = call("/order/detail?no=" + ONO, token=T["sup"])
ck("供应商订单详情不脱敏", "*" not in ((_od.get("contact") or {}).get("name") or ""),
   (_od.get("contact") or {}).get("name"))
ck("商业信息仍不下发给供应商",
   not (_od.get("pays") or []) and not ((_od.get("trade") or {}).get("sale")))
ck("应付已挂账", any(p["ord_no"] == ONO for p in call("/fin/payables", token=T["fin"])["list"]))

adult = [w for w in all_wo if w["crowd"] == "在职人员"][0]
student = [w for w in all_wo if w["crowd"] == "在校学生"][0]

print("\n[5] 客户提交材料 → 专员逐项审核 → 驳回 → 补料单")
cl = call("/my/checklist?applicant_id=%d" % adult["applicant_id"], token=T["c1"])
ck("客户看到自己的清单", cl["stat"]["total"] > 0, "%d 项" % cl["stat"]["total"])
for m in cl["list"]:
    # /mat/upload 后来加了 file_url 必填校验（真实上传必须有文件地址），脚本要跟上
    call("/mat/upload", {"mat_id": m["id"], "file_name": m["mat_name"] + ".jpg",
                         "file_url": "https://demo.local/mat/%d.jpg" % m["id"]}, T["c1"])
up = call("/my/checklist?applicant_id=%d" % adult["applicant_id"], token=T["c1"])
ck("AI 预审给出提示", any(m["ai_msg"] for m in up["list"]),
   next((m["ai_msg"] for m in up["list"] if m["ai_msg"]), "无提示"))
ck("进度自动推进到 P2", up["applicant"]["progress"] == "P2")

wd = call("/wo/detail?no=" + adult["no"], token=T["op1"])
bad = [m for m in wd["materials"] if m["mat_name"] == "近 6 个月银行流水"][0]
ok_ids = [m["id"] for m in wd["materials"] if m["id"] != bad["id"]]
for i in ok_ids:
    call("/mat/review", {"mat_id": i, "action": "pass"}, T["op1"])
call("/mat/review", {"mat_id": bad["id"], "action": "reject",
                     "reason": "流水未盖银行公章，且末月余额低于 5 万"}, T["op1"])
sp = call("/supp/create", {"applicant_id": adult["applicant_id"], "mat_ids": [bad["id"]],
                           "reason": "银行流水需重新打印并加盖公章"}, T["op1"])
ck("补料单已生成", sp["no"].startswith("BL-"), sp["no"] + " 截止 " + sp["due_at"])
my_sp = call("/my/supp", token=T["c1"])["list"]
ck("客户端收到补料通知含倒计时", my_sp and my_sp[0]["days_left"] in (6, 7),
   "剩余 %d 天" % my_sp[0]["days_left"])

print("\n[6] 客户补交 → 复审通过 → 材料齐备")
call("/mat/upload", {"mat_id": bad["id"], "file_name": "银行流水_盖章版.pdf",
                     "file_url": "https://demo.local/mat/%d-v2.pdf" % bad["id"]}, T["c1"])
call("/mat/review", {"mat_id": bad["id"], "action": "pass"}, T["op1"])
wd = call("/wo/detail?no=" + adult["no"], token=T["op1"])
ck("必交材料齐备后自动到 P3 待提交至官网", wd["progress"] == "P3", wd["progress_text"])

print("\n[7] 人工环节回填：提交官网 → 缴费 → 预约 → 送签批次 → 递交")
# 2026-09-02 起「提交至官网」这一步会校验订单付款状态，所以要先付掉
_pay = call("/order/pay", {"no": ONO}, T["c1"])
ck("提交官网前订单已付款", _pay.get("ok") or "不允许支付" in str(_pay.get("error", "")),
   _pay.get("msg") or _pay.get("error"))
call("/form/save", {"applicant_id": adult["applicant_id"], "app_id": "AA00A1B2C3",
                    "barcode": "AA00A1B2C3"}, T["op1"])
wd = call("/wo/detail?no=" + adult["no"], token=T["op1"])
ck("提交至官网后到 P4 待预约", wd["progress"] == "P4", wd["progress_text"])
call("/fee/save", {"applicant_id": adult["applicant_id"], "item": "CGI 签证费",
                   "amount": 1240, "receipt_no": "CGI2026081900731"}, T["op1"])
adv = call("/fin/advance", token=T["fin"])
ck("垫付台账已入账", adv["total"] >= 1240, "%.0f 元" % adv["total"])
call("/appt/save", {"applicant_id": adult["applicant_id"], "appt_no": "AP20260915001",
                    "appt_at": "2026-09-15 09:30", "appt_place": "美国驻华大使馆（北京）"}, T["op1"])
wd = call("/wo/detail?no=" + adult["no"], token=T["op1"])
ck("登记预约后到 P5 待出签", wd["progress"] == "P5", wd["progress_text"])
b = call("/batch/create", {"applicant_ids": [adult["applicant_id"], student["applicant_id"]],
                           "submit_city": "北京送签", "submit_date": "2026-09-15",
                           "courier": "顺丰 SF3392017744"}, T["op1"])
call("/batch/send", {"no": b["no"]}, T["op1"])
wd = call("/wo/detail?no=" + adult["no"], token=T["op1"])
# 递交不再单独占一个进度：预约登记后就是「待出签」，送签是这个区间里的动作
ck("送签批次递交后仍在 P5 待出签", wd["progress"] == "P5", b["no"])

print("\n[8] 结果回填：一人出签、一人行政审查转拒签")
call("/result/save", {"applicant_id": adult["applicant_id"], "result": "pass",
                      "visa_no": "US20260915X8841", "visa_valid_to": "2036-09-14",
                      "visa_stay": 180}, T["op1"])
ap = call("/result/save", {"applicant_id": student["applicant_id"], "result": "ap"}, T["op1"])
ck("行政审查给出 15 天复查日", ap["ap_due"][:10] > "2026-01-01", ap["ap_due"][:10])
call("/result/save", {"applicant_id": student["applicant_id"], "result": "reject",
                      "reject_reason": "214(b) 未能证明足够的国内约束力",
                      "reject_cate": "移民倾向"}, T["op1"])
lb = call("/liability/set", {"applicant_id": student["applicant_id"],
                             "liability": "official"}, T["op1"])
ck("责任判定联动退款试算", "amount" in lb["refund_hint"], lb["refund_hint"])

print("\n[9] 资料返还与客户签收")
dv = call("/deliver/create", {"ord_no": ONO, "express": "顺丰",
                              "express_no": "SF7788112233"}, T["op1"])
call("/deliver/sign", {"no": dv["no"], "sign_name": "张思远"}, T["c1"])
mo = [o for o in call("/my/orders", token=T["c1"])["list"] if o["no"] == ONO][0]
ck("订单闭环为已完成", mo["status"] == "done", mo["status_text"])
ck("客户端可见签证结果", any(a["result"] == "出签" for a in mo["applicants"]))

print("\n[10] 拒签退款：试算 → 申请 → 主管审批 → 财务出账")
q = call("/refund/quote?no=" + ONO, token=T["c1"])
stu = [x for x in q["list"] if x["result"] == "拒签"][0]
# 2026-08-31 起口径改了：拒签一律退服务费，签证费是使领馆官费不退。
# 原断言是「普通套餐拒签不退」，那是旧规则。
ck("拒签退服务费、签证费不退", stu["refundable"] > 0 and "签证费" in stu["rule"], stu["rule"])
rf = call("/refund/apply", {"no": ONO, "applicant_ids": [student["applicant_id"]],
                            "reason": "拒签申请退款", "reason_cate": "拒签"}, T["c1"])
call("/refund/approve", {"no": rf["no"], "action": "pass", "amount": 460,
                         "liability": "official", "note": "按拒签惯例退还服务费"}, T["lead"])
blocked = call("/refund/pay", {"no": rf["no"]}, T["op1"])
ck("越权出账被拒", blocked.get("_http") == 403)
call("/refund/pay", {"no": rf["no"]}, T["fin"])
rl = [x for x in call("/refund/list", token=T["fin"])["list"] if x["no"] == rf["no"]][0]
ck("退款完成", rl["status"] == "done", "%s %.0f 元" % (rl["no"], rl["amount"]))

print("\n[11] 门店代客下单：价格护栏")
low = call("/order/create", {"sup_product_id": spid, "pkg_id": pkg_std["id"],
                             "depart_date": "2026-12-20",
                             "deal_price": 800, "contact_name": "客户A",
                             "applicants": [{"name_cn": "测试", "crowd": "job"}]}, T["sales"])
ck("低于结算价被拦截", low.get("_http") == 400, low.get("error"))
# 2026-09-08 起 depart_date 是下单必填项（唐美芳：「出行日期不可能为空」）
ok = call("/order/create", {"sup_product_id": spid, "pkg_id": pkg_hi["id"],
                            "deal_price": 3000, "contact_name": "李佳宁",
                            "contact_phone": "13800002222",
                            "depart_date": "2026-12-20",
                            "applicants": [{"name_cn": "李佳宁", "crowd": "free",
                                            "id_no": "EK1122334"}]}, T["sales"])
ck("门店代客下单成功", ok["no"].startswith("VS-"), "%s %.0f 元" % (ok["no"], ok["amount"]))

print("\n[12] 供应商改价联动渠道结算价与报价预警")
sps = call("/sup/products", token=T["sup"])["list"]
target = [p for p in sps if p["country"] == "美国"][0]
pk0 = target["packages"][0]
# 2026-09-07 起结算价由供应商自行录入，不再是签证费 + 服务费
# （唐美芳：「录入结算价不是签证费+服务费，允许自己输入」），所以这里直接改结算价。
bad1 = call("/sup/pkg/save", {"id": pk0["id"], "visa_fee": pk0["visa_fee"],
                              "service_fee": pk0["service_fee"],
                              "settle_price": pk0["visa_fee"] - 1,
                              "suggest_retail": pk0["suggest_retail"],
                              "lead_days": pk0["lead_days"]}, T["sup"])
ck("结算价低于签证费被拦下", bad1.get("_http") == 400, bad1.get("error"))
bad2 = call("/sup/pkg/save", {"id": pk0["id"], "visa_fee": pk0["visa_fee"],
                              "service_fee": pk0["service_fee"],
                              "settle_price": pk0["settle_price"],
                              "suggest_retail": pk0["settle_price"] - 1,
                              "lead_days": pk0["lead_days"]}, T["sup"])
ck("建议零售价低于结算价被拦下", bad2.get("_http") == 400, bad2.get("error"))
# 结算价抬 300 的同时零售价也得跟着抬，否则会撞上「零售价不得低于结算价」这条新规则
sv = call("/sup/pkg/save", {"id": pk0["id"], "visa_fee": pk0["visa_fee"],
                            "service_fee": pk0["service_fee"],
                            "settle_price": pk0["settle_price"] + 300,
                            "suggest_retail": pk0["suggest_retail"] + 300,
                            "lead_days": pk0["lead_days"]}, T["sup"])
ck("结算价可独立于签证费 + 服务费",
   sv.get("settle_price") == pk0["settle_price"] + 300
   and sv["settle_price"] != pk0["visa_fee"] + pk0["service_fee"],
   "结算价 %s ≠ 签证费+服务费 %s" % (sv.get("settle_price"),
                                     pk0["visa_fee"] + pk0["service_fee"]))
# 2026-09-04 起：在售产品可以直接改价，改完自动下架，供应商点上架即刻恢复、不必重审
# （唐美芳：「编辑的时候，自动下架」「上架后不需要 uom 审核就直接上架了」）。
# 8-27 到 9-03 之间的规则是「改价必须先下架」，那条断言已作废。
ck("在售改价成功并自动下架", sv.get("ok") and sv.get("auto_off") is True,
   "新结算价 %s" % sv.get("settle_price"))
sp_off = [x for x in call("/sup/products", token=T["sup"])["list"]
          if x["id"] == target["id"]][0]
ck("下架后审核结论保留", sp_off["status"] == "draft" and sp_off["review_b"] == "approved",
   "status=%s review_b=%s" % (sp_off["status"], sp_off["review_b"]))
up = call("/sup/product/save", {"id": target["id"], "status": "published"}, T["sup"])
ck("重新上架免审即刻生效", up.get("review_b") == "approved" and up.get("review_c") != "pending",
   "review_b=%s review_c=%s" % (up.get("review_b"), up.get("review_c")))
# 价格改回去，免得后面的用例与人工验收看到被 e2e 抬高 300 元的报价
call("/sup/pkg/save", {"id": pk0["id"], "visa_fee": pk0["visa_fee"],
                       "service_fee": pk0["service_fee"], "settle_price": pk0["settle_price"],
                       "suggest_retail": pk0["suggest_retail"],
                       "lead_days": pk0["lead_days"]}, T["sup"])
call("/sup/product/save", {"id": target["id"], "status": "published"}, T["sup"])
sps2 = call("/sup/products", token=T["sup"])["list"]
t2 = [p for p in sps2 if p["country"] == "美国"][0]
# 原来这里验的是「同业渠道组按服务费加价 12% 联动」。2026-08-26 唐美芳定：
# 渠道统一按供应商定的售价卖，订单完成后按该订单结算价结算 —— 渠道差异化定价这层已撤掉，
# `pubs` 字段随之取消。改成验证这层确实不存在，防止哪天又被加回来。
ck("不存在渠道差异化定价层", "pubs" not in t2,
   "套餐 %d 个，各渠道同价" % len(t2.get("packages", [])))

print("\n[13] 主管看板与运营总览")
bd = call("/lead/board", token=T["lead"])
ck("主管看到人均工单负载", len(bd["owners"]) > 0, bd["owners"])
ck("拒签归因入库", bd["reject_cate"].get("移民倾向", 0) >= 1, bd["reject_cate"])
st = call("/ops/stats", token=T["ops"])
ck("运营总览可用", st["orders"] >= 2 and st["applicants"] >= 3,
   "订单 %d / 办签人 %d / GMV %.0f" % (st["orders"], st["applicants"], st["gmv"]))
oo = call("/ops/orders", token=T["ops"])["list"][0]
# 2026-09-08 唐美芳：「客户信息，客户名字不用脱敏」——运营端订单列表是内部作业页，
# 名字脱敏成「李**」的结果是电话核单时对不上人。手机号仍脱敏：它最容易被整段导出外流。
ck("运营端列表姓名不脱敏、手机号仍脱敏",
   "*" not in (oo["contact"] or "") and "*" in oo["phone"],
   oo["contact"] + " " + oo["phone"])

print("\n" + ("全部通过 ✅" if not FAIL else "失败 %d 项 ❌ %s" % (len(FAIL), FAIL)))
sys.exit(1 if FAIL else 0)
