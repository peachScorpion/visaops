#!/usr/bin/env python3
"""给业务表补齐审计字段：创建人 / 创建时间 / 最近操作人 / 最近操作时间。

一个系统能不能上线，先看它答不答得出「这条记录是谁建的、最后谁动过」。
之前只有 created_at，出了问题查不到人，这是演示系统和生产系统的分界线。
存量数据不编人名，只从表里已有的真实操作人字段推导，推不出来的记「系统初始化」。
"""
import os
import sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "visaops.db")

# 需要审计的业务表（event 是流水本身、seq 是计数器，都不需要）
TABLES = [
    "org", "user", "addr", "sample_tpl", "fullver", "fullver_item",
    "product", "sup_product", "pkg", "chan_group", "chan_rule", "chan_pub",
    "ord", "applicant", "mat", "supp", "wo", "batch", "deliver",
    "pay", "refund", "payable", "advance",
]
COLS = [
    ("created_by", "INTEGER"), ("created_by_name", "TEXT"), ("created_at", "TEXT"),
    ("updated_by", "INTEGER"), ("updated_by_name", "TEXT"), ("updated_at", "TEXT"),
]
# 存量数据的创建人从这些已有字段推导，按顺序取第一个有值的
DERIVE = {
    "ord": ["agent_user", "buyer_user"],
    "wo": ["owner_user"],
    "advance": ["op_user"],
    "pay": ["fin_user"],
    "refund": ["l1_user", "fin_user"],
}


def main():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    names = {u["id"]: u["name"] for u in c.execute("select id,name from user")}
    added = 0
    for t in TABLES:
        have = {r[1] for r in c.execute("pragma table_info(%s)" % t)}
        if not have:
            print("  跳过（表不存在）:", t)
            continue
        for col, typ in COLS:
            if col in have:
                continue
            c.execute("alter table %s add column %s %s" % (t, col, typ))
            added += 1
        # 创建时间兜底：没有 created_at 的存量行，用 updated_at 顶上，都没有就留空
        c.execute("update %s set created_at=updated_at"
                  " where (created_at is null or created_at='') and updated_at is not null" % t)
        # 创建人：从表内已有的真实操作人字段推导，不虚构
        src = [f for f in DERIVE.get(t, []) if f in have]
        if src:
            expr = src[0] if len(src) == 1 else "coalesce(%s)" % ",".join(src)
            for r in c.execute("select id,%s as uid from %s where created_by is null"
                               % (expr, t)).fetchall():
                if r["uid"] in names:
                    c.execute("update %s set created_by=?,created_by_name=? where id=?" % t,
                              (r["uid"], names[r["uid"]], r["id"]))
        c.execute("update %s set created_by_name='系统初始化'"
                  " where created_by_name is null or created_by_name=''" % t)
        # 最近操作人：存量行没动过，等同创建人
        c.execute("update %s set updated_by=created_by, updated_by_name=created_by_name,"
                  " updated_at=coalesce(nullif(updated_at,''),created_at)"
                  " where updated_by_name is null or updated_by_name=''" % t)
    c.commit()
    print("完成：%d 张表，新增 %d 个字段" % (len(TABLES), added))
    c.close()


if __name__ == "__main__":
    main()
