# -*- coding: utf-8 -*-
"""后台三端（CSP-PC / UOM / UBK）面向用户的文案口语化扫描 · 第三版。
第二版词表只盯「呢啦嘛你咱」那类语气词，已经清干净了；
唐美芳 2026-09-09 指出 CSP 分享弹窗「展示文案还是偏口语化」，
说明真正剩下的是**称谓与句式**：客人 / 看到的是 / 那一端 / 这条 …
这一版专扫这些。"""
import re, os
BACK = ['v-csp', 'v-uom', 'v-ubk-ops', 'v-ubkwo', 'v-ubkpkg', 'v-lead-fin',
        'v-settle3', 'v-orddetail', 'v-ordinfo', 'v-task', 'v-form', 'v-crm']
ORAL = ['客人', '看到的是', '那一端', '这条', '那条', '这张', '那张', '一眼',
        '点一下', '点了', '按一下', '弄', '搞', '拿到', '给客', '发过来',
        '不用再', '不用管', '要不然', '省得', '免得', '干脆', '直接就',
        '好几', '一堆', '挺', '很快就', '马上就', '就能', '就会', '就行', '就好',
        '别的', '别人', '自己人', '咱', '我们这边', '他那边', '手里', '手上']
STR = re.compile(r"'((?:[^'\\\n]|\\.){8,300})'")

def is_comment(src, pos):
    ls = src.rfind('\n', 0, pos) + 1
    head = src[ls:pos]
    if '//' in head or head.lstrip().startswith('*'):
        return True
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
        if not re.search(r'[一-龥]', t) or is_comment(s, m.start()):
            continue
        if t.count('<') > 6:
            continue
        hits = [w for w in ORAL if w in t]
        if hits:
            ln = s[:m.start()].count('\n') + 1
            out.append((f, ln, len(hits), hits[:4], t))
out.sort(key=lambda x: (-x[2], x[0]))
print("命中 %d 处\n" % len(out))
for f, ln, n, h, t in out:
    print("[%s:%d] %s" % (f, ln, h))
    print("    ", t[:210])
