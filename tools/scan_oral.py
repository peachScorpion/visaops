import asyncio,re,json
from playwright.async_api import async_playwright
B="http://127.0.0.1:8820/visaops/"
PAGES=[("ops","orders"),("ops","prods"),("ops","forms"),("ops","fullvers"),("ops","approve"),
       ("ops","payable"),("ops","sample"),("uom","wo"),("uom","batch"),("uom","deliver"),
       ("uom","advance"),("lead","refund"),("lead","board"),("fin","recv"),("fin","prepay"),
       ("fin","bill"),("fin","srefund"),("csp","orders"),("csp","customers"),("csp","tasks"),
       ("ubk","products"),("ubk","orders"),("ubk","create"),("ubk","settle"),("ubk","addrs")]
ORAL = ['没关系','手一快','白填','骗人','糊弄','翻遍','省得','免得','拿不准','不用管',
        '干脆','压根','根本','其实','反正','就行','就好','呢','啦','嘛','你','咱',
        '点了才','弄','搞','对不上','说不清','一路','当场','回头','怎么','什么','一堆','好几']
async def m():
    found={}
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1600,"height":1100})
        for r,v in PAGES:
            await pg.goto(B+"#%s/%s"%(r,v)); await pg.reload(); await pg.wait_for_timeout(1900)
            arr=await pg.evaluate("""()=>[...document.querySelectorAll(
              '.hint,.note,.howto li i,.pageh p,.f .hint,.h5-gn,.sx-note li')]
              .map(x=>x.innerText.trim()).filter(t=>t.length>8)""")
            for t in arr:
                hits=[w for w in ORAL if w in t]
                if hits: found.setdefault(t,("%s:%s"%(r,v),hits))
        await b.close()
    print("口语化提示 %d 条\n"%len(found))
    for i,(t,(pg_,h)) in enumerate(sorted(found.items(),key=lambda x:-len(x[1][1]))[:45],1):
        print("[%2d] %-14s %s"%(i,pg_,h[:5]))
        print("     "+t[:170].replace('\n',' '))
    json.dump({t:v[0] for t,v in found.items()},open('/tmp/oral.json','w'),ensure_ascii=False,indent=1)
asyncio.run(m())
