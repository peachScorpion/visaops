# -*- coding: utf-8 -*-
"""材料样例库加「适用国家 / 签证类型」。

唐美芳 2026-09-07：「材料样例库应该加上国家字段吧，因为不同国家的护照样例是不一样的，
你看看签证类型是不是也需要加上」。

两个字段都**可留空**，空＝通用（全部国家 / 该国全部签证类型）。
理由：身份证复印件、银行流水这类范本各国通用，强制填国家会逼运营为每个国家复制一份；
而照片规格图、确认页样例这类确实按国家（甚至按签证类型）不同，必须能区分。
"""
import sqlite3
import os

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visaops.db")
c = sqlite3.connect(DB)
cols = {r[1] for r in c.execute("pragma table_info(sample_tpl)")}
for col in ("country", "visa_type"):
    if col not in cols:
        c.execute("alter table sample_tpl add column %s TEXT" % col)
        print("added", col)

# 存量回填：只回填明确带国别的两条，其余留空按通用处理，
# 不替运营猜——猜错了比留空更难发现。
FILL = {"美签照片规格样例": ("美国", ""),
        "DS-160 确认页样例": ("美国", "")}
for name, (country, vt) in FILL.items():
    n = c.execute("update sample_tpl set country=?,visa_type=? where name=? and"
                  " (country is null or country='')", (country, vt, name)).rowcount
    if n:
        print("filled", name, "->", country)
c.execute("update sample_tpl set country='' where country is null")
c.execute("update sample_tpl set visa_type='' where visa_type is null")
c.commit()
for r in c.execute("select id,name,mat_name,country,visa_type from sample_tpl order by id"):
    print(r)
