#!/usr/bin/env python3
"""wo 表加 sup_owner：供应商侧的经办人。

唐美芳 2026-09-09：「另外办理中心列表，我看 uom 有改派，ubk 应该也有，
主要干活还是在 ubk，所以操作按钮不能少」。
原来只有 owner_user（众信侧承办专员），供应商公司内部谁在办这一单系统里不记录，
所以 UBK 侧没有可改派的对象。补上这一列，并给优耐德补两个经办人账号，
否则一家供应商只有一个登录账号，改派点开是空的。
"""
import os
import sqlite3

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visaops.db")
c = sqlite3.connect(DB)
c.row_factory = sqlite3.Row

cols = [r[1] for r in c.execute("pragma table_info(wo)")]
if "sup_owner" not in cols:
    c.execute("alter table wo add column sup_owner integer")
    print("wo.sup_owner 已添加")
else:
    print("wo.sup_owner 已存在")

# 优耐德（org 2）补两个经办人；密码与其他演示账号一致
ucols = [r[1] for r in c.execute("pragma table_info(user)")]
for login, name in (("sup_a", "何书桓"), ("sup_b", "林小满")):
    if c.execute("select count(*) from user where login=?", (login,)).fetchone()[0]:
        print("%s 已存在" % login)
        continue
    base = c.execute("select * from user where login='sup'").fetchone()
    vals = {k: base[k] for k in ucols if k != "id"}
    vals["login"] = login
    vals["name"] = name
    ks = ",".join(vals.keys())
    qs = ",".join("?" * len(vals))
    c.execute("insert into user(%s) values(%s)" % (ks, qs), list(vals.values()))
    print("已建账号 %s / %s（org %s）" % (login, name, vals.get("org_id")))

# 存量工单默认挂在该供应商的主账号名下，避免整列空白看不出效果
for org in [r["id"] for r in c.execute("select distinct sup_org id from wo where sup_org is not null")]:
    u = c.execute("select id from user where org_id=? and role='ubk' order by id limit 1",
                  (org,)).fetchone()
    if not u:
        continue
    n = c.execute("update wo set sup_owner=? where sup_org=? and sup_owner is null",
                  (u["id"], org)).rowcount
    print("org %s 的 %d 张工单默认经办人 -> user %s" % (org, n, u["id"]))
c.commit()
print("done")
