#!/usr/bin/env python3
"""sup_product 的 off_sale 拆成 off_b / off_c：分端启停售开关。

唐美芳 2026-09-11：「C 端下架仅 C 端小程序的产品不展示，不影响有米小程序的产品展示」。
原来的 off_sale 是全局一档，谁关都两端一起停——渠道运营停 B 端，把客户小程序也停了；
反过来内容运营想只停客户端根本没有开关（C 端产品管理里那一列是只读的）。
拆成 off_b / off_c，两端各管各的：停 C 端不碰门店/有米，停 B 端不碰客户端。
"""
import os
import sqlite3

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visaops.db")
c = sqlite3.connect(DB)
cols = [r[1] for r in c.execute("pragma table_info(sup_product)")]
for col in ("off_b", "off_c"):
    if col in cols:
        print(col, "已存在")
    else:
        c.execute("alter table sup_product add column %s integer default 0" % col)
        c.execute("update sup_product set %s=0 where %s is null" % (col, col))
        print("已添加 sup_product.%s" % col)
# 迁移历史数据：原 off_sale=1 是「全局停售」，等价于两端都停
if "off_sale" in cols:
    n = c.execute("update sup_product set off_b=1 where off_sale=1").rowcount
    c.execute("update sup_product set off_c=1 where off_sale=1")
    if n:
        print("已迁移 %d 条全局停售 → 两端均停" % n)
c.commit()
print("done")