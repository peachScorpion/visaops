import asyncio
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
async def load(pg):
    for _ in range(50):
        await pg.wait_for_timeout(300)
        if len((await pg.inner_text("#main")).strip())>=200: return
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1600,"height":1300})
        errs=[]; pg.on("pageerror",lambda e:errs.append("PE:"+str(e)))
        pg.on("console",lambda m:errs.append("C:"+m.text) if m.type=="error" and "favicon" not in m.text else None)
        await pg.goto(BASE+"#guide"); await pg.wait_for_timeout(900)
        await pg.evaluate("async r=>{await login(r);}","sup")
        await pg.evaluate("()=>{location.hash='#ubk/board';}"); await load(pg); await pg.wait_for_timeout(1200)
        # 用工单号搜日本那张
        await pg.fill("#main input[data-q='no']","VW-26090446")
        await pg.click("#main [data-qgo]"); await pg.wait_for_timeout(2000)
        print("命中行:", await pg.eval_on_selector_all("#main table tr","e=>e.slice(1).map(x=>x.innerText.replace(/\\n/g,' | ').slice(0,150))"))
        print("该行按钮:", await pg.eval_on_selector_all("#main table tr:nth-child(2) button","e=>e.map(x=>x.innerText.trim())"))
        await pg.screenshot(path="/tmp/wo_jp.png")
        # 动态字段
        r=await pg.query_selector("#main [data-res]")
        if r:
            await r.click(); await pg.wait_for_timeout(1200)
            async def vis(): return await pg.eval_on_selector_all(".mask [data-fld]","e=>e.filter(x=>x.offsetParent!==null).map(x=>x.querySelector('span').innerText.trim())")
            print("默认(出签):", await vis())
            for v,label in [("reject","拒签"),("withdraw","撤签"),("ap","行政审查"),("pass","出签")]:
                await pg.select_option(".mask select[data-k='result']",v); await pg.wait_for_timeout(500)
                print("选%s:"%label, await vis())
            await pg.screenshot(path="/tmp/wo_result.png")
        print("JS:",[e for e in errs if '404' not in e][:3])
        await b.close()
asyncio.run(main())
