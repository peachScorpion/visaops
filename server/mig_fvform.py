"""给 fullver 加 formver_id：清单版本挂到国家签证表模板下面。

清单版本本来就是「这个国家这类签证要交哪些材料」，而材料从哪来是表模板决定的——
表里标成证件识别的字段，其来源载体就是客户必须交的证件。两者之间原来只有口头约定，
没有字段，运营建完清单没法回头查它对应哪张表。

已有数据按 国家 + 签证类型 回填；对不上的留空，运营编辑时补。
"""
import sqlite3
import os

DB = os.path.join(os.path.dirname(__file__), "visaops.db")
c = sqlite3.connect(DB)
c.row_factory = sqlite3.Row

cols = [r[1] for r in c.execute("pragma table_info(fullver)")]
if "formver_id" not in cols:
    c.execute("alter table fullver add column formver_id INTEGER")
    print("added fullver.formver_id")
else:
    print("fullver.formver_id already exists")

hit = 0
for f in c.execute("select * from fullver where formver_id is null").fetchall():
    m = c.execute(
        "select id from formver where country=? and ifnull(visa_type,'')=ifnull(?,'')"
        " order by active desc, id desc limit 1",
        (f["country"], f["visa_type"])).fetchone()
    if not m:
        m = c.execute("select id from formver where country=? order by active desc, id desc"
                      " limit 1", (f["country"],)).fetchone()
    if m:
        c.execute("update fullver set formver_id=? where id=?", (m["id"], f["id"]))
        hit += 1
        print("  %s %s · %s -> formver #%d" % (f["ver_no"], f["country"], f["visa_type"], m["id"]))
    else:
        print("  %s %s · %s -> 无匹配表模板，留空" % (f["ver_no"], f["country"], f["visa_type"]))
c.commit()
print("backfilled %d" % hit)
