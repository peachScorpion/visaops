# -*- coding: utf-8 -*-
"""供应商可配「办理流程」+ 套餐说明/预订须知改存富文本。

唐美芳 2026-09-01：「ubk新增产品里，我感觉少一个办理流程的配置，
以及套餐说明、预订须知应该是富文本框，现在这个普通文本框里我要调整排版和文字不太友好」。

办理流程原来是前端写死的 5 步常量（v-cust.js 的 FLOW），四处引用。
不同签证的流程其实不一样：电子签没有面签、日本递交纸质表、EVUS 是登记不是签证。
落到 sup_product.flow 存 JSON；为空时前端仍回落到平台默认 5 步，老产品不受影响。

pkg_desc / book_notice 原来是纯文本，改成受限 HTML。已有内容按纯文本处理——
渲染时会走同一个白名单过滤，纯文本里没有标签，原样输出。
"""
import sqlite3, os
db = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'visaops.db')
c = sqlite3.connect(db)

if 'flow' not in [r[1] for r in c.execute("pragma table_info(sup_product)")]:
    c.execute("alter table sup_product add column flow TEXT")
    print("+ sup_product.flow")
else:
    print("  sup_product.flow 已存在")

n = c.execute("select count(*) from pkg where ifnull(pkg_desc,'')<>''"
              " or ifnull(book_notice,'')<>''").fetchone()[0]
print("已有说明/须知的套餐：%d 个（保持纯文本，渲染时同样走白名单）" % n)
c.commit()
