# -*- coding: utf-8 -*-
"""材料样例的适用范围由单值改多值。

唐美芳 2026-09-07：「材料样例库里的适用范围，应该是多选框，现在是单选不符合业务侧使用」。
业务上一份范本常常同时适用多个国家（申根各国的在职证明、日韩通用的照片规格），
单值会逼运营把同一份文件复制很多遍，改一次要改很多条。

country / visa_type（TEXT，单值）→ countries / visa_types（TEXT，存 JSON 数组）。
空数组＝通用：countries 空＝不限国家；visa_types 空＝所选国家的全部签证类型。
"""
import json
import os
import sqlite3

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visaops.db")
c = sqlite3.connect(DB)
cols = {r[1] for r in c.execute("pragma table_info(sample_tpl)")}
for col in ("countries", "visa_types"):
    if col not in cols:
        c.execute("alter table sample_tpl add column %s TEXT default '[]'" % col)
        print("added", col)

if "country" in cols:
    for r in c.execute("select id,country,visa_type from sample_tpl").fetchall():
        sid, country, vt = r
        c.execute("update sample_tpl set countries=?,visa_types=? where id=?",
                  (json.dumps([country] if country else [], ensure_ascii=False),
                   json.dumps([vt] if vt else [], ensure_ascii=False), sid))
    # 单值列不再使用，直接删掉，免得两套字段并存日后取错
    for col in ("country", "visa_type"):
        c.execute("alter table sample_tpl drop column %s" % col)
        print("dropped", col)

c.execute("update sample_tpl set countries='[]' where countries is null")
c.execute("update sample_tpl set visa_types='[]' where visa_types is null")
c.commit()
for r in c.execute("select id,name,countries,visa_types from sample_tpl order by id"):
    print(r)
