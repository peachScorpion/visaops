#!/usr/bin/env python3
"""sup_product 加 subtitle / share_text：产品审核页上运营要能改的对客文案。

唐美芳 2026-09-09 给了众信现有「产品运营 · 审核」页的截图：
上半是供应商报上来的基础信息（只读），下半是运营可编辑的对客字段
（产品名称、产品副标题、产品标签、宣传视频/海报、分享推广语），底部才是驳回/通过。
签证这边原来只有 name / feature / svc_tags / hero_img，缺「副标题」和「分享推广语」。
"""
import os
import sqlite3

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visaops.db")
c = sqlite3.connect(DB)
cols = [r[1] for r in c.execute("pragma table_info(sup_product)")]
for col in ("subtitle", "share_text"):
    if col in cols:
        print("%s 已存在" % col)
        continue
    c.execute("alter table sup_product add column %s text" % col)
    print("已添加 sup_product.%s" % col)
c.commit()
print("done")
