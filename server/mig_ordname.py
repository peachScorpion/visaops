#!/usr/bin/env python3
"""订单存一份产品名快照（唐美芳 2026-09-04 放开「签证名称、名称后缀随时可改」之后的必备保护）。

改名之前，产品名在系统里只有一处真源 sup_product.name，订单展示一律现取。
放开改名后，供应商今天把产品改个名，三个月前那张订单在列表、对账单、合同上
显示的就是新名字——客人手里的合同和系统里的对不上，客服无从解释。

所以下单时把当时的产品名写进 ord.product_name，展示优先用它；
存量订单按当前名回填（那就是它们成交时的名字，此前不允许改名）。
"""
import sqlite3, sys
db = sys.argv[1] if len(sys.argv) > 1 else "visaops.db"
c = sqlite3.connect(db); c.row_factory = sqlite3.Row
cols = [r["name"] for r in c.execute("pragma table_info(ord)")]
if "product_name" not in cols:
    c.execute("alter table ord add column product_name TEXT")
    print("已加列 ord.product_name")
n = c.execute(
    "update ord set product_name=(select name from sup_product where id=ord.sup_product_id)"
    " where ifnull(product_name,'')=''").rowcount
c.commit()
print("回填 %d 张订单的产品名快照" % n)
print("抽查:", [dict(r) for r in c.execute(
    "select no,product_name from ord order by id desc limit 3")])
