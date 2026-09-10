import asyncio,sys
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
r=sys.argv[1]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1500,"height":1000})
        errs=[]; pg.on("pageerror",lambda e:errs.append("PE:"+str(e)))
        pg.on("console",lambda m:errs.append("C:"+m.text) if m.type=="error" and "favicon" not in m.text else None)
        await pg.goto(BASE+"#"+r.replace(":","/",1)); await pg.reload()
        for i in range(60):
            await pg.wait_for_timeout(500)
            t=(await pg.inner_text("#main")).strip()
            if len(t)>=40:
                print("第 %.1f 秒渲染出来，%d 字"%((i+1)*0.5,len(t))); break
        else:
            print("30 秒仍未渲染:", t[:60])
        print("ERR:",[e for e in errs if '404' not in e][:3])
        await b.close()
asyncio.run(main())
