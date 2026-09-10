# -*- coding: utf-8 -*-
"""把 ask(...).then(提交) 改成 ask(..., 提交)。

ask 的第 4 个参数 onSubmit 由 modal 托管：成功才关窗，失败保留弹窗与已填内容
（唐美芳 2026-09-01）。原来的写法是点确定先关窗、再调接口，接口一失败人就得重填。

只转换结构规整的那些：ask(...) 后紧跟 `.then(function (x) {` 且函数体里出现 api(。
转换后把链尾的 .catch(fail) 换成空 catch——错误已在 ask 内提示过，再提示一次是重复。
"""
import re, os, sys

FILES = sorted(f for f in os.listdir('web/js') if f.endswith('.js'))


def find_close(s, i):
    """i 指向 '(' 的下一个字符，返回配对 ')' 的下标"""
    d = 1
    while i < len(s) and d:
        c = s[i]
        if c == "'":                       # 跳过字符串
            i += 1
            while i < len(s) and s[i] != "'":
                i += 2 if s[i] == '\\' else 1
        elif c == '(':
            d += 1
        elif c == ')':
            d -= 1
            if not d:
                return i
        i += 1
    return -1


total = 0
for f in FILES:
    p = 'web/js/' + f
    s = open(p).read()
    out, i, n = [], 0, 0
    while True:
        k = s.find('ask(', i)
        if k < 0:
            out.append(s[i:])
            break
        # 排除 mask(/ task( 之类
        if k > 0 and (s[k - 1].isalnum() or s[k - 1] in '_.$'):
            out.append(s[i:k + 4])
            i = k + 4
            continue
        end = find_close(s, k + 4)
        if end < 0:
            out.append(s[i:k + 4])
            i = k + 4
            continue
        tail = s[end + 1:]
        m = re.match(r"\.then\(function \((\w+)\) \{", tail)
        if not m:
            out.append(s[i:end + 1])
            i = end + 1
            continue
        body_start = end + 1 + m.end()
        # 找这个 then 回调的收尾 '}'
        d, j = 1, body_start
        while j < len(s) and d:
            c = s[j]
            if c == "'":
                j += 1
                while j < len(s) and s[j] != "'":
                    j += 2 if s[j] == '\\' else 1
            elif c == '{':
                d += 1
            elif c == '}':
                d -= 1
            j += 1
        body = s[body_start:j - 1]
        after = s[j:]
        if 'api(' not in body or not after.startswith(')'):
            out.append(s[i:end + 1])
            i = end + 1
            continue
        # 拼成 ask(参数..., function (x) { body })
        inner = s[k + 4:end]
        out.append(s[i:k])
        out.append('ask(' + inner + ', function (' + m.group(1) + ') {' + body + '})')
        i = j + 1          # 跳过 then 回调收尾的 ')'
        n += 1
    s2 = ''.join(out)
    if n:
        # 链尾的 .catch(fail) 换成空 catch：错误已在 ask 内提示，别弹两次
        s2 = s2.replace('}).catch(fail);', '}).catch(function () { /* 失败已提示，弹窗保留 */ });')
        open(p, 'w').write(s2)
        print('%-16s 转换 %d 处' % (f, n))
        total += n
print('共 %d 处' % total)
