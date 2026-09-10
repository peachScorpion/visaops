"""官方申请表字段表（Excel）→ 表单字段库。

调用方有两个：seed_form.py（首次导入 DS-160）和 app.py 的 /ops/form/import（运营在页面上传表格）。
所以这里只做「解析 + 分类 + 比对」，不碰数据库，也不做任何交互。

分类是这套系统能不能靠 AI 提效的地基：字段不分来源，就说不清 AI 到底能替客户省掉哪几格。
四类来源：
  ocr   证件/材料扫描件能直接识别出来（护照资料页、身份证、在职证明、签证页出入境章）
  sys   订单、产品、材料库里已经有的数据，系统带过去即可
  ask   只能问客户本人，AI 变不出来，也不该替他答（旅行史、亲属、安全背景是非题）
  agent 专员在官网上的操作动作（设密保问题、最终审查、打印确认页）
默认落 ask —— 拿不准时宁可多问客户一句，也不要让系统替客户做承诺。
"""

# 关键词 → (来源, 来源载体, 是否高风险)。按顺序匹配，命中即停。
RULES = [
    (('密保问题',), ('agent', '专员在官网操作', 0)),
    (('审查所有信息', '确认页'), ('agent', '专员在官网操作', 0)),
    (('支付费用实体',), ('agent', '专员按订单判断', 0)),

    (('姓氏', '名字', '母语字母', '性别', '出生日期', '出生城市', '出生省份', '出生国家',
      '原籍国', '护照/旅行证件类型', '护照/旅行证件号码', '护照号码', '签发国家',
      '截止日期'), ('ocr', '护照资料页', 0)),
    (('国民身份证号码',), ('ocr', '身份证', 0)),
    (('家庭住址',), ('ocr', '身份证 / 户口本', 0)),
    (('主要职业',), ('ocr', '在职证明', 0)),
    (('过去五年内，您是否去过任何国家',), ('ocr', '护照签证页与出入境章', 0)),
    (('姓名电报码',), ('sys', '中文电码表自动生成', 0)),

    (('此次美国之行的目的', '具体签证类型', '是否有具体旅行计划', '预计到达日期',
      '在美期间居住地址'), ('sys', '订单与产品信息', 0)),
    (('是否有同行人员', '是否随团体'), ('sys', '同订单其他申请人', 0)),
    (('邮寄地址',), ('sys', '订单收件地址', 0)),
    (('电话号码', '电子邮箱地址'), ('sys', '订单联系方式', 0)),
    (('联系人姓名', '与联系人的关系', '联系人地址'), ('sys', '订单行程与地接信息', 0)),
    (('上传签证电子照片',), ('sys', '材料库已收的签证照片', 0)),

    # 高风险：填错不是退回重填，是拒签，个别项按虚假陈述处理。
    # 第 4 位是 dft_no —— 是否由系统默认填「否」、不向客人提起。
    # 这两题 risk=1 但 dft_no=0：常见答案就是「是」，且答「是」是加分项（良好美签与出入境记录），
    # 默认否等于把加分项抹掉，还要指望专员复核时逐个想起来改回来。
    (('是否曾经去过美国', '是否持有过美国签证'), ('ask', '客户本人确认', 1, 0)),
    (('是否曾被拒绝签发', '移民申请'), ('ask', '客户本人确认', 1, 1)),
    (('健康及传染疾病', '犯罪与性交易', '移民违规', '欺诈与驱逐',
      '监护权'), ('ask', '客户本人确认', 1, 1)),
    (('准军事', '专业技能或培训', '服过兵役', '专业组织'), ('ask', '客户本人确认', 1, 1)),
    (('其他国籍', '其他永久居民'), ('ask', '客户本人确认', 1, 1)),

    # ---- 日本 / 泰国等亚洲短期签证表的字段（2026-08-31 照唐美芳给的闪签原型补）----
    # 这些表的字段名跟 DS-160 完全不同（「姓（中文）」而不是「姓氏」），
    # 不补规则的话整张表会全落进 ask，等于告诉客人 28 格全靠你自己填，
    # 而这套系统的卖点恰恰是「AI 能替你省掉几格」。放在最后：
    # 上面 DS-160 的规则更具体，先让它们匹。
    (('姓（中文）', '名（中文）', '国民身份证', '身份证号码', '出生省份',
      '民族', '详细地址'), ('ocr', '身份证 / 户口本', 0)),
    (('姓（拼音）', '名（拼音）', '护照类别', '护照号码', '签发地点',
      '签发日期', '有效期至', '签发机关'), ('ocr', '护照资料页', 0)),
    (('职业状况', '职位名称', '公司地址', '公司电话'), ('ocr', '在职证明', 0)),
    (('旅行目的', '预计入境日期', '预计离境日期', '在日逗留时间',
      '逗留时间', '停留天数上限'), ('sys', '订单与产品信息', 0)),
    (('手机号码',), ('sys', '订单联系方式', 0)),
    # 曾用名、婚姻状况、学校信息证件上都没有，只能问本人；
    # 「曾经是否去过日本 / 上次停留天数」影响审核，答错会被认定为不实申报
    (('曾用名', '婚姻状况', '学校地址', '学校电话'), ('ask', '客户本人填答', 0, 0)),
    (('曾经是否去过', '上次停留天数'), ('ask', '客户本人确认', 1, 0)),
    # 入境口岸选定后不能从别的口岸入境，船公司/航司名也要跟机票一致，填错影响入境
    (('入境口岸', '船舶或航空公司名称'), ('ask', '客户本人确认', 1, 0)),
]


