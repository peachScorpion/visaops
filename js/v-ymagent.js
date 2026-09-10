/* ============================================================
   有米小程序 · AI 签证助手

   唐美芳 2026-09-02：「agent 签证助手最好弄一些真实场景，比如查签证产品、
   查签证订单、查签证进度、查签证政策等内容」。

   四类场景全部接真实接口、真实数据，不写死任何一条答复：
     查产品 → /shop/products      （与签证频道同一份货架和价格）
     查订单 → /my/orders          （销售本人 + 本门店，含直客单）
     查进度 → /my/orders 里每位办签人的 progress
     查政策 → /shop/policies      （UOM「签证政策内容」里发布的那批）

   意图识别是本地关键词规则，不接大模型：演示要的是「问得出、答得准、
   点得进去」，规则可控、离线也能跑；哪条问句命中哪个场景一目了然，
   现场被追问也解释得清。
   ============================================================ */

/* 快捷问题按场景分组，点一下等于把这句话问出去。
   每组都放能问出真实数据的句子，避免演示时点到一句查不出东西的。 */
var YMA_QUICK = [
  ['查签证产品', ['美国签证多少钱', '有哪些国家的签证', '日本签证怎么卖']],
  ['查签证订单', ['我的订单', '有哪些待付款的单', '本月成交了多少']],
  ['查办理进度', ['客人签证办到哪一步了', '有没有快超期的单']],
  ['查签证政策', ['美国签证要面签吗', '哪些国家免签', '澳大利亚是电子签吗']]
];

/* 国家名 → 用于在问句里抓出目的地。取自产品库里真实在售的国家，
   外加几个常被问到、只有政策没有产品的（免签国）。 */
var YMA_COUNTRIES = ['美国', '日本', '英国', '韩国', '澳大利亚', '新加坡',
                     '泰国', '马来西亚', '加拿大', '法国', '德国', '意大利'];

function ymaCountry(q) {
  for (var i = 0; i < YMA_COUNTRIES.length; i++) {
    if (q.indexOf(YMA_COUNTRIES[i]) >= 0) return YMA_COUNTRIES[i];
  }
  return '';
}

/* 意图判定：按「越具体越优先」排，进度要排在订单前面——
   「客人的单办到哪了」同时含「单」和「办到哪」，问的其实是进度。 */
function ymaIntent(q) {
  if (/进度|办到哪|到哪一步|出签|什么时候好|超期|催/.test(q)) return 'progress';
  if (/政策|面签|免签|电子签|材料要求|要不要|需不需要|有效期|停留/.test(q)) return 'policy';
  if (/订单|我的单|待付款|成交|业绩|多少单|VS-/i.test(q)) return 'order';
  if (/多少钱|价格|报价|怎么卖|产品|哪些国家|有什么/.test(q)) return 'product';
  if (ymaCountry(q)) return 'product';        // 只报了个国家名，默认当查产品
  return 'unknown';
}

/* ---- 四个场景各自的答复渲染。返回 Promise<html> ---- */

function ymaProduct(q) {
  var country = ymaCountry(q);
  return api('/shop/products' + (country ? '?country=' + encodeURIComponent(country) : ''))
    .then(function (j) {
      var list = j.list || [];
      if (!list.length) {
        return ymaText('货架上暂时没有' + (country ? '「' + country + '」的' : '') +
          '签证产品。可查询其他国家，或前往「签证频道」查看全部在售产品。');
      }
      /* 只报国家名时给一句总览，再列产品——销售当着客人面要先给个数 */
      var head = country
        ? '<b>' + esc(country) + '</b>签证在售 <b>' + list.length + '</b> 条产品，' +
          '价格与「签证频道」一致：'
        : '目前在售 <b>' + list.length + '</b> 条签证产品，覆盖 <b>' +
          uniq(list.map(function (x) { return x.country; })).join('、') + '</b>：';
      /* 价格挂在供应商报价上（price_min/price_max），产品层没有价格字段——
         一个平台产品可能有多家供应商各自报价，取最低的那档做「起」价。 */
      return ymaText(head) + '<div class="yma-cards">' +
        list.slice(0, 6).map(function (p) {
          var sups = p.suppliers || [];
          var lo = sups.reduce(function (a, s2) {
            return (a == null || (s2.price_min != null && s2.price_min < a)) ? s2.price_min : a;
          }, null);
          var lead = sups.reduce(function (a, s2) {
            return (a == null || (s2.lead_min != null && s2.lead_min < a)) ? s2.lead_min : a;
          }, null);
          var sup = sups[0] || {};
          return '<a class="yma-card" data-yma-p="' + (sup.sup_product_id || '') + '">' +
            '<div class="t">' + esc(sup.name || p.name ||
              (p.country + (p.visa_type || ''))) + '</div>' +
            '<div class="m">' + esc(p.country) + ' · ' + esc(p.visa_type || '') +
            (p.need_interview ? ' · 需面签' : ' · 免面签') +
            (lead != null ? ' · 最快 ' + lead + ' 工作日' : '') +
            (sups.length > 1 ? ' · ' + sups.length + ' 家供应商可比价' : '') + '</div>' +
            '<div class="p"><b>' + ymMoney(lo || 0) + '</b>' +
            '<s>起</s><em>看详情 ›</em></div></a>';
        }).join('') + '</div>' +
        (list.length > 6 ? ymaText('还有 ' + (list.length - 6) + ' 条，去「签证频道」看全部。') : '');
    });
}

