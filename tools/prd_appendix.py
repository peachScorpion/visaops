# -*- coding: utf-8 -*-
"""由 prd/facts.json 生成附录 A/B/C。手写这三份清单必然抄漏，也必然跟代码走散。"""
import json, os, re, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = json.load(open(os.path.join(ROOT, "prd/facts.json"), encoding="utf-8"))
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prd_apidoc import DOC
SRC = os.path.join(ROOT, "prd/src")

PORTAL = {
    "customer": ("客户端", "H5 / 小程序 · 直客"),
    "youmi": ("有米小程序", "门店销售移动端"),
    "csp": ("CSP 门店工作台", "门店销售 / 同业 · PC"),
    "uom": ("UOM · 签证操作专员", "工单履约"),
    "lead": ("UOM · 签证主管", "派单 · 审批"),
    "fin": ("UOM · 财务", "收款 · 结算 · 退款"),
    "ops": ("UOM · 平台管理员", "材料标准 · 产品审核 · 全平台"),
    "ubk": ("UBK 供应商门户", "签证资源方"),
}
ROLE_CN = {"customer": "客户", "csp": "门店销售", "youmi": "门店销售(移动)",
           "uom": "专员", "lead": "主管", "fin": "财务", "ops": "平台管理员",
           "ubk": "供应商", "*any*": "任意已登录", "youmi_": "门店销售"}

# 菜单名反查：view key → 菜单里的中文名（同名多角色取第一个）
mname = {}
for m in F["menus"]:
    mname.setdefault(m["v"], m["t"])


# ---------------- 附录 A ----------------
A = ["# 附录 A · 页面路由清单",
     "",
     "全部 %d 个前端页面，由 `tools/prd_extract.py` 从 `web/js/v-*.js` 的 "
     "`VIEWS['…']` 注册处直接抽取，与运行中的系统一致。" % len(F["views"]),
     "",
     "路由写法：`#<端>:<页面>`，带记录 id 的页面在末尾追加 `/<id>`，"
     "例如 `#ops:review/12` 表示平台管理员打开 12 号产品的审核页。",
     ""]
by = collections.defaultdict(list)
for v in F["views"]:
    by[v["key"].split(":")[0]].append(v)
for pk in ["ops", "uom", "lead", "fin", "ubk", "csp", "youmi", "customer"]:
    if pk not in by:
        continue
    t, sub = PORTAL[pk]
    A += ["## A.%d %s" % (["ops", "uom", "lead", "fin", "ubk", "csp", "youmi",
                          "customer"].index(pk) + 1, t),
          "", "*%s* · 共 %d 个页面" % (sub, len(by[pk])), "",
          "| 路由 | 菜单 / 页面名 | 实现文件 |", "|---|---|---|"]
    for v in sorted(by[pk], key=lambda x: x["key"]):
        leaf = v["key"].split(":", 1)[1]
        A.append("| `#%s` | %s | `web/js/%s` |"
                 % (v["key"], mname.get(leaf, "—"), v["file"]))
    A.append("")
open(os.path.join(SRC, "91-appendix-a.md"), "w", encoding="utf-8").write("\n".join(A))

# ---------------- 附录 B ----------------
B = ["# 附录 B · 接口清单",
     "",
     "全部 %d 个接口，由 `tools/prd_extract.py` 从 `server/app.py` 的路由分发处抽取，"
     "**权限列取自各接口内第一处 `need(...)` 调用**，与实际鉴权一致。" % len(F["apis"]),
     "",
     "调用约定：统一前缀 `/api`，`GET` 走查询串、`POST` 走 JSON body；"
     "登录后携带 `X-Token` 请求头。错误统一返回 `{\"error\": \"...\"}`，"
     "HTTP 状态 401 未登录 / 403 越权 / 400 参数或业务校验不通过 / 500 服务端异常。",
     "",
     "> `ops` 是 UOM 内部超级管理员：凡权限列含 `uom`/`lead`/`fin` 任一者，`ops` 一并放行，下表不再重复标注。",
     ""]
secs = []
for a in F["apis"]:
    if a["sec"] not in secs:
        secs.append(a["sec"])
for n, s in enumerate(secs, 1):
    items = [a for a in F["apis"] if a["sec"] == s]
    B += ["## B.%d %s" % (n, s or "未分组"), "",
          "| 接口 | 权限 | 说明 | app.py |", "|---|---|---|---|"]
    for a in items:
        r = "、".join(ROLE_CN.get(x, x) for x in a["roles"]) if a["roles"] else "免登录"
        B.append("| `/api%s` | %s | %s | L%d |"
                 % (a["path"], r, DOC.get(a["path"]) or a["doc"] or "—", a["line"]))
    B.append("")
