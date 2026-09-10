import asyncio
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1600,"height":1300})
        errs=[]; pg.on("pageerror",lambda e:errs.append("PE:"+str(e)))
        pg.on("console",lambda m:errs.append("C:"+m.text) if m.type=="error" and "favicon" not in m.text else None)
        await pg.goto(BASE+"#guide"); await pg.wait_for_timeout(900)
        await pg.evaluate("async r=>{await login(r);}","sup")
        await pg.evaluate("()=>{location.hash='#ubk/board';}")
        for _ in range(50):
            await pg.wait_for_timeout(300)
            if len((await pg.inner_text("#main")).strip())>=200: break
        await pg.wait_for_timeout(1500)
        t=(await pg.inner_text("#main")).strip()
        print("正文字数",len(t)); print(t[:500].replace("\n"," | "))
        print("JS:",errs[:4])
        await pg.screenshot(path="/tmp/wo_board.png")
        await b.close()
asyncio.run(main())
