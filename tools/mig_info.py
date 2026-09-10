"""订单流转：付款前必须先录入客人签证资料，且有 24 小时时限。

唐美芳 2026-09-01：「正常应该是付款之前先录入资料，而且必须设定 1 个时间，
比如下单后 24 个小时内录入办签人的资料，否则自动取消订单。
所以录入客人资料这个操作，必须在支付之前。」

加三个字段：
  ord.info_deadline —— 资料录入截止时间（下单时间 + 24 小时）
  ord.info_done_at  —— 全部办签人资料录齐的时间；为空即未录齐，不允许付款
  applicant.info_done / info_at —— 单个办签人的资料是否已确认录入

存量订单：已付款及之后的单子按「已录入」处理（它们本来就在办了），
待付款的单子给一个从现在起算的 24 小时窗口，不要一上线就把人家的单全取消掉。
"""
import os
import sqlite3
from datetime import datetime, timedelta

DB = os.path.join(os.path.dirname(__file__), "..", "server", "visaops.db")
c = sqlite3.connect(DB)
c.row_factory = sqlite3.Row


def cols(t):
    return [r[1] for r in c.execute("pragma table_info(%s)" % t)]


now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
dl = (datetime.now() + timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")

added = []
if "info_deadline" not in cols("ord"):
    c.execute("alter table ord add column info_deadline text default ''")
    added.append("ord.info_deadline")
if "info_done_at" not in cols("ord"):
    c.execute("alter table ord add column info_done_at text default ''")
    added.append("ord.info_done_at")
if "info_done" not in cols("applicant"):
    c.execute("alter table applicant add column info_done integer default 0")
    added.append("applicant.info_done")
if "info_at" not in cols("applicant"):
    c.execute("alter table applicant add column info_at text default ''")
    added.append("applicant.info_at")
c.commit()
print("新增字段：", added or "（已存在，跳过）")

# 存量数据回填
n1 = c.execute("update ord set info_done_at=? where status!='created' and"
               " (info_done_at is null or info_done_at='')", (now,)).rowcount
n2 = c.execute("update applicant set info_done=1,info_at=? where info_done=0 and ord_id in"
               " (select id from ord where status!='created')", (now,)).rowcount
n3 = c.execute("update ord set info_deadline=? where status='created' and"
               " (info_deadline is null or info_deadline='')", (dl,)).rowcount
c.commit()
print("回填：已付款及之后的订单 %d 张标为资料已录入，办签人 %d 位；"
      "待付款订单 %d 张给了 24 小时窗口（截止 %s）" % (n1, n2, n3, dl))
