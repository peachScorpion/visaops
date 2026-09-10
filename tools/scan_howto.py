# -*- coding: utf-8 -*-
"""抓出 howto([...]) 里的操作说明，按口语特征打分。
后台的操作说明是给内部员工看的作业指引，要用规范书面语；
但不能写成法条——「为什么这么做」的解释要留着，否则只知步骤不知原因，照样做错。"""
import re, os

BACK = ['v-ubk-ops', 'v-lead-fin', 'v-uom', 'v-csp', 'v-form', 'v-crm',
        'v-settle3', 'v-ordlist', 'v-orddetail', 'v-ubkpkg', 'v-task', 'v-homecfg']
# 单字与常见书面词会误伤：'别' 切进「识别 / 类别」，'一并' 本身就是书面语，
# '拿' 切进「拿到」也未必口语。检测词宁可保守，漏报人工再看一遍就行，
# 误报多了会逼着人把正常表达也改掉。
ORAL = ['不是走流程', '填掉', '推不出来', '只能人工', '甩进', '就地改', '先去', '别把',
        '不要就地', '弄清', '搞定', '省得', '免得', '白填', '干脆', '压根', '直接就',
        '就行', '就好', '才行', '顺手', '回头', '当场', '这么', '那么',
        '怎么办', '看什么', '多少钱', '好几', '一堆', '没法', '发布不了', '看着办']
out = []
for f in BACK:
    p = 'web/js/%s.js' % f
    if not os.path.exists(p):
        continue
    s = open(p).read()
    for m in re.finditer(r"\['([^']{2,20})',\s*'((?:[^'\\]|\\.){10,})'", s):
        title, body = m.group(1), m.group(2)
        hits = [w for w in ORAL if w in body or w in title]
        if hits:
            out.append((f, s[:m.start()].count('\n') + 1, title, hits[:3], body[:120]))
print("命中 %d 条\n" % len(out))
for f, ln, t, h, b in out:
    print("[%s:%d] 「%s」 %s" % (f, ln, t, h))
    print("    " + b)
