/* ============================================================
   有米小程序 —— 门店销售的移动端
   唐美芳 2026-08-31：「csp还有个移动端叫有米小程序，你也帮我整个产品预定中心的
   移动端，有签证频道，销售需要代客下单，同时能分享客人填写」。

   跟 CSP 工作台是同一个销售、同一套权限、同一份数据，只是换个终端，
   所以后端接口全部复用（/shop/products、/shop/product、/crm/customers、
   /order/create、/my/orders、/task/share），一行新接口都没加。

   视觉沿用 C 端那套 h5 语言 + 上一批加的 cardy / hue 卡片式排版；
   底部 Tab 三个：签证频道 / 我的订单 / 我的。
   ============================================================ */

/* 底部 Tab 对应 CSP 的一级功能域，名字与视图名都跟 CSP 一致
   （唐美芳 2026-09-01：「应该就是csp的移动端才对啊，你现在的页面结构和层级
   与csp不太一样」）。CSP 六个模块里，「客户填表 / 客户管理 / 财务管理」
   放进「我的」——手机底部四个 Tab 是上限，再多就点不准了。 */
/* 底部 Tab 照原型「优游有米」：工作台 / 收客 / YO / 分享 / 我的。
   中间那个 YO 是原型里的圆形主按钮，落到这套系统里就是「代客下单」——
   销售在店里最高频的动作，放在拇指最容易够到的位置。
   （唐美芳 2026-09-01：「请你 copy 这个链接里的有米小程序的页面」）*/
