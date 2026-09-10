#!/usr/bin/env python3
"""去掉「拒签退款保障」套餐概念。
唐美芳 2026-08-31：「拒签退款保障没有这个服务。直接去掉就行，拒签也是退的，所以不需要体现这个保障」。

处理方式：不删套餐、不改价。pkg 3 已被 6 张订单引用（金额 2880/2400，且挂着收款单与退款单），
删掉或改价会让订单—收款—退款的金额链条断掉。改成签证行业真实存在的增值服务「代办面签陪同」，
价差 900 元有业务解释，历史数据一行不动。refund_insured 全库置 0，前端不再体现该概念。"""
import sqlite3
c = sqlite3.connect("visaops.db"); c.row_factory = sqlite3.Row

ins = list(c.execute("SELECT id,name,sup_product_id FROM pkg WHERE refund_insured=1 OR name LIKE '%拒签%'"))
for p in ins:
    n = list(c.execute("SELECT count(*) FROM ord WHERE pkg_id=?", (p["id"],)))[0][0]
    c.execute("UPDATE pkg SET name='代办面签陪同', refund_insured=0 WHERE id=?", (p["id"],))
    print("  pkg %-3s %-14s → 代办面签陪同（%d 张订单引用，金额不动）" % (p["id"], p["name"], n))

c.execute("UPDATE pkg SET refund_insured=0 WHERE COALESCE(refund_insured,0)<>0")
c.commit()
print("\n复检：")
print("  仍含保障标记的套餐:", list(c.execute("SELECT count(*) FROM pkg WHERE refund_insured=1"))[0][0])
print("  名字里还有「拒签」的:", [r[0] for r in c.execute("SELECT name FROM pkg WHERE name LIKE '%拒签%'")] or "无")
print("  套餐清单:")
for r in c.execute("SELECT p.id,p.name,p.suggest_retail,p.lead_days,count(o.id) n FROM pkg p "
                   "LEFT JOIN ord o ON o.pkg_id=p.id GROUP BY p.id ORDER BY p.id"):
    print("   ", dict(r))
c.close()