function ymaOrder(q) {
  return api('/my/orders').then(function (j) {
    var all = j.list || [];
    if (!all.length) return ymaText('您名下暂无签证订单。');
    var list = all, tip = '您名下共 <b>' + all.length + '</b> 张签证订单';
    if (/待付款/.test(q)) {
      list = all.filter(function (o) { return o.status === 'created'; });
      tip = '待付款 <b>' + list.length + '</b> 张';
    } else if (/成交|业绩|本月|多少单/.test(q)) {
      var paid = all.filter(function (o) { return o.status !== 'created' && o.status !== 'cancelled'; });
      var amt = paid.reduce(function (a, o) { return a + (o.amount || 0); }, 0);
      return ymaText('已成交 <b>' + paid.length + '</b> 张，合计 <b>' + ymMoney(amt) + '</b>。' +
        '其中待付款 ' + all.filter(function (o) { return o.status === 'created'; }).length +
        ' 张、已完成 ' + all.filter(function (o) { return o.status === 'done'; }).length + ' 张。') +
        ymaOrderCards(paid.slice(0, 4));
    }
    var m = q.match(/VS-?\d+/i);
    if (m) {
      var no = m[0].toUpperCase().replace('VS', 'VS-').replace('--', '-');
      list = all.filter(function (o) { return o.no.indexOf(no.replace('VS-', '')) >= 0; });
      tip = list.length ? '找到订单 <b>' + list[0].no + '</b>' : '没找到订单号含「' + esc(m[0]) + '」的单';
    }
    if (!list.length) return ymaText(tip + '。');
    return ymaText(tip + '：') + ymaOrderCards(list.slice(0, 5)) +
      (list.length > 5 ? ymaText('还有 ' + (list.length - 5) + ' 张，去「订单」页看全部。') : '');
  });
}

function ymaOrderCards(list) {
  if (!list.length) return '';
  return '<div class="yma-cards">' + list.map(function (o) {
    return '<a class="yma-card" data-yma-o="' + esc(o.no) + '">' +
      '<div class="t">' + esc(o.no) + '<i class="st">' +
      esc(ORD_ST_CN && ORD_ST_CN[o.status] ? ORD_ST_CN[o.status] : o.status_text) + '</i></div>' +
      '<div class="m">' + esc(o.product || '') + '</div>' +
      '<div class="p"><b>' + ymMoney(o.amount) + '</b>' +
      '<s>' + o.pax + ' 人 · ' + (o.depart_date ? d10(o.depart_date) + ' 出发' : '日期待定') + '</s>' +
      '<em>看详情 ›</em></div></a>';
  }).join('') + '</div>';
}

