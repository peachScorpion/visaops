import asyncio,json
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
        # 找一个处理中(G2)的工单，看有没有「登记办理进展」
        j=await pg.evaluate("""async()=>{const r=await api('/sup/orders');const l=r.list||[];
          const g2=l.filter(x=>x.stage==='G2')[0]||{};
          return {g2:{no:g2.no,name:g2.name,app_id:g2.app_id,cgi:g2.cgi_receipt,appt:g2.appt_no,aid:g2.applicant_id},
                  g1:(l.filter(x=>x.stage==='G1')[0]||{}).applicant_id};}""")
        print("接口字段:", json.dumps(j,ensure_ascii=False))
        await pg.evaluate("()=>{location.hash='#ubk/board';}")
        for _ in range(60):
            await pg.wait_for_timeout(300)
            if len((await pg.inner_text("#main")).strip())>=300: break
        await pg.wait_for_timeout(1500)
        # 切到「处理中」页签
        for a in await pg.query_selector_all("#main [data-tab], #main .tabs a, #main .subtab a"):
            if "处理中" in (await a.inner_text()): await a.click(); break
        await pg.wait_for_timeout(2000)
        print("处理中首行按钮:", await pg.eval_on_selector_all("#main table tr:nth-child(2) button","e=>e.map(x=>x.innerText.trim())"))
        # 材料清单页
        aid=j["g1"]
        await pg.evaluate("a=>{location.hash='#ubk/mats/'+a;}",aid)
        for _ in range(60):
            await pg.wait_for_timeout(300)
            if len((await pg.inner_text("#main")).strip())>=300: break
        await pg.wait_for_timeout(1200)
        print("材料页首行按钮:", await pg.eval_on_selector_all("#main table tr:nth-child(2) button","e=>e.map(x=>x.innerText.trim())"))
        print("JS:",[e for e in errs if '404' not in e][:3])
        await pg.screenshot(path="/tmp/ubk_mats.png")
        await b.close()
asyncio.run(main())
