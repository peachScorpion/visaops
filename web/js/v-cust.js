/* C 端签证频道（H5）：首页 → 列表 → 详情 → 订单填写 → 签证订单 → 办理跟踪
   视觉对齐《TTY 签证 H5 设计图》：橙色主色、章节竖条、灰底标签、底部固定操作栏 */

/* 国家的展示素材（频道页大图 / 卡片图 / 国旗）全部由运营在
   UOM「国家展示配置」里维护，C 端从 /pub/home 一次取回填进 CCFG
   （唐美芳 2026-09-01：「都统一放在运营配置里吧」）。
   下面这两张表是内置兜底：新开的国家运营还没配图时不至于开天窗，
   配了就以配置为准。 */
var CIMG = {
  '美国': 'us', '日本': 'jp', '加拿大': 'ca', '英国': 'uk', '欧洲': 'eu',
  '澳大利亚': 'au', '新加坡': 'sg', '泰国': 'th', '马来西亚': 'my', '韩国': 'kr'
};
var DIMG = { '日本': 'jp', '韩国': 'kr', '新加坡': 'sg', '澳大利亚': 'au', '英国': 'uk', '美国': 'us' };
var CCFG = {};   // country → {hero, card, flag, intro}，由 /pub/home 填充
var CCFG_P = null;
var CCFG_FLOW = [];   // 平台默认办理流程，由 /pub/home 下发
/* 任何用到国家图的页面先调它。只拉一次，之后走缓存——
   首页、国家页、列表页、产品页各自独立进入时都要能拿到配置。 */
function ensureCcfg() {
  if (!CCFG_P) {
    CCFG_P = api('/pub/home').then(function (h) {
      Object.keys((h && h.countries) || {}).forEach(function (k) {
        CCFG[k] = Object.assign(CCFG[k] || {}, h.countries[k]);
      });
      if (h && h.default_flow && h.default_flow.length) CCFG_FLOW = h.default_flow;
      return h;
    }).catch(function () { return {}; });
  }
  return CCFG_P;
}

function cimg(country) { return 'img/c_' + (CIMG[country] || 'us') + '.jpg'; }
function ccfg(country, k) { return (CCFG[country] || {})[k] || ''; }
/* 国家频道页与产品页的大图 */
function dimg(country) {
  return ccfg(country, 'hero') ||
    (DIMG[country] ? 'img/dest/' + DIMG[country] + '.jpg' : cimg(country));
}
/* 首页与列表里的目的地卡片图。运营可以跟大图配成两张，配一张也行 */
function cardimg(country) { return ccfg(country, 'card') || dimg(country); }
/* 办理流程渲染 —— 竖排步骤条，三处共用（产品页页签 / 首页 / 下单页弹窗）。
   原来是固定 82px 的圆圈、一行三个，步骤名和说明都塞在圆里。
   流程改成后台可配之后，步数从 5 变成 1–8、文案长度也不再受控，
   圆圈立刻装不下，文字糊成一团（唐美芳 2026-09-01：「这个办理流程的展示样式
   怎么这样了，因为后台可配置，得扩展成可以灵活输入展示的内容了」）。
   竖排一行一步，标题与说明分开，多长都排得下。 */
function flowList(flow, compact) {
  var fl = (flow && flow.length) ? flow : FLOW_FALLBACK;
  return '<div class="h5-fl' + (compact ? ' sm' : '') + '">' + fl.map(function (x, i) {
    return '<div class="st"><i>' + (i + 1) + '</i>' +
      '<div class="tx"><b>' + esc(x.t) + '</b>' +
      (x.d && !compact ? '<s>' + esc(x.d) + '</s>' : '') + '</div></div>';
  }).join('') + '</div>';
}
/* 平台默认流程：由 /pub/home 下发（运营在 UOM「国家展示配置」里维护），
   接口还没回来时先用这份内置的，保证首屏不空。 */
var FLOW_FALLBACK = [
  { t: '下单办理', d: '填写办签信息并完成付款' },
  { t: '准备资料', d: '按清单交材料、填申请表' },
  { t: '资料审核', d: '专员复核后递交使领馆' },
  { t: '出签配还', d: '出结果并寄回护照与资料' },
  { t: '出发', d: '按行程出行' }
];

function fimg(country) {
  return ccfg(country, 'flag') || ('img/flag_' + (CIMG[country] || 'us') + '.png');
}

/* 出行目的：把签证归到客户心里的诉求上，不让客户去猜签证代码。
   2026-08-31 起产品带受控的 visa_cat（见 core.js VISA_CATS），优先用它——
   原来只能拿签证名做字符串匹配，「访客签证 600 类别」「标准访问签证」里
   一个关键词都没有，会被兜底成「旅游」，碰巧对了但不是算出来的。
   老数据没归类时仍退回字符串匹配。 */
var PURPOSE = [
  ['旅游', ['旅游', '观光', '自由行'], ['旅游']],
  ['商务', ['商务', 'B1', '贸易'], ['商务']],
  ['探亲访友', ['探亲', '访友', '亲属'], ['探亲访友']],
  ['工作/留学', ['工作', '劳务', '学生', '留学'], ['工作', '留学']],
  ['其他', [], ['EVUS登记更新', 'ESTA登记更新', '转移', '其他']]
];
function purposeOf(visaType, visaCat) {
  var i, k;
  if (visaCat) {
    for (i = 0; i < PURPOSE.length; i++) {
      if (PURPOSE[i][2].indexOf(visaCat) >= 0) return PURPOSE[i][0];
    }
    return '其他';
  }
  for (i = 0; i < PURPOSE.length; i++) {
    for (k = 0; k < PURPOSE[i][1].length; k++) {
      if (visaType.indexOf(PURPOSE[i][1][k]) >= 0) return PURPOSE[i][0];
    }
  }
  return '旅游';
}
var ENTRIES = { single: '单次入境', double: '两次入境', multi: '多次入境' };
/* 旧的写死流程常量已由 flowList() + 后台可配流程取代（2026-09-01） */

