#!/usr/bin/env python3
"""供应商（UBK）视角的工单流转走查：一张新单从派发到结算，逐步试每个动作，
记录「谁能做、做不了时报什么、UI 上有没有抓手」。只读为主，写操作用新建的测试单。"""
import json, sys, urllib.request, urllib.error
from urllib.parse import quote
BASE = "http://127.0.0.1:8820/visaops/api"

def call(path, data=None, token=None, method=None):
    req = urllib.request.Request(BASE + quote(path, safe="/?=&-"),
        data=json.dumps(data).encode() if data is not None else None,
        headers={"Content-Type": "application/json", **({"X-Token": token} if token else {})},
        method=method or ("POST" if data is not None else "GET"))
    try:
        return json.loads(urllib.request.urlopen(req).read())
    except urllib.error.HTTPError as e:
        return {"_http": e.code, **json.loads(e.read() or b"{}")}

def login(u): return call("/login", {"login": u, "pwd": "888888"})["token"]
T = {k: login(k) for k in ("c1","sales","op1","lead","fin","sup","ops")}
def step(t): print("\n"+"="*4+" "+t)
def ok(n, c, x=""): print(("  ✓ " if c else "  ✗ ")+n+(("  "+str(x)) if x else ""))

step("1 建单（直客 1 人，美国普通办理）")
sh = call("/shop/products?country=美国"); us = sh["list"][0]
spid = us["suppliers"][0]["sup_product_id"]
d = call("/shop/product?id=%d" % spid)
pkg = [p for p in d["packages"] if p["name"] == "普通办理"][0]
r = call("/order/create", {"sup_product_id": spid, "pkg_id": pkg["id"],
    "depart_date": "2026-12-20", "contact_name": "走查测试", "contact_phone": "13900000001",
    "recv_addr_id": 3, "applicants": [{"name_cn": "走查甲", "name_en": "ZOU/CHAJIA",
      "sex": "男", "birth": "1990-01-01", "id_no": "EW0000001", "id_expiry": "2033-01-01",
      "crowd": "job", "phone": "13900000001"}]}, T["c1"])
ONO = r.get("no"); print("   订单", ONO, r.get("amount"))
_od = call("/order/detail?no=" + ONO, token=T["c1"]); aid = _od["applicants"][0]["id"]

step("2 派发闸门：财务确认到账之前，供应商看得到吗")
seen = [w for w in call("/sup/orders", token=T["sup"])["list"] if w.get("ord_no") == ONO]
ok("未收款时对供应商不可见", not seen)
gw = call("/sup/orders", token=T["sup"]).get("gate_wait")
print("   当前被闸门挡住的办签人数：", gw)

step("3 客户付款 + 财务确认")
# 付款前先把签证资料录齐（系统要求资料齐才可付款）
a0 = _od["applicants"][0]
f = {k: (a0.get(k) or "") for k in ("name_cn","name_en","sex","birth","id_type","id_no",
                                    "id_expiry","id_place","nation","phone","crowd")}
f["id_place"] = f["id_place"] or "北京"; f["phone"] = f["phone"] or "13900000001"
call("/order/info/save", dict(no=ONO, applicant_id=aid, **f), T["c1"])
pr = call("/order/pay", {"no": ONO}, T["c1"])
ok("客户付款", pr.get("ok"), pr.get("msg") or pr.get("error"))
pay = [x for x in call("/fin/inbox", token=T["fin"])["list"] if x["ord_no"] == ONO]
fc = call("/fin/confirm", {"pay_id": pay[0]["pay_id"]}, T["fin"]) if pay else {}
ok("财务确认到账", fc.get("ok"), fc.get("msg") or fc.get("error"))
seen = [w for w in call("/sup/orders", token=T["sup"])["list"] if w.get("ord_no") == ONO]
ok("确认后供应商可见", bool(seen), seen[0]["no"] if seen else "")
W = seen[0] if seen else {}

step("4 待收料档：供应商手上有哪些抓手")
print("   stage:", W.get("stage_text"), "| 材料:", W.get("mat"))
print("   form_avail:", W.get("form_avail"), "| form:", W.get("form"))
mats = call("/my/checklist?applicant_id=%d" % aid, token=T["sup"])
ok("能看材料清单", "list" in mats or "items" in mats, list(mats)[:4])
up = call("/sup/progress", {"no": W.get("no"), "progress": "G2"}, T["sup"])
ok("材料没齐能否直接标处理中", "ok" in up, up.get("error") or up.get("stage"))

step("5 材料审核：供应商能审吗")
ms = mats.get("list") or mats.get("items") or []
mid = (ms[0] or {}).get("id") if ms else None
if mid:
    rv = call("/mat/review", {"mat_id": mid, "action": "pass"}, T["sup"])
    ok("供应商审核材料", "ok" in rv, rv.get("error") or rv.get("_http"))
pa = call("/mat/passall", {"applicant_id": aid}, T["sup"])
ok("供应商整单放行材料", "ok" in pa, pa.get("error") or pa.get("_http"))

step("6 换众信专员审核（UOM）")
pa2 = call("/mat/passall", {"applicant_id": aid}, T["op1"])
print("   uom 整单放行:", {k: pa2.get(k) for k in ("ok","n","msg","error")})
W2 = [w for w in call("/sup/orders", token=T["sup"])["list"] if w.get("ord_no") == ONO]
print("   放行后供应商侧 stage:", W2[0]["stage_text"] if W2 else "-")

step("7 处理中：供应商能看到/回传什么")
w = W2[0] if W2 else {}
print("   可用字段:", [k for k in ("progress_text","stage_text","appt_at","app_id","cgi_receipt","sla_due") if w.get(k)])
print("   progress:", w.get("progress_text"), "| 是否能看到官网受理号等细节:", bool(w.get("app_id")))
hold = call("/sup/progress", {"no": w.get("no"), "progress": "G1"}, T["sup"])
ok("能否回退（比如材料退回重收）", "ok" in hold, hold.get("error"))

step("8 出结果")
res = call("/result/save", {"applicant_id": aid, "result": "pass", "visa_no": "V-WALK-001",
    "visa_valid_to": "2027-09-01", "visa_stay": "180"}, T["sup"])
ok("供应商登记出签", "ok" in res, res.get("error") or res.get("_http"))
W3 = [w for w in call("/sup/orders", token=T["sup"])["list"] if w.get("ord_no") == ONO]
print("   登记后 stage:", W3[0]["stage_text"] if W3 else "-", "| 结果:", W3[0].get("result_text") if W3 else "")

step("9 结算")
st = call("/sup/settle", token=T["sup"])
mine = [p for p in st["list"] if p.get("ord_no") == ONO]
ok("应付已挂账", bool(mine), mine[0] if mine else "无")
print("   我方待结算合计:", st.get("open"))

step("10 其他：挂起 / 加急 / 改期 / 补料，供应商有没有入口")
for p, d2 in [("/wo/hold", {"no": w.get("no"), "reason": "走查"}),
              ("/appt/save", {"applicant_id": aid, "appt_no": "A1"}),
              ("/supp/create", {"applicant_id": aid, "mat_ids": [], "reason": "x"})]:
    rr = call(p, d2, T["sup"])
    print("   %-14s → %s" % (p, rr.get("error") or ("ok" if rr.get("ok") else rr.get("_http"))))
print("\n走查单：", ONO)
