# -*- coding: utf-8 -*-
"""签证产品加「产品管理人员」。

唐美芳 2026-09-15：参照 B 端旅游产品管理列表的筛选维度，签证产品要补「产品管理人员」
字段——旅游那边的产品有明确的责任人（产品管理人员），签证这边原来没有对应字段，
产品出了事不知道找谁。字段存姓名（取自众信内部员工），可留空，空＝未指派。
"""
import sqlite3
import os

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visaops.db")
c = sqlite3.connect(DB)
cols = {r[1] for r in c.execute("pragma table_info(sup_product)")}
if "manager" not in cols:
    c.execute("alter table sup_product add column manager TEXT")
    print("added sup_product.manager")

c.execute("update sup_product set manager='' where manager is null")
c.commit()
for r in c.execute("select id,name,manager from sup_product order by id desc limit 10"):
    print(r)