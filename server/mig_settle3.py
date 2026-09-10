#!/usr/bin/env python3
"""UBK 结算管理三张单：预付款 / 付款退款 / 账单。
唐美芳 2026-08-31 给了众信「结算管理 › 付款管理」的三张截图，要求按截图复刻列表页。

三张单的共同骨架：申请状态（平台审申请）+ 发票状态（平台审发票）+ 付款状态（财务打没打款），
三条线各自独立 —— 这是众信付款管理的核心结构，不能压成一个状态。
"""
import sqlite3, random
from datetime import datetime, timedelta
c = sqlite3.connect("visaops.db"); c.row_factory = sqlite3.Row
random.seed(20260831)

c.executescript("""
CREATE TABLE IF NOT EXISTS prepay (
  id INTEGER PRIMARY KEY,
  no TEXT UNIQUE NOT NULL,            -- Y26xxxxxxxxx
  sup_org INTEGER NOT NULL,
  pay_company TEXT,                   -- 付款公司（平台侧实际付款主体）
  ord_count INTEGER DEFAULT 1,
  amount REAL DEFAULT 0,              -- 申请预付金额
  apply_status TEXT DEFAULT 'pending',   -- pending 待审核 / approved 已审核 / rejected 已驳回
  apply_at TEXT, apply_by TEXT,
  reject_by TEXT, reject_at TEXT,
  invoice_status TEXT DEFAULT 'pending', -- pending 待审核 / approved 已审核 / none 未提交
  invoice_at TEXT,
  pay_status TEXT DEFAULT 'unpaid',      -- unpaid 未付款 / paid 已付款
  pay_at TEXT, receipt_img TEXT,         -- 水单
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS bill (
  id INTEGER PRIMARY KEY,
  no TEXT UNIQUE NOT NULL,            -- ZD26xxxxxxxxx
  sup_org INTEGER NOT NULL,
  pay_company TEXT,
  ord_count INTEGER DEFAULT 1,
  total_amount REAL DEFAULT 0,        -- 账单总金额
  received_amount REAL DEFAULT 0,     -- 已收金额（此前预付冲抵的部分）
  claim_amount REAL DEFAULT 0,        -- 请款金额 = 总额 - 已收
  apply_status TEXT DEFAULT 'pending',
  apply_at TEXT, apply_by TEXT, reject_by TEXT,
  invoice_status TEXT DEFAULT 'none',    -- none 未提交 / pending 待审核 / approved 已审核 / rejected 已驳回
  invoice_at TEXT, invoice_reject_by TEXT,
  payable_amount REAL DEFAULT 0,      -- 应付
  paid_amount REAL DEFAULT 0,         -- 已付
  pay_status TEXT DEFAULT 'unpaid',   -- unpaid 未付款 / part 部分付款 / paid 已付款
  pay_at TEXT,
  created_at TEXT
);
""")
# 付款退款单补齐截图里的字段
for n, d in [("biz_pay_no", "TEXT"), ("recv_company", "TEXT"),
             ("invoice_exchange", "INTEGER DEFAULT 0"), ("invoice_status", "TEXT"),
             ("apply_status", "TEXT DEFAULT 'pending'"), ("apply_by", "TEXT"),
             ("ord_count", "INTEGER DEFAULT 1")]:
    cols = {r[1] for r in c.execute("PRAGMA table_info(sup_refund)")}
    if n not in cols:
        c.execute("ALTER TABLE sup_refund ADD COLUMN %s %s" % (n, d))

SUPS = list(c.execute("select id,name,short from org where kind='supplier'"))
PAYCO = ["众信旅游国际旅行社有限公司", "北京众信悠哉国际旅行社有限公司"]
WHO = ["王其宪", "解春香", "张蒙", "邹玉杰"]

def ts(days_ago, h=9):
    return (datetime(2026, 8, 31, h, random.randint(0, 59), random.randint(0, 59))
            - timedelta(days=days_ago)).strftime("%Y-%m-%d %H:%M:%S")

