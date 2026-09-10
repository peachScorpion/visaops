import asyncio
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
async def load(pg,minlen=300):
    for _ in range(70):
        await pg.wait_for_timeout(300)
        if len((await pg.inner_text("#main")).strip())>=minlen: return
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1900,"height":1300})
        errs=[]; pg.on("pageerror",lambda e:errs.append("PE:"+str(e)))
        pg.on("console",lambda m:errs.append("C:"+m.text) if m.type=="error" and "favicon" not in m.text else None)
        await pg.goto(BASE+"#guide"); await pg.wait_for_timeout(900)
        await pg.evaluate("async r=>{await login(r);}","op1")
        await pg.evaluate("()=>{sessionStorage.setItem('wo_scope','all');location.hash='#uom/board';}")
        await load(pg); await pg.wait_for_timeout(2000)
        print("表头:", await pg.eval_on_selector_all("#main table th","e=>e.map(x=>x.innerText.trim())"))
        print("页签:", await pg.eval_on_selector_all("#main .subtabs a","e=>e.map(x=>x.innerText.trim())"))
        print("查询项:", await pg.eval_on_selector_all("#main .srch label s","e=>e.map(x=>x.innerText.trim())"))
        print("首行:", (await pg.eval_on_selector("#main table tr:nth-child(2)","e=>e.innerText")).replace("\n"," | ")[:260])
        print("首行按钮:", await pg.eval_on_selector_all("#main table tr:nth-child(2) button","e=>e.map(x=>x.innerText.trim())"))
        await pg.screenshot(path="/tmp/uom_board.png")
        print("JS:",[e for e in errs if '404' not in e][:3])
        await b.close()
asyncio.run(main())
