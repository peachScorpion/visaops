import asyncio, json
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
CASES=[("sales","csp/book","CSP门户"),("sales","youmi/book","有米频道"),
       ("sales","youmi/book/c-日本","有米列表"),("sales","youmi/book/1","有米详情")]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1500,"height":1200})
        errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        for role,route,name in CASES:
            errs.clear()
            await pg.goto(BASE+"#guide"); await pg.wait_for_timeout(800)
            await pg.evaluate("async r=>{await login(r);}",role)
            await pg.evaluate("r=>{location.hash='#'+r;}",route)
            await pg.wait_for_timeout(3500)
            info=await pg.evaluate("""()=>{
              return [...document.querySelectorAll('.pm-ic')].map(el=>{
                const r=el.getBoundingClientRect();
                return {cls:el.className,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),txt:el.innerText};
              });
            }""")
            print(name,"→",json.dumps(info,ensure_ascii=False))
            if errs: print("  JS:",errs[:2])
            await pg.screenshot(path="/tmp/pmic_%s.png"%route.replace("/","_"))
        await b.close()
asyncio.run(main())
