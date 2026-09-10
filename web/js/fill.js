/* 免登录填表页（客人手机端）
 * 只调三个公开接口：/api/pub/task、/api/pub/task/save、/api/pub/task/submit。
 * 页面上出现的每一个字段、每一句填报说明都来自接口返回，不在前端编造任何数据。
 */
(function () {
  'use strict';

  var ROOT = document.getElementById('root');
  var TOKEN = (function () {
    var m = /[?&]token=([^&#]+)/.exec(location.search);
    return m ? decodeURIComponent(m[1]) : '';
  })();

  /* 接口前缀按当前页面路径现算，别写死。
     线上 fill.html 挂在 /visaops/ 下，nginx 只把 /visaops/ 转给这个服务；
     写死 '/api/pub/task' 在本地能跑（本地服务器两条路径都接），一上线就 404，
     客人扫码打开只看到「链接无效」（唐美芳 2026-09-01 验收时发现）。 */
  var API = location.pathname.replace(/[^/]*$/, '') + 'api';

  var D = null;        // /pub/task 返回的整包数据
  var ASK = [];        // 客人要答的题（src=ask），按板块顺序摊平
  var AUTO = [];       // 系统已带出的格子（src=ocr/sys）
  var TIMERS = {};     // 每题的防抖定时器
  var OPEN = {};       // 板块展开状态

  /* ---------------- 工具 ---------------- */
  function h(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return [].slice.call((el || document).querySelectorAll(sel)); }

  function api(path, body) {
    return fetch(API + '/pub/task' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || '请求失败'); e.code = r.status; throw e; }
        return j;
      });
    });
  }

  /* 是非题识别：完全依据后端下发的 notice / fill_note 文案，
     官方 DS-160 上是单选按钮的题，字段说明里写着「单选"是的"或"不"」。 */
  function isYesNo(f) {
    var n = f.notice || '', fn = f.fill_note || '', t = n + ' ' + fn;
    if (/单选[“"]?是的?[”"]?或/.test(t)) return true;          // 官方就是单选按钮
    if (/^是否/.test(f.name) || /吗？?$/.test(f.name)) return true;
    if (/是否[^。\n]*？/.test(fn)) return true;                 // 填报说明本身是一句是非问句
    if (/选[“"]是/.test(t) && multi(f)) return true;            // 多条小问题打包在一格里
    return false;
  }
  /* 一格里塞了多条编号小问题（安全/背景那几节） */
  function multi(f) { return /(^|\n)\s*\d+、/.test(f.fill_note || ''); }
  /* 选「是」时官方要求补充说明的题 */
  function needExplain(f) {
    var t = (f.notice || '') + ' ' + (f.fill_note || '');
    return /解释|需提供|需填写|必须填|需选择|需补充|请指定|填写具体/.test(t);
  }
  /* 值编码：是非题存「是：说明」/「否」，纯文本题原样存 */
  function splitVal(v) {
    v = v || '';
    if (v === '否' || v === '是') return { yn: v, ex: '' };
    var m = /^是：([\s\S]*)$/.exec(v);
    if (m) return { yn: '是', ex: m[1] };
    return { yn: '', ex: v };
  }
  function joinVal(yn, ex) {
    if (yn === '否') return '否';
    if (yn === '是') return ex ? '是：' + ex : '是';
    return ex || '';
  }
  function dateText(s) { return (s || '').replace(/:\d\d$/, ''); }

  /* ---------------- 整页状态 ---------------- */
  function stateView(kind, icon, title, sub, boxHtml) {
    ROOT.innerHTML =
      '<div class="state ' + kind + '"><div class="ic">' + icon + '</div>' +
      '<h2>' + h(title) + '</h2><p class="sub">' + h(sub) + '</p>' +
      (boxHtml || '') +
      '<p class="tip">众信旅游 · 签证在线填表</p></div>';
  }
  function errView(e) {
    var code = e && e.code;
    if (code === 404) {
      return stateView('bad', '✕', '链接无效', '没有找到这个填表链接对应的表单',
        '<div class="box">可能的原因：<ol><li>链接被转发时截断了，请复制完整链接后重新打开</li>' +
        '<li>顾问已重新生成了新的填表链接，请以最新一条为准</li></ol></div>');
    }
    if (code === 403) {
      return stateView('warn', '!', '链接已过期', '为保护您的证件信息，填表链接设有有效期',
        '<div class="box"><b>处理方式</b>请联系为您服务的签证顾问重新发送链接，' +
        '您之前已经填过的内容都还在，不用重填。</div>');
    }
    stateView('bad', '!', '打开失败', (e && e.message) || '网络异常，请稍后重试',
      '<div class="box">请检查网络后下拉刷新页面；若持续失败，请联系您的顾问。</div>');
  }
  function lockedView(d) {
    stateView('ok', '✓', '表单已由专员确认', '您填写的内容已锁定，不能再修改了',
      '<div class="box"><b>' + h(d.name) + '</b> · ' + h(d.form_code || '') + '<br>' +
      '订单号 ' + h(d.ord_no || '') + '<br><br>' +
      '如果发现填错了需要更正，请尽快联系为您服务的顾问，由顾问撤回后再修改。</div>');
  }

  /* ---------------- 数据整理 ---------------- */
  function digest() {
    ASK = []; AUTO = [];
    (D.sections || []).forEach(function (s) {
      (s.items || []).forEach(function (f) {
        if (f.src === 'ask') { f._sec = s.name; ASK.push(f); }
        else if (f.src === 'ocr' || f.src === 'sys') AUTO.push(f);
        // src=agent 是专员在官网上的操作，客人看不到，不渲染
      });
    });
  }

  /* ---------------- 材料 ----------------
     唐美芳 2026-08-31：「只有查看样例，没有提交的入口啊，可不可以有个整体的
     填写页面，现在这样太散了，这个页面后续分享客人之后，还能直接填写呢」。
     所以把材料并进这张分享页：一个链接发过去，表填了、材料也传了，
     不用再让客人回小程序里自己找。
     材料按「客人要做的动作」分三组，而不是按必须/建议分——
     客人关心的是「我现在要干什么」，不是「这项重不重要」。 */
  var MAT_GROUP = [
    ['upload', '先拍照传给我们', '上传后由签证专员先行预审，不合格将提前告知，避免面签当天才发现问题'],
    /* 美签的支持性文件是面签当天本人带着，没有寄给我们这一步
       （唐美芳 2026-09-03 核对美国签证中心官网后指出，原材料库配错了）。
       申根、日本那类交代办社送签的仍然有 mail，所以这一组保留、只是美签用不到。 */
    ['mail', '要寄原件过来', '这些必须是纸质原件，寄到下面这个地址，不能拍照代替'],
    ['carry', '面签当天带原件', '不用现在寄给我们，面签那天带着纸质原件去使领馆']
  ];
  function matGroupOf(m) {
    var w = m.provide_way || [];
    if (w.indexOf('upload') >= 0) return 'upload';
    if (w.indexOf('mail') >= 0) return 'mail';
    return 'carry';
  }
  var MAT_ST = { wait: ['未提交', ''], review: ['待审核', 'w'], pass: ['已通过', 'g'],
                 rejected: ['被退回', 'r'] };
  function matCard(m) {
    var st = MAT_ST[m.status] || MAT_ST.wait;
    var can = (m.provide_way || []).indexOf('upload') >= 0;
    var smp = m.sample && m.sample.files && m.sample.files[0];
    /* 库里存的是 'reject'（见 /mat/review）；'rejected' 是历史笔误，两种都认 */
    return '<div class="mat' + (m.status === 'reject' || m.status === 'rejected' ? ' bad' : '') + '" id="mat' + m.id + '">' +
      '<div class="mt"><div class="nm">' + h(m.mat_name) +
      (m.necessity === 'must' ? '<span class="tag risk">必交</span>' : '') +
      '</div><span class="tag ' + st[1] + '">' + st[0] + '</span></div>' +
      '<p class="note">' + h(m.attr_text) + ' × ' + m.copies +
      (m.require_text ? ' · ' + h(m.require_text) : '') + '</p>' +
      (m.ai_msg ? '<p class="ai">' + h(m.ai_msg) + '</p>' : '') +
      (m.reject_reason ? '<p class="must">被退回：' + h(m.reject_reason) + '</p>' : '') +
      (m.file_name ? '<p class="note">已上传：' + h(m.file_name) + '</p>' : '') +
      '<div class="mact">' +
      (smp ? '<a class="mbtn" href="' + h(smp.url) + '" target="_blank">看样例</a>' : '') +
      (can
        ? '<label class="mbtn up' + (m.status === 'wait' ? ' on' : '') + '">' +
          (m.status === 'wait' ? '上传' : '重新上传') +
          '<input type="file" accept="image/*,.pdf" data-up="' + m.id + '"></label>'
        : '<span class="mbtn off">' +
          (matGroupOf(m) === 'mail' ? '寄原件，不能线上交' : '面试当天携带') + '</span>') +
      '</div></div>';
  }
  function matHtml() {
    var list = D.materials || [];
    if (!list.length) return '';
    var ms = D.mat_stat || {};
    var groups = MAT_GROUP.map(function (g) {
      var items = list.filter(function (m) { return matGroupOf(m) === g[0]; });
      if (!items.length) return '';
      var left = items.filter(function (m) {
        return g[0] === 'upload' && m.status !== 'pass' && m.status !== 'review';
      }).length;
      return '<div class="mgrp"><div class="gh"><b>' + g[1] + '</b>' +
        '<em>' + (left ? left + ' 项待传' : items.length + ' 项') + '</em></div>' +
        '<p class="gnote">' + g[2] + '</p>' +
        items.map(matCard).join('') +
        (g[0] === 'mail' && D.mail_addr
          ? '<div class="maddr"><b>寄到这里</b>' +
            '<div class="ad">' + h(D.mail_addr.region + ' ' + D.mail_addr.detail) + '</div>' +
            '<div class="ad">' + h(D.mail_addr.contact + '　' + D.mail_addr.phone) + '</div>' +
            '<button class="mbtn" data-copyaddr>复制地址</button></div>'
          : '') +
        '</div>';
    }).join('');
    return '<div class="mwrap" id="matpane">' +
      '<div class="mhead"><b>要交的材料共 ' + (ms.total || list.length) + ' 项</b>' +
      '<s>已通过 ' + (ms.pass || 0) + ' 项 · 待审核 ' + (ms.review || 0) + ' 项</s></div>' +
      groups + '</div>';
  }

  /* ---------------- 进度跟踪 ----------------
     唐美芳 2026-08-31 给的「闪签原型」里客人端是三步：
     上传资料 / 填申请表 / 进度跟踪。这张分享页原来只有前两步——
     客人把材料交完、表填完，就不知道办到哪一步了，只能回头问顾问。
     时间轴分三段跟小程序里那版一致：办理状态 / 预约通知 / 出签配还。 */
  function tkRow(date, text, extra, now) {
    return '<div class="tk-it' + (now ? ' now' : '') + '">' +
      '<span class="d">' + (date ? h(dateText(date).replace(/-/g, '/')) : '') + '</span>' +
      '<div class="c">' + h(text) +
      (extra ? '<s>' + h(extra) + '</s>' : '') + '</div></div>';
  }
  function trackHtml() {
    var t = D.track;
    if (!t) return '';
    /* 事件由后端 cust_events() 翻译好，只有 {text, at, key}——
       内部动作名与 detail 不下发，客人看不到工单号、应付金额、批次号。
       分段按 text 判：进度名本身就说明了它属于哪一段。 */
    var evs = t.events || [];
    var isAppt = function (e) { return (e.text || '').indexOf('预约') >= 0; };
    var isOut = function (e) {
      return ['已出结果', '已出签', '资料已寄出', '已签收'].some(function (k) {
        return (e.text || '').indexOf(k) >= 0;
      });
    };
    var main = evs.filter(function (e) { return !isAppt(e) && !isOut(e); });
    var out = evs.filter(isOut);
    var mainH = main.length
      ? main.map(function (e, i) {
        return tkRow(e.at, e.text, '', i === main.length - 1);
      }).join('')
      : '<div class="tk-it none">暂无相关信息</div>';
    var apptH = t.appt_at
      ? tkRow(t.appt_at, '面签 / 录指纹', '地点：' + (t.appt_place || '以使领馆通知为准'), true)
      : (evs.filter(isAppt).map(function (e) { return tkRow(e.at, e.text); }).join('')
        || '<div class="tk-it none">尚未预约，专员取得预约号后将第一时间通知您</div>');
    var outH = out.length
      ? out.map(function (e) { return tkRow(e.at, e.text); }).join('')
      : '<div class="tk-it none">尚未出结果</div>';
    if (t.express_no) {
      outH += tkRow('', '资料已寄出', (t.express || '') + '　单号：' + t.express_no, true);
    }
    return '<div class="mwrap">' +
      '<div class="mhead"><b>当前进度：' + h(t.progress_text || '') + '</b>' +
      '<s>进度由签证专员在后台推进，这里实时显示，不用另外问顾问</s></div>' +
      '<div class="mgrp"><div class="tk-g">办理状态</div>' + mainH + '</div>' +
      '<div class="mgrp"><div class="tk-g">预约通知</div>' + apptH + '</div>' +
      '<div class="mgrp"><div class="tk-g">出签 / 配还</div>' + outH + '</div>' +
      '</div>';
  }

  /* ---------------- 渲染 ---------------- */
  var PANE = 'form';   // form | mat | track
  /* 三步的顺序照原型：先交材料，再填表，最后看进度——这也是客人实际的做事顺序 */
  function tabsHtml() {
    if (!(D.materials || []).length) return '';
    var ms = D.mat_stat || {};
    var left = (ms.total || 0) - (ms.pass || 0) - (ms.review || 0);
    var tab = function (k, t, n) {
      return '<a data-pane="' + k + '"' + (PANE === k ? ' class="on"' : '') + '>' + t +
        (n > 0 ? '<i>' + n + '</i>' : '') + '</a>';
    };
    return '<div class="tabs">' +
      tab('mat', '交材料', left) +
      tab('form', '填申请表', (D.stat || {}).ask_left) +
      tab('track', '看进度', 0) + '</div>';
  }
  function render() {
    var st = D.stat || {};
    var pane = PANE === 'mat' ? matHtml()
      : PANE === 'track' ? trackHtml()
        : noticeHtml() + autoCard() + secList();
    var html = '<div class="wrap">' + headHtml(st) + tabsHtml() + pane +
      '</div>' + (PANE === 'form' ? barHtml(st) : '');
    ROOT.innerHTML = html;
    bind();
  }

  function headHtml(st) {
    var expired = '';
    if (D.expire) expired = '有效期至 ' + dateText(D.expire);
    return '<div class="hd">' +
      '<div class="brand"><i>众</i>众信旅游 · 签证在线填表</div>' +
      '<h1>' + h(D.country === '美国' ? '美国 ' : '') +
        h(D.form_code || '') + ' ' + h(shortFormName()) + '</h1>' +
      '<p class="who">办签人 <b>' + h(D.name) + '</b> · 订单号 ' + h(D.ord_no || '—') + '</p>' +
      '<div class="meta">' +
        (D.product ? '<span class="chip">' + h(D.product) + '</span>' : '') +
        (D.ver_no ? '<span class="chip">表单版本 ' + h(D.ver_no) + '</span>' : '') +
        (expired ? '<span class="chip w">' + h(expired) + '</span>' : '') +
        (D.status === 'submitted' ? '<span class="chip b">已提交，顾问复核中</span>' : '') +
      '</div>' + progHtml(D.stat || {}) + '</div>';
  }
  function shortFormName() {
    var n = D.form_name || '';
    return n.replace(/^DS-160\s*/, '').replace(/\s*完整字段$/, '') || '在线申请表';
  }

  function progHtml(st) {
    var left = st.ask_left == null ? 0 : st.ask_left;
    var total = st.ask_total || ASK.length;
    var done = total - left;
    var pct = total ? Math.round(done * 100 / total) : 100;
    return '<div class="prog"><div id="prog">' + progInner(left, done, total, pct) + '</div>' +
      '<div class="save" id="savetip"></div></div>';
  }
  function progInner(left, done, total, pct) {
    return '<div class="row">' +
      '<div class="left' + (left ? '' : ' done') + '">' +
        (left ? '还有 <em>' + left + '</em> 题要答' : '✓ ' + total + ' 题都答完了') +
      '</div>' +
      '<div class="right">已答 ' + done + '/' + total + '</div></div>' +
      '<div class="bar"><i class="' + (left ? '' : 'done') + '" style="width:' + pct + '%"></i></div>';
  }
  function refreshProg() {
    var box = document.getElementById('prog');
    if (!box) return;
    var st = D.stat || {};
    var total = st.ask_total || ASK.length;
    var left = st.ask_left == null ? 0 : st.ask_left;
    box.innerHTML = progInner(left, total - left, total, total ? Math.round((total - left) * 100 / total) : 100);
    var b = $('#btn-submit');
    if (b) $('.info b', b.parentNode).textContent = left ? '还有 ' + left + ' 题未答' : '全部答完了';
  }

  function noticeHtml() {
    if (!D.notice) return '';
    return '<div class="notice">' + h(D.notice) + '</div>';
  }

  /* 卖点区：系统已经带出来的格子 —— 只显示接口真的返回了值的那些 */
  function autoCard() {
    var filled = AUTO.filter(function (f) { return f.value; });
    if (!filled.length) return '';
    var rows = filled.map(function (f) {
      return '<div class="auto-row"><div class="k">' + h(f.name) + '</div>' +
        '<div class="v">' + h(f.value) + '</div></div>';
    }).join('');
    return '<div class="card" id="autocard">' +
      '<div class="ch" data-toggle="autocard"><div class="auto-ic">✓</div>' +
      '<div class="t"><b>已经帮您填好 ' + filled.length + ' 格</b>' +
      '<s>护照、订单里已有的信息，您不用再填一遍</s></div><div class="ar">▾</div></div>' +
      '<div class="cb"><div class="auto-list">' + rows + '</div>' +
      '<div class="auto-foot">以上内容取自您的护照资料与订单信息。如发现与证件不一致，' +
      '请直接联系顾问更正，不要在本页修改。</div></div></div>';
  }

  function secList() {
    var out = [], n = 0, firstOpened = false;
    (D.sections || []).forEach(function (s) {
      var items = (s.items || []).filter(function (f) { return f.src === 'ask'; });
      if (!items.length) return;
      n++;
      var left = items.filter(function (f) { return f.required && !f.value; }).length;
      var risky = items.some(function (f) { return f.risk; });
      var key = 'sec' + n;
      // 默认只展开第一个还有未答题的板块：一次一屏，别让客人一开页就看见 34 道题
      if (OPEN[key] === undefined) OPEN[key] = left > 0 && !firstOpened;
      if (OPEN[key]) firstOpened = true;
      out.push('<div class="sec' + (OPEN[key] ? ' open' : '') + (risky ? ' risky' : '') + '" id="' + key + '">' +
        '<div class="sh" data-toggle="' + key + '"><div class="n">' + n + '</div>' +
        '<div class="t">' + h(cleanSec(s.name)) + '</div>' +
        '<div class="st' + (left ? '' : ' ok') + '">' + (left ? left + ' 题待答' : '已答完') + '</div>' +
        '<div class="ar">▾</div></div>' +
        '<div class="sb">' +
        (risky ? '<p class="risk-tip"><b>这一节是高风险题。</b>' +
          '填错可能导致拒签；被认定为故意虚假陈述的，会留下永久不可入境的记录。' +
          '请务必按事实回答，拿不准的先问您的顾问，不要凭印象猜。</p>' : '') +
        items.map(qHtml).join('') + '</div></div>');
    });
    return out.join('');
  }
  function cleanSec(n) { return String(n || '').replace(/^\d+\.\s*/, ''); }

  function qHtml(f) {
    var v = splitVal(f.value);
    var yn = isYesNo(f);
    var ex = needExplain(f);
    var s = '<div class="q' + (f.risk ? ' risk' : '') + '" id="q' + f.field_id + '" data-fid="' + f.field_id + '">' +
      '<div class="qt"><div class="nm">' + h(f.name) +
        (f.risk ? '<span class="tag risk">重要</span>' : '') +
        (f.value ? '<span class="tag done">已填</span>' : '') +
      '</div></div>';
    if (f.fill_note) s += '<p class="note">' + h(f.fill_note) + '</p>';
    if (f.notice) s += '<p class="must">' + h(f.notice) + '</p>';
    if (f.help_text) {
      s += '<button class="help-btn" data-help="' + f.field_id + '">官方填写说明 <i>▾</i></button>' +
        '<div class="help" id="hp' + f.field_id + '"><b>官方 Help 原文</b>' + h(f.help_text) + '</div>';
    }
    if (yn) {
      if (multi(f)) s += '<p class="must">以上各条中只要有任何一条属实，请选“是”，并在下方逐条说明；' +
        '都不属实才选“否”。</p>';
      s += '<div class="yn">' +
        '<button data-yn="' + f.field_id + '" data-v="是"' + (v.yn === '是' ? ' class="on"' : '') + '>是</button>' +
        '<button data-yn="' + f.field_id + '" data-v="否"' + (v.yn === '否' ? ' class="on"' : '') + '>否</button>' +
        '</div>' +
        '<div class="ex" id="ex' + f.field_id + '"' + (v.yn === '是' ? '' : ' style="display:none"') + '>' +
        '<label' + (ex ? '' : ' class="opt"') + '>' +
        (ex ? '选“是”必须在这里补充官方要求的详细信息' : '如需补充，可在这里说明（选填）') + '</label>' +
        '<textarea class="ipt" data-tx="' + f.field_id + '" placeholder="请写清时间、地点、经过等具体情况">' +
        h(v.ex) + '</textarea></div>';
    } else {
      var long = (f.fill_note || '').length > 40;
      s += long
        ? '<textarea class="ipt" data-tx="' + f.field_id + '" placeholder="请按上面的说明填写">' + h(f.value || '') + '</textarea>'
        : '<input class="ipt" data-tx="' + f.field_id + '" value="' + h(f.value || '') + '" placeholder="请填写">';
    }
    s += '<span class="saved" id="sv' + f.field_id + '">已保存</span></div>';
    return s;
  }

  function barHtml(st) {
    var left = st.ask_left == null ? 0 : st.ask_left;
    return '<div class="bar"><div class="bar-in">' +
      '<div class="info"><b>' + (left ? '还有 ' + left + ' 题未答' : '全部答完了') + '</b>' +
      '边填边自动保存，可以随时关掉再回来</div>' +
      '<button class="btn" id="btn-submit">提交至签证顾问</button></div></div>';
  }

  /* ---------------- 交互 ---------------- */
  function bind() {
    $$('[data-toggle]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-toggle');
        var box = document.getElementById(id);
        box.classList.toggle('open');
        if (id.indexOf('sec') === 0) OPEN[id] = box.classList.contains('open');
      });
    });
    $$('[data-help]').forEach(function (el) {
      el.addEventListener('click', function () {
        var b = document.getElementById('hp' + el.getAttribute('data-help'));
        b.classList.toggle('on');
        el.innerHTML = b.classList.contains('on') ? '收起官方说明 <i>▴</i>' : '官方填写说明 <i>▾</i>';
      });
    });
    $$('[data-yn]').forEach(function (el) {
      el.addEventListener('click', function () {
        var fid = +el.getAttribute('data-yn'), val = el.getAttribute('data-v');
        var q = document.getElementById('q' + fid);
        $$('[data-yn="' + fid + '"]', q).forEach(function (b) { b.classList.remove('on'); });
        el.classList.add('on');
        var exBox = document.getElementById('ex' + fid);
        if (exBox) exBox.style.display = val === '是' ? '' : 'none';
        var tx = $('[data-tx="' + fid + '"]', q);
        save(fid, joinVal(val, tx && val === '是' ? tx.value.trim() : ''));
      });
    });
    $$('[data-tx]').forEach(function (el) {
      el.addEventListener('input', function () {
        var fid = +el.getAttribute('data-tx');
        clearTimeout(TIMERS[fid]);
        TIMERS[fid] = setTimeout(function () { saveText(fid, el); }, 700);
      });
      el.addEventListener('blur', function () {
        var fid = +el.getAttribute('data-tx');
        clearTimeout(TIMERS[fid]);
        saveText(fid, el);
      });
    });
    var b = document.getElementById('btn-submit');
    if (b) b.addEventListener('click', submit);

    /* 切换「填申请表 / 交材料」 */
    $$('[data-pane]').forEach(function (el) {
      el.addEventListener('click', function () {
        PANE = el.getAttribute('data-pane');
        render();
        window.scrollTo(0, 0);
      });
    });
    /* 上传材料：先把文件传到 /api/upload 拿到 url，再调 /pub/task/upload 挂到这一项上。
       /api/upload 本身不校验登录（在鉴权之前处理），挂载那一步才用 token 认人。 */
    $$('[data-up]').forEach(function (el) {
      el.addEventListener('change', function () {
        var f = el.files && el.files[0];
        if (!f) return;
        var mid = +el.getAttribute('data-up');
        var card = document.getElementById('mat' + mid);
        if (card) card.classList.add('busy');
        tip('上传中…');
        var fd = new FormData();
        fd.append('file', f);
        // token 走 query：multipart 的 body 里读不到它，而 _upload 要靠它认人
        fetch(API + '/upload?token=' + encodeURIComponent(TOKEN), { method: 'POST', body: fd })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (!j.files || !j.files.length) throw new Error(j.error || '上传失败');
            return api('/upload', {
              token: TOKEN, mat_id: mid,
              file_name: j.files[0].name, file_url: j.files[0].url
            });
          })
          .then(function (r) {
            D.materials = r.materials; D.mat_stat = r.mat_stat;
            render();
            tip(r.ai_msg || '已提交，等待专员复核');
          })
          .catch(function (e) {
            if (card) card.classList.remove('busy');
            tip(e.message || '上传失败，请重试', true);
          });
      });
    });
    var ca = $('[data-copyaddr]');
    if (ca) ca.addEventListener('click', function () {
      var a = D.mail_addr;
      var t = a.region + ' ' + a.detail + '　' + a.contact + ' ' + a.phone;
      if (navigator.clipboard) navigator.clipboard.writeText(t);
      ca.textContent = '已复制';
      setTimeout(function () { ca.textContent = '复制地址'; }, 1500);
    });
  }

  function saveText(fid, el) {
    var q = document.getElementById('q' + fid);
    var on = $('[data-yn="' + fid + '"].on', q);
    var val = on ? joinVal(on.getAttribute('data-v'), el.value.trim()) : el.value.trim();
    save(fid, val);
  }

  function tip(msg, bad) {
    var t = document.getElementById('savetip');
    if (!t) return;
    t.textContent = msg;
    t.className = 'save ' + (bad ? 'err' : 'on');
  }

  var LAST = {};
  function save(fid, value) {
    if (LAST[fid] === value) return;
    LAST[fid] = value;
    var f = ASK.filter(function (x) { return x.field_id === fid; })[0];
    if (f) f.value = value;
    tip('保存中…');
    api('/save', { token: TOKEN, answers: [{ field_id: fid, value: value }] })
      .then(function (r) {
        D.stat = r.stat || D.stat;
        var sv = document.getElementById('sv' + fid);
        if (sv) { sv.classList.add('on'); setTimeout(function () { sv.classList.remove('on'); }, 1600); }
        tip('已保存 ' + new Date().toTimeString().slice(0, 5));
        markDone(fid, value);
        refreshProg();
        refreshSecBadge(fid);
      })
      .catch(function (e) {
        LAST[fid] = null;
        tip((e.message || '保存失败') + '（内容仍在本页，请检查网络）', true);
        if (e.code === 403 || e.code === 404) setTimeout(function () { boot(); }, 1200);
      });
  }

  function markDone(fid, value) {
    var q = document.getElementById('q' + fid);
    if (!q) return;
    var nm = $('.nm', q), old = $('.tag.done', nm);
    if (value && !old) nm.insertAdjacentHTML('beforeend', '<span class="tag done">已填</span>');
    if (!value && old) old.remove();
  }
  function refreshSecBadge(fid) {
    var q = document.getElementById('q' + fid);
    if (!q) return;
    var sec = q.closest('.sec');
    if (!sec) return;
    var left = $$('.q', sec).filter(function (el) {
      var f = ASK.filter(function (x) { return x.field_id === +el.getAttribute('data-fid'); })[0];
      return f && f.required && !f.value;
    }).length;
    var st = $('.st', sec);
    st.className = 'st' + (left ? '' : ' ok');
    st.textContent = left ? left + ' 题待答' : '已答完';
  }

  /* ---------------- 提交 ---------------- */
  function submit() {
    var b = document.getElementById('btn-submit');
    b.disabled = true; b.textContent = '提交中…';
    api('/submit', { token: TOKEN })
      .then(function (r) {
        b.disabled = false; b.textContent = '提交至签证顾问';
        var miss = (r.missing || []).filter(function (n) {
          // 只给客人看他自己该填的题；系统带出但为空的格子由顾问补
          return ASK.some(function (f) { return f.name === n; });
        });
        if (miss.length) return missSheet(miss, r.missing.length);
        doneView(r.msg);
      })
      .catch(function (e) {
        b.disabled = false; b.textContent = '提交至签证顾问';
        if (e.code === 403 || e.code === 404) return errView(e);
        alertBox(e.message || '提交失败');
      });
  }

  function alertBox(msg) {
    var m = document.createElement('div');
    m.className = 'mask';
    m.innerHTML = '<div class="sheet"><div class="sh2"><b>提交未成功</b><p>' + h(msg) + '</p></div>' +
      '<div class="sf"><button class="btn" id="ab-ok">知道了</button></div></div>';
    document.body.appendChild(m);
    $('#ab-ok', m).addEventListener('click', function () { m.remove(); });
  }

  function missSheet(miss, allMiss) {
    var m = document.createElement('div');
    m.className = 'mask';
    var rows = miss.map(function (name) {
      var f = ASK.filter(function (x) { return x.name === name; })[0];
      return '<div class="mi" data-jump="' + f.field_id + '"><div class="mt">' +
        '<b>' + h(name) + (f.risk ? '<span class="tag risk">重要</span>' : '') + '</b>' +
        '<s>' + h(cleanSec(f._sec)) + '</s></div><div class="go">去填写 ›</div></div>';
    }).join('');
    var other = allMiss - miss.length;
    m.innerHTML = '<div class="sheet">' +
      '<div class="sh2"><b>还有 ' + miss.length + ' 题没答</b>' +
      '<p>已提交的内容都保存好了。点下面任意一题可以直接跳过去补填' +
      (other > 0 ? '；另有 ' + other + ' 格由顾问核对补齐，不用您操心' : '') + '。</p></div>' +
      '<div class="sl">' + rows + '</div>' +
      '<div class="sf"><button class="btn ghost" id="ms-close">稍后再填</button>' +
      '<button class="btn" id="ms-first">去补第一题</button></div></div>';
    document.body.appendChild(m);
    function jump(fid) {
      m.remove();
      var q = document.getElementById('q' + fid);
      var sec = q.closest('.sec');
      if (sec && !sec.classList.contains('open')) { sec.classList.add('open'); OPEN[sec.id] = true; }
      q.scrollIntoView({ behavior: 'smooth', block: 'center' });
      q.classList.remove('hit');
      void q.offsetWidth;
      q.classList.add('hit');
    }
    $$('[data-jump]', m).forEach(function (el) {
      el.addEventListener('click', function () { jump(+el.getAttribute('data-jump')); });
    });
    $('#ms-close', m).addEventListener('click', function () { m.remove(); });
    $('#ms-first', m).addEventListener('click', function () {
      jump(+$$('[data-jump]', m)[0].getAttribute('data-jump'));
    });
  }

  function doneView(msg) {
    ROOT.innerHTML = '<div class="done-wrap">' +
      '<div class="state ok"><div class="ic">✓</div><h2>已提交至您的签证顾问</h2>' +
      '<p class="sub">' + h(msg || '顾问会复核后到官方网站录入') + '</p></div>' +
      '<div class="card open" style="margin-top:0"><div class="cb" style="border-top:none;padding:18px 18px 16px">' +
      '<ol class="flow">' +
      '<li class="on"><div class="d">✓</div><div class="fx"><b>您已完成填写</b>' +
        '<s>' + h(D.name) + ' · ' + h(D.form_code || '') + ' · 订单 ' + h(D.ord_no || '—') + '</s></div></li>' +
      '<li><div class="d">2</div><div class="fx"><b>顾问逐项复核</b>' +
        '<s>重点核对姓名拼写、护照号与高风险题；有疑问会直接联系您确认。</s></div></li>' +
      '<li><div class="d">3</div><div class="fx"><b>顾问到美国官方网站人工录入</b>' +
        '<s>官方网站不提供对接接口，需由我司专员照着您填的内容逐格录入并生成确认页。</s></div></li>' +
      '<li><div class="d">4</div><div class="fx"><b>通知您面签预约时间</b>' +
        '<s>录入完成、缴费后安排面谈预约，顾问会把时间、地点和面签材料清单发给您。</s></div></li>' +
      '</ol></div></div>' +
      '<div class="card" id="reopen"><div class="ch" data-toggle="reopen"><div class="t">' +
      '<b>填写有误如何更正？</b><s>点击查看说明</s></div><div class="ar">▾</div></div>' +
      '<div class="cb"><div class="auto-list"><p style="padding:12px 0;font-size:13.5px;color:var(--ink-2)">' +
      '在顾问确认这张表之前，您还可以刷新本页继续修改。一旦顾问确认，本页就会锁定，' +
      '需要改动请直接联系顾问。</p></div></div></div>' +
      '<p class="foot">众信旅游 · 签证在线填表<br>本页内容仅用于为您办理签证，请勿转发给无关人员。</p>' +
      '</div>';
    $$('[data-toggle]').forEach(function (el) {
      el.addEventListener('click', function () {
        document.getElementById(el.getAttribute('data-toggle')).classList.toggle('open');
      });
    });
    window.scrollTo(0, 0);
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    if (!TOKEN) {
      return stateView('bad', '!', '缺少填表链接参数', '请从顾问发给您的完整链接打开本页',
        '<div class="box">链接形如 …/fill.html?token=xxxx，复制时不要漏掉后半段。</div>');
    }
    api('', { token: TOKEN }).then(function (d) {
      D = d;
      digest();
      if (d.status === 'confirmed' || d.status === 'official') return lockedView(d);
      render();
    }).catch(errView);
  }

  boot();
})();
