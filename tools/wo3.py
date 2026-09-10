import asyncio
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
        await pg.evaluate("()=>{location.hash='#ubk/board';}")
        for _ in range(50):
            await pg.wait_for_timeout(300)
            if len((await pg.inner_text("#main")).strip())>=200: break
        await pg.wait_for_timeout(1200)
        # 搜索 程雨桐
        await pg.fill("#main input[data-sk='name']" , "程雨桐") if await pg.query_selector("#main input[data-sk='name']") else None
        # 找不到就用第一个搜索输入框
        if not await pg.query_selector("#main input[data-sk='name']"):
            inp=(await pg.query_selector_all("#main input"))[0]
            await inp.fill("程雨桐")
        btns=await pg.query_selector_all("#main button")
        for x in btns:
            if (await x.inner_text()).strip()=="搜索": await x.click(); break
        await pg.wait_for_timeout(2000)
        rows=await pg.eval_on_selector_all("#main table tr","e=>e.map(x=>x.innerText.replace(/\\n/g,' | '))")
        for r in rows[:4]: print("行:",r[:200])
        print("---- 结果弹窗动态字段 ----")
        # 点第一条数据行的「登记签证结果」
        b2=await pg.query_selector_all("#main [data-res]")
        if b2:
            await b2[0].click(); await pg.wait_for_timeout(1200)
            async def vis():
                return await pg.eval_on_selector_all(".mask [data-fld]",
                  "e=>e.filter(x=>x.style.display!=='none').map(x=>x.querySelector('span').innerText.trim())")
            print("默认(出签):", await vis())
            await pg.select_option(".mask select[data-k='result']","reject"); await pg.wait_for_timeout(600)
            print("选拒签:", await vis())
            await pg.select_option(".mask select[data-k='result']","withdraw"); await pg.wait_for_timeout(600)
            print("选撤签:", await vis())
            await pg.select_option(".mask select[data-k='result']","ap"); await pg.wait_for_timeout(600)
            print("选行政审查:", await vis())
            await pg.screenshot(path="/tmp/wo_result.png")
        print("JS:",[e for e in errs if '404' not in e][:3])
        await b.close()
asyncio.run(main())
