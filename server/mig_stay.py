# -*- coding: utf-8 -*-
"""停留期改区间 + 时间单位（唐美芳 2026-08-31：
「ubk新增产品时，停留天数需支持区间，可选择天/月/年时间单位」）。

原来只有一个 stay_days（整数天）。实际签证很多是区间——
申根一般写「每 180 天内累计不超过 90 天」，日本三年多次是「单次不超过 30 天」，
澳洲 600 类别常见「3 个月 / 6 个月 / 12 个月」三档。一个数字表达不了。

stay_days 保留不删：C 端、CSP、UOM 十几处展示还在读它，
迁移后按单位折算成天写回去，老代码不至于突然拿不到值。
"""
import sqlite3, os
db = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'visaops.db')
c = sqlite3.connect(db)


def addcol(t, col, decl):
    if col not in [r[1] for r in c.execute("pragma table_info(%s)" % t)]:
        c.execute("alter table %s add column %s %s" % (t, col, decl))
        print("+ %s.%s" % (t, col))


addcol('product', 'stay_min', 'INTEGER')
addcol('product', 'stay_max', 'INTEGER')
addcol('product', 'stay_unit', "TEXT DEFAULT 'day'")

n = 0
for pid, d, mn in c.execute("select id, stay_days, stay_min from product").fetchall():
    if mn is not None:
        continue
    # 存量都是「单次不超过 N 天」，落成 min=max=N
    c.execute("update product set stay_min=?, stay_max=?, stay_unit='day' where id=?",
              (d or 0, d or 0, pid))
    n += 1
c.commit()
print("回填 %d 条" % n)
for r in c.execute("select country,visa_type,stay_min,stay_max,stay_unit from product"):
    print("  %-6s %-24s %s–%s %s" % r)
