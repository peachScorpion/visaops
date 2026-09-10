"""扫全站页面文本里是否还有「放行」这类内部黑话"""
import asyncio, sys
from playwright.async_api import async_playwright
BASE = "http://127.0.0.1:8820/visaops/"
import re
ROUTES = open('scan.py',encoding='utf-8').read()
ROUTES = re.search(r'ROUTES = """(.*?)""".split\(\)', ROUTES, re.S).group(1).split()
BAD = re.compile(r'放行|资金闸门')
async def main():
    hit=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1680,"height":1000})
        for r in ROUTES:
            url=BASE+"#"+(r if r=="guide" else r.replace(":","/",1))
            await pg.goto(url); await pg.reload(); await pg.wait_for_timeout(1200)
            t=await pg.inner_text("#main")
            m=BAD.findall(t)
            if m:
                hit.append((r,set(m)))
                print("  !! %-30s %s" % (r, set(m)))
        await b.close()
    print("\n扫 %d 页 · 命中 %d 页" % (len(ROUTES), len(hit)))
asyncio.run(main())