var YM_TAB_FULL = [
  ['home', '工作台', 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'],
  ['acquire', '收客', 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z'],
  ['__yo', 'YO', ''],
  ['orders', '订单', 'M7 3h10v18l-5-3-5 3V3ZM9.5 8h5M9.5 12h5'],
  ['me', '我的', 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z']
];

/* 演示态：只露出「签证频道 / 签证助手 / 订单」三个 Tab
   （唐美芳 2026-09-02：「我打算先只保留签证频道、agent 签证助手、订单，
   这三个底部菜单，其他页面暂时先隐藏……方便我和领导整体演示汇报」）。
   注意是**隐藏不是删除**：工作台 / 收客 / 客户档案 / 填表任务 / 收退款那些页面和路由
   全都还在，把下面这个开关改成 false 就整套回来——9/1 定的
   「有米＝CSP 的移动端，功能域一一对应」那条没有被推翻。 */
var YM_DEMO_SLIM = true;
var YM_TAB_SLIM = [
  ['book', '签证频道', 'M4 4h16v4H4zM4 10h16v10H4zM8 14h8'],
  ['agent', '签证助手', 'M12 2a5 5 0 0 1 5 5v1h1a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-1v1a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-1H6a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3h1V7a5 5 0 0 1 5-5zm-2.5 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'],
  ['orders', '订单', 'M7 3h10v18l-5-3-5 3V3ZM9.5 8h5M9.5 12h5']
];
function ymTabs() { return YM_DEMO_SLIM ? YM_TAB_SLIM : YM_TAB_FULL; }
var YM_TAB = YM_TAB_FULL;                 /* 兼容旧引用 */

function ymTabbar(cur) {
  var tabs = ymTabs();
  /* 精简态没有中间那颗 YO 圆钮：代客下单从签证频道点产品进去，
     三个平铺 Tab 比「两个 + 一颗圆钮」更稳，也不会让人以为少了一项。 */
  return '<div class="ph-tab ym-tab' + (YM_DEMO_SLIM ? ' slim' : '') + '">' +
    tabs.map(function (t) {
      if (t[0] === '__yo') {
        return '<a class="yo" data-ymtab="book" title="代客下单"><span>YO</span></a>';
      }
      return '<a data-ymtab="' + t[0] + '"' + (t[0] === cur ? ' class="on"' : '') + '>' +
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="' + t[2] + '"/></svg>' +
        '<span>' + t[1] + '</span></a>';
    }).join('') + '</div>';
}
/* 销售端的手机壳。品牌条写「优游有米」，与原型一致；
   主色是橙色（#FF6B3D → #FF8A5C），不是客户端那套玫红——两个手机长得一样，
   但站的立场不同，演示时一眼要能分清。 */
function ymPage(title, body, foot, tipTitle, tipHtml, back, tab, footCls, bodyCls) {
  var html = h5page(title, body, foot, tipTitle, tipHtml, back, tab, footCls, bodyCls || 'ym');
  /* 「零售价 / 结算价」开关每一页都在——销售随时可能把手机转给客人
     （唐美芳 2026-09-07）。放在页面内容里就会出现「这页有、那页没有」。
     2026-09-09 改成一枚 icon：**有搜索条的页面（签证频道、产品列表、搜索结果）
     跟着搜索条走**，摆在搜索框右侧（唐美芳指的位置）；其余页面没有搜索条，
     仍挂在状态条上，位置都在右上角，是同一枚 icon，不会认不出来。
     ⚠️ 挂在**状态条 .ph-bar** 上而不是标题栏 .ph-nav：产品详情这类沉浸式页面
     `.ph-nav{display:none}`、`.ph-bar` 绝对定位盖在头图上，挂标题栏会整个消失或被盖住。 */
  html = html.replace('<span>众信旅游 · 签证</span>',
    '<span>优游有米</span>' + (body.indexOf('pm-seg') < 0 ? pmIcon('pm-ymbar') : ''));
  if (tab) {
    html = html.replace(/<div class="ph-tab">[\s\S]*?<\/div>\s*<\/div><\/div>$/,
      ymTabbar(tab) + '</div></div>');
  }
  return html;
}
function ymBind(m, cur) {
  $$('[data-ymtab]', m).forEach(function (a) {
    a.onclick = function () { if (a.dataset.ymtab !== cur) go(a.dataset.ymtab); };
  });
  pmBind(m, reload);
}
function ymMoney(v) { return '¥' + money(v || 0); }

/* ---------------- 首页 = 签证频道 ---------------- */
/* ---------------- 签证频道 / 国家列表 / 搜索结果 ----------------
   路由与 CSP 一一对应（唐美芳 2026-09-01：「后续的国家签证产品列表、
   签证产品详情、下单全部基本可以和 pc 端逻辑保持一致，只不过是移动端的」）：
     youmi:book            → 签证频道       ＝ csp:book/visa
     youmi:book/c-<国家>   → 该国产品列表   ＝ csp:book/c-<国家>
     youmi:book/q-<关键词> → 搜索结果       ＝ csp:book/q-<关键词>
     youmi:book/<产品 id>  → 产品详情       ＝ csp:pdetail
   数据全部走同一批接口，价格、上架范围、毛利口径与电脑端完全一致。 */
VIEWS['youmi:book'] = function (m, param) {
  if (param && param.indexOf('c-') === 0) return ymList(m, { country: param.slice(2) });
  if (param && param.indexOf('q-') === 0) return ymList(m, { kw: param.slice(2) });
  if (param) return ymProduct(m, param);
  if (S.cache.ymKw) { var k = S.cache.ymKw; S.cache.ymKw = ''; return ymList(m, { kw: k }); }
  return ymVisa(m);
};

/* 签证频道：内容与 CSP 频道页同一套——横幅数据、服务承诺、按目的地找签证、
   低价优选、政策速递、办理流程，只是排成了一列。
   2026-09-15：增加首页配置读取，轮播图/热门国家/热门产品可运营配置。 */
function ymVisa(m) {
  return Promise.all([api('/shop/products'), api('/shop/policies'), api('/pub/home?channel=youmi'), ensureCcfg()])
    .then(function (rr) {
    var rows = [];
    (rr[0].list || []).forEach(function (p) {
      (p.suppliers || []).forEach(function (sp) { rows.push({ p: p, s: sp }); });
    });
    var pols = (rr[1].list || []).slice(0, 6);
    var home = rr[2] || { banner: [], country: [], product: [] };
    var byC = {};
    rows.forEach(function (x) {
      var lo = x.s.price_min;
      if (byC[x.p.country] === undefined || byC[x.p.country] > lo) byC[x.p.country] = lo;
    });
    var cs = Object.keys(byC);
    var fastest = rows.length
      ? Math.min.apply(null, rows.map(function (x) { return x.s.lead_min; })) : 0;
    var ct = S.cache.ymCt === undefined ? 0 : S.cache.ymCt;
    // 有配置则用配置，无配置则用默认逻辑（价格最低的前6个）
    var hotProducts = (home.product || []).length
      ? home.product.map(function (h) {
          var found = rows.filter(function (x) { return String(x.s.id) === String(h.sup_product_id); })[0];
          return found || null;
        }).filter(Boolean)
      : rows.slice().sort(function (a, b) { return a.s.price_min - b.s.price_min; }).slice(0, 6);
    // 头图：有配置用配置，无配置用默认
    var banner = (home.banner || [])[0] || { img: (CCFG['英国'] || {}).hero || 'img/dest/uk2.jpg', title: '去哪儿，就办哪儿的签证' };
    var heroImg = banner.img || ((CCFG['英国'] || {}).hero || 'img/dest/uk2.jpg');
    var heroTitle = (banner.title || '去哪儿，就办哪儿的签证').replace(/\n/g, ' ');

    /* 签证频道页原来没有搜索框（唐美芳 2026-09-07 指出）。
       原因是移植时的遗漏：CSP 电脑端的搜索框挂在**通栏 header** 上，各层级都在；
       有米没有通栏 header，搜索框要各页自己带——收客页和列表页都带了，
       唯独这张频道页漏了，销售在频道页里只能按目的地一格格找。
       用与列表页同一条 uy-top 搜索条，落到同一个 q- 路由，口径一致。 */
    var body =
      '<div class="uy-top"><div class="uy-search dark">' +
      '<input id="uy-kw3" placeholder="搜国家 / 签证类型 / 产品名">' +
      '<button data-search>搜索</button></div>' + pmIcon('pm-ymsch') + '</div>' +
      '<div class="uy-vhero" style="background-image:url(' +
      esc(heroImg) + ')">' +
      '<div class="tx"><s>ZHONGXIN VISA</s><b>' + esc(heroTitle) + '</b>' +
      '<p>覆盖 ' + cs.length + ' 个国家 · ' + rows.length + ' 款在售 · 最快 ' +
      fastest + ' 个工作日出签</p></div></div>' +
      '<div class="uy-kpi">' + [['材料预审', '按人群逐项裁剪'], ['进度透明', '五个节点有时间戳'],
        ['拒签退款', '按进度退未发生费用'], ['专人对接', '一单一位专员']].map(function (w) {
        return '<div><b>' + w[0] + '</b><s>' + w[1] + '</s></div>';
      }).join('') + '</div>' +

      '<div class="uy-wrap">' +
      '<div class="uy-h2"><b>按目的地找签证</b><a>灰色为覆盖计划中</a></div>' +
      '<div class="uy-cts">' + CONT.map(function (c, i) {
        return '<a data-ct="' + i + '"' + (i === ct ? ' class="on"' : '') + '>' +
          esc(c[0]) + '</a>';
      }).join('') + '</div>' +
      '<div class="uy-dgrid">' + (function () {
        var list = CONT[ct][1];
        var on = list.filter(function (c) { return byC[c] !== undefined; });
        var off = list.filter(function (c) { return byC[c] === undefined; });
        return on.concat(off).map(function (cn) {
          var ok = byC[cn] !== undefined;
          return '<a class="uy-dc' + (ok ? '' : ' off') + '"' +
            (ok ? ' data-c="' + esc(cn) + '"' : '') +
            ' style="background-image:url(' + esc(cardimg(cn)) + ')"><span>' +
            '<b>' + esc(cn) + '</b>' +
            (ok ? '<s>¥' + money(byC[cn]) + ' 起</s>' : '<s class="off">覆盖中</s>') +
            '</span></a>';
        }).join('');
      })() + '</div>' +

      '<div class="uy-h2"><b>低价优选</b><a data-all>全部产品 ›</a></div>' +
      hotProducts.map(function (x) { return ymPCard(x, 'price'); }).join('') +

      (pols.length
        ? '<div class="uy-h2"><b>签证政策速递</b><a>与客户端同一份口径</a></div>' +
          '<div class="uy-card">' + pols.map(function (x) {
            return '<a class="uy-pol" data-pol="' + x.id + '">' +
              '<b>' + esc(x.title) + '</b>' +
              '<s>' + esc(x.country || '') +
              (x.effect_at ? ' · ' + d10(x.effect_at) : '') + '</s></a>';
          }).join('') + '</div>'
        : '') +

      '<div class="uy-h2"><b>办理流程</b><a>每一步都有时间戳</a></div>' +
      '<div class="uy-card">' + flowList(CCFG_FLOW) + '</div>' +
      '</div>';

    m.innerHTML = pageH('有米小程序 · 签证频道',
      '内容与 CSP 电脑端的签证频道一致：同一批在售产品、同一套价格与上架口径，' +
      '<b>只是排成了手机上的一列</b>。往下的国家列表、产品详情、代客下单同理。') +
      ymPage('签证频道', body, '', '这一步在做什么',
        '销售在门店外、在客人面前就能翻产品。搜索框右侧那枚「零售 / 结算」按钮控制' +
        '结算价与毛利是否显示，默认客人模式；客户端的同一条产品无论如何都拿不到这两个数。',
        true, 'acquire');

    $('[data-back]', m).onclick = function () { go('acquire'); };
    var kwGo = function () {
      var v = $('#uy-kw3', m).value.trim();
      go('book', v ? 'q-' + v : '');
    };
    $('[data-search]', m).onclick = kwGo;
    $('#uy-kw3', m).onkeydown = function (e) { if (e.key === 'Enter') kwGo(); };
    $$('[data-ct]', m).forEach(function (a) {
      a.onclick = function () { S.cache.ymCt = +a.dataset.ct; reload(); };
    });
    /* 只认目的地卡片本身，别把页面上其它带 data-c 的元素也绑成跳转
       （CSP 那边就因为这个把联系人输入框绑成了「跳国家列表」） */
    $$('a[data-c]', m).forEach(function (a) {
      a.onclick = function () { go('book', 'c-' + a.dataset.c); };
    });
    var all = $('[data-all]', m);
    if (all) all.onclick = function () { go('book', 'q-'); };
    ymCardBind(m);
    $$('[data-pol]', m).forEach(function (a) {
      a.onclick = function () {
        var x = (rr[1].list || []).filter(function (y) { return y.id === +a.dataset.pol; })[0];
        if (!x) return;
        modal(x.title, '<div class="pad" style="font-size:13px;line-height:1.8">' +
          esc(x.body || x.summary || '') +
          (x.source ? '<div class="hint" style="margin-top:10px">来源：' + esc(x.source) + '</div>' : '') +
          '</div>', [{ t: '知道了' }]);
      };
    });
    ymBind(m, 'acquire');
  });
}

/* 产品卡：频道页与国家列表页共用，字段与 CSP 的 uzCard 对齐 */
/* 套餐行：与 C 端同一套口径——价格和时效必须来自同一个套餐，
   销售报价时按行念，不会出现「1,980 起、最快 7 天」这种拼出来的组合
   （唐美芳 2026-09-07）。销售视角多带一个毛利。 */
function ymPkRows(sp, sort) {
  var ks = (sp.pkgs || []).slice();
  if (!ks.length) return '';
  if (sort === 'lead') ks.sort(function (a, b) { return a.lead_days - b.lead_days; });
  var show = ks.slice(0, 2);
  return '<div class="uy-pks">' + show.map(function (k) {
    return '<span class="uy-pk" data-pk="' + sp.sup_product_id + ':' + k.id + '">' +
      '<b>' + esc(k.name) + '</b><s>' + k.lead_days + ' 工作日</s>' +
      '<i>' + ymMoney(k.retail) + '</i>' +
      /* 毛利 0 也要显示：销售看到空白会以为没算，实际是这一档确实不赚钱。
         客人模式下整段不渲染。 */
      (pmSales() && k.margin != null ? '<u>毛利 ' + ymMoney(k.margin) + '</u>' : '') + '</span>';
  }).join('') +
    (ks.length > show.length
      ? '<span class="uy-pkm" data-p="' + sp.sup_product_id + '">全部 ' +
        ks.length + ' 个套餐 ›</span>' : '') + '</div>';
}

function ymPCard(x, sort) {
  var p = x.p, sp = x.s;
  return '<a class="uy-pc" data-p="' + sp.sup_product_id + '">' +
    '<i style="background-image:url(' + esc(cardimg(p.country)) + ')"></i>' +
    '<div class="m"><b>' + esc(sp.name || p.name) + '</b>' +
    '<div class="tg"><span>' + esc(sp.supplier) + '</span>' +
    (p.visa_cat ? '<span>' + esc(p.visa_cat) + '</span>' : '') +
    '<span>' + esc(p.submit_city) + '</span>' +
    '<span>停留 ' + stayTx(p) + '</span></div>' +
    ymPkRows(sp, sort) +
    '<div class="ft"><div class="pr"><em>零售</em><b>' + ymMoney(sp.price_min) + '</b><u>起</u>' +
    (pmSales() && sp.margin ? '<span class="mg">毛利 ' + ymMoney(sp.margin) + ' 起</span>' : '') + '</div>' +
    '<span class="go">代客下单</span></div></div></a>';
}
function ymCardBind(m) {
  $$('[data-p]', m).forEach(function (a) {
    a.onclick = function () { go('book', a.dataset.p); };
  });
  /* 点具体套餐：详情页读 S.cache.ymPkg，直接停在这一档 */
  $$('[data-pk]', m).forEach(function (a) {
    a.onclick = function (e) {
      e.stopPropagation();
      var v = a.dataset.pk.split(':');
      S.cache.ymPkg = +v[1];
      go('book', v[0]);
    };
  });
}

/* 国家列表 / 搜索结果：与 CSP bkList 同一套筛选口径 */
function ymList(m, opt) {
  var country = opt.country || '', kw = opt.kw || '';
  return Promise.all([api('/shop/products' + (country ? '?country=' + encodeURIComponent(country) : '')),
                      ensureCcfg()]).then(function (rr) {
    var rows = [];
    (rr[0].list || []).forEach(function (p) {
      (p.suppliers || []).forEach(function (sp) { rows.push({ p: p, s: sp }); });
    });
    if (kw) {
      rows = rows.filter(function (x) {
        return ((x.s.name || '') + x.p.country + x.p.visa_type + x.s.supplier +
          x.p.submit_city).indexOf(kw) >= 0;
      });
    }
    var cat = S.cache.ymCat || '';
    var cats = [];
    rows.forEach(function (x) {
      if (x.p.visa_cat && cats.indexOf(x.p.visa_cat) < 0) cats.push(x.p.visa_cat);
    });
    var hit = cat ? rows.filter(function (x) { return x.p.visa_cat === cat; }) : rows;
    var sort = S.cache.ymSort || 'price';
    hit = hit.slice().sort(function (a, b) {
      return sort === 'lead' ? a.s.lead_min - b.s.lead_min : a.s.price_min - b.s.price_min;
    });

    var body =
      '<div class="uy-top"><div class="uy-search dark"><input id="uy-kw2" value="' + esc(kw) +
      '" placeholder="搜国家 / 签证类型 / 产品名"><button data-search>搜索</button></div>' +
      pmIcon('pm-ymsch') + '</div>' +
      (cats.length > 1
        ? '<div class="ym-ft">' +
          [['', '全部 ' + rows.length]].concat(cats.map(function (c) {
            return [c, c + ' ' + rows.filter(function (x) { return x.p.visa_cat === c; }).length];
          })).map(function (t) {
            return '<a data-cat="' + esc(t[0]) + '"' + (t[0] === cat ? ' class="on"' : '') + '>' +
              esc(t[1]) + '</a>';
          }).join('') + '</div>'
        : '') +
      '<div class="uy-wrap">' +
      '<div class="uy-h2"><b>' + (country ? esc(country) + '签证' : (kw ? '搜索结果' : '全部签证产品')) +
      '</b><a data-sort>' + (sort === 'lead' ? '按时效 ↑' : '按价格 ↑') + '</a></div>' +
      (hit.length ? hit.map(function (x) { return ymPCard(x, sort); }).join('')
        : '<div class="ym-empty"><i>☰</i>没有符合条件的产品</div>') +
      '</div>';

    m.innerHTML = pageH('有米小程序 · ' + (country ? country + '签证' : '签证产品'),
      '与 CSP 电脑端的国家列表同一批产品、同一套筛选与排序口径。') +
      ymPage(country ? country + '签证' : (kw ? '搜索：' + kw : '签证产品'),
        body, '', '这一步在做什么',
        '按签证类型筛、按价格或时效排。<b>结算价与毛利由搜索框右侧的「零售 / 结算」按钮控制</b>，' +
        '客人端看到的是同一条产品的零售价。', true, 'acquire');

    $('[data-back]', m).onclick = function () { go('book'); };
    $('[data-search]', m).onclick = function () {
      var v = $('#uy-kw2', m).value.trim();
      go('book', v ? 'q-' + v : '');
    };
    $('#uy-kw2', m).onkeydown = function (e) {
      if (e.key === 'Enter') { var v = e.target.value.trim(); go('book', v ? 'q-' + v : ''); }
    };
    $$('[data-cat]', m).forEach(function (a) {
      a.onclick = function () { S.cache.ymCat = a.dataset.cat; reload(); };
    });
    $('[data-sort]', m).onclick = function () {
      S.cache.ymSort = sort === 'lead' ? 'price' : 'lead'; reload();
    };
    ymCardBind(m);
    ymBind(m, 'acquire');
  });
}

/* 产品详情 —— 信息结构照 C 端小程序那一版（唐美芳 2026-09-01：
   「有米小程序的产品详情页可以按照 C 端小程序的信息结构来」）：
   沉浸式头图 → 产品名与卖点 → 四格摘要 → 产品特色 → 选择套餐 →
   产品详细说明（基本信息 / 所需材料 / 办理流程 / 常见问题）。
   跟 C 端的差别只在销售视角那几样：套餐上标结算价与毛利、底部按钮是「代客下单」，
   再加一个「生成分享海报」——这些客人端永远看不到。 */
var YM_PVT = [['base', '基本信息'], ['mat', '所需材料'], ['flow', '办理流程'], ['faq', '常见问题']];

function ymProduct(m, spid) {
  return Promise.all([api('/shop/product?id=' + spid), ensureCcfg()]).then(function (rr) {
    var d = rr[0], p = d.product;
    var pkgId = S.cache.ymPkg;
    if (!d.packages.some(function (k) { return k.id === pkgId; })) {
      pkgId = (d.packages[0] || {}).id;
    }
    var crowd = S.cache.ymCrowd || 'job';
    var showAll = false;
    var openMat = S.cache.ymOpenMat || (S.cache.ymOpenMat = {});

    /* 结构直接复用客户端那一套（.h5-crowd / .h5-mgrp / .h5-mat / .pv-faq）——
       这些样式早就写好了。上一版我在这里另编了 .pv-cw / .pv-mats 两个类名，
       CSS 里根本没有，于是材料清单挤成一坨没有样式
       （唐美芳 2026-09-01 截图指出）。复用现成的，不要重新发明。 */
    function tabHtml(tab) {
      if (tab === 'mat') {
        var list = (d.checklist && d.checklist[crowd]) || [];
        function grp(nec, label) {
          var sub = list.filter(function (i) { return i.necessity === nec; });
          if (!sub.length) return '';
          return '<div class="h5-mgrp"><span>' + label + '</span><em>' + sub.length + ' 项</em></div>' +
            sub.map(function (i) {
              var k = nec + i.id;
              return '<div class="h5-mat' + (openMat[k] ? ' open' : '') + '" data-m="' + k + '">' +
                '<div class="hd"><span class="nm"><b>' + esc(i.mat_name) + '</b><s>' +
                esc(i.attr_text) + ' × ' + i.copies + ' · ' + esc(i.way_text) + '</s></span>' +
                '<span class="rt">' + (i.sample ? '<u class="smp-f">有样例</u>' : '') +
                '<em>⌄</em></span></div>' +
                '<div class="bd">' + esc(i.require_text || '按使领馆要求提供') + '</div></div>';
            }).join('');
        }
        return '<div class="h5-crowd">' +
          [['job', '在职人员'], ['retire', '退休人员'], ['free', '自由职业者'],
           ['student', '在校学生'], ['child', '学龄前儿童']].map(function (x) {
            return '<a data-cw="' + x[0] + '" class="' + (crowd === x[0] ? 'on' : '') + '">' +
              x[1] + '</a>';
          }).join('') + '</div>' + grp('must', '必须材料') + grp('suggest', '建议材料');
      }
      if (tab === 'faq') {
        return '<div class="pv-faq">' + (typeof FAQ !== 'undefined' ? FAQ : []).map(function (q) {
          return '<div><b>' + esc(q[0]) + '</b><p>' + esc(q[1]) + '</p></div>';
        }).join('') + '</div>';
      }
      if (tab === 'flow') return flowList(d.flow);
      return '<div class="h5-kv">' +
        '<div><i>有效期</i><b>' +
        esc(validTx(p)) + '</b></div>' +
        '<div><i>入境次数</i><b>' +
        esc((ENTRIES[p.entries] || '').replace('入境', '')) + '</b></div>' +
        '<div><i>停留时间</i><b>' + stayTx(p) + '</b></div>' +
        '<div><i>是否面试</i><b>' + (p.need_interview ? '是' : '否') + '</b></div>' +
        '<div><i>是否录指纹</i><b>' + (p.need_fingerprint ? '是' : '否') + '</b></div>' +
        '<div><i>签证类型</i><b style="font-size:11.5px">' + esc(p.visa_type) + '</b></div></div>' +
        '<div class="h5-note"><b>受理范围说明</b><div class="rich-view">' + richView(p.accept_note) + '</div></div>' +
        '<div class="h5-note"><b>资料邮寄地址</b>' +
        esc((d.mail_addr && d.mail_addr.text) || d.mail_addr || '下单后由客服告知') + '</div>' +
        '<div class="h5-tip">有效期、入境次数、停留时间最终以使领馆签发为准</div>';
    }

    function draw() {
      var kb = $('.ph-body', m), keep = kb ? kb.scrollTop : 0;
      var pks = showAll ? d.packages : d.packages.slice(0, 3);
      var lo = Math.min.apply(null, d.packages.map(function (k) { return k.suggest_retail; }));
      var hi = Math.max.apply(null, d.packages.map(function (k) { return k.suggest_retail; }));
      var cur = d.packages.filter(function (k) { return k.id === pkgId; })[0] || {};

      $('.ph-body', m).innerHTML =
        '<div class="pv-hero" style="background-image:url(' +
        esc(d.hero_img || dimg(p.country)) + ')">' +
        '<div class="pv-nav"><span class="bk" data-back3>‹</span>' +
        '<a class="ic" data-share3>分享</a></div>' +
        '<div class="pv-tx"><s>' + esc(p.country) + ' · ' + esc(p.submit_city) + '</s>' +
        '<h1>' + esc(p.visa_type) + '</h1>' +
        '<div class="pv-price"><i>¥</i><b>' + money(lo) + '</b>' +
        (hi > lo ? '<u>- ¥' + money(hi) + '</u>' : '<u> 起 / 人</u>') + '</div>' +
        '<div class="pv-cz"><span>' + esc(ENTRIES[p.entries] || p.entries) + '</span>' +
        '<span>' + (p.need_interview ? '需本人面试' : '免面试') + '</span>' +
        '<span>停留 ' + stayTx(p) + '</span></div></div></div>' +

        '<div class="pv-name"><b>' + esc(d.name) + '</b>' +
        '<div class="cz"><span>电子材料上传</span><span>1V1 材料指导</span>' +
        '<span>进度节点同步</span></div></div>' +

        /* 销售视角独有的一条：结算价与毛利。客人模式下整条不渲染 */
        (pmSales()
          ? '<div class="ym-sale"><div><s>结算价</s><b>' + ymMoney(cur.settle_price) + '</b></div>' +
            '<div><s>建议零售</s><b>' + ymMoney(cur.suggest_retail) + '</b></div>' +
            '<div><s>单人毛利</s><b class="g">' +
            ymMoney((cur.suggest_retail || 0) - (cur.settle_price || 0)) + '</b></div>' +
            '<em>仅门店销售可见，向客人展示前请切回「零售」</em></div>'
          : '') +

        '<div class="pv-svc">' + [['材料', '按人群逐项裁剪'], ['价格', '各渠道同价'],
          ['进度', '五个节点可查'], ['供应商', d.supplier]].map(function (t) {
            return '<div><b>' + esc(t[0]) + '</b><s>' + esc(t[1]) + '</s></div>';
          }).join('') + '</div>' +

        (d.feature ? '<section class="pv-sec"><div class="pv-h"><h2>产品特色</h2></div>' +
          '<div class="pv-body">' + esc(d.feature) + '</div></section>' : '') +

        '<section class="pv-sec"><div class="pv-h"><h2>选择套餐</h2>' +
        '<a class="mut">' + d.packages.length + ' 个</a></div>' +
        '<div class="pv-pks">' + pks.map(function (k) {
          var mg = (k.suggest_retail || 0) - (k.settle_price || 0);
          return '<div class="pv-pk' + (k.id === pkgId ? ' on' : '') + '" data-k="' + k.id + '">' +
            '<div class="r1"><b>' + esc(k.name) + '</b>' +
            '<span class="amt">¥' + money(k.suggest_retail) + '</span></div>' +
            '<div class="r2">办理时长约 ' + k.lead_days + ' 个工作日' +
            (pmSales() ? '　·　结算 ' + ymMoney(k.settle_price) + '　·　毛利 ' + ymMoney(mg) : '') +
            '</div>' +
            (k.id === pkgId && k.book_notice
              ? '<div class="r3"><a class="pv-nt" data-nt="' + k.id + '">预订须知' +
                '<s>' + esc(rvBrief(k.book_notice, 22)) + '</s><i>›</i></a></div>' : '') +
            '</div>';
        }).join('') + '</div>' +
        (d.packages.length > 3 && !showAll
          ? '<div class="pv-more" data-all>展开其余 ' + (d.packages.length - 3) + ' 个套餐 ﹀</div>'
          : '') + '</section>' +

        '<section class="pv-sec"><div class="pv-h"><h2>产品详细说明</h2></div>' +
        '<div class="pv-tabs sticky">' + YM_PVT.map(function (x) {
          return '<a data-t="' + x[0] + '">' + x[1] + '</a>';
        }).join('') + '</div>' + YM_PVT.map(function (x) {
          return '<div class="pv-anc" id="pva-' + x[0] + '">' +
            '<div class="pv-anch">' + esc(x[1]) + '</div>' + tabHtml(x[0]) + '</div>';
        }).join('') + '</section>';

      $('.ph-foot', m).innerHTML =
        '<div class="sv" data-poster>分享海报</div>' +
        /* 「发给客人（扫码 / 链接）」2026-09-09 补上（唐美芳：「有米端的产品详情页，
           怎么没有这个功能，调整下，也需要二维码展示和下载的哈」）。
           与 CSP 门店端同一条链路，只是版式按手机竖排。 */
        '<div class="sv" data-send>发给客人</div>' +
        '<button class="cta" data-book>代客下单 ¥' + money(cur.suggest_retail || 0) + '</button>';

      if (kb) kb.scrollTop = keep;
      bind();
    }

    function bind() {
      $$('[data-k]', m).forEach(function (el) {
        el.onclick = function (e) {
          if (e.target.closest('[data-nt]')) return;
          pkgId = S.cache.ymPkg = +el.dataset.k; draw();
        };
      });
      $$('[data-nt]', m).forEach(function (a) {
        a.onclick = function (e) {
          e.stopPropagation();
          var k = d.packages.filter(function (x) { return x.id === +a.dataset.nt; })[0];
          if (!k) return;
          modal('预订须知 · ' + k.name,
            '<div class="pad rich-view nt-box">' + richView(k.book_notice) + '</div>',
            [{ t: '知道了' }]);
        };
      });
      $$('[data-cw]', m).forEach(function (a) {
        a.onclick = function () { crowd = S.cache.ymCrowd = a.dataset.cw; draw(); };
      });
      /* 材料项点开看要求，跟客户端一个交互 */
      $$('[data-m]', m).forEach(function (x) {
        x.onclick = function () {
          var k = x.dataset.m;
          openMat[k] = !openMat[k];
          x.classList.toggle('open', !!openMat[k]);
        };
      });
      var all = $('[data-all]', m);
      if (all) all.onclick = function () { showAll = true; draw(); };
      $('[data-back3]', m).onclick = function () { history.back(); };
      var sh = $('[data-share3]', m), ps = $('[data-poster]', m);
      var openPoster = function () {
        ymPoster(d, d.packages.filter(function (k) { return k.id === pkgId; })[0] || {});
      };
      if (sh) sh.onclick = openPoster;
      if (ps) ps.onclick = openPoster;
      var sd = $('[data-send]', m);
      if (sd) sd.onclick = function () {
        ymSendProd(d, d.packages.filter(function (k) { return k.id === pkgId; })[0] || {});
      };
      $('[data-book]', m).onclick = function () {
        S.cache.pdPkg = pkgId; go('create', spid);
      };
      /* 吸顶锚点：跟 C 端一样，滚到哪一块页签就高亮哪一块 */
      var sc = $('.ph-body', m), navs = $$('[data-t]', m);
      navs.forEach(function (a) {
        a.onclick = function () {
          var el = $('#pva-' + a.dataset.t, m);
          if (el) sc.scrollTo({ top: el.offsetTop - 44, behavior: 'smooth' });
        };
      });
      var spy = function () {
        var line = sc.scrollTop + 60, cur2 = navs[0];
        navs.forEach(function (a) {
          var el = $('#pva-' + a.dataset.t, m);
          if (el && el.offsetTop <= line) cur2 = a;
        });
        navs.forEach(function (a) { a.classList.toggle('on', a === cur2); });
      };
      sc.addEventListener('scroll', spy, { passive: true });
      spy();
    }

    m.innerHTML = pageH('有米小程序 · 产品详情',
      '信息结构与客户端产品页一致：头图、卖点、四格摘要、套餐、' +
      '基本信息 / 所需材料 / 办理流程 / 常见问题。' +
      '<b>销售端多两样</b>：结算价与毛利（受「零售 / 结算」按钮控制），以及生成分享海报。') +
      ymPage(esc(p.country) + '签证', '<div class="ym-pv"></div>', '　', '这一步在做什么',
        '销售当着客人的面翻产品，把手机转给客人前用「零售 / 结算」按钮切回「零售」；' +
        '「分享海报」生成的图里放的是客户端这条产品的小程序码与销售名片，' +
        '发朋友圈或发给客人，对方扫码直接进客户端下单。',
        true, 'acquire');
    draw();
    ymBind(m, 'acquire');
  });
}

/* 「发给客人」：把客户端这条产品页发出去，链接与二维码两种给法
   （唐美芳 2026-09-09：有米端产品详情页也要这个功能，二维码要能展示和下载）。
   与 CSP 门店端 sendModal() 指向同一个地址、同一个 /api/qr，口径一致；
   版式改成手机竖排——CSP 那套左右两栏在 390 宽里会挤成两条窄柱。
   与「分享海报」的区别：海报是一张带销售名片的成品图，适合发朋友圈；
   这里是纯链接 / 二维码，适合面对面让客人扫、或发到微信对话里。 */
function ymSendProd(d, pk) {
  var p = d.product;
  var url = location.origin + location.pathname.replace(/[^/]*$/, '') +
    '#customer/shop/p-' + d.sup_product_id;
  var qr = API_BASE + '/qr?d=' + encodeURIComponent(url);
  var attrs = [
    ['入境次数', (typeof ENTRIES !== 'undefined' && ENTRIES[p.entries]) || p.entries || '—'],
    ['有效期', validTx(p)],
    ['停留时长', stayTx(p)],
    ['办理时效', (pk && pk.lead_days ? pk.lead_days + ' 个工作日' : '以套餐为准')]
  ];
  var box = modal('分享签证资料要求给客户',
    '<div class="pad ym-send">' +
    '<div class="ys-top"><b>' + esc(d.name) + '</b><s>' +
    attrs.map(function (a) { return esc(a[0]) + '：' + esc(a[1]); }).join(' · ') +
    ((d.items || []).length ? ' · 共 ' + d.items.length + ' 项资料' : '') + '</s></div>' +
    '<div class="ys-qr"><div class="ys-qz"><img src="' + esc(qr) + '" alt="二维码"></div>' +
    '<div class="ys-qop"><s>长按二维码可保存到相册</s>' +
    '<button class="btn p sm" data-dl>下载二维码</button></div></div>' +
    '<div class="ys-lk"><i>🔗</i><span>' + esc(url) + '</span></div>' +
    '<button class="btn p" data-cp style="width:100%">复制链接</button>' +
    '<div class="hint" style="margin-top:12px">客户扫码或打开链接后进入客户端该产品页面，' +
    '可查看<b>按适用人群裁剪后的材料清单、办理流程与套餐价格</b>；' +
    '<b>结算价与毛利不在客户端展示</b>。' +
    '材料清单以客户下单当时的版本快照为准，清单后续改版不影响已下单客户。</div></div>',
    [{ t: '关闭' }], true);

  var img = $('.ys-qz img', box.mask);
  img.onerror = function () {
    $('.ys-qz', box.mask).innerHTML =
      '<div class="ys-qf">二维码服务暂不可用<s>请改用下方链接分享</s></div>';
    var b = $('[data-dl]', box.mask);
    if (b) b.disabled = true;
  };
  $('[data-cp]', box.mask).onclick = function () {
    doCopy(url); toast('链接已复制，可发送至客户');
  };
  $('[data-dl]', box.mask).onclick = function () {
    /* 服务端给的是 SVG，矢量放大不糊，印在门店物料上也清楚 */
    var a = document.createElement('a');
    a.href = qr; a.download = (d.name || '签证产品') + '_二维码.svg';
    a.click();
    toast('二维码已下载');
  };
}

/* 产品分享海报：用 canvas 现画一张 750×1200 的图，含
   产品图 / 名称 / 属性 / 零售价 / 客户端小程序码 / 销售名片。
   唐美芳 2026-09-01：「需要增加产品分享海报的功能，分享海报上有 C 端小程序的
   小程序码以及销售信息的内容」。二维码指向客户端这条产品页，客人扫了直接下单。 */
function ymPoster(d, pk) {
  var p = d.product, u = S.user || {};
  var url = location.origin + location.pathname.replace(/[^/]*$/, '') +
    '#customer/shop/p-' + d.sup_product_id;
  var box = modal('产品分享海报',
    '<div class="pad ym-poster"><div class="pt-wrap"><canvas id="pt-cv" width="750" height="1200">' +
    '</canvas><div class="pt-load">正在生成海报…</div></div>' +
    '<div class="pt-op"><button class="btn p" data-dl disabled>保存海报</button>' +
    '<button class="btn" data-cp>复制客户端链接</button></div>' +
    '<div class="hint">海报上的二维码指向<b>客户端这条产品页</b>，客人扫码可直接下单；' +
    '海报只放零售价，结算价与毛利不会出现在图上。</div></div>',
    [{ t: '关闭' }], true);

  var cv = $('#pt-cv', box.mask), ctx = cv.getContext('2d');
  var W = 750, H = 1200;
  var BRAND = '#FF6B3D';

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrap(text, x, y, maxW, lh, maxLine) {
    var line = '', n = 0;
    for (var i = 0; i < text.length && n < maxLine; i++) {
      var t = line + text[i];
      if (ctx.measureText(t).width > maxW) {
        ctx.fillText(line, x, y + n * lh); line = text[i]; n++;
      } else { line = t; }
    }
    if (n < maxLine && line) { ctx.fillText(line, x, y + n * lh); n++; }
    return n;
  }
  function loadImg(src) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { res(null); };
      im.src = src;
    });
  }

  Promise.all([
    loadImg(d.hero_img || dimg(p.country)),
    loadImg(API_BASE + '/qr?d=' + encodeURIComponent(url))
  ]).then(function (imgs) {
    var hero = imgs[0], qr = imgs[1];
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);

    /* 顶部产品图，等比裁剪填满 */
    if (hero) {
      var s2 = Math.max(W / hero.width, 420 / hero.height);
      var dw = hero.width * s2, dh = hero.height * s2;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, 420); ctx.clip();
      ctx.drawImage(hero, (W - dw) / 2, (420 - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      var g = ctx.createLinearGradient(0, 0, W, 420);
      g.addColorStop(0, BRAND); g.addColorStop(1, '#FF8A5C');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, 420);
    }
    var sh = ctx.createLinearGradient(0, 180, 0, 420);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.62)');
    ctx.fillStyle = sh; ctx.fillRect(0, 180, W, 240);

    ctx.fillStyle = '#fff';
    ctx.font = '600 26px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(p.country + ' · ' + p.submit_city, 44, 320);
    ctx.font = '800 46px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(p.visa_type, 44, 378);

    /* 产品名 */
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '600 30px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    var lines = wrap(d.name, 44, 480, 662, 44, 2);
    var y = 480 + lines * 44 + 18;

    /* 属性芯片 */
    ctx.font = '400 24px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    var chips = [ENTRIES[p.entries] || p.entries,
                 p.need_interview ? '需本人面试' : '免面试',
                 '停留 ' + stayTx(p),
                 (pk.lead_days ? pk.lead_days + ' 个工作日' : '')].filter(Boolean);
    var cx = 44;
    chips.forEach(function (t) {
      var w = ctx.measureText(t).width + 30;
      ctx.fillStyle = '#FFF3EE'; rr(cx, y, w, 44, 22); ctx.fill();
      ctx.fillStyle = BRAND; ctx.fillText(t, cx + 15, y + 30);
      cx += w + 12;
    });
    y += 78;

    /* 价格 */
    ctx.fillStyle = '#999';
    ctx.font = '400 24px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('参考零售价', 44, y + 24);
    ctx.fillStyle = BRAND;
    ctx.font = '800 58px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    var pr = '¥' + money(pk.suggest_retail || 0);
    /* 后缀的起点要在「大字体下」量出来再画，不能按小字体估——
       估算会让「起 / 人」压在价格上 */
    var prW = ctx.measureText(pr).width;
    ctx.fillText(pr, 44, y + 84);
    ctx.font = '400 24px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('起 / 人', 44 + prW + 12, y + 84);

    /* 分隔 */
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(44, 1000); ctx.lineTo(706, 1000); ctx.stroke();

    /* 销售名片 + 小程序码 */
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '600 30px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(u.name || '门店销售', 44, 1058);
    ctx.fillStyle = '#888';
    ctx.font = '400 24px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(u.org || '众信旅游门店', 44, 1098);
    if (u.phone) ctx.fillText('联系电话 ' + u.phone, 44, 1136);
    ctx.fillStyle = '#bbb';
    ctx.font = '400 22px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('长按识别二维码 · 在线咨询与下单', 44, 1174);

    if (qr) {
      ctx.fillStyle = '#fff'; rr(548, 1018, 168, 168, 12); ctx.fill();
      ctx.drawImage(qr, 552, 1022, 160, 160);
    }
    $('.pt-load', box.mask).style.display = 'none';
    $('[data-dl]', box.mask).disabled = false;
  });

  $('[data-dl]', box.mask).onclick = function () {
    var a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = (d.name || '签证产品') + '_分享海报.png';
    a.click();
    toast('海报已保存');
  };
  $('[data-cp]', box.mask).onclick = function () { doCopy(url); };
}

