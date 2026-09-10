"""给 sup_product 加 svc_tags：C 端「服务保障」条从写死文案改成产品自己的数据。

原来详情页那条绿色保障栏是前端硬编码的四句话，跟这条产品实际提供什么没关系。
改成：平台固定项（全平台一致的系统能力）+ 系统按真实数据推的项（拒签退、免面签）
+ 供应商从平台预置清单里勾的项。这一列存的只有第三种。

已有产品留空，即只显示平台固定项与自动推导项，不编造。
"""
import sqlite3
import os

DB = os.path.join(os.path.dirname(__file__), "visaops.db")
c = sqlite3.connect(DB)
cols = [r[1] for r in c.execute("pragma table_info(sup_product)")]
if "svc_tags" not in cols:
    c.execute("alter table sup_product add column svc_tags TEXT")
    print("added sup_product.svc_tags")
else:
    print("sup_product.svc_tags already exists")
c.commit()
