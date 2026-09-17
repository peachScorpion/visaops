# -*- coding: utf-8 -*-
"""首页配置增加渠道字段，区分C端和有米。

唐美芳 2026-09-15：C端小程序有签证频道首页配置，有米小程序也需要。
channel='c' 表示C端，channel='youmi' 表示有米，默认值为 'c'（兼容现有数据）。
"""
import sqlite3
import os

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visaops.db")
c = sqlite3.connect(DB)
cols = {r[1] for r in c.execute("pragma table_info(home_cfg)")}
if "channel" not in cols:
    c.execute("alter table home_cfg add column channel TEXT DEFAULT 'c'")
    print("added home_cfg.channel")
    # 将现有数据的 channel 设为 'c'
    c.execute("update home_cfg set channel='c' where channel is null or channel=''")
    print("set existing records channel='c'")
c.commit()
print("done")