/* 代客下单 —— 信息结构照 C 端订单填写页（唐美芳 2026-09-01：
   「订单填写页也可以和 C 端信息结构一样，但需要增加加签认信息的开关，
   预订下单后再填写」）：
     产品条 → 退改口径 → 套餐 → 预计出行日期 → 办签人 → 联系人 →
     资料提交方式 → 费用明细
   销售端多两样：套餐上带结算价与毛利、费用明细里可以改成交价。
   「下单后再填写办签人资料」的开关按她的要求保留在办签人那一段。 */
VIEWS['youmi:create'] = function (m, spid) {
  if (!spid) return go('book');
  var W = S.cache.ymOrd;
  if (!W || W.spid !== spid) {
    W = S.cache.ymOrd = {
      spid: spid, pkg: S.cache.pdPkg || 0, depart: '', deal: '',
      /* 联系人默认带出销售上一单填过的（唐美芳 2026-09-02：「默认带出上次填写的
         联系人信息」）。门店销售常常连着给同一位客人或自己当联系人下几单，
         每次重打一遍手机号和邮箱最烦。带出来是草稿，随时能改。 */
      contact: { name: '', phone: '', email: '' },
      custKey: '',
      /* 办签人一律通过选择面板产生，初始为空 */
      pax: [],
      /* 「下单后再填写办签人资料」开关与人数 */
      later: false, laterN: 1,
      /* 订单备注：选填，随单一并写入 ord.note，订单详情里展示 */
      note: ''
    };
  }
  /* 上一单的联系人从<b>后端</b>取，不再靠浏览器内存——S.cache 刷新就没了、
     换台电脑也没有，唐美芳 2026-09-03 就是在这儿发现没带出来的。 */
  return Promise.all([api('/shop/product?id=' + spid), ensureCcfg(),
                      api('/my/last_contact', null, { silent: 1 }).catch(function () { return {}; })])
    .then(function (rr) {
    var d = rr[0], p = d.product;
    var lastCt = (rr[2] || {}).contact;
    if (lastCt && !W.contact.name && !W.contact.phone) {
      W.contact = { name: lastCt.name, phone: lastCt.phone, email: lastCt.email };
      W.ctFrom = lastCt.at;
    }
    if (!d.on_b) {
      m.innerHTML = pageH('代客下单', '') +
        ymPage('代客下单', '<div class="h5-sec"><div class="h5-empty">' +
          esc(d.name) + ' 未在门店渠道上架或 B 端审核未通过，不能代客下单。</div></div>',
          '', '', '', true, '', '', 'ym');
      pmBind(m, reload);
      $('[data-back]', m).onclick = function () { go('book'); };
      return;
    }
    if (!W.pkg || !d.packages.some(function (x) { return x.id === W.pkg; })) {
      W.pkg = (d.packages[0] || {}).id;
    }
    var full = apFull;

    function sec(title, body, req, badge) {
      return '<section class="bk-sec"><div class="bk-h"><b>' + esc(title) +
        (req ? '<i>*</i>' : '') + '</b>' + (badge || '') + '</div>' + body + '</section>';
    }
    function pk() { return d.packages.filter(function (x) { return x.id === W.pkg; })[0] || {}; }
    function price() {
      var v = parseFloat(W.deal);
      return isNaN(v) ? (pk().suggest_retail || 0) : v;
    }
    function PAX() { return W.later ? W.laterN : W.pax.length; }
    function badN() { return W.pax.filter(function (a) { return !full(a); }).length; }
    function gap() {
      if (!W.depart) return null;
      return Math.round((new Date(W.depart) - new Date(new Date().toDateString())) / 86400000);
    }

    function draw() {
      var k = pk(), bad = badN(), n = PAX();
      var total = price() * n, margin = (price() - (k.settle_price || 0)) * n;
      var g = gap();
      var tight = (g !== null && k.lead_days && g < Math.ceil(k.lead_days * 7 / 5));

      $('.ph-body', m).innerHTML =
        '<section class="bk-prod"><b>' + esc(d.name) + '</b>' +
        (d.feature ? '<s>' + esc(d.feature) + '</s>' : '') +
        '<div class="bk-lk" data-info><span>产品信息：</span>适用人群 · 办签材料 · 办理流程' +
        '<em>查看 ›</em></div></section>' +

        '<div class="bk-trust">◈<span>订单支付前可直接取消；已支付的订单请提交退款申请，按已产生的官费与服务成本核减后退还余款。' +
        '</span></div>' +

        /* 套餐在产品详情页就选定了，这一页只回显、不再让改
           （唐美芳 2026-09-02：「订单填写页就不需要再次更改套餐了，只是填写订单信息就可」）。
           要换套餐就回上一页换——在填单页改套餐，价格、时效、材料清单会跟着变，
           客人已经填了一半的信息又要重来。 */
        sec('套餐',
          (function () {
            var k0 = pk();
            var mg = (k0.suggest_retail || 0) - (k0.settle_price || 0);
            return '<div class="bk-pks ro">' +
              '<div class="bk-pk on">' +
              '<div class="r1"><b>' + esc(k0.name || '—') + '</b>' +
              '<span class="amt">¥' + money(k0.suggest_retail) + '</span></div>' +
              '<div class="r2">' + (k0.lead_days || 0) + ' 个工作日' +
              (pmSales() ? '　·　结算 ' + ymMoney(k0.settle_price) +
                '　·　毛利 ' + ymMoney(mg) : '') + '</div></div></div>' +
              '<div class="bk-tip">套餐在产品页选定。<a class="lnk" data-repk>换个套餐 ›</a></div>';
          })()) +

        /* 日历控件（唐美芳 2026-09-07 附携程截图：「不要现在的日期控件」）。
           9-02 定的滚轮版仍留给出生日期、证件有效期那类要翻很远的字段。 */
        sec('预计出行日期',
          '<div class="bk-date' + (W.depart ? ' on' : '') + '" data-ymdate>' +
          (W.depart ? '<b>' + esc(W.depart) + '</b>' : '<b class="ph">请选择日期</b>') +
          '<s>' + (W.depart
            ? '距今 ' + g + ' 天，系统按此日期倒排办理进度'
            : '按套餐时效 ' + k.lead_days + ' 个工作日倒推') + '</s>' +
          '<em class="bk-pen">' + svgIcon('M4 20h4L19 9l-4-4L4 16z') + '</em></div>' +
          (tight ? '<div class="bk-warn">本套餐约需 <b>' + k.lead_days +
            ' 个工作日</b>出签，所选日期只剩 <b>' + g + ' 天</b>，时间可能不够。' +
            '建议改期或改选加急套餐。</div>' : ''),
          true, W.depart ? '' : '<u class="bk-bg">请先选择日期</u>') +

        sec('办签人',
          (W.later
            ? '<div class="bk-tip" style="margin:0 0 10px">' +
              '先按人数占位，下单后在订单详情「办签人信息」里逐位补齐资料。</div>'
            : (W.pax.length
              ? '<div class="ap-sel">' + W.pax.map(function (a, idx) {
                return '<div class="ap-card' + (full(a) ? '' : ' bad') + '">' +
                  '<div class="n"><b>' + esc(a.name_cn || ('办签人 ' + (idx + 1))) + '</b>' +
                  '<s>' + esc(CROWD_CN[a.crowd] || '') +
                  (a.id_no ? ' · ' + esc(a.id_type || '护照') + ' ' + esc(a.id_no)
                    : ' · 证件信息不全') + '</s></div>' +
                  '<span class="x" data-del="' + idx + '">×</span></div>';
              }).join('') + '</div>'
              : '<div class="bk-tip" style="margin:0 0 10px">请选择或新增需要办理签证的办签人</div>') +
              '<a class="ap-pick" data-add>＋ 选择或更改办签人</a>') +
          apLaterHtml(W.later, W.laterN, 24) +
          (W.later ? '' : '<div class="bk-tip">「适用人群」决定系统给这位客人生成哪一份材料清单。' +
            '姓名与证件信息须与护照原件完全一致。</div>'),
          true, W.later
            ? '<u class="bk-bg">' + W.laterN + ' 人 · 稍后填写</u>'
            : (W.pax.length
              ? (bad ? '<u class="bk-bg">' + bad + ' 人信息不全</u>' : '')
              : '<u class="bk-bg">待选择</u>')) +

        /* 联系人三项直接在本页填，不再点开弹窗
           （唐美芳 2026-09-02：「联系人姓名、手机号、电子邮箱直接在当前页面填写即可，
           电子邮箱也必填……整体不需要其他弹窗，减少额外交互」）。
           邮箱设为必填：境外使馆现在主要靠邮件回结果，漏了这一项后面拿不到签证函。 */
        sec('联系人',
          '<div class="bk-form">' +
          '<label><span>联系人姓名 <i>*</i></span>' +
          '<input data-ct="name" value="' + esc(W.contact.name || '') +
          '" placeholder="请填写联系人姓名"></label>' +
          '<label><span>手机号 <i>*</i></span>' +
          '<input data-ct="phone" type="tel" inputmode="numeric" maxlength="11" value="' +
          esc(W.contact.phone || '') + '" placeholder="11 位手机号，用于办理过程中联系"></label>' +
          '<label><span>电子邮箱 <i>*</i></span>' +
          '<input data-ct="email" type="email" inputmode="email" value="' +
          esc(W.contact.email || '') + '" placeholder="用于接收使馆通知与出签结果"></label>' +
          '</div>' +
          '<div class="bk-tip">' +
          (W.ctFrom ? '<b>已带出上一单（' + d10(W.ctFrom) + '）填的联系人</b>，' +
            '不是同一位客人请直接改。<br>' : '') +
          '补料通知与出签结果都按这里发；<b>境外使领馆以邮件为主，邮箱必填</b>。' +
          '一单多人时它不等于第一位办签人；如由销售跟进，可填销售本人信息。</div>',
          true, (W.contact.name && W.contact.phone && W.contact.email)
            ? '' : '<u class="bk-bg">待填写</u>') +

        sec('订单备注',
          '<div class="bk-form">' +
          '<label><span>备注（选填，随订单一并展示）</span>' +
          '<textarea data-note rows="3" placeholder="如有加急说明、寄送要求、特殊开票等，可在此备注">' +
          esc(W.note || '') + '</textarea></label></div>') +

        sec('资料提交方式',
          '<div class="bk-way"><div><b>电子材料</b><s>下单后在订单里逐项上传，' +
          '专员在线审核，不合格会退回并说明原因；销售可代客上传</s></div>' +
          '<div><b>原件邮寄</b><s>' +
          esc((d.mail_addr && d.mail_addr.text) || d.mail_addr || '下单后由客服告知收件地址') +
          '</s></div></div>') +

        /* 有米上不改价，只看明细（唐美芳 2026-09-02：「有米小程序下单时不可修改价格，
           直接展示费用明细即可」）。手机上现场调价容易点错，改价留在 CSP 电脑端做。 */
        sec('费用明细',
          '<div class="bk-fee"><div><i>' + esc(k.name) + ' × ' + n + ' 人</i>' +
          '<b>¥' + money(price() * n) + '</b></div>' +
          '<div><i>成交价</i><b class="mut">¥' + money(price()) + ' / 人</b></div>' +
          (pmSales()
            ? '<div><i>结算成本</i><b class="mut">¥' + money((k.settle_price || 0) * n) + '</b></div>' +
              '<div><i>本单毛利</i><b class="' + (margin < 0 ? 'r' : 'g') + '">¥' +
              money(margin) + '</b></div>'
            : '') +
          '<div class="tt"><i>订单总额</i><b>¥' + money(total) + '</b></div>' +
          '</div><div class="bk-tip">按建议零售价成交。<b>需要让利改价请到 CSP 电脑端下单</b>——' +
          '手机上现场调价容易点错，价格护栏（不得低于结算价）也在那边一并校验。' +
          '结算价与毛利仅在「零售 / 结算」按钮切到「结算」时显示，客人模式下不渲染。</div>');

      $('.ph-foot', m).innerHTML =
        '<div class="sum">' + n + ' 人 <b style="color:var(--ro2);font-size:17px;margin-left:4px">¥' +
        money(total) + '</b></div>' +
        '<button class="cta" data-submit>提交订单</button>';
      bind();
    }

    /* 日历弹层。最早可选＝今天 + 本套餐时效换算的自然日：
       出行日期早于出签日，这单本来就办不成，不该让人先选中再报错。 */
    function openCal() {
      var k = pk();
      return calPicker({
        title: '选择预计出发日期',
        tip: '请选择预计出行时间，以便为您安排送签和配送',
        value: W.depart,
        min: calPlus(calWork2Nat(k.lead_days || 15)),
        price: price(),
        months: 4
      }).then(function (v) { W.depart = v; draw(); }).catch(function () { draw(); });
    }

    function bind() {
      /* 进入填写页自动弹一次日历（唐美芳 2026-09-07：「进入填写页的时候，默认弹出来，
         可以关闭」）。只弹一次——每次 draw() 都弹的话，关掉它就再也填不了别的字段。 */
      if (!W.calShown) { W.calShown = 1; setTimeout(openCal, 260); }
      /* 套餐这一页只回显不可改，「换个套餐」回产品页去换 */
      var repk = $('[data-repk]', m);
      if (repk) repk.onclick = function () { go('book', spid); };
      $('[data-ymdate]', m).onclick = openCal;
      $$('[data-del]', m).forEach(function (a) {
        a.onclick = function () { W.pax.splice(+a.dataset.del, 1); draw(); };
      });
      var add = $('[data-add]', m);
      if (add) add.onclick = function () {
        apPicker(W.pax, { max: 9, mode: 'sales', custKey: W.custKey || '',
                          title: '选择办签人', page: true })
          .then(function (out) {
            W.pax = out;
            if (out.custKey !== undefined) W.custKey = out.custKey;
            if (out.length === 1 && !W.contact.name && !W.contact.phone) {
              W.contact.name = out[0].name_cn || '';
              W.contact.phone = out[0].phone || '';
            }
            draw();
          });
      };
      apLaterBind(m, function () { return { n: W.laterN }; }, function (on, nn) {
        W.later = on; W.laterN = nn; draw();
      });
      /* 联系人三项就地回写：input 事件里只存值不重绘，重绘会让输入框失焦，
         打一个字跳一次是没法用的。 */
      $$('[data-ct]', m).forEach(function (inp) {
        inp.oninput = function () { W.contact[inp.dataset.ct] = inp.value.trim(); };
      });
      var info = $('[data-info]', m);
      if (info) info.onclick = function () { go('book', spid); };
      $('[data-back]', m).onclick = function () { go('book', spid); };
      $('[data-submit]', m).onclick = function () {
        if (!W.depart) return toast('请先选择预计出行日期', true);
        if (!W.later) {
          if (!W.pax.length) return toast('请先选择办签人', true);
          var miss = W.pax.filter(function (a) { return !full(a); }).length;
          if (miss) return toast('还有 ' + miss + ' 位办签人信息未填全', true);
        }
        if (!W.contact.name || !W.contact.phone) {
          return toast('请填写联系人姓名与手机号', true);
        }
        /* 邮箱必填：境外使领馆现在主要靠邮件回结果（唐美芳 2026-09-02） */
        if (!W.contact.email) return toast('请填写电子邮箱，使馆结果通知要发到这里', true);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(W.contact.email)) {
          return toast('电子邮箱格式不对，请检查', true);
        }
        api('/order/create', {
          sup_product_id: +spid, pkg_id: W.pkg,
          applicants: W.later ? [] : W.pax, pax_later: W.later ? W.laterN : 0,
          deal_price: price(), depart_date: W.depart,
          contact_name: W.contact.name, contact_phone: W.contact.phone,
          contact_email: W.contact.email,
          note: (W.note || '').trim()
        }).then(function (r) {
          toast('订单 ' + r.no + ' 已创建，' + PAX() + ' 人，¥' + money(r.amount));
          /* 记住这次的联系人，下一单默认带出来 */
          S.cache.ymLastCt = {
            name: W.contact.name, phone: W.contact.phone, email: W.contact.email
          };
          S.cache.ymOrd = null;
          go('orders');
        }).catch(function () { /* 失败已提示，页面内容保留 */ });
      };
    }

    m.innerHTML = pageH('有米小程序 · 代客下单',
      '信息结构与客户端订单填写页一致：产品条 → 套餐 → 出行日期 → 办签人 → 联系人 → ' +
      '资料提交方式 → 费用明细。<b>销售端多两样</b>：套餐带结算价与毛利、成交价可在区间内让利。') +
      ymPage('代客下单', '<div class="ym-bk"></div>', '　', '这一步在做什么',
        '字段与必填口径跟 CSP 电脑端、客户端完全一致。' +
        '<b>「下单后再填写办签人资料」打开后只报人数</b>，' +
        '系统按人数建占位办签人；付款前必须补齐，逾期整单自动取消。',
        true, 'acquire');
    draw();
    ymBind(m, 'acquire');
  });
};

