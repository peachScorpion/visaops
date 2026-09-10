import asyncio
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
R=["csp:tasks","uom:batch","ops:prodb","ops:prodc"]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1500,"height":1000})
        errs=[]
        pg.on("pageerror",lambda e:errs.append("PE:"+str(e)))
        pg.on("console",lambda m:errs.append("C:"+m.text) if m.type=="error" and "favicon" not in m.text else None)
        for r in R:
            errs.clear()
            await pg.goto(BASE+"#"+r.replace(":","/",1)); await pg.reload()
            for _ in range(40):
                await pg.wait_for_timeout(200)
                try:
                    if len((await pg.inner_text("#main")).strip())>=40: break
                except Exception: pass
            await pg.wait_for_timeout(600)
            t=(await pg.inner_text("#main")).strip()
            e2=[e for e in errs if '404' not in e]
            print(r,"→",len(t),"字", ("| "+t[:40].replace("\n"," ")) if t else "", ("| ERR "+str(e2[:2]) if e2 else ""))
        await b.close()
asyncio.run(main())
