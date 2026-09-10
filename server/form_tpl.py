# -*- coding: utf-8 -*-
"""生成「官方字段表」的标准模板 xlsx，供运营下载后照着填。

唐美芳 2026-09-01：「uom新增国家签证表模板，官方字段表，是不是应该有个模板下载才对啊」。
各国官方表格的格式五花八门，运营手动整理时最容易错的是列名——
解析器只认「信息板块」「具体字段名称」这两个必需列，列名对不上就整张表读不进来。
给一份带表头、带填写说明、带两行示例的空模板，照着填一次就能过。

用标准库拼 xlsx（zip + XML），不依赖 openpyxl——本机就没装，
详见 form_import.py 里同样的处理。
"""
import os
import zipfile

X = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

HDR = ["信息板块", "具体字段名称", "填报说明", "官方 Help", "重要提醒", "覆盖范围"]
NOTE = ["【必填】官方表单的分节名，如「个人信息」「证件信息」",
        "【必填】该节下的字段名，一行一个",
        "【选填】填写要求，会原样展示给客户",
        "【选填】官方帮助原文",
        "【选填】填错的后果，会以醒目样式展示",
        "【选填】✅ 已完全覆盖 / ⭕️ 部分覆盖 / 留空表示未覆盖"]
DEMO = [["个人信息", "姓（拼音）", "与护照机读区完全一致", "Surname as in passport",
         "拼写错误会被退件重交", "✅"],
        ["旅行信息", "预计入境日期", "按机票行程填写", "", "", "✅"]]


def build(web_dir, prefix):
    """写到 web/uploads/tpl/ 下，返回可直接下载的 URL。内容固定，覆盖写即可。"""
    d = os.path.join(web_dir, "uploads", "tpl")
    os.makedirs(d, exist_ok=True)
    name = "官方字段表模板.xlsx"
    path = os.path.join(d, name)

    rows = [HDR, NOTE] + DEMO
    strs, idx = [], {}

    def si(v):
        if v not in idx:
            idx[v] = len(strs)
            strs.append(v)
        return idx[v]

    def esc(t):
        return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    xml_rows = []
    for i, r in enumerate(rows, 1):
        cs = "".join('<c r="%s%d" t="s"><v>%d</v></c>' % (chr(64 + j), i, si(v))
                     for j, v in enumerate(r, 1))
        xml_rows.append('<row r="%d">%s</row>' % (i, cs))
    # 列宽：字段名与填报说明两列最长，给宽一点，运营打开就能看清
    cols = ('<cols><col min="1" max="1" width="16" customWidth="1"/>'
            '<col min="2" max="2" width="26" customWidth="1"/>'
            '<col min="3" max="3" width="42" customWidth="1"/>'
            '<col min="4" max="5" width="28" customWidth="1"/>'
            '<col min="6" max="6" width="18" customWidth="1"/></cols>')
    sheet = ('<?xml version="1.0"?><worksheet xmlns="%s">%s<sheetData>%s</sheetData></worksheet>'
             % (X, cols, "".join(xml_rows)))
    ss = ('<?xml version="1.0"?><sst xmlns="%s">%s</sst>'
          % (X, "".join('<si><t xml:space="preserve">%s</t></si>' % esc(v) for v in strs)))
    wb = ('<?xml version="1.0"?><workbook xmlns="%s"><sheets>'
          '<sheet name="字段表" sheetId="1"/></sheets></workbook>' % X)
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("[Content_Types].xml",
                   '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/'
                   'package/2006/content-types"/>')
        z.writestr("xl/workbook.xml", wb)
        z.writestr("xl/sharedStrings.xml", ss)
        z.writestr("xl/worksheets/sheet1.xml", sheet)
    return "%s/uploads/tpl/%s" % (prefix, name)
