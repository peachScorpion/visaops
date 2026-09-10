#!/usr/bin/env python3
"""C 端签证频道首页配置（凯撒 PRD 4.12 手机客户端首页配置）。
唐美芳 2026-08-31：「签证频道首页配置确实可以来一个配置页，你直接补就行」。

在此之前首页的头图、热门国家、热门产品全写死在 v-cust.js 里（DEST / CONT 数组 +
按价格取前 4），运营想在旺季换个国家、挂张促销图都得改代码发版。"""
import sqlite3
c = sqlite3.connect("visaops.db")

c.execute("""CREATE TABLE IF NOT EXISTS home_cfg (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,              -- banner 轮播图 / country 热门国家 / product 热门产品
  title TEXT,                      -- banner 主标题 / 国家名
  subtitle TEXT,                   -- banner 副标题 / 国家副标（如「东京 · 明治神宫」）
  img TEXT,                        -- 图片地址
  link_kind TEXT DEFAULT 'none',   -- 跳转：country 进国家列表 / product 进产品详情 / list 全部目的地 / none
  link_val TEXT,                   -- 国家名 或 sup_product_id
  grp TEXT,                        -- 热门国家的分组（热门/亚洲/欧洲/美洲/澳新非）
  sort INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_by_name TEXT, created_at TEXT,
  updated_by_name TEXT, updated_at TEXT
)""")
c.execute("CREATE INDEX IF NOT EXISTS ix_home_kind ON home_cfg(kind, active, sort)")

if not list(c.execute("SELECT 1 FROM home_cfg LIMIT 1")):
    now = "2026-08-31 07:00:00"
    rows = []
    # 轮播图：把原来写死的那张头图搬进来，再补两张演示位
    rows += [("banner", "去哪儿\n就办哪儿的签证", "覆盖 6 个国家/地区 · 最快 3 个工作日出签",
              "img/dest/uk2.jpg", "list", "", None, 0, 1),
             ("banner", "日本单次旅游签", "免面签 · 7 个工作日出签 · ¥499 起",
              "img/dest/jp2.jpg", "country", "日本", None, 1, 1),
             ("banner", "美签 B1/B2 代填 DS-160", "含代填与代约面签 · 专员全程跟单",
              "img/dest/us.jpg", "country", "美国", None, 2, 0)]
    # 热门国家：原 CONT 数组按分组落库
    CONT = [("热门", ["日本", "韩国", "澳大利亚", "美国", "英国", "新加坡", "泰国", "加拿大"]),
            ("亚洲", ["日本", "韩国", "新加坡", "泰国", "马来西亚"]),
            ("欧洲", ["英国", "欧洲"]),
            ("美洲", ["美国", "加拿大"]),
            ("澳新非", ["澳大利亚"])]
    SUB = {"日本": "东京 · 明治神宫", "韩国": "首尔 · 明洞", "新加坡": "滨海湾",
           "澳大利亚": "悉尼歌剧院", "英国": "伦敦 · 大本钟", "美国": "纽约 · 时报广场"}
    IMG = {"日本": "img/dest/jp.jpg", "韩国": "img/dest/kr.jpg", "新加坡": "img/dest/sg.jpg",
           "澳大利亚": "img/dest/au.jpg", "英国": "img/dest/uk.jpg", "美国": "img/dest/us.jpg"}
    for g, cs in CONT:
        for i, cn in enumerate(cs):
            rows.append(("country", cn, SUB.get(cn), IMG.get(cn), "country", cn, g, i, 1))
    # 热门产品：取当前在售、成交量靠前的四条
    ps = list(c.execute("""select sp.id, sp.name from sup_product sp
                           where sp.to_c=1 and sp.review_c='approved' order by sp.id limit 4"""))
    for i, (pid, nm) in enumerate(ps):
        rows.append(("product", nm, None, None, "product", str(pid), None, i, 1))

    c.executemany("""INSERT INTO home_cfg(kind,title,subtitle,img,link_kind,link_val,grp,sort,active,
                     created_by_name,created_at,updated_by_name,updated_at)
                     VALUES(?,?,?,?,?,?,?,?,?,'系统初始化',?,'系统初始化',?)""",
                  [r + (now, now) for r in rows])
    c.commit()

print("home_cfg 就绪：",
      dict(c.execute("select kind,count(*) from home_cfg group by 1")))
print("启用中：", dict(c.execute("select kind,count(*) from home_cfg where active=1 group by 1")))
c.close()
