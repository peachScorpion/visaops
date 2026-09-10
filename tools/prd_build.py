# -*- coding: utf-8 -*-
"""把 prd/src/*.md 渲染成一份带侧栏目录、可全文搜索、可直接打印成 PDF 的 HTML。

不引第三方 markdown 库：这台机器上没有，且 PRD 用到的语法就那几种
（标题 / 表格 / 列表 / 引用 / 代码 / 粗体），自己写一个反而可控——
表格要能带 colspan 之外的东西也不需要。
"""
import html as H
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "prd/src")

# ---------- 行内 ----------
def inl(s):
    s = H.escape(s)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<i>\1</i>', s)
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', s)
    s = s.replace('&lt;br&gt;', '<br>')
    return s


def md(text):
    out, i, lines = [], 0, text.split("\n")
    toc = []
    while i < len(lines):
        ln = lines[i]

        # 代码块
        if ln.startswith("```"):
            j = i + 1
            buf = []
            while j < len(lines) and not lines[j].startswith("```"):
                buf.append(lines[j]); j += 1
            out.append('<pre>' + H.escape("\n".join(buf)) + '</pre>')
            i = j + 1; continue

        # 表格
        if ln.startswith("|") and i + 1 < len(lines) and re.match(r'^\|[\s:|-]+\|$', lines[i + 1]):
            head = [c.strip() for c in ln.strip("|").split("|")]
            j = i + 2
            rows = []
            while j < len(lines) and lines[j].startswith("|"):
                rows.append([c.strip() for c in lines[j].strip("|").split("|")]); j += 1
            out.append('<div class="tw"><table><thead><tr>' +
                       "".join("<th>%s</th>" % inl(c) for c in head) + "</tr></thead><tbody>" +
                       "".join("<tr>" + "".join("<td>%s</td>" % inl(c) for c in r) + "</tr>"
                               for r in rows) + "</tbody></table></div>")
            i = j; continue

        # 标题
        m = re.match(r'^(#{1,4})\s+(.*)$', ln)
        if m:
            lv, t = len(m.group(1)), m.group(2).strip()
            aid = "s%d" % len(toc)
            if lv <= 3:
                toc.append((lv, t, aid))
            out.append('<h%d id="%s">%s</h%d>' % (lv, aid, inl(t), lv))
            i += 1; continue

        # 引用（用作「口径 / 原话」块）
        if ln.startswith(">"):
            # 引用块里的空 `>` 行是段落分隔，不是一段孤立的 `>`
            buf, cur = [], []
            while i < len(lines) and lines[i].startswith(">"):
                t = lines[i][1:].strip()
                if t:
                    cur.append(t)
                elif cur:
                    buf.append(" ".join(cur)); cur = []
                i += 1
            if cur:
                buf.append(" ".join(cur))
            out.append('<blockquote>%s</blockquote>'
                       % "".join("<p>%s</p>" % inl(b) for b in buf))
            continue

        # 验收清单：`- [ ] xxx` 渲染成真能勾的复选框，勾选状态存 localStorage，
        # 唐美芳照着这份清单验收时可以分几次点完，刷新不丢。
        if re.match(r'^\s*[-*]\s+\[[ xX]\]\s+', ln):
            buf = []
            while i < len(lines) and re.match(r'^\s*[-*]\s+\[[ xX]\]\s+', lines[i]):
                mk = re.match(r'^\s*[-*]\s+\[([ xX])\]\s+(.*)$', lines[i])
                buf.append((mk.group(1).lower() == "x", mk.group(2))); i += 1
            out.append('<div class="ckl">' + "".join(
                '<label class="ck"><input type="checkbox"%s><span>%s</span></label>'
                % (" checked" if d else "", inl(t)) for d, t in buf) + '</div>')
            continue

        # 列表
        if re.match(r'^\s*([-*]|\d+\.)\s+', ln):
            tag = "ul" if re.match(r'^\s*[-*]\s', ln) else "ol"
            buf = []
            while i < len(lines) and re.match(r'^\s*([-*]|\d+\.)\s+', lines[i]):
                buf.append(re.sub(r'^\s*([-*]|\d+\.)\s+', '', lines[i])); i += 1
            out.append("<%s>%s</%s>" % (tag, "".join("<li>%s</li>" % inl(b) for b in buf), tag))
            continue

        if ln.strip() == "---":
            out.append("<hr>"); i += 1; continue
        if ln.strip() == "":
            i += 1; continue

        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(
                r'^(#{1,4}\s|\||>\s|```|\s*([-*]|\d+\.)\s|---$)', lines[i]):
            buf.append(lines[i]); i += 1
        out.append("<p>%s</p>" % inl(" ".join(buf)))
    return "\n".join(out), toc


