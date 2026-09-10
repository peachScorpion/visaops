# -*- coding: utf-8 -*-
"""从源码里挑出面向用户的提示文案，按口语化特征打分。
只看后台三端（UOM/CSP-PC/UBK）——C 端与有米是给客户和销售在手机上用的，口语是刻意的。"""
import re, os, sys

BACK = ['v-ubk-ops', 'v-lead-fin', 'v-uom', 'v-csp', 'v-form', 'v-crm',
        'v-settle3', 'v-ordlist', 'v-orddetail', 'v-ubkpkg', 'v-task', 'v-homecfg',
        'v-countrycfg', 'v-ordinfo', 'ap-picker']
ORAL = ['没关系', '手一快', '白填', '骗人', '糊弄', '翻遍', '省得', '免得', '拿不准',
        '不用管', '干脆', '压根', '根本', '其实', '反正', '就行', '就好', '呢。', '啦', '嘛',
        '你', '咱', '点了才', '弄清', '搞', '对不上', '说不清', '一路', '当场', '回头',
        '怎么', '什么', '一堆', '好几', '而已', '罢了', '看着', '省事', '麻烦',
        # 注意：短词会切进正常词里。'别的' 会命中「识别的字段」，
        # '搞' 之类单字同理，加词前先想清楚会不会误伤。
        '直接就', '也行', '都行', '得了', '算了', '不然', '要不']
# 注释不算（那是给我自己看的），只挑真正会渲染出去的字符串
STR = re.compile(r"'((?:[^'\\\n]|\\.){10,260})'")


def is_comment(src, pos):
    line_start = src.rfind('\n', 0, pos) + 1
    head = src[line_start:pos]
    if '//' in head or head.lstrip().startswith('*'):
        return True
    # 块注释：看前面最近的 /* 与 */
    a, b = src.rfind('/*', 0, pos), src.rfind('*/', 0, pos)
    return a > b


out = []
for f in BACK:
    p = 'web/js/%s.js' % f
    if not os.path.exists(p):
        continue
    s = open(p).read()
    for m in STR.finditer(s):
        t = m.group(1)
        if not re.search(r'[一-龥]', t):
            continue
        if is_comment(s, m.start()):
            continue
        if t.count('<') > 6:          # 整段 HTML 模板，不是文案
            continue
        hits = [w for w in ORAL if w in t]
        if hits:
            out.append((f, len(hits), hits[:4], t))
out.sort(key=lambda x: -x[1])
print("命中 %d 处\n" % len(out))
for f, n, h, t in out:
    print("[%s] %s" % (f, h))
    print("   ", t[:200])
