#!/usr/bin/env python3
"""按众信「业务资金管理」口径扩收款单字段，并补齐各状态 demo 数据。
唐美芳 2026-08-31 定：签证订单不支持转款，转款单不做；UOM 原「转款管理」实为垫付台账，改名垫付管理。
唐美芳 2026-08-31：「收、退、转单据为什么没有呢」「每个状态都有 demo 数据，我后续会测试验收」"""
import sqlite3, random
from datetime import datetime, timedelta

DB = "visaops.db"
c = sqlite3.connect(DB); c.row_factory = sqlite3.Row

def cols(t): return {r[1] for r in c.execute("PRAGMA table_info(%s)" % t)}
def addcol(t, name, decl):
    if name not in cols(t):
        c.execute("ALTER TABLE %s ADD COLUMN %s %s" % (t, name, decl)); print("  +", t, name)

print("== 1. 收款单 pay 扩字段（众信口径）==")
for n, d in [
    ("receipt_img",  "TEXT"),          # 水单（银行回单）附件
    ("acct_type",    "TEXT DEFAULT '个人'"),  # 交款账户类型
    ("acct_no",      "TEXT"),          # 账号
    ("no",           "TEXT"),          # 收款单号 S26...
    ("cate",         "TEXT DEFAULT '银行'"),      # 收款类别：银行/门店钱包/第三方支付
    ("channel_name", "TEXT"),          # 收款渠道：具体支行 / 资金池
    ("cust_type",    "TEXT DEFAULT '个人客户'"),  # 客户类型
    ("item",         "TEXT DEFAULT '团款'"),      # 款项：团款/定金/尾款/加急费/补差
    ("arrive_amount","REAL"),          # 到账金额
    ("fee",          "REAL DEFAULT 0"),# 手续费
    ("payer_name",   "TEXT"),          # 付款人名称
    ("pay_date",     "TEXT"),          # 付款日期
    ("arrive_date",  "TEXT"),          # 到账日期
    ("audit_status", "TEXT DEFAULT 'wait'"),  # wait 待审核 / pass 已审核 / error 有误
    ("voucher_no",   "TEXT"),          # 凭证号，生成后回填
    ("sale_note",    "TEXT"),          # 销售备注
    ("fin_note",     "TEXT"),          # 财务备注
]:
    addcol("pay", n, d)

print("== 2. 退款出账流水不是收款单，清掉其收款审核状态 ==")
c.execute("UPDATE pay SET audit_status=NULL WHERE kind='out'")
c.commit()

print("== 3. 回填收款单存量数据 ==")
BANKS = ["中信银行北京瑞城中心支行", "建设银行北京国贸支行", "招商银行北京分行营业部"]
rows = list(c.execute("SELECT p.*, o.no AS ord_no, o.channel, o.contact_name FROM pay p "
                      "LEFT JOIN ord o ON o.id=p.ord_id WHERE p.kind='in' ORDER BY p.id"))
for i, r in enumerate(rows):
    if r["no"]: continue
    created = r["created_at"] or datetime.now().isoformat(" ", "seconds")
    d = created[:10]
    cate, chan, method = ("门店钱包", "资金池", "余额支付") if r["channel"] == "csp" else \
                         ("第三方支付", "易宝支付", "微信") if r["channel"] == "customer" else \
                         ("银行", BANKS[i % 3], "汇款")
    # 已放行的＝已审核；未放行的＝待审核
    aud = "pass" if r["fin_confirmed"] else "wait"
    c.execute("""UPDATE pay SET no=?, cate=?, channel_name=?, method=?, cust_type=?, item=?,
                 arrive_amount=?, fee=0, payer_name=?, pay_date=?, arrive_date=?,
                 audit_status=?, voucher_no=? WHERE id=?""",
              ("S%s%04d" % (d.replace("-", "")[2:], r["id"]), cate, chan, method,
               "同业客户" if r["channel"] == "agent" else "个人客户", "团款",
               r["amount"], r["contact_name"] or "—", d, d,
               aud, ("PZ%s%04d" % (d.replace("-", "")[2:], r["id"])) if r["fin_confirmed"] else None,
               r["id"]))
c.commit()
print("  回填", len(rows), "条")

