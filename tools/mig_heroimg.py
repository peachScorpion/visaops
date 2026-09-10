"""给供应商产品加一个头图字段。

唐美芳 2026-09-01 验收：「前端是有展示产品头图的，但是 ubk 上品的时候
没有上传图片的位置」——C 端产品页的大图一直是按国家写死的一张风景照
（v-cust.js 的 DIMG 映射），供应商传不了自己的图。
加 hero_img 存图片 URL，为空时仍回落到那张国家默认图，老产品不受影响。
"""
import os
import sqlite3

DB = os.path.join(os.path.dirname(__file__), "..", "server", "visaops.db")
c = sqlite3.connect(DB)
cols = [r[1] for r in c.execute("pragma table_info(sup_product)")]
if "hero_img" in cols:
    print("hero_img 已存在，跳过")
else:
    c.execute("alter table sup_product add column hero_img text default ''")
    c.commit()
    print("已加列 sup_product.hero_img")
