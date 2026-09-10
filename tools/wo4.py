import asyncio,json
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1600,"height":1300})
        errs=[]; pg.on("pageerror",lambda e:errs.append("PE:"+str(e)))
        await pg.goto(BASE+"#guide"); await pg.wait_for_timeout(900)
        await pg.evaluate("async r=>{await login(r);}","sup")
        # 直接查接口，确认 form_avail
        j=await pg.evaluate("async()=>{const r=await api('/sup/orders');return (r.list||[]).filter(x=>x.name==='程雨桐').map(x=>({no:x.no,name:x.name,country:x.country,stage:x.stage,form:x.form,form_avail:x.form_avail}));}")
        print("程雨桐工单:", json.dumps(j,ensure_ascii=False))
        j2=await pg.evaluate("async()=>{const r=await api('/sup/orders');const l=r.list||[];return {total:l.length, avail:l.filter(x=>x.form_avail).length, na:l.filter(x=>!x.form_avail).map(x=>x.country).filter((v,i,a)=>a.indexOf(v)===i)};}")
        print("统计:", json.dumps(j2,ensure_ascii=False))
        print("JS:",errs[:2])
        await b.close()
asyncio.run(main())
