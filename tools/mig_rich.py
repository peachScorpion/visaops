"""把库里已经被旧 clean_rich 转义成可见代码的富文本洗回正常内容。

背景：旧版清洗遇到不认识的标签会整个转义成文本「让人看得见自己写了什么」，
结果唐美芳从携程页面复制的套餐说明存下去变成满屏 &lt;dl class="..." style="..."&gt;
（2026-09-01 验收发现）。新版 clean_rich 改成脱标签保文字，这里把存量数据补洗一遍：
先把转义还原成真 HTML，再走一遍新的清洗。

只处理确实含有被转义标签（&lt;xxx）的行，其余原样不动。
"""
import html as html_lib
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
import app  # noqa: E402

DB = os.path.join(os.path.dirname(__file__), "..", "server", "visaops.db")
# (表, 主键列, 富文本列)
TARGETS = [("pkg", "id", "pkg_desc"), ("pkg", "id", "book_notice"),
           ("sup_product", "id", "feature")]
ESCAPED = re.compile(r"&lt;\s*/?\s*[a-zA-Z]")


def main(dry=True):
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    n = 0
    for tb, pk, col in TARGETS:
        try:
            rows = c.execute("select %s k, %s v from %s where %s is not null and %s!=''"
                             % (pk, col, tb, col, col)).fetchall()
        except sqlite3.OperationalError:
            continue
        for r in rows:
            v = r["v"]
            if not ESCAPED.search(v):
                continue
            new = app.clean_rich(html_lib.unescape(v))
            print("%s.%s #%s: %d → %d 字符" % (tb, col, r["k"], len(v), len(new)))
            print("   洗后开头：%s" % new[:120])
            if not dry:
                c.execute("update %s set %s=? where %s=?" % (tb, col, pk), (new, r["k"]))
            n += 1
    if not dry:
        c.commit()
    print(("演练" if dry else "已写入") + "：命中 %d 行" % n)


if __name__ == "__main__":
    main(dry="--go" not in sys.argv)