# ---------- 预付款单 ----------
if not list(c.execute("SELECT 1 FROM prepay LIMIT 1")):
    rows_ = []
    plan = [("approved", "approved", "paid"), ("approved", "approved", "paid"),
            ("approved", "approved", "unpaid"), ("pending", "pending", "unpaid"),
            ("rejected", "pending", "unpaid"), ("approved", "pending", "unpaid"),
            ("approved", "approved", "paid"), ("pending", "none", "unpaid")]
    for i, (ap, iv, ps) in enumerate(plan):
        d = 2 + i * 3
        sup = SUPS[i % len(SUPS)]
        amt = random.choice([1176, 5880, 1232, 1000, 2059, 950, 200, 2400])
        rows_.append(("Y2608%02d%06d" % (27 - i, 17 - i), sup["id"], PAYCO[i % 2],
                      random.randint(1, 3), float(amt), ap, ts(d), WHO[i % 4],
                      WHO[(i + 1) % 4] if ap == "rejected" else None,
                      ts(d - 1) if ap == "rejected" else None,
                      iv, ts(d - 1) if iv == "approved" else None,
                      ps, ts(d - 1) if ps == "paid" else None,
                      "Y%s-水单.jpg" % (17 - i) if ps == "paid" else None, ts(d)))
    c.executemany("""INSERT INTO prepay(no,sup_org,pay_company,ord_count,amount,apply_status,
                     apply_at,apply_by,reject_by,reject_at,invoice_status,invoice_at,
                     pay_status,pay_at,receipt_img,created_at)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", rows_)

# ---------- 账单 ----------
if not list(c.execute("SELECT 1 FROM bill LIMIT 1")):
    rows_ = []
    plan = [("approved", "approved", 4704.0, 4704.0, "paid"),
            ("approved", "none", 5880.0, 5880.0, "paid"),
            ("approved", "approved", 2059.0, 2059.0, "paid"),
            ("approved", "approved", 950.0, 0.0, "unpaid"),
            ("rejected", "pending", 65.8, 0.0, "unpaid"),
            ("approved", "rejected", 97.0, 0.0, "unpaid"),
            ("approved", "approved", 3200.0, 1600.0, "part"),
            ("pending", "none", 1780.0, 0.0, "unpaid")]
    for i, (ap, iv, payable, paid, ps) in enumerate(plan):
        d = 3 + i * 4
        sup = SUPS[i % len(SUPS)]
        total = payable + (1176.0 if i == 0 else 0.0)
        rows_.append(("ZD2608%02d%06d" % (27 - i, 244 - i * 5), sup["id"], PAYCO[i % 2],
                      random.randint(1, 4), total, total - payable, payable,
                      ap, ts(d), WHO[i % 4], WHO[(i + 2) % 4] if ap == "rejected" else None,
                      iv, ts(d - 1) if iv in ("approved", "rejected") else None,
                      WHO[(i + 3) % 4] if iv == "rejected" else None,
                      payable, paid, ps, ts(d - 2) if ps != "unpaid" else None, ts(d)))
    c.executemany("""INSERT INTO bill(no,sup_org,pay_company,ord_count,total_amount,
                     received_amount,claim_amount,apply_status,apply_at,apply_by,reject_by,
                     invoice_status,invoice_at,invoice_reject_by,payable_amount,paid_amount,
                     pay_status,pay_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                  rows_)

# ---------- 付款退款单补字段 ----------
for i, r in enumerate(list(c.execute("SELECT * FROM sup_refund ORDER BY id"))):
    pp = list(c.execute("SELECT no FROM prepay WHERE sup_org=? ORDER BY id LIMIT 1", (r["sup_org"],)))
    org = list(c.execute("SELECT name FROM org WHERE id=?", (r["sup_org"],)))
    c.execute("""UPDATE sup_refund SET biz_pay_no=?, recv_company=?, invoice_exchange=?,
                 invoice_status=?, apply_status=?, apply_by=?, ord_count=1 WHERE id=?""",
              (pp[0][0] if pp else None, org[0][0] if org else None,
               1 if i % 3 == 0 else 0,
               "approved" if i % 3 == 0 else None,
               "approved" if r["status"] in ("confirmed", "done") else "pending",
               WHO[i % 4], r["id"]))
c.commit()

for t in ("prepay", "bill", "sup_refund"):
    print(t, list(c.execute("select count(*) from %s" % t))[0][0], "条")
print("预付款状态:", dict(c.execute("select apply_status||'/'||pay_status,count(*) from prepay group by 1")))
print("账单状态:", dict(c.execute("select apply_status||'/'||pay_status,count(*) from bill group by 1")))
c.close()