/* ymIn / ymSel 是旧下单页的行内表单控件，下单页改成 C 端结构后已无引用（2026-09-01） */

VIEWS['youmi:orders'] = function (m) {
  return api('/my/orders').then(function (j) {
    var list = j.list || [];
    var cf = S.cache.ymOF || 'all';
    var kw = S.cache.ymOK || '';
    /* 页签 = 订单状态那 5 个值，与 CSP 完全一致。办理状态是另一条线，标在卡片上。 */
    var OF = [
      ['all', '全部', function () { return true; }],
      ['created', '待付款', function (o) { return o.status === 'created'; }],
      ['paid', '已付款', function (o) { return o.status === 'paid'; }],
      ['done', '已完成', function (o) { return o.status === 'done'; }],
      ['refunded', '已退款', function (o) { return o.status === 'refunded'; }],
      ['cancelled', '已取消', function (o) { return o.status === 'cancelled'; }]
    ];
    var fn = (OF.filter(function (x) { return x[0] === cf; })[0] || OF[0])[2];
    var hit = list.filter(fn).filter(function (o) {
      return !kw || (o.no + (o.contact || '') + (o.phone || '') + o.product).indexOf(kw) >= 0;
    });

    var body =
      '<div class="ym-ft">' + OF.map(function (x) {
        var n = list.filter(x[2]).length;
        return '<a data-of="' + x[0] + '"' + (x[0] === cf ? ' class="on"' : '') + '>' +
          x[1] + (n ? ' ' + n : '') + '</a>';
      }).join('') + '</div>' +
      '<div class="ym-wrap">' +
      '<div class="ym-srch"><input id="ym-ok" value="' + esc(kw) +
      '" placeholder="搜订单号 / 客户姓名 / 手机号"><button data-os>搜索</button></div>' +
      (hit.length
        ? hit.map(function (o) {
          var wk = (o.status === 'paid' || o.status === 'done') ? (o.work_status || '未完成') : '';
          var st = ORD_ST_CN[o.status] || o.status_text;
          var cls = { created: 'wait', paid: 'doing', done: 'ok',
                      cancelled: 'off', refunded: 'bad' }[o.status] || 'off';
          var live = (o.applicants || []).filter(function (a) { return a.state === 'normal'; });
          /* 卡片重排（唐美芳 2026-09-02：「订单列表的时间怎么挤到一起了，其他日期字段
             也有挤在一起的迹象……不需要额外展示的就隐藏，只展示主要操作按钮及
             销售侧看到的主要信息」）：
               订单号 + 状态           ← 一行，状态靠右
               客户名 · 产品
               关键信息按「标签/值」两列网格排，不再横着挤成一行
               操作按钮独占一行
             下单时间从卡片上撤掉——销售扫列表时看的是「这单该我做什么」，
             不是什么时候下的；详情页里有。 */
          /* 支付状态（唐美芳 2026-09-03，五端同步）。有米是门店销售，
             跟 UOM / CSP 同一套内部口径：待支付 / 部分支付 / 已支付。
             销售最关心「这单钱收齐没有」，所以摆在金额旁边。 */
          var pst = o.pay_state || 'unpaid';
          var kv = [
            ['出行', o.depart_date ? d10(o.depart_date) : '待定'],
            ['人数', o.pax + ' 人'],
            ['支付状态', '<em class="ympst ' + pst + '">' + esc(PAY_ST_CN[pst] || pst) + '</em>'],
            ['套餐', o.pkg || '—'],
            ['金额', ymMoney(o.amount) +
              /* 已取消 / 已退款的单子不再谈欠款，那笔钱已经不用收了 */
              (o.owe > 0 && o.status !== 'cancelled' && o.status !== 'refunded'
                ? '<em class="owe">欠 ' + ymMoney(o.owe) + '</em>' : '')]
          ];
          return '<div class="ymc"><div class="t1" data-od="' + esc(o.no) + '">' +
            '<div><s>' + esc(o.no) + '</s><b>' + esc(o.contact || '—') + '</b></div>' +
            '<div style="text-align:right"><span class="ymb ' + cls + '">' + esc(st) + '</span>' +
            (wk ? '<div class="ymc-wk">办理' + esc(wk) + '</div>' : '') +
            '</div></div>' +
            '<div class="ln" data-od="' + esc(o.no) + '"><i>◎</i>' + esc(o.product) + '</div>' +
            '<div class="ymc-kv">' + kv.map(function (x) {
              return '<div><s>' + esc(x[0]) + '</s><b>' + x[1] + '</b></div>';
            }).join('') + '</div>' +
            /* todo 与右上角状态胶囊同文、或底部已有对应操作按钮时，不再重复占一行 */
            (o.todo && o.todo !== st && o.info_state !== 'wait'
              ? '<div class="ymc-todo">' + esc(o.todo) + '</div>' : '') +
            /* 操作独占一行：原来和「下单时间」挤在 space-between 的同一行里，
               宽度不够时时间就被折成两行（她截图里的「2026-09-02 下 / 单」）。 */
            '<div class="ft"><span class="ymc-op">' +
            /* 待付款单：录资料和收款两个入口并存。
               原来资料没录齐就把「代客支付」整个藏起来，销售在有米上根本找不到
               付款入口，订单卡死在待付款（唐美芳 2026-09-02：「现在在 csp 和有米上
               下单如何付款啊，现在订单上到待付款这里无法支付，流程走不下去了」）。
               资料没齐不该挡收款——未付款单超时会自动取消，付了款的单资料没齐
               就停在工单「待收材料」，那是专员催收的正常状态。 */
            /* 按钮分级照后台的规矩来（唐美芳 2026-09-02：「操作按钮同后台一样是线框，
               主要按钮有底色，其余按钮是浅色」）：这一步最该点的填色，其余线框。 */
            (o.status === 'created'
              ? (o.info_state === 'done' ? ''
                : '<a class="gh" data-oinfo="' + esc(o.no) + '">录资料' +
                  (o.info_left ? '（' + esc(o.info_left) + '）' : '') + '</a>') +
                '<a class="pr" data-pay="' + esc(o.no) + '">代客支付</a>'
              : '') +
            (o.status !== 'created' && o.status !== 'cancelled' && live.length
              ? '<a class="gh" data-share=\'' + jattr({ no: o.no, aps: live.map(function (a) {
                return { id: a.id, name: a.name };
              }) }) + '\'>发给客人填</a>' : '') +
            '<a class="gh" data-od="' + esc(o.no) + '">详情</a></span></div></div>';
        }).join('')
        : '<div class="ym-empty"><i>☰</i>该状态下没有订单</div>') + '</div>';

    m.innerHTML = pageH('有米小程序 · 订单管理',
      '与 CSP「订单列表」同一份数据与口径。<b>页签只放订单状态那 5 个值</b>，' +
      '办理状态标在卡片右上，是另一条线。') +
      ymPage('订单管理', body, '', '这一步在做什么',
        '「发给客人填」生成一条免登录链接，客人打开就能交材料、填申请表、看进度。' +
        '一张订单每位办签人各填各的表，所以要先选人——把几个人的链接混着发出去，' +
        '客人将填入他人的表单。', false, 'orders');

    $$('[data-of]', m).forEach(function (a) {
      a.onclick = function () { S.cache.ymOF = a.dataset.of; reload(); };
    });
    $('[data-os]', m).onclick = function () { S.cache.ymOK = $('#ym-ok', m).value.trim(); reload(); };
    $('#ym-ok', m).onkeydown = function (e) {
      if (e.key === 'Enter') { S.cache.ymOK = e.target.value.trim(); reload(); }
    };
    $$('[data-od]', m).forEach(function (b) {
      b.onclick = function (e) {
        if (e.target.closest('[data-pay],[data-share],[data-oinfo]')) return;
        go('odetail', b.dataset.od);
      };
    });
    $$('[data-pay]', m).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        api('/order/pay', { no: b.dataset.pay })
          .then(function (r) { toast(r.msg); reload(); }).catch(fail);
      };
    });
    $$('[data-oinfo]', m).forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); go('ordinfo', b.dataset.oinfo); };
    });
    $$('[data-share]', m).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        ymShare(JSON.parse(b.dataset.share));
      };
    });
    ymBind(m, 'orders');
  });
};

