"""给套餐加「套餐说明」字段。

唐美芳 2026-08-27：「产品详情页产品特色没有啊，购买须知、套餐说明」。
预订须知（book_notice）讲的是「下单前你要知道的约束」，套餐说明讲的是
「这个套餐到底包了什么、跟隔壁那个套餐差在哪」，两件事，不能合并成一个字段。
留空时前端按签证费/服务费/时效/拒签保障现算一句兜底，不编。

一次性脚本，不进服务启动流程。重复执行安全。
"""
import sqlite3
c = sqlite3.connect("visaops.db")
cols = [r[1] for r in c.execute("pragma table_info(pkg)")]
if "pkg_desc" not in cols:
    c.execute("alter table pkg add column pkg_desc TEXT")
    print("added pkg.pkg_desc")
else:
    print("pkg.pkg_desc already exists")
c.commit()
print([r[1] for r in c.execute("pragma table_info(pkg)")])
