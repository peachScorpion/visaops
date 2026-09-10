# -*- coding: utf-8 -*-
"""每个账号只保留一位「本人」。

唐美芳 2026-09-01：「包括标记本人等，默认带出本人的办签人信息」。
下单页要靠 is_self 决定默认带谁，可库里一个账号 18 条常用办签人有 17 条 is_self=1——
原因是 /my/traveler/save 从来没写过这个字段，种子数据随手全标成了 1。
留最早建的那一条当本人（第一次存进来的通常就是自己），其余清零。
"""
import sqlite3, os
db = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'visaops.db')
c = sqlite3.connect(db)

users = [r[0] for r in c.execute("select distinct owner_user from traveler")]
for u in users:
    keep = c.execute("select id, name_cn from traveler where owner_user=? and is_self=1"
                     " order by id limit 1", (u,)).fetchone()
    if not keep:
        keep = c.execute("select id, name_cn from traveler where owner_user=?"
                         " order by id limit 1", (u,)).fetchone()
    if not keep:
        continue
    n = c.execute("update traveler set is_self=0 where owner_user=? and id<>?",
                  (u, keep[0])).rowcount
    c.execute("update traveler set is_self=1 where id=?", (keep[0],))
    print("  用户 %s：本人 = %s（#%s），取消其余 %d 条" % (u, keep[1], keep[0], n))
c.commit()
print("\n校验：")
for r in c.execute("select owner_user,count(*),sum(is_self) from traveler group by owner_user"):
    print("  用户 %s：%d 条，标本人 %d" % r)
