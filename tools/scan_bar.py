"""扫 UOM 下每个页面：底部有没有游离的操作按钮（不在 .od-bar/.wo-bar 里的末尾按钮组）"""
import asyncio, json
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8820/visaops/"
ROUTES = """uom:board uom:board/VW-26080025 uom:board/VW-26080001 uom:batch uom:deliver uom:tasks uom:advance
uom:odetail/VS-26080013 uom:odetail/VS-26080033
ops:dash ops:orders ops:forms ops:fullvers ops:prod ops:prodb ops:prodc ops:samples ops:policies
ops:advance ops:recv ops:refund ops:payable ops:board ops:tasks ops:batch ops:deliver ops:load
ops:hold ops:approve ops:reject ops:homecfg ops:prods
ops:odetail/VS-26080013 ops:recvdetail/S2608210029
fin:advance fin:orders fin:payable fin:recv fin:refund fin:srefund fin:prepay fin:bill
fin:odetail/VS-26080013 fin:recvdetail/S2608210029
lead:approve lead:hold lead:load lead:orders lead:reject lead:tasks lead:recv""".split()

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1680,"height":900})
        for r in ROUTES:
            await pg.goto(BASE+"#"+r.replace(":","/",1)); await pg.reload(); await pg.wait_for_timeout(1500)
            info=await pg.evaluate("""()=>{
              const m=document.querySelector('#main'); if(!m) return null;
              const kids=[...m.children];
              const last=kids[kids.length-1];
              const bar=m.querySelector(':scope>.od-bar,:scope>.wo-bar');
              // 页面末尾游离按钮组：最后一个直接子元素里含按钮，但它不是 bar
              let loose=null;
              for(let i=kids.length-1;i>=Math.max(0,kids.length-2);i--){
                const k=kids[i];
                if(k.classList.contains('od-bar')||k.classList.contains('wo-bar')) break;
                const bs=k.querySelectorAll('button.btn');
                if(bs.length){ // 只关心「卡片最下方独立一排」的
                  const grp=[...k.querySelectorAll('.btns')].pop();
                  if(grp && grp.parentElement && !grp.closest('table')){
                    loose={cls:k.className.slice(0,30),n:bs.length,
                           txt:[...grp.querySelectorAll('button')].map(x=>x.textContent.trim()).slice(0,6)};
                  }
                }
                break;
              }
              return {bar: !!bar, barCls: bar?bar.className:null, last:last?last.className.slice(0,28):null, loose};
            }""")
            flag = "BAR" if info and info.get('bar') else ("loose" if info and info.get('loose') else "-")
            print("%-28s %-6s %s" % (r, flag, json.dumps(info.get('loose'),ensure_ascii=False) if info and info.get('loose') else ""))
        await b.close()
asyncio.run(main())
