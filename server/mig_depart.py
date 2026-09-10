# -*- coding: utf-8 -*-
"""补录订单的预计出行日期。

唐美芳 2026-09-08：「订单列表中的出行日期不可能为空的啊」。
出行日期是下单必填项（接口层 2026-09-08 已补校验），但演示库里有 88 条早期
种子/演练订单没有这个值，列表上显示成「待定」。

**补录规则**：下单日期 + 该套餐办理时长（工作日 ×7/5 向上取整）+ 7 天缓冲。
这是「最早可能出行」的合理值，与下单页日历控件的最早可选日同一套算法
（web/js/calpicker.js 的 calWork2Nat），不是随便编一个日期。
只补空值，已有值一律不动。
"""
import math
import os
import sqlite3
from datetime import datetime, timedelta

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visaops.db")
c = sqlite3.connect(DB)
c.row_factory = sqlite3.Row

rows = c.execute("select id,no,created_at,pkg_id from ord"
                 " where ifnull(depart_date,'')=''").fetchall()
n = 0
for o in rows:
    pk = c.execute("select lead_days from pkg where id=?", (o["pkg_id"],)).fetchone()
    lead = (pk["lead_days"] if pk else 15) or 15
    base = datetime.strptime((o["created_at"] or "")[:10] or "2026-08-01", "%Y-%m-%d")
    d = base + timedelta(days=math.ceil(lead * 7 / 5) + 7)
    c.execute("update ord set depart_date=? where id=?", (d.strftime("%Y-%m-%d"), o["id"]))
    n += 1
c.commit()
print("补录", n, "条")
print("剩余空值",
      c.execute("select count(*) from ord where ifnull(depart_date,'')=''").fetchone()[0])
