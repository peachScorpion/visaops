import asyncio
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
CASES=[("sales","csp/book","CSP 产品订购门户",1500),
       ("sales","csp/home","CSP 工作台",1500),
       ("sales","csp/pdetail/1","CSP 产品详情",1500),
       ("sales","youmi/book","有米 签证频道",1500),
       ("sales","youmi/book/1","有米 产品详情",1500)]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1500,"height":1200})
        for role,route,name,w in CASES:
            await pg.goto(BASE+"#guide"); await pg.wait_for_timeout(800)
            await pg.evaluate("async r=>{await login(r);}",role)
            await pg.evaluate("r=>{location.hash='#'+r;}",route)
            await pg.wait_for_timeout(3500)
            info=await pg.evaluate("""()=>{
              const el=document.querySelector('.pm-tg');
              if(!el) return {found:false};
              const r=el.getBoundingClientRect();
              const cs=getComputedStyle(el);
              return {found:true,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),
                      vis:cs.visibility,disp:cs.display,txt:el.innerText.replace(/\\n/g,'/')};
            }""")
            print(name, "→", info)
            await pg.screenshot(path="/tmp/pm_%s.png"%route.replace("/","_"))
        await b.close()
asyncio.run(main())
