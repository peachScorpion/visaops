import asyncio
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
async def load(pg,n=300):
    for _ in range(80):
        await pg.wait_for_timeout(300)
        if len((await pg.inner_text("#main")).strip())>=n: return
async def one(pg,role,tab,label):
    await pg.goto(BASE+"#guide"); await pg.wait_for_timeout(900)
    await pg.evaluate("async r=>{await login(r);}",role)
    if role=='sup':
        await pg.evaluate("t=>{S.cache['q:ubkwo']={};S.cache['tab:ubkwo']=t;location.hash='#ubk/board';}",tab)
    else:
        await pg.evaluate("t=>{sessionStorage.setItem('wo_scope','all');S.cache['q:woboard']={};S.cache['tab:woboard']=t;location.hash='#uom/board';}",tab)
    await load(pg); await pg.wait_for_timeout(2200)
    print("=== %s / %s 列表按钮:"%(label,tab), await pg.eval_on_selector_all("#main table tr:nth-child(2) button","e=>e.map(x=>x.innerText.trim())"))
    b=await pg.query_selector("#main [data-wd]")
    if b:
        await b.click(); await load(pg,200); await pg.wait_for_timeout(2000)
        t=(await pg.inner_text("#main")).strip()
        print("    详情页:", t[:180].replace("\n"," | "))
        print("    区块:", await pg.eval_on_selector_all("#main .card h3, #main .wd-todo b","e=>e.map(x=>x.innerText.trim()).slice(0,8)"))
        print("    进展格:", await pg.eval_on_selector_all("#main .wd-st s","e=>e.map(x=>x.innerText.trim())"))
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1700,"height":1400})
        errs=[]; pg.on("pageerror",lambda e:errs.append("PE:"+str(e)))
        pg.on("console",lambda m:errs.append("C:"+m.text) if m.type=="error" and "favicon" not in m.text else None)
        await one(pg,"sup","G1","UBK")
        await one(pg,"sup","G2","UBK")
        await one(pg,"op1","G1","UOM")
        print("JS:",[e for e in errs if '404' not in e][:4])
        await pg.screenshot(path="/tmp/wd.png")
        await b.close()
asyncio.run(main())