/* 一张订单多位办签人，各填各的表，所以先选人再生成链接 */
/* 有米的分享弹窗 2026-09-08 统一走 core.js 的 shareTask()：
   原来生成链接这段在四个页面各写了一遍，措辞四个版本（唐美芳指出「页面有点多，
   怎么感觉这么混乱呢」）。多办签人时先选人，再交给 shareTask。 */
function ymShare(o) {
  if ((o.aps || []).length === 1) return shareTask(o.aps[0].id, o.aps[0].name);
  var html = '<div class="pad"><div class="hint">同一订单内每位办签人各填一份申请表与各自的材料，' +
    '<b>请分别发送至本人</b>。</div>' +
    o.aps.map(function (a) {
      return '<div class="ym-sh" data-sh="' + a.id + '"><b>' + esc(a.name) + '</b>' +
        '<span>生成链接 ›</span></div>';
    }).join('') + '</div>';
  var box = modal('发给客人自己填', html, [{ t: '关闭' }]);
  $$('[data-sh]', box.mask).forEach(function (r) {
    r.onclick = function () {
      var a = o.aps.filter(function (x) { return String(x.id) === r.dataset.sh; })[0] || {};
      box.close();              /* modal() 返回 { mask, close } */
      shareTask(a.id, a.name);
    };
  });
  return box;
}

/* ---------------- 办理进度（销售视角） ---------------- */
/* 订单详情：视图名与 CSP 一致（csp:odetail），口径也一致 */
/* 订单详情 —— 信息结构照 C 端订单详情那一版，销售端再补上金额与办理动作
   （唐美芳 2026-09-01：「有米小程序的订单列表页与订单详情页的信息结构也不全，
   请按照 csp 的内容来，做个移动版，实在不行，你照 C 端小程序的内容搬也可以」）：
     状态条 → 产品与套餐 → 金额（销售端含结算与毛利）→ 办签人（逐人进度与材料）
     → 客人签证资料 → 联系人与收货 → 其他操作
   底部按状态给主操作：待付款去收款、有补料去催、其余看进度。 */
