import asyncio
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        for w in (1920,1500):
            pg=await b.new_page(viewport={"width":w,"height":1000})
            await pg.goto(BASE+"#guide"); await pg.wait_for_timeout(1800)
            await pg.screenshot(path=f"/tmp/sc_guide_{w}.png")
            
            await pg.goto(BASE+"#customer/shop"); await pg.reload(); await pg.wait_for_timeout(3000)
            await pg.screenshot(path=f"/tmp/sc_cust_{w}.png")
            
            await pg.goto(BASE+"#csp/book"); await pg.reload(); await pg.wait_for_timeout(2500)
            await pg.screenshot(path=f"/tmp/sc_csp_{w}.png")
            await pg.close()
        await b.close()
asyncio.run(main())
print("done")
