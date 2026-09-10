"""建签证政策内容表，并灌一批真实的政策条目。

产品回答「这条产品怎么卖」，政策回答「这个国家现在什么规矩」。后者跟供应商、报价
都无关，变动频率高得多，所以单独一张表由总部运营维护，B 端 C 端读同一份。

种子内容只写公开可查、且相对稳定的口径（免签停留期、是否需面签/采指纹、电子签形态），
不编具体日期的「最新公告」——那种一旦过期就是错的，得由运营自己维护。
"""
import sqlite3
import os

DB = os.path.join(os.path.dirname(__file__), "visaops.db")
c = sqlite3.connect(DB)
c.executescript("""
CREATE TABLE IF NOT EXISTS visa_policy (
  id INTEGER PRIMARY KEY,
  country TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  body TEXT,
  stay TEXT,
  effect_at TEXT,
  source TEXT,
  source_url TEXT,
  scope TEXT DEFAULT 'all',
  status TEXT DEFAULT 'draft',
  pin INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_policy_country ON visa_policy(country, status);
""")

if c.execute("select count(*) from visa_policy").fetchone()[0]:
    print("already seeded, skip")
else:
    NOW = "2026-08-27 16:40:00"
    # (country, kind, title, summary, body, stay, source, scope, pin)
    ROWS = [
        ("泰国", "free", "泰国对中国公民免签",
         "持普通护照免签入境，单次停留不超过 30 天",
         "中泰互免签证协定生效后，持中国普通护照可免签入境泰国旅游、探亲、商务，"
         "单次停留不超过 30 天。仍需备齐往返机票、酒店订单与足够资金证明，"
         "入境官有权查验；停留超过 30 天或从事工作、长期学习仍须提前办妥相应签证。",
         "30 天", "中泰互免签证协定", "all", 1),
        ("新加坡", "free", "新加坡对中国公民免签",
         "持普通护照免签入境，单次停留不超过 30 天",
         "持中国普通护照可免签入境新加坡，单次停留不超过 30 天，用于旅游、探亲、商务考察。"
         "建议入境前完成新加坡入境卡（SG Arrival Card）线上填报。",
         "30 天", "中新互免签证协定", "all", 0),
        ("马来西亚", "free", "马来西亚对中国公民免签",
         "免签入境，单次停留不超过 30 天",
         "持中国普通护照可免签入境马来西亚，单次停留不超过 30 天。"
         "入境前需完成马来西亚数字入境卡（MDAC）线上申报。",
         "30 天", "马来西亚移民局公告", "all", 0),
        ("日本", "notice", "日本签证须经指定代办机构递交",
         "个人不可直接向使领馆递交，须通过指定旅行社送签",
         "日本驻华使领馆不接受个人直接递交旅游签证申请，必须通过其指定的代办机构送签。"
         "领区按户籍或居住地划分，跨领区送签会被退件。三年、五年多次签证对过往赴日记录、"
         "职业与收入有额外要求，具体以受理时使领馆口径为准。",
         "", "日本国驻华大使馆", "all", 0),
        ("韩国", "notice", "韩国签证按领区受理，需指定代办",
         "按户籍/居住地划分领区，须经指定代办机构递交",
         "韩国签证按申请人户籍或长期居住地划分领区受理，需通过指定代办机构递交。"
         "济州岛单独执行免签政策：直飞济州岛可免签入境停留 30 天，但不得经由韩国本土中转。",
         "", "韩国驻华使领馆", "all", 0),
        ("美国", "notice", "美国签证须本人面签并采集指纹",
         "面签不可代办，需本人到馆；DS-160 表格信息与面签回答须一致",
         "美国非移民签证要求申请人本人到使领馆面谈并现场采集十指指纹（部分符合条件的续签可免面谈）。"
         "DS-160 在线申请表提交后不可修改，表内信息与面签时的回答必须一致，"
         "出入不一致是常见拒签原因。面签预约号紧张，建议确定行程后尽早排期。",
         "", "美国驻华使领馆", "all", 1),
        ("英国", "notice", "英国签证需现场采集生物信息",
         "线上填表后须到签证申请中心录指纹与拍照",
         "英国签证在线填表并缴费后，需本人到英国签证申请中心（VFS）现场采集指纹与面部照片。"
         "材料以在线申请时提交的电子版为准，中心只核验身份并采集生物信息。",
         "", "英国签证及移民局 UKVI", "all", 0),
        ("澳大利亚", "evisa", "澳大利亚旅游签证为电子签",
         "全程线上递交，签发电子签证函，护照上不贴签",
         "澳大利亚访客签证（600 类）通过 ImmiAccount 线上递交，审核通过后签发电子签证函，"
         "护照上不加贴签证页。部分申请会被要求补交体检或额外材料，收到补料通知后须在限期内完成。",
         "", "澳大利亚内政事务部", "all", 0),
        ("*", "notice", "护照有效期与空白页通用要求",
         "多数目的地要求护照有效期 6 个月以上并留有 2 页空白",
         "绝大多数目的地要求入境时护照剩余有效期不少于 6 个月，并保留至少 2 页连续空白签证页"
         "（备注页不算）。护照剩余有效期不足、空白页不够是最常见的送签前退件原因，"
         "收客时请第一时间核对。",
         "", "行业通用口径", "all", 0),
        ("*", "notice", "拒签记录须如实申报",
         "隐瞒既往拒签史会显著提高再次拒签概率",
         "各国签证申请表基本都会询问既往拒签、遣返、逾期滞留记录。这些记录在使领馆系统内可查，"
         "隐瞒一旦被发现，后果比如实申报严重得多。收客时请主动问清客人的历史出入境与拒签情况，"
         "有拒签史的应在材料里针对性补充说明。",
         "", "行业通用口径", "b", 0),
    ]
    for r in ROWS:
        c.execute(
            "insert into visa_policy(country,kind,title,summary,body,stay,source,scope,pin,"
            "status,created_at,updated_at,updated_by) values(?,?,?,?,?,?,?,?,?,"
            "'published',?,?,'系统初始化')",
            (r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], NOW, NOW))
    print("seeded %d policies" % len(ROWS))

c.commit()
for r in c.execute("select kind,scope,count(*) from visa_policy group by 1,2"):
    print(r)