VIEWS['youmi:odetail'] = function (m, no) {
  if (!no) return go('orders');
  return Promise.all([api('/my/order/detail?no=' + encodeURIComponent(no)),
                      api('/my/orders')]).then(function (rr) {
    var d = rr[0];
    var row = (rr[1].list || []).filter(function (x) { return x.no === no; })[0] || {};
    var suppN = d.applicants.reduce(function (a, x) { return a + (x.supp_open || 0); }, 0);
    var waitN = d.applicants.reduce(function (a, x) { return a + (x.mat_wait || 0); }, 0);
    var STG = { created: 'wait', paid: 'doing', done: 'ok',
                cancelled: 'off', refunded: 'bad' };

    /* 第三个参数之后加锚点 id：详情页 1500+ px 长，靠页签跳段比一路滚下去快
       （唐美芳 2026-09-02：「页面展示区域特别长的情况下，是不是可以考虑 tab 子页签，
       锚点切换或滑动」）。 */
    function sec(title, inner, more, id) {
      return '<div class="h5-sec"' + (id ? ' id="odsec-' + id + '"' : '') + '>' +
        '<div class="h5-h"><span>' + esc(title) + '</span>' +
        (more ? '<span class="more">' + more + '</span>' : '') + '</div>' + inner + '</div>';
    }
    function kv(k, v, cls) {
      return '<div class="h5-row" style="cursor:default"><span class="lb">' + esc(k) + '</span>' +
        '<span class="vl' + (cls ? ' ' + cls : '') + '">' + v + '</span></div>';
    }

    /* 订单详情结构 2026-09-16 对齐酒店订单详情：
       订单信息卡（编号+状态 → 渠道/销售/时间/应收/实收）→ 产品信息 → 办签人 →
       联系人信息 → 发票报销 → 财务三栏页签（交易信息 / 收退转 / 合同信息）。
       原「金额、收退转、合同与发票」三段并排，改成酒店那套真正的页签切换。 */
    function orow(k, v, cls) {
      return '<div class="ym-odrow"><span class="lb">' + esc(k) + '</span>' +
        '<span class="vl' + (cls ? ' ' + cls : '') + '">' + v + '</span></div>';
    }
    /* 收/退款明细里的键值行：与订单信息卡同一套布局，标签灰、值右对齐 */
    function pv(k, v) {
      return '<div class="ym-payrow"><span class="lb">' + esc(k) + '</span>' +
        '<span class="vl">' + v + '</span></div>';
    }

    var body =
      /* 订单信息卡：编号+状态同一行，下面渠道/销售/时间/应收/实收依次排，与酒店一致。
         支付状态、待录资料、欠款这些销售要盯的提醒，交给状态色、欠款行和底栏主按钮承担。 */
      '<div class="h5-sec ym-odinfo">' +
        '<div class="ym-odno"><span class="lb">' +
          '<i class="od-fico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
          '<path d="M14 2v6h6"/></svg></i><em>订单编号</em><b>' + esc(d.no) + '</b>' +
          '</span><span class="st ' + (STG[d.status] || 'off') + '">' +
          esc(d.status_text) + '</span></div>' +
        orow('渠道名称', esc(row.org || '门店')) +
        orow('销售人员', esc(row.sale_name || '—')) +
        orow('下单时间', d19(d.created_at)) +
        orow('应收金额', '<b>' + ymMoney(d.amount) + '</b>') +
        orow('实收金额', ymMoney((d.recv || 0) + (d.recv_wait || 0))) +
        (row.owe > 0 && d.status !== 'cancelled' && d.status !== 'refunded'
          ? orow('欠款', '<b style="color:#d33">' + ymMoney(row.owe) + '</b>') : '') +
        '<div class="ym-odact"><a class="nt" data-odsale>修改销售</a><a class="gh" data-odlog>订单日志</a></div>' +
      '</div>' +

      sec('产品信息',
        kv('产品', esc(d.product)) +
        kv('套餐', esc(d.pkg || '—')) +
        kv('目的地', esc(d.country || '') + (d.visa_type ? ' · ' + esc(d.visa_type) : '')) +
        kv('出行日期', d.depart_date ? d10(d.depart_date) : '待定') +
        kv('办签人数', d.pax + ' 人') +
        /* 政策不单独成卡，跟酒店一样直接并在产品信息下面，红字两行（取消/受理）。
           发票已并入下方「发票报销」卡，这里不再重复。 */
        '<div class="ym-odpol">' +
          '<div class="p"><i>取消与退款</i><s>' +
          (d.status === 'created'
            ? '订单支付前可直接取消。'
            : '订单已支付，取消需提交退款申请，按已产生的官费与服务成本核减后退还余款。') +
          '签证费为使领馆收取的官方费用，按各国规定不予退还。</s></div>' +
          '<div class="p"><i>受理与时效</i><s>' +
          esc(d.submit_city || '—') + '领区受理，本套餐办理时长约 ' +
          (d.lead_days ? d.lead_days + ' 个工作日' : '—') +
          '（不含使领馆节假日与行政审查）。</s></div>' +
        '</div>') +


      /* 每位办签人下面挂的动作要与 CSP 订单详情一一对应
         （唐美芳 2026-09-02：「尽量保证 csp 和有米的功能操作一致的哈」）：
         帮客人补录资料（11 格基础信息）/ 代填申请表（官方那几十格）/
         发给客人填 / 材料清单。 */
      sec('办签人',
        d.applicants.map(function (a) {
          return '<div class="ym-apx">' +
            '<div class="h5-row" data-ap="' + a.id + '">' +
            '<span class="lb od-apn">' + esc(a.name) +
            '<s>' + esc(a.id_type || '护照') + ' ' + esc(a.id_no || '证件未填') + '</s></span>' +
            '<span class="vl">' + esc(a.state === 'normal' ? a.progress_text : '已退出') +
            (a.supp_open ? '<em class="od-wn">' + a.supp_open + ' 条补料</em>'
              : (a.mat_wait ? '<em class="od-mut">' + a.mat_wait + ' 项待交</em>' : '')) +
            '</span><span class="ar">›</span></div>' +
            (a.state === 'normal' && d.status !== 'cancelled' && d.status !== 'refunded'
              /* 按钮分级同后台：这一步最该做的填色，其余线框浅色
                 （唐美芳 2026-09-02：「现在小字展示操作按钮看不出来」）。 */
              ? '<div class="ym-apop">' +
                '<a class="' + (a.mat_wait || a.supp_open ? 'gh' : 'pr') +
                '" data-apedit="' + a.id + '">补录资料</a>' +
                /* 「发给客人填」2026-09-08 收进申请表页（批 1：代填与发给客人填
                   合成一个页面），这一行不再单独占一个入口。 */
                (a.form
                  ? '<a class="' + (a.mat_wait || a.supp_open ? 'gh' : 'pr') +
                    '" data-apform="' + a.id + '">' +
                    (a.form.ask_left ? '填申请表 · 剩 ' + a.form.ask_left + ' 题'
                                     : '申请表 · ' + esc(a.form.status_text || '已填')) +
                    '</a>' : '') +
                '<a class="gh" data-apmat="' + a.id + '">材料清单</a></div>'
              : '') + '</div>';
        }).join(''), '共 ' + d.applicants.length + ' 人', 'aps') +

      /* 客人签证资料：订单级资料录入状态。与「办签人」同属资料录入，紧挨着摆，
         销售不用在一页里上下翻着找（唐美芳 2026-09-16：两处资料都要录，别分开老远）。
         「付款前需录齐」2026-09-02 起不成立——收款不再被资料卡住，这里只提示时限。 */
      sec('客人签证资料',
        '<div class="h5-row" data-k="ordinfo"><span class="lb">' +
        (d.info_state === 'done' ? '资料已录入' : '待录入签证资料') + '</span>' +
        '<span class="vl">' + (d.info_state === 'done'
          ? '可在送签前修改'
          : (d.status === 'created'
              ? '未付款超时会自动取消' + (d.info_left ? '，' + esc(d.info_left) : '')
              : '资料齐备后方可编入送签批次')) +
        '</span><span class="ar">›</span></div>') +

      /* 联系人信息：对齐酒店——姓名/手机/邮箱单独一个卡，护照寄回地址随单附在这里。 */
      sec('联系人信息',
        kv('姓名', esc(d.contact.name || '—')) +
        kv('手机号码', esc(d.contact.phone || '—')) +
        kv('电子邮箱', esc(d.contact.email || '未填写')) +
        (d.note
          ? kv('订单备注', '<span style="white-space:pre-wrap">' + esc(d.note) + '</span>')
          : '') +
        (d.recv_addr
          ? kv('护照寄回', esc(d.recv_addr.contact + '　' + d.recv_addr.region + ' ' + d.recv_addr.detail))
          : '')) +

      /* 发票报销：对齐酒店，单独一个卡，只登记开票抬头。 */
      sec('发票报销',
        kv('开票抬头', esc((d.invoice && d.invoice.entity) ? d.invoice.entity : '不提供发票'))) +

      /* 财务三栏页签：交易信息 / 收退转 / 合同信息，点页签切内容（对齐酒店）。 */
      '<div class="ym-odfin">' +
        '<div class="ym-odseg">' +
          '<a class="on" data-fin="tx">交易信息</a>' +
          '<a data-fin="fund">收退转</a>' +
          '<a data-fin="contract">合同信息</a>' +
        '</div>' +

        /* 交易信息：交易明细双列（报名项 | 销售金额 | 结算金额） */
        '<div class="ym-odfx" data-fx="tx">' +
          '<div class="ym-txh">交易明细</div>' +
          '<div class="ym-txhd"><span>报名项</span><i>销售金额</i><i>结算金额</i></div>' +
          '<div class="ym-txrow">' +
            '<span class="nm">报名 · ' + esc(d.product) + '</span>' +
            '<i>' + ymMoney(d.amount) + '</i>' +
            '<i>' + ymMoney(row.settle_amount || 0) + '</i>' +
          '</div>' +
          '<div class="ym-txsum">' +
            '<div class="h5-row" style="cursor:default"><span class="lb">已收</span>' +
              '<span class="vl">' + ymMoney((d.recv || 0) + (d.recv_wait || 0)) + '</span></div>' +
            (row.owe > 0 && d.status !== 'cancelled' && d.status !== 'refunded'
              ? '<div class="h5-row" style="cursor:default"><span class="lb">欠款</span>' +
                '<span class="vl"><b style="color:#d33">' + ymMoney(row.owe) + '</b></span></div>' : '') +
            (row.refunded
              ? '<div class="h5-row" style="cursor:default"><span class="lb">已退</span>' +
                '<span class="vl">' + ymMoney(row.refunded) + '</span></div>' : '') +
            '<div class="h5-row" style="cursor:default"><span class="lb">本单毛利</span>' +
              '<span class="vl"><b style="color:#27AE60">' + ymMoney(row.gross || 0) + '</b>' +
              (d.amount ? '<em class="od-mut">' +
                Math.round((row.gross || 0) * 1000 / d.amount) / 10 + '%</em>' : '') + '</span></div>' +
          '</div>' +
          '<div class="h5-gn">结算价与毛利仅门店销售可见，不对客展示。</div>' +
        '</div>' +

        /* 收退转：二级页签 收款信息 / 退款信息（签证无转款，只列这两类） */
        '<div class="ym-odfx" data-fx="fund" style="display:none">' +
          '<div class="ym-subseg">' +
            '<a class="on" data-sub="recv">收款信息</a>' +
            '<a data-sub="refund">退款信息</a>' +
          '</div>' +
          '<div class="ym-subfx" data-subx="recv">' +
            ((d.pays && d.pays.length)
              ? d.pays.map(function (p) {
                  var A = { wait: ['待审核', 'wait'], pass: ['已审核', 'ok'], error: ['有误', 'bad'] };
                  var a = A[p.audit_status] || A.wait;
                  return '<div class="ym-pay">' +
                    pv('收款单号', esc(p.no || '—')) +
                    pv('发起时间', d19(p.created_at)) +
                    pv('收款类别', esc(p.cate || '—')) +
                    pv('收款方式', esc(p.method || '—')) +
                    pv('支付金额', '<b style="color:#27AE60">+' + ymMoney(p.amount) + '</b>') +
                    pv('业务审核状态', '<span class="st-dot ' + a[1] + '">' + a[0] + '</span>') +
                    pv('财务审核状态', p.confirmed ? '<span class="st-dot ok">已到账</span>'
                                                 : '<span class="st-dot wait">待到账</span>') +
                  '</div>';
                }).join('')
              : '<div class="h5-empty"><b>还没有收款流水</b>' +
                '<s>客户付款后，此处展示本单收款明细</s></div>') +
          '</div>' +
          '<div class="ym-subfx" data-subx="refund" style="display:none">' +
            ((d.refunds && d.refunds.length)
              ? d.refunds.map(function (r) {
                  return '<div class="ym-pay">' +
                    pv('退款单号', esc(r.no || '—')) +
                    pv('发起时间', d19(r.created_at)) +
                    pv('退款原因', esc(r.reason || '—')) +
                    pv('退款金额', '<b style="color:#d33">-' + ymMoney(r.amount) + '</b>') +
                    pv('审批状态', esc(r.status_text || '—')) +
                  '</div>';
                }).join('')
              : '<div class="h5-empty"><b>还没有退款流水</b>' +
                '<s>发起退款后，此处展示本单退款进度</s></div>') +
          '</div>' +
          '<div class="h5-gn">收款与退款流水，与财务台账同一口径。</div>' +
        '</div>' +

        '<div class="ym-odfx" data-fx="contract" style="display:none">' +
          kv('合同状态', esc(row.contract_status || '未签约')) +
          kv('合同编号', '—') +
          kv('签约主体', esc(row.org || '直客')) +
          kv('结算主体', esc(d.settle_entity || '—')) +
          kv('签约日期', '—') +
          '<div class="h5-gn">合同在众信合同系统签署归档，本系统只登记状态与主体；' +
          '开票在众信财务系统完成，可联系服务销售人员申请。</div>' +
        '</div>' +
      '</div>' +

      (d.status !== 'created' && d.status !== 'cancelled'
        ? sec('其他操作',
          '<div class="h5-row" data-k="tasks"><span class="lb">客户填表</span>' +
          '<span class="vl">代填或发链接给客人</span><span class="ar">›</span></div>' +
          ((d.status === 'paid' && d.gate) || d.status === 'done'
            ? '<div class="h5-row" data-k="refund"><span class="lb">申请退款</span>' +
              '<span class="vl">按办理进度试算可退金额</span><span class="ar">›</span></div>'
            : ''))
        : '');

    /* 底栏主按钮随状态变：待付款一律给收款，有补料去催，其余看进度。
       资料没齐时把提示做成可点的次级入口（点一下就跳去录资料），
       但不再顶替掉收款按钮——否则销售在这一页永远付不了款。 */
    var sumTx, cta, ctaK;
    if (d.status === 'created') {
      sumTx = d.info_state !== 'done'
        ? '<span class="sum od-urge" data-k="ordinfo">资料未齐 · 点此录入</span>'
        : '<span class="sum">待收款 <b>' + ymMoney(d.amount) + '</b></span>';
      cta = '代客收款'; ctaK = 'pay';
    } else if (suppN) {
      sumTx = '<span class="sum od-urge"><b>' + suppN + '</b> 条补料待客人处理</span>';
      cta = '发给客人补料'; ctaK = 'share';
    } else if (waitN) {
      sumTx = '<span class="sum"><b>' + waitN + '</b> 项材料待交</span>';
      cta = '发给客人交材料'; ctaK = 'share';
    } else {
      sumTx = '<span class="sum">' + esc(d.status_text) + '</span>';
      cta = '看办理进度'; ctaK = 'track';
    }
    var foot = sumTx + '<button class="cta" data-cta>' + esc(cta) + '</button>';

    m.innerHTML = pageH('有米小程序 · 订单详情',
      '信息结构与客户端订单详情一致，销售端多两块：<b>金额（含结算与毛利）</b>与' +
      '<b>代客操作</b>（收款、录资料、发送链接提醒交材料）。') +
      ymPage('订单详情', body, foot, '这一步在做什么',
        '每位办签人各走各的节点，点进去看这个人的材料明细。' +
        '底部按钮随本单当前最紧要的事项变化——待付款时先录资料，有补料时先提醒客人。',
        true, 'orders', '', 'ym odetail');

    $('[data-back]', m).onclick = function () { go('orders'); };

    /* 改派销售：对齐酒店订单详情「修改销售」按钮（2026-09-16）。
       拉同门店候选，弹下拉改派；保存成功重拉详情，销售人员与日志一起更新。 */
    $('[data-odsale]', m).onclick = function () {
      api('/my/order/sale', { act: 'list' }).then(function (r) {
        var list = r.list || [];
        if (list.length <= 1) {
          toast('本门店暂无其他销售人员可改派', true);
          return;
        }
        ask('修改销售', [
          { k: 'sale_id', label: '改派给', type: 'select', value: '',
            options: list.map(function (x) { return { v: x.id, t: x.name }; }),
            hint: '将本订单改派给同门店的另一位销售人员' }
        ], '确认改派', function (vals) {
          if (!vals.sale_id) { toast('请选择销售人员', true); return Promise.reject(); }
          return api('/my/order/sale', { no: d.no, sale_id: vals.sale_id }).then(function (res) {
            toast('已改派给 ' + res.sale_name);
            return VIEWS['youmi:odetail'](m, d.no);
          });
        });
      }).catch(function () { });
    };

    /* 订单日志：与 CSP 订单详情同一套弹窗口径（2026-09-16 对齐酒店「订单日志」按钮） */
    $('[data-odlog]', m).onclick = function () {
      var rows_ = d.logs || [];
      confirmBox('订单日志 · ' + d.no,
        (rows_.length
          ? '<div class="od-log">' + rows_.map(function (e) {
              return '<div class="od-le"><i>' + d19(e.at) + '</i>' +
                '<b>' + esc(e.actor || '系统') + '</b>' +
                '<s>' + esc(e.action) + '</s>' +
                (e.detail ? '<em>' + esc(e.detail) + '</em>' : '') + '</div>';
            }).join('') + '</div>'
          : '<div class="empty">暂无日志</div>'), '关闭')
        .catch(function () { });
    };

    $$('[data-ap]', m).forEach(function (r) {
      r.onclick = function () { go('mats', r.dataset.ap); };
    });
    /* 代填官方申请表：与 CSP 同一张表，只是走有米自己的路由外壳 */
    $$('[data-apform]', m).forEach(function (r) {
      r.onclick = function (e) {
        e.stopPropagation(); S.cache.cfSec = null; go('formfill', r.dataset.apform);
      };
    });
    /* 帮客人补录：进「录入客人签证资料」页，定位到这一位 */
    $$('[data-apedit]', m).forEach(function (r) {
      r.onclick = function (e) { e.stopPropagation(); go('ordinfo', d.no); };
    });
    $$('[data-apmat]', m).forEach(function (r) {
      r.onclick = function (e) { e.stopPropagation(); go('mats', r.dataset.apmat); };
    });
    /* 发给客人填：统一走 core.js 的 shareTask()（订单卡等其他位置仍可能用到） */
    $$('[data-apshare]', m).forEach(function (r) {
      r.onclick = function (e) {
        e.stopPropagation();
        var a = d.applicants.filter(function (x) { return x.id === +r.dataset.apshare; })[0] || {};
        ymShare({ no: d.no, aps: [{ id: a.id, name: a.name }] });
      };
    });
    var JUMP = {
      ordinfo: function () { go('ordinfo', d.no); },
      tasks: function () { go('tasks'); },
      refund: function () { go('refund'); }
    };
    $$('[data-k]', m).forEach(function (r) {
      r.onclick = function () { (JUMP[r.dataset.k] || function () { })(); };
    });
    $('[data-cta]', m).onclick = function () {
      if (ctaK === 'ordinfo') return go('ordinfo', d.no);
      if (ctaK === 'pay') {
        return api('/order/pay', { no: d.no })
          .then(function (r) { toast(r.msg); reload(); }).catch(fail);
      }
      if (ctaK === 'track') {
        var a0 = d.applicants.filter(function (x) { return x.state === 'normal'; })[0];
        return a0 ? go('mats', a0.id) : toast('暂无可查看的办签人', true);
      }
      if (ctaK === 'share') {
        return ymShare({ no: d.no, aps: d.applicants
          .filter(function (x) { return x.state === 'normal'; })
          .map(function (x) { return { id: x.id, name: x.name }; }) });
      }
    };
    /* 财务主 Tab（交易信息/收退转/合同信息）与收退转二级 Tab（收款/退款）切换，
       对齐酒店订单详情的页签交互。 */
    $$('.ym-odseg a[data-fin]', m).forEach(function (a) {
      a.onclick = function () {
        $$('.ym-odseg a[data-fin]', m).forEach(function (x) {
          x.classList.toggle('on', x === a);
        });
        $$('.ym-odfx', m).forEach(function (x) {
          x.style.display = x.dataset.fx === a.dataset.fin ? '' : 'none';
        });
      };
    });
    $$('.ym-subseg a[data-sub]', m).forEach(function (a) {
      a.onclick = function () {
        $$('.ym-subseg a[data-sub]', m).forEach(function (x) {
          x.classList.toggle('on', x === a);
        });
        $$('.ym-subfx', m).forEach(function (x) {
          x.style.display = x.dataset.subx === a.dataset.sub ? '' : 'none';
        });
      };
    });
    ymBind(m, 'orders');
  });
};

VIEWS['youmi:mats'] = function (m, aid) {
  if (!aid) return go('orders');
  return api('/my/checklist?applicant_id=' + aid).then(function (d) {
    var left = Math.max(d.stat.total - d.stat.pass - d.stat.review, 0);
    var body =
      '<div class="cf-hero"><div class="st">' + esc(d.applicant.name) +
      '<em>' + esc(d.applicant.progress_text) + '</em></div>' +
      '<div class="sub">' + (left ? '还差 ' + left + ' 项材料，可以把链接发给客人自己交。'
        : '材料已齐备，等待签证专员复核。') + '</div>' +
      '<div class="chips"><span>' + esc(d.applicant.crowd) + '</span>' +
      '<span>已通过 ' + d.stat.pass + ' / ' + d.stat.total + '</span></div></div>' +
      '<div class="h5-sec"><div class="h5-h"><span>材料清单</span></div>' +
      d.list.map(function (i) {
        return '<div class="h5-row" style="cursor:default"><span class="lb od-apn">' +
          esc(i.mat_name) + '<s>' + esc(i.attr_text) + ' × ' + i.copies + ' · ' +
          esc(i.way_text) + '</s></span>' +
          '<span class="vl">' + matTag(i.status) + '</span></div>';
      }).join('') + '</div>';
    var foot = '<span class="sum">' + (left ? '还差 <b>' + left + '</b> 项' : '材料已齐') + '</span>' +
      '<button class="cta" data-sh>发给客人自己交</button>';
    m.innerHTML = pageH('材料明细 · ' + d.applicant.name,
      '销售查这位办签人交到哪一步了，可以直接生成链接让本人自己交。') +
      ymPage(esc(d.applicant.name) + ' · 材料', body, foot, '这一步在做什么',
        '销售在这里只看不传：材料要么客人自己在链接里传，要么寄原件到收料地址。' +
        '销售替客人传，出了问题说不清是谁交的。', true, '', '', 'ym');
    $('[data-back]', m).onclick = function () { history.back(); };
    $('[data-sh]', m).onclick = function () {
      ymShare({ no: '', aps: [{ id: d.applicant.id, name: d.applicant.name }] });
    };
    ymBind(m, 'orders');
  });
};

/* ---------------- 我的 ----------------
   CSP 六个功能域里，「客户填表 / 客户管理 / 财务管理」在手机上收到这里
   ——底部四个 Tab 是上限，再多点不准。功能一个不少，只是入口换了位置。 */
VIEWS['youmi:me'] = function (m) {
  return api('/my/orders').then(function (j) {
    var list = j.list || [];
    var u = S.user || {};
    var sum = list.reduce(function (a, o) {
      return a + (o.status === 'cancelled' || o.status === 'refunded' ? 0 : (o.amount || 0));
    }, 0);
    var body =
      '<div class="cf-hero"><div class="st">' + esc(u.name || '门店销售') + '</div>' +
      '<div class="sub">' + esc(u.org || '众信旅游') + ' · 有米小程序</div>' +
      '<div class="chips"><span>成交 ' + list.length + ' 单</span>' +
      '<span>成交额 ' + ymMoney(sum) + '</span></div></div>' +

      '<div class="h5-sec"><div class="h5-h"><span>客户填表</span></div>' +
      '<div class="h5-row" data-k="tasks"><span class="lb">DS-160 填表任务</span>' +
      '<span class="vl">代客填写或生成链接由客人填写</span><span class="ar">›</span></div></div>' +

      '<div class="h5-sec"><div class="h5-h"><span>客户管理</span></div>' +
      '<div class="h5-row" data-k="customers"><span class="lb">客户档案</span>' +
      '<span class="vl">查看客户资料与历史订单</span><span class="ar">›</span></div></div>' +

      '<div class="h5-sec"><div class="h5-h"><span>财务管理</span>' +
      '<span class="more">只读</span></div>' +
      '<div class="h5-row" data-k="recv"><span class="lb">收款查询</span>' +
      '<span class="vl">查询订单收款到账情况</span><span class="ar">›</span></div>' +
      '<div class="h5-row" data-k="refund"><span class="lb">退款查询</span>' +
      '<span class="vl">查询退款审批与出账进度</span><span class="ar">›</span></div></div>' +

      '<div class="h5-sec"><div class="h5-h"><span>说明</span></div>' +
      '<div class="h5-gn">有米小程序是 <b>CSP 门店工作台的移动端</b>：同一个账号、同一套数据、' +
      '同一批功能，手机上做的单在 PC 上立刻能看到。' +
      '审核、到账确认、结算这些后台动作仍在 PC 端与 UOM 完成。</div></div>';
    m.innerHTML = pageH('有米小程序 · 我的',
      '销售个人页，同时承载 CSP 的「客户填表 / 客户管理 / 财务管理」三个功能域——' +
      '手机底部四个 Tab 是上限，这三项收进这里，功能一个不少。') +
      ymPage('我的', body, '', '这一步在做什么',
        '有米不是另一套系统：CSP 有的六个功能域这里都有，视图名与数据源完全一致，' +
        '只是把「查产品、代客下单、跟单、发链接」这四件在客人面前要做的事放到了最前面。',
        false, 'me', '', 'ym');
    $$('[data-k]', m).forEach(function (r) {
      r.onclick = function () { go(r.dataset.k); };
    });
    ymBind(m, 'me');
  });
};

