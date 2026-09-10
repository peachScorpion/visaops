#!/usr/bin/env python3
"""sup_product 加 off_sale：平台侧的启售 / 停售开关。

唐美芳 2026-09-09：「签证产品管理列表的销售状态可以操作开关控制启停售状态」。
她给的众信团队游列表里那一列就是个开关。
签证这边原来只有「供应商上架状态 + 两端审核结论」，没有平台强制停售这一层——
产品出问题（价格谈崩、材料要求变了、供应商跑路）时，运营只能去撤销上架，
那会连审核结论一起清掉，恢复时要重审一遍。
off_sale 是独立的一层：**不动审核结论，只管现在还卖不卖**。
"""
import os
import sqlite3

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visaops.db")
c = sqlite3.connect(DB)
cols = [r[1] for r in c.execute("pragma table_info(sup_product)")]
if "off_sale" in cols:
    print("off_sale 已存在")
else:
    c.execute("alter table sup_product add column off_sale integer default 0")
    c.execute("update sup_product set off_sale=0 where off_sale is null")
    print("已添加 sup_product.off_sale")
c.commit()
print("done")