/* 洲际分区：Tab 名 → 国家序列（与携程/同程签证频道一致的找签方式） */
var CONT = [
  ['热门', ['日本', '韩国', '澳大利亚', '美国', '英国', '新加坡', '泰国', '加拿大']],
  ['亚洲', ['日本', '韩国', '新加坡', '泰国', '马来西亚']],
  ['欧洲', ['英国', '欧洲']],
  ['美洲', ['美国', '加拿大']],
  ['澳新非', ['澳大利亚']]
];
/* 首页金刚位：签证频道自己的功能入口，点进去都是本系统内的真实页面 */
var HOME_ENTRY = [
  ['家庭办签', 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1M16 5.2a3 3 0 0 1 0 5.6M21 20v-1a4 4 0 0 0-3-3.9', 'list'],
  ['材料清单', 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h6M10 16h4', 'list'],
  ['进度查询', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2', 'orders'],
  ['签证专员', 'M4 18a8 8 0 0 1 16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'service'],
  ['我的证件', 'M4 5h16v14H4zM8 10h.01M12 10h4M12 14h4M7 15c.6-1.4 2.4-1.4 3 0', 'me']
];
/* 出境服务：悠哉小程序其他频道承接，本次签证系统不含，点击给出明确说明 */
var OUTB = [['旅游保险', 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z'],
['全球购', 'M6 7h12l1 13H5zM9 7a3 3 0 0 1 6 0'],
['景点门票', 'M4 8V6h16v2a2 2 0 0 0 0 4v6H4v-6a2 2 0 0 0 0-4M10 6v12'],
['境外WiFi', 'M3 9a15 15 0 0 1 18 0M6.5 12.5a10 10 0 0 1 11 0M10 16a5 5 0 0 1 4 0M12 19h.01'],
['国际机票', 'M3 13l18-7-4 8 2 5-5-3-4 3v-4z']];
/* 服务承诺 */
var WHY = [
  ['材料预审', '专员按人群清单逐项预审，不合格当天发补料通知'],
  ['进度透明', '收料、审核、预约、递交、出签，每一步都有时间戳'],
  ['拒签退款', '拒签可申请退款，审批与出账在系统内留痕'],
  ['专人对接', '一单一位签证专员到底，不用反复复述情况']
];
/* 常见问题 */
var FAQ = [
  ['办签要多久？', '普通件通常 7–15 个工作日，加急件最快 3–5 个工作日，具体以所选套餐标注的办理时长为准。使领馆放号与审核速度会影响实际时间。'],
  ['需要本人去面签吗？', '美国、英国等目的地需本人到馆面试并录指纹。我司负责代填表、代缴官费、代约号，面试当天需您本人前往，专员会提前发送时间地点与面试辅导。'],
  ['材料怎么交？', '支持三种方式：电子件在小程序内上传、原件邮寄至指定收料地址、面试当天本人携带。每一项材料在清单里都会标明。'],
  ['拒签了钱能退吗？', '拒签可以申请退款。已经交给使领馆的官方签证费按各国规定不予退还，我们收取的服务费按实际办理进度扣减后退还剩余部分。'],
  ['为何各申请人的材料清单不一致？', '材料清单按办签人身份自动裁剪——在职人员、自由职业者、在校学生、退休人员、学龄前儿童各有一版，下单时按人群快照进订单，后续清单改版不影响已下单的客人。']
];

/* ---------- 小程序底部 TabBar ---------- */
/* 底部导航只留三个：首页找签、客服答疑、我的订单兜住所有「该我做了」的事。
   「签证产品」与首页的目的地入口重复；「我的」整页并进订单页，补料角标跟着挪过去，
   个人资料降级为订单页里的二级入口，避免客户漏看补料通知。 */
var TABBAR = [
  ['shop', '首页', 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5'],
  ['service', '客服', 'M4 13a8 8 0 1 1 16 0M4 13v3a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2Zm16 0v3a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2Z'],
  ['orders', '我的订单', 'M7 3h10v18l-5-3-5 3V3ZM9.5 8h5M9.5 12h5']
];
function svgIcon(path) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg>';
}
function tabbarHtml(cur) {
  return '<div class="ph-tab">' + TABBAR.map(function (t) {
    var b = t[0] === 'orders' && BADGE.supp ? '<em>' + BADGE.supp + '</em>' : '';
    return '<a data-tab="' + t[0] + '"' + (t[0] === cur ? ' class="on"' : '') + '>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="' + t[2] + '"/></svg>' + b +
      '<span>' + t[1] + '</span></a>';
  }).join('') + '</div>';
}

/* 展台上的目的地实拍：给整屏一个「图文结合」的底子，不再是一台手机悬在空白里 */
var DEST = [
  ['日本', 'jp', 'JAPAN', '东京 · 明治神宫'],
  ['韩国', 'kr', 'KOREA', '首尔 · 明洞'],
  ['新加坡', 'sg', 'SINGAPORE', '滨海湾'],
  ['澳大利亚', 'au', 'AUSTRALIA', '悉尼歌剧院'],
  ['英国', 'uk', 'UNITED KINGDOM', '伦敦 · 大本钟'],
  ['美国', 'us', 'UNITED STATES', '纽约 · 时报广场']
];
/* 沉浸模式左侧展台：整屏铺满的图文信息屏，右侧是真实小程序 */
function stageHtml(tipTitle, tipHtml) {
  return '<aside class="stage">' +
    '<div class="st-hero">' +
    '<div class="st-bg" style="background-image:url(img/dest/hero.jpg)"></div>' +
    '<div class="st-fg">' +
    '<div class="st-brand"><i>众</i><b>众信旅游 · 签证中心</b><em>VISA CENTER</em>' +
    '<a class="st-exit" href="#guide">退出体验 ›</a></div>' +
    '<h1>全球签证<br>一站办理</h1>' +
    '<p class="st-en">ONE PLATFORM FOR EVERY VISA</p>' +
    '<p class="st-lead">材料按人群自动裁剪 · 五个节点全程可查 · 持证专员在使领馆官方渠道人工递交</p>' +
    '<div class="st-kpi">' +
    '<div><b>6</b><s>覆盖目的地</s></div>' +
    '<div><b>5</b><s>进度节点</s></div>' +
    '<div><b>7×12</b><s>在线客服</s></div>' +
    '</div></div></div>' +
    '<div class="st-grid">' + DEST.map(function (d) {
      return '<a data-stc="' + esc(d[0]) + '" style="background-image:url(img/dest/' + d[1] + '.jpg)">' +
        '<span><b>' + esc(d[0]) + '签证</b><s>' + d[2] + ' · ' + esc(d[3]) + '</s></span></a>';
    }).join('') + '</div>' +
    '<div class="st-note"><h6>' + esc(tipTitle) + '</h6><p>' + tipHtml + '</p></div>' +
    '</aside>';
}

/* H5 手机壳：左侧图文展台 + 右侧真机模拟。tab 有值时渲染小程序底部导航 */
/* bodyCls='cardy' → 灰底 + 白卡浮起 + 卡片间留白（同程 / 携程那种事务页排版）。
   唐美芳 2026-08-31：「页面UI结构看起来不太规整，你能参考这种风格和排版吗，
   要规整一些的」，附同程订单详情截图。
   本文件后面有一批「取消卡片盒、改全宽白底 + 发丝线」的杂志风改造，
   那套适合首页、商城、产品详情这类内容页；填表、材料、订单详情这类
   一块一块的事务页，卡片分组更清楚。所以按页开关，不全局推翻。 */
function h5page(title, body, foot, tipTitle, tipHtml, back, tab, footCls, bodyCls) {
  var n = new Date();
  return '<div class="phone-wrap">' + stageHtml(tipTitle, tipHtml) +
    '<div class="phone' + (tab ? ' has-tab' : '') + '">' +
    '<div class="ph-bar"><span>' + n.getHours() + ':' + String(n.getMinutes()).padStart(2, '0') +
    '</span><span>众信旅游 · 签证</span></div>' +
    '<div class="ph-nav">' + (back ? '<span class="back" data-back>‹</span>' : '') + esc(title) + '</div>' +
    '<div class="ph-body h5' + (bodyCls ? ' ' + bodyCls : '') + '">' + body + '</div>' +
    (foot ? '<div class="ph-foot h5f' + (footCls ? ' ' + footCls : '') + '">' + foot + '</div>' : '') +
    (tab ? tabbarHtml(tab) : '') +
    '</div></div>';
}
/* 绑定底部导航（每个渲染完 h5page 的视图都要调一次） */
function h5bind(m) {
  $$('[data-tab]', m).forEach(function (a) {
    a.onclick = function () { if (!a.classList.contains('on')) go(a.dataset.tab); };
  });
}
function tagsOf(p) {
  return '<div class="h5-tags"><span>' + esc(ENTRIES[p.entries] || p.entries) + '</span>' +
    '<span>' + esc(p.valid) + '有效</span><span>可停留 ' + stayTx(p) + '</span>' +
    (p.need_interview ? '<span>需面试</span>' : '<span>免面试</span>') +
    (p.need_fingerprint ? '<span>需指纹</span>' : '') + '</div>';
}
function priceHtml(v, suffix) {
  return '<span class="h5-price"><i>¥</i>' + money(v) + (suffix === false ? '' : '<s>起</s>') + '</span>';
}

/* ---------- 首页 / 列表 / 详情 ---------- */
VIEWS['customer:shop'] = function (m, param) {
  if (param && param.indexOf('p-') === 0) return shopDetail(m, param.slice(2));
  if (param && param.indexOf('c-') === 0) return shopList(m, param.slice(2));
  /* 政策与产品一起取：客人打开签证频道最先问的往往是「现在还要不要签、免签几天」，
     这份内容由总部运营维护一次，B 端门户读的是同一个接口，两端口径不会打架。
     C 端读不到 scope='b' 的内部口径，后端按角色已经过滤过。 */
  /* 首页三块内容（轮播图 / 热门国家 / 热门产品）改成读 UOM「C 端首页配置」的数据，
     不再写死在这个文件里。取不到就退回原来的默认值，不让首页开天窗。
     （凯撒 PRD 4.12，唐美芳 2026-08-31 拍板补） */
  return Promise.all([api('/shop/products'), api('/shop/policies'), ensureCcfg()])
    .then(function (rr) {
    var j = rr[0], pols = rr[1].list.slice(0, 8), HC = rr[2] || {};
    var byC = {};
    j.list.forEach(function (p) {
      var lo = Math.min.apply(null, p.suppliers.map(function (x) { return x.price_min; }));
      if (!byC[p.country] || byC[p.country] > lo) byC[p.country] = lo;
    });
    var hot = [];
    j.list.forEach(function (p) {
      p.suppliers.forEach(function (s) { hot.push({ p: p, s: s }); });
    });
    hot.sort(function (a, b) { return a.s.price_min - b.s.price_min; });

    /* 头部数据条：四项全部取自系统真实数据或可兑现的服务承诺，不写通过率之类无法核验的指标 */
    var nCty = Object.keys(byC).length;
    var fastest = Math.min.apply(null, hot.map(function (x) { return x.s.lead_min; }));

    /* 精选产品卡：国旗 + 参数四宫格 + 费用拆分 */
    var feat = hot.slice(0, 4).map(function (x, i) {
      var pk = [['有效期', esc(x.p.valid)], ['停留期', stayTx(x.p)],
      ['入境次数', esc(ENTRIES[x.p.entries] || x.p.entries).replace('入境', '')],
      /* 办理时长给区间而不是最小值：下面的套餐行里最便宜那档往往是最慢的，
         头上写「7 个工作日」、行里写「15 个工作日」，自相矛盾（2026-09-07）。 */
      ['办理时长', (function () {
        var ds = (x.s.pkgs || []).map(function (k) { return k.lead_days; });
        var lo = ds.length ? Math.min.apply(null, ds) : x.s.lead_min;
        var hi = ds.length ? Math.max.apply(null, ds) : x.s.lead_min;
        return (lo === hi ? lo : lo + '~' + hi) + '个工作日';
      })()]];
      return '<div class="h5-fcard" data-p="' + x.s.sup_product_id + '">' +
        '<div class="hd"><i style="background-image:url(' + fimg(x.p.country) + ')"></i>' +
        '<div class="nm"><b>' + esc(x.p.country) + ' ' + esc(x.p.visa_type) + '</b>' +
        '<s>' + esc(x.p.submit_city) + ' · ' + esc(x.s.supplier) + ' · ' +
        x.s.pkg_count + ' 个套餐可选</s></div>' +
        (i === 0 ? '<em>热门</em>' : '') +
        '</div>' +
        '<div class="gd">' + pk.map(function (k) {
          return '<div><s>' + k[0] + '</s><b>' + k[1] + '</b></div>';
        }).join('') + '</div>' +
        '<div class="ft"><div class="pz"><s>' + esc(x.s.feature || '专员全程跟单') + '</s>' +
        '<div class="pr"><i>¥</i><b>' + money(x.s.price_min) + '</b><u>/人起</u></div></div>' +
        '<button class="go">立即办理 ›</button></div></div>';
    }).join('');

    /* 热门目的地的分组与国家来自「C 端首页配置」；一条都没配才退回代码里的默认 CONT */
    var CONT2 = (function () {
      var cs = HC.country || [];
      if (!cs.length) return CONT;
      var byG = {};
      cs.forEach(function (r) {
        var g = r.grp || '热门';
        (byG[g] = byG[g] || []).push(r.title);
        if (r.img) { CCFG[r.title] = CCFG[r.title] || {}; CCFG[r.title].card = r.img; }
      });
      /* 分组顺序取后端给的业务顺序（热门在最前），不按接口返回的先后——
         接口是 order by grp 的字母序，直接用会排成「亚洲 / 澳新非 / 热门」 */
      var gs = (HC.groups || []).filter(function (g) { return byG[g]; });
      Object.keys(byG).forEach(function (g) { if (gs.indexOf(g) < 0) gs.push(g); });
      return gs.map(function (g) { return [g, byG[g]]; });
    })();

    /* 目的地长卡：大图 3:4 横滑，一屏能看到三个半——用图片本身建立层级，
       而不是把八个等大方块塞进宫格。未开放的目的地灰化但保留，说明覆盖计划。 */
    function destRail(cs, isHot) {
      var on = cs.filter(function (c) { return byC[c] !== undefined; });
      var off = cs.filter(function (c) { return byC[c] === undefined; });
      cs = on.concat(isHot ? off.slice(0, 8 - on.length) : off);
      return cs.map(function (cn) {
        var ok = byC[cn] !== undefined;
        return '<a class="ed-c' + (ok ? '' : ' off') + '"' +
          (ok ? ' data-c="' + esc(cn) + '"' : '') +
          ' style="background-image:url(' + cardimg(cn) + ')">' +
          '<div class="tx"><b>' + esc(cn) + '</b>' +
          (ok ? '<s>¥' + money(byC[cn]) + ' 起</s>' : '<s class="off">覆盖中</s>') +
          '</div></a>';
      }).join('');
    }

    /* 轮播图取配置里第一张启用的；没配就退回原来那张头图，首页不会开天窗 */
    var BN = (HC.banner || [])[0] || {
      title: '去哪儿\n就办哪儿的签证', img: 'img/dest/uk2.jpg', link_kind: 'none'
    };
    var body =
      '<div class="ed-hero" data-bn="' + esc(BN.link_kind || 'none') + '"' +
      ' data-bv="' + esc(BN.link_val || '') + '"' +
      ' style="background-image:url(' + esc(BN.img || 'img/dest/uk2.jpg') + ')">' +
      /* 首页是底部 Tab 的根页面，没有上一级可回，所以不画返回箭头；
         真要退出签证频道，由宿主小程序的胶囊按钮承担，不由页面自己画 */
      '<div class="ed-nav">' +
      '<a class="sch" data-k="list"><i></i><span>搜索国家 / 地区</span></a>' +
      '<a class="ic" data-k="service">' + svgIcon('M8 10h8M8 14h5M4 5h16v12H9l-5 4z') + '</a>' +
      '<a class="ic" data-k="orders">' + svgIcon('M6 3h12l2 18H4zM9 7a3 3 0 0 0 6 0') + '</a>' +
      '</div>' +
      '<div class="ed-tx"><s>ZHONGXIN VISA</s>' +
      '<h1>' + esc(BN.title || '').replace(/\n/g, '<br>') + '</h1>' +
      '<p>' + esc(BN.subtitle || ('覆盖 ' + nCty + ' 个国家/地区 · ' + hot.length +
        ' 款产品在售 · 最快 ' + fastest + ' 个工作日出签')) + '</p></div>' +
      '</div>' +

      '<section class="ed-sec">' +
      '<div class="ed-h"><h2>热门目的地</h2><a data-k="list">全部目的地 <i>→</i></a></div>' +
      '<div class="ed-tabs">' + CONT2.map(function (c, i) {
        return '<a data-ct="' + i + '"' + (i === 0 ? ' class="on"' : '') + '>' + c[0] + '</a>';
      }).join('') + '</div>' +
      '<div class="ed-rail">' + destRail(CONT2[0][1], true) + '</div>' +
      '</section>' +

      (pols.length ? '<section class="ed-sec">' +
        '<div class="ed-h"><h2>签证政策</h2><a class="mut">总部运营维护 · 注明来源</a></div>' +
        polRail(pols) + '</section>' : '') +

      '<div class="ed-trust">' + [['材料清单', '按人群逐项裁剪'], ['价格', '零售价直出无加价'],
        ['隐私', '证件仅本人可见'], ['退款', '含保障套餐拒签可退']].map(function (t) {
        return '<div><b>' + t[0] + '</b><s>' + t[1] + '</s></div>';
      }).join('') + '</div>' +

      '<section class="ed-sec">' +
      '<div class="ed-h"><h2>您可能需要</h2></div>' +
      '<div class="ed-entry">' + HOME_ENTRY.map(function (q) {
        return '<a data-k="' + q[2] + '"><i>' + svgIcon(q[1]) + '</i><s>' + q[0] + '</s></a>';
      }).join('') + '</div>' +
      '</section>' +

      '<a class="ed-ban" data-k="list" style="background-image:url(img/dest/hero.jpg)">' +
      '<div class="tx"><s>VISA SERVICE</s><b>办签证<br>来众信</b>' +
      '<em>持证专员全程代办 · 进度节点可查</em></div></a>' +

      '<section class="ed-sec ed-outb"><div class="ed-h"><h2>出境服务</h2>' +
      '<a class="mut">悠哉小程序其他频道承接</a></div>' +
      '<div class="ed-entry">' + OUTB.map(function (o) {
        return '<a data-outb="' + esc(o[0]) + '"><i>' + svgIcon(o[1]) + '</i><s>' +
          o[0] + '</s></a>';
      }).join('') + '</div></section>' +

      '<div class="h5-sheet">' +
      '<div class="h5-sh"><b>热门签证产品</b><em>FEATURED</em><s data-k="list">查看全部 ›</s></div>' +
      '<div class="h5-feat">' + feat + '</div>' +
      '<div class="h5-sh"><b>为什么选择我们</b><em>SERVICE</em></div>' +
      '<div class="h5-why">' + WHY.map(function (w, i) {
        return '<div><i>' + (i + 1) + '</i><div><b>' + w[0] + '</b><s>' + esc(w[1]) + '</s></div></div>';
      }).join('') + '</div>' +
      '<div class="h5-sh"><b>办理流程</b><em>PROCESS</em></div>' +
      /* 首页这一段展示的是平台默认流程，运营在 UOM 里改完这里跟着变 */
      flowList(HC.default_flow) +
      '<div class="h5-sh"><b>常见问题</b><em>FAQ</em>' +
      '<s data-k="service">问客服 ›</s></div>' +
      '<div class="h5-faq">' + FAQ.map(function (q, i) {
        return '<div class="h5-mat" data-q="' + i + '"><div class="hd"><span class="nm">' +
          '<b>' + esc(q[0]) + '</b></span><span class="rt"><em>⌄</em></span></div>' +
          '<div class="bd">' + esc(q[1]) + '</div></div>';
      }).join('') + '</div>' +
      '<div class="h5-tip">入境次数、有效期及停留天数最终以使领馆签发为准</div>' +
      '<div class="h5-brand">众信旅游 · 签证中心<s>提交、缴费、抢号、递交、采指纹由持证专员在使领馆官方渠道人工办理</s></div>' +
      '</div>';

    m.innerHTML = pageH('签证频道 · 首页',
      '客户入口，形态即小程序：底部五个 Tab 常驻（首页 / 签证产品 / 客服 / 我的订单 / 我的）。' +
      '信息结构对齐主流 OTA 签证频道的找签路径，视觉语言自成一套：沉浸式实拍头图叠悬浮搜索、' +
      '洲际页签下的大图横滑目的地长卡（直出该国最低零售价）、发丝线分栏的服务保障条、' +
      '功能入口、出境服务位、运营 Banner，再向下是精选产品、服务承诺、办理流程与常见问题。' +
      '覆盖国家数、在售款数、最快出签时长与国家起价均由系统实时汇总，不写通过率之类无法核验的指标。') +
      h5page('签证', body, '', '这一步在做什么',
        '客户按目的地挑签证。<b>一个平台产品下可挂多个供应商产品</b>，价格与时效各不相同，' +
        '进入国家列表页即可横向比价。产品名称统一遵循「送签地 + 国家 + 签证类型」的命名规则。' +
        '该频道设计为可整体嵌入悠哉小程序的一个金刚位，进入后即为独立的签证 Tab 应用。',
        false, 'shop');
    function bindC() {
      $$('[data-c]', m).forEach(function (el) {
        el.onclick = function () { go('shop', 'c-' + el.dataset.c); };
      });
    }
    bindC();
    polBind(m, pols);
    $$('[data-ct]', m).forEach(function (a) {
      a.onclick = function () {
        $$('[data-ct]', m).forEach(function (x) { x.classList.remove('on'); });
        a.classList.add('on');
        $('.ed-rail', m).innerHTML = destRail(CONT2[+a.dataset.ct][1], +a.dataset.ct === 0);
        $('.ed-rail', m).scrollLeft = 0;
        bindC();
      };
    });
    /* 轮播图点击跳转：按配置的 link_kind 决定去哪 */
    (function () {
      var hero = $('.ed-hero', m);
      if (!hero) return;
      var k = hero.dataset.bn, v = hero.dataset.bv;
      if (!k || k === 'none') return;
      hero.style.cursor = 'pointer';
      hero.onclick = function (e) {
        if (e.target.closest('.ed-nav')) return;   // 顶部搜索/客服/订单图标各走各的
        if (k === 'list') go('list');
        else if (k === 'country' && v) go('shop', 'c-' + v);
        else if (k === 'product' && v) go('shop', 'p-' + v);
      };
    })();
    $$('[data-outb]', m).forEach(function (el) {
      el.onclick = function () {
        toast('「' + el.dataset.outb + '」由悠哉小程序其他频道承接，不在本次签证系统范围内', true);
      };
    });
    $$('[data-p]', m).forEach(function (el) {
      el.onclick = function () { go('shop', 'p-' + el.dataset.p); };
    });
    $$('[data-k]', m).forEach(function (el) {
      el.onclick = function () {
        var k = el.dataset.k;
        if (k.indexOf('c-') === 0) go('shop', k);
        else go(k);
      };
    });
    $$('[data-q]', m).forEach(function (el) {
      el.onclick = function () { el.classList.toggle('open'); };
    });
    h5bind(m);
  });
};

function shopList(m, country) {
  return Promise.all([api('/shop/products?country=' + encodeURIComponent(country)),
                      ensureCcfg()]).then(function (rr) {
    var j = rr[0];
    /* 一个国家下可能有多个签证类型（旅游/商务/探亲）× 多家供应商，
       每个组合是一张「签证类型卡」，选中后再看它下面的套餐。 */
    var cards = [];
    j.list.forEach(function (p) {
      p.suppliers.forEach(function (s) {
        cards.push({ p: p, s: s, id: s.sup_product_id, purpose: purposeOf(p.visa_type, p.visa_cat) });
      });
    });
    if (!cards.length) {
      m.innerHTML = pageH(country + '签证', '该目的地暂无在售产品。') +
        h5page(country + '签证', '<div class="h5-empty">该目的地暂无在售产品</div>', '',
          '这一步在做什么', '客户端只展示供应商勾选了「上架 C 端」的产品。', true);
      $('[data-back]', m).onclick = function () { go('shop'); };
      return;
    }

    var purposes = [];
    cards.forEach(function (c) { if (purposes.indexOf(c.purpose) < 0) purposes.push(c.purpose); });
    var pur = purposes[0];
    var curId = cards[0].id;
    var region = cards[0].p.submit_city;
    var pkCache = {};
    var filt = {};

    /* 选中类型的占比：用在售套餐数做权重，是系统内可核算的数，不编「XX% 用户选择」 */
    function share(c) {
      var tot = cards.reduce(function (n, x) { return n + x.s.pkg_count; }, 0);
      return Math.round(c.s.pkg_count / tot * 100);
    }

    function loadPk(id) {
      if (pkCache[id]) return Promise.resolve(pkCache[id]);
      return api('/shop/product?id=' + id).then(function (d) { pkCache[id] = d; return d; });
    }

    function heroHtml() {
      var inPur = cards.filter(function (c) { return c.purpose === pur; });
      var lo = Math.min.apply(null, cards.map(function (c) { return c.s.price_min; }));
      var fast = Math.min.apply(null, cards.map(function (c) { return c.s.lead_min; }));
      var regions = [];
      cards.forEach(function (c) {
        if (regions.indexOf(c.p.submit_city) < 0) regions.push(c.p.submit_city);
      });
      return '<div class="dp-hero" style="background-image:url(' + dimg(country) + ')">' +
        '<div class="dp-mask"></div>' +
        '<div class="dp-nav"><span class="bk" data-back2>‹</span>' +
        '<a class="ic" data-hm>' + svgIcon('M3 11 12 3l9 8M6 10v10h12V10') + '</a></div>' +
        '<div class="dp-htx">' +
        '<div class="dp-r1"><h1>' + esc(country) + '</h1>' +
        '<a class="dp-reg" data-reg>受理领区 · ' + esc(region) + ' <em>⌄</em></a></div>' +
        '<p class="dp-sub">' + cards.length + ' 款在售 · 最快 ' + fast +
        ' 个工作日出签 · ¥' + money(lo) + ' 起 · 覆盖 ' + regions.length + ' 个送签地</p>' +
        '</div>' +
        '<div class="dp-anchor">' + ['申请说明', '签证类型', '办签材料', '办理时长', '常见问题']
          .map(function (a, i) {
            return '<a data-an="' + i + '">' + a + '</a>';
          }).join('') + '</div>' +
        '</div>' + svcBar(cards.filter(function (c) { return c.id === curId; })[0]);
    }

    /* 服务保障：原来这里是写死的「订后赠」三句话，跟这条产品实际提供什么无关。
       订后赠整条撤掉——签证是资质类交付，送东西的话术反而削弱可信度；
       服务保障提到首屏，内容改成后端按「免面签（真实数据推）+ 供应商勾选
       + 平台统一项」合成的 svc，供应商在 UBK 上品时能自己配。 */
    function svcBar(c) {
      var list = (c && c.s && c.s.svc) || [];
      if (!list.length) return '';
      return '<div class="dp-svc top"><span>服务保障</span>' + list.map(function (t) {
        return '<em>' + esc(t) + '</em>';
      }).join('') + '</div>';
    }

    function typeHtml() {
      var inPur = cards.filter(function (c) { return c.purpose === pur; });
      return '<div class="dp-purpose">' + purposes.map(function (x) {
        return '<a data-pu="' + esc(x) + '"' + (x === pur ? ' class="on"' : '') + '>' + esc(x) + '</a>';
      }).join('') + '</div>' +
        '<div class="dp-types">' + inPur.map(function (c) {
          var sh = share(c);
          return '<a class="dp-tc' + (c.id === curId ? ' on' : '') + '" data-tc="' + c.id + '">' +
            (sh >= 20 ? '<em class="hot">' + sh + '% 选择</em>' : '') +
            '<b>' + esc(c.p.valid) + esc((ENTRIES[c.p.entries] || '').replace('入境', '')) + '</b>' +
            '<u>¥' + money(c.s.price_min) + '<s>起</s></u>' +
            '<i class="ck"></i></a>';
        }).join('') + '</div>';
    }

    function specHtml() {
      var c = cards.filter(function (x) { return x.id === curId; })[0];
      var p = c.p;
      return '<div class="dp-spec">' +
        '<a class="dp-scope pre-wrap" data-scope>' + esc(richText(p.accept_note) || ('受理范围：' + p.submit_city + '领区，以使领馆公告为准')) +
        ' <em>›</em></a>' +
        '<div class="dp-attr">' +
        '<span class="ic-e">' + esc(ENTRIES[p.entries] || p.entries) + '</span>' +
        '<span class="ic-d">停留 ' + stayTx(p) + '</span>' +
        '<span class="ic-v">' + esc(p.valid) + '有效期</span>' +
        '<span class="ic-f">' + (p.need_interview ? '需本人面试' : '免面试') + '</span>' +
        '</div></div>';
    }

    function pkgHtml(d) {
      var c = cards.filter(function (x) { return x.id === curId; })[0];
      var mats = (d.checklist && d.checklist.job || []).length;
      var pks = d.packages.slice(0);
      if (filt.fast) pks = pks.filter(function (k) { return k.lead_days <= 7; });
      pks.sort(function (a, b) { return a.suggest_retail - b.suggest_retail; });
      var chips = [['fast', '7 个工作日内']];
      var head = '<div class="dp-filt">' + chips.map(function (x) {
        return '<a data-fl="' + x[0] + '"' + (filt[x[0]] ? ' class="on"' : '') + '>' + x[1] + '</a>';
      }).join('') + '<span class="dp-cnt">' + pks.length + ' 个套餐</span></div>';
      var body = pks.map(function (k, i) {
        var ready = new Date(Date.now() + (k.lead_days + 3) * 864e5);
        return '<div class="dp-pk" data-pk="' + k.id + '">' +
          (i === 0 ? '<div class="dp-pkhot">近 30 天预订最多</div>' : '') +
          '<div class="dp-pkh"><b>' + esc(k.name) + '</b>' +
          '</div>' +
          '<div class="dp-pkm"><span><b>' + mats + '</b> 项材料</span>' +
          '<span><b>' + k.lead_days + '</b> 个工作日</span>' +
          '<a class="dp-pkd" data-pd="' + k.id + '">查看材料清单 ›</a></div>' +
          '<div class="dp-pkf"><div class="l">' +
          '<s>最早 ' + (ready.getMonth() + 1) + ' 月 ' + ready.getDate() + ' 日可送签</s>' +
          '<i>' + esc(c.s.supplier) + ' 供货 · 专员全程跟单</i></div>' +
          '<div class="r"><div class="pr"><i>¥</i><b>' + money(k.suggest_retail) + '</b><u>起</u></div>' +
          '<button class="dp-buy" data-buy="' + k.id + '">订</button></div></div>' +
          '<div class="dp-pkn">下单后 1 小时内由持证专员致电确认材料</div>' +
          '</div>';
      }).join('') || '<div class="h5-empty">没有符合筛选条件的套餐</div>';
      return head + '<div class="dp-pks">' + body + '</div>';
    }

    function draw() {
      loadPk(curId).then(function (d) {
        $('.ph-body', m).innerHTML = heroHtml() +
          '<div class="dp-sheet">' + typeHtml() + specHtml() + pkgHtml(d) + '</div>';
        bind(d);
      });
    }

    function bind(d) {
      $$('[data-pu]', m).forEach(function (a) {
        a.onclick = function () {
          pur = a.dataset.pu;
          var first = cards.filter(function (c) { return c.purpose === pur; })[0];
          if (first) curId = first.id;
          draw();
        };
      });
      $$('[data-tc]', m).forEach(function (a) {
        a.onclick = function () { curId = +a.dataset.tc; draw(); };
      });
      $$('[data-fl]', m).forEach(function (a) {
        a.onclick = function () { filt[a.dataset.fl] = !filt[a.dataset.fl]; draw(); };
      });
      var rg = $('[data-reg]', m);
      if (rg) rg.onclick = function () {
        var regions = [];
        cards.forEach(function (c) {
          if (regions.indexOf(c.p.submit_city) < 0) regions.push(c.p.submit_city);
        });
        ask('选择受理领区', [
          { type: 'html', html: '<div class="note">领区按户籍或居住地划分，不同领区受理的使领馆不同，材料要求与时效也可能不同。</div><br>' },
          { k: 'region', label: '户籍或居住地', type: 'select',
            options: regions, value: region }
        ], '确定').then(function (f) {
          region = f.region;
          var hit = cards.filter(function (c) { return c.p.submit_city === region; })[0];
          if (hit) { pur = hit.purpose; curId = hit.id; }
          draw();
        }).catch(function () { });
      };
      var sc = $('[data-scope]', m);
      if (sc) sc.onclick = function () {
        var c = cards.filter(function (x) { return x.id === curId; })[0];
        modal('受理范围说明',
          '<div class="kv"><dt>签证类型</dt><dd>' + esc(c.p.visa_type) + '</dd>' +
          '<dt>送签地</dt><dd>' + esc(c.p.submit_city) + '</dd>' +
          '<dt>入境次数</dt><dd>' + esc(ENTRIES[c.p.entries] || c.p.entries) + '</dd>' +
          '<dt>停留时间</dt><dd>' + stayTx(c.p) + '</dd>' +
          '<dt>有效期</dt><dd>' + esc(c.p.valid) + '</dd>' +
          '<dt>是否面试</dt><dd>' + (c.p.need_interview ? '需本人到馆面试' : '免面试') + '</dd>' +
          '<dt>是否录指纹</dt><dd>' + (c.p.need_fingerprint ? '需本人到场采集' : '无需') + '</dd>' +
          '<dt>受理范围</dt><dd class="rich-view">' + (richView(c.p.accept_note) || '以使领馆当期公告为准') + '</dd></div>' +
          '<div class="note">有效期、入境次数、停留时间最终以使领馆签发为准。</div>');
      };
      $$('[data-pd]', m).forEach(function (a) {
        a.onclick = function (e) { e.stopPropagation(); go('shop', 'p-' + curId); };
      });
      $$('[data-buy]', m).forEach(function (a) {
        a.onclick = function (e) { e.stopPropagation(); orderPage(m, d, +a.dataset.buy); };
      });
      $$('[data-pk]', m).forEach(function (a) {
        a.onclick = function () { go('shop', 'p-' + curId); };
      });
      $$('[data-an]', m).forEach(function (a) {
        a.onclick = function () { go('shop', 'p-' + curId); };
      });
      $$('[data-back2],[data-hm]', m).forEach(function (a) {
        a.onclick = function () { go('shop'); };
      });
    }

    m.innerHTML = pageH(country + '签证 · 商品页',
      '客户先按<b>出行目的</b>收窄，再选<b>签证类型</b>（有效期 + 入境次数），最后比<b>套餐</b>（时效、服务档位、价格）。' +
      '领区由户籍或居住地决定，切换领区会连带切换可售产品——这是签证区别于普通旅游商品的核心约束。') +
      h5page(country + '签证', '', '', '这一步在做什么',
        '同一国家下可能有多家供应商供货，结算价与时效不同；客户看到的是渠道零售价，' +
        '<b>看不到结算价与供应商成本结构</b>。套餐层承载服务档位与时效的差异。', true);
    $('[data-back]', m).onclick = function () { go('shop'); };
    draw();
  });
}

/* 列表卡上的套餐行点进来时，要停在他点的那个套餐上，
   不能又回到默认第一个——那样等于让人再选一次（唐美芳 2026-09-07）。 */
function shopDetail(m, spid) {
  return Promise.all([api('/shop/product?id=' + spid), ensureCcfg()]).then(function (rr) {
    var d = rr[0];
    var want = S.cache.cPkg; S.cache.cPkg = null;
    var crowd = 'job', showAll = false, openMat = {};
    var pkgId = d.packages.some(function (k) { return k.id === want; })
      ? want : (d.packages[0] || {}).id;
    var PVT = [['base', '基本信息'], ['mat', '所需材料'], ['flow', '办理流程'], ['faq', '常见问题']];
    var p = d.product;

    function matsHtml() {
      var list = d.checklist[crowd] || [];
      function grp(nec, label) {
        var sub = list.filter(function (i) { return i.necessity === nec; });
        if (!sub.length) return '';
        return '<div class="h5-mgrp"><span>' + label + '</span><em>' + sub.length + ' 项</em></div>' +
          sub.map(function (i) {
            var k = nec + i.id;
            return '<div class="h5-mat' + (openMat[k] ? ' open' : '') + '" data-m="' + k + '">' +
              '<div class="hd"><span class="nm"><b>' + esc(i.mat_name) + '</b><s>' +
              esc(i.attr_text) + ' × ' + i.copies + ' · ' + esc(i.way_text) + '</s></span>' +
              '<span class="rt">' + (i.sample ? '<u class="smp-f">有样例</u>' : '') + '<em>⌄</em></span></div>' +
              '<div class="bd">' + esc(i.require_text || '按使领馆要求提供') +
              (i.sample ? '<div style="margin-top:9px">' + sampleBtn(i, 'h5-btn') + '</div>' : '') +
              '</div></div>';
          }).join('');
      }
      return '<div class="h5-crowd">' +
        [['job', '在职人员'], ['retire', '退休人员'], ['free', '自由职业者'],
        ['student', '在校学生'], ['child', '学龄前儿童']].map(function (x) {
          return '<a data-cw="' + x[0] + '" class="' + (crowd === x[0] ? 'on' : '') + '">' + x[1] + '</a>';
        }).join('') + '</div>' + grp('must', '必须材料') + grp('suggest', '建议材料') +
        '<div class="h5-mail"><button data-mail>导出这份材料清单</button></div>';
    }

    function tabHtml(tab) {
      if (tab === 'mat') return matsHtml();
      /* 国家页顶部锚点里有「常见问题」，点进来却没有这一块，锚点是空的。
         FAQ 是全平台统一口径（由运营维护），不按产品分，所以直接复用首页那份。 */
      if (tab === 'faq') return '<div class="pv-faq">' + FAQ.map(function (f) {
        return '<div><b>' + esc(f[0]) + '</b><p>' + esc(f[1]) + '</p></div>';
      }).join('') + '</div>';
      /* 供应商在产品里配了流程就用它，没配才回落到平台默认 5 步
         （唐美芳 2026-09-01：「少一个办理流程的配置」）。
         不同签证流程本来就不一样——电子签没有面签这一步。 */
      if (tab === 'flow') return flowList(d.flow);
      return '<div class="h5-kv">' +
        '<div><i>有效期</i><b>' + esc(validTx(p)) + '</b></div>' +
        '<div><i>入境次数</i><b>' + esc((ENTRIES[p.entries] || '').replace('入境', '')) + '</b></div>' +
        '<div><i>停留时间</i><b>' + stayTx(p) + '</b></div>' +
        '<div><i>是否面试</i><b>' + (p.need_interview ? '是' : '否') + '</b></div>' +
        '<div><i>是否录指纹</i><b>' + (p.need_fingerprint ? '是' : '否') + '</b></div>' +
        '<div><i>签证类型</i><b style="font-size:11.5px">' + esc(p.visa_type) + '</b></div></div>' +
        '<div class="h5-note"><b>受理范围说明</b><div class="rich-view">' + richView(p.accept_note) + '</div></div>' +
        '<div class="h5-note"><b>资料邮寄地址</b>' + esc(d.mail_addr || '下单后由客服告知') + '</div>' +
        '<div class="h5-tip">有效期、入境次数、停留时间最终以使领馆签发为准</div>';
    }

    function draw() {
      /* 换套餐 / 换人群会重绘整屏，不保位置的话客人会被弹回头图 */
      var kb = $('.ph-body', m), keep = kb ? kb.scrollTop : 0;
      var pks = showAll ? d.packages : d.packages.slice(0, 3);
      var lo = Math.min.apply(null, d.packages.map(function (k) { return k.suggest_retail; }));
      var hi = Math.max.apply(null, d.packages.map(function (k) { return k.suggest_retail; }));
      var cur = d.packages.filter(function (k) { return k.id === pkgId; })[0] || {};
      $('.ph-body', m).innerHTML =
        /* 沉浸式头图与首页、国家页同一套语言：实拍大图压深色渐变，
           签证类型做大字标题，起价与关键属性直接叠在图上，不再另起一个白色标题块。 */
        /* 头图优先用供应商在 UBK 上品时传的那张；没传才回落到国家默认风景图
           （唐美芳 2026-09-01：「前端是有展示产品头图的，但是 ubk 上品的时候
           没有上传图片的位置」）。 */
        '<div class="pv-hero" style="background-image:url(' +
        esc(d.hero_img || dimg(p.country)) + ')">' +
        '<div class="pv-nav"><span class="bk" data-back3>‹</span>' +
        '<a class="ic" data-hm3>' + svgIcon('M3 11 12 3l9 8M6 10v10h12V10') + '</a></div>' +
        '<div class="pv-tx"><s>' + esc(p.country) + ' · ' + esc(p.submit_city) + '</s>' +
        '<h1>' + esc(p.visa_type) + '</h1>' +
        '<div class="pv-price"><i>¥</i><b>' + money(lo) + '</b>' +
        (hi > lo ? '<u>- ¥' + money(hi) + '</u>' : '<u> 起 / 人</u>') + '</div>' +
        '<div class="pv-cz"><span>' + esc(ENTRIES[p.entries] || p.entries) + '</span>' +
        '<span>' + (p.need_interview ? '需本人面试' : '免面试') + '</span>' +
        '<span>停留 ' + stayTx(p) + '</span></div>' +
        '</div></div>' +

        '<div class="pv-name"><b>' + esc(d.name) + '</b>' +
        '<div class="cz"><span>电子材料上传</span><span>1V1 材料指导</span>' +
        '<span>进度节点同步</span></div></div>' +

        '<div class="pv-svc">' + [['材料', '按人群逐项裁剪'], ['价格', '零售价直出无加价'],
          ['进度', '五个节点可查'], ['供应商', d.supplier]].map(function (t) {
            return '<div><b>' + esc(t[0]) + '</b><s>' + esc(t[1]) + '</s></div>';
          }).join('') + '</div>' +

        (d.feature ? '<section class="pv-sec"><div class="pv-h"><h2>产品特色</h2></div>' +
          '<div class="pv-body">' + esc(d.feature) + '</div></section>' : '') +

        '<section class="pv-sec"><div class="pv-h"><h2>选择套餐</h2>' +
        '<a class="mut">' + d.packages.length + ' 个</a></div>' +
        '<div class="pv-pks">' + pks.map(function (k) {
          return '<div class="pv-pk' + (k.id === pkgId ? ' on' : '') + '" data-k="' + k.id + '">' +
            '<div class="r1"><b>' + esc(k.name) + '</b>' +
            '<span class="amt">¥' + money(k.suggest_retail) + '</span></div>' +
            '<div class="r2">办理时长约 ' + k.lead_days + ' 个工作日</div>' +
            /* 预订须知是富文本，可能很长（供应商从官网整段粘过来的）。
               直接铺开会把下面的产品说明、材料清单整个顶出屏幕
               （唐美芳 2026-09-01：「所有的内容都展开展示了，下面的内容都看不见了，
               是不是应该收起，然后子弹窗展示」）。这里只留一行入口，点开弹窗看全文。 */
            (k.id === pkgId && k.book_notice
              ? '<div class="r3"><a class="pv-nt" data-nt="' + k.id + '">预订须知' +
                '<s>' + esc(rvBrief(k.book_notice, 26)) + '</s><i>›</i></a></div>' : '') +
            '</div>';
        }).join('') + '</div>' +
        (d.packages.length > 3 && !showAll ?
          '<div class="pv-more" data-all>展开其余 ' + (d.packages.length - 3) + ' 个套餐 ﹀</div>' : '') +
        '</section>' +

        /* 四块内容全部铺开，页签改成吸顶锚点（唐美芳 2026-08-27：C 端也一样，
           要能一路往下滑看见，不能只有点一下才换）。手机上客人本来就是往下刷的，
           点击换页签会把已经读过的位置弄丢。 */
        '<section class="pv-sec"><div class="pv-h"><h2>产品详细说明</h2></div>' +
        '<div class="pv-tabs sticky">' + PVT.map(function (x) {
          return '<a data-t="' + x[0] + '">' + x[1] + '</a>';
        }).join('') + '</div>' + PVT.map(function (x) {
          return '<div class="pv-anc" id="pva-' + x[0] + '">' +
            '<div class="pv-anch">' + esc(x[1]) + '</div>' + tabHtml(x[0]) + '</div>';
        }).join('') + '</section>';
      $('.ph-foot', m).innerHTML = '<div class="sv">在线客服</div>' +
        '<button class="cta" data-book>立即预定 ¥' + money(cur.suggest_retail || 0) + '</button>';

      $$('[data-k]', m).forEach(function (el) {
        el.onclick = function (e) {
          if (e.target.closest('[data-nt]')) return;   // 点的是「预订须知」入口
          pkgId = +el.dataset.k; draw();
        };
      });
      /* 预订须知全文：弹窗看，不在卡片里铺开 */
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
      $$('[data-back3]', m).forEach(function (a) {
        a.onclick = function () { history.back(); };
      });
      $$('[data-hm3]', m).forEach(function (a) {
        a.onclick = function () { go('shop'); };
      });
      /* 锚点导航：.ph-body 就是手机屏的滚动容器，spy 挂在它身上 */
      var sc = $('.ph-body', m), navs = $$('[data-t]', m);
      var ancs = PVT.map(function (x) { return $('#pva-' + x[0], m); });
      function spy() {
        var line = sc.getBoundingClientRect().top + 74, cu = 0;
        ancs.forEach(function (s, i) {
          if (s && s.getBoundingClientRect().top <= line) cu = i;
        });
        navs.forEach(function (a, i) { a.className = i === cu ? 'on' : ''; });
      }
      navs.forEach(function (a, i) {
        a.onclick = function () {
          var s = ancs[i]; if (!s) return;
          sc.scrollTo({
            top: sc.scrollTop + s.getBoundingClientRect().top -
              sc.getBoundingClientRect().top - 44,
            behavior: 'smooth'
          });
        };
      });
      sc.onscroll = spy;
      if (keep) sc.scrollTop = keep;
      spy();
      $$('[data-cw]', m).forEach(function (el) {
        el.onclick = function () { crowd = el.dataset.cw; openMat = {}; draw(); };
      });
      $$('[data-m]', m).forEach(function (el) {
        el.onclick = function () { openMat[el.dataset.m] = !openMat[el.dataset.m]; draw(); };
      });
      bindSample(m);
      var all = $('[data-all]', m); if (all) all.onclick = function () { showAll = true; draw(); };
      var ml = $('[data-mail]', m);
      if (ml) ml.onclick = function () {
        var t = p.country + ' 签证材料清单 · ' + CROWD_CN[crowd];
        downloadText(t + '.txt', matListText(t, d.checklist[crowd] || []));
        toast('材料清单已导出');
      };
      $('[data-book]', m).onclick = function () { orderPage(m, d, pkgId); };
    }

    m.innerHTML = pageH('签证详情',
      '套餐层是本方案相对旧版的关键结构：同一供应商产品下按「普通 / 加急 / 代办面签陪同」等服务档位拆套餐，' +
      '各自独立维护签证费、服务费、办理时长与预订须知。') +
      h5page(p.country + '签证', '', ' ', '这一步在做什么',
        '材料清单按 <b>适用人群</b> 自动裁剪——在职人员看到在职证明与营业执照副本，学龄前儿童看到出生证明与父母同意函。' +
        '清单取自运营端「国家送签材料库」的当前生效版本；<b>下单时会按人群快照进订单</b>，后续材料改版不影响已下单客人。', true);
    $('[data-back]', m).onclick = function () { history.back(); };
    draw();
  });
}

var CROWD_CN = { job: '在职人员', free: '自由职业', student: '在校学生', retire: '退休人员', child: '学龄前儿童' };

/* ---------- 订单填写 ----------
   唐美芳 2026-08-27：「C 端小程序订单填写页，现在的信息分区感觉呈现交互体验不是很好，
   你参考下我截图的携程的页面，能不能再把信息区域分隔的更友好一点」。

   原来整页是一串等重的 h5-row：产品、套餐、出发日期、办签人数、客人1、姓名、手机、邮箱……
   全长一个样，客人扫一眼分不清哪个必须填、哪个只是展示，也看不出还差什么。
   照携程那张改成「一块只干一件事」：

     产品条（带产品信息回看入口）→ 退改保障 → 预计出行日期 → 办签人 → 联系人
     → 资料提交方式 → 费用明细

   三个关键的交互点是从携程那张学来的：
     1）产品名下面挂一行「产品信息：适用人群 · 办签材料 · 办理流程 查看 ›」——
        客人在下单页想起来要确认材料，不用退回详情页再走一遍；
     2）办签人不再是一行「客人1 › 」，改成一人一张芯片，没填全的直接标红「信息不全」，
        几个人差几个人一眼看完；
     3）必填项用红星 + 未填时的橙色徽标标出来，别让人点了提交才知道缺什么。

   我们比携程多做一件事：出行日期选早了会当场算给客人看——本套餐要 N 个工作日出签，
   你填的日期只剩 X 天，来不及。签证这行最常见的纠纷就是这个，不该等下单后才发现。
   携程那张有「优惠券」，我们没有优惠券系统，就不摆一个点不动的空位，换成真实的费用明细。 */
function orderPage(m, d, pkgId) {
  var pk = d.packages.filter(function (x) { return x.id === pkgId; })[0];
  var p = d.product;
  /* 第一位办签人默认带出「本人」档案（唐美芳 2026-09-01：
     「默认带出我上次选择的人员信息……默认带出本人的办签人信息」）。
     档案是异步取的，先摆一张空卡片保证首屏能画出来，取到再填进去重绘；
     客人已经动过手的就不覆盖——他可能就是要给别人办。 */
  /* 办签人一律来自「常用办签人」档案（唐美芳 2026-09-01：要像携程那样有一个
     统一管理界面）。所以初始是空的，由下面的默认带出或选择器填。 */
  var A = [];
  /* 「下单后再填写办签人资料」：打开后只报人数，资料在订单里补
     （唐美芳 2026-09-01）。有 24 小时自动取消兜底，放开是安全的。 */

  var contact = { name: '', phone: '', email: '' };
  var depart = '';
  var prefilled = false;
  var tvFill = apFromTv;   /* 档案 → 下单页对象，三端同一份转换（ap-picker.js） */
  api('/my/travelers').then(function (tv) {
    if (prefilled) return;
    var list = tv.list || [];
    /* 优先本人；没标本人就用最近一次下单用过的那位（used 最多、其次 id 最大）。
       后端已按 is_self desc 排序，所以本人在第一个。 */
    var pick = list.filter(function (t) { return t.is_self; })[0];
    if (!pick) {
      pick = list.slice().sort(function (a, b) {
        return (b.used || 0) - (a.used || 0) || b.id - a.id;
      })[0];
    }
    if (!pick) return;
    if (A.length) return;   // 客人已经选过人，不覆盖
    A[0] = tvFill(pick);
    A[0]._from = pick.is_self ? 'self' : 'last';
    prefilled = true;
    /* 联系人也顺手带上本人的姓名手机——多数情况下下单人就是本人，
       填错联系人会导致出签通知发不到客人手上（这一条 CSP 侧也踩过）。 */
    if (!contact.name && !contact.phone && pick.is_self) {
      contact = { name: pick.name_cn, phone: pick.phone || '', email: '' };
    }
    draw();
  }).catch(function () { });

  var full = apFull;   /* 姓名 + 证件号 + 人群齐了就能提交（ap-picker.js） */
  /* 出行日期离今天还有几个自然日。签证时效是按工作日算的，这里粗算成
     工作日 ≈ 自然日 × 5/7，只用来提醒，不用来卡提交——万一客人就是要赌一把，
     或者他其实是补录一张早就在办的单子，系统不该替他做决定。 */
  function dayGap() {
    if (!depart) return null;
    return Math.round((new Date(depart) - new Date(new Date().toDateString())) / 86400000);
  }
  function tooTight() {
    var g = dayGap();
    if (g == null) return null;
    var need = Math.ceil(pk.lead_days * 7 / 5);
    return g < need ? { gap: g, need: need } : null;
  }

  function sec(title, body, req, badge) {
    return '<section class="bk-sec"><div class="bk-h"><b>' + esc(title) +
      (req ? '<i>*</i>' : '') + '</b>' + (badge || '') + '</div>' + body + '</section>';
  }

  /* 出行日期改日历控件（唐美芳 2026-09-07 附携程截图；9-08 追问「C 端也有填写的，
     日历控件你也一并改了么」——补上，三端同一个组件、同一套口径）。
     最早可选＝今天 + 本套餐时效换算的自然日：出行日期早于出签日这单本来就办不成。 */
  var calShown = false;
  function openCal() {
    return calPicker({
      title: '选择预计出发日期',
      tip: '请选择预计出行时间，以便为您安排送签和配送',
      value: depart,
      min: calPlus(calWork2Nat(pk.lead_days || 15)),
      price: pk.suggest_retail,
      months: 4
    }).then(function (v) { depart = v; draw(); }).catch(function () { });
  }

  function draw() {
    var tight = tooTight(), g = dayGap();
    var bad = A.filter(function (a) { return !full(a); }).length;
    /* 计价人数：开了「下单后再填写」就按填的人数算，否则按已选办签人数 */
    var PAX = A.length;

    $('.ph-body', m).innerHTML =
      /* 产品条：产品名 + 卖点 + 产品信息回看入口。客人在这一步最容易犹豫的是
         「我到底要交什么材料」，把入口放在这儿，别逼他退回去。 */
      '<section class="bk-prod"><b>' + esc(d.name) + '</b>' +
      (d.feature ? '<s>' + esc(d.feature) + '</s>' : '') +
      '<div class="bk-lk" data-info><span>产品信息：</span>适用人群 · 办签材料 · 办理流程' +
      '<em>查看 ›</em></div></section>' +

      /* 退改口径取后端 /order/cancel 的真实规则（2026-09-08 起：只有未支付的单能直接取消，
         已支付一律走退款）。不写「随时可退」这种模糊话，客人真去退的时候对不上就是投诉。 */
      '<div class="bk-trust">' + svgIcon('M12 3l7 3v6c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z') +
      '<span>订单支付前可直接取消；已支付的订单请提交退款申请，按已产生的官费与服务成本核减后退还余款。' +
      '</span></div>' +

      sec('预计出行日期',
        '<div class="bk-date' + (depart ? ' on' : '') + '" data-act="date">' +
        (depart ? '<b>' + esc(depart) + '</b><s>距今 ' + g + ' 天' +
          '，将按此日期为您安排办理进度</s>'
          : '<b class="ph">请选择日期</b><s>将按此日期为您安排办理进度</s>') +
        '<em class="bk-pen">' + svgIcon('M4 20h4L19 9l-4-4L4 16z') + '</em></div>' +
        (tight ? '<div class="bk-warn">本套餐约需 <b>' + pk.lead_days +
          ' 个工作日</b>出签，所选出行日期距今仅剩 <b>' + tight.gap +
          ' 天</b>，时间可能不够。建议改期或改选加急套餐。</div>' : ''),
        true, depart ? '' : '<u class="bk-bg">请先选择日期</u>') +

      /* 办签人做成芯片：几个人、谁没填完，一眼扫完。
         这是这一步真正的重点——「适用人群」在这里定死，直接决定系统给这位客人
         生成哪一份材料清单，所以人群要显示在芯片上，不能藏进弹窗里。 */
      /* 办签人：一个入口打开统一管理面板，里面勾选 / 新增 / 编辑 / 删除 / 设本人。
         原来是「＋从常用选」「＋手动填」两个入口，选人的弹窗还只能选不能改
         （唐美芳 2026-09-01：「应该像携程那样，有个统一管理的界面」）。 */
      sec('办签人',
        (A.length
          ? '<div class="ap-sel">' + A.map(function (a, i) {
            return '<div class="ap-card' + (full(a) ? '' : ' bad') + '">' +
              '<div class="n"><b>' + esc(a.name_cn || ('办签人 ' + (i + 1))) +
              (a.is_self ? ' · 本人' : '') + '</b>' +
              '<s>' + esc(CROWD_CN[a.crowd] || '') +
              (a.id_no ? ' · ' + esc(a.id_type || '护照') + ' ' + esc(a.id_no) : ' · 证件信息不全') +
              '</s></div>' +
              '<span class="x" data-del="' + i + '">×</span></div>';
          }).join('') + '</div>'
          : '<div class="bk-tip" style="margin:0 0 10px">请选择或新增需要办理签证的办签人</div>') +
        '<a class="ap-pick" data-act="pick">＋ 选择或更改办签人</a>' +
        /* C 端不给「下单后再填写」这个开关：客人自己下单，办签人就是他自己和同行的人，
           当场就能填；留个开关只会让一半订单带着空白办签人进来，后面还得追着要
           （唐美芳 2026-09-02：「C 端小程序，订单填写，办签人必须勾选填写，
           CSP 和有米 B 端不需要」——销售代客下单时客人不在跟前，那个开关要留着）。 */
        '<div class="bk-tip">「适用人群」决定系统给这位客人生成哪一份材料清单——' +
        '在职人员要在职证明，学龄前儿童要出生证明与父母同意函，各不相同。' +
        '姓名与证件信息务必与护照一致。</div>',
        true, A.length
          ? (bad ? '<u class="bk-bg">' + bad + ' 人信息不全</u>' : '')
          : '<u class="bk-bg">待选择</u>') +

      sec('联系人',
        '<div class="bk-kv" data-act="ct">' +
        '<div><i>联系人</i><b class="' + (contact.name ? '' : 'ph') + '">' +
        esc(contact.name ? contact.name + '  ' + contact.phone : '请填写姓名与手机号') + '</b></div>' +
        '<div><i>电子邮箱</i><b class="' + (contact.email ? '' : 'ph') + '">' +
        esc(contact.email || '用于接收出签结果通知') + '</b></div>' +
        '<em class="bk-pen">' + svgIcon('M4 20h4L19 9l-4-4L4 16z') + '</em></div>',
        true, (contact.name && contact.phone) ? '' : '<u class="bk-bg">待填写</u>') +

      sec('资料提交方式',
        '<div class="bk-way"><div><b>电子材料</b><s>下单后在「我的订单」逐项上传，' +
        '专员在线审核，不合格会退回并说明原因</s></div>' +
        '<div><b>原件邮寄</b><s>' + esc(d.mail_addr || '下单后由客服告知收件地址') +
        '</s></div></div>') +

      /* 携程这个位置是优惠券。我们没有优惠券系统，摆一个点不动的空行不如把钱算清楚。 */
      sec('费用明细',
        '<div class="bk-fee"><div><i>' + esc(pk.name) + ' × ' + PAX + ' 人</i>' +
        '<b>¥' + money(pk.suggest_retail * PAX) + '</b></div>' +
        '<div><i>单价</i><b class="mut">¥' + money(pk.suggest_retail) + ' / 人</b></div>' +
        '<div class="tt"><i>订单总额</i><b>¥' + money(pk.suggest_retail * PAX) + '</b></div>' +
        '</div><div class="bk-tip">价格为该套餐当前渠道零售价，' +
        '不含使领馆临时上调的官费差额；如有变动会在办理前单独告知。</div>');

    $('.ph-foot', m).innerHTML =
      '<div class="sum">订单总额 <b style="color:var(--ro2);font-size:17px;margin-left:4px">¥' +
      money(pk.suggest_retail * PAX) + '</b></div>' +
      '<button class="cta" data-sub>提交订单</button>';

    /* 进入填写页自动弹一次日历，可关闭（唐美芳 2026-09-07）。
       只弹一次：每次 draw() 都弹的话，关掉它就再也填不了别的字段。 */
    if (!calShown) { calShown = true; setTimeout(openCal, 260); }

    $('[data-info], .bk-lk', m) && ($('[data-info]', m).onclick = function () { infoModal(); });

    $$('[data-del]', m).forEach(function (x) {
      x.onclick = function (e) {
        e.stopPropagation();
        A.splice(+x.dataset.del, 1); draw();
      };
    });

    $$('[data-act]', m).forEach(function (el) {
      el.onclick = function () {
        var a = el.dataset.act;
        if (a === 'date') {
          openCal();
        } else if (a === 'pick') {
          apPicker(A, { max: 9, title: '选择或更改办签人', page: true }).then(function (out) {
            A = out;
            prefilled = true;   /* 客人自己选过了，异步回来的「本人」不要再覆盖 */
            draw();
          });
        } else if (a === 'ct') {
          ask('联系人信息', [
            { k: 'name', label: '姓名', required: true, value: contact.name },
            { k: 'phone', label: '手机号', required: true, value: contact.phone, hint: '11 位手机号，用于办理过程中联系' },
            { k: 'email', label: '电子邮箱', value: contact.email, hint: '用于接收出签结果通知' }
          ]).then(function (f) { contact = f; draw(); }).catch(function () { });
        }
      };
    });

    $('[data-sub]', m).onclick = function () {
      if (!depart) return toast('请先选择预计出行日期', true);
      if (!A.length) return toast('请先选择办签人', true);
      if (bad) return toast('还有 ' + bad + ' 位办签人信息不全', true);
      if (!contact.name || !contact.phone) return toast('请填写联系人姓名与手机号', true);
      api('/order/create', {
        sup_product_id: d.sup_product_id, pkg_id: pkgId, depart_date: depart,
        contact_name: contact.name, contact_phone: contact.phone,
        contact_email: contact.email,
        applicants: A, pax_later: 0
      }).then(function (r) {
        toast('订单 ' + r.no + ' 已创建，应付 ¥' + money(r.amount));
        go('orders');
      }).catch(fail);
    };
  }

  /* 「产品信息 查看」：把详情页那三块搬进弹窗，客人不用退出下单流程。
     材料清单按人群分栏，跟详情页同一份数据（d.checklist），不另拉一次也不另写一套口径。 */
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
        '<h5>办理流程</h5>' + flowList(d.flow, true) +
        '<h5>签证属性</h5><div class="bk-mkv">' +
        '<div><i>有效期</i><b>' + esc(validTx(p)) + '</b></div>' +
        '<div><i>入境次数</i><b>' + esc(ENTRIES[p.entries] || p.entries) + '</b></div>' +
        '<div><i>停留时间</i><b>' + stayTx(p) + '</b></div>' +
        '<div><i>是否面试</i><b>' + (p.need_interview ? '需本人到馆' : '免面试') + '</b></div>' +
        '<div><i>是否录指纹</i><b>' + (p.need_fingerprint ? '需本人到场' : '无需') + '</b></div>' +
        '<div><i>办理时长</i><b>约 ' + pk.lead_days + ' 个工作日</b></div></div>';
    }
    /* 切人群只重画弹窗内容，不销毁重建——重建会把滚动位置弹回顶部，
       客人正比对材料清单时被拽回去很烦。 */
    var mo = modal('产品信息 · ' + d.name, body(), null, true);
    function bind() {
      $$('[data-cw2]', mo.mask).forEach(function (a) {
        a.onclick = function () {
          cw = a.dataset.cw2;
          $('.modal .c', mo.mask).innerHTML = body();
          bind();
        };
      });
    }
    bind();
  }

  m.innerHTML = pageH('订单填写',
    '办签人的<b>适用人群</b>在这一步确定，直接决定系统给这位客人生成哪一份材料清单，' +
    '因此同一张订单里不同客人可能拿到条目数不同的清单。') +
    h5page('订单填写', '', ' ', '这一步在做什么',
      '提交订单只生成订单与材料清单，<b>不会派发工单</b>。' +
      '必须先由客户支付、再由财务确认收款，系统才会开闸生成签证工单并对操作专员与供应商可见。', true);
  $('[data-back]', m).onclick = function () { go('shop', 'p-' + d.sup_product_id); };
  draw();
}

/* ---------- 签证订单（H5） ---------- */
/* 五个订单状态的中文名必须跟后端 ORD_STATUS 一字不差：
   C 端原来把 created 叫「待支付」，其他四端叫「待付款」——同一个状态两个叫法，
   销售在 CSP 里说「待付款」，客人在小程序里看到「待支付」，对账时会以为是两回事。
   （唐美芳 2026-08-31：订单状态就 5 个。5 个值也得是同 5 个名字。） */
var ORD_ST_CN = { created: '待付款', paid: '已付款', done: '已完成', cancelled: '已取消', refunded: '已退款' };
VIEWS['customer:orders'] = function (m) {
  return Promise.all([api('/my/orders'), api('/my/supp')]).then(function (rr) {
    var j = rr[0], supp = rr[1].list.filter(function (x) { return x.status === 'open'; });
    var u = S.user || {};
    /* 页签 = 订单状态这一条线，5 个值（唐美芳 2026-08-31：
       「之前不是说就5个么，你怎么还是把订单状态与签证办理状态混在一起了」）。
       原来第三格写「办理中」但判的是 status==='paid'——「已付款」是订单状态，
       「办理中」是按办签人进度算出来的另一条线，一张刚付完款还没交材料的单
       订单状态是已付款、办理状态是未开始，标成「办理中」是骗人的。
       办理状态改在卡片上单独挂一个标签，两条线各说各的。 */
    var OF = [
      ['all', '全部', function () { return true; }],
      ['created', '待付款', function (o) { return o.status === 'created'; }],
      ['paid', '已付款', function (o) { return o.status === 'paid'; }],
      ['done', '已完成', function (o) { return o.status === 'done'; }],
      ['refunded', '已退款', function (o) { return o.status === 'refunded'; }],
      ['cancelled', '已取消', function (o) { return o.status === 'cancelled'; }]
    ];
    var cf = S.cache.ordF || 'all';
    var fn = (OF.filter(function (x) { return x[0] === cf; })[0] || OF[0])[2];
    var obar = '<div class="h5-fbar">' + OF.map(function (x) {
      var n = j.list.filter(x[2]).length;
      return '<a data-of="' + x[0] + '"' + (x[0] === cf ? ' class="on"' : '') + '>' + x[1] +
        (n ? '<u>' + n + '</u>' : '') + '</a>';
    }).join('') + '</div>';

    /* 原「我的」页并进来：待办四格 + 补料横幅 + 二级入口，都压在订单列表上方，
       客户一进这个 Tab 就能看到「该我做了什么」，不必自己翻订单找待办。 */
    var cnt = {
      created: j.list.filter(function (o) { return o.status === 'created'; }).length,
      supp: supp.length,
      processing: j.list.filter(function (o) { return o.status === 'paid' && o.gate; }).length,
      done: j.list.filter(function (o) { return o.status === 'done'; }).length
    };
    var head =
      '<div class="mo-hd">' +
      '<div class="who"><i>' + esc((u.name || '客').slice(0, 1)) + '</i>' +
      '<div class="tx"><b>' + esc(u.name || '') + '</b><s>' + esc(u.phone || '已实名认证') + '</s></div>' +
      '<a class="mo-more" data-k="me">个人资料 ›</a></div>' +
      '<div class="mo-cells">' +
      [['created', '待付款', cnt.created], ['supp', '待补料', cnt.supp],
      ['processing', '办理中', cnt.processing], ['result', '待签收', cnt.done]]
        .map(function (c) {
          return '<a data-goto="' + c[0] + '"><b>' + c[2] + '</b><s>' + c[1] + '</s></a>';
        }).join('') +
      '</div></div>' +
      (supp.length ? '<div class="mo-alert" data-k="supp"><b>您有 ' + supp.length +
        ' 条补料通知待处理</b><s>' +
        esc(supp[0].deadline ? '最近一条截止 ' + d10(supp[0].deadline) : '请尽快按要求重新上传') +
        '</s><em>去处理 ›</em></div>' : '') +
      /* 原来这里挂着「我的材料 / 结果签收 / 退款申请 / 办理进度」四个平级入口。
         撤掉了 —— 这四件事全是<b>订单维度</b>的，脱离订单点进去只能先让客人
         从几十条重复的人名里挑一个，重复且难挑（唐美芳 2026-09-02：
         「我的材料、结果签收、退款申请、办理进度这些子页面不都应该在订单详情页里么」）。
         路由都保留，入口统一收到订单详情与订单卡片里，落到具体的人。 */
      '';

    var body = j.list.filter(fn).map(function (o) {
      var acts = '';
      if (o.status === 'created')
        acts = '<button class="h5-btn grey" data-cc="' + o.no + '">取消订单</button>' +
          '<button class="h5-btn solid" data-pay="' + o.no + '">立即支付</button>';
      /* 已付款但财务还没放行＝还没真开始办，客户仍可直接取消原路退回；
         放行之后要走退款流程。（订单状态去掉「办理中」后靠 gate 区分） */
      else if (o.status === 'paid' && !o.gate)
        acts = '<button class="h5-btn grey" data-cc="' + o.no + '">取消订单</button>';
      else if ((o.status === 'paid' && o.gate) || o.status === 'done')
        acts = '<button class="h5-btn grey" data-rf="' + o.no + '">申请退款</button>';
      /* 卡片主体可点进订单详情（2026-08-31）。原来点卡片没反应，客户只能靠
         卡片里那两个小链接进补料和进度，待支付订单连链接都没有。 */
      /* 订单状态与办理状态并排显示，各是各的：
         「已付款 · 未开始」是常态，不该被合并成一个词 */
      var wk = o.work_status || '未完成';
      /* 订单状态与办理状态并排，但两者文案一样时只显示一个——
         已完成的单子原来显示成「已完成已完成」。 */
      var showWk = (o.status === 'paid' || o.status === 'done') &&
        wk !== (ORD_ST_CN[o.status] || o.status_text);
      /* 支付状态单独摆一行（唐美芳 2026-09-03：「订单列表直接增加一个支付状态展示」，
         五个系统同步）。客人视角与内部视角同一套词：待支付 / 部分支付 / 已支付。
         订单状态里那个「待付款 / 已付款」说的是整单走到哪，
         支付状态说的是钱付了多少——分期付定金的单子只有这一行能看出来。 */
      var pst = o.pay_state || 'unpaid';
      return '<div class="h5-ord"><div class="hd" data-od="' + esc(o.no) + '">' +
        '<span class="no">' + esc(o.no) + '</span>' +
        '<span class="st">' + esc(ORD_ST_CN[o.status] || o.status_text) +
        (showWk ? '<i class="wk">' + esc(wk) + '</i>' : '') + '</span></div>' +
        '<div class="bd" data-od="' + esc(o.no) + '"><div class="nm">' + esc(o.product) + '</div>' +
        '<div class="pk">套餐：' + esc(o.pkg) + '</div>' +
        '<div class="pk">支付状态：<b class="h5-pst ' + pst + '">' +
        esc(PAY_ST_CN[pst] || pst) + '</b>' +
        (pst === 'part' ? '<span class="mut">　已付 ¥' + money(o.recv + o.recv_wait) +
          ' / 应付 ¥' + money(o.amount) + '</span>' : '') + '</div>' +
        '<div class="r"><span class="l">' + d10(o.depart_date) + ' 出发　' + o.pax + ' 人</span>' +
        priceHtml(o.amount, false) + '</div>' +
        (o.todo ? '<div class="h5-tags" style="margin-top:7px"><span style="color:var(--ro2);background:#FFF0F4">' +
          esc(o.todo) + '</span></div>' : '') +
        /* 一位办签人 = 一张工单，补料和进度都要落到具体的人，不能只让第一位能点 */
        o.applicants.map(function (a) {
          return '<div class="h5-apr"><div class="h5-tags"><span>' + esc(a.name) + '</span>' +
            '<span>' + esc(a.state === 'refunded' ? '已退款'
              : a.state === 'cancelled' ? '已取消' : a.progress_text) + '</span>' +
            (a.result ? '<span style="color:var(--ro2);background:#FFF0F4">' + esc(a.result) + '</span>' : '') +
            '</div>' +
            (o.status !== 'created' && o.status !== 'cancelled' && a.state === 'normal' ?
              '<div class="h5-apa"><a data-mat="' + a.id + '">补充资料</a>' +
              '<a data-tr="' + a.id + '">查进度</a></div>' : '') +
            '</div>';
        }).join('') + '</div>' +
        '<div class="ft"><span class="t">下单时间：' + d16(o.created_at) + '</span><span>' + acts + '</span></div></div>';
    }).join('') || '<div class="h5-empty">该状态下还没有订单</div>';

    m.innerHTML = pageH('我的订单',
      '底部导航精简为「首页 / 客服 / 我的订单」三项，原「我的」整页并入本页：' +
      '待支付、待补料、办理中、待签收四个数字由订单与补料数据实时算出，补料角标同步落在本 Tab 上。' +
      '<b>支付状态</b>单独一行显示：待支付 / 部分支付 / 已支付——只看钱付了多少，' +
      '跟订单走到哪一步是两回事，分期付定金的单子只有这一行能看出来。' +
      '（商家侧还要核对水单确认到账才会开始办理，那是内部环节，不在客户端显示。）' +
      '这是本方案的资金闸门，用于杜绝未收款先作业。') +
      h5page('我的订单', head + obar + body, '', '这一步在做什么',
        '客户在订单卡上可直接进入补充资料与办理进度查询。进度由签证专员在后台推进，' +
        '专员跳段推进时系统会自动补齐中间环节，<b>客户端不会出现跳格</b>。',
        false, 'orders');
    $$('[data-of]', m).forEach(function (a) {
      a.onclick = function () { S.cache.ordF = a.dataset.of; reload(); };
    });
    $$('[data-k]', m).forEach(function (a) { a.onclick = function () { go(a.dataset.k); }; });
    $$('[data-goto]', m).forEach(function (a) {
      a.onclick = function () {
        var k = a.dataset.goto;
        if (k === 'supp' || k === 'result') return go(k);
        S.cache.ordF = k; reload();
      };
    });
    h5bind(m);
    $$('[data-pay]', m).forEach(function (b) {
      b.onclick = function () {
        api('/order/pay', { no: b.dataset.pay }).then(function (r) { toast(r.msg); reload(); }).catch(fail);
      };
    });
    $$('[data-cc]', m).forEach(function (b) {
      b.onclick = function () {
        if (!confirm('确定取消该订单？订单一旦支付将无法直接取消，只能提交退款申请。')) return;
        api('/order/cancel', { no: b.dataset.cc, reason: '客户在小程序主动取消' })
          .then(function (r) { toast(r.msg); reload(); }).catch(fail);
      };
    });
    $$('[data-mat]', m).forEach(function (b) { b.onclick = function () { go('mats', b.dataset.mat); }; });
    $$('[data-tr]', m).forEach(function (b) { b.onclick = function () { go('track', b.dataset.tr); }; });
    $$('[data-rf]', m).forEach(function (b) { b.onclick = function () { go('refund', b.dataset.rf); }; });
    /* 卡片里的「补充资料 / 查进度」是直达具体某个人的快捷方式，点它们不该被
       卡片的进详情吃掉，所以这里判断一下事件源。 */
    $$('[data-od]', m).forEach(function (b) {
      b.onclick = function (e) {
        if (e.target.closest('[data-mat],[data-tr],button')) return;
        go('odetail', b.dataset.od);
      };
    });
  });
};

/* ---------- 办理进度查询（时间轴） ---------- */
VIEWS['customer:track'] = function (m, aid) {
  if (!aid) return api('/my/orders').then(function (j) {
    var first = null;
    j.list.forEach(function (o) { if (!first && o.status !== 'created') first = o.applicants[0].id; });
    if (!first) { m.innerHTML = pageH('办理进度查询', '') + card('', '<div class="empty">暂无可查询的订单</div>'); return; }
    go('track', first);
  });
  return api('/my/track?applicant_id=' + aid).then(function (t) {
    /* 时间轴渲染抽到 core.js 的 trackHtml()，后台订单详情用的是同一份——
       同一位办签人在客户端和后台看到的进度必须是一模一样的东西
       （唐美芳 2026-09-01：「前后端又不一致了」）。 */
    var sibs = t.siblings || [{ id: +aid, name: t.name }];
    /* 原来这行用的是后台的 .od-note，H5 里没有左右内边距，
       文字直接顶到手机壳边框外（唐美芳 2026-09-03 截图里能看到）。
       改成 H5 自己的提示条，并把话说得像给客人看的。 */
    var body = '<div class="tk-hd">订单号 <b>' + esc(t.ord_no) + '</b>' +
      (sibs.length > 1
        ? '<s>本单共 ' + sibs.length + ' 位办签人，每人各自办理、进度互不影响，' +
          '点下方姓名切换查看</s>'
        : '') + '</div>' +
      '<div class="h5-sec">' + trackHtml(t, aid) + '</div>';
    m.innerHTML = pageH('办理进度',
      '客户可见的进度流来自系统事件表，<b>只返回本人订单的事件</b>，不暴露内部工单、供应商结算与其他客人的信息。' +
      '页面话术全部按客人视角写：内部工位名（待收料 / 待提交至官网…）换成「我们正在为你做什么」，' +
      '每一步再补一句要不要客人动手。') +
      h5page('办理进度', body, '', '这一步在做什么',
        '顶部六步进度条对应签证的六个节点，下面按办理记录、面签预约、结果与寄回三段展开。' +
        '面签与录指纹须客户本人到馆，我司负责代填表、代缴费、代约号；' +
        '<b>抢号与递交属人工环节</b>，系统只做提醒与结果回填，不承诺自动化。', true);
    $('[data-back]', m).onclick = function () { go('orders'); };
    $$('[data-ap]', m).forEach(function (a) {
      a.onclick = function () { if (a.dataset.ap != aid) go('track', a.dataset.ap); };
    });
  });
};

/* ================= 全部目的地 =================
   首页三个入口（搜索框、「全部目的地 →」、「查看全部产品」）都落到这一页，
   所以它得同时答三件事：这个国家能不能办、有哪些国家、有哪些具体产品。
   之前只是一张扁平产品列表，答了第三件，前两件没答，页头还留着旧版的紫色渐变。 */
VIEWS['customer:list'] = function (m) {
  return Promise.all([api('/shop/products'), ensureCcfg()]).then(function (rr) {
    var j = rr[0];
    /* 平台产品按国家归拢：最低价、最快时效、在售款数，都是算出来的，不写死 */
    var byC = {};
    j.list.forEach(function (p) {
      var c = byC[p.country] || (byC[p.country] = { lo: Infinity, fast: Infinity, n: 0, cities: [] });
      p.suppliers.forEach(function (s) {
        c.n++;
        if (s.price_min < c.lo) c.lo = s.price_min;
        if (s.lead_min < c.fast) c.fast = s.lead_min;
      });
      if (c.cities.indexOf(p.submit_city) < 0) c.cities.push(p.submit_city);
    });
    var onSale = Object.keys(byC);

    /* 全量产品行（供应商产品级，因为这才是能直接下单的东西） */
    var all = [];
    j.list.forEach(function (p) {
      p.suppliers.forEach(function (s) { all.push({ p: p, s: s }); });
    });
    var cities = [];
    all.forEach(function (x) {
      if (cities.indexOf(x.p.submit_city) < 0) cities.push(x.p.submit_city);
    });

    var ct = S.cache.alCt || 0;                     // 大洲 tab
    var f = S.cache.alF || (S.cache.alF = { city: '', itv: false, ins: false, sort: 'all' });
    var q = '';

    function countryRow(cn) {
      var c = byC[cn];
      if (!c) {
        return '<span class="al-row off"><i style="background-image:url(' + cardimg(cn) + ')"></i>' +
          '<div><b>' + esc(cn) + '</b><s>暂未开放，覆盖中</s></div><u>敬请期待</u></span>';
      }
      return '<a class="al-row" data-c="' + esc(cn) + '">' +
        '<i style="background-image:url(' + cardimg(cn) + ')"></i>' +
        '<div><b>' + esc(cn) + '</b><s>' + c.n + ' 款在售 · 最快 ' + c.fast +
        ' 个工作日 · ' + esc(c.cities.join('/')) + '送签</s></div>' +
        '<u>¥' + money(c.lo) + '<em>起</em></u></a>';
    }

    function destCard(cn) {
      var c = byC[cn];
      return '<a class="al-dc" data-c="' + esc(cn) + '" ' +
        'style="background-image:url(' + cardimg(cn) + ')">' +
        '<div class="tx"><b>' + esc(cn) + '</b>' +
        '<s>' + c.n + ' 款在售 · ¥' + money(c.lo) + ' 起</s></div></a>';
    }

    /* 产品卡沿用首页那张卡，视觉上两处一致；角标不再编「热卖 TOP1」，
       改成产品本身可核验的属性 */
    /* 套餐行：一行一个可直接下单的服务包，价格与时效成对给出。
       原来卡片只给「¥1,980 起 · 最快 7 个工作日」，两个数来自不同套餐，
       客人按哪个点进来都对不上（唐美芳 2026-09-07 指出这一点）。
       最多摆 2 行，其余收进「查看全部 N 个套餐」，避免同一产品把列表刷屏。 */
    function pkRows(x) {
      var ks = (x.s.pkgs || []).slice();
      if (!ks.length) return '';
      /* 客人正在按「出签快」排序时，套餐行也按时效排，摆在最前的才是他要的那档 */
      if (f.sort === 'fast') ks.sort(function (a, b) { return a.lead_days - b.lead_days; });
      var show = ks.slice(0, 2);
      return '<div class="h5-pks">' + show.map(function (k) {
        return '<a class="h5-pk" data-pk="' + x.s.sup_product_id + ':' + k.id + '">' +
          '<b>' + esc(k.name) + '</b>' +
          '<s>' + k.lead_days + ' 个工作日</s>' +
          '<i>¥' + money(k.retail) + '</i></a>';
      }).join('') +
        (ks.length > show.length
          ? '<a class="h5-pkm" data-p="' + x.s.sup_product_id + '">查看全部 ' +
            ks.length + ' 个套餐 ›</a>' : '') + '</div>';
    }

    function prodCard(x) {
      var pk = [['有效期', esc(x.p.valid)], ['停留期', stayTx(x.p)],
      ['入境次数', esc(ENTRIES[x.p.entries] || x.p.entries).replace('入境', '')],
      /* 办理时长给区间而不是最小值：下面的套餐行里最便宜那档往往是最慢的，
         头上写「7 个工作日」、行里写「15 个工作日」，自相矛盾（2026-09-07）。 */
      ['办理时长', (function () {
        var ds = (x.s.pkgs || []).map(function (k) { return k.lead_days; });
        var lo = ds.length ? Math.min.apply(null, ds) : x.s.lead_min;
        var hi = ds.length ? Math.max.apply(null, ds) : x.s.lead_min;
        return (lo === hi ? lo : lo + '~' + hi) + '个工作日';
      })()]];
      var tag = 
        (x.p.need_interview ? '' : '<em>免面签</em>');
      return '<div class="h5-fcard" data-p="' + x.s.sup_product_id + '">' +
        '<div class="hd"><i style="background-image:url(' + fimg(x.p.country) + ')"></i>' +
        '<div class="nm"><b>' + esc(x.s.name) + '</b>' +
        '<s>' + esc(x.p.submit_city) + '送签 · ' + esc(x.s.supplier) + ' · ' +
        x.s.pkg_count + ' 个套餐可选</s></div>' + tag + '</div>' +
        '<div class="gd">' + pk.map(function (k) {
          return '<div><s>' + k[0] + '</s><b>' + k[1] + '</b></div>';
        }).join('') + '</div>' +
        pkRows(x) +
        '<div class="ft"><div class="pz"><s>' +
        esc(x.s.feature || (x.p.need_interview ? '需本人面签' : '免面签办理')) + '</s>' +
        '<div class="pr"><i>¥</i><b>' + money(x.s.price_min) + '</b><u>/人起</u></div></div>' +
        '<button class="go">立即办理 ›</button></div></div>';
    }

    function filtered() {
      var rows = all.filter(function (x) {
        if (f.city && x.p.submit_city !== f.city) return false;
        if (f.itv && x.p.need_interview) return false;
        return true;
      });
      if (f.sort === 'lo') rows.sort(function (a, b) { return a.s.price_min - b.s.price_min; });
      if (f.sort === 'fast') rows.sort(function (a, b) { return a.s.lead_min - b.s.lead_min; });
      return rows;
    }

    function filtBar() {
      var chip = function (on, key, val, txt) {
        return '<a data-fk="' + key + '" data-fv="' + esc(val) + '"' +
          (on ? ' class="on"' : '') + '>' + txt + '</a>';
      };
      return '<div class="al-filt">' +
        '<div class="al-fr">' + chip(!f.city, 'city', '', '全部送签地') +
        cities.map(function (c) { return chip(f.city === c, 'city', c, esc(c)); }).join('') +
        '</div>' +
        '<div class="al-fr">' +
        chip(f.itv, 'itv', '', '免面签') +
        '<span class="sp"></span>' +
        chip(f.sort === 'all', 'sort', 'all', '综合') +
        chip(f.sort === 'lo', 'sort', 'lo', '价格低') +
        chip(f.sort === 'fast', 'sort', 'fast', '出签快') +
        '</div></div>';
    }

    function draw() {
      var box = $('#alMain', m), html;
      if (q) {
        /* 搜索：国家与产品一起命中，不让用户猜该搜哪一栏 */
        var hitC = [], seen = {};
        CONT.forEach(function (g) {
          g[1].forEach(function (cn) {
            if (seen[cn] || cn.indexOf(q) < 0) return;
            seen[cn] = 1; hitC.push(cn);
          });
        });
        onSale.forEach(function (cn) {
          if (!seen[cn] && cn.indexOf(q) >= 0) { seen[cn] = 1; hitC.push(cn); }
        });
        var hitP = all.filter(function (x) {
          return x.s.name.indexOf(q) >= 0 || x.p.country.indexOf(q) >= 0 ||
            x.p.visa_type.indexOf(q) >= 0 || x.s.supplier.indexOf(q) >= 0;
        });
        html = (hitC.length || hitP.length) ?
          (hitC.length ? '<section class="ed-sec"><div class="ed-h"><h2>目的地</h2>' +
            '<em>' + hitC.length + ' 个</em></div><div class="al-rows">' +
            hitC.map(countryRow).join('') + '</div></section>' : '') +
          (hitP.length ? '<section class="ed-sec"><div class="ed-h"><h2>相关产品</h2>' +
            '<em>' + hitP.length + ' 款</em></div><div class="h5-feat">' +
            hitP.map(prodCard).join('') + '</div></section>' : '') :
          '<div class="al-none"><b>没有找到「' + esc(q) + '」</b>' +
          '<s>换个国家名试试，或问客服有没有覆盖计划</s>' +
          '<a data-k="service">问客服</a></div>';
      } else {
        var rows = filtered();
        html =
          '<section class="ed-sec"><div class="ed-h"><h2>在售目的地</h2>' +
          '<em>' + onSale.length + ' 个国家/地区</em></div>' +
          '<div class="al-grid">' + onSale.map(destCard).join('') + '</div></section>' +

          '<section class="ed-sec"><div class="ed-h"><h2>按大洲浏览</h2></div>' +
          '<div class="ed-tabs">' + CONT.slice(1).map(function (g, i) {
            return '<a data-ct="' + i + '"' + (i === ct ? ' class="on"' : '') + '>' +
              esc(g[0]) + '</a>';
          }).join('') + '</div>' +
          '<div class="al-rows">' + CONT[ct + 1][1].map(countryRow).join('') + '</div>' +
          '<div class="al-note">灰色为尚未开放的目的地。客户端能看到哪些产品，' +
          '取决于供应商在 UBK 上品时是否勾选「上架 C 端」并投放到对应渠道组。</div>' +
          '</section>' +

          '<section class="ed-sec"><div class="ed-h"><h2>全部在售产品</h2>' +
          '<em>' + rows.length + ' / ' + all.length + ' 款</em></div>' +
          filtBar() +
          (rows.length ? '<div class="h5-feat">' + rows.map(prodCard).join('') + '</div>' :
            '<div class="al-none"><b>该条件下暂无在售产品</b>' +
            '<s>试着放宽送签地，或去掉「免面签」筛选</s>' +
            '<a data-reset>重置筛选</a></div>') +
          '</section>' +
          '<div class="h5-tip">套餐行展示的是该套餐的零售价与办理时长，可直接点选；' +
          '最终价格以下单页为准</div>';
      }
      box.innerHTML = html;

      $$('[data-c]', box).forEach(function (a) {
        a.onclick = function () { go('shop', 'c-' + a.dataset.c); };
      });
      $$('[data-p]', box).forEach(function (a) {
        a.onclick = function () { go('shop', 'p-' + a.dataset.p); };
      });
      /* 点具体套餐：记下他选的那一档，详情页直接停在那儿 */
      $$('[data-pk]', box).forEach(function (a) {
        a.onclick = function (e) {
          e.stopPropagation();
          var v = a.dataset.pk.split(':');
          S.cache.cPkg = +v[1];
          go('shop', 'p-' + v[0]);
        };
      });
      $$('[data-ct]', box).forEach(function (a) {
        a.onclick = function () { ct = S.cache.alCt = +a.dataset.ct; draw(); };
      });
      $$('[data-fk]', box).forEach(function (a) {
        a.onclick = function () {
          var k = a.dataset.fk;
          if (k === 'itv') f[k] = !f[k];
          else f[k] = a.dataset.fv;
          draw();
        };
      });
      var rs = $('[data-reset]', box);
      if (rs) rs.onclick = function () {
        S.cache.alF = f = { city: '', itv: false, ins: false, sort: 'all' };
        draw();
      };
      var sv = $('[data-k="service"]', box);
      if (sv) sv.onclick = function () { go('service'); };
    }

    m.innerHTML = pageH('全部目的地',
      '首页的搜索框、「全部目的地」、「查看全部产品」都进这一页，所以它要同时答三件事：' +
      '<b>这个国家能不能办、有哪些国家、有哪些具体产品</b>。' +
      '灰化的目的地是尚未开放的，保留展示是为了说明覆盖计划；' +
      '筛选与排序全部在本地完成，<b>不改变可售范围</b>——能看到哪些产品，' +
      '取决于供应商上品时的上架范围与渠道投放。') +
      h5page('全部目的地',
        '<div class="al-sch"><span class="ic">' +
        svgIcon('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4') + '</span>' +
        '<input id="alQ" placeholder="搜索国家 / 地区 / 签证类型" autocomplete="off">' +
        '<span class="clr" id="alClr">×</span></div>' +
        '<div id="alMain"></div>', '', '这一步在做什么',
        '同一个平台产品可能有多家供应商供货，结算价与时效各不相同。' +
        '客户看到的是<b>渠道零售价</b>，看不到结算价与供应商成本结构。' +
        '点国家进入该目的地页选签证类型与供应商，点产品直接进详情选套餐。', true);
    $('[data-back]', m).onclick = function () { go('shop'); };

    var inp = $('#alQ', m), clr = $('#alClr', m);
    inp.oninput = function () {
      q = inp.value.trim();
      clr.style.display = q ? 'block' : 'none';
      draw();
    };
    clr.onclick = function () { inp.value = ''; q = ''; clr.style.display = 'none'; draw(); };
    draw();
  });
};

/* ================= Tab 3 · 客服 ================= */
var QUICK = [
  ['我的材料交到哪里？', '电子件直接在小程序「我的材料」里逐项上传；需要原件的，寄到您订单详情里显示的收料地址即可，建议使用顺丰并保留单号。'],
  ['进度到哪一步了？', '在「我的订单」点「办理进度查询」，可以看到收料、审核、预约、递交、出签、返还每一步的时间戳。有新进展我们也会推送通知给您。'],
  ['收到补料通知后应如何处理？', '在「我的」→「补料通知」里查看具体哪几项不合格、要求是什么，按要求重新上传即可。补料有 7 天倒计时，最多三轮，超时会影响送签排期。'],
  ['能加急吗？', '可以。同一个产品下如果有加急套餐，会在详情页「套餐选择」里列出；已下单的想改加急，联系我可以帮您走改配。'],
  ['面签怎么准备？', '约到号后专员会发送面试时间、地点与辅导材料。面试须本人到场，请带齐护照原件与预约单，提前 30 分钟到馆。']
];
VIEWS['customer:service'] = function (m) {
  var log = S.cache.svc || (S.cache.svc = [
    ['a', '您好，这里是签证助手。材料、进度、补料、加急等常见问题，点下面的问题即可直接查看答复；需要人工协助请拨客服热线，工作时间 09:00–21:00。']
  ]);
  function draw() {
    $('.ph-body', m).innerHTML =
      '<div class="h5-svc-hd"><div class="av">信</div><div><b>签证助手 · 常见问题自助</b>' +
      '<s>点下方问题即时获得答复，需要人工请拨热线</s></div>' +
      '<a class="h5-btn" href="tel:4000006666">电话</a></div>' +
      '<div class="h5-chat">' + log.map(function (x) {
        return '<div class="bb ' + x[0] + '">' + (x[0] === 'a' ? '<i>信</i>' : '') +
          '<p>' + esc(x[1]) + '</p></div>';
      }).join('') + '</div>' +
      '<div class="h5-sec"><div class="h5-h"><span>常见问题</span></div>' +
      '<div class="h5-qask">' + QUICK.map(function (q, i) {
        return '<a data-q="' + i + '">' + esc(q[0]) + '</a>';
      }).join('') + '</div></div>' +
      '<div class="h5-sec"><div class="h5-h"><span>其他联系方式</span></div>' +
      '<a class="h5-row" href="tel:4000006666"><span class="lb">客服热线</span>' +
      '<span class="vl">400-000-6666</span><span class="ar">›</span></a>' +
      '<div class="h5-row"><span class="lb">工作时间</span><span class="vl">每日 09:00 – 21:00</span></div>' +
      '<div class="h5-row" data-k="orders"><span class="lb">查看我的订单</span><span class="vl mut">进度、补料、退款</span><span class="ar">›</span></div>' +
      '</div>' +
      '<div class="h5-tip">本页为常见问题自助答复，答案由运营统一维护；涉及具体订单的处理请走「我的订单」或拨打客服热线。</div>';

    $$('[data-q]', m).forEach(function (a) {
      a.onclick = function () {
        var q = QUICK[+a.dataset.q];
        log.push(['u', q[0]]);
        log.push(['a', q[1]]);
        draw();
        var c = $('.ph-body', m); c.scrollTop = c.scrollHeight;
      };
    });
    $$('[data-k]', m).forEach(function (a) { a.onclick = function () { go(a.dataset.k); }; });
  }
  m.innerHTML = pageH('在线客服',
    '客服是签证业务的高频入口——材料怎么交、进度到哪、补料怎么补，客户第一反应是找人问。' +
    '这里把高频问题做成一键快问，减少人工客服的重复应答量。') +
    h5page('在线客服', '', '', '这一步在做什么',
      '常见问题由运营端维护，点击即插入会话。<b>真正需要人工介入的（改配、加急、退款）会转到人工客服工单</b>，' +
      '客服可以直接看到该客户的订单、工单与补料记录，不需要客户复述。',
      false, 'service');
  draw();
  h5bind(m);
  return Promise.resolve();
};

/* ================= Tab 5 · 我的 ================= */
VIEWS['customer:me'] = function (m) {
  return Promise.all([api('/my/orders'), api('/my/supp')]).then(function (r) {
    var os = r[0].list, supp = r[1].list.filter(function (x) { return x.status === 'open'; });
    var u = S.user || {};
    /* 四个数字格与补料横幅原来这里也摆一份 —— 跟「我的订单」Tab 顶部一模一样，
       客人在两个页面看到同一组数字，点哪个都跳回订单页（唐美芳 2026-09-02：
       「个人资料页，现在有一些也是不对」）。待办中枢只留在订单 Tab，本页回归身份页。 */

    /* 2026-09-02 精简：原来这里有九行，其中「我的材料 / 填申请表 / 补料通知 /
       结果与签收 / 退款申请」五项全是<b>订单维度</b>的事，摆在个人中心里，
       客人点进去第一屏是一长串重复人名，还得自己挑是哪一单
       （唐美芳：「填申请表、补料通知、结果与签收、退款申请我觉得都是多余功能」）。
       我的判断：<b>功能不多余，菜单多余</b> —— 补料客人必须能响应、退款是客人的权利、
       申请表不填签不下来，一个都不能删；该删的是入口，全部收进订单详情，落到具体那一单、
       那个人。本页只留身份类与跨订单复用的：常用办签人、收货地址、客服。
       补料有时效，所以「我的订单」那行把待处理条数带出来，点进去就是订单列表。 */
    var rowsH = [
      ['orders', '我的订单', '全部 ' + os.length + ' 单' +
        (supp.length ? '　有 ' + supp.length + ' 条补料待处理' : '')],
      /* 常用办签人 / 收货地址：凯撒 PRD 4.14.4 的常旅客与收货地址，
         唐美芳 2026-08-31 要求在「我的」里给入口。存了以后下单不用重填护照信息。 */
      ['travelers', '常用办签人', '存好证件信息，下单直接选'],
      ['addrs', '收货地址', '签证办完寄回护照原件的地址'],
      ['service', '联系客服', '09:00 – 21:00 在线']
    ].map(function (x) {
      return '<div class="h5-row" data-k="' + x[0] + '"><span class="lb">' + x[1] + '</span>' +
        '<span class="vl mut">' + esc(x[2]) + '</span><span class="ar">›</span></div>';
    }).join('');

    var body =
      '<div class="h5-me"><div class="av">' + esc((u.name || '客').slice(0, 1)) + '</div>' +
      '<div class="tx"><b>' + esc(u.name || '') + '</b><s>' + esc(u.phone || '已实名认证') + '</s></div></div>' +
      '<div class="h5-sec">' + rowsH + '</div>' +
      '<div class="h5-sec"><div class="h5-h"><span>常见问题</span></div>' +
      FAQ.slice(0, 3).map(function (q, i) {
        return '<div class="h5-mat" data-q="' + i + '"><div class="hd"><span class="nm">' +
          '<b>' + esc(q[0]) + '</b></span><span class="rt"><em>⌄</em></span></div>' +
          '<div class="bd">' + esc(q[1]) + '</div></div>';
      }).join('') + '</div>' +
      '<div class="h5-brand">众信旅游 · 签证中心<s>客服热线 400-000-6666</s></div>';

    m.innerHTML = pageH('个人资料',
      '待办中枢在「我的订单」Tab，本页只保留身份信息与<b>跨订单复用</b>的三项：' +
      '常用办签人、收货地址、联系客服。' +
      '订单维度的事（材料、申请表、补料、进度、结果签收、退款）一律在订单详情里，' +
      '按人挂在每位办签人下面——摆在个人中心里客人只会看到一屏重复人名，还得自己猜是哪一单。') +
      h5page('个人资料', body, '', '这一步在做什么',
        '客户高频要做的事——支付、补料、看进度、签收——全部前移到订单页，' +
        '<b>补料角标挂在「我的订单」Tab 上</b>，避免客户漏看补料而错过送签排期。' +
        '本页只承接身份信息、常用证件与联系客服这类低频操作。', true);
    $('[data-back]', m).onclick = function () { go('orders'); };
    $$('[data-k]', m).forEach(function (a) { a.onclick = function () { go(a.dataset.k); }; });
    $$('[data-q]', m).forEach(function (a) {
      a.onclick = function () { a.classList.toggle('open'); };
    });
    h5bind(m);
  });
};
