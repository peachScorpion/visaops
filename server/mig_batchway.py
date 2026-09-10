# -*- coding: utf-8 -*-
"""送签批次的「递交方式」与「快递单号」拆成两个字段。

唐美芳 2026-09-01：「你检查下整站系统，话术及字段展示，尽量要满足专业严谨的表达」。
查出来 batch.courier 一个字段里塞的是「顺丰 SF000069453」——递交方式与快递单号糊在一起。
后果是列表筛选「递交方式」的下拉里列出了 19 个快递单号当选项，
运营根本没法按「哪些是快递送的、哪些是专人送的」筛。

deliver_way: courier 快递送达 / staff 专人递交 / self 使馆自取
courier: 只留快递单号；专人递交与自取没有单号
"""
import sqlite3, os, re
db = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'visaops.db')
c = sqlite3.connect(db)

if 'deliver_way' not in [r[1] for r in c.execute("pragma table_info(batch)")]:
    c.execute("alter table batch add column deliver_way TEXT DEFAULT 'courier'")
    print("+ batch.deliver_way")
if 'express' not in [r[1] for r in c.execute("pragma table_info(batch)")]:
    c.execute("alter table batch add column express TEXT")
    print("+ batch.express")

n = 0
for bid, cur in c.execute("select id, courier from batch").fetchall():
    cur = (cur or "").strip()
    m = re.match(r"^(顺丰|京东|中通|圆通|申通|韵达|EMS)\s*(\S+)?$", cur)
    if m:
        way, exp, comp = "courier", m.group(2) or "", m.group(1)
    elif "专人" in cur or "自送" in cur:
        way, exp, comp = "staff", "", ""
    elif "自取" in cur:
        way, exp, comp = "self", "", ""
    else:
        way, exp, comp = "courier", cur, ""
    c.execute("update batch set deliver_way=?, express=?, courier=? where id=?",
              (way, exp, comp or cur, bid))
    n += 1
c.commit()
print("拆分 %d 条" % n)
for r in c.execute("select no,deliver_way,courier,express from batch limit 4"):
    print("  ", r)
