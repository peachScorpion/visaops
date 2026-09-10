# -*- coding: utf-8 -*-
"""找出「ask(...).then(调接口)」这种写法：ask 一点确定就关窗，
接口再失败时弹窗已经没了，填过的内容全丢，得重填一遍
（唐美芳 2026-09-01：「提交报错的时候，不要关闭弹窗，不然还得二次填写」）。

正确写法是把提交交给 ask 的第 4 个参数 onSubmit——成功才关窗，失败保留弹窗。
"""
import re, os

FILES = [f for f in os.listdir('web/js') if f.endswith('.js')]
pat = re.compile(r"ask\(", re.S)
bad = []
for f in sorted(FILES):
    s = open('web/js/' + f).read()
    for m in pat.finditer(s):
        # 取这次 ask 调用之后的一段，看是不是 .then( 里直接调 api
        seg = s[m.end():m.end() + 900]
        # 括号配平，找出 ask(...) 的收尾
        depth, i = 1, 0
        while i < len(seg) and depth:
            if seg[i] == '(':
                depth += 1
            elif seg[i] == ')':
                depth -= 1
            i += 1
        tail = seg[i:i + 320]
        head = seg[:i]
        if '.then(' in tail[:12] and 'api(' in tail:
            has_onsubmit = head.count('function (') >= 1 and re.search(r",\s*function\s*\(", head[-260:])
            line = s[:m.start()].count('\n') + 1
            bad.append((f, line, tail.strip().replace('\n', ' ')[:110], bool(has_onsubmit)))
print("ask().then(api) 共 %d 处：\n" % len(bad))
for f, ln, t, ok in bad:
    print("  %-16s:%-5d %s" % (f, ln, t))
