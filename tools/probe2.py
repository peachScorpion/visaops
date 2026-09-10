import asyncio, json
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1500,"height":1200})
        await pg.goto(BASE+"#guide"); await pg.wait_for_timeout(800)
        await pg.evaluate("async r=>{await login(r);}","sales")
        await pg.evaluate("()=>{location.hash='#csp/book';}"); await pg.wait_for_timeout(3500)
        info=await pg.evaluate("""()=>{
          const out=[];
          document.querySelectorAll('.pm-tg').forEach(el=>{
            const r=el.getBoundingClientRect(); const cs=getComputedStyle(el);
            let chain=[]; let n=el;
            while(n&&n!==document.body){ chain.push(n.tagName+'.'+(n.className||'').toString().slice(0,30)); n=n.parentElement; }
            out.push({rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
              pos:cs.position, alignSelf:cs.alignSelf, disp:cs.display, html:el.outerHTML.slice(0,160), chain:chain});
          });
          return out;
        }""")
        print(json.dumps(info,ensure_ascii=False,indent=1)[:2500])
        await b.close()
asyncio.run(main())
