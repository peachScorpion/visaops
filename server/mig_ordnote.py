#!/usr/bin/env python3
"""ord 加 note：订单备注。
唐美芳 2026-09-16：「订单详情里有订单备注字段，但是有米、C 端小程序、csp 都没有
填写订单备注的地方」。原来订单详情只摆了占位文案「销售备注请在订单日志中补记」，
订单表本身没有备注字段。现在下单时随单一并写入 note，详情页读取展示。
"""
import os
import sqlite3

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visaops.db")
c = sqlite3.connect(DB)
cols = [r[1] for r in c.execute("pragma table_info(ord)")]
if "note" in cols:
    print("ord.note 已存在")
else:
    c.execute("alter table ord add column note TEXT")
    print("已添加 ord.note")
c.commit()
print("done")