function ymaProgress(q) {
  return api('/my/orders').then(function (j) {
    var all = (j.list || []).filter(function (o) {
      return o.status !== 'cancelled' && o.status !== 'created';
    });
    /* 把办签人摊平：进度是按人走的，一单多人时各走各的 */
    var rows2 = [];
    all.forEach(function (o) {
      (o.applicants || []).forEach(function (a) {
        if (a.state !== 'normal') return;
        rows2.push({ no: o.no, name: a.name, prog: a.progress,
                     ptext: a.progress_text, result: a.result, product: o.product });
      });
    });
    if (!rows2.length) return ymaText('当前没有在办的签证工单——已成交的单要等财务确认收款到账，才会进入办理。');
    /* 用真实办签人姓名去问句里反查，而不是拿正则从问句里猜人名——
       「客人签证办到哪一步了」被正则猜成人名「客人签证」，就查不出东西了。 */
    var hit = rows2.filter(function (r) { return r.name && q.indexOf(r.name) >= 0; });
    var who = hit.length ? hit[0].name : '';
    if (!hit.length) hit = rows2;
    /* 按进度归堆，销售一眼看出卡在哪一环 */
    var by = {};
    hit.forEach(function (r) { (by[r.ptext] = by[r.ptext] || []).push(r); });
    var sum = Object.keys(by).map(function (k) {
      return k + ' <b>' + by[k].length + '</b> ' + (who ? '单' : '人');
    }).join('　·　');
    var head = who
      ? '<b>' + esc(who) + '</b>名下在办 <b>' + hit.length + '</b> 单：' + sum
      : '在办 <b>' + hit.length + '</b> 人：' + sum;
    return ymaText(head) + ymaProgCards(hit.slice(0, 6)) +
      (hit.length > 6 ? ymaText('还有 ' + (hit.length - 6) + ' 人，去「订单」里逐单看。') : '');
  });
}

function ymaProgCards(list) {
  return '<div class="yma-cards">' + list.map(function (r) {
    return '<a class="yma-card" data-yma-o="' + esc(r.no) + '">' +
      '<div class="t">' + esc(r.name) + '<i class="st">' + esc(r.ptext) + '</i></div>' +
      '<div class="m">' + esc(r.product || '') + '</div>' +
      '<div class="p"><s>订单 ' + esc(r.no) + '</s>' +
      (r.result ? '<b class="rs">' + esc(r.result) + '</b>' : '') +
      '<em>看详情 ›</em></div></a>';
  }).join('') + '</div>';
}

function ymaPolicy(q) {
  var country = ymaCountry(q);
  return api('/shop/policies' + (country ? '?country=' + encodeURIComponent(country) : ''))
    .then(function (j) {
      var list = j.list || [];
      if (/免签/.test(q)) list = list.filter(function (p) { return p.kind === 'free'; });
      else if (/电子签/.test(q)) list = list.filter(function (p) { return p.kind === 'evisa'; });
      if (!list.length) {
        return ymaText('政策库里暂时没有' + (country ? '「' + country + '」的' : '') +
          '对应条目。这些内容由运营在 UOM「签证政策内容」里维护，发布后这里就能查到。');
      }
      return ymaText((country ? '<b>' + esc(country) + '</b>相关政策 ' : '查到 ') +
        '<b>' + list.length + '</b> 条：') +
        '<div class="yma-cards">' + list.slice(0, 5).map(function (p) {
          return '<div class="yma-card pol">' +
            '<div class="t">' + esc(p.title) +
            '<i class="kd">' + esc({ free: '免签', evisa: '电子签', notice: '须知' }[p.kind] || p.kind) +
            '</i></div>' +
            '<div class="m">' + esc(p.summary || '') + '</div>' +
            (p.stay ? '<div class="p"><s>可停留 ' + esc(p.stay) + '</s></div>' : '') +
            (p.effect_at ? '<div class="p"><s>生效 ' + d10(p.effect_at) + '</s>' +
              (p.source ? '<s>来源 ' + esc(p.source) + '</s>' : '') + '</div>' : '') +
            '</div>';
        }).join('') + '</div>';
    });
}

function ymaText(html) { return '<div class="yma-tx">' + html + '</div>'; }
function uniq(a) {
  return a.filter(function (x, i) { return x && a.indexOf(x) === i; });
}