CSS = """
*{box-sizing:border-box}body{margin:0;font:15px/1.75 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1f2937;background:#f6f7f9}
#nav{position:fixed;left:0;top:0;bottom:0;width:280px;background:#111827;color:#cbd5e1;overflow:auto;padding:0 0 40px}
#nav h1{font-size:15px;color:#fff;margin:0;padding:18px 20px 6px;line-height:1.5}
#nav .sub{font-size:12px;color:#94a3b8;padding:0 20px 14px;border-bottom:1px solid #1f2937}
#nav .bk{font-size:12px;color:#64748b;padding:14px 20px 4px;letter-spacing:.05em}
#nav a{display:block;color:#cbd5e1;text-decoration:none;font-size:13px;padding:5px 20px;border-left:3px solid transparent}
#nav a:hover{background:#1f2937;color:#fff}
#nav a.l2{padding-left:30px}#nav a.l3{padding-left:42px;font-size:12.5px;color:#94a3b8}
#nav a.on{background:#1e293b;color:#fff;border-left-color:#2563eb}
#main{margin-left:280px;padding:0 0 80px}
.wrap{max-width:980px;margin:0 auto;padding:28px 32px}
.doc{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:8px 36px 36px;margin-bottom:26px}
h1{font-size:26px;margin:26px 0 6px;padding-bottom:10px;border-bottom:2px solid #111827}
h2{font-size:20px;margin:34px 0 8px;padding-left:11px;border-left:4px solid #2563eb}
h3{font-size:16.5px;margin:24px 0 6px;color:#111827}
h4{font-size:15px;margin:18px 0 4px;color:#374151}
p{margin:9px 0}li{margin:3px 0}
code{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:1px 5px;font:12.5px/1.5 Menlo,Consolas,monospace;color:#b91c1c}
pre{background:#0f172a;color:#e2e8f0;padding:14px 16px;border-radius:8px;overflow:auto;font:12.5px/1.7 Menlo,Consolas,monospace}
blockquote{margin:12px 0;padding:10px 14px;background:#fffbeb;border-left:4px solid #f59e0b;color:#78350f;border-radius:0 6px 6px 0}
blockquote p{margin:0}blockquote p+p{margin-top:8px}
.tw{overflow:auto;margin:12px 0}
table{border-collapse:collapse;width:100%;font-size:13.5px;background:#fff}
th{background:#f1f5f9;text-align:left;font-weight:600;color:#0f172a}
th,td{border:1px solid #e2e8f0;padding:7px 10px;vertical-align:top}
tbody tr:nth-child(even){background:#fafbfc}
hr{border:0;border-top:1px dashed #d1d5db;margin:26px 0}
.ckl{margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
.ck{display:flex;gap:10px;align-items:flex-start;padding:9px 13px;border-top:1px solid #f1f5f9;cursor:pointer;font-size:14px}
.ckl .ck:first-child{border-top:0}
.ck:hover{background:#f8fafc}
.ck input{margin:4px 0 0;width:16px;height:16px;flex:none;accent-color:#2563eb}
.ck input:checked+span{color:#94a3b8;text-decoration:line-through}
.ckdone{position:sticky;top:58px;z-index:8;font-size:12.5px;color:#64748b;padding:4px 0}
#sbox{position:sticky;top:0;z-index:9;background:#f6f7f9;padding:14px 32px;border-bottom:1px solid #e5e7eb}
#sbox input{width:100%;max-width:980px;padding:9px 13px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;outline:none}
#sbox input:focus{border-color:#2563eb}
.hit{background:#fef08a}
.badge{display:inline-block;font-size:11.5px;padding:1px 7px;border-radius:99px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;margin-left:6px}
@media print{#nav,#sbox{display:none}#main{margin:0}.doc{border:0;padding:0}}
"""

