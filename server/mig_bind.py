#!/usr/bin/env python3
"""C 端客户绑定归属销售，并回填存量直客单的归属。

唐美芳 2026-09-02：「C端小程序这个账号，也帮我默认绑定到这个有米和csp账号名下，
这样下的单，几个端都能统一看见了」。

业务上这不是硬凑：直客注册时由某个门店销售拉新绑定、之后这位客人的单都算这个销售的，
是真实存在的「客户归属 / 服务顾问」概念。所以做成 user.owner_user 字段，
而不是把订单渠道从 C 改成 CSP —— 渠道（谁的流量）和归属（算谁的业绩）是两件事，
混在一起会让直客成交被统计成门店成交。
"""
import sqlite3, sys

db = sys.argv[1] if len(sys.argv) > 1 else "visaops.db"
c = sqlite3.connect(db)
c.row_factory = sqlite3.Row

cols = [r["name"] for r in c.execute("pragma table_info(user)")]
if "owner_user" not in cols:
    c.execute("alter table user add column owner_user INTEGER")
    print("user.owner_user 已新增")

sales = c.execute("select id,org_id,name from user where login='sales'").fetchone()
if not sales:
    sys.exit("找不到 sales 账号")
sid, sorg = sales["id"], sales["org_id"]
print("归属销售：%s (id=%d, org=%s)" % (sales["name"], sid, sorg))

n = c.execute("update user set owner_user=? where role='customer' and "
              "(owner_user is null or owner_user='')", (sid,)).rowcount
print("绑定 C 端客户 %d 个" % n)

# 存量直客单回填归属。渠道保持 'C' 不动。
n2 = c.execute("update ord set agent_user=?, org_id=? where channel='C' and "
               "(agent_user is null or org_id is null)", (sid, sorg)).rowcount
print("回填直客单 %d 张" % n2)

c.commit()
for r in c.execute("select channel,count(*) n from ord where agent_user=? or org_id=? "
                   "group by channel", (sid, sorg)):
    print("  销售端现可见 %s 渠道 %d 单" % (r["channel"], r["n"]))
