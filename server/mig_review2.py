"""把 sup_product 的单条审核状态拆成 B 端 / C 端两条。

原来一个 review 列同时决定「在 CSP 展示」和「在 C 端小程序展示」，但这两件事
在众信是两拨运营各审各的：B 端审的是给门店/同业看的结算价与渠道口径，
C 端审的是给消费者看的文案与合规。一条状态没法表达「B 端已上架、C 端还在改」。

拆成 review_b / review_c 两套（结论 + 备注 + 审核人 + 时间）。
回填：老的 review 结论落到该产品当时实际勾选的上架端上，没勾的端置 none，
不给未曾审过的端凭空补一个「通过」。
"""
import sqlite3
import os

DB = os.path.join(os.path.dirname(__file__), "visaops.db")
c = sqlite3.connect(DB)
cols = [r[1] for r in c.execute("pragma table_info(sup_product)")]
added = []
for t in ("b", "c"):
    for suf, typ in (("", "TEXT DEFAULT 'none'"), ("_note", "TEXT"),
                     ("_by", "TEXT"), ("_at", "TEXT")):
        col = "review_%s%s" % (t, suf)
        if col not in cols:
            c.execute("alter table sup_product add column %s %s" % (col, typ))
            added.append(col)

if added:
    for t in ("b", "c"):
        c.execute(
            "update sup_product set review_{0}=case when to_{0}=1 then review else 'none' end,"
            " review_{0}_note=case when to_{0}=1 then review_note end,"
            " review_{0}_by=case when to_{0}=1 then review_by end,"
            " review_{0}_at=case when to_{0}=1 then review_at end".format(t))
    print("added: " + ", ".join(added))
else:
    print("already migrated")
c.commit()
for r in c.execute("select to_b,review_b,to_c,review_c,count(*) from sup_product"
                   " group by 1,2,3,4"):
    print(r)