# 填写类型：客户端问卷按这个渲染控件——是否题给两个按钮、国家走标准字典、
# 组合信息展开成一组子项。只标「文本」等于把渲染难题甩给前端。
# 顺序有讲究：「是否…吗？」必须先判成是否题，否则会被后面的「国家」「日期」抢走。
TYPE_RULES = [
    (('审查所有信息', '确认页'), 'action'),
    (('密保问题',), 'group'),
    (('是否', '吗？', '吗?'), 'bool'),
    (('上传',), 'file'),
    (('日期', '有效期'), 'date'),
    (('出生国家', '原籍国', '签发国家', '其他永久居民国家', '国家/地区'), 'country'),
    (('性别', '婚姻状况', '证件类型', '教育程度', '之行的目的', '具体签证类型',
      '与联系人的关系', '支付费用实体'), 'select'),
    (('父母信息', '父母在美情况', '配偶', '过去5年工作信息', '联系人姓名', '联系人地址',
      '家庭住址', '邮寄地址', '居住地址', '社交媒体', '遗失', '语言与族裔',
      '曾用名', '预计到达日期'), 'group'),
]

# 单选题的选项值。国家/地区不列在这里——那是标准字典，走 country 类型。
TYPE_OPTS = {
    '性别': ['男', '女'],
    '婚姻状况': ['已婚', '未婚', '离异', '丧偶', '分居', '民事结合'],
    '护照/旅行证件类型': ['普通护照', '公务护照', '外交护照', '旅行证', '其他'],
    '教育程度': ['高中及以下', '大专', '本科', '硕士', '博士'],
    '此次美国之行的目的': ['旅游观光', '商务出访', '探亲访友', '过境', '就医', '其他'],
    '具体签证类型': ['B1 商务', 'B2 旅游', 'B1/B2 商务旅游'],
    '与联系人的关系': ['亲属', '朋友', '商务伙伴', '酒店', '学校', '其他'],
    '支付费用实体': ['申请人本人', '其他个人', '本人所在公司', '美国接待方', '其他组织'],
}


def guess_type(name, dft_no=0):
    """返回 (填写类型, 选项 JSON 字符串)。"""
    import json
    t = 'text'
    for keys, v in TYPE_RULES:
        if any(k in name for k in keys):
            t = v
            break
    # 系统默认代答否的一律是是非题。安全背景那五组按关键词会落到 text，得掰回来。
    if t == 'text' and dft_no:
        t = 'bool'
    for k, v in TYPE_OPTS.items():
        if k in name:
            return t, json.dumps(v, ensure_ascii=False)
    return t, ''


def classify(name):
    """返回 (src, src_from, risk, dft_no)。非高风险规则只写三位，补 0。"""
    for keys, val in RULES:
        for k in keys:
            if k in name:
                return val if len(val) == 4 else val + (0,)
    return ('ask', '客户本人填答', 0, 0)


# 表格第 6 列「现有填表字段覆盖范围」用了三种符号，含义不同，不能一律当已覆盖
COVER = {'✅': 'full', '√': 'part', '⭕️': 'part', '⭕': 'part'}


# ---------------------------------------------------------------
# 表格读取。三种格式统一成 (工作表名, 行列表) 再交给 parse()。
#
# 全部用标准库解，不依赖 openpyxl / python-docx：
# 本机就没装 openpyxl（`import openpyxl` 直接 ModuleNotFoundError），
# 也就是说页面上传 .xlsx 的那条路一直是断的，只是没人试过。
# xlsx 与 docx 都是 zip + XML，标准库够用，装不上第三方库的环境也能跑。
# ---------------------------------------------------------------
_NS_X = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
_NS_W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def _col_idx(ref):
    """单元格坐标 "AB12" → 列序号 27（0 基）。跳过的空列要靠它补齐。"""
    n = 0
    for ch in ref:
        if ch.isalpha():
            n = n * 26 + (ord(ch.upper()) - 64)
        else:
            break
    return n - 1


