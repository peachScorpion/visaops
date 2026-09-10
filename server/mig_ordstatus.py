#!/usr/bin/env python3
"""订单状态去掉「办理中」，改用派生的「办理状态」。
唐美芳 2026-08-31：「订单状态里很少有办理中这种中间态的，好奇怪，先去掉吧」。

对齐凯撒 PRD：订单状态只有 5 个（待付款/已付款/已完成/已取消/已退款），
「办理中」属于另一条线——PRD 叫「订单办理状态」，是由全部办签人的签证办理进度算出来的派生值，
不落库、不用人维护。原来 31 张 processing 的单全部并回 paid。"""
import sqlite3
c = sqlite3.connect("visaops.db")

n = c.execute("select count(*) from ord where status='processing'").fetchone()[0]
c.execute("update ord set status='paid' where status='processing'")
c.commit()
print("processing → paid：%d 张" % n)
print("订单状态分布:", dict(c.execute("select status,count(*) from ord group by 1")))
print("\n派生办理状态（按办签人进度算，不落库）:")
for r in c.execute("""
    select case when mx is null then '未开始'
                when mn='P10' then '已完成'
                when mx='P1' then '未开始'
                else '办理中' end st, count(*)
    from (select o.id, min(a.progress) mn, max(a.progress) mx
          from ord o left join applicant a on a.ord_id=o.id and a.state='normal'
          where o.gate=1 group by o.id)
    group by 1"""):
    print("  ", r)
c.close()
