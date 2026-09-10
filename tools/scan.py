#!/usr/bin/env python3
"""全站页面回归扫描：逐个路由渲染，抓 JS 报错 / 页面不存在 / 横向溢出 / 空白页。
用法：python3 scan.py [视口宽,默认1920 1500]"""
import asyncio, sys
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8820/visaops/"
ROUTES = """guide
csp:book csp:create csp:home csp:mats csp:orders csp:pdetail csp:refund csp:tasks csp:recv
customer:travelers customer:addrs customer:list customer:mats customer:me customer:orders customer:refund customer:result
customer:service customer:shop customer:supp customer:track youmi:home youmi:acquire youmi:book youmi:book/1 youmi:book/c-%E6%97%A5%E6%9C%AC youmi:create/1 youmi:orders youmi:me youmi:tasks youmi:customers youmi:recv youmi:refund youmi:odetail/VS-26080046 customer:form customer:form/46 customer:odetail/VS-26080046 customer:odetail/VS-26080049
fin:advance fin:orders fin:payable fin:recv fin:refund
lead:approve lead:hold lead:load lead:orders lead:reject lead:tasks
ops:advance ops:dash ops:forms ops:fullvers ops:orders ops:policies ops:prod ops:prod/1 ops:prodb ops:edit/1 ops:pkgs/1 ops:review/1
ops:prodc ops:samples
ubk:board ubk:wo/VW-26080008 uom:wo/VW-26080008 ubk:fullvers ubk:fullvers/1 ubk:pkgs/1 ubk:edit/1 ubk:srefund ubk:bill fin:srefund fin:prepay fin:bill ubk:create ubk:home ubk:orders ubk:product/1 ubk:products ubk:settle
uom:advance uom:batch uom:board uom:deliver uom:tasks
uom:odetail/VS-26080013 csp:odetail/VS-26080050 ubk:odetail/VS-26080013 fin:odetail/VS-26080013
fin:recvdetail/S2608210029 ops:recvdetail/S2608210029 ops:recv ops:refund lead:recv
ops:refunddetail/RF-26090104 fin:refunddetail/RF-26090104 lead:refunddetail/RF-26090104
ops:homecfg ops:prods ops:board ops:tasks ops:batch ops:deliver ops:load ops:hold ops:approve ops:reject ops:payable ops:odetail/VS-26080013""".split()

async def run(w):
    bad = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": w, "height": 1000})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("requestfailed", lambda r: None)
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "favicon" not in m.text else None)
        for r in ROUTES:
            errs.clear()
            url = BASE + "#" + (r if r == "guide" else r.replace(":", "/", 1))
            await pg.goto(url); await pg.reload()
            # 等正文真的出来再判，不要固定睡 1.4 秒就下结论。
            # tasks 那几页数据量大、首次渲染要 2 秒上下，固定等待会随机报
            # 「几乎空白」，每次还报在不同页上——2026-09-03 之前每轮都要人工复核一遍。
            # ⚠️ 等待条件必须看 #main，不能看 body：body 里光左侧导航就有 200 多字，
            # 一进页面立刻满足阈值就 break 了，而这时 #main 还是空的——
            # 判定又是拿 #main 的字数算，于是稳定报「几乎空白(4字)」。
            # 这个错配是这几个月每轮扫描都要人工复核的那批假告警的真正原因。
            for _ in range(30):
                await pg.wait_for_timeout(200)
                try:
                    if len((await pg.inner_text("#main")).strip()) >= 40:
                        break
                except Exception:
                    pass
            await pg.wait_for_timeout(400)          # 再给一点时间让剩下的块补齐
            txt = (await pg.inner_text("#main")).strip()
            ovf = await pg.evaluate(
                "()=>document.documentElement.scrollWidth - document.documentElement.clientWidth")
            msg = []
            errs2 = [e for e in errs if "favicon" not in e and "404" not in e]
            if errs2:           msg.append("JS:" + errs2[0][:70])
            if "页面不存在" in txt: msg.append("路由丢失")
            if len(txt) < 40:   msg.append("几乎空白(%d字)" % len(txt))
            if ovf > 2:         msg.append("横向溢出 %dpx" % ovf)
            print(("  ok  " if not msg else "  !!  ") + r + ("  " + " / ".join(msg) if msg else ""))
            if msg: bad.append((r, msg))
        await b.close()
    return bad

async def main():
    widths = [int(x) for x in sys.argv[1:]] or [1920, 1500]
    allbad = []
    for w in widths:
        print("\n=== 视口 %d ===" % w)
        allbad += [(w,) + t for t in await run(w)]
    print("\n共 %d 页 × %d 宽 · 问题 %d" % (len(ROUTES), len(widths), len(allbad)))
    for x in allbad: print("  ", x)

asyncio.run(main())
