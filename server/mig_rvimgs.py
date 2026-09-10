# -*- coding: utf-8 -*-
"""给两端审核结论各加一列驳回截图（JSON 数组）。

2026-09-10 唐美芳给了众信现有「审核驳回」弹窗的截图，要求照它做：
预置驳回原因多选 + 驳回截图（最多 5 张）。截图是必要的——
「产品主图不合规」这类问题，光靠文字说不清是哪张图哪个角，
供应商照着改一次就能过的前提是他看得见问题本身。
"""
import os
import sqlite3

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visaops.db")


def main():
    c = sqlite3.connect(DB)
    have = {r[1] for r in c.execute("pragma table_info(sup_product)")}
    made = []
    for col in ("review_b_imgs", "review_c_imgs"):
        if col not in have:
            c.execute("alter table sup_product add column %s TEXT" % col)
            made.append(col)
    c.commit()
    c.close()
    print("已加列：%s" % (" ".join(made) or "无（已存在）"))


if __name__ == "__main__":
    main()