/* ---------------- 页面 ---------------- */
VIEWS['youmi:agent'] = function (m) {
  var LOG = [];        // {who:'a'|'u', html}

  function greet() {
    return ymaText('您好，我是<b>签证助手</b>。产品报价、订单、办理进度、目的地政策，' +
      '以上四类问题均可查询，答案取自系统实时数据，非预置话术。') +
      '<div class="yma-qs">' + YMA_QUICK.map(function (g) {
        return '<div class="g"><s>' + esc(g[0]) + '</s>' +
          g[1].map(function (q) {
            return '<a data-yma-q="' + esc(q) + '">' + esc(q) + '</a>';
          }).join('') + '</div>';
      }).join('') + '</div>';
  }

  function draw() {
    var body =
      '<div class="yma-log">' +
      LOG.map(function (x) {
        return x.who === 'u'
          ? '<div class="yma-row u"><div class="yma-b u">' + esc(x.text) + '</div></div>'
          : '<div class="yma-row a"><i class="yma-av">AI</i><div class="yma-b">' + x.html + '</div></div>';
      }).join('') +
      '</div>';
    var foot =
      '<div class="yma-inp"><input id="yma-q" placeholder="问点什么，比如：美国签证多少钱" ' +
      'autocomplete="off"><button class="cta" data-yma-send>发送</button></div>';

    m.innerHTML = pageH('有米小程序 · AI 签证助手',
      '销售在客人面前最常被问的四类问题——产品报价、订单、办理进度、目的地政策——' +
      '在这里一句话问出来。<b>答案全部取自系统实时数据</b>：产品走签证频道同一份货架，' +
      '订单与进度走销售本人和本门店的真实单据，政策取运营在 UOM 里已发布的条目。' +
      '意图识别是本地关键词规则，不依赖外部大模型，断网也能演示。') +
      ymPage('AI 签证助手', body, foot, '这一步在做什么',
        '销售不用在几个页面之间来回翻：问一句就能拿到结果，' +
        '结果卡片点进去就是产品详情或订单详情，接着就能代客下单、催办、发链接给客人。',
        false, 'agent', '', 'ym');
    bind();
    /* 滚到最新一条。真正带滚动条的是手机壳的 .ph-body，不是 .yma-log 本身——
       滚错容器的话，新答复会一直被底部输入条挡着，看起来像没回应。 */
    var log = $('.yma-log', m);
    if (log) {
      var sc = log.parentElement;
      while (sc && sc !== m && sc.scrollHeight <= sc.clientHeight) sc = sc.parentElement;
      (sc || log).scrollTop = (sc || log).scrollHeight;
    }
  }

  function push(who, v) {
    if (who === 'u') LOG.push({ who: 'u', text: v });
    else LOG.push({ who: 'a', html: v });
  }

  function send(q) {
    q = (q || '').trim();
    if (!q) return;
    push('u', q);
    push('a', '<div class="yma-load">正在查…</div>');
    draw();
    var intent = ymaIntent(q);
    var run = intent === 'product' ? ymaProduct
            : intent === 'order' ? ymaOrder
            : intent === 'progress' ? ymaProgress
            : intent === 'policy' ? ymaPolicy
            : null;
    var p = run ? run(q) : Promise.resolve(
      ymaText('这个问题我暂时答不了。我能查的是这四类：<b>产品报价 / 订单 / 办理进度 / 目的地政策</b>，' +
        '换个说法再问一次，或者点下面的常见问题。') +
      '<div class="yma-qs">' + YMA_QUICK.map(function (g) {
        return '<div class="g"><s>' + esc(g[0]) + '</s>' +
          g[1].slice(0, 2).map(function (x) {
            return '<a data-yma-q="' + esc(x) + '">' + esc(x) + '</a>';
          }).join('') + '</div>';
      }).join('') + '</div>');

    p.then(function (html) {
      LOG[LOG.length - 1] = { who: 'a', html: html };
      draw();
    }).catch(function (e) {
      LOG[LOG.length - 1] = { who: 'a',
        html: ymaText('查询失败：' + esc(e.message || e)) };
      draw();
    });
  }

  function bind() {
    ymBind(m, 'agent');
    $$('[data-yma-q]', m).forEach(function (a) {
      a.onclick = function () { send(a.dataset.ymaQ); };
    });
    $$('[data-yma-p]', m).forEach(function (a) {
      a.onclick = function () { if (a.dataset.ymaP) go('book', a.dataset.ymaP); };
    });
    $$('[data-yma-o]', m).forEach(function (a) {
      a.onclick = function () { go('odetail', a.dataset.ymaO); };
    });
    var inp = $('#yma-q', m), btn = $('[data-yma-send]', m);
    if (btn) btn.onclick = function () { var v = inp.value; inp.value = ''; send(v); };
    if (inp) inp.onkeydown = function (e) {
      if (e.key === 'Enter') { var v = inp.value; inp.value = ''; send(v); }
    };
  }

  push('a', greet());
  draw();
  return Promise.resolve();
};