/* ============================================================
   以下四个页面对应 CSP 的另外三个功能域，唐美芳 2026-09-01：
   「应该就是csp的移动端才对啊」——CSP 有的，有米就得有，
   视图名、字段口径、数据源全部与 CSP 一致，只是渲染成手机形态。
   ============================================================ */

/* ---------- 工作台（对应 csp:home） ----------
   版式复刻 travel-sales 的 Home：渐变横幅 + 三格数据 + 三个快捷入口 + 待办订单卡。 */
function ymOrdCard(o) {
  var st = ORD_ST_CN[o.status] || o.status_text;
  var cls = { created: 'wait', paid: 'doing', done: 'ok',
              cancelled: 'off', refunded: 'bad' }[o.status] || 'off';
  return '<div class="ymc" data-od="' + esc(o.no) + '">' +
    '<div class="t1"><div><s>' + esc(o.no) + '</s><b>' + esc(o.contact || '—') + '</b></div>' +
    '<span class="ymb ' + cls + '">' + esc(st) + '</span></div>' +
    '<div class="ln"><i>◎</i>' + esc(o.product) + '</div>' +
    '<div class="meta"><span>' +
    (o.depart_date ? d10(o.depart_date) + ' 出发' : '出行日期待定') + '</span>' +
    '<span>' + o.pax + ' 人 · ' + esc(o.pkg || '—') + '</span></div>' +
    /* 底行放待办；待办与右上角状态胶囊同文时改放金额，别把同一句话说两遍 */
    '<div class="ft"><span>' + (o.todo && o.todo !== st ? esc(o.todo) : ymMoney(o.amount)) +
    '</span>' +
    '<span class="ar">›</span></div></div>';
}

/* ---------------- 工作台（照原型 B 端工作台）---------------- */
VIEWS['youmi:home'] = function (m) {
  return Promise.all([api('/my/orders'), api('/my/supp')]).then(function (r) {
    var all = r[0].list, supp = r[1].list.filter(function (s) { return s.status === 'open'; });
    var u = S.user || {};
    var gmv = all.reduce(function (a, b) {
      return a + (b.status === 'cancelled' || b.status === 'refunded' ? 0 : (b.amount || 0));
    }, 0);
    var settle = all.reduce(function (a, b) {
      return a + (b.status === 'cancelled' || b.status === 'refunded' ? 0 : (b.settle_amount || 0));
    }, 0);
    var live = all.filter(function (o) {
      return o.status !== 'cancelled' && o.status !== 'refunded';
    });

    /* 待办十宫格：原型里是跟团游那十项，签证订单要换成签证真正会卡住的十件事，
       数字全部由订单与工单算出来，不摆假数据。 */
    var todos = [
      ['待录资料', all.filter(function (o) { return o.info_state === 'wait'; }).length, 'info'],
      ['待付款', all.filter(function (o) { return o.status === 'created'; }).length, 'pay'],
      /* 原来这格是「待财务确认」——那是总部财务的活，门店销售既看不懂也做不了。
         换成销售真正要追的「部分支付」：客人只付了定金，尾款得销售去催
         （唐美芳 2026-09-03）。 */
      ['部分支付', all.filter(function (o) { return o.pay_state === 'part'; }).length, 'gate'],
      ['待交材料', all.filter(function (o) { return (o.todo || '').indexOf('材料') >= 0; }).length, 'mat'],
      ['补料通知', supp.length, 'supp'],
      /* 办签状态 2026-09-03 改三态（未完成 / 部分完成 / 已完成），
         「办理中」这个词没有了，这两格改成按「已付款且还没全部出结果」算 */
      ['待填申请表', all.filter(function (o) {
        return o.status === 'paid' && o.work_status !== '已完成';
      }).length, 'form'],
      ['办理中', all.filter(function (o) {
        return o.status === 'paid' && o.work_status !== '已完成';
      }).length, 'doing'],
      ['已出结果', all.filter(function (o) { return o.work_status === '已完成'; }).length, 'done'],
      ['本月成交', live.length, 'gmv'],
      ['已退款', all.filter(function (o) { return o.status === 'refunded'; }).length, 'refund']
    ];
    var todoN = todos[0][1] + todos[1][1] + todos[4][1];

    var body =
      '<div class="uy-hd">' +
      '<div class="uy-user"><i>' + esc((u.name || '销')[0]) + '</i>' +
      '<div class="m"><b>' + esc(u.name || '门店销售') + '<em>店长</em></b>' +
      '<s>◎ ' + esc(u.org || '众信旅游门店') + '</s></div>' +
      '<a class="edit" title="待办 ' + todoN + ' 项">✎</a></div></div>' +

      '<div class="uy-wrap">' +
      '<div class="uy-card"><div class="uy-ct"><b>待办订单</b>' +
      '<s>' + (todoN ? '有 ' + todoN + ' 项要处理' : '暂无待处理') + '</s></div>' +
      '<div class="uy-todo">' + todos.map(function (t) {
        return '<a data-td="' + t[2] + '"' + (t[1] ? ' class="warn"' : '') + '>' +
          '<b>' + t[1] + '</b><s>' + t[0] + '</s></a>';
      }).join('') + '</div></div>' +

      /* 品牌直通车：原型里是一条通栏 banner，这里落成签证频道的入口 */
      '<a class="uy-ban" data-go="acquire"><div class="tx"><b>签证直通车</b>' +
      '<s>众信旅游「优游有米」· 签证代客下单</s></div><i>✈</i></a>' +

      '<div class="uy-card"><div class="uy-ct"><b>核心数据</b><s>本店累计</s></div>' +
      '<div class="uy-core">' +
      '<div><s>订单流水</s><b class="c1">' + ymMoney(gmv) + '</b></div>' +
      '<div><s>客单价</s><b class="c2">' +
      ymMoney(live.length ? gmv / live.length : 0) + '</b></div>' +
      '<div><s>订单合同价</s><b class="c3">' + ymMoney(gmv) + '</b></div>' +
      '<div><s>订单结算价</s><b class="c4">' + ymMoney(settle) + '</b></div>' +
      '</div></div>' +

      '<div class="uy-qk">' +
      [['acquire', '签证产品', '代客下单 · 查报价', 'g1'],
       ['orders', '订单管理', all.length + ' 单 · ' + todoN + ' 项待办', 'g2'],
       ['customers', '客户管理', '客户档案与历史订单', 'g3'],
       ['tasks', '客户填表', '代填或发链接给客人', 'g4']].map(function (x) {
        return '<a class="uy-qk-i" data-go="' + x[0] + '"><i class="' + x[3] + '"></i>' +
          '<div class="m"><b>' + x[1] + '</b><s>' + esc(x[2]) + '</s></div><em>›</em></a>';
      }).join('') + '</div>' +
      '</div>';

    m.innerHTML = pageH('有米小程序 · 工作台',
      '门店销售的手机端。<b>与 CSP 工作台同一套账号、同一份数据</b>，只是终端不同——' +
      '没有电脑的时候用手机一样能查产品、代客下单、跟单。') +
      ymPage('工作台', body, '', '这一步在做什么',
        '待办十宫格与核心数据全部由订单和工单实时算出来。' +
        '「签证直通车」进的是签证频道，往下是国家列表、产品详情、代客下单，' +
        '与 CSP 电脑端是同一批产品、同一套价格护栏与审核口径。',
        false, 'home');
    $$('[data-go]', m).forEach(function (a) {
      a.onclick = function () { go(a.dataset.go); };
    });
    /* 十宫格点进去落到对应的过滤视图，不做点了没反应的格子 */
    var TD = { info: ['orders', 'created'], pay: ['orders', 'created'],
               gate: ['orders', 'paid'], mat: ['orders', 'paid'], supp: ['orders', 'paid'],
               form: ['tasks', ''], doing: ['orders', 'paid'], done: ['orders', 'done'],
               gmv: ['orders', 'all'], refund: ['orders', 'refunded'] };
    $$('[data-td]', m).forEach(function (a) {
      a.onclick = function () {
        var t = TD[a.dataset.td];
        if (!t) return;
        if (t[1]) S.cache.ymOF = t[1];
        go(t[0]);
      };
    });
    ymBind(m, 'home');
  });
};

/* ---------------- 收客（照原型 B 端「收客」页）----------------
   原型这一页是搜索条 + 品类九宫格 + 「身边人都在卖」。
   唐美芳 2026-09-01：「在收客这里，增加签证频道，点击进入签证频道页，
   同 pc 端内容一样」——所以品类里加「签证」，点进去就是签证频道。
   其余品类是集团其它业务线，本系统不涉及，保留入口但标明不在本期范围。 */
/* 品类瓷砖。顺序与配色照唐美芳给的「优游有米」真机截图逐格取色：
   全部旅游 → 外采单项 共 10 格。截图里<b>没有签证</b>——签证是本系统的主体，
   补在第一格（唐美芳 2026-09-02：「签证频道不要忘记增加了」），
   加上末位的「全部分类」凑成 12 格排 4×3，比 5 列挤成两行半整齐。
   [key, 名称, 渐变, 是否本系统承载] */
var UY_CATE = [
  ['visa', '签证', 'linear-gradient(135deg,#FF7A45,#F0403C)', 1],
  ['tour', '全部旅游', 'linear-gradient(135deg,#FF8A80,#FF7043)', 0],
  ['made', '众信制造', 'linear-gradient(135deg,#E8D5A3,#D4BE85)', 0],
  ['und', '优耐德', 'linear-gradient(135deg,#7FD8B8,#4FC3A1)', 0],
  ['zy', '竹园', 'linear-gradient(135deg,#FFC46B,#FFA030)', 0],
  ['hotel', '酒店预订', 'linear-gradient(135deg,#AFCEF0,#88B4E4)', 0],
  ['theme', '主题旅游', 'linear-gradient(135deg,#7B9CE0,#5B7BCC)', 0],
  ['single', '单团定制', 'linear-gradient(135deg,#CDA6E0,#B182D2)', 0],
  ['ai', 'AI 定制', 'linear-gradient(135deg,#63A4DE,#3F86C8)', 0],
  ['own', '自研单项', 'linear-gradient(135deg,#C9DC72,#AFC953)', 0],
  ['out', '外采单项', 'linear-gradient(135deg,#F4695F,#E0403C)', 0],
  ['all', '全部分类', 'linear-gradient(135deg,#B9C2CE,#9BA6B4)', 0]
];

/* 「身边人都在卖」的三档，对应截图里那三个页签。
   排序口径全部落在系统真有的数据上，不是摆设：
   销量担当＝本店成交单数、利润拔尖＝毛利、新品抢先＝上架时间。 */
var UY_SEG = [
  ['hot', '销量担当'], ['profit', '利润拔尖'], ['new', '新品抢先']
];

