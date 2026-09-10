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
        res=await pg.evaluate("""()=>{
          const el=document.querySelector('.pm-tg.uz');
          const hits=[];
          for(const ss of document.styleSheets){
            let rules; try{rules=ss.cssRules}catch(e){continue}
            for(const r of rules){
              if(!r.selectorText) continue;
              try{ if(el.matches(r.selectorText)) hits.push({sel:r.selectorText, css:r.style.cssText.slice(0,200), href:(ss.href||'').split('/').pop()}); }catch(e){}
            }
          }
          const a=el.querySelector('a'); const ra=a.getBoundingClientRect();
          return {hits, aRect:[Math.round(ra.width),Math.round(ra.height)], aDisp:getComputedStyle(a).display};
        }""")
        print(json.dumps(res,ensure_ascii=False,indent=1)[:3000])
        await b.close()
asyncio.run(main())