def _xlsx(path):
    import xml.etree.ElementTree as ET
    z = _open_zip(path)
    # 共享字符串表：xlsx 把重复文本抽到这里，单元格里存的是下标
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')):
            shared.append(''.join(t.text or '' for t in si.iter(_NS_X + 't')))
    names = {}
    try:
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        for i, sh in enumerate(wb.iter(_NS_X + 'sheet'), 1):
            names['sheet%d.xml' % i] = sh.get('name') or ('Sheet%d' % i)
    except Exception:
        pass
    out = []
    for nm in sorted(n for n in z.namelist() if n.startswith('xl/worksheets/sheet')):
        rows = []
        for row in ET.fromstring(z.read(nm)).iter(_NS_X + 'row'):
            cells = []
            for c in row.iter(_NS_X + 'c'):
                j = _col_idx(c.get('r') or '')
                if j < 0:
                    j = len(cells)
                while len(cells) < j:
                    cells.append('')
                if c.get('t') == 's':                       # 共享字符串
                    v = c.find(_NS_X + 'v')
                    txt = shared[int(v.text)] if v is not None and v.text else ''
                elif c.get('t') == 'inlineStr':             # 内联字符串
                    txt = ''.join(t.text or '' for t in c.iter(_NS_X + 't'))
                else:
                    v = c.find(_NS_X + 'v')
                    txt = v.text if v is not None and v.text else ''
                cells.append(txt or '')
            rows.append(tuple(cells))
        out.append((names.get(nm.split('/')[-1], nm.split('/')[-1]), rows))
    return out


def _open_zip(path):
    """xlsx / docx 本质都是 zip。打不开时给一句中文的、说得清下一步的提示，
    不要把 zipfile 的 "File is not a zip file" 直接抛到界面上。"""
    import zipfile
    try:
        return zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        raise ValueError(_OLD_MSG if _is_ole2(path)
                         else '这个文件打不开，可能已损坏或不是真正的 Excel / Word 文件。'
                              '请用 Excel 或 Word 重新打开并另存一份后再上传。')


def _docx(path):
    """从 Word 里读表格。唐美芳 2026-08-31：「官方字段表可以支持doc文件不」。
    只读 <w:tbl>，正文段落不要——字段表就是一张表格，正文那些说明文字混进来
    只会把表头识别搅乱。一个单元格里的多段合成换行，跟 Excel 里手动换行的效果一致。"""
    import xml.etree.ElementTree as ET
    z = _open_zip(path)
    doc = ET.fromstring(z.read('word/document.xml'))
    out = []
    for ti, tbl in enumerate(doc.iter(_NS_W + 'tbl'), 1):
        rows = []
        for tr in tbl.findall('.//' + _NS_W + 'tr'):
            cells = []
            for tc in tr.findall('./' + _NS_W + 'tc'):
                ps = []
                for para in tc.iter(_NS_W + 'p'):
                    ps.append(''.join(t.text or '' for t in para.iter(_NS_W + 't')))
                cells.append('\n'.join(x for x in ps if x))
            rows.append(tuple(cells))
        # Word 里一份文档常有多张表（说明表、字段表、变更记录），
        # 这里全都返回，由 parse() 按表头挑出真正的字段表
        out.append(('表格 %d' % ti, rows))
    return out


# 老式 Word / Excel（97-2003）是 OLE2 复合文档，头 8 个字节是这串固定签名。
# 光看后缀不够：唐美芳 2026-09-01 传的文件后缀是新格式，内容却是 97-2003 存的，
# 于是一路走到 zipfile 抛出英文的 "File is not a zip file"，人根本看不懂。
_OLE2_SIG = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_OLD_MSG = ("这份文件是 Word/Excel 97-2003 的老格式（.doc / .xls），"
            "系统只能解析新格式。请在 Word 或 WPS 里打开它，"
            "「文件 › 另存为」时把保存类型选成 .docx 或 .xlsx，再上传另存出来的文件。")


def _is_ole2(path):
    try:
        with open(path, "rb") as fh:
            return fh.read(8) == _OLE2_SIG
    except OSError:
        return False


