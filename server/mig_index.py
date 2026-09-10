# -*- coding: utf-8 -*-
"""给高频外键列补索引。

2026-09-10：scan 反复报 ubk:board / csp:mats 「几乎空白」，查下来不是渲染坏了，
是接口太慢——`/sup/orders` 单次 1.7–3.2 秒，高负载时浏览器等不到就先画了个空壳。
根因是 `mat` 表 9998 行**一个索引都没有**，而工单列表要为 300 位办签人各查一次
`select * from mat where applicant_id=?`，等于全表扫 300 遍、扫掉 300 万行。

这些都是纯读优化，不动任何数据。写入会略慢一点点，但这几张表的写入频率
（收料、审核、建单）跟列表读的频率完全不是一个量级。
"""
import os
import sqlite3

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visaops.db")

IDX = [
    # 工单列表的热点：一位办签人一次
    ("ix_mat_applicant", "mat", "(applicant_id)"),
    ("ix_supp_applicant", "supp", "(applicant_id, status)"),
    # 工单本身：供应商按 sup_org 捞、详情按 applicant_id 捞、订单页按 ord_id 捞
    ("ix_wo_suporg", "wo", "(sup_org)"),
    ("ix_wo_applicant", "wo", "(applicant_id)"),
    ("ix_wo_ord", "wo", "(ord_id)"),
    ("ix_wo_owner", "wo", "(owner_user)"),
    # 订单 → 办签人
    ("ix_applicant_ord", "applicant", "(ord_id)"),
    # 资金：三张表都按订单查
    ("ix_pay_ord", "pay", "(ord_id)"),
    ("ix_payable_ord", "payable", "(ord_id)"),
    ("ix_refund_ord", "refund", "(ord_id)"),
    # 操作日志：详情页按对象拉时间线，13469 行也是全表扫
    ("ix_event_obj", "event", "(scope, ref_id)"),
    ("ix_event_ord", "event", "(ord_id)"),
    # 材料清单项 / 表模板题目
    ("ix_fullver_item_ver", "fullver_item", "(fullver_id)"),
    ("ix_form_field_ver", "form_field", "(formver_id)"),
    # 供应商产品与套餐
    ("ix_pkg_sup_product", "pkg", "(sup_product_id)"),
    ("ix_sup_product_org", "sup_product", "(org_id)"),
]


def main():
    c = sqlite3.connect(DB)
    cols = {}
    for t in {x[1] for x in IDX}:
        try:
            cols[t] = {r[1] for r in c.execute("pragma table_info(%s)" % t)}
        except sqlite3.Error:
            cols[t] = set()
    made, skip = [], []
    for name, tbl, expr in IDX:
        need = {x.strip() for x in expr.strip("()").split(",")}
        if not cols.get(tbl) or not need <= cols[tbl]:
            skip.append("%s（表或列不存在）" % name)
            continue
        c.execute("create index if not exists %s on %s%s" % (name, tbl, expr))
        made.append(name)
    c.execute("analyze")
    c.commit()
    c.close()
    print("已建/确认索引 %d 个：%s" % (len(made), " ".join(made)))
    if skip:
        print("跳过：" + "；".join(skip))


if __name__ == "__main__":
    main()
