import asyncio
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1500,"height":1200})
        errs=[]; pg.on("pageerror",lambda e:errs.append("PE:"+str(e)))
        pg.on("console",lambda m:errs.append("C:"+m.text) if m.type=="error" else None)
        await pg.goto(BASE+"#guide"); await pg.wait_for_timeout(800)
        await pg.evaluate("async r=>{await login(r);}","sales")
        await pg.evaluate("()=>{location.hash='#csp/book';}"); await pg.wait_for_timeout(3200)
        print("点前 hash:", await pg.evaluate("()=>location.hash"))
        await pg.click(".pm-ic"); await pg.wait_for_timeout(3000)
        print("点后 hash:", await pg.evaluate("()=>location.hash"))
        print("pm-ic 数:", await pg.evaluate("()=>document.querySelectorAll('.pm-ic').length"))
        print("localStorage:", await pg.evaluate("()=>localStorage.getItem('visaops:pmode')"))
        print("#main 前100:", (await pg.inner_text("#main")).strip()[:100].replace("\n"," | "))
        print("errs:",errs[:4])
        await pg.screenshot(path="/tmp/dbg_csp.png")
        await b.close()
asyncio.run(main())