def _sheets(path):
    """统一成 (工作表名, 行列表) 的形式，让 xlsx / docx / csv 走同一套解析逻辑。"""
    low = path.lower()
    if not low.endswith('.csv') and _is_ole2(path):
        raise ValueError(_OLD_MSG)
    if low.endswith('.csv'):
        import csv
        import io
        # 运营从 Excel 另存出来的 csv 多半带 BOM，utf-8-sig 才不会把首列表头读成乱码
        with io.open(path, encoding='utf-8-sig', newline='') as fh:
            return [('CSV', [tuple(r) for r in csv.reader(fh)])]
    if low.endswith('.docx'):
        return _docx(path)
    if low.endswith('.doc') or low.endswith('.xls'):
        # 走到这说明文件头也不是 OLE2，多半是改了后缀的别的东西
        raise ValueError(_OLD_MSG)
    return _xlsx(path)


# 列名同义词。运营手里的表来自各个渠道，列名五花八门：
# 「类别 / 板块 / 分类」都是信息板块，「字段名称 / 字段名」都是具体字段名称。
# 唐美芳 2026-09-01 传一份 EVUS 字段表传了 5 次才成功——前 4 次都是因为
# 她表里写的是「类别 / 字段名称 / 字段说明」，跟这里写死的列名对不上。
# 能认就认，不要逼着人改列名。
ALIAS = {
    'sec': ['信息板块', '类别', '板块', '分类', '模块', '所属板块', '分组'],
    'name': ['具体字段名称', '字段名称', '字段名', '具体字段', '名称'],
    'note': ['填报说明', '字段说明', '填写说明', '说明', '备注'],
    'help': ['Help', '帮助提示', '官方说明', '官方帮助'],
    'notice': ['重要提醒', '注意事项', '提醒', '风险提示'],
    'cover': ['覆盖范围', '现有覆盖', '是否覆盖'],
}


def parse(path):
    """读 Excel / Word / CSV，返回字段列表。
    表头需含「信息板块」与「具体字段名称」两列，列名支持 ALIAS 里的常见同义写法。"""
    for title, data in _sheets(path):
        hdr, hrow = None, 0
        for i, row in enumerate(data[:6], 1):
            cells = [(c or '').strip() if isinstance(c, str) else '' for c in row]
            # 必须同时认出「板块」与「字段名」两列才算表头行
            has_sec = any(any(a in c for a in ALIAS['sec']) for c in cells if c)
            has_name = any(any(a in c for a in ALIAS['name']) for c in cells if c)
            if has_sec and has_name:
                hdr, hrow = cells, i
                break
        if not hdr:
            continue

        def col(*names):
            for n in names:
                for j, h in enumerate(hdr):
                    if n in h:
                        return j
            return -1

        # 同义词按顺序匹配：写在前面的更精确，先匹配它
        ci = {k: col(*v) for k, v in ALIAS.items()}
        out, sec, sort = [], '', 0
        for row in data[hrow:]:
            g = lambda k: (str(row[ci[k]]).strip()
                           if 0 <= ci[k] < len(row) and row[ci[k]] is not None else '')
            if g('sec'):
                sec = g('sec')
            # 官方字段名在表格里常带换行（中英对照、举例），列表里展示成一行更好读
            name = ' '.join(g('name').split())
            if not name or not sec:
                continue
            # 跳过模板自带的填写说明行（form_tpl.py 生成的模板第二行）。
            # 运营照着模板填时未必会删掉这一行，不跳过就会多导进一条垃圾字段。
            if name.startswith('【') or sec.startswith('【'):
                continue
            src, src_from, risk, dft_no = classify(name)
            ftype, opts = guess_type(name, dft_no)
            sort += 1
            out.append({'section': sec, 'name': name, 'fill_note': g('note'),
                        'help_text': g('help'), 'notice': g('notice'),
                        'src': src, 'src_from': src_from, 'risk': risk, 'dft_no': dft_no,
                        'ftype': ftype, 'options': opts,
                        'covered': COVER.get(g('cover'), 'none'),
                        'required': 1, 'sort': sort})
        if out:
            return title, out
    raise ValueError('没找到表头行：表格里必须有「信息板块」和「具体字段名称」两列')


def diff(existing, incoming):
    """按 (板块, 字段名) 比对，给导入预览用：哪些是新增、哪些是内容有变动、哪些没变。"""
    old = {(f['section'], f['name']): f for f in existing}
    add, upd, same = [], [], []
    for f in incoming:
        o = old.get((f['section'], f['name']))
        if not o:
            add.append(f)
        elif any(str(o.get(k) or '') != str(f.get(k) or '')
                 for k in ('fill_note', 'help_text', 'notice', 'src', 'covered')):
            upd.append(f)
        else:
            same.append(f)
    gone = [o for k, o in old.items() if k not in {(f['section'], f['name']) for f in incoming}]
    return {'add': add, 'upd': upd, 'same': same, 'gone': gone}
