/* CSP 门店工作台：首页工作台 → 产品预订中心 → 订单管理 */

var TOOLS = [
  ['book', '材料清单速查', 'M7 3h10v18H7zM10 8h4M10 12h4'],
  ['orders', '办理进度查询', 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
  ['orders', '补料通知处理', 'M12 8v5M12 16h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'],
  ['orders', '退款申请', 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5'],
  ['book', '产品比价', 'M3 6h18M7 12h10M10 18h4'],
  ['home', '门店业绩看板', 'M4 20V10M10 20V4M16 20v-7M22 20H2']
];
var NOTICE = [
  ['2026-08-24', '美国签证北京领区面签号源紧张，建议开单时按 15 个工作日向客户告知时效'],
  ['2026-08-21', '日本单次旅游签材料清单已更新至新版，旧版在办订单不受影响'],
  ['2026-08-18', '新增日本、韩国电子签产品已上架，可在预订中心直接开单'],
  ['2026-08-15', '成交价低于结算价的订单系统直接拦截，特殊让利请走主管审批']
];


VIEWS['csp:home'] = function (m) {
  return Promise.all([api('/my/orders'), api('/my/supp')]).then(function (r) {
    var all = r[0].list;
    var todo = all.filter(function (o) { return o.todo; });
    var supp = r[1].list.filter(function (s) { return s.status === 'open'; });
    /* 「已付款」是订单状态，「办理中」是按办签人进度算出来的另一条线。
       这个格子原来拿 status==='paid' 当「办理中订单」，把两条线混了：
       一张刚付完款还没交材料的单，订单状态是已付款、办理状态是未开始。
       （唐美芳 2026-08-31：「你怎么还是把订单状态与签证办理状态混在一起了」） */
    var paid = all.filter(function (o) { return o.status === 'paid'; });
    /* 办签状态 2026-09-03 改三态，「办理中」并入「未完成」；
       工作台这格要的是「已付款但还没全部出结果」的单 */
    var doing = all.filter(function (o) {
      return o.status === 'paid' && o.work_status !== '已完成';
    });
    var gmv = all.reduce(function (a, b) { return a + b.amount; }, 0);
    m.innerHTML = pageH('首页工作台',
      'CSP 是门店销售与同业的 PC 端渠道工作台。工作台按「客户卡在哪一步」组织，' +
      '不是简单罗列订单；要新开单去<b>产品预订中心</b>，要跟进已有单去<b>订单管理</b>。') +
      '<div class="wsplit"><div>' +
      '<div class="grid" style="margin-bottom:12px">' +
      '<div class="stat' + (todo.length ? ' hot' : '') + '"><b>' + todo.length + '</b><span>需要我推动的订单</span></div>' +
      '<div class="stat' + (supp.length ? ' hot' : '') + '"><b>' + supp.length + '</b><span>客户待补料</span></div>' +
      '<div class="stat"><b>' + paid.length + '</b><span>已付款订单</span></div>' +
      '<div class="stat"><b>' + doing.length + '</b><span>办签办理中</span></div>' +
      '<div class="stat"><b>' + all.length + '</b><span>累计成交订单</span></div>' +
      '<div class="stat"><b>¥' + money(gmv) + '</b><span>累计成交金额</span></div></div>' +
      card('近 14 日开单趋势 <span>按下单日期聚合本门店订单</span>',
        trendBars(all, 14) +
        '<div class="chart-ft"><span><b>' + all.length + '</b>累计订单</span>' +
        '<span><b>¥' + money(gmv) + '</b>累计成交</span>' +
        '<span><b>¥' + money(all.length ? Math.round(gmv / all.length) : 0) + '</b>客单价</span></div>') +
      card('快捷操作', '<div class="pad"><div class="btns">' +
        '<button class="btn r" data-g="book">去产品预订中心开新单</button>' +
        '<button class="btn" data-g="orders">查看全部订单</button>' +
        '</div><div class="hint" style="margin-top:8px">' +
        '产品预订中心里签证只是其中一个品类。供应商上品时默认上架 B 端（也就是这里），' +
        '勾了「上架 C 端」的才会同时出现在客户小程序。</div></div>') +
      card('需要我推动的订单', '<div class="pad">' + table(['订单号', '产品', '人数', '金额', '状态', '待办', '操作'],
        todo, function (o) {
          return '<td class="mono">' + esc(o.no) + '</td><td>' + esc(o.product) + '</td><td class="num">' + o.pax +
            '</td><td class="num">¥' + money(o.amount) + '</td><td><span class="tag ' + (ORD_TAG[o.status] || 'plain') +
            '">' + esc(o.status_text) + '</span></td><td><b style="color:#B54708">' + esc(o.todo) + '</b></td>' +
            '<td><button class="btn sm" data-o="' + esc(o.no) + '" data-a="' + o.applicants[0].id + '">去处理</button></td>';
        }, '当前无停滞订单') + '</div>') +
      card('客户待补料 <span>7 天倒计时，逾期需走挂起或退款</span>', '<div class="pad">' +
        table(['补料单', '订单', '客户', '轮次', '剩余', '原因'], supp, function (s) {
          return '<td class="mono">' + esc(s.no) + '</td><td class="mono">' + esc(s.ord_no) + '</td><td>' +
            esc(s.name) + '</td><td>第 ' + s.round + ' 次</td><td><span class="tag ' +
            (s.days_left < 3 ? 'bad' : 'warn') + '">' + s.days_left + ' 天</span></td><td>' + esc(s.reason || '') + '</td>';
        }, '无待补料') + '</div>') +
      '</div><aside>' +
      card('常用工具', '<div class="tgrid">' + TOOLS.map(function (t) {
        return '<a data-tool="' + t[0] + '"><i>' + svg(t[2]) + '</i>' + esc(t[1]) + '</a>';
      }).join('') + '</div>') +
      card('运营公告', '<div class="ntc">' + NOTICE.map(function (n) {
        return '<div><s>' + n[0] + '</s><p>' + esc(n[1]) + '</p></div>';
      }).join('') + '</div>') +
      '</aside></div>';
    $$('[data-o]', m).forEach(function (b) {
      b.onclick = function () { go('mats', b.dataset.a); };
    });
    $$('[data-g]', m).forEach(function (b) {
      /* 预订中心是独立门户，从工作台快捷入口进也要新开标签页，跟左菜单一致 */
      b.onclick = function () { if (b.dataset.g === 'book') openBook(); else go(b.dataset.g); };
    });
    $$('[data-tool]', m).forEach(function (a) { a.onclick = function () { go(a.dataset.tool); }; });
  });
};

/* ================= 门店订购门户（产品预订中心） =================
   这不是后台的一个页面，是门店销售自己的订购网站：点左菜单「产品预订中心」
   会新开一个浏览器标签页，脱掉后台顶栏与左菜单（body.imm2），版心居中定宽，
   照众信现有 uzai.com 预订中心复刻——顶部搜索、左侧金刚区 + 右侧 Banner、
   热门推荐、身边人都在卖；签证作为新板块进金刚区，点进去是签证频道页。

   三层逛法（全挂在 book 视图下用 param 分流，浏览器前进后退可逐层回退）：
     门户首页 '' → 签证频道 'visa' → 目的地列表 'c-国家' / 搜索 'q-词'
       → 产品详情 csp:pdetail → 代客下单 csp:create
   卡片上的价格、时效、毛利、上架时间全部来自 /shop/products 的真实数据，
   金刚区里除签证外的品类由各自业务系统承接，点击给出说明而不是假页面。 */

/* 金刚区：现有首页最多只能配 10 格（唐美芳 2026-08-27），所以签证不是新增第十一格，
   而是顶掉其中一格。顶掉的是「外采单项」——它是十格里唯一的采购侧入口，
   面向的是采购而不是门店销售，本来就跟这个「销售拿去卖」的门户不同路；
   其余九格都是可直接对客销售的产品线，动谁都会少一条卖货入口。 */
var CATE = [
  ['all', '全部旅游', '由产品中心系统承接', 0, '#F2637B', '#E8506A'],
  ['made', '众信制造', '由产品中心系统承接', 0, '#F5883C', '#EE7526'],
  ['unid', '优耐德', '由优耐德品牌系统承接', 0, '#4FC0A8', '#38B096'],
  ['zhuyuan', '竹园', '由竹园品牌系统承接', 0, '#F5A83C', '#EE9724'],
  ['tail', '尾单预订', '由尾单清仓系统承接', 0, '#7FC3E8', '#5FB0DE'],
  ['visa', '签证', '本系统承接', 1, '#0F9488', '#0B7A70'],
  ['theme', '主题旅游', '由产品中心系统承接', 0, '#4A90D9', '#3179C6'],
  ['group', '单团定制', '由单团定制系统承接', 0, '#9B8CD8', '#8474CC'],
  ['ai', 'AI 定制', '由 AI 定制系统承接', 0, '#6B7FD7', '#5468C8'],
  ['best', '优定制', '由优定制系统承接', 0, '#F2C94C', '#E8B92E']
];

/* 平台产品 × 供应商产品打平成一行一个可下单对象，各层页面共用 */
/* CSP 展示用的办理流程 —— 与 C 端同一份口径。
   流程改成后台可配（/pub/home 下发 default_flow）之后，全局 FLOW 被换成了
   CCFG_FLOW / FLOW_FALLBACK（见 v-cust.js），但 CSP 这两处引用没跟着改，
   于是签证频道整页崩在「加载失败：FLOW is not defined」（唐美芳 2026-09-02 报）。
   这里统一转成 CSP 需要的 [标题, 说明] 二元组。 */
function cspFlow() {
  var fl = (typeof CCFG_FLOW !== 'undefined' && CCFG_FLOW && CCFG_FLOW.length)
    ? CCFG_FLOW : FLOW_FALLBACK;
  return fl.map(function (x, i) {
    return ['第' + (i + 1) + '步', x.t + (x.d ? '\n' + x.d : '')];
  });
}

function bkRows(j) {
  var out = [];
  j.list.forEach(function (p) {
    p.suppliers.forEach(function (s) { out.push({ p: p, s: s }); });
  });
  return out;
}
/* 每个国家的最低零售价，由在售套餐实时汇总 */
function bkByC(rows) {
  var by = {};
  rows.forEach(function (x) {
    if (by[x.p.country] === undefined || by[x.p.country] > x.s.price_min) {
      by[x.p.country] = x.s.price_min;
    }
  });
  return by;
}

/* ---------- 门户外壳：顶部导航 + 定宽版心 + 页脚 ---------- */
/* wide：这一页右边挂了独立板块（列表页的签证政策、详情页的结算模块）。
   整幅版心从 1200 加宽到 1506，右栏是往外挂的，中间面板照旧 1200 不变窄。 */
function uzPage(nav, body, wide) {
  return '<div class="uz' + (wide ? ' wide' : '') + '">' +
    '<header class="uz-top"><div class="uz-in">' +
    '<a class="uz-logo" data-bc=""><b>uzai</b><s>.com</s><em>众信旅游</em></a>' +
    '<div class="uz-nav">' + nav.map(function (n) {
      return '<a' + (n[1] === null ? ' class="on"' : ' data-bc="' + esc(n[1]) + '"') + '>' +
        esc(n[0]) + '</a>';
    }).join('') + '</div>' +
    '<div class="uz-sch"><input placeholder="输入目的地、产品名称、供应商、关键词" value="' +
    esc(S.cache.vcKw || '') + '" data-kw><button data-kgo>搜索</button></div>' +
    /* 「零售价 / 结算价」开关（唐美芳 2026-09-07：有米有，CSP 也要有）。
       紧贴搜索框右侧，各层级都能切；默认客人模式。
       ⚠️ 2026-09-09 修：原来写的是 pmToggle('uz')，生成的 class="pm-tg uz" 撞上了
       本页根容器的 .uz{min-height:100vh;flex-direction:column} —— 开关被撑成
       62×1200 的透明竖条，DOM 里在、肉眼看不见，所以她一直说「CSP 怎么没有这个按钮」。
       修饰类改用 pm- 前缀，不再复用页面级的裸类名。 */
    pmIcon('pm-uzt') +
    '<div class="uz-me"><i>' + esc(((S.user && S.user.name) || '销')[0]) + '</i>' +
    '<span><b>' + esc((S.user && S.user.name) || '') + '</b>' +
    '<s>' + esc((S.user && S.user.org) || '') + '</s></span>' +
    '<a class="uz-back" data-home>返回工作台</a></div>' +
    '</div></header>' +
    '<div class="uz-body">' + body + '</div>' +
    '<footer class="uz-ft"><div class="uz-in2">' +
    '<div class="l"><b>众信旅游 · 门店订购平台</b>' +
    '<s>签证板块由众信签证业务系统承接：供应商上架 → 总部采购审核 → 门店可订，' +
    '价格、时效与上架时间均为系统实时数据</s></div>' +
    '<div class="r"><span>成交价低于系统下限直接拦截</span>' +
    '<span>提交、缴费、抢号、递交、采指纹由持证专员在使领馆官方渠道人工办理</span></div>' +
    '</div></footer></div>';
}

/* 各层共用的绑定 */
function bkBind(m) {
  pmBind(m, reload);   /* 通栏上的「零售价 / 结算价」开关 */
  $$('[data-bc]', m).forEach(function (a) {
    a.onclick = function () { go('book', a.dataset.bc); };
  });
  var home = $('[data-home]', m);
  if (home) home.onclick = function () {
    /* 门户是新标签页开的，关掉即可；直接输网址进来的关不掉，退回工作台 */
    window.close();
    setTimeout(function () { go('home'); }, 60);
  };
  var kw = $('[data-kw]', m), kgo = $('[data-kgo]', m);
  if (kw) {
    var doSearch = function () {
      var v = kw.value.trim();
      S.cache.vcKw = v;
      go('book', v ? 'q-' + v : 'visa');
    };
    kw.onkeydown = function (e) { if (e.key === 'Enter') doSearch(); };
    if (kgo) kgo.onclick = doSearch;
  }
  $$('[data-cate]', m).forEach(function (a) {
    a.onclick = function () {
      var c = CATE.filter(function (x) { return x[0] === a.dataset.cate; })[0];
      if (c[3]) go('book', 'visa');
      else toast('「' + c[1] + '」' + c[2] + '，本次签证系统只承接签证品类的下单与履约，门户为其保留入口', true);
    };
  });
  /* 只认目的地卡片自己，别再把页面上其它带 data-c 的元素也绑成「跳国家列表」 */
  $$('a[data-c]', m).forEach(function (a) {
    a.onclick = function () { S.cache.vcKw = ''; go('book', 'c-' + a.dataset.c); };
  });
  $$('[data-sp]', m).forEach(function (b) {
    b.onclick = function (e) { e.stopPropagation(); go('create', b.dataset.sp); };
  });
  $$('[data-pd]', m).forEach(function (c) {
    c.onclick = function (e) { e.stopPropagation(); go('pdetail', c.dataset.pd); };
  });
  $$('[data-tool]', m).forEach(function (a) { a.onclick = function () { go(a.dataset.tool); }; });
}

VIEWS['csp:book'] = function (m, param) {
  if (param && param.indexOf('c-') === 0) return bkList(m, { country: param.slice(2) });
  if (param && param.indexOf('q-') === 0) return bkList(m, { kw: param.slice(2) });
  if (param === 'visa') return bkVisa(m);
  return bkHome(m);
};

/* ---------- 第一层：门户首页（复刻现有预订中心） ---------- */
function bkHome(m) {
  return Promise.all([api('/shop/products'), api('/my/orders')]).then(function (r) {
    var rows = bkRows(r[0]), ords = r[1].list;
    var byC = bkByC(rows), cs = Object.keys(byC);
    var fastest = rows.length ? Math.min.apply(null, rows.map(function (x) { return x.s.lead_min; })) : 0;

    /* 三个榜单的口径各不相同，都标在副标题上。没有跨门店销量数据就不编「全国热销榜」：
       销量担当用本门店真实成交单数，利润拔尖用套餐的最大毛利（建议零售价 − 结算价），
       新品抢先用供应商产品的上架时间。 */
    var cnt = {};
    ords.forEach(function (o) { cnt[o.product] = (cnt[o.product] || 0) + 1; });
    var sold = rows.map(function (x) { return { x: x, n: cnt[x.s.name] || 0 }; })
      .filter(function (a) { return a.n > 0; })
      .sort(function (a, b) { return b.n - a.n; });
    /* 客人模式下这一榜仍按毛利排（销售靠它选品），但标签不写出毛利金额，
       改成中性的「主推」——榜单本身不泄露数字（2026-09-07） */
    var prof = rows.filter(function (x) { return x.s.margin; })
      .sort(function (a, b) { return b.s.margin - a.s.margin; })
      .map(function (x) {
        return { x: x, tag: pmSales() ? '毛利最高 ¥' + money(x.s.margin) : '门店主推' };
      });
    var fresh = rows.slice(0).sort(function (a, b) {
      return String(b.s.listed_at || '').localeCompare(String(a.s.listed_at || ''));
    }).map(function (x) {
      return { x: x, tag: '上架 ' + String(x.s.listed_at || '').slice(0, 10) };
    });

    function rank(list, empty) {
      if (!list.length) return '<div class="uz-rkempty">' + esc(empty) + '</div>';
      return list.slice(0, 3).map(function (it, i) {
        var x = it.x;
        return '<a class="uz-rk" data-pd="' + x.s.sup_product_id + '">' +
          '<i class="no n' + (i + 1) + '">' + (i + 1) + '</i>' +
          '<span class="th" style="background-image:url(' + dimg(x.p.country) + ')"></span>' +
          '<span class="tx"><em>' + esc(x.s.supplier) + '</em>' +
          '<b>' + esc(x.p.country) + esc(x.p.visa_type) + '</b>' +
          '<s>' + esc(x.p.submit_city) + '送签 · ' + esc(it.tag) + '</s></span>' +
          '<span class="pr">¥' + money(x.s.price_min) + '<u>起</u></span></a>';
      }).join('');
    }
    var boards = [
      ['销量担当', '本店成交单数', 'a', rank(sold.map(function (a) {
        return { x: a.x, tag: '本店成交 ' + a.n + ' 单' };
      }), '本门店暂无签证成交记录，成交后自动上榜')],
      ['利润拔尖', pmSales() ? '套餐毛利（建议零售价 − 结算价）' : '门店主推',
        'b', rank(prof, '暂无可售套餐')],
      ['新品抢先', '按上架时间倒序', 'c', rank(fresh, '暂无在售产品')]
    ];

    /* 热门推荐：按该国最低价升序，一国一张，价格直出 */
    var recC = cs.slice(0).sort(function (a, b) { return byC[a] - byC[b]; }).slice(0, 5);
    var recCard = recC.map(function (cn) {
      var inC = rows.filter(function (x) { return x.p.country === cn; })
        .sort(function (a, b) { return a.s.price_min - b.s.price_min; });
      var x = inC[0];
      return '<a class="uz-rc" data-c="' + esc(cn) + '">' +
        '<div class="im" style="background-image:url(' + dimg(cn) + ')">' +
        '<span class="k">签证</span><span class="ct">' + esc(x.p.submit_city) + '送签</span></div>' +
        '<div class="bd"><div class="bn"><em>' + esc(x.s.supplier) + '</em>' +
        '<b>' + esc(cn) + ' · ' + esc(x.p.visa_type) + '</b></div>' +
        '<s>停留 ' + stayTx(x.p) + ' · ' + x.s.lead_min + ' 个工作日出签 · ' +
        (x.p.need_interview ? '需面签' : '免面签') + '</s>' +
        '<div class="pr"><b>¥' + money(byC[cn]) + '</b><u>起</u>' +
        '<i>' + inC.length + ' 款可选</i></div></div></a>';
    }).join('');

    m.innerHTML = uzPage([['首页', null], ['签证', 'visa']],
      '<div class="uz-r1">' +
      '<div class="uz-king">' + CATE.map(function (x) {
        return '<a data-cate="' + x[0] + '"' + (x[3] ? ' class="hot"' : '') +
          ' style="--c1:' + x[4] + ';--c2:' + x[5] + '">' + esc(x[1]) +
          (x[3] ? '<em>NEW</em>' : '') + '</a>';
      }).join('') + '</div>' +
      '<a class="uz-ban" data-cate="visa" style="background-image:url(img/dest/hero.jpg)">' +
      '<div class="tx"><s>ZHONGXIN VISA CENTER</s><h2>签证板块 · 已上线</h2>' +
      '<p>覆盖 ' + cs.length + ' 个国家 / 地区 · ' + rows.length + ' 款产品在售 · 最快 ' +
      fastest + ' 个工作日出签</p><em>进入签证频道 ›</em></div></a>' +
      '</div>' +

      '<section class="uz-sec"><div class="uz-h"><i class="fire"></i><h3>热门推荐</h3>' +
      '<s>按各目的地最低零售价升序，价格由在售套餐实时汇总</s>' +
      '<a class="more" data-bc="visa">全部签证产品 ›</a></div>' +
      '<div class="uz-recs">' + (recCard || '<div class="uz-rkempty">暂无在售产品</div>') + '</div></section>' +

      '<section class="uz-sec"><div class="uz-h"><i class="fire"></i><h3>身边人都在卖</h3>' +
      '<s>三个榜单口径不同，标在各自副标题上；没有跨门店销量数据，不做无法核验的全国热销榜</s></div>' +
      '<div class="uz-boards">' + boards.map(function (b) {
        return '<div class="uz-bd ' + b[2] + '"><div class="hd"><b>' + b[0] + '</b><s>' + b[1] +
          '</s></div><div class="bd">' + b[3] + '</div></div>';
      }).join('') + '</div></section>');
    bkBind(m);
  });
}

/* ---------- 第二层：签证频道页（携程式 PC 密度） ---------- */
function bkVisa(m) {
  /* 政策跟产品一起取：销售在频道页最先要回答客人的往往不是「多少钱」，
     而是「这个国家现在还要不要签、免签几天、要不要本人去」。 */
  /* 顺带把 /pub/home 的国家配置拉下来 —— 办理流程要与 C 端小程序同一份口径，
     运营在 UOM「国家展示配置」里改一次，两边一起变。 */
  return Promise.all([api('/shop/products'), api('/shop/policies'), ensureCcfg()]).then(function (rr) {
    var j = rr[0], pols = rr[1].list;
    var rows = bkRows(j), byC = bkByC(rows), cs = Object.keys(byC);
    var fastest = rows.length ? Math.min.apply(null, rows.map(function (x) { return x.s.lead_min; })) : 0;
    var ct = S.cache.vcCt === undefined ? 0 : S.cache.vcCt;

    function destGrid(i) {
      var list = CONT[i][1];
      var on = list.filter(function (c) { return byC[c] !== undefined; });
      var off = list.filter(function (c) { return byC[c] === undefined; });
      return on.concat(off).map(function (cn) {
        var ok = byC[cn] !== undefined;
        return '<a class="uz-dc' + (ok ? '' : ' off') + '"' + (ok ? ' data-c="' + esc(cn) + '"' : '') +
          ' style="background-image:url(' + dimg(cn) + ')"><span class="tx">' +
          '<b>' + esc(cn) + '</b>' +
          (ok ? '<s>¥' + money(byC[cn]) + ' 起</s>' : '<s class="off">覆盖中</s>') +
          '</span></a>';
      }).join('');
    }

    var feat = rows.slice(0).sort(function (a, b) { return a.s.price_min - b.s.price_min; })
      .slice(0, 8).map(uzCard).join('');

    /* 政策按类型分页签。页签只列真的有内容的类型，空标签点进去看到一片空白最伤信任。 */
    var pk = S.cache.vcPk || '';
    var pkTabs = [['', '全部']].concat(['free', 'landing', 'evisa', 'change', 'notice']
      .filter(function (k) { return pols.some(function (p) { return p.kind === k; }); })
      .map(function (k) { return [k, polKind(k)[1]]; }));
    if (!pkTabs.some(function (t) { return t[0] === pk; })) pk = S.cache.vcPk = '';
    /* 1 条主推 + 右侧两列各 4 条，正好摆满不留空行 */
    var polShown = pols.filter(function (p) { return !pk || p.kind === pk; }).slice(0, 9);

    m.innerHTML = uzPage([['首页', ''], ['签证', null]],
      '<div class="uz-crumb"><a data-bc="">首页</a><i>›</i><b>签证</b></div>' +
      '<div class="uz-hero" style="background-image:url(img/dest/uk2.jpg)">' +
      '<div class="tx"><s>ZHONGXIN VISA</s><h2>去哪儿，就办哪儿的签证</h2>' +
      '<p>覆盖 ' + cs.length + ' 个国家 / 地区 · ' + rows.length + ' 款产品在售 · 最快 ' +
      fastest + ' 个工作日出签 · 全程节点可查</p></div>' +
      '<div class="kpi">' + [['材料预审', '按人群逐项裁剪'], ['进度透明', '五个节点有时间戳'],
        ['拒签退款', '按办理进度退未发生费用'], ['专人对接', '一单一位签证专员']].map(function (w) {
        return '<div><b>' + w[0] + '</b><s>' + w[1] + '</s></div>';
      }).join('') + '</div></div>' +

      '<section class="uz-sec"><div class="uz-h"><h3>按目的地找签证</h3>' +
      '<s>灰色为覆盖计划中，暂无在售产品</s></div>' +
      '<div class="uz-cts">' + CONT.map(function (c, i) {
        return '<a data-ct="' + i + '"' + (i === ct ? ' class="on"' : '') + '>' + esc(c[0]) + '</a>';
      }).join('') + '</div>' +
      '<div class="uz-dgrid">' + destGrid(ct) + '</div></section>' +

      '<section class="uz-sec"><div class="uz-h"><h3>低价优选</h3>' +
      '<s>全部在售产品按零售参考价升序</s></div>' +
      '<div class="uz-grid">' + feat + '</div></section>' +

      /* 政策在频道页自成一区（唐美芳 2026-08-27 二次纠正）：右栏是给目的地列表页的，
         频道页上政策不该挤在产品旁边抢位置，按门户「新闻中心」的做法独立成块。 */
      '<section class="uz-sec"><div class="uz-h"><i class="fire"></i><h3>签证政策速递</h3>' +
      '<s>总部运营统一维护，与客户端小程序同一份口径；每条标注来源，销售可直接向客户转述</s>' +
      '<div class="uz-cts sm">' + pkTabs.map(function (t) {
        return '<a data-pk="' + t[0] + '"' + (t[0] === pk ? ' class="on"' : '') + '>' + esc(t[1]) +
          '<em>' + pols.filter(function (p) { return !t[0] || p.kind === t[0]; }).length + '</em></a>';
      }).join('') + '</div></div>' +
      '<div class="uz-npad">' + polNews(polShown) + '</div></section>' +

      '<section class="uz-sec"><div class="uz-h"><h3>办理流程</h3>' +
      '<s>每一步在系统内都有对应动作与时间戳</s></div>' +
      '<div class="uz-flow">' + cspFlow().map(function (f, i) {
        return '<div><i>' + (i + 1) + '</i><s>' + esc(f[1]).replace(/\n/g, '<br>') + '</s></div>';
      }).join('') + '</div></section>');
    bkBind(m);
    polBind(m, polShown);
    $$('[data-pk]', m).forEach(function (a) {
      a.onclick = function () { S.cache.vcPk = a.dataset.pk; reload(); };
    });
    $$('[data-ct]', m).forEach(function (a) {
      a.onclick = function () {
        S.cache.vcCt = +a.dataset.ct;
        $$('[data-ct]', m).forEach(function (x) { x.classList.remove('on'); });
        a.classList.add('on');
        $('.uz-dgrid', m).innerHTML = destGrid(+a.dataset.ct);
        bkBind(m);
      };
    });
  });
}

/* 产品卡：频道页与列表页共用一套 */
function uzCard(x) {
  var ent = { single: '单次', double: '两次', multi: '多次' }[x.p.entries] || x.p.entries;
  return '<div class="uz-pc" data-pd="' + x.s.sup_product_id + '">' +
    '<div class="im" style="background-image:url(' + dimg(x.p.country) + ')">' +
    '<span class="fg">' + flag(x.p.country) + ' ' + esc(x.p.country) + '</span>' +
    '<span class="en' + (x.p.entries === 'multi' ? ' hot' : '') + '">' + esc(ent) + '入境</span></div>' +
    '<div class="bd"><div class="bn"><em>' + esc(x.s.supplier) + '</em>' +
    '<b>' + esc(x.s.name) + '</b></div>' +
    '<div class="tg">' +
    '<span>停留 ' + stayTx(x.p) + '</span><span>' + esc(x.p.valid) + '有效</span>' +
    '<span>' + x.s.lead_min + ' 工作日</span>' +
    (x.p.need_interview ? '<span class="w">需面签</span>' : '<span class="o">免面签</span>') +
    (x.p.need_fingerprint ? '<span class="w">录指纹</span>' : '') +
    '</div>' +
    '<div class="ft"><div class="pr"><i>零售参考</i><b>¥' + money(x.s.price_min) + '</b><u>起</u>' +
    (pmSales() && x.s.margin ? '<em>毛利最高 ¥' + money(x.s.margin) + '</em>' : '') + '</div>' +
    '<div class="ac"><button class="uz-b1" data-pd="' + x.s.sup_product_id + '">查看详情</button>' +
    '<button class="uz-b2" data-sp="' + x.s.sup_product_id + '">代客下单</button></div></div>' +
    '</div></div>';
}

/* ---------- 第三层：目的地列表 / 搜索结果 ----------
   携程式单排大行 + 顶部横向多组筛选（唐美芳 2026-08-27：列表最好是单排形式，筛选条件要比较多）。
   左侧竖筛选改到顶部横排，是因为单排行本身要占满宽度——一行里要并排放
   「目的地图 / 产品属性 / 时效与价格与毛利」三栏，再留 210px 给左栏就挤不下了。
   每个筛选项后面的数字是「其他条件已生效的前提下还剩多少款」，不是全量计数：
   销售连点几个条件后最怕点到 0 条，带上剩余数就不会点空。 */

/* 时效与价格是连续值，直接按值列标签会列出几十个，所以分档。档位口径写死在这里，
   两处（选项与命中判断）共用同一个函数，避免改了一处漏了另一处。 */
var LEADB = [['a', '5 个工作日内'], ['b', '6-10 个工作日'], ['c', '11 个工作日以上']];
function leadB(n) { return n <= 5 ? 'a' : n <= 10 ? 'b' : 'c'; }
var PRICEB = [['a', '¥1000 以下'], ['b', '¥1000-2000'], ['c', '¥2000-3000'], ['d', '¥3000 以上']];
function priceB(n) { return n < 1000 ? 'a' : n < 2000 ? 'b' : n < 3000 ? 'c' : 'd'; }

/* 每组筛选：k 存值用的键，t 组名，of 从一行里取出它属于哪些值（可多值，特色服务就是多值），
   fix 表示这组是固定档位而非从数据里枚举出来的。 */
var VGRP = [
  { k: 'city', t: '送签地', of: function (x) { return [x.p.submit_city]; } },
  { k: 'type', t: '签证类型', of: function (x) { return [x.p.visa_type]; } },
  { k: 'ent', t: '入境次数', of: function (x) { return [ENTRIES[x.p.entries] || x.p.entries]; } },
  { k: 'lead', t: '出签时效', fix: LEADB, of: function (x) { return [leadB(x.s.lead_min)]; } },
  { k: 'price', t: '价格区间', fix: PRICEB, of: function (x) { return [priceB(x.s.price_min)]; } },
  {
    k: 'feat', t: '办理特点', of: function (x) {
      var o = [x.p.need_interview ? '需面签' : '免面签',
      x.p.need_fingerprint ? '需录指纹' : '免录指纹'];
      return o;
    }
  },
  { k: 'svc', t: '特色服务', of: function (x) { return x.s.svc || []; } },
  { k: 'sup', t: '供应商', of: function (x) { return [x.s.supplier]; } }
];

var VSORT_ALL = [
  ['reco', '综合排序'], ['price', '价格低→高'], ['price2', '价格高→低'],
  ['lead', '出签最快'], ['margin', '毛利最高'], ['new', '最新上架']
];
/* 客人模式下「毛利最高」这一项本身就泄露口径，整项不出现（2026-09-07） */
function vsortOpts() {
  return pmSales() ? VSORT_ALL
    : VSORT_ALL.filter(function (x) { return x[0] !== 'margin'; });
}

/* 单排大行：左图、中产品属性、右时效价格毛利与下单按钮。
   携程那一行右侧放的是评分、出游人数、点评数；我们没有这些真实数据，不编，
   换成门店销售真正拿来决策的三个数：出签时效、零售参考价、单人毛利上限。 */
function uzRow(x) {
  var ent = ENTRIES[x.p.entries] || x.p.entries;
  var svc = (x.s.svc || []).slice(0, 3);
  return '<div class="uz-row" data-pd="' + x.s.sup_product_id + '">' +
    '<div class="im" style="background-image:url(' + dimg(x.p.country) + ')">' +
    '<span class="fg">' + flag(x.p.country) + ' ' + esc(x.p.country) + '</span>' +
    '<span class="cd">' + esc(x.p.visa_type) + '</span></div>' +
    '<div class="mn">' +
    '<div class="tt"><em>' + esc(x.s.supplier) + '</em>' +
    '<b>' + esc(x.s.name) + '</b></div>' +
    '<div class="tg">' +
    '<span class="k">' + esc(ent) + '</span>' +
    '<span>停留 ' + stayTx(x.p) + '</span>' +
    '<span>' + esc(x.p.valid) + '有效</span>' +
    (x.p.need_interview ? '<span class="w">需面签</span>' : '<span class="o">免面签</span>') +
    (x.p.need_fingerprint ? '<span class="w">需录指纹</span>' : '<span class="o">免录指纹</span>') +
    svc.map(function (s) { return '<span class="s">' + esc(s) + '</span>'; }).join('') +
    '</div>' +
    (x.s.feature ? '<div class="ft">' + esc(x.s.feature) + '</div>' : '') +
    '<div class="mt"><span>送签地 <b>' + esc(x.p.submit_city) + '</b></span>' +
    '<span>套餐 <b>' + x.s.pkg_count + ' 个</b></span>' +
    (x.s.listed_at ? '<span>上架 <b>' + d10(x.s.listed_at) + '</b></span>' : '') +
    /* 这一格是单行摘要，富文本要先转纯文本，否则 title 里会露出标签 */
    (x.p.accept_note ? '<span class="ac" title="' + esc(richText(x.p.accept_note)) + '">受理范围 <b>' +
      esc(richText(x.p.accept_note)) + '</b></span>' : '') +
    '</div></div>' +
    '<div class="rt">' +
    '<div class="ld"><b>' + x.s.lead_min + '</b><s>个工作日出签</s></div>' +
    '<div class="pr"><i>零售参考</i><b>¥' + money(x.s.price_min) + '</b><u>起</u></div>' +
    (pmSales() && x.s.margin ? '<div class="gp">单人毛利最高 <b>¥' +
      money(x.s.margin) + '</b></div>' : '') +
    '<div class="bt"><button class="uz-b2" data-sp="' + x.s.sup_product_id + '">代客下单</button>' +
    '<button class="uz-b1" data-pd="' + x.s.sup_product_id + '">查看详情</button></div>' +
    '</div></div>';
}

function bkList(m, q) {
  var qs = q.country ? '?country=' + encodeURIComponent(q.country) : '';
  /* 搜索结果页跨国家，堆一屏各国政策没用；只有具体目的地页才带政策，
     因为销售站在国家页时最需要先回答「这个国家现在什么规矩」。 */
  return Promise.all([api('/shop/products' + qs),
  q.country ? api('/shop/policies' + qs) : Promise.resolve({ list: [] })]).then(function (rr) {
    var j = rr[0], pols = rr[1].list;
    var rows = bkRows(j);
    if (q.kw) {
      var k = q.kw.toLowerCase();
      rows = rows.filter(function (x) {
        return (x.s.name + x.p.country + x.p.visa_type + x.p.submit_city + x.s.supplier)
          .toLowerCase().indexOf(k) >= 0;
      });
    }
    /* 换了目的地或关键词就把筛选清掉：上一个国家的送签地在这个国家多半不存在，
       留着会看到「共 0 条」的空列表，还以为是没产品。 */
    var key = q.country ? 'c-' + q.country : 'q-' + q.kw;
    if (S.cache.vcKey !== key) { S.cache.vcKey = key; S.cache.vcF = null; }
    var f = S.cache.vcF ||
      (S.cache.vcF = { sel: {}, more: {}, sort: 'reco', page: 1 });

    function hit(x, skip) {
      return VGRP.every(function (g) {
        if (g.k === skip) return true;
        var sel = f.sel[g.k] || [];
        if (!sel.length) return true;
        var vs = g.of(x);
        return sel.some(function (v) { return vs.indexOf(v) >= 0; });
      });
    }

    /* 选项计数：把本组自己排除在外再统计，这样同组内多选时各项的数字才不会互相压成 0 */
    function opts(g) {
      var cnt = {};
      rows.forEach(function (x) {
        g.of(x).forEach(function (v) { if (cnt[v] === undefined) cnt[v] = 0; });
      });
      rows.filter(function (x) { return hit(x, g.k); }).forEach(function (x) {
        g.of(x).forEach(function (v) { cnt[v]++; });
      });
      var keys = Object.keys(cnt);
      if (g.fix) {
        var ord = g.fix.map(function (b) { return b[0]; });
        return keys.filter(function (v) { return ord.indexOf(v) >= 0; })
          .sort(function (a, b) { return ord.indexOf(a) - ord.indexOf(b); })
          .map(function (v) { return [v, g.fix[ord.indexOf(v)][1], cnt[v]]; });
      }
      keys.sort(function (a, b) { return cnt[b] - cnt[a] || (a < b ? -1 : 1); });
      return keys.map(function (v) { return [v, v, cnt[v]]; });
    }

    var LIM = 8;
    function grpRow(g) {
      var os = opts(g);
      if (!os.length) return '';
      var sel = f.sel[g.k] || [], more = f.more[g.k];
      var show = os.length > LIM && !more ? os.slice(0, LIM) : os;
      return '<div class="fr"><h6>' + esc(g.t) + '</h6><div class="op">' +
        '<a data-fg="' + g.k + '" data-fv=""' + (sel.length ? '' : ' class="on"') + '>不限</a>' +
        show.map(function (o) {
          var on = sel.indexOf(o[0]) >= 0;
          return '<a data-fg="' + g.k + '" data-fv="' + esc(o[0]) + '"' +
            (on ? ' class="on"' : (o[2] ? '' : ' class="z"')) + '>' + esc(o[1]) +
            '<em>' + o[2] + '</em></a>';
        }).join('') + '</div>' +
        (os.length > LIM ? '<a class="mr" data-fm="' + g.k + '">' +
          (more ? '收起 ▴' : '更多 ' + os.length + ' 项 ▾') + '</a>' : '') +
        '</div>';
    }

    /* 已选条件汇总：多组多选之后光看标签高亮很难数清楚选了什么，单拉一行可逐个摘掉 */
    var chips = [];
    VGRP.forEach(function (g) {
      (f.sel[g.k] || []).forEach(function (v) {
        var lab = v;
        if (g.fix) g.fix.forEach(function (b) { if (b[0] === v) lab = b[1]; });
        chips.push('<a data-fx="' + g.k + '" data-fv="' + esc(v) + '">' + esc(g.t) + '：' +
          esc(lab) + ' ×</a>');
      });
    });

    var shown = rows.filter(function (x) { return hit(x); });
    var SF = {
      reco: function (a, b) { return a.s.lead_min - b.s.lead_min || a.s.price_min - b.s.price_min; },
      price: function (a, b) { return a.s.price_min - b.s.price_min; },
      price2: function (a, b) { return b.s.price_min - a.s.price_min; },
      lead: function (a, b) { return a.s.lead_min - b.s.lead_min || a.s.price_min - b.s.price_min; },
      margin: function (a, b) { return (b.s.margin || 0) - (a.s.margin || 0); },
      new: function (a, b) { return (b.s.listed_at || '') < (a.s.listed_at || '') ? -1 : 1; }
    };
    /* 切回客人模式时「毛利最高」这个排序项已经不在了，落回综合排序，
       否则列表还按毛利排、界面上却没有对应的高亮项 */
    if (f.sort === 'margin' && !pmSales()) f.sort = 'reco';
    shown.sort(SF[f.sort] || SF.reco);

    var PER = 8, pages = Math.max(1, Math.ceil(shown.length / PER));
    if (f.page > pages) f.page = 1;
    var page = shown.slice((f.page - 1) * PER, f.page * PER);

    var title = q.country ? q.country + '签证' : '搜索「' + q.kw + '」';
    var head = '';
    if (q.country && rows.length) {
      var lo = Math.min.apply(null, rows.map(function (x) { return x.s.price_min; }));
      var fst = Math.min.apply(null, rows.map(function (x) { return x.s.lead_min; }));
      var cts = [];
      rows.forEach(function (x) {
        if (cts.indexOf(x.p.submit_city) < 0) cts.push(x.p.submit_city);
      });
      head = '<div class="uz-chero" style="background-image:url(' + dimg(q.country) + ')">' +
        '<div class="tx"><h2>' + flag(q.country) + ' ' + esc(q.country) + '签证</h2>' +
        '<p>' + rows.length + ' 款在售 · 最快 ' + fst + ' 个工作日出签 · ¥' + money(lo) +
        ' 起 · 覆盖 ' + cts.length + ' 个送签地</p></div></div>';
    }

    /* 政策原来是列表顶部一条通栏，把筛选和产品一起往下压了一屏。
       唐美芳 2026-08-27：「国家签证政策我觉得放右侧区域好一点」→ 挪到右栏 sticky；
       同日二次指正（截图画红框）：右栏要从 banner 那一行就起头，跟头图顶齐，
       不是等筛选面板走完才从产品列表旁边冒出来。所以分栏范围从 head 开始整包。 */
    var polHtml = q.country
      ? polRailPc(pols, esc(q.country) + '签证政策',
        '总部运营维护，与客户端小程序同一份口径')
      : '';

    var filt = '<div class="uz-fp">' + VGRP.map(grpRow).join('') +
      (chips.length ? '<div class="fs"><h6>已选条件</h6><div class="op">' + chips.join('') +
        '<a class="clr" data-fclr>清除全部</a></div></div>' : '') + '</div>';

    var bar = '<div class="uz-bar"><div class="st">' + vsortOpts().map(function (s2) {
      return '<a data-fs="' + s2[0] + '"' + (f.sort === s2[0] ? ' class="on"' : '') +
        '>' + s2[1] + '</a>';
    }).join('') + '</div><span class="cnt">共 <b>' + shown.length + '</b> 款可订产品' +
      (shown.length !== rows.length ? '（已筛选，全部 ' + rows.length + ' 款）' : '') +
      ' · 第 <b>' + f.page + '</b>/' + pages + ' 页</span></div>' +
      '<div class="uz-sh">综合排序 = 出签时效优先，同时效按零售参考价升序' +
      (pmSales() ? '；结算价与毛利由通栏搜索框右侧的「零售 / 结算」按钮控制，向客户展示前请切回「零售」' : '') + '。</div>';

    var body = page.length
      ? '<div class="uz-rows">' + page.map(uzRow).join('') + '</div>'
      : '<div class="uz-rkempty">' + (rows.length ? '当前筛选条件下没有可订产品，换个条件试试'
        : (q.country ? '该目的地暂无在售产品' : '没有匹配「' + esc(q.kw) + '」的产品')) + '</div>';

    var pg = pages > 1 ? '<div class="uz-pg">' +
      '<a data-pg="' + (f.page - 1) + '"' + (f.page === 1 ? ' class="off"' : '') + '>‹ 上一页</a>' +
      Array.apply(null, { length: pages }).map(function (_, i) {
        return '<a data-pg="' + (i + 1) + '"' + (f.page === i + 1 ? ' class="on"' : '') +
          '>' + (i + 1) + '</a>';
      }).join('') +
      '<a data-pg="' + (f.page + 1) + '"' + (f.page === pages ? ' class="off"' : '') +
      '>下一页 ›</a></div>' : '';

    m.innerHTML = uzPage([['首页', ''], ['签证', 'visa']],
      '<div class="uz-crumb"><a data-bc="">首页</a><i>›</i><a data-bc="visa">签证</a><i>›</i>' +
      '<b>' + esc(title) + '</b></div>' +
      (polHtml ? '<div class="uz-2c"><div class="uz-2m">' + head + filt + bar + body + pg + '</div>' +
        polHtml + '</div>' : head + filt + bar + body + pg), !!polHtml);
    bkBind(m);
    polBind(m, pols);

    function set(fn) { fn(); f.page = 1; reload(); }
    $$('[data-fg]', m).forEach(function (a) {
      a.onclick = function () {
        var k2 = a.dataset.fg, v = a.dataset.fv;
        set(function () {
          if (!v) { f.sel[k2] = []; return; }
          var arr = f.sel[k2] || (f.sel[k2] = []), i = arr.indexOf(v);
          if (i >= 0) arr.splice(i, 1); else arr.push(v);
        });
      };
    });
    $$('[data-fx]', m).forEach(function (a) {
      a.onclick = function () {
        set(function () {
          var arr = f.sel[a.dataset.fx] || [], i = arr.indexOf(a.dataset.fv);
          if (i >= 0) arr.splice(i, 1);
        });
      };
    });
    $$('[data-fm]', m).forEach(function (a) {
      a.onclick = function () { f.more[a.dataset.fm] = !f.more[a.dataset.fm]; reload(); };
    });
    $$('[data-fs]', m).forEach(function (a) {
      a.onclick = function () { set(function () { f.sort = a.dataset.fs; }); };
    });
    $$('[data-pg]', m).forEach(function (a) {
      a.onclick = function () {
        var n = +a.dataset.pg;
        if (n < 1 || n > pages || n === f.page) return;
        f.page = n; reload(); window.scrollTo(0, 0);
      };
    });
    var clr = $('[data-fclr]', m);
    if (clr) clr.onclick = function () { set(function () { f.sel = {}; }); };
  });
}


/* 签证产品详情（PC 门户第四层）
   —————————————————————————————————————————————————————————————
   唐美芳 2026-08-27：「产品详情页怎么你又跳回到后台了，应该就在当前页面打开跳转」
   「产品详情页我也觉得不怎么美观，稍微设计下，注意逻辑和排版」。
   两件事一起改：
   1）整页用 uzPage() 包在门户外壳里——之前用的是后台的 pageH()，所以点进来
      顶栏、面包屑、页脚全变了样，销售当着客人的面会以为跳错系统。
   2）版式对齐她给的众信跟团游详情页：上半屏「左大图 + 右信息区（品牌角标 / 长标题 /
      特色标签 / 灰底价格条）」，下半屏「左选择区 + 右信息卡 + 红色大按钮」，
      底部锚点页签分段展开长内容。跟团游选的是出发日期，签证选的是套餐，
      所以左边的日历换成套餐卡，右边信息卡里的「余位/截团/单房差」换成
      「结算价 / 毛利 / 出签时效」这些销售真正要看的数。
   排版逻辑：客人关心的（能不能办、要什么材料、多久出签、多少钱）走主轴，
   销售自己才看的（结算价、毛利、供应商比价）收在右栏和比价页签里，不混在一起讲。 */
VIEWS['csp:pdetail'] = function (m, spid) {
  if (!spid) return VIEWS['csp:book'](m);
  return Promise.all([api('/shop/product?id=' + spid), api('/shop/products'),
  api('/shop/policies')]).then(function (rr) {
    var d = rr[0], p = d.product, all = rr[1].list;
    var pols = rr[2].list.filter(function (x) {
      return x.country === p.country || x.country === '*';
    }).slice(0, 4);
    var crowd = S.cache.pdCrowd || 'job';
    var pkgId = (d.packages[0] || {}).id, pax = 1;
    /* 同一条平台产品下挂着的其他供应商产品，销售当场比价用 */
    var plat = all.filter(function (x) { return x.product_id === p.id; })[0] || { suppliers: [] };
    var sibs = plat.suppliers || [];
    var lo = Math.min.apply(null, d.packages.map(function (k) { return k.suggest_retail; }));
    var fast = Math.min.apply(null, d.packages.map(function (k) { return k.lead_days; }));

    function pk() {
      return d.packages.filter(function (x) { return x.id === pkgId; })[0] || d.packages[0];
    }

    /* ---- 分段内容：材料 ---- */
    function matsHtml() {
      var list = d.checklist[crowd] || [];
      function grp(nec, label) {
        var sub = list.filter(function (i) { return i.necessity === nec; });
        if (!sub.length) return '';
        return '<div class="pd-mg"><div class="pd-mgh">' + label + '<em>' + sub.length + ' 项</em></div>' +
          table(['材料', '原件/复印件', '提交方式', '份数', '要求', '样例'], sub, function (i) {
            return '<td><b>' + esc(i.mat_name) + '</b></td><td>' + esc(i.attr_text) + '</td><td>' +
              esc(i.way_text) + '</td><td class="num">' + i.copies + '</td><td class="wrap">' +
              esc(i.require_text || '—') + '</td><td>' +
              (i.sample ? sampleBtn(i, 'btn sm lite') : '<span class="hint">—</span>') + '</td>';
          }, '无') + '</div>';
      }
      return '<div class="pd-mact"><span>按适用人群裁剪，切换人群看对应清单</span>' +
        '<button class="btn sm" data-send>发送至客户（扫码 / 链接）</button></div>' +
        '<div class="pd-crowd">' + [['job', '在职人员'], ['free', '自由职业'],
      ['student', '在校学生'], ['retire', '退休人员'], ['child', '学龄前儿童']].map(function (c) {
        return '<a data-cw="' + c[0] + '"' + (c[0] === crowd ? ' class="on"' : '') + '>' + c[1] + '</a>';
      }).join('') + '</div>' +
        '<div class="note">材料清单取自运营端「国家送签材料库」当前生效版本 <b>' + esc(d.fullver.ver_no) +
        '</b>，按适用人群实时裁剪。<b>下单时按人群快照进订单</b>，材料后续改版不影响已下单客户。</div>' +
        grp('must', '必须材料') + grp('suggest', '建议材料');
    }

    /* 套餐说明（唐美芳 2026-08-27：「购买须知、套餐说明」缺）。
       pkg_desc 是供应商自己写的一句话，说清这个套餐比隔壁那个多给了什么。
       没写的时候不留空白，按签证费 / 服务费 / 时效现算一句——
       都是这个套餐上真实存在的字段，不编。 */
    function pkgDesc(x) {
      if (x.pkg_desc) return x.pkg_desc;
      /* 2026-09-07 起结算价由供应商单独录入，不再等于签证费 + 服务费，
         这句兜底文案改成按结算价说，免得门店按两项之和去核价。
         客人模式下这句不能出结算价，改说零售价。 */
      return (pmSales()
        ? '结算价 ¥' + money(x.settle_price) + '（其中签证费 ¥' + money(x.visa_fee) + '）'
        : '建议零售价 ¥' + money(x.suggest_retail)) +
        '，约 ' + x.lead_days + ' 个工作日出签，' +
        '拒签按办理进度退还未发生费用。';
    }

    /* 产品特色：原来只有标题下面一行小灰字（d.feature），她说「产品特色没有啊」——
       等于没有。携程那张是独立一块、逐条列。这里拆成两层：
       上面一行是供应商自己写的卖点（feature），下面是平台口径的服务保障（d.svc，
       由「免面签自动带出 → 供应商从预置清单勾选 → 平台固定三项」合成，
       供应商不能自由填，避免出现「保证出签」这种没法兑现的话）。 */
    /* 产品特色（唐美芳 2026-08-27）：原来那六格「最快出签 / 送签地 / 面签 / 指纹 /
       可选套餐」跟上面头部的标签行和四格摘要是同一批信息，一页写三遍，
       白占一屏。只留头部没有的两样：供应商申报的一句卖点、平台核定的服务保障标签。
       两样都没有就整条不出，不留空壳。 */
    function feHtml() {
      var svc = d.svc || [];
      if (!d.feature && !svc.length) return '';
      return '<section class="pdx-fe"><b>产品特色</b>' +
        (d.feature ? '<div class="lead">' + esc(d.feature) + '</div>' : '') +
        (svc.length ? '<div class="sv">' + svc.map(function (v) {
          return '<span>' + esc(v) + '</span>';
        }).join('') + '</div>' : '') + '</section>';
    }

    /* 「分享签证资料要求给客户」——版式照唐美芳 2026-09-01 给的截图：
       顶部一条产品摘要（国旗 + 名称 + 关键属性 + 材料项数），
       下面左右两栏：链接分享 / 二维码分享。
       二维码走服务端 /api/qr 现渲染 SVG（segno），矢量放大不糊，
       客人举着手机离屏幕远一点也扫得上。组件真的缺席时降级成只给链接，入口不会点空。 */
    function sendModal() {
      var url = location.origin + location.pathname.replace(/[^/]*$/, '') +
        '#customer/shop/p-' + d.sup_product_id;
      var k = pk() || {};
      var items = (d.items || []).length;
      var attrs = [
        ['入境次数', (typeof ENTRIES !== 'undefined' && ENTRIES[p.entries]) || p.entries || '—'],
        ['有效期', validTx(p)],
        ['停留时长', stayTx(p)],
        ['办理时效', (k.lead_days ? k.lead_days + ' 个工作日' : '以套餐为准')]
      ];
      var mo = modal('分享签证资料要求给客户',
        '<div class="pad">' +
        '<div class="sh-top"><i class="flag" style="background-image:url(' +
        esc(fimg(p.country)) + ')"></i>' +
        '<div class="m"><b>' + esc(d.name) + '</b>' +
        '<s>' + attrs.map(function (a) {
          return esc(a[0]) + ': ' + esc(a[1]);
        }).join('　|　') + (items ? '　|　共 ' + items + ' 项资料' : '') + '</s></div></div>' +

        '<div class="sh-two">' +
        '<div class="sh-col"><div class="sh-h">链接分享</div>' +
        '<div class="sh-body"><div class="sh-lk"><i>🔗</i>' +
        '<span id="sh-url">' + esc(url) + '</span></div>' +
        '<button class="btn p sm" data-cp>复制链接</button></div></div>' +
        '<div class="sh-col"><div class="sh-h">二维码分享</div>' +
        '<div class="sh-body qr"><div class="sh-qz">' +
        '<img src="' + API_BASE + '/qr?d=' + encodeURIComponent(url) + '" alt="二维码"></div>' +
        '<div class="sh-qr-op"><s>右键可复制图片</s>' +
        '<button class="btn p sm" data-dl>下载二维码</button></div></div></div>' +
        '</div>' +
        '<div class="hint" style="margin-top:14px">客户扫码或打开链接后进入客户端该产品页面，' +
        '可查看<b>按适用人群裁剪后的材料清单、办理流程与套餐价格</b>；' +
        '<b>结算价与毛利不在客户端展示</b>。' +
        '材料清单以客户下单当时的版本快照为准，清单后续改版不影响已下单客户。</div>' +
        '</div>', null, true);

      $('.sh-qz img', mo.mask).onerror = function () {
        $('.sh-qz', mo.mask).innerHTML =
          '<div class="sh-qf">二维码组件未就绪<s>请改用左侧链接分享</s></div>';
        var dl = $('[data-dl]', mo.mask);
        if (dl) dl.disabled = true;
      };
      $('[data-cp]', mo.mask).onclick = function () { doCopy(url); };
      $('[data-dl]', mo.mask).onclick = function () {
        var img = $('.sh-qz img', mo.mask);
        if (!img) return;
        /* SVG 直接下载即可，矢量图印在物料上也不糊 */
        var a = document.createElement('a');
        a.href = img.src;
        a.download = (d.name || '签证产品') + '_二维码.svg';
        a.click();
        toast('二维码已下载');
      };
    }

    /* ---- 分段内容：购买须知 ---- */
    function buyHtml() {
      var k = pk();
      return '<div class="note">「预订须知」是各套餐自己维护的，切换套餐这一段会跟着变；' +
        '下面的「通用条款」对所有签证订单一致，由平台维护。</div>' +
        '<div class="pdx-two">' +
        '<div class="pdx-blk"><h5>预订须知 · ' + esc(k.name) + '</h5>' +
        /* 预订须知是富文本，服务端已按白名单过滤 */
        '<div class="pd-nb rich-view">' + (k.book_notice || '该套餐暂未填写预订须知') +
        '</div>' +
        '<h5 style="margin-top:16px">套餐说明</h5>' +
        '<div class="pd-nb">' + esc(pkgDesc(k)) + '</div></div>' +
        '<div class="pdx-blk"><h5>通用条款</h5>' + [
          ['取消与退款', '订单支付前可直接取消；已支付的订单需提交退款申请，' +
            '按已产生的官费与服务成本核减后退还余款。'],
          ['成交价区间', pmSales()
            ? '门店可在区间内让利：低于结算价 ¥' + money(k.settle_price) +
              ' 或高于建议零售价 150% 会被系统拦截。'
            : '门店可在系统允许的区间内让利，超出区间会被系统拦截。'],
          ['材料版本', '下单时按适用人群将材料清单快照写入订单，清单后续改版不影响已下单客户。'],
          ['人工环节', '提交、缴费、抢号、递交、采指纹五项官方渠道无公开接口，' +
            '由签证专员人工操作后回填凭证，不承诺自动化。'],
          ['结果口径', '是否获签由使领馆 / 移民局决定，本产品不构成出签或入境承诺。']
        ].map(function (x) {
          return '<div class="kv2"><i>' + x[0] + '</i><b>' + x[1] + '</b></div>';
        }).join('') + '</div></div>';
    }

    /* ---- 分段内容：套餐明细（价格构成，与右栏的选择器互补） ---- */
    function pkgHtml() {
      /* 客人模式下整张表只留对客口径：签证费 / 服务费 / 结算价 / 毛利四列一并撤掉，
         不是把数字换成「—」——留着空列等于告诉客人这里藏了东西（2026-09-07）。 */
      var sale = pmSales();
      return '<div class="note">同一个供应商产品下按「普通 / 加急 / 代办面签陪同」等服务档位拆套餐，' +
        '各自独立维护价格、时效与预订须知。' +
        (sale ? '<b>毛利 = 建议零售价 − 结算价</b>，销售让利时不能低于结算价。'
          : '当前为客户模式，结算价与毛利不予展示，可在顶部切换。') + '</div>' +
        table(['套餐', '套餐说明'].concat(sale ? ['签证费', '服务费', '结算价'] : [])
          .concat(['建议零售价']).concat(sale ? ['毛利'] : []).concat(['时效', '操作']),
          d.packages, function (x) {
            var gp = x.suggest_retail - x.settle_price;
            return '<td><b>' + esc(x.name) + '</b><div class="hint mono">' + esc(x.sup_code || '') + '</div></td>' +
              '<td class="wrap">' + esc(pkgDesc(x)) + '</td>' +
              (sale ? '<td class="num">¥' + money(x.visa_fee) + '</td><td class="num">¥' +
                money(x.service_fee) + '</td><td class="num"><b>¥' + money(x.settle_price) +
                '</b></td>' : '') +
              '<td class="num">' + money(x.suggest_retail) + '</td>' +
              (sale ? '<td class="num"><b style="color:#0F7B4F">¥' + money(gp) +
                '</b><div class="hint">' +
                (x.suggest_retail ? Math.round(gp / x.suggest_retail * 100) : 0) +
                '%</div></td>' : '') +
              '<td class="num">' + x.lead_days + ' 工作日</td>' +
              '<td>' + (x.id === pkgId ? '<span class="tag info">已选</span>' :
                '<button class="btn sm" data-pks="' + x.id + '">选它</button>') + '</td>';
          }) +
        '<div class="hint" style="margin-top:10px">预订须知与套餐说明在「购买须知」页签里，' +
        '跟着当前选中的套餐走。</div>';
    }

    function flowHtml() {
      return '<div class="note">下单后系统按该链路推进，每一步都有责任人与时间戳，' +
        '销售在「订单管理」里能看到客户当前卡在哪一步。' +
        '<b>提交、缴费、抢号、递交、采指纹五项官方渠道无公开接口，由专员人工操作后回填凭证。</b></div>' +
        '<div class="pd-flow">' + [
          ['下单与收款', '销售代客录单 → 客户付款 → 财务确认收款后才派发工单'],
          ['收料与审核', '客户上传材料，签证专员逐项审核，不合格的发补料通知（7 天倒计时）'],
          ['表单填写', '专员代填 DS-160 等官方表单，回填 Application ID 与条形码'],
          ['缴费与预约', '代缴签证费并登记收据号，代约面签时间与地点'],
          ['递交使领馆', '按送签地组批次递交，登记快递单号'],
          ['出结果', '出签 / 拒签 / 撤签 / 行政审查，拒签需判定责任方'],
          ['返还与签收', '资料与护照寄回客户，签收后订单完结']
        ].map(function (s, i) {
          return '<div class="pd-fs"><i>' + (i + 1) + '</i><div><b>' + s[0] + '</b><s>' + s[1] + '</s></div></div>';
        }).join('') + '</div>';
    }

    /* ---- 分段内容：供应商横向比价（只有门店销售看得到） ---- */
    function sibHtml() {
      return '<div class="note">同一条平台产品可以挂多家供应商，价格与时效各不相同。' +
        '这一屏只在 B 端出现，<b>客户小程序看不到结算价与毛利</b>。</div>' +
        (sibs.length > 1 ? '' : '<div class="hint" style="margin:10px 0">' +
          '该平台产品目前只有 1 家供应商在售，多家在售时这里会并排列出，销售择优开单。</div>') +
        '<div class="pdx-sibs">' + sibs.map(function (s) {
          var on = s.sup_product_id === d.sup_product_id;
          return '<div class="pdx-sib' + (on ? ' on' : '') + '" data-sw="' + s.sup_product_id + '">' +
            '<div class="hd"><b>' + esc(s.supplier) + '</b>' +
            (on ? '<span class="tag info">当前查看</span>' : '<span class="tag plain">切换过去 ›</span>') +
            '</div><div class="nm">' + esc(s.name) + '</div>' +
            '<div class="kv"><span>起价</span><b class="pr">¥' + money(s.price_min) + '</b></div>' +
            '<div class="kv"><span>最快出签</span><b>' + s.lead_min + ' 个工作日</b></div>' +
            '<div class="kv"><span>套餐数</span><b>' + s.pkg_count + ' 个</b></div>' +
            (pmSales() ? '<div class="kv"><span>单人毛利最高</span><b class="gp">¥' +
              money(s.margin || 0) + '</b></div>' : '') +
            '<div class="tg">' +
            (s.svc || []).slice(0, 3).map(function (v) { return '<span>' + esc(v) + '</span>'; }).join('') +
            '</div></div>';
        }).join('') + '</div>';
    }

    /* ---- 分段内容：受理范围与政策 ---- */
    function acceptHtml() {
      return '<div class="pdx-two">' +
        '<div class="pdx-blk"><h5>受理范围</h5>' +
        '<div class="hint rich-view">' + (richView(p.accept_note) || '—') + '</div>' +
        (d.accept_provinces && d.accept_provinces.length ?
          '<div class="pd-prov">' + d.accept_provinces.map(function (x) {
            return '<span>' + esc(x) + '</span>';
          }).join('') + '</div>' : '') +
        (d.mail_addr ? '<h5 style="margin-top:16px">原件邮寄地址</h5><div class="hint">' +
          esc(d.mail_addr) + '</div>' : '') +
        '<h5 style="margin-top:16px">材料清单版本</h5>' +
        '<div class="kv"><i>版本号</i><b class="mono">' + esc(d.fullver.ver_no) + '</b></div>' +
        '<div class="kv"><i>清单名称</i><b>' + esc(d.fullver.name) + '</b></div>' +
        '<div class="kv"><i>生效时间</i><b>' + esc(d10(d.fullver.effective_at)) + '</b></div>' +
        '</div>' +
        '<div class="pdx-blk"><h5>' + esc(p.country) + '签证政策</h5>' +
        '<div class="hint" style="margin-bottom:9px">总部运营维护，与客户端小程序同一份口径，' +
        '每条均注明来源，销售可直接向客户转述。</div>' +
        (pols.length ? polStrip(pols) : '<div class="hint">该目的地暂无已发布的政策内容</div>') +
        '</div></div>';
    }

    var TABS = [['mat', '所需材料'], ['pkg', '套餐与价格'], ['buy', '购买须知'],
    ['flow', '办理流程'], ['sib', '供应商比价'], ['acc', '受理范围与政策']];
    var SECF = {
      mat: matsHtml, pkg: pkgHtml, buy: buyHtml,
      flow: flowHtml, sib: sibHtml, acc: acceptHtml
    };

    /* 选择套餐回到「产品特色」这一档位置（唐美芳 2026-08-27）：
       它是中间面板里的主内容，不是结算控件——套餐名、时效、说明、
       结算价/毛利这一排细目在 292px 的右栏里得折成好几行，摆在 1200 的中间面板里
       一行就读完了。右栏只留跟着走的结算卡。
       套餐数量三种情况：1 个不摆「选择套餐」这种要人做选择的标题，卡片通栏；
       2 个以上排两列（1200 宽下单列会在名称和价格之间空掉大半行）；
       上限 12 个由后端 PKG_MAX 卡住，两列六行正好。 */
    function pksHtml() {
      var n = d.packages.length;
      return '<div class="pdx-pks"><div class="hd">' +
        '<b>' + (n > 1 ? '选择套餐' : '套餐') + '</b>' +
        (n > 1 ? '<em>' + n + ' 个可选</em>' : '') +
        '<s>' + (n > 1
          ? '价格、时效与保障各不相同，选中即按该套餐预估，右侧结算栏跟着变'
          : '该产品目前只有这一个套餐') + '</s></div>' +
        '<div class="ls' + (n === 1 ? ' one' : ' c2') +
        '">' + d.packages.map(function (x) {
          var g2 = x.suggest_retail - x.settle_price;
          return '<div class="pkc' + (x.id === pkgId ? ' on' : '') + '" data-pkc="' + x.id + '">' +
            '<div class="h"><b>' + esc(x.name) + '</b>' +
            '<span class="ld">' + x.lead_days + ' 个工作日出签</span></div>' +
            '<div class="ds">' + esc(pkgDesc(x)) + '</div>' +
            (pmSales()
              ? '<div class="ft"><span>签证费 ¥' + money(x.visa_fee) + '</span>' +
                '<span>服务费 ¥' + money(x.service_fee) + '</span>' +
                '<span class="st">结算价 ¥' + money(x.settle_price) + '</span>' +
                '<span class="gp">毛利 ¥' + money(g2) + '</span></div>'
              : '<div class="ft"><span>办理时长 ' + x.lead_days + ' 个工作日</span>' +
                (x.refund_insured ? '<span>含拒签保障</span>' : '') + '</div>') +
            '<div class="pr"><b>¥' + money(x.suggest_retail) + '</b><u>建议零售 / 人</u>' +
            (n > 1 ? '<i>' + (x.id === pkgId ? '已选' : '选择') + '</i>' : '') +
            '</div></div>';
        }).join('') + '</div></div>';
    }

    var SC = null, spyOn = null;

    function draw() {
      /* 换套餐/改人数会整页重绘，不保位置的话会被弹回顶部——销售正看着材料表呢 */
      var keep = SC ? SC.scrollTop : 0;
      var k = pk();
      var ent = ENTRIES[p.entries] || p.entries;
      var valid = validTx(p) + '有效';
      var gp = k.suggest_retail - k.settle_price;

      m.innerHTML = uzPage([['首页', ''], ['签证', 'visa']],
        '<div class="uz-crumb"><a data-bc="">首页</a><i>›</i><a data-bc="visa">签证</a><i>›</i>' +
        '<a data-bc="c-' + esc(p.country) + '">' + esc(p.country) + '签证</a><i>›</i><b>产品详情</b></div>' +

        /* 整页两竖条（唐美芳 2026-08-27，比照京东/淘宝详情页）：
           左边就是别的页面那条 1200 的中间面板——头图、产品特色、选择套餐、内容页签，
           一样宽，不因为右边多了东西就变窄；右边单独一竖条只放结算模块，从头图那行起头，
           一路 sticky 跟着，销售翻到材料清单也能直接改人数下单。 */
        '<div class="pdx-2c"><div class="pdx-main">' +

        /* 上半屏：左大图 + 右信息区（对齐她给的跟团游详情页） */
        '<div class="pdx-top">' +
        '<div class="pdx-im" style="background-image:url(' + dimg(p.country) + ')">' +
        '<span class="cd">' + esc(p.visa_type) + ' | ' + esc(d.sup_code || ('U' + d.sup_product_id)) + '</span>' +
        '<span class="fg">' + flag(p.country) + ' ' + esc(p.country) + '</span></div>' +
        '<div class="pdx-inf">' +
        '<div class="tt"><em>' + esc(d.supplier) + '</em>' +
        '<h1>' + esc(d.name) + '</h1></div>' +
        '<div class="tg">' +
        '<span class="k">' + esc(ent) + '</span><span class="k">' + esc(valid) + '</span>' +
        '<span class="k">停留 ' + stayTx(p) + '</span>' +
        (p.need_interview ? '<span class="w">需本人面签</span>' : '<span class="o">免面签</span>') +
        (p.need_fingerprint ? '<span class="w">需采集指纹</span>' : '<span class="o">免录指纹</span>') +
        '</div>' +
        '<div class="fc">' + [
          ['送签地', p.submit_city], ['最快出签', fast + ' 个工作日'],
          ['可选套餐', d.packages.length + ' 个'], ['供应商', d.supplier]
        ].map(function (c) {
          return '<div><s>' + esc(c[0]) + '</s><b>' + esc(String(c[1])) + '</b></div>';
        }).join('') + '</div>' +
        '<div class="pb"><div class="l"><i>零售参考价</i><b>¥' + money(lo) + '</b><u>起 / 人</u></div>' +
        (pmSales()
          ? '<div class="r"><s>结算价 ¥' + money(Math.min.apply(null, d.packages.map(function (x) {
              return x.settle_price;
            }))) + ' 起</s><em>单人毛利最高 ¥' +
            money(Math.max.apply(null, d.packages.map(function (x) {
              return x.suggest_retail - x.settle_price;
            }))) + '</em></div>'
          : '') + '</div>' +
        '</div></div>' +

        feHtml() +

        /* 选择套餐排在产品特色这一档（唐美芳 2026-08-27 指定），通栏摆在中间面板里。 */
        pksHtml() +

        /* 内容区：六块一次性堆叠渲染，顶上那条页签是吸顶锚点导航——滚到哪块自动高亮，
           点了平滑跳过去（她要的「下滑也能看见，不要只是点击交互」）。 */
        '<div class="pdx-mid">' +
        '<div class="pdx-tabs">' + TABS.map(function (t) {
          return '<a data-t="' + t[0] + '">' + t[1] + '</a>';
        }).join('') + '</div>' +
        '<div class="pdx-body">' + TABS.map(function (t) {
          return '<section class="pdx-sec" id="pdxs-' + t[0] + '">' +
            '<h4>' + t[1] + '</h4>' + SECF[t[0]]() + '</section>';
        }).join('') + '</div></div>' +
        '</div>' +

        /* 右栏＝结算模块，只放跟这一单报价直接相关的数字。
           目的地/送签地/时效/停留在头部信息区已经写过，套餐细目在中间面板的套餐卡里，
           这里再抄一遍就是第三遍。 */
        '<aside class="pdx-buy"><div class="bx">' +
        '<div class="hd"><b>' + esc(k.name) + '</b>' +
        '</div>' +
        (pmSales() ? '<div class="kv"><i>结算价</i><b>¥' + money(k.settle_price) + '</b></div>' : '') +
        '<div class="kv"><i>建议零售价</i><b>¥' + money(k.suggest_retail) + '</b></div>' +
        (pmSales() ? '<div class="kv gp"><i>单人毛利</i><b>¥' + money(gp) + '（' +
          (k.suggest_retail ? Math.round(gp / k.suggest_retail * 100) : 0) + '%）</b></div>' : '') +
        '<div class="kv step"><i>办签人数</i><span class="sp">' +
        '<a data-px="-1">−</a><b>' + pax + '</b><a data-px="1">+</a></span></div>' +
        '<div class="tot"><i>按建议零售价预估</i><b>¥' + money(k.suggest_retail * pax) + '</b></div>' +
        '<button class="uz-buy" data-buy0>代客下单</button>' +
        '<button class="uz-send" data-send>将材料清单发送至客户（扫码 / 链接）</button>' +
        /* 这里只按建议零售价预估，真正的成交价在下单页填，低于结算价会被系统拦截。
           写清楚，免得销售以为这一页的数字就是最终报给客人的价。 */
        '<div class="tip">成交价在下单页填写，可在区间内让利：' +
        (pmSales()
          ? '<b>低于结算价 ¥' + money(k.settle_price) + ' 或高于建议零售价 150% 会被系统拦截</b>。' +
            '当前为销售模式，向客户展示前请切回顶部的「零售价」。'
          : '超出系统允许区间会被拦截。当前为客户模式，结算价与毛利不予展示。') + '</div>' +
        '</div></aside></div>', true);

      bkBind(m);
      polBind(m, pols);
      $('[data-buy0]', m).onclick = function () {
        S.cache.pdPkg = pkgId; go('create', d.sup_product_id);
      };
      $$('[data-send]', m).forEach(function (b) { b.onclick = sendModal; });
      $$('[data-pkc]', m).forEach(function (el) {
        el.onclick = function () { pkgId = +el.dataset.pkc; draw(); };
      });
      $$('[data-pks]', m).forEach(function (b) {
        b.onclick = function () { pkgId = +b.dataset.pks; draw(); };
      });
      $$('[data-px]', m).forEach(function (a) {
        a.onclick = function () {
          pax = Math.min(20, Math.max(1, pax + (+a.dataset.px)));
          draw();
        };
      });
      /* 页签 = 吸顶锚点导航。外壳自己在滚（不是 window），先找到真正的滚动容器。 */
      if (!SC) SC = (function (el) {
        for (var n = el.parentElement; n; n = n.parentElement) {
          var ov = getComputedStyle(n).overflowY;
          if (ov === 'auto' || ov === 'scroll') return n;
        }
        return document.scrollingElement;
      })(m);
      var navs = $$('[data-t]', m);
      var secs = TABS.map(function (t) { return $('#pdxs-' + t[0], m); });
      /* 根滚动容器的 rect.top 会随滚动变成负数（它自己在动），拿它当基准会把判定线一起带跑；
         视口坐标系原点就是 0，只有内滚的元素才需要减自己的偏移。 */
      function base() {
        return SC === document.scrollingElement ? 0 : SC.getBoundingClientRect().top;
      }
      function spy() {
        if (!secs[0] || !secs[0].isConnected) {
          (SC === document.scrollingElement ? window : SC)
            .removeEventListener('scroll', spy);
          return;
        }
        /* 判定线放在吸顶页签条下方一点：一块的标题刚被页签盖住就算「读到这块了」 */
        var line = base() + 116, cur = 0;
        secs.forEach(function (s, i) {
          if (s && s.getBoundingClientRect().top <= line) cur = i;
        });
        navs.forEach(function (a, i) { a.className = i === cur ? 'on' : ''; });
      }
      navs.forEach(function (a, i) {
        a.onclick = function () {
          var s = secs[i];
          if (!s) return;
          S.cache.pdTab = TABS[i][0];
          SC.scrollTo({
            top: SC.scrollTop + s.getBoundingClientRect().top - base() - 96,
            behavior: 'smooth'
          });
        };
      });
      /* 根滚动容器的 scroll 事件目标是 document / window，不是 documentElement，
         挂在 SC 上收不到；只有内滚的元素才自己派发。 */
      var ST = SC === document.scrollingElement ? window : SC;
      if (spyOn) ST.removeEventListener('scroll', spyOn);
      spyOn = spy;
      ST.addEventListener('scroll', spy, { passive: true });
      spy();
      $$('[data-cw]', m).forEach(function (a) {
        a.onclick = function () { crowd = S.cache.pdCrowd = a.dataset.cw; draw(); };
      });
      $$('[data-sw]', m).forEach(function (el) {
        el.onclick = function () {
          if (+el.dataset.sw === d.sup_product_id) return;
          go('pdetail', el.dataset.sw);
        };
      });
      bindSample(m);
      if (keep) { SC.scrollTop = keep; spy(); }
    }
    draw();
  });
};

/* ---------- 代客下单（PC 门户第五层） ----------
   唐美芳 2026-08-27：「csp 签证频道下的订单填写页的结构也应该和 C 端小程序一样变一下，
   现在 csp 上的订单填写页页面突然变得特别宽了。填写的字段也不一致，看看是哪里的问题」。

   三个问题一个根：这一页当年是照后台页写的，后来门户外壳（uzPage / imm2）铺开时漏了它。
   1）「特别宽」——别的门户页都在 uzPage 的 1200/1506 版心里，这一页用的还是后台的
      pageH() + .two，而 body.imm2 又把后台的左菜单和内边距全脱了，
      于是它变成一张贴着视口两边、随屏幕无限拉宽的表。销售从产品详情点「代客下单」进来，
      顶栏页脚一起消失，看着就像跳去了另一个系统。
   2）「字段不一致」——C 端一位办签人收 8 个字段（中文姓名 / 拼音英文姓名 / 适用人群 /
      性别 / 出生日期 / 护照号 / 护照有效期至 / 手机号）＋ 独立联系人（姓名 / 手机 / 邮箱）；
      这一页少了联系人邮箱，联系人还是拿办签人姓名手机顶上的。同一张订单两个入口收的数据不一样，
      到了 UOM 工单上就是有的单有邮箱、有的单没有，出签通知发不出去。
   3）**比字段更严重的**：这一页只能录 1 位办签人，而 C 端最多 9 位、后端也早就按数组收。
      门店销售最常见的恰恰是一家三口、一个团队一起办——原来只能开三张单。这次一并补上。

   结构照 C 端订单填写页对齐（产品条 → 退改口径 → 预计出行日期 → 办签人 → 联系人 →
   资料提交方式 → 费用），只是把手机上的「芯片 + 底部抽屉」换成 PC 上该有的
   「一人一张展开卡 + 行内表单」——分区顺序、字段、必填口径三者一致，交互形态各随各端。
   销售端独有的东西（老客户档案带出、成交价与拦截、结算价毛利）留在右栏和办签人卡里，不混进客人看的主轴。 */
VIEWS['csp:create'] = function (m, spid) {
  if (!spid) return VIEWS['csp:book'](m);
  return Promise.all([api('/shop/product?id=' + spid), api('/crm/customers'),
                      api('/my/last_contact', null, { silent: 1 }).catch(function () { return {}; })])
    .then(function (rr) {
    var d = rr[0], custs = rr[1].list, p = d.product;
    /* 未在门店渠道上架的产品要拦在门口。后端 /order/create 当然也会拦，
       但那是销售把三位办签人的护照号都敲完、点了提交才弹出来的 —— 白填一整张表。
       （直接拿链接进来、或者产品刚被下架，都会走到这里。） */
    if (!d.on_b) {
      m.innerHTML = uzPage([['首页', ''], ['签证', 'visa']],
        '<div class="uz-crumb"><a data-bc="">首页</a><i>›</i><a data-bc="visa">签证</a><i>›</i>' +
        '<b>代客下单</b></div>' +
        '<section class="uz-sec"><div class="ck-pad" style="padding-top:16px">' +
        '<div class="ck-warn"><b>' + esc(d.name) + '</b> 当前没有在门店渠道上架，' +
        '或者总部对 B 端的上架审核还没通过，不能代客下单。' +
        '该产品可能已被供应商下架，也可能只开放了客户端。' +
        '请回签证频道另选一条，或联系总部产品运营确认上架状态。</div>' +
        '<div style="padding:14px 0 4px"><button class="btn r" data-bc="visa">回签证频道选产品</button>' +
        '<button class="btn" data-pdx style="margin-left:10px">查看该产品详情</button></div>' +
        '</div></section>');
      bkBind(m);
      $('[data-pdx]', m).onclick = function () { go('pdetail', d.sup_product_id); };
      return;
    }
    var want = d.packages.filter(function (x) { return x.id === S.cache.pdPkg; })[0];
    var pkgId = (want || d.packages[0]).id;
    S.cache.pdPkg = 0;
    /* 演示环境给第一位办签人预填一份资料，销售点进来就能一路走到提交；
       真实场景这里当然是空的，「＋ 添加办签人」加出来的每一位也都是空的。 */
    /* 办签人一律通过「选择或更改办签人」面板产生，初始为空 */
    var A = [];
    /* 「下单后再填写办签人资料」：只报人数先占单，资料在订单详情里补
       （唐美芳 2026-09-01）。逾期未补整单自动取消，所以放开是安全的。 */
    var later = false, laterN = 1;
    /* 联系人＝这一单对外联络的人：可能是客人本人，可能是替全家跑腿的那一个，也可能就是销售。
       原来这一页压根没有独立联系人，直接拿办签人的姓名手机顶上，于是一家三口的单子
       通知永远发给第一位；而 C 端是让客人单独填的，两端收的数据对不上。
       原来这里一格都不预填——理由是「默认填成销售自己，销售会一路点过去，
       客人到头来收不到出签通知」。
       2026-09-03 改成<b>带出上一单填过的联系人</b>（唐美芳：「有米和 csp 下单填写的时候，
       联系人信息为什么没有自动带出来上次填写的呢」）。这跟当初担心的不是一回事：
       带出来的是**上一单的真实联系人**，不是销售自己；门店常连着给同一位客人下几单。
       但那份担心仍然成立，所以：带出的三格加高亮描边、上面写明「已带出上一单的」、
       旁边给一颗「清空重填」——让销售<b>看得见</b>这是带出来的，而不是自己刚敲的。 */
    var lastCt = (rr[2] || {}).contact;
    var contact = lastCt
      ? { name: lastCt.name || '', phone: lastCt.phone || '', email: lastCt.email || '' }
      : { name: '', phone: '', email: '' };
    var ctFrom = lastCt ? lastCt.at : '';
    var depart = '', dealPrice = null;
    var custKey = '';   /* 当前客户档案，由办签人面板选定并回传 */

    function pk() { return d.packages.filter(function (x) { return x.id === pkgId; })[0]; }
    var full = apFull;   /* 姓名 + 证件号 + 人群齐了就能提交（ap-picker.js） */
    function badCount() { return A.filter(function (a) { return !full(a); }).length; }
    function paxCount() { return later ? laterN : A.length; }
    function price() { var v = parseFloat(dealPrice); return isNaN(v) ? pk().suggest_retail : v; }

    /* 出行日期离今天还有几个自然日。签证时效按工作日算，这里粗算成 工作日 ≈ 自然日 × 5/7，
       只用来提醒不用来卡提交——和 C 端同一套口径，两端不能一个拦一个不拦。 */
    function dayGap() {
      if (!depart) return null;
      return Math.round((new Date(depart) - new Date(new Date().toDateString())) / 86400000);
    }
    function tooTight() {
      var g = dayGap();
      if (g == null) return null;
      var need = Math.ceil(pk().lead_days * 7 / 5);
      return g < need ? { gap: g, need: need } : null;
    }

    /* ---- 分区渲染：整页只画一次，之后各区各自重画。
       整页重绘会把销售正在输入的那一格焦点弹掉，一张十几个格子的表这么干几次就没法用了。 ---- */
    /* 办签人：与 C 端、有米用同一个选择面板（ap-picker.js）。
       原来这里是一人一张大表单、十几个格子就地填，改一个人要滚半屏；
       而且「老客户档案 → 历史办签人」是另一条独立通路，同一件事两种做法
       （唐美芳 2026-09-01：「应该像携程那样，有个统一管理的界面」）。
       现在统一成一个入口，客户档案里的人与本单新增的人都在同一个面板里勾。 */
    function paxHtml() {
      if (later) {
        return '<div class="ck-tip" style="margin:0 0 10px">' +
          '先按人数占位，下单后在订单详情「办签人信息」里逐位补齐资料。</div>' +
          apLaterHtml(true, laterN, 24);
      }
      return (A.length
        ? '<div class="ap-sel">' + A.map(function (a, i) {
          return '<div class="ap-card' + (full(a) ? '' : ' bad') + '">' +
            '<div class="n"><b>' + esc(a.name_cn || ('办签人 ' + (i + 1))) + '</b>' +
            '<s>' + esc(CROWD_CN[a.crowd] || '') +
            (a.id_no ? ' · ' + esc(a.id_type || '护照') + ' ' + esc(a.id_no) : ' · 证件信息不全') +
            (a.id_expiry ? ' · 有效期至 ' + esc(a.id_expiry) : '') + '</s></div>' +
            '<span class="x" data-del="' + i + '">×</span></div>';
        }).join('') + '</div>'
        : '<div class="ck-tip" style="margin:0 0 10px">请选择或新增需要办理签证的办签人</div>') +
        '<a class="ap-pick" data-add>＋ 选择或更改办签人</a>' +
        apLaterHtml(false, laterN, 24) +
        '<div class="ck-tip">「适用人群」决定该客户要交哪些材料。' +
        '姓名与证件信息须与护照原件完全一致，任一项不符都将导致退件并需重新送签。' +
        '一张订单最多 9 位办签人。</div>';
    }

    function dateHtml() {
      var t = tooTight(), g = dayGap();
      /* 原来是裸的 <input type="date">，点下去唤起浏览器自带日历，
         看不到周末、节假日与最早可办日（唐美芳 2026-09-07：「日期控件改为日历控件」）。
         换成与有米同一个 calPicker，两端同一套交互。 */
      return '<div class="ck-date"><label class="f"><span>预计出行日期 <i>*</i></span>' +
        '<a class="ck-dep' + (depart ? ' on' : '') + '" id="ck_dep">' +
        (depart ? esc(depart) : '点击选择出行日期') + '</a></label>' +
        '<div class="ck-dt">' + (depart
          ? '距今 <b>' + g + ' 天</b>'
          : '') + '</div></div>' +
        (t ? '<div class="ck-warn">本套餐约需 <b>' + pk().lead_days +
          ' 个工作日</b>出签，客户的出行日期只剩 <b>' + t.gap +
          ' 天</b>，时间可能不够。建议改期，或改选加急套餐后再报价。</div>' : '');
    }

    function sumHtml() {
      var k = pk(), pr = price(), gp = pr - k.settle_price;
      return '<div class="bx">' +
        '<div class="hd"><b>' + esc(k.name) + '</b>' +
        '</div>' +
        '<label class="f ck-deal"><span>成交价（元 / 人） <i>*</i></span>' +
        '<input id="ck_deal" type="number" value="' + (dealPrice == null ? k.suggest_retail : esc(dealPrice)) + '"></label>' +
        '<div class="ck-band">' +
        (pmSales() ? '结算价 ¥' + money(k.settle_price) + ' · ' : '') +
        '建议零售 ¥' + money(k.suggest_retail) +
        ' · 上限 ¥' + money(k.suggest_retail * 1.5) + '</div>' +
        '<div class="kv"><i>' + esc(k.name) + ' × ' + paxCount() + ' 人</i><b>¥' +
        money(pr * paxCount()) + '</b></div>' +
        (pmSales()
          ? '<div class="kv"><i>结算成本</i><b>¥' + money(k.settle_price * paxCount()) + '</b></div>' +
            '<div class="kv gp"><i>本单毛利</i><b>¥' + money(gp * paxCount()) + '（' +
            (pr ? Math.round(gp / pr * 100) : 0) + '%）</b></div>'
          : '') +
        '<div class="tot"><i>订单总额</i><b>¥' + money(pr * paxCount()) + '</b></div>' +
        '<button class="uz-buy" data-submit>提交订单</button>' +
        /* 「试一下低于结算价（看拦截）」是演示时用来展示价格护栏的按钮，
           不是业务动作，正式页面上不该出现（唐美芳 2026-09-08）。
           护栏本身没动，成交价越界时提交仍会被拦。 */
        '<div class="tip">成交价可在区间内让利，' +
        (pmSales()
          ? '低于结算价或高于建议零售价 150% 将被系统拦截。'
          : '超出系统允许区间将被拦截。') + '</div>' +
        '</div>';
    }

    /* 套餐只有一个时不摆成「一张小卡 + 右边一片白」——唐美芳 v144 已经就详情页说过一次同样的事。
       单套餐横排铺满，也不给选中描边（没得选，描边只是噪音）；多套餐才是并排的可选卡。 */
    function pkgHtml() {
      var one = d.packages.length === 1;
      return '<div class="ck-pkgs' + (one ? ' one' : '') + '">' + d.packages.map(function (x) {
        var gp = x.suggest_retail - x.settle_price;
        return '<div class="ck-pkg' + (x.id === pkgId ? ' on' : '') + '" data-pk="' + x.id + '">' +
          '<b>' + esc(x.name) + '</b>' +
          '<div class="pr">¥' + money(x.suggest_retail) + '<s> 建议零售 / 人</s></div>' +
          '<div class="mt">' +
          (pmSales() ? '结算 ¥' + money(x.settle_price) + ' · 毛利 ¥' + money(gp) + ' · ' : '') +
          x.lead_days + ' 工作日</div>' +
          '</div>';
      }).join('') + '</div>';
    }

    /* 产品信息弹窗：和 C 端订单填写页那颗「查看」按钮同一份内容、同一份数据（d.checklist），
       销售不用退回详情页就能给客人念材料清单。人群 tab 切换只重画内容，不重建弹窗。 */
    function infoModal() {
      var cw = A[0] && A[0].crowd || 'job';
      function body() {
        var list = d.checklist[cw] || [];
        return '<div class="bk-mtab">' +
          [['job', '在职'], ['retire', '退休'], ['free', '自由职业'],
          ['student', '在校学生'], ['child', '学龄前儿童']].map(function (x) {
            return '<a data-cw2="' + x[0] + '"' + (cw === x[0] ? ' class="on"' : '') + '>' + x[1] + '</a>';
          }).join('') + '</div>' +
          '<div class="bk-mlist">' + (list.length ? list.map(function (i) {
            return '<div><b>' + esc(i.mat_name) +
              (i.necessity === 'must' ? '<em class="must">必须</em>' : '<em>建议</em>') + '</b>' +
              '<s>' + esc(i.attr_text) + ' × ' + i.copies + ' · ' + esc(i.way_text) + '</s>' +
              (i.require_text ? '<p>' + esc(i.require_text) + '</p>' : '') + '</div>';
          }).join('') : '<div class="empty">该人群暂无材料项</div>') + '</div>' +
          '<h5>办理流程</h5><div class="bk-mflow">' +
        ((d.flow && d.flow.length)
          ? d.flow.map(function (x, i) { return ['第' + (i + 1) + '步', x.t]; })
          : cspFlow()).map(function (f) {
            return '<div><b>' + f[0] + '</b><s>' + esc(f[1]).replace(/\n/g, ' ') + '</s></div>';
          }).join('') + '</div>' +
          '<h5>签证属性</h5><div class="bk-mkv">' +
          '<div><i>有效期</i><b>' + esc(validTx(p)) + '</b></div>' +
          '<div><i>入境次数</i><b>' + esc(ENTRIES[p.entries] || p.entries) + '</b></div>' +
          '<div><i>停留时间</i><b>' + stayTx(p) + '</b></div>' +
          '<div><i>是否面试</i><b>' + (p.need_interview ? '需本人到馆' : '免面试') + '</b></div>' +
          '<div><i>是否录指纹</i><b>' + (p.need_fingerprint ? '需本人到场' : '无需') + '</b></div>' +
          '<div><i>办理时长</i><b>约 ' + pk().lead_days + ' 个工作日</b></div></div>';
      }
      var mo = modal('产品信息 · ' + d.name, body(), null, true);
      function bind() {
        $$('[data-cw2]', mo.mask).forEach(function (a) {
          a.onclick = function () { cw = a.dataset.cw2; $('.modal .c', mo.mask).innerHTML = body(); bind(); };
        });
      }
      bind();
    }

    /* ---- 局部重画 ---- */
    function repaint(sel, html, bindFn) { var el = $(sel, m); if (el) { el.innerHTML = html; bindFn(); } }
    function drawPax() { repaint('#ck_pax', paxHtml(), bindPax); drawSum(); }
    function drawSum() { repaint('#ck_sum', sumHtml(), bindSum); }
    function drawDate() { repaint('#ck_date', dateHtml(), bindDate); }

    function bindPax() {
      apLaterBind($('#ck_pax', m) || m, function () { return { n: laterN }; },
        function (on, n) { later = on; laterN = n; drawPax(); });
      $$('#ck_pax [data-del]', m).forEach(function (b) {
        b.onclick = function () { A.splice(+b.dataset.del, 1); drawPax(); };
      });
      var add = $('#ck_pax [data-add]', m);
      if (add) add.onclick = function () {
        apPicker(A, { max: 9, mode: 'sales', custKey: custKey,
                      title: '选择办签人' })
          .then(function (out) {
            A = out;
            if (out.custKey !== undefined) custKey = out.custKey;
            /* 只带出一位、且联系人还空着时，顺手把联系人补上——
               代客下单十有八九就是给这个人办 */
            if (out.length === 1 && !contact.name && !contact.phone) {
              contact.name = out[0].name_cn || '';
              contact.phone = out[0].phone || '';
              repaint('#ck_ct', contactHtml(), bindContact);
            }
            drawPax();
          });
      };
    }
    function openCal() {
      var k = pk();
      return calPicker({
        title: '选择预计出发日期',
        tip: '请选择预计出行时间，以便为您安排送签和配送',
        value: depart,
        min: calPlus(calWork2Nat(k.lead_days || 15)),
        price: k.suggest_retail,
        months: 4
      }).then(function (v) { depart = v; drawDate(); }).catch(function () { });
    }
    function bindDate() {
      var dp = $('#ck_dep', m);
      if (dp) dp.onclick = openCal;
    }
    function bindSum() {
      var dl = $('#ck_deal', m);
      if (dl) {
        dl.oninput = function () { dealPrice = dl.value; };
        dl.onchange = function () { dealPrice = dl.value; drawSum(); };
      }
      $('#ck_sum [data-submit]', m).onclick = function () { submit(price()); };
    }
    function bindPkg() {
      $$('[data-pk]', m).forEach(function (el) {
        el.onclick = function () {
          pkgId = +el.dataset.pk; dealPrice = null;
          $$('[data-pk]', m).forEach(function (x) { x.classList.toggle('on', x === el); });
          drawSum(); drawDate();   /* 换套餐会换时效，时效预警要跟着重算 */
        };
      });
    }
    function bindContact() {
      $$('#ck_ct [data-cf]', m).forEach(function (el) {
        el.oninput = function () { contact[el.dataset.cf] = el.value.trim(); };
      });
      $$('#ck_ct [data-q]', m).forEach(function (el) {
        el.onclick = function () {
          if (el.dataset.q === 'clr') {
            contact = { name: '', phone: '', email: '' };
            ctFrom = '';
          } else if (el.dataset.q === 'me') {
            contact.name = (S.user && S.user.name) || '';
            contact.phone = (S.user && S.user.phone) || '';
            ctFrom = '';
          } else {
            var a = A[0] || {};
            if (!a.name_cn) return toast('请先选择办签人', true);
            contact.name = a.name_cn; contact.phone = a.phone;
            ctFrom = '';
          }
          repaint('#ck_ct', contactHtml(), bindContact);
        };
      });
    }
    /* 老客户回单：选定客户后，他的历史办签人会出现在「选择或更改办签人」面板里。
       原来这里另挂了一个「从历史办签人添加」下拉，跟面板做的是同一件事，
       同一件事两个入口（唐美芳 2026-09-01 要求统一到一个管理界面），已收进面板。 */
    function contactHtml() {
      /* 带出来的值要让销售<b>看得见</b>是带出来的：三格加高亮描边、
         上面写清是哪一单带来的、旁边给「清空重填」。
         不然他一路点过去，上一位客人的手机号就被用到新客人身上了。 */
      var fromLast = ctFrom && contact.name === (lastCt || {}).name &&
        contact.phone === (lastCt || {}).phone;
      return (fromLast
        ? '<div class="ck-last"><b>已沿用上一单（' + d10(ctFrom) + '）的联系人信息</b>' +
          '　如非同一客户请重新填写　<a data-q="clr">清空重填</a></div>'
        : '') +
        '<div class="ck-quick">一键填充：' +
        '<a data-q="a0">同第一位办签人</a><a data-q="me">本人代收（销售）</a></div>' +
        '<div class="ck-g ck-g3' + (fromLast ? ' from-last' : '') + '">' +
        /* 属性名不能用 data-c —— 门户里 [data-c] 是「国家卡片」的跳转绑定，
           而 bkBind() 在这一页也会执行，于是点一下联系人输入框就被当成点了国家，
           整页跳去国家列表（唐美芳 2026-09-01：「填写订单联系人信息时，
           直接跳走到别的页面去了，无法直接填写」）。 */
        '<label class="f"><span>联系人姓名 <i>*</i></span><input data-cf="name" value="' +
        esc(contact.name) + '" placeholder="客户本人或家属"></label>' +
        '<label class="f"><span>联系电话 <i>*</i></span><input data-cf="phone" value="' +
        esc(contact.phone) + '" placeholder="用于接收补料与进度通知"></label>' +
        '<label class="f"><span>电子邮箱</span><input data-cf="email" type="email" value="' +
        esc(contact.email) + '" placeholder="用于接收出签结果通知"></label>' +
        '</div><div class="ck-tip">一单多人时，联系人不等同于第一位办签人：' +
        '如需客户本人接收通知，请填写客户信息；如由销售跟进，请填写销售本人信息。' +
        '不建议直接沿用上一单的默认值。</div>';
    }

    function submit(pr) {
      if (!depart) return toast('请先填写预计出行日期', true);
      if (!later) {
        if (!A.length) return toast('请先选择办签人', true);
        var bad = badCount();
        if (bad) return toast('还有 ' + bad + ' 位办签人的姓名、证件号或适用人群未填写', true);
      }
      if (!contact.name || !contact.phone) return toast('请填写联系人姓名与电话', true);
      api('/order/create', {
        sup_product_id: d.sup_product_id, pkg_id: pkgId, deal_price: pr,
        depart_date: depart,
        contact_name: contact.name, contact_phone: contact.phone, contact_email: contact.email,
        pax_later: later ? laterN : 0,
        applicants: later ? [] : A.map(function (a) {
          return {
            name_cn: a.name_cn, name_en: a.name_en, sex: a.sex, birth: a.birth,
            crowd: a.crowd, id_type: a.id_type, id_no: a.id_no, id_expiry: a.id_expiry,
            id_place: a.id_place, nation: a.nation, phone: a.phone
          };
        })
      }).then(function (r) {
        toast('订单 ' + r.no + ' 已创建，' + paxCount() + ' 人，¥' + money(r.amount));
        go('orders');
      }).catch(fail);
    }

    m.innerHTML = uzPage([['首页', ''], ['签证', 'visa']],
      '<div class="uz-crumb"><a data-bc="">首页</a><i>›</i><a data-bc="visa">签证</a><i>›</i>' +
      '<a data-bc="c-' + esc(p.country) + '">' + esc(p.country) + '签证</a><i>›</i>' +
      '<a data-pdx>产品详情</a><i>›</i><b>代客下单</b></div>' +

      '<div class="pdx-2c"><div class="pdx-main">' +

      /* 产品条：产品名 + 卖点 + 产品信息回看入口。和 C 端下单页第一屏同一个东西——
         销售最常被客人当场问住的就是「到底要交什么材料」，入口留在这一页，不用退回详情。 */
      '<div class="ck-prod"><div class="l"><em>' + esc(d.supplier) + '</em>' +
      '<b>' + esc(d.name) + '</b>' +
      (d.feature ? '<s>' + esc(d.feature) + '</s>' : '') + '</div>' +
      '<a class="ck-lk" data-info>产品信息：适用人群 · 办签材料 · 办理流程　查看 ›</a></div>' +

      /* 退改口径取后端 /order/cancel 的真实规则，和 C 端同一句话。销售当着客人的面念的就是这条。 */
      '<div class="ck-trust">订单支付前可直接取消；已支付的订单请提交退款申请，按已产生的官费与服务成本核减后退还余款。' +
      '</div>' +

      '<section class="uz-sec"><div class="uz-h"><h3>' +
      (d.packages.length === 1 ? '套餐' : '选择套餐') + '</h3>' +
      /* 客人模式下页面上根本没有结算价与毛利，这句提示就成了多余的一行
         （唐美芳 2026-09-08：「没必要露出的文案不需要展示」） */
      (pmSales() ? '<s>结算价与毛利仅门店销售可见</s>' : '') +
      '</div><div class="ck-pad">' + pkgHtml() + '</div></section>' +

      '<section class="uz-sec"><div class="uz-h"><h3>预计出行日期</h3>' +
      '<s>系统据此倒排办理进度并提示时效风险</s></div>' +
      '<div class="ck-pad" id="ck_date">' + dateHtml() + '</div></section>' +

      '<section class="uz-sec"><div class="uz-h"><h3>办签人</h3>' +
      '<s>姓名与证件信息须与护照原件一致</s></div>' +
      /* 老客户档案的选择已经收进「选择或更改办签人」面板，这一页不再单挂一个下拉
         （唐美芳 2026-09-01）。原来这里还挂着一段操作说明，与面板内的说明重复，
         2026-09-08 一并撤掉——「没必要露出的文案不需要展示」。 */
      '<div class="ck-pad">' +
      '<div id="ck_pax">' + paxHtml() + '</div></div></section>' +

      '<section class="uz-sec"><div class="uz-h"><h3>联系人</h3>' +
      '<s>补料通知与出签结果发送至此</s></div>' +
      '<div class="ck-pad" id="ck_ct">' + contactHtml() + '</div></section>' +

      /* 资料提交方式：C 端下单页有这一块，这一页原来没有，销售不知道该让客人怎么交材料。
         内容和 C 端一字不差，两端对客口径不能有第二个版本。 */
      '<section class="uz-sec"><div class="uz-h"><h3>资料提交方式</h3></div>' +
      '<div class="ck-pad"><div class="ck-way">' +
      '<div><b>电子材料</b><s>下单后在「客户材料」中逐项上传，由签证专员在线审核，' +
      '不合格将退回并说明原因；销售可代客上传。</s></div>' +
      '<div><b>原件邮寄</b><s>' + esc(d.mail_addr || '下单后由客服告知收件地址') + '</s></div>' +
      '</div></div></section>' +

      '</div><aside class="pdx-buy" id="ck_sum">' + sumHtml() + '</aside></div>', true);

    bkBind(m);
    $('[data-pdx]', m).onclick = function () { go('pdetail', d.sup_product_id); };
    $('[data-info]', m).onclick = infoModal;
    bindPkg(); bindDate(); bindPax(); bindContact(); bindSum();
    /* 电脑端不自动弹日历（唐美芳 2026-09-08：「csp 的不用先弹出预计出发日期控件，
       点击预计出行日期的日历控件再弹出」）。
       手机上一屏只放得下一件事，进页先弹日历是顺的；电脑端整张表一屏看得见，
       一进来就被弹层挡住反而打断填单。有米与 C 端仍保留自动弹出。 */
  });
};
