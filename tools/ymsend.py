import asyncio
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1500,"height":1300})
        errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        pg.on("console",lambda m:errs.append("C:"+m.text) if m.type=="error" and "favicon" not in m.text else None)
        await pg.goto(BASE+"#guide"); await pg.wait_for_timeout(900)
        await pg.evaluate("async r=>{await login(r);}","sales")
        await pg.evaluate("()=>{location.hash='#youmi/book/1';}")
        for _ in range(50):
            await pg.wait_for_timeout(300)
            if len((await pg.inner_text("#main")).strip())>=300: break
        await pg.wait_for_timeout(1500)
        print("底部按钮:", await pg.eval_on_selector_all(".ph-foot *","e=>e.map(x=>x.innerText.trim()).filter(t=>t&&t.length<20)"))
        await pg.click("[data-send]"); await pg.wait_for_timeout(2000)
        print("弹窗标题:", await pg.eval_on_selector(".mask h3, .mask .mh, .mask .modal-h","e=>e.innerText") if await pg.query_selector(".mask h3, .mask .mh, .mask .modal-h") else "?")
        txt=await pg.eval_on_selector(".mask","e=>e.innerText")
        print("弹窗内容:", txt.replace("\n"," | ")[:400])
        qr=await pg.eval_on_selector(".ys-qz img","e=>({w:e.naturalWidth||e.width,src:e.src.slice(0,60),ok:e.complete})")
        print("二维码:", qr)
        await pg.screenshot(path="/tmp/ym_send.png")
        print("JS:",[e for e in errs if '404' not in e][:3])
        await b.close()
asyncio.run(main())