open(os.path.join(SRC, "92-appendix-b.md"), "w", encoding="utf-8").write("\n".join(B))

# ---------------- 附录 C ----------------
GROUP = [
    ("组织与账号", ["org", "user", "supp"]),
    ("材料标准", ["formver", "form_field", "fullver", "fullver_item", "sample_tpl"]),
    ("产品与报价", ["product", "sup_product", "pkg", "addr", "country_cfg",
                    "home_cfg", "visa_policy", "chan_group", "chan_rule", "chan_pub"]),
    ("交易", ["ord", "applicant", "traveler"]),
    ("履约", ["wo", "mat", "form_task", "form_answer", "batch", "deliver"]),
    ("资金", ["pay", "payable", "prepay", "advance", "refund", "sup_refund", "bill"]),
    ("系统", ["event", "seq"]),
]
TDESC = {
    "org": "组织：门店 / 供应商 / 平台本部，账号挂在组织下决定数据边界",
    "user": "账号：role 决定身份，org_id 决定可见范围",
    "supp": "供应商档案与资质",
    "formver": "国家签证表模板（底层字典，只有启用/禁用）",
    "form_field": "表模板下的题目定义",
    "fullver": "国家送签材料库清单版本，引用一份启用中的表模板",
    "fullver_item": "清单版本下的逐项材料（分人群、提供方式、必要性）",
    "sample_tpl": "跨国复用的材料样例图",
    "product": "平台产品目录，供应商上品时自动登记",
    "sup_product": "供应商在售产品，挂 B/C 两端审核状态与上架开关",
    "pkg": "套餐：同产品下的办理档位，各自有价与时长",
    "addr": "供应商收料地址",
    "country_cfg": "国家展示配置（C 端）",
    "home_cfg": "C 端首页配置",
    "visa_policy": "签证政策内容",
    "chan_group": "渠道组", "chan_rule": "加价策略", "chan_pub": "渠道投放",
    "ord": "订单（VS-），gate 为收款放行开关",
    "applicant": "办签人，progress 为六步办理进展",
    "traveler": "客户档案里的常用出行人",
    "wo": "工单（VW-），一个办签人一张",
    "mat": "工单下的材料项，逐项审核",
    "form_task": "官方申请表填报任务", "form_answer": "填报答案",
    "batch": "送签批次", "deliver": "递交 / 交付记录",
    "pay": "收款单", "payable": "应付供应商", "prepay": "供应商预付款",
    "advance": "垫付与缴费台账", "refund": "客户退款单",
    "sup_refund": "供应商退款", "bill": "供应商月度账单",
    "event": "全量操作日志（谁在什么时候把什么改成了什么）",
    "seq": "各类单号的自增序列",
}
tb = {t["name"]: t for t in F["tables"]}
C = ["# 附录 C · 数据字典",
     "",
     "全部 %d 张表，由 `tools/prd_extract.py` 直接读 `server/visaops.db` 的表结构生成。"
     "「行数」为演示环境当前数据量，供估算数据分布用。" % len(F["tables"]), ""]
seen = set()
for n, (g, names) in enumerate(GROUP, 1):
    C += ["## C.%d %s" % (n, g), ""]
    for nm in names:
        if nm not in tb:
            continue
        seen.add(nm)
        t = tb[nm]
        C += ["### `%s` — %s" % (nm, TDESC.get(nm, "")), "",
              "当前 %d 行" % t["rows"], "",
              "| 字段 | 类型 | 约束 |", "|---|---|---|"]
        for col in t["cols"]:
            cons = []
            if col["pk"]:
                cons.append("主键")
            if col["notnull"]:
                cons.append("非空")
            if col["dflt"] is not None:
                cons.append("默认 `%s`" % col["dflt"])
            C.append("| `%s` | %s | %s |" % (col["name"], col["type"] or "—",
                                             " · ".join(cons) or "—"))
        C.append("")
rest = [t for t in F["tables"] if t["name"] not in seen]
if rest:
    C += ["## C.%d 其他" % (len(GROUP) + 1), "",
          "| 表 | 行数 | 字段数 |", "|---|---|---|"]
    for t in rest:
        C.append("| `%s` | %d | %d |" % (t["name"], t["rows"], len(t["cols"])))
    C.append("")
open(os.path.join(SRC, "93-appendix-c.md"), "w", encoding="utf-8").write("\n".join(C))
print("附录 A/B/C 已生成")
