import asyncio
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
async def txt(pg):
    await pg.wait_for_selector(".pm-ic",timeout=8000)
    return await pg.eval_on_selector(".pm-ic","e=>e.innerText+' | on='+e.classList.contains('on')")
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1500,"height":1200})
        errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        await pg.goto(BASE+"#guide"); await pg.wait_for_timeout(800)
        await pg.evaluate("async r=>{await login(r);}","sales")
        await pg.evaluate("()=>{localStorage.setItem('visaops:pmode','guest');location.hash='#csp/book';}")
        await pg.wait_for_timeout(3200)
        print("CSP 初始:", await txt(pg), "| 页面含结算价:", "结算价" in await pg.inner_text("#main"))
        await pg.click(".pm-ic"); await pg.wait_for_timeout(3000)
        print("CSP 切后:", await txt(pg), "| 页面含结算价:", "结算价" in await pg.inner_text("#main"))
        await pg.screenshot(path="/tmp/pmic_csp_on.png")

        await pg.evaluate("()=>{location.hash='#youmi/book';}"); await pg.wait_for_timeout(3200)
        print("有米频道(应保持结算):", await txt(pg))
        await pg.screenshot(path="/tmp/pmic_ym_on.png")
        await pg.evaluate("()=>{location.hash='#youmi/book/1';}"); await pg.wait_for_timeout(3200)
        print("有米详情:", await txt(pg), "| 含结算价条:", "结算价" in await pg.inner_text("#main"))
        await pg.screenshot(path="/tmp/pmic_ymdetail_on.png")
        await pg.click(".pm-ic"); await pg.wait_for_timeout(3000)
        print("详情切回:", await txt(pg), "| 含结算价条:", "结算价" in await pg.inner_text("#main"))
        print("JS 错误:",[e for e in errs][:3])
        await b.close()
asyncio.run(main())
