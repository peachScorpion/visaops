import asyncio, json
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
PAGES=[("wo","uom/board/VW-26080025"),("od","uom/odetail/VS-26080013"),
       ("recv","fin/recvdetail/S2608210029")]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1680,"height":900})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        for name,r in PAGES:
            errs.clear()
            await pg.goto(BASE+"#"+r); await pg.reload(); await pg.wait_for_timeout(2400)
            sc=await pg.evaluate("()=>{const m=document.querySelector('.main');m.scrollTo(0,m.scrollHeight*0.5);return 1}")
            await pg.wait_for_timeout(500)
            await pg.screenshot(path="/tmp/b_%s.png"%name)
            info=await pg.evaluate("""()=>{
              const el=document.querySelector('.od-bar,.wo-bar'); if(!el) return 'none';
              const cs=getComputedStyle(el),r=el.getBoundingClientRect();
              const mr=document.querySelector('.main').getBoundingClientRect();
              return {bg:cs.backgroundColor,w:r.width|0,x:r.x|0,bottomGap:(mr.bottom-r.bottom)|0,
                mainPB:getComputedStyle(document.querySelector('.main')).paddingBottom,
                sysuom:document.body.classList.contains('sys-uom')};
            }""")
            print(name, json.dumps(info,ensure_ascii=False), "ERR:" , errs[:1])
        await b.close()
asyncio.run(main())
