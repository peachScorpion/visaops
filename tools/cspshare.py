import asyncio
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1500,"height":1100})
        errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        await pg.goto(BASE+"#guide"); await pg.wait_for_timeout(900)
        await pg.evaluate("async r=>{await login(r);}","sales")
        await pg.evaluate("()=>{location.hash='#csp/pdetail/1';}")
        for _ in range(60):
            await pg.wait_for_timeout(300)
            if len((await pg.inner_text("#main")).strip())>=400: break
        await pg.wait_for_timeout(1500)
        el=await pg.query_selector("[data-send]")
        print("分享按钮:", (await el.inner_text()).strip() if el else "无")
        if el:
            await el.click(); await pg.wait_for_timeout(2000)
            t=await pg.eval_on_selector(".mask","e=>e.innerText")
            print("弹窗:", t.replace("\n"," | ")[:420])
            await pg.screenshot(path="/tmp/csp_share.png")
        print("JS:",[e for e in errs][:2])
        await b.close()
asyncio.run(main())
