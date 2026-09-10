import asyncio,json
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1600,"height":1300})
        errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        pg.on("console",lambda m:errs.append("C:"+m.text) if m.type=="error" and "favicon" not in m.text else None)
        await pg.goto(BASE+"#guide"); await pg.wait_for_timeout(900)
        await pg.evaluate("async r=>{await login(r);}","sup")
        await pg.evaluate("()=>{location.hash='#ubk/board';}")
        for _ in range(50):
            await pg.wait_for_timeout(300)
            if len((await pg.inner_text("#main")).strip())>=200: break
        await pg.wait_for_timeout(1200)
        # 表头
        print("表头:", await pg.eval_on_selector_all("#main table th","e=>e.map(x=>x.innerText.trim())"))
        # 搜索项
        print("搜索项:", await pg.eval_on_selector_all("#main .srch label span, #main .srch .f>span","e=>e.map(x=>x.innerText.trim())"))
        # 第一行
        row=await pg.eval_on_selector("#main table tr","e=>e.innerText.replace(/\\n/g,' | ')")
        print("首行:", row[:180])
        print("按钮:", await pg.eval_on_selector_all("#main table tr:nth-child(2) button","e=>e.map(x=>x.innerText.trim())"))
        print("催办按钮全表:", await pg.eval_on_selector_all("#main [data-wurge]","e=>e.length"))
        print("JS:",[e for e in errs][:3])
        await pg.screenshot(path="/tmp/wo_board.png")
        await b.close()
asyncio.run(main())
