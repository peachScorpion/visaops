# -*- coding: utf-8 -*-
"""签证类型改枚举 + 供应商自有产品编码。
唐美芳 2026-08-31：
 1「ubk产品管理里签证类型为什么还是手动输入的，是不是应该下拉选择」
 2「ubk上品的时候，应该预留1个供应商产品编码，以防万一外部供应商有自己的产品编码，
    能够和我们系统里的对应上」

签证类型拆两层，理由见 web/js/core.js VISA_CATS 处注释。
"""
import sqlite3, os
db = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'visaops.db')
c = sqlite3.connect(db)

def addcol(t, col, decl):
    if col not in [r[1] for r in c.execute("pragma table_info(%s)" % t)]:
        c.execute("alter table %s add column %s %s" % (t, col, decl))
        print("+ %s.%s" % (t, col))

addcol('product', 'visa_cat', 'TEXT')
addcol('sup_product', 'vendor_code', 'TEXT')

# 存量 visa_type 归类。历史值是手输的，写法五花八门——这正是要改成下拉的原因。
MAP = [
    ('学生', '留学'), ('留学', '留学'), ('F1', '留学'), ('X1', '留学'), ('X2', '留学'),
    ('工作', '工作'), ('劳务', '工作'), ('Z签', '工作'),
    ('商务', '商务'), ('B1', '商务'),
    ('探亲', '探亲访友'), ('访友', '探亲访友'), ('团聚', '探亲访友'),
    ('EVUS', 'EVUS登记更新'), ('ESTA', 'ESTA登记更新'),
    ('移民', '转移'), ('定居', '转移'),
    ('旅游', '旅游'), ('访客', '旅游'), ('访问', '旅游'), ('观光', '旅游'),
]
def guess(vt):
    # B1/B2 是商务+旅游合一签，中国客人绝大多数按旅游办，归旅游。
    if 'B1/B2' in vt or 'B2' in vt: return '旅游'
    for k, v in MAP:
        if k in vt: return v
    return '其他'

n = 0
for pid, vt, cat in c.execute("select id, visa_type, visa_cat from product").fetchall():
    if cat: continue
    g = guess(vt)
    c.execute("update product set visa_cat=? where id=?", (g, pid))
    print("  %-28s → %s" % (vt, g)); n += 1

# 供应商编码：演示数据填上，让「对码」这件事在页面上看得见。
# 真实场景是外部供应商自己的编码，格式各家不同，故意做成不同风格。
DEMO = {'优耐德': 'UND-{:04d}', '竹园国旅': 'ZY{:05d}', '奇迹旅行': 'QJ-VISA-{:03d}'}
i = {}
for sid, org in c.execute("""select s.id, o.name from sup_product s
                             left join org o on o.id=s.org_id
                             where s.vendor_code is null or s.vendor_code=''""").fetchall():
    f = None
    for k, v in DEMO.items():
        if org and k in org: f = v; break
    if not f: continue
    i[f] = i.get(f, 0) + 1
    c.execute("update sup_product set vendor_code=? where id=?", (f.format(i[f] * 7 + 101), sid))

c.commit()
print("归类 %d 条；供应商编码 %d 条" %
      (n, c.execute("select count(*) from sup_product where vendor_code<>''").fetchone()[0]))
print("分布:", c.execute("select visa_cat,count(*) from product group by visa_cat").fetchall())
