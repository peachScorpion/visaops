#!/usr/bin/env python3
"""办签进度：旧十步 → 新六步（唐美芳 2026-09-02 重新定义的流程）。

  P1 待收材料 → P1 待收料
  P2 材料审核中 → P2 待审核
  P3 材料已齐备 / P4 表单填写中 → P3 待提交至官网
  P5 待预约面签 → P4 待预约
  P6 已预约待面签 / P7 已递交/已面签 / P8 行政审查中 → P5 待出签
  P9 已出结果 / P10 已交付客户 → P6 已完成
"""
import sqlite3, sys
M = {"P1": "P1", "P2": "P2", "P3": "P3", "P4": "P3",
     "P5": "P4", "P6": "P5", "P7": "P5", "P8": "P5",
     "P9": "P6", "P10": "P6"}
db = sys.argv[1] if len(sys.argv) > 1 else "visaops.db"
c = sqlite3.connect(db); c.row_factory = sqlite3.Row
before = {r["progress"]: r["n"] for r in
          c.execute("select progress,count(*) n from applicant group by progress")}
print("迁移前:", before)
for old, new in M.items():
    if old != new:
        c.execute("update applicant set progress=? where progress=?", (new, old))
c.commit()
after = {r["progress"]: r["n"] for r in
         c.execute("select progress,count(*) n from applicant group by progress")}
print("迁移后:", after)
bad = [r["progress"] for r in c.execute("select distinct progress from applicant")
       if r["progress"] not in ("P1", "P2", "P3", "P4", "P5", "P6")]
print("越界进度:", bad or "无")
