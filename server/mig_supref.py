#!/usr/bin/env python3
"""供应商预付款退款单（UBK「结算管理 › 预付款退款管理」）。
唐美芳 2026-08-31 给的 UBK 菜单结构里有这一项。

补的是一个真实缺口：客户退款出账后，平台已经对供应商挂的应付账款（payable）原来没有任何冲减——
钱退给客户了，账还挂在供应商名下。这张单就是「供应商该退回平台多少结算款」。

金额口径按办签进度分档，跟客户退款同一个逻辑（谁的成本已经真实发生就不退）：
  未开始办（P1-P3）      → 结算款全额退回
  填表 / 预约中（P4-P6） → 退服务费，签证费已代缴的部分不退
  已递交使领馆（P7 起）  → 签证费不退，服务费按比例退一半（专员已做完大部分工作）
"""
import sqlite3
c = sqlite3.connect("visaops.db"); c.row_factory = sqlite3.Row

c.execute("""CREATE TABLE IF NOT EXISTS sup_refund (
  id INTEGER PRIMARY KEY,
  no TEXT UNIQUE NOT NULL,          -- SR-xxxxxxxx
  ord_id INTEGER NOT NULL,
  sup_org INTEGER NOT NULL,
  refund_id INTEGER,                -- 关联的客户退款单
  payable_id INTEGER,               -- 关联的应付挂账
  settle_amount REAL DEFAULT 0,     -- 原结算金额
  amount REAL DEFAULT 0,            -- 应退回平台的金额
  keep_amount REAL DEFAULT 0,       -- 供应商可留存的（已发生成本）
  progress TEXT,                    -- 生成时的办签进度，决定分档
  reason TEXT,
  status TEXT DEFAULT 'pending',    -- pending 待供应商确认 / confirmed 已确认待退款 / done 已退回 / rejected 有异议
  note TEXT,
  confirm_at TEXT, done_at TEXT,
  created_at TEXT
)""")
c.execute("CREATE INDEX IF NOT EXISTS ix_supref ON sup_refund(sup_org, status)")

PORDER = ["P%d" % i for i in range(1, 11)]

def split(settle, visa_fee, progress):
    """返回 (应退回, 供应商留存)"""
    i = PORDER.index(progress) if progress in PORDER else 0
    if i <= 2:                       # P1-P3 还没实质开工
        return round(settle, 2), 0.0
    if i <= 5:                       # P4-P6 填表 / 预约，签证费多半已代缴
        keep = min(visa_fee, settle)
        return round(settle - keep, 2), round(keep, 2)
    keep = min(visa_fee, settle) + (settle - min(visa_fee, settle)) * 0.5
    return round(settle - keep, 2), round(keep, 2)

if not list(c.execute("SELECT 1 FROM sup_refund LIMIT 1")):
    n = 0
    for rf in c.execute("SELECT * FROM refund WHERE status='done' ORDER BY id"):
        o = c.execute("SELECT * FROM ord WHERE id=?", (rf["ord_id"],)).fetchone()
        pa = c.execute("SELECT * FROM payable WHERE ord_id=?", (o["id"],)).fetchone()
        if not pa:
            continue
        sp = c.execute("SELECT * FROM sup_product WHERE id=?", (o["sup_product_id"],)).fetchone()
        pk = c.execute("SELECT * FROM pkg WHERE id=?", (o["pkg_id"],)).fetchone()
        ap = c.execute("SELECT progress FROM applicant WHERE ord_id=? ORDER BY id LIMIT 1",
                       (o["id"],)).fetchone()
        prog = ap["progress"] if ap else "P1"
        amt, keep = split(pa["amount"], pk["visa_fee"] if pk else 0, prog)
        n += 1
        st = ["done", "confirmed", "pending"][n % 3]
        c.execute("""INSERT INTO sup_refund(no,ord_id,sup_org,refund_id,payable_id,settle_amount,
                     amount,keep_amount,progress,reason,status,confirm_at,done_at,created_at)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                  ("SR-2608%04d" % (1000 + n), o["id"], pa["sup_org"], rf["id"], pa["id"],
                   pa["amount"], amt, keep, prog,
                   "客户退款（%s），按办签进度冲减结算款" % rf["no"], st,
                   rf["fin_at"] if st != "pending" else None,
                   rf["fin_at"] if st == "done" else None,
                   rf["fin_at"] or rf["created_at"]))
    c.commit()

print("预付款退款单：", list(c.execute("select count(*) from sup_refund"))[0][0], "张")
for r in c.execute("""select sr.no,o.no ord_no,sr.progress,sr.settle_amount,sr.amount,
                             sr.keep_amount,sr.status
                      from sup_refund sr join ord o on o.id=sr.ord_id"""):
    print("  ", dict(r))
c.close()
