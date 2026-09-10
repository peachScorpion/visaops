#!/usr/bin/env python3
"""供应商产品编码：Q + 6 位数字。
唐美芳 2026-08-31：「产品管理列表里的产品 id 改成产品编码，编码规则为 Q+6个数字，支持复制编码操作」。

原来列表上露的是数据库自增主键（「产品 ID #7」）——那是内部实现细节，
供应商跟平台对账、发工单、打电话报编号时没法用。改成业务编码。"""
import sqlite3
c = sqlite3.connect("visaops.db"); c.row_factory = sqlite3.Row

if "code" not in {r[1] for r in c.execute("PRAGMA table_info(sup_product)")}:
    c.execute("ALTER TABLE sup_product ADD COLUMN code TEXT")
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_sup_product_code ON sup_product(code)")
    print("+ sup_product.code")

# 存量按 id 顺序补号，保证稳定可复现
n = 0
for p in c.execute("SELECT id FROM sup_product WHERE code IS NULL OR code='' ORDER BY id"):
    n += 1
    c.execute("UPDATE sup_product SET code=? WHERE id=?", ("Q%06d" % (100000 + p["id"]), p["id"]))
c.commit()
print("补编码", n, "条")

# seq 表里记一个游标，新建产品时递增取号
cur = c.execute("SELECT COALESCE(MAX(CAST(SUBSTR(code,2) AS INTEGER)),100000) FROM sup_product"
                " WHERE code LIKE 'Q%'").fetchone()[0]
c.execute("INSERT OR REPLACE INTO seq(k,v) VALUES('sup_product_code',?)", (cur,))
c.commit()
print("编码游标 =", cur)
for r in c.execute("SELECT id,code,name FROM sup_product ORDER BY id"):
    print("  ", r["code"], r["name"][:36])
c.close()