JS = """
var links=[].slice.call(document.querySelectorAll('#nav a')),
    heads=[].slice.call(document.querySelectorAll('h1[id],h2[id],h3[id]'));
window.addEventListener('scroll',function(){
  var y=window.scrollY+120,cur=null;
  heads.forEach(function(h){if(h.offsetTop<=y)cur=h.id});
  links.forEach(function(a){a.classList.toggle('on',a.getAttribute('href')==='#'+cur)});
});
var CKS=document.querySelectorAll('.ck input');
CKS.forEach(function(b,i){
  var k='visaops-prd-ck-'+i;
  if(localStorage.getItem(k)==='1')b.checked=true;
  b.addEventListener('change',function(){
    localStorage.setItem(k,b.checked?'1':'0');upd();});
});
function upd(){
  document.querySelectorAll('.ckl').forEach(function(l){
    var a=l.querySelectorAll('input'),n=l.querySelectorAll('input:checked').length,
        t=l.previousElementSibling;
    if(t&&t.classList.contains('ckdone'))t.textContent='已勾 '+n+' / '+a.length;
  });
}
document.querySelectorAll('.ckl').forEach(function(l){
  var d=document.createElement('div');d.className='ckdone';
  l.parentNode.insertBefore(d,l);});
upd();
var box=document.getElementById('q');
box.addEventListener('input',function(){
  var v=this.value.trim();
  document.querySelectorAll('.hit').forEach(function(s){
    s.outerHTML=s.textContent});
  if(v.length<2)return;
  var re=new RegExp(v.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'),'gi'),n=0;
  (function walk(el){
    for(var i=0;i<el.childNodes.length;i++){var c=el.childNodes[i];
      if(c.nodeType===3&&re.test(c.nodeValue)){
        var sp=document.createElement('span');
        sp.innerHTML=c.nodeValue.replace(re,function(m){n++;return '<span class="hit">'+m+'</span>'});
        el.replaceChild(sp,c);}
      else if(c.nodeType===1&&['PRE','SCRIPT','STYLE'].indexOf(c.tagName)<0)walk(c);}
  })(document.getElementById('main'));
  var f=document.querySelector('.hit');if(f)f.scrollIntoView({block:'center'});
});
"""


def main():
    files = sorted(f for f in os.listdir(SRC) if f.endswith(".md"))
    body, nav = [], []
    for f in files:
        t = open(os.path.join(SRC, f), encoding="utf-8").read()
        h, toc = md(t)
        # 每篇的锚点 id 加文件前缀，避免跨篇撞号
        pre = f[:2]
        h = re.sub(r'id="s(\d+)"', lambda m: 'id="%s_s%s"' % (pre, m.group(1)), h)
        body.append('<div class="doc">%s</div>' % h)
        for lv, title, aid in toc:
            nav.append('<a class="l%d" href="#%s_%s">%s</a>' % (lv, pre, aid, H.escape(title)))
    out = ("<!doctype html><html lang=zh-CN><meta charset=utf-8>"
           "<meta name=viewport content='width=device-width,initial-scale=1'>"
           "<title>VisaOps 需求规格说明书</title><style>%s</style>"
           "<div id=nav><h1>VisaOps<br>需求规格说明书</h1>"
           "<div class=sub>众信旅游 · 签证业务系统</div>%s</div>"
           "<div id=main><div id=sbox><input id=q placeholder='全文搜索：页面名 / 按钮名 / 状态码 / 字段名 / 接口路径'></div>"
           "<div class=wrap>%s</div></div><script>%s</script></html>"
           % (CSS, "".join(nav), "".join(body), JS))
    dst = os.path.join(ROOT, "prd/index.html")
    open(dst, "w", encoding="utf-8").write(out)
    print("%s  %d 篇  %d KB" % (dst, len(files), len(out) // 1024))


if __name__ == "__main__":
    main()