VIEWS['youmi:acquire'] = function (m) {
  return Promise.all([api('/shop/products'), api('/my/orders')]).then(function (r) {
    var rows = [];
    (r[0].list || []).forEach(function (p) {
      (p.suppliers || []).forEach(function (sp) { rows.push({ p: p, s: sp }); });
    });
    var ords = r[1].list;
    /* 本店卖出过几单这个产品——「销量担当」按它排，也摆在卡片下面那行。
       按<b>产品名</b>精确比，不能按国家模糊比：同一个国家好几个产品，
       按国家算出来每张卡的数字都一样，摆在卡上等于假数据。 */
    function ordsOf(x) {
      var nm = x.s.name || x.p.name;
      return ords.filter(function (o) { return o.product === nm; });
    }
    function soldOf(x) { return ordsOf(x).length; }
    /* 还在办的：已付款、还没走完的那些，销售看它判断这条线现在忙不忙 */
    function liveOf(x) {
      return ordsOf(x).filter(function (o) { return o.status === 'paid'; }).length;
    }
    var seg = S.cache.ymSeg || 'hot';
    var sorted = rows.slice();
    if (seg === 'profit') {
      sorted.sort(function (a, b) { return (b.s.margin || 0) - (a.s.margin || 0); });
    } else if (seg === 'new') {
      sorted.sort(function (a, b) {
        return String(b.s.on_at || '').localeCompare(String(a.s.on_at || '')) ||
          b.s.sup_product_id - a.s.sup_product_id;
      });
    } else {
      sorted.sort(function (a, b) {
        return soldOf(b) - soldOf(a) || (b.s.margin || 0) - (a.s.margin || 0);
      });
    }
    var hot = sorted.slice(0, 6);
    var kw = S.cache.ymKw || '';
    var aiOff = S.cache.ymAiOff;

    var body =
      /* ① 页头：白底、居中标题、红框搜索条 + AI 搜索 / 消息 / 扫码 */
      '<div class="uyq-hd">' +
      '<div class="uyq-tt">优游有米</div>' +
      '<div class="uyq-sr">' +
      '<div class="uyq-box">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
      '<input id="uy-kw" value="' + esc(kw) + '" placeholder="供应商/名称/编码/关键">' +
      '<button data-search>搜索</button></div>' +
      '<div class="uyq-ic">' +
      '<a data-aisearch><b>AI</b>搜索</a>' +
      '<a data-bell><svg viewBox="0 0 24 24" fill="currentColor">' +
      '<path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1Z"/>' +
      '</svg></a>' +
      '<a data-scan><svg viewBox="0 0 24 24" fill="currentColor">' +
      '<path d="M3 3h8v8H3V3Zm2 2v4h4V5H5Zm8-2h8v8h-8V3Zm2 2v4h4V5h-4ZM3 13h8v8H3v-8Zm2 2v4h4v-4H5Zm10-2h2v2h-2v-2Zm4 0h2v6h-2v-2h-2v4h-2v-6h4v-2Z"/>' +
      '</svg></a></div></div></div>' +

      /* ② 营销 banner + AI 助手气泡 */
      '<div class="uyq-bn">' +
      '<div class="im"><div class="tx"><b>营销视频</b><s>人人都是自媒体达人</s></div>' +
      '<i class="rb">▣</i></div>' +
      '<div class="uyq-dots"><i></i><i class="on"></i><i></i><i></i><i></i></div>' +
      (aiOff ? '' :
        '<div class="uyq-ai"><i class="bot">🤖</i>' +
        '<div><b>AI 智能推荐</b>已上线<br>一句话即可为您筛选合适产品</div>' +
        '<i class="x" data-aix>×</i></div>') +
      '</div>' +

      '<div class="uy-wrap">' +
      /* ③ 品类瓷砖 */
      '<div class="uyq-cate">' + UY_CATE.map(function (c) {
        return '<a data-cate="' + c[0] + '"' + (c[3] ? ' class="vis"' : '') +
          ' style="background:' + c[2] + '">' + esc(c[1]) + '</a>';
      }).join('') + '</div>' +

      /* ④ 身边人都在卖 */
      '<div class="uyq-h"><i>🔥</i><b>身边人都在卖</b><a data-go="book">更多 ›</a></div>' +
      '<div class="uyq-seg">' + UY_SEG.map(function (g) {
        return '<a data-seg="' + g[0] + '"' + (g[0] === seg ? ' class="on"' : '') + '>' +
          esc(g[1]) + '</a>';
      }).join('') + '</div>' +

      (hot.length ? hot.map(function (x, i) {
        var sold = soldOf(x), live = liveOf(x);
        var settle = x.s.price_min - (x.s.margin || 0);
        return '<a class="uyq-p" data-p="' + x.s.sup_product_id + '">' +
          '<i class="im" style="background-image:url(' + esc(dimg(x.p.country)) + ')">' +
          '<b class="rk">' + (i + 1) + '</b>' +
          /* 图上两枚标签对位截图的「散拼」与「重庆出发」：
             中间放签证类别（客人问的是办什么签，不是哪国），底部放送签地。
             submit_city 本身已经带了「送签」二字，别再拼一次。 */
          '<b class="kd">' + esc(x.p.visa_cat || x.p.country) + '</b>' +
          '<b class="dep">' + esc(x.p.submit_city) + '</b></i>' +
          '<div class="m"><b>' + esc(x.s.name || x.p.name) + '</b>' +
          '<s>' + esc(x.p.submit_city) + ' · 最快 ' + x.s.lead_min + ' 工作日出签</s>' +
          '<span class="sup">' + esc(x.s.supplier) + '</span>' +
          '<div class="pr"><span class="rt">' + ymMoney(x.s.price_min) + '<u> 起</u></span>' +
          (pmSales()
            ? '<span class="st"><em>结</em>' + ymMoney(settle) + ' 起</span>' +
              '<span class="way">毛利 ' + ymMoney(x.s.margin || 0) + ' 起</span>'
            : '') + '</div>' +
          '</div></a>' +
          /* 截图这一行是有米的销售埋点（销售打开 / 分享次数 / 客户浏览 / 有效订单）。
             本系统没有这四个埋点，版式照抄、字段换成系统里真有的，不摆假数字。 */
          '<div class="uyq-st">' +
          '<span>本店成交<b>' + sold + '</b></span>' +
          '<span>在办<b>' + live + '</b></span>' +
          '<span>最快<b>' + x.s.lead_min + '</b>天</span>' +
          '<span>可订供应商<b>' + ((x.p.suppliers || []).length) + '</b></span>' +
          '</div>';
      }).join('') : '<div class="ym-empty"><i>☰</i>暂无在售产品</div>') +
      '</div>';

    m.innerHTML = pageH('有米小程序 · 收客',
      '按唐美芳给的「优游有米」真机截图复刻：红框搜索条 + AI 助手气泡 + 营销 banner + ' +
      '渐变品类瓷砖 + 「身边人都在卖」三档筛选 + 排名产品卡。' +
      '<b>品类第一格「签证」进的就是签证频道</b>，往下与 CSP 电脑端同一套内容与逻辑。' +
      '截图里产品卡下面那行是有米的销售埋点（销售打开 / 分享次数 / 客户浏览 / 有效订单），' +
      '本系统没有这些埋点，<b>版式照抄、字段换成系统里真有的数据</b>，不摆假数字。' +
      '底部导航保持你定的演示三项（签证频道 / 签证助手 / 订单），没有照截图改回五项。') +
      ymPage('收客', body, '', '这一步在做什么',
        '销售找货的入口。三档排序都落在真实数据上——销量担当按本店成交单数、' +
        '利润拔尖按毛利、新品抢先按上架时间。卡片上的结算价与毛利由「零售 / 结算」按钮控制' +
        '（有搜索条的页面在搜索框右侧，其余页面在状态栏右侧），默认客人模式。签证频道里的产品、价格、上架范围与 CSP 完全一致：' +
        '同一批供应商产品、同一套结算价与毛利口径，只是换成了手机上的排版。',
        false, 'acquire', '', 'plain');

    $('[data-search]', m).onclick = function () {
      S.cache.ymKw = $('#uy-kw', m).value.trim();
      go('book');
    };
    $('#uy-kw', m).onkeydown = function (e) {
      if (e.key === 'Enter') { S.cache.ymKw = e.target.value.trim(); go('book'); }
    };
    $$('[data-seg]', m).forEach(function (a) {
      a.onclick = function () { S.cache.ymSeg = a.dataset.seg; reload(); };
    });
    if ($('[data-aix]', m)) {
      $('[data-aix]', m).onclick = function () { S.cache.ymAiOff = 1; reload(); };
    }
    $('[data-aisearch]', m).onclick = function () { go('agent'); };
    $('[data-bell]', m).onclick = function () { go('tasks'); };
    $('[data-scan]', m).onclick = function () {
      confirmBox('扫一扫', '真机上是扫码核销与扫码加客户。演示环境没有摄像头权限，' +
        '这个入口按截图保留位置。', '知道了').catch(function () { });
    };
    $$('[data-cate]', m).forEach(function (a) {
      a.onclick = function () {
        var c = UY_CATE.filter(function (x) { return x[0] === a.dataset.cate; })[0];
        if (c && c[3]) return go('book');
        confirmBox(c ? c[1] : '该品类',
          '本系统是<b>签证业务平台</b>，只承载签证品类。' +
          esc(c ? c[1] : '') + '属于集团其它业务线，入口按真机截图保留，' +
          '实际功能在对应业务系统中。', '知道了').catch(function () { });
      };
    });
    $$('[data-go]', m).forEach(function (a) {
      a.onclick = function () { go(a.dataset.go); };
    });
    $$('[data-p]', m).forEach(function (a) {
      a.onclick = function () { go('book', a.dataset.p); };
    });
    ymBind(m, 'acquire');
  });
};

VIEWS['youmi:tasks'] = function (m) {
  return api('/task/list').then(function (j) {
    var list = j.list || [];
    var left = list.filter(function (t) {
      return t.status !== 'confirmed' && t.status !== 'official';
    });
    var shared = list.filter(function (t) { return t.shared; }).length;
    var body =
      '<div class="ym-wrap">' +
      '<div class="ymh"><div class="hd"><div><s>名下办签人的官方申请表</s>' +
      '<b>' + (left.length ? left.length + ' 张待处理' : '已全部处理完毕') + '</b></div></div>' +
      '<div class="st3"><div><b>' + list.length + '</b><s>表单总数</s></div>' +
      '<div><b>' + (list.length - left.length) + '</b><s>已确认</s></div>' +
      '<div><b>' + shared + '</b><s>链接生效中</s></div></div></div>' +
      (list.length
        ? '<div class="ym-card"><div class="ch">填表任务<em>' + list.length + ' 张</em></div>' +
          list.map(function (t) {
            var st = { wait: 'wait', filling: 'doing', submitted: 'doing',
                       confirmed: 'ok', official: 'ok' }[t.status] || 'off';
            var pr = t.stat ? t.stat.filled + '/' + t.stat.fillable + ' 项' : '';
            return '<div class="ym-row" data-ap="' + t.applicant_id + '">' +
              '<span class="av">' + esc((t.name || '客').slice(0, 1)) + '</span>' +
              '<span class="m"><b>' + esc(t.name) + '</b>' +
              '<s>' + esc(t.ord_no) + ' · ' + esc(t.form_code || '官方申请表') +
              /* filled_by 为空说明系统还没记到填写人，就不写这一格——
                 别再输出「尚未有人填」跟右边的「填写中」自相矛盾 */
              (t.filled_by_text ? ' · ' + esc(t.filled_by_text) : '') + '</s></span>' +
              '<span class="r"><b><span class="ymb ' + st + '">' + esc(t.status_text) +
              '</span></b>' + (pr ? '<s>已填 ' + pr + '</s>' : '') + '</span>' +
              '<span class="ar">›</span></div>';
          }).join('') + '</div>'
        : '<div class="ym-empty"><i>☰</i>名下暂无填表任务</div>') + '</div>';

    m.innerHTML = pageH('有米小程序 · 客户填表',
      '与 CSP「DS-160 填表任务」同一份数据。手机端主要用于<b>向客人发送填写链接</b>，' +
      '逐项代填建议在 PC 端完成。') +
      ymPage('客户填表', body, '', '这一步在做什么',
        '一张订单每位办签人对应一份官方申请表。销售可代为填写，也可生成免登录链接' +
        '交客人自行填写，两者写入的是同一份表单数据。', true, '', '', 'ym');
    $('[data-back]', m).onclick = function () { go('me'); };
    $$('[data-ap]', m).forEach(function (b) {
      b.onclick = function () {
        var t = list.filter(function (x) { return x.applicant_id === +b.dataset.ap; })[0];
        ymShare({ no: t.ord_no, aps: [{ id: t.applicant_id, name: t.name }] });
      };
    });
    ymBind(m, 'me');
  });
};

/* ---------- 客户档案（对应 csp:customers） ---------- */
VIEWS['youmi:customers'] = function (m) {
  return api('/crm/customers').then(function (j) {
    /* 字段口径跟 CSP 客户档案完全一致：orders 是订单数，last_status_k 是最近一单的
       订单状态，amount 是累计成交。之前这里自己编了 ord_count / doing 两个字段，
       接口根本没返回，页面上全是 0。 */
    var list = j.list || [];
    var kw = S.cache.ymCk || '';
    var hit = kw ? list.filter(function (x) {
      return ((x.name || '') + (x.phone || '') + (x.email || '') + (x.last_no || ''))
        .indexOf(kw) >= 0;
    }) : list;
    var rep = list.filter(function (x) { return (x.orders || 0) > 1; }).length;
    var doing = list.filter(function (x) { return x.last_status_k === 'paid'; }).length;
    var amt = list.reduce(function (a, x) { return a + (x.amount || 0); }, 0);

    var body =
      '<div class="ym-top"><div class="ym-srch">' +
      '<input id="ym-ck" value="' + esc(kw) + '" placeholder="搜姓名 / 手机号 / 订单号">' +
      '<button data-cs>搜索</button></div></div>' +
      '<div class="ym-wrap">' +
      '<div class="ymh"><div class="hd"><div><s>本店成交客户</s>' +
      '<b>共 ' + list.length + ' 位</b></div></div>' +
      '<div class="st3"><div><b>' + rep + '</b><s>复购客户</s></div>' +
      '<div><b>' + doing + '</b><s>有在办订单</s></div>' +
      '<div><b>' + ymMoney(amt) + '</b><s>累计成交</s></div></div></div>' +
      (hit.length
        ? '<div class="ym-card"><div class="ch">客户列表<em>' + hit.length + ' 位</em></div>' +
          hit.map(function (x) {
            return '<div class="ym-row" data-ck="' + esc(x.key) + '">' +
              '<span class="av">' + esc((x.name || '客').slice(0, 1)) + '</span>' +
              '<span class="m"><b>' + esc(x.name || '—') + '</b>' +
              '<s>' + esc(x.phone || '—') + ' · ' + esc(x.org || '直客') +
              (x.last_no ? ' · 最近 ' + esc(x.last_no) : '') + '</s></span>' +
              '<span class="r"><b>' + (x.orders || 0) + ' 单</b>' +
              '<s>' + (x.last_status_k === 'paid' ? '有在办' : esc(x.last_status || '')) +
              '</s></span><span class="ar">›</span></div>';
          }).join('') + '</div>'
        : '<div class="ym-empty"><i>☰</i>没有符合条件的客户</div>') + '</div>';

    m.innerHTML = pageH('有米小程序 · 客户档案',
      '与 CSP「客户档案」同一份数据与统计口径。手机端负责查询与联系，' +
      '建档、地址维护在 PC 端完成。') +
      ymPage('客户档案', body, '', '这一步在做什么',
        '按姓名、手机号或订单号检索本店客户。订单数与最近一单状态直接标在行上，' +
        '便于识别复购客户与在办订单，支持二次触达。',
        true, '', '', 'ym');
    $('[data-back]', m).onclick = function () { go('me'); };
    $('[data-cs]', m).onclick = function () { S.cache.ymCk = $('#ym-ck', m).value.trim(); reload(); };
    $('#ym-ck', m).onkeydown = function (e) {
      if (e.key === 'Enter') { S.cache.ymCk = e.target.value.trim(); reload(); }
    };
    /* 客户详情页目前只有 PC 端（csp:customer），手机上点行先给一句提示，
       不做半成品页——宁可少一页，也别点进去发现是空的。 */
    $$('[data-ck]', m).forEach(function (r) {
      r.onclick = function () { toast('客户详情请在 CSP 电脑端查看'); };
    });
    ymBind(m, 'me');
  });
};

/* ---------- 收款查询 / 退款查询（对应 csp:recv / csp:refund） ----------
   CSP 侧财务是只读的（唐美芳 2026-08-31：「csp 主要是查看作用」），
   手机端同样只读，审核与出账都在 UOM。 */
function ymFin(m, kind) {
  var isRecv = kind === 'recv';
  /* 状态文案与 CSP / 财务端同一套映射，别在手机上另起一套说法：
     收款走 audit_status（待审核/已审核/标记有误），退款走 status（申请→主管审批→出账）。
     之前这里读的是接口根本没返回的 status_text / audit_text，所以状态列一直是空的。 */
  var RECV_ST = { wait: ['待审核', 'wait'], pass: ['已审核', 'ok'], error: ['标记有误', 'bad'] };
  var RF_ST = { applying: ['待审核', 'wait'], l1: ['主管已审批', 'doing'],
                done: ['已出账', 'ok'], reject: ['已驳回', 'bad'] };
  return api(isRecv ? '/fin/receipts' : '/refund/list').then(function (j) {
    var list = j.list || [];
    var stOf = function (x) {
      return isRecv ? (RECV_ST[x.audit_status] || RECV_ST.wait)
                    : (RF_ST[x.status] || RF_ST.applying);
    };
    var sum = list.reduce(function (a, x) { return a + (x.amount || 0); }, 0);
    var doneAmt = list.reduce(function (a, x) {
      return a + (stOf(x)[1] === 'ok' ? (x.amount || 0) : 0);
    }, 0);
    var waiting = list.filter(function (x) { return stOf(x)[1] === 'wait'; }).length;

    var body =
      '<div class="ym-wrap">' +
      '<div class="ymh"><div class="hd"><div>' +
      '<s>' + (isRecv ? '本店订单收款合计' : '本店订单退款合计') + '</s>' +
      '<b>' + ymMoney(sum) + '</b></div></div>' +
      '<div class="st3"><div><b>' + list.length + '</b><s>单据笔数</s></div>' +
      '<div><b>' + ymMoney(doneAmt) + '</b><s>' + (isRecv ? '已审核' : '已出账') + '</s></div>' +
      '<div><b>' + waiting + '</b><s>待审核</s></div></div></div>' +
      (list.length
        ? '<div class="ym-card"><div class="ch">' + (isRecv ? '收款记录' : '退款记录') +
          '<em>' + list.length + ' 笔</em></div>' +
          list.slice(0, 50).map(function (x) {
            var st = stOf(x);
            return '<div class="ym-row" style="cursor:default">' +
              '<span class="m"><b>' + esc(x.no || x.ord_no || '') + '</b>' +
              '<s>' + esc(x.ord_no || '') + ' · ' + d10(x.created_at) +
              (isRecv ? '' : (x.names ? ' · ' + esc(x.names) : '')) + '</s></span>' +
              '<span class="r"><b>' + ymMoney(x.amount) + '</b>' +
              '<s><span class="ymb ' + st[1] + '">' + st[0] + '</span></s></span></div>';
          }).join('') + '</div>'
        : '<div class="ym-empty"><i>☰</i>暂无单据</div>') + '</div>';

    m.innerHTML = pageH('有米小程序 · ' + (isRecv ? '收款查询' : '退款查询'),
      '与 CSP 财务管理同一份数据，<b>只读</b>：门店可自行查询订单收款到账情况与退款审批出账进度，' +
      '审核、到账确认、生成凭证均由总部财务操作。') +
      ymPage(isRecv ? '收款查询' : '退款查询', body, '', '这一步在做什么',
        '门店仅有查看权限。发起退款在订单详情中操作，审批与出账由总部财务完成。',
        true, '', '', 'ym');
    $('[data-back]', m).onclick = function () { go('me'); };
    ymBind(m, 'me');
  });
}

VIEWS['youmi:recv'] = function (m) { return ymFin(m, 'recv'); };
VIEWS['youmi:refund'] = function (m) { return ymFin(m, 'refund'); };
