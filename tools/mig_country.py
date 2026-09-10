"""国家展示与默认流程配置：把 C 端按国家写死的那几样搬进运营后台。

唐美芳 2026-09-01：「除产品头图外 C 端仍按国家写死的还有——国家频道页大图、
国旗图标、目的地卡片图，以及平台默认办理流程那 5 步 …… 可以的，都统一放在运营配置里吧」。

在此之前这些都是前端常量（v-cust.js 的 CIMG / DIMG / fimg / FLOW），
运营想给新开的国家配图、想改办理流程的措辞，都得改代码发版。

country_cfg 一行一个国家；country='' 的那一行是平台级默认，
只用 flow 字段（国家没配流程时回落到它，产品级 flow 优先级仍最高）。
"""
import json
import os
import sqlite3

DB = os.path.join(os.path.dirname(__file__), "..", "server", "visaops.db")
c = sqlite3.connect(DB)
c.row_factory = sqlite3.Row

c.execute("""create table if not exists country_cfg(
  id integer primary key autoincrement,
  country text not null default '',      -- 空串＝平台默认配置（只用 flow）
  hero_img text default '',              -- 国家频道页顶部大图
  card_img text default '',              -- 首页/列表里的目的地卡片图
  flag_img text default '',              -- 国旗图标
  intro text default '',                 -- 国家页副标题，一句话
  flow text default '',                  -- 该国默认办理流程 JSON，空则用平台默认
  active integer default 1,
  created_by integer, created_by_name text, created_at text,
  updated_by integer, updated_by_name text, updated_at text)""")
c.execute("create unique index if not exists ix_country_cfg on country_cfg(country)")

# 平台默认办理流程：把原来写死在 v-cust.js / v-ubk-ops.js 里的那 5 步搬进来，
# 措辞与两处保持一致，运营改一次两端同时生效。
DEFAULT_FLOW = [
    {"t": "下单办理", "d": "填写办签信息并完成付款"},
    {"t": "准备资料", "d": "按清单交材料、填申请表"},
    {"t": "资料审核", "d": "专员复核后递交使领馆"},
    {"t": "出签配还", "d": "出结果并寄回护照与资料"},
    {"t": "出发", "d": "按行程出行"},
]
if not c.execute("select count(*) from country_cfg where country=''").fetchone()[0]:
    c.execute("insert into country_cfg(country,flow,created_at,created_by_name)"
              " values('',?,datetime('now','localtime'),'系统初始化')",
              (json.dumps(DEFAULT_FLOW, ensure_ascii=False),))
    print("已建立平台默认办理流程（5 步）")

# 已有国家：把前端常量里的图搬进来做初值，运营在后台看到的就是现在线上的样子，
# 而不是一片空白让人以为功能没做
CIMG = {"美国": "us", "日本": "jp", "加拿大": "ca", "英国": "uk", "欧洲": "eu",
        "澳大利亚": "au", "新加坡": "sg", "泰国": "th", "马来西亚": "my", "韩国": "kr"}
DIMG = {"日本": "jp", "韩国": "kr", "新加坡": "sg", "澳大利亚": "au", "英国": "uk", "美国": "us"}

countries = [r[0] for r in c.execute("select distinct country from product where country!=''")]
n = 0
for cn in countries:
    if c.execute("select count(*) from country_cfg where country=?", (cn,)).fetchone()[0]:
        continue
    hero = "img/dest/%s.jpg" % DIMG[cn] if cn in DIMG else (
        "img/c_%s.jpg" % CIMG[cn] if cn in CIMG else "")
    flag = "img/flag_%s.png" % CIMG[cn] if cn in CIMG else ""
    c.execute("insert into country_cfg(country,hero_img,card_img,flag_img,created_at,"
              "created_by_name) values(?,?,?,?,datetime('now','localtime'),'系统初始化')",
              (cn, hero, hero, flag))
    n += 1
c.commit()
print("已为 %d 个国家建立展示配置：%s" % (n, "、".join(countries)))
