# -*- coding: utf-8 -*-
"""表模板的「签证类型」从签证名称改成受控大类（唐美芳 2026-08-31：
「uom的美国签证表模板的签证类型、国家也应该是下拉选择的」）。

改下拉带出一个业务问题：库里那条美国模板填的是「个人旅游签证（B1/B2）」——
那是**签证名称**，不是类型。而 DS-160 这张表管的是美国**全部非移民签证**：
旅游、商务、留学、工作都填它。填成 B1/B2 等于把它限死在旅游签上，
F1 学生签证的产品按 country+visa_type 精确匹配根本匹不到它，
只是靠 pick_formver 里「同国家任取一张」的兜底才碰巧还能用。

所以：模板的 visa_type 落成 VISA_CATS 里的大类，或者留空表示「该国通用」。
DS-160 就该是空——它本来就通用。
"""
import sqlite3, os
db = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'visaops.db')
c = sqlite3.connect(db)
c.row_factory = sqlite3.Row

CATS = ["旅游", "商务", "探亲访友", "EVUS登记更新", "留学", "ESTA登记更新", "工作", "转移", "其他"]

# 一张表管一整类签证时才填类型；管整个国家的留空
FORCE_BLANK = ["DS-160"]

n = 0
for f in c.execute("select id, country, visa_type, form_code, name from formver").fetchall():
    vt = (f["visa_type"] or "").strip()
    new = vt
    if any(k and k in (f["form_code"] or "") for k in FORCE_BLANK):
        new = ""                       # 该国通用
    elif vt and vt not in CATS:
        # 落不进大类的旧值：按关键词归一次，归不出来就留空（通用）比乱归安全
        hit = ""
        for k, cat in [("旅游", "旅游"), ("访客", "旅游"), ("访问", "旅游"),
                       ("商务", "商务"), ("探亲", "探亲访友"), ("访友", "探亲访友"),
                       ("学生", "留学"), ("留学", "留学"), ("工作", "工作")]:
            if k in vt:
                hit = cat
                break
        new = hit
    if new != vt:
        c.execute("update formver set visa_type=? where id=?", (new, f["id"]))
        print("  %s《%s》：%r → %r" % (f["country"], f["name"][:24], vt, new))
        n += 1
c.commit()
print("改了 %d 条" % n)
for r in c.execute("select country,visa_type,form_code,name from formver"):
    print("  %-4s | 类型=%-6s | %s | %s" % (r[0], r[1] or "不限", r[2], r[3][:30]))
