"""把美国 DS-160 官方字段表导入表单字段库（首次建库用，可重复执行）。

用法：python3 server/seed_form.py <字段表.xlsx>
"""
import sys
import os
import uuid
import sqlite3
import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import form_import

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'visaops.db')
XLSX = sys.argv[1] if len(sys.argv) > 1 else None
if not XLSX or not os.path.exists(XLSX):
    raise SystemExit('用法：python3 server/seed_form.py <字段表.xlsx>')

sheet, fields = form_import.parse(XLSX)
if not fields:
    raise SystemExit('表格里没解析出任何字段，先检查表头')

now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
c = sqlite3.connect(DB)
row = c.execute("select id from formver where country='美国' and form_code='DS-160'").fetchone()
if row:
    fid = row[0]
    c.execute("delete from form_field where formver_id=?", (fid,))
    c.execute("update formver set updated_at=? where id=?", (now, fid))
else:
    c.execute(
        "insert into formver(ver_no,country,visa_type,form_code,name,official_url,status,"
        "effective_at,active,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)",
        ('V' + uuid.uuid4().hex[:5].upper(), '美国', '个人旅游签证（B1/B2）', 'DS-160',
         'DS-160 在线非移民签证申请表 完整字段',
         'https://ceac.state.gov/GENNIV/', 'published', now, 1, now, now))
    fid = c.execute("select last_insert_rowid()").fetchone()[0]

for f in fields:
    c.execute("insert into form_field(formver_id,section,name,fill_note,help_text,notice,"
              "src,src_from,required,covered,risk,dft_no,sort)"
              " values(?,?,?,?,?,?,?,?,?,?,?,?,?)",
              (fid, f['section'], f['name'], f['fill_note'], f['help_text'], f['notice'],
               f['src'], f['src_from'], f['required'], f['covered'], f['risk'],
               f.get('dft_no', 0), f['sort']))
c.commit()
print('导入完成：formver #%d，%d 个字段（来源 sheet：%s）' % (fid, len(fields), sheet))
