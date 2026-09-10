# -*- coding: utf-8 -*-
"""从代码里抽 PRD 的事实底稿：接口 / 权限 / 前端路由 / 菜单 / 数据字典 / 状态常量。
手写这些清单必然抄漏，抽出来的才和跑着的系统一致。产物：prd/facts.json"""
import json, os, re, sqlite3, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = open(os.path.join(ROOT, "server/app.py"), encoding="utf-8").read()
LINES = SRC.split("\n")

# ---------- 1. 接口 ----------
apis = []
sec = ""
for i, ln in enumerate(LINES):
    ms = re.match(r'\s*#\s*-{4,}\s*(.+?)\s*-{4,}\s*$', ln)
    if ms:
        sec = ms.group(1)
    m = re.match(r'\s*if path == "([^"]+)"', ln)
    if not m:
        continue
    p = m.group(1)
    # 说明优先取紧邻上方的注释行（写代码时随手记的口径，比事后补的准）
    doc = ""
    k = i - 1
    buf = []
    while k >= 0 and re.match(r'\s*#(?!\s*-{4})', LINES[k]):
        buf.insert(0, re.sub(r'^\s*#\s?', '', LINES[k]).strip())
        k -= 1
    if buf:
        doc = " ".join(x for x in buf if x)[:160]

    # 往下最多 12 行找 need(...)，找到第一个就停
    roles = []
    for j in range(i + 1, min(i + 13, len(LINES))):
        nl = LINES[j]
        if re.match(r'\s*if path == "', nl):
            break
        mn = re.search(r'need\(([^)]*)\)', nl)
        if mn and not roles:
            roles = re.findall(r'"([a-z_]+)"', mn.group(1)) or ["*any*"]
        md = re.match(r'\s*"""(.+)', nl)
        if md and not doc:
            doc = md.group(1).rstrip('"').strip()[:160]
    apis.append({"path": p, "roles": roles, "sec": sec, "line": i + 1, "doc": doc})

# ---------- 2. 前端视图与菜单 ----------
views, WEB = [], os.path.join(ROOT, "web/js")
for fn in sorted(os.listdir(WEB)):
    if not fn.endswith(".js"):
        continue
    t = open(os.path.join(WEB, fn), encoding="utf-8").read()
    for v in re.findall(r"VIEWS\['([^']+)'\]", t):
        views.append({"key": v, "file": fn})

core = open(os.path.join(WEB, "core.js"), encoding="utf-8").read()
menus = []
for m in re.finditer(r"\{\s*t:\s*'([^']+)',\s*v:\s*'([^']+)'([^}]*)\}", core):
    ex = m.group(3)
    rl = re.findall(r"'([a-z_]+)'", re.search(r"roles:\s*\[([^\]]*)\]", ex).group(1)) \
        if re.search(r"roles:\s*\[", ex) else []
    menus.append({"t": m.group(1), "v": m.group(2), "roles": rl})

# ---------- 3. 数据字典 ----------
db = sqlite3.connect(os.path.join(ROOT, "server/visaops.db"))
db.row_factory = sqlite3.Row
tables = []
for r in db.execute("select name,sql from sqlite_master where type='table' "
                    "and name not like 'sqlite_%' order by name"):
    cols = [{"name": c["name"], "type": c["type"], "notnull": c["notnull"],
             "dflt": c["dflt_value"], "pk": c["pk"]}
            for c in db.execute("pragma table_info(%s)" % r["name"])]
    n = db.execute("select count(*) n from %s" % r["name"]).fetchone()["n"]
    tables.append({"name": r["name"], "cols": cols, "rows": n, "sql": r["sql"]})

# ---------- 4. 状态常量 ----------
ns = {}
exec(compile("\n".join(LINES[:600]).replace("from ", "#from ").replace("import ", "#import "),
             "<consts>", "exec"), ns) if False else None
consts = {}
for name in ["PROGRESS", "GSTAGE", "G_OF", "G_ENTRY", "CROWD", "WAY", "ATTR", "NEC",
             "ORD_STATUS", "RESULT", "LIABILITY", "DELIVER_WAY", "REJECT_CATE",
             "SVC_FIXED", "SVC_OPTS", "VALID_UNIT", "STAY_UNIT", "PAY_ST_TEXT",
             "RECV_ST_TEXT", "CUST_PROG", "CUST_PROG_TODO", "ENTRIES", "FV_STATUS",
             "MAT_ST", "CROWD_ORDER", "ALL_CROWD", "VISA_CATS", "COUNTRIES"]:
    # 从 `NAME = ` 起，到下一处顶格的赋值 / def / class / 注释块为止；再剔掉整行注释
    m = re.search(r"^%s = (.*?)(?=^[A-Za-z_]+ *= |^def |^class |^#)" % name, SRC, re.S | re.M)
    if not m:
        continue
    body = "\n".join(l for l in m.group(1).split("\n")
                     if not l.lstrip().startswith("#"))
    try:
        consts[name] = eval(body.strip())
    except Exception:
        consts[name] = body.strip()

out = {"apis": apis, "views": views, "menus": menus, "tables": tables, "consts": consts}
os.makedirs(os.path.join(ROOT, "prd"), exist_ok=True)
json.dump(out, open(os.path.join(ROOT, "prd/facts.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("接口 %d · 视图 %d · 菜单 %d · 数据表 %d · 常量 %d"
      % (len(apis), len(views), len(menus), len(tables), len(consts)))