print("== 4. 补 demo：每个状态都要有数据 ==")
# 4.1 收款单「有误」：只能出在**未放行**的单据上——已放行意味着财务已核对通过，
#     再标有误自相矛盾（/fin/audit 接口也会拒绝）。所以从 wait 里挑，不动已放行的。
if not list(c.execute("SELECT 1 FROM pay WHERE kind='in' AND audit_status='error' LIMIT 1")):
    ids = [r[0] for r in c.execute("SELECT id FROM pay WHERE kind='in' AND audit_status='wait' "
                                   "AND COALESCE(fin_confirmed,0)=0 ORDER BY id LIMIT 1")]
    for pid in ids:
        amt = list(c.execute("SELECT amount FROM pay WHERE id=?", (pid,)))[0][0]
        c.execute("""UPDATE pay SET audit_status='error', arrive_amount=?, fee=?, voucher_no=NULL,
                     fin_note='到账金额与收款金额不符，待销售核实第三方流水号' WHERE id=?""",
                  (round(amt - 2, 2), 2, pid))
    print("  收款单 有误 x", len(ids), "(未放行；已放行的单据不允许标有误)")
else:
    print("  收款单 有误 已存在，跳过")

# 4.2 收款单「已审核待生成凭证」＝ audit_status=pass 且无凭证号。不足 3 条才补
have = list(c.execute("SELECT COUNT(*) FROM pay WHERE kind='in' AND audit_status='pass' AND voucher_no IS NULL"))[0][0]
if have < 3:
    ids = [r[0] for r in c.execute("SELECT id FROM pay WHERE kind='in' AND audit_status='pass' "
                                   "AND voucher_no IS NOT NULL ORDER BY id LIMIT ?", (3 - have,))]
    c.executemany("UPDATE pay SET voucher_no=NULL WHERE id=?", [(i,) for i in ids])
    print("  收款单 待生成凭证 +", len(ids))
else:
    print("  收款单 待生成凭证 已有", have, "条")

# 4.3 退款单补 l1（主管已批待出账）与 reject（已驳回）
have = {r[0] for r in c.execute("SELECT status FROM refund GROUP BY 1")}
src = list(c.execute("SELECT * FROM refund WHERE status='done' ORDER BY id LIMIT 2"))
nxt = (list(c.execute("SELECT COALESCE(MAX(id),0) FROM refund"))[0][0]) + 1
for k, st in enumerate(["l1", "reject"]):
    if st in have: continue
    s = src[k % len(src)]
    c.execute("""INSERT INTO refund (id,no,ord_id,applicant_ids,reason,reason_cate,amount,liability,
                 status,l1_user,l1_at,fin_user,fin_at,note,created_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
              (nxt + k, "T2608310001%02d" % (k + 1), s["ord_id"], s["applicant_ids"],
               "客户改期后取消行程" if st == "l1" else "客户重复提交，与 T260828000137 重复",
               s["reason_cate"], s["amount"], s["liability"], st,
               s["l1_user"], "2026-08-30 10:12" if st == "l1" else None,
               None, None,
               "主管已批，待财务出账" if st == "l1" else "重复申请，已驳回；以原单为准",
               "2026-08-29 16:40"))
c.commit()
print("  退款单 补至:", [r[0] for r in c.execute("SELECT status FROM refund GROUP BY 1")])

# 4.5 办签进度补 P2（材料审核中）——唯一一个 0 条的
if not list(c.execute("SELECT 1 FROM applicant WHERE progress='P2' LIMIT 1")):
    ids = [r[0] for r in c.execute(
        "SELECT a.id FROM applicant a JOIN ord o ON o.id=a.ord_id "
        "WHERE a.progress='P1' AND o.status='processing' ORDER BY a.id LIMIT 2")]
    c.executemany("UPDATE applicant SET progress='P2' WHERE id=?", [(i,) for i in ids])
    c.commit()
    print("  办签进度 P2 ×", len(ids))

print("\n== 校验：每个状态的 demo 覆盖 ==")
for t, col, label in [("ord", "status", "订单状态"), ("applicant", "progress", "办签进度"),
                      ("pay", "audit_status", "收款审核"), ("refund", "status", "退款状态")
                      ]:
    w = " WHERE kind='in'" if t == "pay" else ""
    got = dict(c.execute("SELECT %s,count(*) FROM %s%s GROUP BY 1" % (col, t, w)))
    print("  %-6s" % label, got)
c.close()
