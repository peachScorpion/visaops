"""给 form_field 补「填写类型」和「选项值」两列，并给存量字段推断一次类型。

推断规则不写在这里——和导入解析共用 form_import.guess_type，
否则同一套规则两处各改一遍，迟早对不上。
只跑一次；重复跑会跳过已有列，推断只覆盖 ftype 为空的行，不会盖掉运营改过的。
"""
import os
import sqlite3

import form_import

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visaops.db")


def main():
    c = sqlite3.connect(DB)
    cols = [r[1] for r in c.execute("pragma table_info(form_field)")]
    for col in ('ftype', 'options'):
        if col not in cols:
            c.execute("alter table form_field add column %s TEXT" % col)
            print("added column", col)
    n = 0
    for fid, name, dft in c.execute("select id,name,ifnull(dft_no,0) from form_field"
                                    " where ftype is null or ftype=''").fetchall():
        t, o = form_import.guess_type(name, dft)
        c.execute("update form_field set ftype=?,options=? where id=?", (t, o, fid))
        n += 1
    c.commit()
    print("推断 %d 条" % n)
    for r in c.execute("select ftype,count(*) from form_field group by ftype order by 2 desc"):
        print("  %-8s %d" % r)


if __name__ == '__main__':
    main()
