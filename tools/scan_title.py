"""比对左侧菜单名与页面标题是否一致。

唐美芳 2026-09-01：「列表的标题最好和菜单名称保持一致。你看看其他页面
是不是也有类似的问题」。同一个页面在菜单里叫一个名、进去标题叫另一个名，
用户会以为点错了，也没法用名字互相指认。
"""
import os
import re

WEB = os.path.join(os.path.dirname(__file__), "..", "web", "js")
core = open(os.path.join(WEB, "core.js"), encoding="utf-8").read()

# 菜单项：{ t: '名字', v: 'view', roles: [...], sec: 'xx' }
menu = {}
for m in re.finditer(r"\{\s*t:\s*'([^']+)',\s*v:\s*'([^']+)'([^}]*)\}", core):
    name, view, rest = m.group(1), m.group(2), m.group(3)
    rs = re.search(r"roles:\s*\[([^\]]*)\]", rest)
    roles = re.findall(r"'([^']+)'", rs.group(1)) if rs else []
    sec = re.search(r"sec:\s*'([^']+)'", rest)
    for r in roles:
        menu.setdefault((r, view), []).append((name, sec.group(1) if sec else None))

# 页面标题：VIEWS['role:view'] 里第一个 pageH('标题'
titles = {}
for fn in sorted(os.listdir(WEB)):
    if not fn.endswith(".js") or ".bak" in fn:
        continue
    src = open(os.path.join(WEB, fn), encoding="utf-8").read()
    for m in re.finditer(r"VIEWS\['([a-z]+):([a-z0-9]+)'\]", src):
        role, view = m.group(1), m.group(2)
        seg = src[m.end():m.end() + 6000]
        # 认第一个 pageH(：写成 pageH(menuName(...)) 的，标题就是从菜单取的，天然一致
        first = re.search(r"pageH\(\s*(menuName\(|'([^']+)')", seg)
        if not first:
            continue
        titles.setdefault((role, view), []).append((first.group(2), fn))

bad = []
for k, names in sorted(menu.items()):
    ts = titles.get(k)
    if not ts:
        continue
    mname = names[0][0]
    tname = ts[0][0]
    if tname is None:
        continue
    # 客户端与有米是小程序：手机标题对应的是一级功能域名，二级菜单项本就写得更细，
    # 两者不同名是设计，不是漂移。
    if k[0] in ("customer", "youmi"):
        continue
    multi_sec = len(names) > 1 or names[0][1]
    if mname != tname and not multi_sec:
        bad.append((k, mname, tname, ts[0][1]))

for (role, view), mname, tname, fn in bad:
    print("%-6s %-12s 菜单「%s」 ≠ 标题「%s」   (%s)" % (role, view, mname, tname, fn))
print("\n共 %d 处不一致（分区页面 sec 有多个子标题，已跳过）" % len(bad))
