#!/usr/bin/env python3
"""扩大 DS-160 默认值覆盖：把客人「几乎都答同一个答案」的格子改成系统默认。

唐美芳 2026-09-02：「尽量少让客人填，不然客人会烦，这个产品的差价就是在这种服务里。
其他能系统自动就自动，只是最终人工在正式提交前，复核下。」

判断标准是「绝大多数申请人的答案固定，且答错的后果可控」：
  · 曾用名 / SSN / 美国纳税人识别号 / 护照遗失记录  → 无
  · 其他邮箱 / 社交媒体 / 在美亲属 / 父母在美情况   → 否
**明确不默认的两格**（保持问客人）：
  · 是否曾经去过美国
  · 是否持有过美国签证
移民局有出入境与签证底档，去过却填没去过属于虚假陈述，
后果比拒签重得多（可能触发 212(a)(6)(C)(i) 终身禁入）。这两格必须客人本人确认。
"""
import sqlite3, sys

# (匹配关键词, 默认值)
RULES = [
    ("曾用名", "无"),
    ("社会安全号码", "无"),
    ("纳税人识别号", "无"),
    ("护照遗失", "无"),
    ("其他电子邮件地址", "否"),
    ("社交媒体账号", "无"),
    ("社交媒体标识符", "无"),
    ("其他网站或应用程序", "否"),
    ("直系亲属", "否"),
    ("其他亲戚", "否"),
    ("父母在美情况", "否"),
]
NEVER = ["是否曾经去过美国", "是否持有过美国签证"]

db = sys.argv[1] if len(sys.argv) > 1 else "visaops.db"
c = sqlite3.connect(db); c.row_factory = sqlite3.Row

cols = [r["name"] for r in c.execute("pragma table_info(form_field)")]
if "dft_val" not in cols:
    c.execute("alter table form_field add column dft_val TEXT")
    print("form_field.dft_val 已新增")

# 已有的 dft_no 高风险题：默认值仍是「否」，显式写进 dft_val
n0 = c.execute("update form_field set dft_val='否' where dft_no=1 and "
               "(dft_val is null or dft_val='')").rowcount
print("已有高风险默认题回填「否」：%d 格" % n0)

hit = 0
for kw, val in RULES:
    rows = list(c.execute("select id,name,formver_id from form_field where name like ?",
                          ("%" + kw + "%",)))
    for r in rows:
        if any(x in r["name"] for x in NEVER):
            continue
        c.execute("update form_field set dft_no=1,dft_val=? where id=?", (val, r["id"]))
        hit += 1
        print("  默认「%s」← %s" % (val, r["name"][:44]))

# 明确保留问客人的两格：确保没被误设
for x in NEVER:
    c.execute("update form_field set dft_no=0,dft_val=null where name like ?", ("%" + x + "%",))

c.commit()
print()
print("本次新增默认 %d 格" % hit)
for r in c.execute("select formver_id,count(*) n from form_field where dft_no=1 group by formver_id"):
    print("  表模板 %s：默认题共 %d 格" % (r["formver_id"], r["n"]))
print()
print("保持问客人（不默认）：")
for r in c.execute("select name from form_field where dft_no=0 and risk=1"):
    print("  ·", r["name"][:50])
