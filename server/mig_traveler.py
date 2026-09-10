#!/usr/bin/env python3
"""C 端常用办签人档案（凯撒 PRD 4.14.4「选择出行人 → 常旅客信息 → 新增常旅客」）。
唐美芳 2026-08-31：「收货地址和办签人员管理是不是 C 端小程序也应该有 2 个模块进行管理，
我的模块也应该有入口展示」。

在此之前办签人信息只存在订单里（applicant 表，一单一份），客户第二次下单要重新填一遍
护照号、有效期、签发地这些，填错一位就得补料重来。"""
import sqlite3
c = sqlite3.connect("visaops.db"); c.row_factory = sqlite3.Row

c.execute("""CREATE TABLE IF NOT EXISTS traveler (
  id INTEGER PRIMARY KEY,
  owner_user INTEGER NOT NULL,     -- 归属客户账号
  name_cn TEXT NOT NULL,
  name_en TEXT,
  sex TEXT,
  birth TEXT,
  id_type TEXT DEFAULT '护照',
  id_no TEXT,
  id_expiry TEXT,
  id_place TEXT,                   -- 证件签发地
  nation TEXT DEFAULT '中国',
  phone TEXT,
  crowd TEXT DEFAULT 'job',        -- 适用人群，决定材料清单怎么裁
  is_self INTEGER DEFAULT 0,       -- 是否本人
  created_at TEXT, updated_at TEXT
)""")
c.execute("CREATE INDEX IF NOT EXISTS ix_traveler_user ON traveler(owner_user, id_no)")

# 从历史订单里的办签人反向建档：同一账号下按证件号去重，取最近一次填的信息
if not list(c.execute("SELECT 1 FROM traveler LIMIT 1")):
    seen, rows_ = set(), []
    for a in c.execute("""select a.*, o.buyer_user, o.contact_name, o.created_at ord_at
                          from applicant a join ord o on o.id=a.ord_id
                          where o.buyer_user is not null order by o.id"""):
        uid = a["buyer_user"]
        key = (uid, (a["id_no"] or "").strip() or a["name_cn"])
        rec = (uid, a["name_cn"], a["name_en"], a["sex"], a["birth"], a["id_type"] or "护照",
               a["id_no"], a["id_expiry"], a["id_place"], a["nation"] or "中国", a["phone"],
               a["crowd"] or "job",
               1 if a["name_cn"] and a["name_cn"] == a["contact_name"] else 0,
               a["ord_at"], a["ord_at"])
        if key in seen:
            # 后来的订单信息更新，覆盖前面那条
            rows_ = [r for r in rows_ if not (r[0] == uid and (r[6] or r[1]) == (key[1]))]
        seen.add(key)
        rows_.append(rec)
    c.executemany("""INSERT INTO traveler(owner_user,name_cn,name_en,sex,birth,id_type,id_no,
                     id_expiry,id_place,nation,phone,crowd,is_self,created_at,updated_at)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", rows_)
    c.commit()

print("traveler 建档：", list(c.execute("select count(*) from traveler"))[0][0], "人")
for r in c.execute("""select u.login,u.name,count(*) n from traveler t
                      join user u on u.id=t.owner_user group by 1,2"""):
    print("  ", dict(r))
c.close()
