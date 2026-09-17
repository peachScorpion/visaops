/* VisaOps 前端核心：API、组件、角色链路、路由 */
window.VIEWS = {};
var S = { token: null, user: null, role: null, cache: {} };

/* ---------- 工具 ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}
function money(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString('zh-CN'); }
/* 把对象塞进单引号包裹的 HTML 属性里 */
function jattr(o) { return JSON.stringify(o).replace(/'/g, '&#39;').replace(/"/g, '&quot;'); }
function d10(s) { return (s || '').slice(0, 10); }
/* 今天的 YYYY-MM-DD，本地时区。toISOString 是 UTC，东八区在 08:00 前会差一天 */
function today10() {
  var t = new Date();
  return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) +
    '-' + ('0' + t.getDate()).slice(-2);
}
function d16(s) { return (s || '').slice(0, 16); }
/* 精确到秒。办签进度这类要追溯「谁在哪一秒做了什么」的地方用它
   （唐美芳 2026-09-01：「查看进度，时间应该精确到年月日时分秒」）。 */
function d19(s) { return (s || '').slice(0, 19); }
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }

/* 接口前缀按页面路径现算，和 fill.js 同一条规矩：部署到哪个子路径都不用改代码
   （2026-09-01：fill.js 写死 '/api/...' 导致线上分享链接 404，这里一并按相对路径来）。 */
var API_BASE = location.pathname.replace(/[^/]*$/, '') + 'api';

/* ⚠️ 接口失败一律在这里弹提示，不再指望调用方自己 catch。
   2026-09-03 查「保存已改内容点了没反应」时发现的系统性问题：
   全站有 70 处写着 `.catch(function () { /* 失败已提示 *\/ })`，
   可 api() 当时只 throw、根本没提示过 —— 那句注释是错的，
   于是后端每一次拒绝（校验没过、状态不允许、权限不足）在用户眼里都是
   「点了没反应」。只有 37 处正确写了 .catch(fail)。
   改在 api() 内部统一提示，一处修好全部；fail() 相应退化成只重抛，避免弹两次。

   opts.silent=true 用于探测性调用（比如「取上一单联系人」，取不到就算了，
   不该拿个红条打扰正在下单的销售）。 */
function api(path, body, opts) {
  var opt = { method: body ? 'POST' : 'GET', headers: {} };
  if (S.token) opt.headers['X-Token'] = S.token;
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  var silent = opts && opts.silent;
  return fetch(API_BASE + path, opt).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok) {
        var e = new Error(j.error || ('HTTP ' + r.status));
        e.shown = true;
        if (!silent) toast(e.message, true);
        throw e;
      }
      return j;
    });
  }, function (netErr) {
    // 断网 / 服务没起来：fetch 本身 reject，这时连 r.json() 都没有
    var e = new Error('网络异常，请稍后重试');
    e.shown = true;
    if (!silent) toast(e.message, true);
    throw e;
  });
}
/* 已经在 api() 里提示过的错误不再弹第二次；其它来源的错误照旧提示。 */
function fail(e) {
  if (!(e && e.shown)) toast((e && e.message) || String(e), true);
  throw e;
}

/* 弹层的宿主：C 端是小程序，弹窗和提示必须留在机身里。
   挂 document.body 的话，遮罩是 position:fixed，会盖满整个 PC 视口、浮在真机外面 ——
   看上去就是「点一下从小程序里跳出去了」，唐美芳 2026-08-27 指出的就是这个。
   沉浸模式下改挂 .phone（它 overflow:hidden，天然把遮罩裁在机身内），
   并打上 in-ph 标记让样式切成移动端的底部抽屉。其余角色是真 PC 页面，照旧挂 body。 */
function overlayHost() {
  if (document.body.classList.contains('imm')) {
    var ph = document.querySelector('.phone');
    if (ph) return ph;
  }
  return document.body;
}

function toast(msg, bad) {
  var host = overlayHost();
  var t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '') + (host === document.body ? '' : ' in-ph');
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(function () { t.classList.add('out'); }, bad ? 3200 : 2000);
  setTimeout(function () { t.remove(); }, bad ? 3600 : 2400);
}

/* ---------- 弹窗 ---------- */
/* page=true：整页形态。铺满整个手机壳、从右侧滑入、标题左边是返回箭头，
   底部按钮固定成一条操作栏——就是小程序里「跳到下一页」的观感，
   但实现上仍是覆盖层，调用方的页面状态（已填的日期、联系人）不会丢。
   唐美芳 2026-09-02：「选择或更改办签人最好不要弹窗了，用单独页面吧，
   包括新增页也一样，现在看起来有点丑，交互也不太友好」。 */
function modal(title, html, buttons, wide, page) {
  var host = overlayHost();
  var mask = document.createElement('div');
  mask.className = 'mask' + (host === document.body ? '' : ' in-ph') + (page ? ' sheet' : '');
  mask.innerHTML = '<div class="modal' + (wide ? ' wide' : '') + '">' +
    '<header>' + (page ? '<button class="bk" data-x>‹</button>' : '') +
    '<b>' + esc(title) + '</b>' +
    (page ? '' : '<button data-x>&times;</button>') + '</header>' +
    '<div class="c">' + html + '</div>' +
    '<footer></footer></div>';
  host.appendChild(mask);
  var close = function () { mask.remove(); };
  $('[data-x]', mask).onclick = close;
  /* 整页形态没有可点的蒙层，误触背景把页面关掉是最恼人的 */
  if (!page) mask.onclick = function (e) { if (e.target === mask) close(); };
  var ft = $('footer', mask);
  (buttons || [{ t: '关闭' }]).forEach(function (b) {
    var el = document.createElement('button');
    el.className = 'btn ' + (b.cls || '');
    el.textContent = b.t;
    el.onclick = function () {
      if (!b.fn) return close();
      var r = b.fn(mask, close);
      if (r && r.then) { el.disabled = true; r.then(close).catch(function () { el.disabled = false; }); }
      else if (r !== false) close();
    };
    ft.appendChild(el);
  });
  return { mask: mask, close: close };
}

/* ---------------------------------------------------------------
   轻量富文本编辑器（2026-09-01）
   唐美芳：「套餐说明、预订须知应该是富文本框，现在这个普通文本框里
   我要调整排版和文字不太友好」。
   不引第三方库：这里只需要加粗、分条、分段三件事，contenteditable
   加 execCommand 就够了，引一个几百 KB 的编辑器反而要连它的样式一起维护。
   产出的标签由服务端 clean_rich() 白名单过滤后才入库——接口是可以直接调的，
   不能只靠前端产出什么就信什么。
   --------------------------------------------------------------- */
/* 工具栏。原来只有加粗 / 两种列表 / 清除格式四个，唐美芳 2026-09-01 验收：
   「为什么只有加粗、序号、删除 3 个操作，字体大小、排版、格式刷等常规操作都没有」。
   补齐日常写商品说明真正会用到的那一排，分组之间用竖线隔开。
   全部走 document.execCommand——这套 API 虽然标了废弃，但所有浏览器都还支持，
   且不引第三方编辑器就只有它能改选区。 */
var RT_BTN = [
  ['bold', 'B', '加粗', 'font-weight:800'],
  ['italic', 'I', '倾斜', 'font-style:italic;font-family:Georgia,serif'],
  ['underline', 'U', '下划线', 'text-decoration:underline'],
  ['strikeThrough', 'S', '删除线', 'text-decoration:line-through'],
  ['|'],
  ['insertUnorderedList', '•', '无序列表', ''],
  ['insertOrderedList', '1.', '有序列表', 'font-size:11px'],
  ['|'],
  ['justifyLeft', '≡', '左对齐', 'text-align:left'],
  ['justifyCenter', '≡', '居中', ''],
  ['justifyRight', '≡', '右对齐', ''],
  ['|'],
  ['undo', '↶', '撤销', ''],
  ['redo', '↷', '重做', ''],
  ['removeFormat', '⌫', '清除格式', '']
];
/* 字号用 execCommand('fontSize') 的 1–7 档，落到 <font size>，
   后端白名单放行了 font 的 size 属性，所以存得住也显示得出来。 */
var RT_SIZE = [['2', '小'], ['3', '正文'], ['4', '中'], ['5', '大'], ['6', '标题']];

function richHtml(k, value, ph) {
  return '<div class="rt" data-rt="' + k + '">' +
    '<div class="rt-bar">' +
    '<select data-size title="字号">' +
    RT_SIZE.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === '3' ? ' selected' : '') + '>' +
        o[1] + '</option>';
    }).join('') + '</select>' +
    RT_BTN.map(function (b) {
      if (b[0] === '|') return '<u class="rt-sp"></u>';
      return '<button type="button" data-cmd="' + b[0] + '" title="' + esc(b[2]) + '"' +
        (b[3] ? ' style="' + b[3] + '"' : '') + '>' + b[1] + '</button>';
    }).join('') +
    '<button type="button" data-brush title="格式刷：先选中样板文字点击一次，再选中目标文字点击第二次">' +
    '🖌</button>' +
    '<em>自网页粘贴的内容将自动清除原有样式，仅保留文字与分段</em></div>' +
    '<div class="rt-ed" contenteditable="true" data-ph="' + esc(ph || '') + '">' +
    (value || '') + '</div></div>';
}

/* 粘贴清洗：她的正文多半是从携程、使领馆网站复制过来的，直接粘会把对方整套
   class 与 style 带进来，存下去客户端就看到一堆代码。这里只取纯文本 +
   保留段落，样式一律由我们自己的工具栏来定。 */
function richPaste(e, ed) {
  e.preventDefault();
  var dt = e.clipboardData || window.clipboardData;
  if (!dt) return;
  var txt = dt.getData('text/plain') || '';
  if (!txt) {
    /* 只有图片之类的非文本内容，不接 */
    return;
  }
  var html = txt.split(/\r?\n/).map(function (line) {
    line = line.replace(/\s+$/, '');
    return line ? '<div>' + esc(line) + '</div>' : '<div><br></div>';
  }).join('');
  document.execCommand('insertHTML', false, html);
  ed.dispatchEvent(new Event('input'));
}

/* 绑定工具栏。scope 里可以有多个编辑器，各绑各的。 */
function richBind(scope) {
  $$('[data-rt]', scope).forEach(function (box) {
    var ed = $('.rt-ed', box);
    var brush = null;   // 格式刷取到的样板：{bold,italic,underline,size}
    var sync = function () { box.classList.toggle('empty', !ed.textContent.trim()); };
    sync();
    ed.oninput = sync;
    ed.onpaste = function (e) { richPaste(e, ed); sync(); };
    var run = function (cmd, val) {
      ed.focus();
      document.execCommand(cmd, false, val || null);
      sync();
    };
    $$('[data-cmd]', box).forEach(function (b) {
      /* mousedown 上阻止默认行为，否则点按钮时编辑区先失焦，
         execCommand 就找不到选区，点了没反应 */
      b.onmousedown = function (e) { e.preventDefault(); };
      b.onclick = function () { run(b.dataset.cmd); };
    });
    var sel = $('[data-size]', box);
    if (sel) {
      sel.onmousedown = function (e) { e.stopPropagation(); };
      sel.onchange = function () { run('fontSize', sel.value); };
    }
    var bt = $('[data-brush]', box);
    if (bt) {
      bt.onmousedown = function (e) { e.preventDefault(); };
      bt.onclick = function () {
        ed.focus();
        if (!brush) {
          /* 第一下：把当前选区的样式记下来 */
          brush = {
            bold: document.queryCommandState('bold'),
            italic: document.queryCommandState('italic'),
            underline: document.queryCommandState('underline'),
            size: document.queryCommandValue('fontSize') || ''
          };
          bt.classList.add('on');
          toast('已取样，选中要套用的文字再点一次格式刷');
          return;
        }
        /* 第二下：把样板套到新选区上。先清干净再按样板加，
           否则目标原有的粗体会跟样板叠加，越刷越乱。 */
        document.execCommand('removeFormat', false, null);
        if (brush.size) document.execCommand('fontSize', false, brush.size);
        if (brush.bold) document.execCommand('bold', false, null);
        if (brush.italic) document.execCommand('italic', false, null);
        if (brush.underline) document.execCommand('underline', false, null);
        brush = null;
        bt.classList.remove('on');
        sync();
      };
    }
  });
}

/* 富文本的展示端。内容进库前已由后端 clean_rich 洗过（白名单标签 + 有限属性），
   这里直出即可；早期用 esc() 转义的地方会把 <p><b> 原样显示成代码，
   唐美芳 2026-09-01 验收时在 UBK 套餐详情看到的就是这个。
   老数据里还有纯文本（靠 \n 换行），没有标签时按纯文本处理。 */
function richView(v) {
  if (!v) return '';
  return /<[a-z][^>]*>/i.test(v) ? v : esc(v).replace(/\n/g, '<br>');
}
/* 富文本 → 纯文本。给 title、单行摘要、导出用——把 HTML 原样塞进 title
   属性，鼠标悬停会看到一串标签（2026-09-07 受理范围说明改富文本后要用到）。 */
function richText(v) {
  if (!v) return '';
  if (!/<[a-z][^>]*>/i.test(v)) return v;
  var d = document.createElement('div');
  d.innerHTML = v.replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  return (d.textContent || '').replace(/\n{2,}/g, '\n').trim();
}

/* 办签进度时间轴 —— C 端与后台三端共用一份渲染。
   唐美芳 2026-09-01：「每个办签人的办签进度不应该和 C 端一样有详情可以看么，
   一系列的子流程展示，前后端又不一致了」。原来后台的「查看」只是几行 kv，
   客人在小程序里看到的却是分三段的时间轴，同一件事两种说法。
   数据来自同一个 /my/track，文案由后端 cust_events() 统一翻译。 */
function trackHtml(t, aid) {
  /* 同一天连着好几条时，日期只在这一天的第一条上出现，后面几条只留时刻
     —— 原来每条都顶着一个「2026/09/03」，十几条堆在一起全是重复的日期
     （唐美芳 2026-09-03：「签证进度查询这个页面的样式有问题」）。 */
  var lastDay = '';
  function it(date, text, extra, now) {
    /* 进度节点要能追溯到秒（唐美芳 2026-09-01：「时间应该精确到年月日时分秒」）。
       手机上时间列只有 82px，19 个字符横着放会压到右边的文字上——
       所以日期一行、时刻一行，列宽不用动。 */
    var v = d19(date);
    var day = v.slice(0, 10).replace(/-/g, '/');
    var same = day === lastDay;
    if (day) lastDay = day;
    return '<div class="it' + (now ? ' now' : '') + '"><span class="d">' +
      (same ? '' : '<b>' + esc(day) + '</b>') +
      (v.length > 10 ? '<s' + (same ? ' class="only"' : '') + '>' +
        esc(v.slice(11)) + '</s>' : '') + '</span>' + esc(text) +
      (extra ? '<span class="x">' + esc(extra) + '</span>' : '') + '</div>';
  }
  /* 顶部步骤条：客人打开这一页第一个问题永远是「我办到哪了、还要多久」。
     六个节点横排，走过的实心、当前的高亮、没到的留白，下面一句
     「现在这一步在做什么 + 要不要你动手」。 */
  function steps() {
    var list = t.steps || [];
    if (!list.length) return '';
    var cur = t.step || 1;
    return '<div class="tk-steps">' +
      '<div class="bar">' + list.map(function (x, i) {
        var n = i + 1;
        return '<i class="' + (n < cur ? 'done' : n === cur ? 'on' : '') + '"></i>';
      }).join('') + '</div>' +
      '<div class="cur"><b>第 ' + cur + ' 步 / 共 ' + list.length + ' 步</b>' +
      '<span>' + esc(t.stage_text || t.progress_text || '') + '</span></div>' +
      (t.stage_todo ? '<div class="todo">' + esc(t.stage_todo) + '</div>' : '') +
      '</div>';
  }
  var isAppt = function (e) { return (e.key || '').indexOf('预约') >= 0; };
  var isOut = function (e) {
    return ['回填签证结果', '资料返还寄出', '客户签收资料'].indexOf(e.key) >= 0;
  };
  var main = (t.events || []).filter(function (e) { return !isAppt(e) && !isOut(e); })
    .map(function (e, i, arr) { return it(e.at, e.text, '', i === arr.length - 1); })
    .join('') || '<div class="it">暂无记录</div>';
  lastDay = '';   // 换一段，日期重新从头显示
  var appt = t.appt_at
    ? it(t.appt_at, '面签 / 录指纹', '地点：' + (t.appt_place || '以使领馆通知为准'), true)
    : '<div class="it tk-none">面签时间尚未确定。名额由使领馆官网放出，' +
      '签证顾问将持续为您争取，预约成功后第一时间告知您时间与地点。</div>';
  lastDay = '';
  var out = (t.events || []).filter(isOut).map(function (e) { return it(e.at, e.text); }).join('') ||
    '<div class="it tk-none">结果尚未签发。出签当天我们会第一时间回填结果，' +
    '并将护照与资料寄回您填写的收货地址。</div>';
  if (t.express_no) {
    /* 上面已经有一条「护照与资料已寄回」的事件了，这里再写一遍「资料已寄出」
       就是同一件事说两遍。这条只补运单号，方便客人去快递官网查。 */
    out += '<div class="it now"><span class="d"></span>快递运单<span class="x">' +
      esc((t.express || '') + '　' + t.express_no) + '</span></div>';
  }
  var sibs = t.siblings || (aid ? [{ id: +aid, name: t.name }] : []);
  return (sibs.length > 1
    ? '<div class="tk-tabs">' + sibs.map(function (x) {
      return '<a data-ap="' + x.id + '"' + (String(x.id) === String(aid) ? ' class="on"' : '') +
        '>' + esc(x.name) + '</a>';
    }).join('') + '</div>' : '') +
    steps() +
    '<div class="h5-tl">' +
    '<div class="grp"><b>办理记录</b></div>' + main +
    '<div class="grp"><b>面签预约</b></div>' + appt +
    '<div class="grp"><b>结果与寄回</b></div>' + out +
    '</div>';
}

/* 富文本摘一句纯文本出来做折叠时的预览。标签全脱掉、空白压平，超长截断。 */
function rvBrief(html, n) {
  var t = String(html || '').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  return t.length > (n || 30) ? t.slice(0, n || 30) + '…' : t;
}

/* 从 scope 里把某个编辑器的内容读出来 */
function richRead(scope, k) {
  var ed = $('[data-rt="' + k + '"] .rt-ed', scope);
  if (!ed) return '';
  var h = ed.innerHTML.trim();
  /* 空编辑器浏览器会留一个 <br>，别把它当内容存进去 */
  return (h === '<br>' || h === '<div><br></div>') ? '' : h;
}

/* 上传控件下面那行提示原来写死「支持 JPG / PNG / WEBP / PDF」，
   于是传 Excel 字段表的地方明明 accept 已经放开了 .xlsx，提示还在说只收图片和 PDF，
   看起来就是「没支持 Excel」。改成按 accept 现算，两处不可能再对不上。 */
var EXT_T = {
  'image/*': 'JPG / PNG / WEBP', '.jpg': 'JPG', '.jpeg': 'JPG', '.png': 'PNG',
  '.webp': 'WEBP', '.gif': 'GIF', '.pdf': 'PDF',
  '.xlsx': 'Excel（.xlsx）', '.xls': 'Excel（.xls）', '.csv': 'CSV',
  '.docx': 'Word（.docx）', '.doc': 'Word（.doc）'
};
function acceptTip(accept) {
  var seen = {}, out = [];
  (accept || 'image/*,.pdf').split(',').forEach(function (s) {
    var t = EXT_T[s.trim().toLowerCase()] || s.trim().replace(/^\./, '').toUpperCase();
    if (t && !seen[t]) { seen[t] = 1; out.push(t); }
  });
  return '支持 ' + out.join(' / ');
}

/* fields: [{k,label,type,value,options,ph,hint,required}] → Promise<data> */
/* onSubmit(values, mask) 可选：传了就由它来提交，返回 Promise。
   成功才关窗；失败时弹窗与已填内容原样留着，不用重新填一遍
   （唐美芳 2026-09-01：「新增的时候，提交报错的时候，不要关闭弹窗，
   不然还得二次填写」）。不传时行为不变——点确定即关窗并 resolve，
   老调用不受影响。 */
function ask(title, fields, okText, onSubmit, page) {
  return new Promise(function (resolve) {
    /* type:'file' 的字段值不走 input.value，单独存在这里，键是字段 k */
    var picked = {};
    fields.forEach(function (f) {
      if (f.type === 'file') picked[f.k] = (f.value || []).slice();
    });
    var html = fields.map(function (f) {
      if (f.type === 'html') return f.html;
      var inner;
      if (f.type === 'file') {
        inner = '<div class="upf" data-up="' + f.k + '">' +
          '<input type="file" hidden' + (f.multiple ? ' multiple' : '') +
          ' accept="' + esc(f.accept || 'image/*,.pdf') + '">' +
          '<div class="upa"><button type="button" class="btn sm" data-pick>选择文件</button>' +
          '<span class="hint">' + esc(acceptTip(f.accept)) + '，单个不超过 12 MB</span></div>' +
          '<div class="upl"></div></div>';
        return '<label class="f"><span>' + esc(f.label) + (f.required ? ' <i>*</i>' : '') +
          '</span>' + inner +
          (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') + '</label>';
      }
      if (f.type === 'select') {
        inner = '<select data-k="' + f.k + '">' + (f.options || []).map(function (o) {
          var v = o.v !== undefined ? o.v : o, t = o.t !== undefined ? o.t : o;
          return '<option value="' + esc(v) + '"' + (f.value == v ? ' selected' : '') + '>' + esc(t) + '</option>';
        }).join('') + '</select>';
      } else if (f.type === 'checks') {
        var sel = f.value || [];
        inner = '<div class="chks" data-k="' + f.k + '" data-multi="1">' + (f.options || []).map(function (o) {
          var v = o.v !== undefined ? o.v : o, t = o.t !== undefined ? o.t : o;
          return '<label><input type="checkbox" value="' + esc(v) + '"' +
            (sel.indexOf(v) >= 0 ? ' checked' : '') + '><span>' + esc(t) + '</span></label>';
        }).join('') + '</div>';
      } else if (f.type === 'rich') {
        /* 富文本：值不走 input.value，提交时由 richRead 单独取 */
        inner = richHtml(f.k, f.value, f.ph);
      } else if (f.type === 'textarea') {
        inner = '<textarea rows="' + (f.rows || 5) + '" data-k="' + f.k + '" placeholder="' +
          esc(f.ph || '') + '">' + esc(f.value || '') + '</textarea>';
      } else if (f.type === 'date' && page) {
        /* 整页形态（小程序）里的日期不用原生控件：它唤起的是系统日历，
           格式还跟着系统语言走，同一张表单里会出现 mm/dd/yyyy 和刚做的中文滚轮
           两种风格（唐美芳 2026-09-02 指定过滚轮那种交互）。
           这里渲染成只读框，点开滚轮选，值仍然写回同一个 data-k，提交逻辑不用改。 */
        inner = '<input data-k="' + f.k + '" type="text" readonly data-dpick' +
          (f.y0 ? ' data-y0="' + f.y0 + '"' : '') + (f.y1 ? ' data-y1="' + f.y1 + '"' : '') +
          ' data-lb="' + esc(f.label) + '" value="' + esc(f.value == null ? '' : f.value) +
          '" placeholder="' + esc(f.ph || '请选择日期') + '">';
      } else {
        inner = '<input data-k="' + f.k + '" type="' + (f.type || 'text') + '" value="' + esc(f.value == null ? '' : f.value) +
          '" placeholder="' + esc(f.ph || '') + '">';
      }
      return '<label class="f"' + (f.k ? ' data-fld="' + esc(f.k) + '"' : '') + '><span>' +
        esc(f.label) + (f.required ? ' <i>*</i>' : '') + '</span>' + inner +
        (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') + '</label>';
    }).join('');
    /* 读当前表单值（不含文件与富文本，那两样提交时单独取）。
       条件显隐要用它，提交时的收集也走同一份逻辑，两边口径不会走偏。 */
    function readVals(mask) {
      var v = {};
      $$('[data-k]', mask).forEach(function (el) {
        v[el.dataset.k] = el.dataset.multi
          ? $$('input:checked', el).map(function (i) { return i.value; })
          : (el.value || '').trim();
      });
      return v;
    }
    /* 字段级条件显隐（2026-09-09）：字段上写 showIf(values) 即可。
       唐美芳：「登记签证结果应该根据结果状态，动态展示下面的字段，
       比如选中拒签结果，下面的拒签原因及说明才会展示」。
       ⚠️ 被隐藏的字段**提交时按空值处理、且不参与必填校验**——
       否则选了「出签」还会被拒签归因挡住提交，或者把上一次选中的拒签理由一起提交上去。 */
    function hiddenKeys(mask) {
      var v = readVals(mask), hid = {};
      fields.forEach(function (f) {
        if (!f.showIf || !f.k) return;
        var on = !!f.showIf(v);
        var lb = $('[data-fld="' + f.k + '"]', mask);
        if (lb) lb.style.display = on ? '' : 'none';
        if (!on) hid[f.k] = 1;
      });
      return hid;
    }
    var m = modal(title, html, [
      { t: '取消' },
      {
        t: okText || '确定', cls: 'p', fn: function (mask, close) {
          var out = {};
          var miss = null;
          fields.forEach(function (f) {
            if (f.type !== 'file') return;
            out[f.k] = picked[f.k];
            if (f.required && !picked[f.k].length) miss = f.label;
          });
          fields.forEach(function (f) {
            if (f.type !== 'rich') return;
            out[f.k] = richRead(mask, f.k);
            if (f.required && !out[f.k]) miss = f.label;
          });
          var hid = hiddenKeys(mask);
          $$('[data-k]', mask).forEach(function (el) {
            var f = fields.filter(function (x) { return x.k === el.dataset.k; })[0];
            if (hid[el.dataset.k]) {      /* 条件不成立而隐藏的字段：交空值，不校验 */
              out[el.dataset.k] = el.dataset.multi ? [] : '';
              return;
            }
            if (el.dataset.multi) {
              var v = $$('input:checked', el).map(function (i) { return i.value; });
              out[el.dataset.k] = v;
              if (f && f.required && !v.length) miss = f.label;
              return;
            }
            out[el.dataset.k] = el.value.trim();
            if (f && f.required && !el.value.trim()) miss = f.label;
          });
          if (miss) { toast('请填写：' + miss, true); return false; }
          if (!onSubmit) { resolve(out); close(); return false; }
          var r = onSubmit(out, mask);
          if (r && r.then) {
            /* 把 Promise 交回 modal：它成功后自己 close，失败则恢复按钮、不关窗。
               这里先 fail() 弹出错误再把异常抛回去，否则 modal 只会默默恢复按钮，
               操作的人不知道为什么没提交上去。 */
            return r.then(function (x) { resolve(x === undefined ? out : x); }).catch(fail);
          }
          resolve(out); close(); return false;
        }
      }
    ], false, page);
    /* 只读日期框 → 滚轮选择器。年份范围由字段自带（出生日期要能翻到几十年前，
       证件有效期要能翻到十几年后），没给就用选择器的默认区间。 */
    $$('[data-dpick]', m.mask).forEach(function (inp) {
      inp.onclick = function () {
        datePicker({
          title: inp.dataset.lb || '选择日期', label: inp.dataset.lb || '',
          value: inp.value,
          y0: inp.dataset.y0 ? +inp.dataset.y0 : null,
          y1: inp.dataset.y1 ? +inp.dataset.y1 : null
        }).then(function (v) { inp.value = v; }).catch(function () { });
      };
    });
    /* 打开时先按初值算一次，之后任何一格变动都重算 */
    if (fields.some(function (f) { return f.showIf; })) {
      hiddenKeys(m.mask);
      m.mask.addEventListener('change', function () { hiddenKeys(m.mask); });
      m.mask.addEventListener('input', function () { hiddenKeys(m.mask); });
    }
    richBind(m.mask);
    $$('[data-up]', m.mask).forEach(function (box) {
      var k = box.dataset.up, inp = $('input[type=file]', box), list = $('.upl', box);
      var f = fields.filter(function (x) { return x.k === k; })[0];
      var draw = function () {
        list.innerHTML = picked[k].map(function (o, i) {
          return '<div class="upi">' + fileLink(o.url, esc(o.name)) +
            '<span>' + (o.size ? Math.round(o.size / 1024) + ' KB' : '') +
            '</span><button type="button" data-rm="' + i + '">移除</button></div>';
        }).join('');
        $$('[data-rm]', list).forEach(function (b) {
          b.onclick = function () { picked[k].splice(+b.dataset.rm, 1); draw(); };
        });
      };
      draw();
      $('[data-pick]', box).onclick = function () { inp.click(); };
      inp.onchange = function () {
        if (!inp.files.length) return;
        var btn = $('[data-pick]', box);
        btn.disabled = true; btn.textContent = '上传中…';
        upload(inp.files).then(function (fs) {
          if (!f.multiple) picked[k] = [];
          fs.forEach(function (o) { picked[k].push(o); });
          draw();
          toast('已上传 ' + fs.length + ' 个文件');
        }).catch(function (e) { toast(e.message || String(e), true); })
          .then(function () {
            btn.disabled = false; btn.textContent = '选择文件'; inp.value = '';
          });
      };
    });
    setTimeout(function () { var i = $('input:not([type=file]),select,textarea', m.mask); if (i) i.focus(); }, 30);
  });
}

/* 真实文件上传：multipart 提交到后端，落盘后返回 [{name,url,size}] */
function upload(files) {
  var fd = new FormData();
  [].slice.call(files).forEach(function (f) { fd.append('file', f, f.name); });
  return fetch(API_BASE + '/upload', {
    method: 'POST', headers: S.token ? { 'X-Token': S.token } : {}, body: fd
  }).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
      return j.files;
    });
  });
}

/* 单张图片上传 + 预览。产品头图这类「一张图、看得见、能换能删」的场景，
   用 ask() 的 file 字段太重（它是给多附件列表用的），这里给一个就地控件：
   点一下选图 → 立刻传 → 显示缩略图。值放在容器的 data-v 上，由 imgRead 取。
   （唐美芳 2026-09-01：「ubk 上品的时候没有上传图片的位置」） */
function imgField(k, value, hint) {
  return '<div class="imf" data-imf="' + k + '" data-v="' + esc(value || '') + '">' +
    '<div class="imf-p"' + (value ? ' style="background-image:url(' + esc(value) + ')"' : '') + '>' +
    (value ? '' : '<span>未上传</span>') + '</div>' +
    '<div class="imf-op"><button type="button" class="btn sm" data-imf-pick>' +
    (value ? '更换图片' : '上传图片') + '</button>' +
    '<button type="button" class="btn sm" data-imf-del' + (value ? '' : ' style="display:none"') +
    '>移除</button>' +
    '<input type="file" accept="image/*" hidden>' +
    (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div></div>';
}
function imgBind(scope) {
  $$('[data-imf]', scope).forEach(function (box) {
    var fi = $('input[type=file]', box), pv = $('.imf-p', box);
    var del = $('[data-imf-del]', box), pick = $('[data-imf-pick]', box);
    var set = function (url) {
      box.dataset.v = url || '';
      pv.style.backgroundImage = url ? 'url(' + url + ')' : '';
      pv.innerHTML = url ? '' : '<span>未上传</span>';
      pick.textContent = url ? '更换图片' : '上传图片';
      del.style.display = url ? '' : 'none';
    };
    pick.onclick = function () { fi.click(); };
    del.onclick = function () { set(''); };
    fi.onchange = function () {
      if (!fi.files.length) return;
      var f = fi.files[0];
      /* 头图会铺满客户端首屏，太小的图放大后是糊的；太大的图拖慢加载 */
      if (f.size > 5 * 1024 * 1024) { fi.value = ''; return toast('图片不要超过 5MB', true); }
      pick.disabled = true; pick.textContent = '上传中…';
      upload(fi.files).then(function (list) {
        set(list[0].url);
      }).catch(function (e) { toast(e.message || '上传失败', true); })
        .then(function () { pick.disabled = false; fi.value = ''; });
    };
  });
}
function imgRead(scope, k) {
  var box = $('[data-imf="' + k + '"]', scope);
  return box ? (box.dataset.v || '') : '';
}

/* ---------------------------------------------------------------
   多图上传（2026-09-10）
   唐美芳给了众信现有「审核驳回」弹窗的截图，要求照它做：驳回原因多选 +
   驳回截图最多 5 张、单张 2M。imgField 是单图的（产品头图那种），
   驳回截图要的是一排缩略图 + 一个「+」格子，所以另起一个。
   与 imgField 同一套读写约定：值放在容器的 data-v 上（JSON 数组），
   渲染 imgsField → 绑定 imgsBind → 提交时 imgsRead。
   --------------------------------------------------------------- */
function imgsField(k, list, opt) {
  opt = opt || {};
  var max = opt.max || 5, mb = opt.mb || 2;
  list = list || [];
  return '<div class="imgs" data-imgs="' + k + '" data-max="' + max + '" data-mb="' + mb +
    '" data-v="' + esc(JSON.stringify(list)) + '">' +
    '<div class="imgs-row"></div>' +
    '<input type="file" accept="image/jpeg,image/png" multiple hidden>' +
    '<div class="hint">支持 JPG/PNG 格式，最多上传 ' + max + ' 张，单张不超过 ' + mb + 'M</div>' +
    '</div>';
}
function imgsBind(scope) {
  $$('[data-imgs]', scope).forEach(function (box) {
    var fi = $('input[type=file]', box), row = $('.imgs-row', box);
    var max = +box.dataset.max || 5, mb = +box.dataset.mb || 2;
    function get() { try { return JSON.parse(box.dataset.v || '[]'); } catch (e) { return []; } }
    function set(l) { box.dataset.v = JSON.stringify(l); draw(); }
    function draw() {
      var l = get();
      row.innerHTML = l.map(function (u, i) {
        return '<div class="imgs-c" style="background-image:url(' + esc(u) + ')">' +
          '<a data-idel="' + i + '" title="移除">&times;</a></div>';
      }).join('') +
        (l.length >= max ? ''
          : '<a class="imgs-add" data-iadd><i>+</i><s>上传截图</s></a>');
      $$('[data-idel]', row).forEach(function (a) {
        a.onclick = function (e) {
          e.stopPropagation();
          var l2 = get(); l2.splice(+a.dataset.idel, 1); set(l2);
        };
      });
      var add = $('[data-iadd]', row);
      if (add) add.onclick = function () { fi.click(); };
      /* 点缩略图看原图——审核人自己也要能回看传了什么 */
      $$('.imgs-c', row).forEach(function (d, i) {
        d.onclick = function () { window.open(get()[i], '_blank'); };
      });
    }
    fi.onchange = function () {
      var picked = [].slice.call(fi.files);
      if (!picked.length) return;
      var room = max - get().length;
      if (picked.length > room) {
        toast('最多再上传 ' + room + ' 张', true);
        picked = picked.slice(0, room);
      }
      var big = picked.filter(function (f) { return f.size > mb * 1024 * 1024; });
      if (big.length) {
        fi.value = '';
        return toast('单张不要超过 ' + mb + 'M：' + big[0].name, true);
      }
      upload(picked).then(function (l) {
        set(get().concat(l.map(function (x) { return x.url; })));
      }).catch(function (e) { toast(e.message || '上传失败', true); })
        .then(function () { fi.value = ''; });
    };
    draw();
  });
}
function imgsRead(scope, k) {
  var box = $('[data-imgs="' + k + '"]', scope);
  if (!box) return [];
  try { return JSON.parse(box.dataset.v || '[]'); } catch (e) { return []; }
}

function confirmBox(title, text, okText) {
  return new Promise(function (resolve) {
    modal(title, '<div style="line-height:1.8">' + text + '</div>', [
      { t: '取消' },
      { t: okText || '确定', cls: 'r', fn: function (m, close) { resolve(true); close(); return false; } }
    ]);
  });
}

/* ---------- 渲染片段 ---------- */
/* 办签进度六步（唐美芳 2026-09-02 重定义，与后端 PROGRESS 一一对应）：
   下单即进「待收料」→ 客人交完材料「待审核」→ 材料过审且表填完「待提交至官网」→
   提交官网并回填 Application ID「待预约」→ 登记预约「待出签」→ 出签或拒签都算「已完成」。
   递交、面签、行政审查不再各占一步：它们是「待出签」区间里的事实与分支，
   主干上多一个节点，专员就多一次不知道该干什么的停顿。 */
var PROG = [['P1', '待收料'], ['P2', '待审核'], ['P3', '待提交至官网'],
['P4', '待预约'], ['P5', '待出结果'], ['P6', '已完成']];

/* 进度码 → 中文，底部操作条等处直接取，免得各页各写一份对照表 */
function progText(cur) {
  var h = PROG.filter(function (p) { return p[0] === cur; })[0];
  return h ? h[1] : (cur || '');
}

function steps(cur, onClick) {
  var i = PROG.map(function (p) { return p[0]; }).indexOf(cur);
  return '<div class="steps">' + PROG.map(function (p, k) {
    var cls = k < i ? 'done' : (k === i ? 'cur' : '');
    return '<div class="step ' + cls + (onClick ? ' click' : '') + '" data-p="' + p[0] + '"><i></i><span>' +
      p[1] + '</span></div>';
  }).join('') + '</div>';
}
function bindSteps(root, fn) {
  $$('.step.click', root).forEach(function (el) { el.onclick = function () { fn(el.dataset.p); }; });
}

/* 近 N 日趋势柱：由真实订单的 created_at 聚合，不造数 */
function trendBars(list, days, dateFn, valFn) {
  var buckets = [], today = new Date();
  for (var i = days - 1; i >= 0; i--) {
    var d = new Date(today.getTime() - i * 86400000);
    buckets.push({ k: d.toISOString().slice(0, 10), v: 0, last: i === 0 });
  }
  var idx = {};
  buckets.forEach(function (b, i) { idx[b.k] = i; });
  (list || []).forEach(function (o) {
    var k = d10(dateFn ? dateFn(o) : o.created_at);
    if (idx[k] !== undefined) buckets[idx[k]].v += valFn ? valFn(o) : 1;
  });
  var max = Math.max.apply(null, buckets.map(function (b) { return b.v; })) || 1;
  return '<div class="chart">' + buckets.map(function (b) {
    var h = Math.round(b.v / max * 100);
    return '<div class="col' + (b.last ? ' today' : '') + '">' +
      '<i class="' + (b.v ? '' : 'zero') + '" style="height:' + (b.v ? Math.max(h, 6) : 2) + '%">' +
      '<em>' + b.v + '</em></i><s>' + b.k.slice(5) + '</s></div>';
  }).join('') + '</div>';
}

function timeline(events) {
  if (!events || !events.length) return '<div class="empty">暂无动态</div>';
  return '<div class="tl">' + events.map(function (e) {
    return '<div><time>' + d19(e.created_at) + '</time><b>' + esc(e.action) + '</b><p>' +
      esc(e.detail || '') + (e.actor_name ? ' · ' + esc(e.actor_name) : '') + '</p></div>';
  }).join('') + '</div>';
}

var MAT_TAG = { wait: ['plain', '未提交'], review: ['warn', '待审核'], pass: ['ok', '已通过'], reject: ['bad', '已驳回'] };
function matTag(s) { var t = MAT_TAG[s] || ['plain', s]; return '<span class="tag ' + t[0] + '">' + t[1] + '</span>'; }
var ORD_TAG = { created: 'warn', paid: 'info', done: 'ok', cancelled: 'plain', refunded: 'bad' };
/* 办理状态是派生值（后端 work_status），不落库、不用人维护 */
/* 办签状态三态（2026-09-03 唐美芳：「应该和订单合同状态一样，有未完成、部分完成、已完成，
   而不是像现在这样，只有 1 个人完成，办签状态也是已完成状态」）。
   分母是订单下<b>全部</b>办签人，退款/取消的那些也算在内——2 人单退了 1 人、
   剩下那个走完，整单只能叫「部分完成」。旧的「未开始 / 办理中」合并进「未完成」。 */
var WORK_ST = [['未完成', '未完成'], ['部分完成', '部分完成'], ['已完成', '已完成']];
var WORK_TAG = { '未完成': 'plain', '部分完成': 'info', '已完成': 'ok',
                 /* 兼容历史数据里可能残留的旧词 */
                 '未开始': 'plain', '办理中': 'info' };

/* 资金闸门不再当成一条正式状态线展示。
   唐美芳 2026-08-31：「资金闸门也很少在系统里这么表达，未放行/已放行，
   如果确实监控有风险，那么直接给个标签性质的，然后打个小问号，说明下为什么展示这个标识」。
   所以：已确认到账＝正常态，不占位置不显示；未确认才挂一个带问号的风险标签。

   2026-09-02 又改了一次措辞：「资金放行」是内部黑话，她说普通人看不懂。
   注意它不等于「支付状态」——订单状态里已经有「已付款」，这一步是财务核对水单、
   确认钱真的到账，两者是先后两件事，合并会丢掉「钱到没到账」这道闸门。
   所以按它的实际动作叫「财务确认收款」，标签写「待财务确认到账」。 */
/* 2026-09-03 唐美芳：「订单列表直接增加一个支付状态展示吧，别展示待财务确认到账了，
   几个系统都需要同步」。
   于是订单列表统一改用下面的 payTag()，gateTag() 只留给<b>财务自己的页面</b>
   （收款管理 / 订单总览的资金异常筛选）——那是财务的催办抓手，不是给销售和客户看的状态。 */
function gateTag(o) {
  if (o.gate) return '';
  if (o.status === 'created') return '';          // 还没付款，谈不上确认到账
  if (o.status === 'cancelled' || o.status === 'refunded') return '';
  return '<span class="rk">待财务确认到账<i data-rk>?</i></span>';
}

/* 支付状态 / 收款状态 —— 同一个状态码，两种立场两套措辞
   （唐美芳 2026-09-03：「uom 和 csp 是内部系统运营视角，ubk 是外部供应商收款视角，
   注意甄别」）：
     UOM / CSP / 有米 / C 端 → 客户付给平台的钱  → 待支付 / 部分支付 / 已支付
     UBK 供应商门户          → 平台付给供应商的钱 → 待收款 / 部分收款 / 已收全款
   两笔钱不是一回事，字段也是后端分开算的（pay_state / recv_state），别互相顶替。 */
var PAY_ST_CN = { unpaid: '待支付', part: '部分支付', paid: '已支付' };
var RECV_ST_CN = { unpaid: '待收款', part: '部分收款', paid: '已收全款' };
var PAY_ST_TAG = { unpaid: 'warn', part: 'info', paid: 'ok' };

/* ubk=true 时取供应商那套词，读的也是 recv_state 字段 */
function payTag(o, ubk) {
  var k = ubk ? (o.recv_state || 'unpaid') : (o.pay_state || 'unpaid');
  var t = ubk ? RECV_ST_CN[k] : PAY_ST_CN[k];
  return '<span class="tag ' + (PAY_ST_TAG[k] || 'plain') + '">' + esc(t || k) + '</span>';
}
var GATE_WHY = '<b>为什么会有这个标识</b><br>' +
  '客户已经付款，但财务还没在「收款管理」里核对水单、确认这笔钱真的到账。<br><br>' +
  '<b>意味着什么风险</b><br>' +
  '财务确认到账是整条链路的总开关：<b>没确认就不会生成签证工单</b>，专员看不到这张单、' +
  '不会开始办理，也不会对供应商挂应付。所以这张单虽然客人已经付了钱，实际上一步没动——' +
  '拖久了会挤压办签时效，客人却以为已经在办了。<br><br>' +
  '<b>怎么消掉</b><br>财务在「收款管理 › 待审核」里核对第三方流水号与到账金额，点「水单到账」即可。';


/* actFn 可选：给出这条记录的操作按钮时，按钮单独占一整行右对齐，
   跟正常管理后台一样——记录信息归记录信息，动作归动作，不挤在最后一列里换行 */
function table(cols, list, rowFn, emptyText, actFn) {
  if (!list || !list.length) return '<div class="empty">' + (emptyText || '暂无数据') + '</div>';
  return '<table' + (actFn ? ' class="tw"' : '') + '><thead><tr>' +
    cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') +
    '</tr></thead><tbody>' + list.map(function (r, i) {
      var tr = '<tr' + (actFn ? ' class="rec"' : '') + '>' + rowFn(r, i) + '</tr>';
      if (!actFn) return tr;
      var a = actFn(r, i) || '';
      return tr + '<tr class="ops"><td colspan="' + cols.length + '">' +
        (a || '<em>无可执行操作</em>') + '</td></tr>';
    }).join('') + '</tbody></table>';
}

/* 信息分区单元格：一列里按语义堆叠若干「标签＋值」，信息量大的列表靠分区看清楚，
   而不是横着铺二十列谁也读不完。pairs = [[标签, 值 html, 额外类名]]，假值项自动跳过 */
function zn(pairs) {
  return '<div class="zn">' + pairs.filter(Boolean).map(function (p) {
    return '<div' + (p[2] ? ' class="' + p[2] + '"' : '') + '><s>' + p[0] + '</s>' +
      '<b>' + (p[1] === '' || p[1] == null ? '—' : p[1]) + '</b></div>';
  }).join('') + '</div>';
}
function znMoney(n, cls) {
  return '<span class="mny' + (cls ? ' ' + cls : '') + '">¥' + money(n) + '</span>';
}

/* 顶部查询卡：正常管理后台的列表页都是「一张查询卡 + 一张结果表」。
   fields = [{k, t, ph, type:'sel', opts:[[值,文案]], get(row)}]，条件存在
   S.cache['q:'+key]；改字段不立即刷新，点「搜索」才生效，跟真后台一致。 */
/* 从当前数据里抽出某字段的去重值，直接喂给 srchCard 的下拉：
   筛选项要跟着真实数据走，写死的枚举很快就跟数据对不上 */
function uniqOpts(list, get) {
  var seen = {}, out = [];
  (list || []).forEach(function (r) {
    var v = get(r);
    if (v && !seen[v]) { seen[v] = 1; out.push([v, v]); }
  });
  return out.sort(function (a, b) { return a[0] > b[0] ? 1 : -1; });
}
function srchCard(key, fields) {
  var v = S.cache['q:' + key] || (S.cache['q:' + key] = {});
  var html = '<div class="srch"><div class="sf">' + fields.map(function (f) {
    var cur = v[f.k] || '';
    return '<label><s>' + esc(f.t) + '</s>' + (f.type === 'sel' ?
      ('<select data-q="' + f.k + '"><option value="">全部</option>' +
        f.opts.map(function (o) {
          return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === cur ? ' selected' : '') +
            '>' + esc(o[1]) + '</option>';
        }).join('') + '</select>') :
      ('<input data-q="' + f.k + '" value="' + esc(cur) + '" placeholder="' +
        esc(f.ph || '请输入') + '">')) + '</label>';
  }).join('') + '</div><div class="sb">' +
    '<button class="btn" data-qreset>重置</button>' +
    '<button class="btn p" data-qgo>搜索</button></div></div>';
  return {
    html: html,
    /* 条件为空即不参与过滤；文本模糊匹配，下拉精确匹配 */
    filter: function (list) {
      return (list || []).filter(function (r) {
        return fields.every(function (f) {
          var qv = String(v[f.k] || '').trim();
          if (!qv) return true;
          var got = f.get ? f.get(r) : r[f.k];
          /* multi: 该字段本身是多值（如客户的来源渠道），下拉用「包含」而不是「全等」 */
          if (f.multi) return (got || []).indexOf(qv) >= 0;
          if (f.type === 'sel') return String(got) === qv;
          return String(got == null ? '' : got).toLowerCase()
            .indexOf(qv.toLowerCase()) >= 0;
        });
      });
    },
    bind: function (root, onChange) {
      $$('[data-q]', root).forEach(function (el) {
        el.oninput = el.onchange = function () { v[el.dataset.q] = el.value; };
        el.onkeydown = function (e) { if (e.key === 'Enter') onChange(); };
      });
      $('[data-qgo]', root).onclick = onChange;
      $('[data-qreset]', root).onclick = function () {
        S.cache['q:' + key] = {};
        onChange();
      };
    }
  };
}

/* 分页：演示系统数据量不大，但列表底部的「共 N 条 + 翻页」是管理后台的基本信息，
   没有它使用者判断不了自己看到的是全部还是一页 */
function pager(key, list, size) {
  size = size || 10;
  var n = (list || []).length, pages = Math.max(1, Math.ceil(n / size));
  var p = Math.min(S.cache['pg:' + key] || 1, pages);
  var btn = function (t, to, on, dis) {
    return '<a' + (dis ? ' class="dis"' : (on ? ' class="on"' : '')) +
      (dis ? '' : ' data-pg="' + to + '"') + '>' + t + '</a>';
  };
  /* 省略号去重原来写的是 `nums.slice(-9) !== '<em>…</em>'`——
     `'<em>…</em>'` 是 <em>(4) + …(1) + </em>(5) = **10** 个字符，slice(-9) 永远取不到它，
     于是每一个被跳过的页码都补一个省略号：43 页的列表上排了 39 个「…」
     （唐美芳 2026-09-08 截图：「csp 里订单列表的分页是怎么回事」）。
     改成用布尔量记「上一个是不是省略号」，不再靠字符串长度比对。 */
  var nums = '', dots = false;
  for (var i = 1; i <= pages; i++) {
    if (pages > 7 && i > 2 && i < pages - 1 && Math.abs(i - p) > 1) {
      if (!dots) { nums += '<em>…</em>'; dots = true; }
      continue;
    }
    nums += btn(i, i, i === p);
    dots = false;
  }
  return {
    rows: (list || []).slice((p - 1) * size, p * size),
    html: '<div class="pgr"><s>共 <b>' + n + '</b> 条记录' +
      (pages > 1 ? '，第 ' + p + '/' + pages + ' 页' : '') + '</s>' +
      (pages > 1 ? '<div class="pn">' + btn('‹', p - 1, false, p === 1) + nums +
        btn('›', p + 1, false, p === pages) + '</div>' : '') + '</div>',
    bind: function (root, onChange) {
      $$('[data-pg]', root).forEach(function (a) {
        a.onclick = function () { S.cache['pg:' + key] = +a.dataset.pg; onChange(); };
      });
    }
  };
}
/* 列排序：金额、天数、条数、时间这类「数据列」不该塞进查询卡当筛选条件——
   使用者要的是「按垫付金额从大到小看」，不是「垫付金额等于多少」。
   defs = [[列标题, get(row)]]，只登记需要排序的列，其余列表头原样输出。 */
/* def：默认排序 ['列名','desc'|'asc']。不给就沿用后端返回的顺序。
   台账类列表不给默认排序，看起来就是「顺序随机」——供应商刚改完的产品
   不一定在第一行（唐美芳 2026-09-01：「产品列表的排序默认按照操作时间倒序」）。 */
function sorter(key, defs, def) {
  var st = S.cache['sort:' + key];
  if (!st) {
    st = S.cache['sort:' + key] = def ? { k: def[0], d: def[1] || 'desc' } : {};
  }
  var map = {};
  defs.forEach(function (d) { map[d[0]] = d[1]; });
  return {
    cols: function (titles) {
      return titles.map(function (t) {
        if (!map[t]) return t;
        var on = st.k === t;
        return '<a class="sth' + (on ? ' on' : '') + '" data-sort="' + esc(t) + '">' +
          esc(t) + '<i>' + (on ? (st.d === 'desc' ? '↓' : '↑') : '↕') + '</i></a>';
      });
    },
    sort: function (list) {
      if (!st.k || !map[st.k]) return list || [];
      var g = map[st.k], dir = st.d === 'desc' ? -1 : 1;
      return (list || []).slice().sort(function (a, b) {
        var x = g(a), y = g(b);
        if (typeof x === 'number' || typeof y === 'number') return ((x || 0) - (y || 0)) * dir;
        x = String(x == null ? '' : x); y = String(y == null ? '' : y);
        return (x > y ? 1 : x < y ? -1 : 0) * dir;
      });
    },
    bind: function (root, onChange) {
      $$('[data-sort]', root).forEach(function (a) {
        a.onclick = function () {
          var t = a.dataset.sort;
          if (st.k === t) st.d = st.d === 'desc' ? 'asc' : 'desc';
          else { st.k = t; st.d = 'desc'; }
          onChange();
        };
      });
    }
  };
}

/* 审计列：这条记录是谁建的、最后谁动过。
   一个后台答不出这两个问题就没法上线——出了错找不到人，也没法复盘。 */
function audZn(r) {
  r = r || {};
  /* 建完还没人动过的单子，「最近操作」和「创建」一模一样，重复一遍只是噪音，那就不显示。 */
  var moved = r.updated_at && r.updated_at !== r.created_at;
  return zn([
    ['创建', esc(r.created_by_name || '—') + (r.created_at ? '<i class="ts">' + d16(r.created_at) + '</i>' : ''), 'mut'],
    moved ? ['最近操作', esc(r.updated_by_name || '—') + '<i class="ts">' + d16(r.updated_at) + '</i>', 'mut'] : null
  ]);
}

/* 列表里同一格挤「创建 + 最近操作」会把两条不同性质的信息叠在一起，扫列表时读不快。
   拆成两列：表头用 AUD_COLS 插在「操作」前一列，单元格用 audTd 出两个 <td>。
   没人动过的记录，最近操作那格给 —，不重复抄一遍创建人。
   详情页的信息区仍用 audZn（那里是竖排字段，不是表格）。 */
/* 签证有效期单位。原来各页面都写成 `type === 'year' ? '年' : '天'` 的二元判断，
   2026-09-07 补「月」时才发现有 8 处要一起改——统一收到这里，以后加单位只动一行。 */
var VALID_UNIT = { year: '年', month: '个月', day: '天' };
function validTx(p) {
  if (!p || !p.valid_num) return '—';
  return p.valid_num + ' ' + (VALID_UNIT[p.valid_type] || '年');
}

var AUD_COLS = ['创建', '最近操作'];
var AUD_SORTS = [
  ['创建', function (r) { return r.created_at || ''; }],
  ['最近操作', function (r) { return r.updated_at || r.created_at || ''; }]
];
function audUnit(name, at) {
  return '<b class="who">' + esc(name || '—') + '</b>' +
    (at ? '<i class="ts">' + d16(at) + '</i>' : '');
}
function audTd(r) {
  r = r || {};
  var moved = r.updated_at && r.updated_at !== r.created_at;
  return '<td class="aud">' + audUnit(r.created_by_name, r.created_at) + '</td>' +
    '<td class="aud">' + (moved ? audUnit(r.updated_by_name, r.updated_at) : '<b class="who mut">—</b>') + '</td>';
}

/* 操作说明：页面顶部告诉使用者「这个页面分几步怎么用」，
   而不是解释这个模块为什么这么设计——后者是写给做系统的人看的，用的人不需要。
   页面顶部的说明性内容只允许有这一块，链路导航之类也并进来当副标题，
   不要再各自占一个白框，否则一进页面就要先判断该看哪个。
   steps = [[标题, 说明]]，nav 为可选的同级导航条

   可折叠并记住选择：新人第一次进来是展开的，老手收起一次就一直收着，
   不用每天进一次页面都被同一段说明占掉半屏。 */
function howtoOpen() {
  try { return localStorage.getItem('vo.howto') !== '0'; } catch (e) { return true; }
}
/* ⚠️ 2026-09-09 起后台各页不再调用这个组件。
   唐美芳：「要不把后台所有页面的操作说明去掉吧，感觉逻辑更新了文案也没同步更新」。
   问题是真的：这一版光签证办理中心就改了七八轮，说明里还写着「六步」「SLA」「挂起」
   这些已经不存在的东西——**说明跟不上功能，就成了误导**。
   函数保留是因为删掉要动 15 个调用点的排版；要恢复只需把调用加回去。 */
function howto(steps, nav) {
  var open = howtoOpen();
  return '<div class="howto' + (open ? '' : ' fold') + '"><div class="hd"><s>操作说明</s>' +
    (nav || '') + '<a class="ht-t" data-htog="1">' + (open ? '收起' : '展开') + '</a></div><ol>' +
    steps.map(function (x) {
      /* 内容不转义：howto 的文案全是代码里写死的说明，含 <b> 强调是有意的。
         原来整段 esc，17 处强调全被渲染成了「<b>xxx</b>」字面量。
         标题仍然 esc —— 它偶尔会拼变量。（2026-08-31） */
      return '<li><b>' + esc(x[0]) + '</b><i>' + x[1] + '</i></li>';
    }).join('') + '</ol></div>';
}
document.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-htog]') : null;
  if (!t) return;
  var open = !howtoOpen();
  try { localStorage.setItem('vo.howto', open ? '1' : '0'); } catch (err) { }
  $$('.howto').forEach(function (b) {
    b.classList.toggle('fold', !open);
    var a = b.querySelector('[data-htog]');
    if (a) a.textContent = open ? '收起' : '展开';
  });
});

/* 材料样例：运营在平台材料库里挂一次材料样例，客户端、门店端、专员审核页都能点开对照，
   让「照着样子准备」取代「凭想象准备」，这是补料率能压下来的关键一环。
   i 为材料项（清单项或订单材料），没挂样例时返回空串，调用处无需判断。 */
/* ============ 对客展示模式（2026-09-07） ============
   唐美芳：「有米除了销售自己看以外，还要给客人看，所以旅游产品线的产品
   都有个展示零售价还是结算价的切换按钮，默认展示零售价，这是给客人看的模式，
   csp 也需要有」。
   两个值：
     guest（默认）—— 客人模式，只出零售价，结算价、毛利、成本一律不渲染；
     sales        —— 销售模式，额外显示结算价与毛利。
   ⚠️ 只控制「渲染不渲染」，不改接口：结算价与毛利本来就只下发给 B 端身份，
   C 端小程序无论怎么切都拿不到这些字段，所以这个开关不是权限，是**遮挡**——
   销售把手机转给客人看时不必退出登录。
   存 localStorage 而不是 S.cache：销售翻几页、跳个详情再回来，模式不能自己弹回去。 */
var PM_KEY = 'visaops:pmode';
function pmGet() {
  try {
    return localStorage.getItem(PM_KEY) === 'sales' ? 'sales' : 'guest';
  } catch (e) {
    return S.cache.pmode === 'sales' ? 'sales' : 'guest';
  }
}
function pmSales() { return pmGet() === 'sales'; }
function pmSet(v) {
  S.cache.pmode = v;
  try { localStorage.setItem(PM_KEY, v); } catch (e) { /* 隐私模式下退回内存 */ }
}
/* 「零售价 / 结算价」展示模式切换（2026-09-16 由单枚 icon 改成分段控件）。
   原版是一颗「标签 icon + 当前档文字」的小胶囊，销售容易把它当成一个状态徽标，
   而不是「点它切换价格」的控件（唐美芳 2026-09-16：「这个按钮长得不像用来切换
   价格的」）。分两段并排看——「零售价 / 结算价」一眼即知是二选一，亮着的那段
   就是当前档，比单个胶囊的可点性、可读性都强。
   ⚠️ 保留「零售价 / 结算价」完整文字而不做纯图标：这个开关一按就把结算价和毛利
   露出来，销售随时可能把屏幕转给客人看，当前处于哪一档必须一眼可读。
   ⚠️ cls 不要再用 'uz' / 'ym' 这种裸类名——上一版 pmToggle('uz') 生成的
   <span class="pm-tg uz"> 撞上了 CSP 门户根容器的 .uz{min-height:100vh;
   flex-direction:column}，开关被撑成 62×1200 的透明竖条贴在通栏上，
   肉眼完全看不见（唐美芳 2026-09-09：「CSP 怎么没有看到这个按钮呢」）。
   修饰类一律加 pm- 前缀。 */
function pmIcon(cls) {
  var sale = pmSales();
  function seg(k, label, tip) {
    return '<a class="pm-sg' + ((k === 'sales') === sale ? ' on' : '') +
      '" data-pm="' + k + '" title="' + tip + '">' + label + '</a>';
  }
  return '<span class="pm-seg' + (cls ? ' ' + cls : '') + '">' +
    seg('guest', '零售价', '客人模式：只显示零售价，适合把屏幕交给客人看') +
    seg('sales', '结算价', '销售模式：显示结算价与毛利，向客人展示前请切回零售价') +
    '</span>';
}
function pmBind(root, onChange) {
  function apply(v, onChange) {
    if (v === pmGet()) return;
    pmSet(v);
    toast(pmSales() ? '已切换为销售模式，页面会显示结算价与毛利'
      : '已切换为客人模式，结算价与毛利已隐藏');
    if (onChange) onChange();
  }
  $$('[data-pm]', root).forEach(function (a) {
    a.onclick = function (e) { e.stopPropagation(); apply(a.dataset.pm, onChange); };
  });
  /* 一颗按钮来回切：两档而已，多摆一个选择面板反而多一步 */
  $$('[data-pmic]', root).forEach(function (a) {
    a.onclick = function (e) {
      e.stopPropagation();
      apply(pmSales() ? 'guest' : 'sales', onChange);
    };
  });
}

/* ============ 发给客人自己填（2026-09-08 批 1）============
   唐美芳：「我在想代填、发给客人填为什么不是一个页面呢……页面有点多，怎么感觉这么混乱呢」。
   「代填」和「发给客人填」本来就是同一件事的两条路径（我替他填 / 他自己填），
   原来做成了一个跳页、一个弹窗，还各占一个按钮，而且生成链接这段代码
   在办理中心、材料页、订单详情、录资料页**各写了一遍**，措辞四个版本。
   收敛成这一个函数：列表行上不再单独摆「发给客人填」，
   它变成填表页 / 材料页里的一个动作。 */
function shareTask(aid, name) {
  return api('/task/share', { applicant_id: +aid, days: 7 }).then(function (r) {
    var url = location.origin + r.url;
    var box = modal('发给客人自己填' + (name ? ' · ' + esc(name) : ''),
      '<div class="pad"><div class="hint">把链接发给 <b>' + esc(name || '办签人') +
      '</b> 本人，对方打开即可<b>交材料、填申请表、看进度</b>，无需登录' +
      (r.expire ? '，有效期至 ' + d16(r.expire) : '，链接 7 天内有效') + '。<br>' +
      '同一订单内每位办签人各填一份申请表，请<b>分别发送至本人</b>。<br>' +
      '已由销售或专员代填的部分，客人打开后可<b>继续填写或逐项核对</b>，' +
      '最终由本人提交。</div>' +
      '<div class="shlink" style="word-break:break-all">' + esc(url) + '</div>' +
      '<div class="btns" style="margin-top:12px">' +
      '<button class="btn p" data-shcp>复制链接</button>' +
      '<button class="btn" data-shop>先行预览</button></div></div>', [{ t: '关闭' }]);
    $('[data-shcp]', box.mask).onclick = function () {
      doCopy(url); toast('链接已复制，请发送给客人本人');
    };
    $('[data-shop]', box.mask).onclick = function () { window.open(url, '_blank'); };
    return box;
  }).catch(fail);
}

function sampleBtn(i, cls) {
  if (!i || !i.sample || !(i.sample.files || []).length) return '';
  return '<button class="' + (cls || 'btn sm') + '" data-smp="' + jattr(i.sample) + '">查看样例</button>';
}
/* 真实导出：把清单文本落成文件下载，而不是弹一句「已发送」了事 */
function downloadText(name, text) {
  var url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }));
  var a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
}
/* 材料清单导出文本：C 端与门店端共用同一份口径 */
function matListText(title, list) {
  var must = list.filter(function (i) { return i.necessity === 'must'; });
  var sug = list.filter(function (i) { return i.necessity !== 'must'; });
  function sec(t, arr) {
    if (!arr.length) return '';
    return '\n【' + t + '】共 ' + arr.length + ' 项\n' + arr.map(function (i, n) {
      return (n + 1) + '. ' + i.mat_name + '（' + i.attr_text + ' × ' + i.copies +
        ' · ' + i.way_text + '）\n   要求：' + (i.require_text || '按使领馆通用要求准备即可。');
    }).join('\n') + '\n';
  }
  return title + '\n导出时间：' + new Date().toLocaleString('zh-CN') + '\n' +
    sec('必须材料', must) + sec('建议材料', sug) +
    '\n注：提交、缴费、抢号、递交、采指纹五个环节由人工在使领馆官方渠道完成。';
}
/* 站内文件（材料样例、客人传的证件、导出件）在小程序里点开时不该把人甩去浏览器新标签页 ——
   那就是唐美芳 2026-08-27 说的「跳转到小程序外面」。imm 模式下改成机身内的预览层；
   PC 端照旧新标签打开，那本来就是浏览器该干的事。
   站外链接（使领馆官网、政策原文）不在此列：那本来就是离开小程序的动作，
   真实小程序里也是跳 webview 或外部浏览器，硬留在壳里反而是假的。 */
function isInApp() { return document.body.classList.contains('imm'); }
function fileLink(url, text, cls) {
  var c = cls ? ' class="' + cls + '"' : '';
  if (isInApp()) return '<a data-view="' + esc(url) + '"' + c + '>' + text + '</a>';
  return '<a href="' + esc(url) + '" target="_blank"' + c + '>' + text + '</a>';
}
/* 机身内的全屏预览层：图片直接看，其他类型给一句说明 + 一个明确的「用浏览器打开」出口，
   免得客人点了没反应以为坏了。 */
function viewInApp(url, name) {
  var host = document.querySelector('.phone') || document.body;
  var img = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url);
  var d = document.createElement('div');
  d.className = 'ph-view';
  d.innerHTML = '<div class="hd"><b>' + esc(name || '预览') + '</b><a data-x>关闭</a></div>' +
    '<div class="bd">' + (img ? '<img src="' + esc(url) + '" alt="">' :
      '<div class="tx">这是一个 ' + esc((url.split('.').pop() || '').toUpperCase().slice(0, 6)) +
      ' 文件，小程序内不直接预览。<a href="' + esc(url) + '" target="_blank">用浏览器打开</a></div>') +
    '</div>';
  host.appendChild(d);
  var close = function () { d.remove(); };
  d.querySelector('[data-x]').onclick = close;
  d.onclick = function (e) { if (e.target === d || e.target.className === 'bd') close(); };
}
document.addEventListener('click', function (e) {
  if (!e.target.closest) return;
  var a = e.target.closest('[data-view]');
  if (a) { e.preventDefault(); e.stopPropagation(); viewInApp(a.dataset.view, a.textContent.trim()); }
});

/* 已上传材料：有真实落盘地址就给可点开的链接，审核的人要能当场看到原件 */
function matFile(i, dash) {
  if (!i || !i.file_name) return dash || '—';
  if (!i.file_url) return esc(i.file_name);
  return fileLink(i.file_url, esc(i.file_name));
}
function bindSample(root) {
  $$('[data-smp]', root).forEach(function (b) {
    b.onclick = function (e) {
      e.stopPropagation();
      var s = JSON.parse(b.dataset.smp);
      modal('材料样例 · ' + s.name,
        '<div class="note">「' + esc(s.mat_name) + '」的标准样例，由运营在平台材料库统一维护（' +
        esc(s.code) + '）。按此准备可显著降低补料概率。</div>' +
        s.files.map(function (f) {
          var u = f.url || '';
          var img = /\.(jpg|jpeg|png|webp|gif)$/i.test(u);
          var body = !u ? '<div class="smpx">该样例暂未上传附件，请联系运营在平台材料库补充</div>' :
            img ? fileLink(u, '<img src="' + esc(u) + '" alt="' + esc(f.name) + '">') :
              '<div class="smpx">' + fileLink(u, '下载查看 ' + esc(f.name)) + '</div>';
          return '<figure class="smp">' + body +
            '<figcaption>' + esc(f.name) + '</figcaption></figure>';
        }).join(''), null, true);
    };
  });
}
/* 子状态页签：defs = [{k,t,fn(row)->bool}]，返回 {html, bind(root, render)} */
/* def：首次进入时默认停在哪个页签。
   2026-09-04 把「全部」统一挪到第一位之后，「第一个有数据的页签」这个默认规则
   就等于每个页面都默认「全部」了——待办列表一进来先看到全量，反而不好用
   （唐美芳 2026-09-07 确认要改回）。所以顺序归顺序、默认归默认，各由一个参数管。 */
function subTabs(key, defs, list, def) {
  var cur = S.cache['tab:' + key];
  var counted = defs.map(function (d) {
    return { k: d.k, t: d.t, n: (list || []).filter(d.fn).length, fn: d.fn };
  });
  if (!cur || !defs.some(function (d) { return d.k === cur; })) {
    if (def && defs.some(function (d) { return d.k === def; })) {
      cur = def;
    } else {
      /* 没指定默认就落到第一个有数据的页签，避免一进页面就是空白 */
      var first = counted.filter(function (d) { return d.n > 0; })[0];
      cur = (first || counted[0]).k;
    }
  }
  var html = '<div class="subtabs">' + counted.map(function (d) {
    return '<a data-t="' + d.k + '"' + (d.k === cur ? ' class="on"' : '') + '>' + esc(d.t) +
      '<i>' + d.n + '</i></a>';
  }).join('') + '</div>';
  var active = counted.filter(function (d) { return d.k === cur; })[0];
  return {
    html: html,
    cur: cur,
    rows: (list || []).filter(active.fn),
    bind: function (root, onChange) {
      $$('.subtabs a', root).forEach(function (a) {
        a.onclick = function () { S.cache['tab:' + key] = a.dataset.t; onChange(); };
      });
    }
  };
}

/* 顶部指标带：列表页不再是「标题 + 一张表」，先给一排可点的经营指标，点了直接落到对应页签 */
function kpiBand(key, items, root, onChange) {
  if (root) {
    $$('.kpi[data-kt],.kpi[data-kq]', root).forEach(function (a) {
      a.onclick = function () {
        if (a.dataset.kt) S.cache['tab:' + key] = a.dataset.kt;
        /* 有些 KPI 指向的不是状态而是筛选条件（如「SLA 超期」——待审核的工单也可能超期）。
           点它应该把查询卡里的条件选上，而不是跳去一个假状态页签。 */
        if (a.dataset.kq) {
          var v = S.cache['q:' + key] || (S.cache['q:' + key] = {});
          var kv = JSON.parse(a.dataset.kq);
          Object.keys(kv).forEach(function (k) { v[k] = kv[k]; });
        }
        onChange();
      };
    });
    return;
  }
  return '<div class="kpis">' + items.map(function (it) {
    return '<a class="kpi' + (it.tone ? ' ' + it.tone : '') + '"' +
      (it.tab ? ' data-kt="' + esc(it.tab) + '"' : '') +
      (it.q ? " data-kq='" + esc(JSON.stringify(it.q)) + "'" : '') + '>' +
      '<s>' + esc(it.t) + '</s><b>' + it.n + (it.unit ? '<u>' + esc(it.unit) + '</u>' : '') + '</b>' +
      (it.sub ? '<em>' + it.sub + '</em>' : '') + '</a>';
  }).join('') + '</div>';
}

/* 国旗：区域指示符组成的 emoji，无需图片资源 */
var FLAG = {
  '美国': '🇺🇸', '日本': '🇯🇵', '韩国': '🇰🇷', '英国': '🇬🇧', '法国': '🇫🇷', '德国': '🇩🇪',
  '意大利': '🇮🇹', '西班牙': '🇪🇸', '澳大利亚': '🇦🇺', '新西兰': '🇳🇿', '加拿大': '🇨🇦',
  '新加坡': '🇸🇬', '泰国': '🇹🇭', '马来西亚': '🇲🇾', '越南': '🇻🇳', '菲律宾': '🇵🇭',
  '印度尼西亚': '🇮🇩', '土耳其': '🇹🇷', '俄罗斯': '🇷🇺', '阿联酋': '🇦🇪', '沙特阿拉伯': '🇸🇦',
  '埃及': '🇪🇬', '南非': '🇿🇦', '巴西': '🇧🇷', '瑞士': '🇨🇭', '荷兰': '🇳🇱', '希腊': '🇬🇷'
};
function flag(country) { return FLAG[country] || '🌐'; }
function svg(d) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
}

/* ---------- 签证政策内容：B 端门户与 C 端小程序共用一套渲染 ----------
   政策由总部运营在「签证政策内容」里维护一份，两端读同一个 /shop/policies
   （唐美芳 2026-08-27：不止 C 端要看，B 端也要看）。放在 core 里而不是各写一遍，
   是因为口径一旦两端不一致，销售在门店讲的和客人手机上看到的就会打架。 */
var POLK = {
  free: ['ok', '免签'], landing: ['ok', '落地签'], evisa: ['info', '电子签'],
  change: ['warn', '政策变动'], notice: ['plain', '办理提醒']
};
function polKind(k) { return POLK[k] || ['plain', k]; }

/* 卡片网格：频道页 / C 端签证首页用 */
function polCards(list) {
  if (!list.length) return '<div class="uz-rkempty">暂无已发布的政策内容</div>';
  return '<div class="pol-gd">' + list.map(function (p, i) {
    var k = polKind(p.kind);
    return '<div class="pol-c' + (p.pin ? ' pin' : '') + '" data-pol="' + i + '">' +
      '<div class="hd"><span class="fg">' + flag(p.country) + '</span>' +
      '<b>' + esc(p.country === '*' ? '通用' : p.country) + '</b>' +
      '<span class="tag ' + k[0] + '">' + esc(k[1]) + '</span>' +
      (p.stay ? '<span class="stay">停留 ' + esc(p.stay) + '</span>' : '') +
      (p.pin ? '<em>置顶</em>' : '') + '</div>' +
      '<h5>' + esc(p.title) + '</h5>' +
      '<p>' + esc(p.summary || '') + '</p>' +
      '<div class="ft"><s>' + esc(p.source || '') + '</s><a>查看详情 ›</a></div></div>';
  }).join('') + '</div>';
}

/* 紧凑条：目的地列表页用，销售扫一眼就知道「这个国家现在什么规矩」 */
function polStrip(list) {
  if (!list.length) return '';
  return '<div class="pol-st">' + list.map(function (p, i) {
    var k = polKind(p.kind);
    return '<a class="pol-si" data-pol="' + i + '"><span class="tag ' + k[0] + '">' + esc(k[1]) +
      '</span><b>' + esc(p.title) + '</b>' +
      (p.stay ? '<s>停留 ' + esc(p.stay) + '</s>' : '') + '<i>详情 ›</i></a>';
  }).join('') + '</div>';
}

/* 新闻中心式板块：CSP 签证频道页用。
   唐美芳 2026-08-27 第二次纠正——右栏是给目的地列表页的，频道页上政策要自成一区，
   不要挤在产品列表旁边抢位置，就像门户首页的「新闻中心」那样独立成块。
   左边一条主推（置顶或最新），右边两列速览，都点得进详情。 */
function polNews(list) {
  if (!list.length) return '<div class="uz-rkempty">暂无已发布的政策内容</div>';
  var f = list[0], fk = polKind(f.kind);
  function dt(p) { return (p.effect_at || p.updated_at || '').slice(0, 10); }
  return '<div class="uz-news">' +
    '<a class="uz-nf" data-pol="0" style="background-image:url(' + dimg(f.country) + ')">' +
    '<div class="tx"><div class="tp"><span class="tag ' + fk[0] + '">' + esc(fk[1]) + '</span>' +
    '<b>' + esc(f.country === '*' ? '通用' : f.country) + '</b>' +
    (f.pin ? '<em>置顶</em>' : '') + '</div>' +
    '<h5>' + esc(f.title) + '</h5>' +
    '<p>' + esc(f.summary || '') + '</p>' +
    '<s>' + esc(f.source || '总部运营维护') + (dt(f) ? ' · ' + dt(f) : '') + '</s></div></a>' +
    '<div class="uz-nl">' + list.slice(1).map(function (p, i) {
      var k = polKind(p.kind);
      /* 标题里通常已经带了国名（「泰国对中国公民免签」），再前缀一次会读成「泰国·泰国…」 */
      var cn = p.country === '*' ? '通用' : p.country;
      return '<a data-pol="' + (i + 1) + '"><span class="tag ' + k[0] + '">' + esc(k[1]) + '</span>' +
        '<b>' + (p.title.indexOf(cn) === 0 ? '' : esc(cn) + '·') + esc(p.title) + '</b>' +
        '<u>' + esc(dt(p)) + '</u></a>';
    }).join('') + '</div></div>';
}

/* 横滑卡：C 端小程序用。手机上竖着堆 6 张政策卡会把产品挤到屏外，
   横滑一排既保住了政策的存在感，也不抢首页找签的主线。 */
function polRail(list) {
  if (!list.length) return '';
  return '<div class="pol-rl">' + list.map(function (p, i) {
    var k = polKind(p.kind);
    return '<a class="pol-ri' + (p.pin ? ' pin' : '') + '" data-pol="' + i + '">' +
      '<div class="hd"><span class="fg">' + flag(p.country) + '</span>' +
      '<b>' + esc(p.country === '*' ? '通用' : p.country) + '</b>' +
      '<span class="tag ' + k[0] + '">' + esc(k[1]) + '</span></div>' +
      '<h5>' + esc(p.title) + '</h5><p>' + esc(p.summary || '') + '</p>' +
      (p.stay ? '<s>可停留 ' + esc(p.stay) + '</s>' : '<s>' + esc(p.source || '') + '</s>') +
      '</a>';
  }).join('') + '</div>';
}

/* PC 右侧政策栏：频道页与目的地列表页共用。
   唐美芳 2026-08-27：「签证政策速递这个位置放在正中间合适吗？」「国家签证政策我觉得放右侧区域好一点」。
   她是对的——中间那条是找产品的主线，政策横插一段会把产品推到折叠线以下；
   但政策又不能收进二级页，销售给客人讲价之前先要回答「这个国家现在什么规矩」。
   右栏 sticky 常驻，主线不断、政策随时能看，两头都占住。 */
/* total：栏头计总数，不计当前分类筛剩下的条数——否则栏头写「6 条」、
   下面「全部」页签写 10，看着像数据对不上。 */
function polRailPc(list, title, sub, extra, total) {
  return '<aside class="uz-2s"><div class="uz-prail">' +
    '<div class="hd"><b>' + esc(title) + '</b><em>' +
    (total == null ? list.length : total) + ' 条</em></div>' +
    (sub ? '<s>' + esc(sub) + '</s>' : '') + (extra || '') +
    (list.length ? polStrip(list)
      : '<div class="hint" style="padding:10px 0">该目的地暂无已发布的政策内容</div>') +
    '</div></aside>';
}

function polBind(root, list) {
  $$('[data-pol]', root).forEach(function (el) {
    el.onclick = function () {
      var p = list[+el.dataset.pol];
      if (!p) return;
      var k = polKind(p.kind);
      modal(esc(p.country === '*' ? '通用政策' : p.country + '签证政策'),
        '<div class="pad pol-dt">' +
        '<div class="hd"><span class="tag ' + k[0] + '">' + esc(k[1]) + '</span>' +
        (p.stay ? '<span class="tag plain">停留 ' + esc(p.stay) + '</span>' : '') +
        (p.effect_at ? '<span class="tag plain">' + esc(p.effect_at) + ' 起</span>' : '') +
        '</div><h4>' + esc(p.title) + '</h4>' +
        '<p class="sum">' + esc(p.summary || '') + '</p>' +
        '<div class="bd">' + esc(p.body || '').replace(/\n/g, '<br>') + '</div>' +
        /* 来源必须露出来：没写清楚是哪个使领馆/官网的口径，销售不敢照着跟客人讲 */
        '<div class="src">来源：<b>' + esc(p.source || '未注明') + '</b>' +
        (p.source_url ? ' · <a href="' + esc(p.source_url) + '" target="_blank">原文</a>' : '') +
        '</div><div class="warn">政策以受理时使领馆 / 移民局当日口径为准，' +
        '出行前请再次核对，本页内容不构成入境承诺。</div></div>');
    };
  });
}

function card(title, body, right) {
  return '<div class="card"><h3>' + title + (right ? '<div class="r">' + right + '</div>' : '') +
    '</h3>' + body + '</div>';
}
/* 面包屑：从菜单树反查当前页所属的功能域，让人始终知道自己站在哪一层。
   菜单有 items（两级）和 groups（三级）两种形态，都要认——
   只认 items 的话，三级功能域下的页面会直接抛 undefined.forEach。 */
function crumbOf() {
  var sys = sysOf(S.role); if (!sys) return '';
  var view = (location.hash || '').replace(/^#/, '').split('/')[1];
  var grp = '', sub = '';
  (MENU[sys.k] || []).forEach(function (g) {
    (g.items || []).forEach(function (n) { if (n.v === view) grp = g.t; });
    (g.groups || []).forEach(function (sg) {
      (sg.items || []).forEach(function (n) {
        if (n.v === view) { grp = g.t; sub = sg.t; }
      });
    });
  });
  return '<div class="crumb"><span>' + esc(sys.t) + '</span>' +
    (grp ? '<em>/</em><span>' + esc(grp) + '</span>' : '') +
    (sub ? '<em>/</em><span>' + esc(sub) + '</span>' : '') + '</div>';
}
function pageH(title, desc, right) {
  return '<div class="page-h">' + crumbOf() +
    '<div class="ph-row"><h2>' + esc(title) +
    (desc ? '<i class="pg-i" title="页面说明">i</i>' : '') + '</h2>' +
    (right ? '<div class="ph-act">' + right + '</div>' : '') + '</div>' +
    (desc ? '<p>' + desc + '</p>' : '') + '</div>';
}

/* ---------- 角色与操作链路 ---------- */
var ROLES = [
  {
    k: 'customer', login: 'c1', t: '客户（C 端）', short: '客户',
    note: '张思远 · 直客。签证频道以小程序形态呈现，底部五个 Tab 常驻；材料、补料、签收、退款收在「我的」里，不再平铺。',
  },
  {
    /* 有米小程序 = 门店销售的移动端（唐美芳 2026-08-31：
       「csp还有个移动端叫有米小程序」）。跟 CSP 是同一个销售、同一套权限、
       同一份数据，只是换个终端——所以登录用同一个账号，不新建身份。 */
    k: 'youmi', login: 'sales', t: '门店销售（有米小程序）', short: '有米',
    home: 'book',   /* 默认进签证频道（唐美芳 2026-09-16），而不是工作台首页 */
    note: '王磊 · 国贸门店的手机端。销售在门店外、在客人面前就能查产品、代客下单，' +
      '并把填表链接直接发给客人。与 CSP 工作台同一套数据，只是终端不同。',
  },
  {
    k: 'csp', login: 'sales', t: '门店销售 / 同业（CSP）', short: '门店销售',
    note: '王磊 · 国贸门店。CSP 是众信面向门店销售与同业的 PC 端渠道工作台。' +
      '供应商上品时默认上架 B 端，也就是上到这里；勾了「上架 C 端」才会同时出现在客户小程序。',
  },
  {
    k: 'uom', login: 'op1', who: '陈曦', t: '签证操作专员（UOM）', short: '签证操作专员', duty: '办件·审材料·送签',
    note: '陈曦。链路：接工单 → 审材料/发补料 → 填表缴费 → 预约 → 送签递交 → 回填结果 → 返还资料。',
  },
  {
    k: 'lead', login: 'lead', who: '孙涛', t: '签证主管', short: '签证主管', duty: '派单·挂起·退款审批',
    note: '孙涛。链路：看负载派单 → 处理挂起 → 审批退款 → 拒签归因复盘。',
  },
  {
    k: 'fin', login: 'fin', who: '刘颖', home: 'recv', t: '财务', short: '财务', duty: '收款·退款·转款',
    note: '刘颖。财务是 UOM 运营平台里的一个身份，不是另一套系统。' +
      '链路：收款单据确认到账 → 应付供应商挂账结算 → 退款单据出账 → 垫付台账核销。',
  },
  {
    k: 'ubk', login: 'sup', t: '供应商（UBK）', short: '供应商',
    note: '郑海 · 优耐德。供应商自己录签证属性、选平台材料清单、挂报价，选定上架范围（B 端 CSP / C 端小程序），' +
      '接单后回传进度，月度与平台结算。金额口径是供应商视角：结算价是收入，签证费是成本，差额是毛利。',
  },
  {
    k: 'ops', login: 'ops', who: '管理员', t: 'UOM 平台管理员', short: '平台管理员',
    duty: '全平台权限·材料标准·目录核对',
    note: '<b>UOM 运营平台的超级管理员，拥有专员 / 主管 / 财务三个身份的全部菜单与操作权限</b>，' +
      '日常主职是平台配置：导国家签证表模板 → 建材料样例 → 配国家送签材料库 → ' +
      '审核供应商上的签证产品 → 监控订单与数据。' +
      '这里管的是<b>材料标准</b>，不建产品、不定价、不销售；产品由供应商在 UBK 自行录入上架，平台目录随之自动登记。' +
      '权限边界止于 UOM 平台内部——门店 CSP、供应商 UBK、客户端是另外三个系统，各有各的数据边界。',
  }
];
function roleOf(k) { return ROLES.filter(function (r) { return r.k === k; })[0]; }

/* ---------- 五个独立系统（角色是系统内的身份，不是并列入口） ---------- */
var SYSTEMS = [
  {
    k: 'cust', t: '客户端', sub: 'H5 / 小程序', roles: ['customer'], icon: '客',
    who: '直客、散客本人',
    desc: '自助选签证、下单付款、上传材料、查看进度、签收签证与返还资料。'
  },
  {
    k: 'csp', t: 'CSP 门店工作台', sub: '门店销售 / 同业 · PC', roles: ['csp'], icon: '店',
    who: '门店销售、同业代理',
    desc: '接待客户、比价选品、代客下单、跟进办理、发起退款。与客户端同职责，只是操作人换成门店。'
  },
  {
    k: 'uom', t: 'UOM 运营平台', sub: '平台配置 · 专员 · 主管 · 财务', roles: ['ops', 'uom', 'lead', 'fin'], icon: '运',
    who: '平台配置管理员、签证操作专员、签证主管、财务',
    desc: '整个签证业务的运营大平台，一套系统四种身份：配置管理员做初始化（签证表模板、材料样例、送签材料库），' +
      '专员做工单履约，主管管派单与审批，财务确认收款到账并管结算。业务的第一步就在这里——先把签证表模板导进来。'
  },
  {
    k: 'youmi', t: '有米小程序', sub: '门店销售 · 移动端', roles: ['youmi'], icon: '米',
    who: '门店销售、同业代理（手机）',
    desc: 'CSP 工作台的移动端。销售带着手机就能查签证产品、当着客人的面代客下单，' +
      '下完单直接把填表链接发给客人自己填。与 CSP 同一套账号与数据。' +
      '当前为演示态，底部只露出「签证频道 / AI 签证助手 / 订单」三项，其余页面暂时收起。'
  },
  {
    k: 'ubk', t: 'UBK 供应商门户', sub: '签证资源方', roles: ['ubk'], icon: '供',
    who: '优耐德、竹园等签证资源供应商',
    desc: '产品从这里进入系统：维护收料地址、录签证属性并选平台材料清单、三步报价上架、选定上架范围、接单回传、结算对账。'
  }
];
/* 页面标题取左侧菜单里的名字，两处不会再各叫各的。
   唐美芳 2026-09-01：「列表的标题最好和菜单名称保持一致」——同一个页面
   菜单叫「签证产品管理」、进去标题叫「我的产品与报价」，用户会以为点错了。
   同一个视图在不同角色的菜单里可以叫不同名字（比如 srefund 在供应商那儿是
   「预付款退款管理」、在财务那儿是「供应商退款」），所以按当前角色查。
   查不到就用 fb 兜底，不会因为菜单调整把标题变成空的。 */
function menuName(view, fb, sec) {
  var sys = sysOf(S.role);
  var hit = null;
  function walk(items) {
    (items || []).forEach(function (it) {
      if (hit) return;
      if (it.items) return walk(it.items);
      if (it.groups) return it.groups.forEach(function (g) { walk(g.items); });
      if (it.v !== view) return;
      if (it.roles && it.roles.indexOf(S.role) < 0) return;
      if (sec && it.sec !== sec) return;
      hit = it.t;
    });
  }
  if (sys) walk(MENU[sys.k]);
  return hit || fb;
}

function sysOf(role) {
  return SYSTEMS.filter(function (s) { return s.roles.indexOf(role) >= 0; })[0];
}
/* 身份落地页 = 该身份在菜单树里的第一个有权项 */
function homeView(role) {
  var sys = sysOf(role), out = '';
  /* 岗位有指定落地页的走指定页：财务共用「垫付与缴费」，但登录该落在收款管理 */
  var rr = roleOf(role);
  if (rr && rr.home) return rr.home;
  /* 菜单有 items / groups 两种形态，落地页要从两种里都找 */
  (MENU[sys.k] || []).some(function (g) {
    var list = g.items || (g.groups || []).reduce(function (a, sg) {
      return a.concat(sg.items || []);
    }, []);
    return list.some(function (n) {
      if (n.roles.indexOf(role) < 0) return false;
      out = n.v; return true;
    });
  });
  return out;
}

/* ---------- 左侧菜单树：一级模块 + 二级菜单项 ----------
   一棵菜单树描述整个系统的全部功能，与身份无关——一级模块常驻显示，
   切换身份时只显示该身份有权的二级项；整组无权时保留一级标题并标注无权限，
   这样「一套系统、多个身份、权限边界不同」在界面上是看得见的。
   菜单项：{ t 名称, v 视图, roles 有权身份, badge 角标键, sec 二级分区键 } */
/* 签证类型（受控枚举）。唐美芳 2026-08-31：
   「ubk产品管理里签证类型为什么还是手动输入的，是不是应该下拉选择才对啊，
     我看携程一般也就是旅游、商务、探亲访友、EVUS登记更新、留学、ESTA登记更新、工作、转移、其他这几类」

   这里跟「签证名称」分成了两个字段，不是把原来那个直接换成下拉：
   她给的这 9 项是「办的是哪一类事」，而库里存量值是「访客签证 600 类别」
   「标准访问签证（Standard Visitor）」「F1 学生签证」这种官方签证名。
   合成一个字段，两头都会坏：只留大类，客户就不知道自己办的到底是哪张签；
   只留官方名，下拉就得每国每签列一条，等于没受控。
   所以 visa_cat 受控做归类与筛选，visa_type 仍是官方名做展示与目录唯一键。 */
/* 停留期文案。后端已经算好 stay_text 就直接用；没有（老数据/局部对象）才自己拼。
   唐美芳 2026-08-31：「停留天数需支持区间，可选择天/月/年时间单位」。 */
var STAY_UNIT_CN = { day: '天', month: '个月', year: '年' };
function stayTx(p) {
  if (!p) return '—';
  if (p.stay_text) return p.stay_text;
  var u = STAY_UNIT_CN[p.stay_unit || 'day'] || '天';
  var mn = p.stay_min != null ? p.stay_min : p.stay_days;
  var mx = p.stay_max != null ? p.stay_max : p.stay_days;
  if (!mn && !mx) return '以签证页为准';
  if (mn === mx || !mn) return (mx || mn) + ' ' + u;
  return mn + '–' + mx + ' ' + u;
}

var VISA_CATS = ['旅游', '商务', '探亲访友', 'EVUS登记更新', '留学',
  'ESTA登记更新', '工作', '转移', '其他'];

var MENU = {
  cust: [
    { t: '签证频道', items: [
      { t: '首页', v: 'shop', roles: ['customer'], ic: 'home' },
      { t: '签证产品', v: 'list', roles: ['customer'], ic: 'box' },
      { t: '在线客服', v: 'service', roles: ['customer'], ic: 'chat' },
      { t: '我的订单', v: 'orders', roles: ['customer'], ic: 'order' },
      { t: '我的', v: 'me', roles: ['customer'], badge: 'supp', ic: 'user' }
    ] }
  ],
  /* 有米小程序 = CSP 工作台的移动端，**功能域与 CSP 一一对应**
     （唐美芳 2026-09-01：「有米小程序为什么和csp的逻辑不一样，应该就是csp的移动端才对啊，
     你现在的页面结构和层级与csp不太一样，怎么像重构了1个小程序，这样不太对」）。
     所以这里照抄 csp 的六个一级模块，视图名也用同一套（home / book / orders /
     tasks / customers / recv / refund），只是渲染成手机形态。
     手机底部放不下 6 个 Tab，「客户填表 / 客户管理 / 财务管理」收进「我的」。 */
  youmi: [
    { t: '工作台', ic: 'home', items: [
      { t: '首页工作台', v: 'home', roles: ['youmi'], badge: 'todo', ic: 'home' }
    ] },
    /* 「收客」是原型里的一级 Tab：搜索 + 品类入口，签证频道就挂在品类里
       （唐美芳 2026-09-01：「在收客这里，增加签证频道」）。 */
    { t: '收客', ic: 'search', items: [
      { t: '收客首页', v: 'acquire', roles: ['youmi'], ic: 'search' },
      { t: '签证频道', v: 'book', roles: ['youmi'], ic: 'box' }
    ] },
    /* AI 签证助手：销售最常被客人当面问的四类问题（产品报价 / 订单 / 办理进度 /
       目的地政策），一句话问出来，答案取系统实时数据
       （唐美芳 2026-09-02：「agent 签证助手最好弄一些真实场景」）。 */
    { t: 'AI 助手', ic: 'edit', items: [
      { t: 'AI 签证助手', v: 'agent', roles: ['youmi'], ic: 'edit' }
    ] },
    { t: '订单管理', ic: 'order', items: [
      { t: '订单列表', v: 'orders', roles: ['youmi'], ic: 'order' }
    ] },
    { t: '客户填表', ic: 'edit', items: [
      { t: 'DS-160 填表任务', v: 'tasks', roles: ['youmi'], ic: 'edit' }
    ] },
    { t: '客户管理', ic: 'user', items: [
      { t: '客户档案', v: 'customers', roles: ['youmi'], ic: 'user' }
    ] },
    { t: '财务管理', ic: 'wallet', items: [
      { t: '收款查询', v: 'recv', roles: ['youmi'], ic: 'recv' },
      { t: '退款查询', v: 'refund', roles: ['youmi'], ic: 'undo' }
    ] }
  ],
  csp: [
    { t: '工作台', ic: 'home', items: [
      { t: '首页工作台', v: 'home', roles: ['csp'], badge: 'todo', ic: 'home' }
    ] },
    /* 原来这三项归在「销售作业」下。唐美芳 2026-08-31：「CSP 里又出现销售作业这个词了，
       名字就叫产品预订中心就可以」——「作业」是个抽象词，说不清里面装的是什么。
       三项本来就是三件独立的事（去哪订货 / 我的单 / 替客户填表），拆成三个一级功能域，
       名字即所指，也不再有一级二级同名的别扭。 */
    { t: '产品预订中心', ic: 'search', items: [
      /* 二级项不跟一级重名：一级是功能域，二级写清进去要干什么。
         订购门户是新开标签页的独立网站，不是后台里的一页，所以特别标一下。 */
      { t: '进入订购门户', v: 'book', roles: ['csp'], ic: 'search' }
    ] },
    { t: '订单管理', ic: 'order', items: [
      { t: '订单列表', v: 'orders', roles: ['csp'], ic: 'order' }
    ] },
    /* 「客户填表」「客户管理」两个一级菜单 2026-09-02 从 CSP 撤掉
       （唐美芳：「CSP 里不需要客户填表的菜单吧，订单详情里有入口，
       也没有客户管理的菜单，不开放给销售看」）：
         · 填表：订单详情的办签人行上有「填申请表」（进去后可自己填，也可一键发给客人填），
           销售是按单干活的，不需要一个跨订单的填表任务池；
         · 客户档案：跨客户的资料汇总不该开放给单个门店销售看。
       路由 csp:tasks / csp:customers 都保留（订单详情里的入口仍要用），只是不进菜单。 */
    /* CSP 侧财务只读：门店要能自查这单钱到没到、退款办到哪一步，但审核、放行、
       生成凭证都在 UOM 财务手里。唐美芳 2026-08-31：「csp 主要是查看作用」。 */
    { t: '财务管理', ic: 'wallet', items: [
      { t: '收款查询', v: 'recv', roles: ['csp'], ic: 'recv' },
      /* 这个页面不止能查：门店销售在这里发起退款申请。原来菜单叫「退款查询」，
         进去标题是「退款申请」，两个名字说的是两件事，销售会以为退款要另找入口
         （唐美芳 2026-09-01 提出标题与菜单要一致）。按页面实际能做的事命名。 */
      { t: '退款申请', v: 'refund', roles: ['csp'], ic: 'undo' }
    ] }
  ],
  /* 分组顺序按「配置 → 作业 → 客户 → 订单 → 钱」排，运营岗进来看到的就是
     签证产品管理 / 客户管理 / 订单管理 / 结算管理 四组，跟其余岗位的作业类菜单互不打架。 */
  uom: [
    /* 签证管理是一级功能域，浮层里按「产品 / 配置 / 办理 / 频道」四组。

       2026-09-01 唐美芳：「填表中心、工作台有 1 个就够了，现在看 2 个表都有流程流转，
       不知道往哪里操作了。要不保留签证工作台吧……但是得把这个菜单并到签证管理里去，
       不然现在看上去太乱了，签证人员不知道在哪里操作了」。
       照办：
         · 「国家填表管理 › 美国 DS-160 填表中心」这一项从菜单里撤掉——
           它跟工单台是同一批数据的两个视角，两个入口都能流转，专员会不知道该点哪个。
           表单本身仍能打开（工单详情里「打开并填写」跳过去），只是不再单独占一个菜单。
         · 原来的一级菜单「签证办理」整组并进「签证管理」，
           签证人员从此只在这一个一级菜单里干活。 */
    { t: '签证管理', ic: 'box', groups: [
      { t: '签证产品管理', items: [
        /* 2026-09-09：B 端上架审核**并进**「签证产品管理」，菜单里那一条就撤了
           （唐美芳：「签证产品管理和 B 端审核合并了，为什么还能看见 2 个菜单」）。
           C 端审核**保持独立菜单**——B 只审 B 的、C 只审 C 的，两拨人各看各的台子。 */
        /* 菜单名按唐美芳 2026-09-09 定的：两条都叫「签证产品管理」，括号里区分端。
           两拨人（渠道运营 / 内容运营）各进各的，名字对称，一眼知道是同一件事的两端。 */
        { t: '签证产品管理（B端）', v: 'prods', roles: ['ops'], badge: 'auditb' },
        { t: '签证产品管理（C端）', v: 'prodc', roles: ['ops'], badge: 'auditc' }
      ] },
      { t: '签证配置', items: [
        { t: '国家签证表模板', v: 'forms', roles: ['ops'] },
        { t: '材料样例库', v: 'samples', roles: ['ops'] },
        { t: '国家送签材料库', v: 'fullvers', roles: ['ops'] },
        /* 政策跟产品、报价无关，是「这个国家现在什么规矩」，变动频率高得多，
           所以单独一项由总部运营维护，维护一次两端同时更新 */
        { t: '签证政策内容', v: 'policies', roles: ['ops'] }
      ] },
      /* 专员每天推进办签流程的地方：接工单 → 审材料/发补料 → 填表 → 送签 → 返还。
         三项各自是独立的作业对象，合并不了：
           工单台按「办签人」组织，送签批次按「一次送馆的一批护照」组织，
           资料返还按「一次寄回的一个包裹」组织 —— 后两个都是跨订单的批量对象。 */
      /* 2026-09-01 唐美芳：「我的工单台是不是这个名字有点奇怪，应该叫国家签证办理中心」
         「送签批次和资料返还的操作是不是也可以并进我的工单台里」。
         三项合成一个菜单项，页内用页签切换——批量视角保留，菜单不再散。 */
      /* 2026-09-04 先撤后恢复：她当天说「UOM 里不用保留了」，隔天想清楚又改口——
         「uom 里应该也能看到这个签证办理中心，供应商处理的进度，所以 uom 系统也需要
         保留这个模块，但是需要加入供应商字段，操作按钮全部保留」。
         所以两边并存，分工不同：供应商侧三档只管登记结果，这边保留完整六步与全部操作。 */
      { t: '签证办理', items: [
        { t: '国家签证办理中心', v: 'board', roles: ['ops', 'uom', 'lead'], badge: 'wo' }
      ] },
      /* 凯撒 PRD 4.12「运营管理 › 手机客户端首页配置」。原来这三块写死在前端，
         运营换个热门国家要发版（唐美芳 2026-08-31：「签证频道首页配置确实可以来一个配置页」）。 */
      { t: '频道运营', items: [
        { t: 'C 端首页配置', v: 'homecfg', roles: ['ops', 'lead'] },
        /* 有米小程序首页配置（2026-09-15 新增），与 C 端配置结构相同，但数据独立。 */
        { t: '有米首页配置', v: 'homecfgym', roles: ['ops', 'lead'] },
        /* 国家维度的展示素材与默认办理流程。原来是 v-cust.js 里的常量，
           新开国家、换头图、改流程措辞都要发版
           （唐美芳 2026-09-01：「都统一放在运营配置里吧」）。 */
        { t: '国家展示配置', v: 'countrycfg', roles: ['ops', 'lead'] }
      ] }
    ] },
    { t: '客户管理', ic: 'user', items: [
      { t: '客户档案', v: 'customers', roles: ['ops', 'uom', 'lead'], ic: 'user' }
    ] },
    { t: '订单管理', ic: 'order', items: [
      { t: '订单列表', v: 'orders', roles: ['ops', 'lead', 'fin'], ic: 'order' }
      /* 「拒签归因复盘」2026-08-31 按唐美芳要求从菜单去掉：它是一张统计图表，
         不是日常要点开的作业页；数据仍在（lead:reject 路由保留），需要时可直接访问。 */
    ] },
    /* 原叫「转款管理」，实为应付结算：收款放行时按结算价对供应商挂账，之后把这笔钱付出去，
       供应商在 UBK 侧看到的是同一笔（那边叫「预付款管理」）。
       唐美芳 2026-08-31 明确「签证订单不支持转款」，指的是订单间转款——那个功能不做。
       为免两者混淆，这里改叫「供应商结算」。 */
    { t: '财务管理', ic: 'wallet', items: [
      /* 唐美芳 2026-08-31：「uom 我怎么没看到收款管理、退款管理的数据」——她当时是用
         平台配置身份登的。资金台账对运营与主管开只读（他们要看订单卡在哪笔钱上），
         审核 / 放行 / 生成凭证仍然只有财务能点，接口层也只认 fin。 */
      { t: '收款管理', v: 'recv', roles: ['fin', 'ops', 'lead'], badge: 'pay', ic: 'recv' },
      /* 退款是一条链：客户/门店发起 → 主管审批 → 财务出账。原来「退款审批」在调度管理组、
         「退款管理」在财务组，同一件事被切成两个菜单，主管批完还要跑另一个组去看结果。 */
      { t: '退款审批', v: 'approve', roles: ['ops', 'lead'], badge: 'refund', ic: 'check' },
      { t: '退款管理', v: 'refund', roles: ['fin', 'ops', 'lead'], badge: 'refund', ic: 'undo' },
      { t: '供应商结算', v: 'payable', roles: ['fin', 'ops', 'lead'], ic: 'bank' },
      { t: '供应商预付款', v: 'prepay', roles: ['fin', 'ops'], ic: 'bank' },
      { t: '供应商退款', v: 'srefund', roles: ['fin', 'ops'], ic: 'undo' },
      { t: '供应商账单', v: 'bill', roles: ['fin', 'ops'], ic: 'order' },
      /* 「垫付与缴费」2026-09-03 从菜单隐藏（唐美芳：「uom 财务管理里的
         垫付与缴费这个菜单隐藏吧」）。**路由和页面都还在**（VIEWS['fin:advance'] 等），
         深链进得去，垫付数据也照常在订单详情的交易信息里体现，
         只是不再占一个一级菜单位。要恢复就把这一行的注释解开。 */
      /* { t: '垫付与缴费', v: 'advance', roles: ['ops', 'uom', 'fin'], ic: 'wallet' } */
    ] }
  ],
  /* 材料收件地址、新增产品都从菜单里撤了：地址是产品的一个字段（sup_product.addr_id），
     地址簿只是复用同一个地址给多个产品的工具，够不上一级功能；两者都在产品页里进得去。 */
  ubk: [
    { t: '首页', ic: 'home', items: [
      { t: '首页工作台', v: 'home', roles: ['ubk'], ic: 'home' }
    ] },
    /* 唐美芳 2026-09-08：「ubk 里菜单需要再调整下，把签证模块放到一起」——
       原来「签证产品管理」和「签证办理」是两个并列分组，中间只隔一个菜单项，
       签证相关的四件事被拆成两堆。合成一个「签证管理」分组，顺序照她给的：
       签证产品管理 / 收货地址管理 / 国家送签材料库 / 签证办理中心。 */
    { t: '签证管理', ic: 'box', items: [
      { t: '签证产品管理', v: 'products', roles: ['ubk'], sec: 'list', ic: 'box' },
      /* 凯撒 PRD 4.4「供应商平台-地址管理」。原来是「签证产品」页面里的一个页签，
         功能齐（增删改查都有）但菜单上找不到，8/31 挂成独立菜单项。 */
      { t: '收货地址管理', v: 'products', roles: ['ubk'], sec: 'addr', ic: 'clip' },
      /* 唐美芳 2026-09-04（语音）：「UBK 的系统新增产品需要把 UOM 里的国家材料库
         也有一个入口可以去添加，要同步挪到 UBK 里，跟 UOM 一模一样」。
         同一个页面组件（VIEWS['ops:fullvers']），按 can_edit 区分能不能改：
         平台版本供应商只读，自己建的版本才给编辑。 */
      { t: '国家送签材料库', v: 'fullvers', roles: ['ubk'], ic: 'form' },
      /* 唐美芳 2026-09-04：办理中心整个挪到供应商这边。
         跟众信侧那套六步工单台不是一个东西——这里只有三档且允许直接跳到结果。 */
      { t: '签证办理中心', v: 'board', roles: ['ubk'], badge: 'sup', ic: 'clip' }
    ] },
    { t: '订单管理', ic: 'order', items: [
      { t: '订单列表', v: 'orders', roles: ['ubk'], badge: 'sup', ic: 'order' }
    ] },
    { t: '结算管理', ic: 'bank', items: [
      /* 三张单按众信「结算管理 › 付款管理」的三张截图复刻（唐美芳 2026-08-31）：
         申请状态 / 发票状态 / 付款状态三条线各自独立。 */
      { t: '预付款管理', v: 'settle', roles: ['ubk'], ic: 'bank' },
      { t: '预付款退款管理', v: 'srefund', roles: ['ubk'], ic: 'undo' },
      { t: '账单管理', v: 'bill', roles: ['ubk'], ic: 'order' }
    ] }
  ]
};

/* 菜单图标：一套 24×24 线性图标，只走 currentColor，选中态自动跟着文字变白。
   不引第三方图标库——这套系统只用到十几个图标，为此拉一个包不划算。 */
var MICON = {
  form: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h3',
  layer: 'M12 3l8 4-8 4-8-4zM4 12l8 4 8-4M4 17l8 4 8-4',
  clip: 'M9 4h6v3H9zM9 5H6v15h12V5h-3M9 12h6M9 16h4',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  order: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  wallet: 'M3 8a2 2 0 012-2h13a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2zM16 12h3',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  edit: 'M4 20h4L20 8l-4-4L4 16z',
  send: 'M21 3L3 10l7 3 3 7z',
  undo: 'M4 10h11a5 5 0 010 10h-6M4 10l4-4M4 10l4 4',
  chart: 'M4 20V10M10 20V4M16 20v-7M21 20H3',
  pause: 'M12 21a9 9 0 100-18 9 9 0 000 18zM10 9v6M14 9v6',
  check: 'M12 21a9 9 0 100-18 9 9 0 000 18zM8 12l3 3 5-6',
  alert: 'M12 3l9 16H3zM12 9v5M12 17h.01',
  recv: 'M12 3v12M7 11l5 5 5-5M4 20h16',
  bank: 'M3 9l9-5 9 5M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18',
  home: 'M4 11l8-7 8 7v9H4zM10 20v-6h4v6',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  chat: 'M4 5h16v11H9l-5 4z',
  pin: 'M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  plus: 'M12 5v14M5 12h14'
};
function micon(k) {
  var d = MICON[k] || 'M12 17a5 5 0 100-10 5 5 0 000 10z';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"' +
    ' stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
}

/* ---------- 端到端演练脚本（美国签证），按业务流程图三阶段 ---------- */
var TOUR = [
  ['P', '阶段一 · 平台初始化配置', 'UOM 运营平台 → 平台配置身份。运营只定「要填什么、要交什么」的标准，不建产品；标准没立好，供应商无从上品。'],
  ['uom', 'ops', 'forms', '导入国家签证表模板', '先把这个国家官方表格（如美国 DS-160）的字段导进来，系统自动标出哪些能 AI 代填、哪些必须客户自己答，人工再核一遍。这是整条链的起点。'],
  ['uom', 'ops', 'samples', '建材料样例库', '再立「长什么样才算合格」的标准件：在职证明模板、资金证明范例、照片规格图。'],
  ['uom', 'ops', 'fullvers', '配美国送签材料库', '新建美国 B1/B2 的清单版本，逐项录入资料名称、原件/复印件、提供方式、份数、必要性、适用人群、提交要求，然后发布生效。'],
  ['uom', 'ops', 'prodb', 'B 端上架审核', '供应商在 UBK 录完产品与套餐报价后点上架，产品进入这里等<b>渠道运营</b>审核：结算价是否成立、渠道口径与受理范围是否写清、材料清单版本是否绑对。<b>B 端审核通过，产品才在 CSP 门店 / 同业产品预订中心展示</b>。'],
  ['uom', 'ops', 'prodc', 'C 端上架审核', '同一条产品若还勾了上架 C 端，另有一拨<b>内容运营</b>在这里单独审：面向消费者的名称与特色文案是否合规、零售价是否合理、服务保障是否名副其实。<b>C 端审核通过，产品才在客户小程序展示</b>。两端互不影响，可能一端在售、另一端还在改。'],
  ['P', '阶段二 · 供应商上架销售', 'UBK 供应商门户。<b>产品从这里进入系统</b>：供应商自己录签证属性、挂报价与上架范围（B 端 CSP / C 端小程序），系统同步把这条签证登记进平台目录。同一条签证可由多家供应商各自报价。'],
  ['ubk', 'ubk', 'products', '维护材料收件地址', '产品管理 → 材料收件地址。客户把护照原件寄到哪儿，先把地址建好，新增产品时必须绑定。'],
  /* 唐美芳 2026-09-04：材料库入口同步挪到 UBK，导览里也得有这一步，
     否则供应商不知道自己还能建清单，只会以为「平台没有就上不了架」。 */
  ['ubk', 'ubk', 'fullvers', '（按需）建自己的材料清单', '产品管理 → 国家送签材料库。默认直接用「平台统一」版本即可；本公司收料要求跟平台不一样，点该版本的「复制新版」改出自建版本并发布，新增产品时就能选到它。<b>单条产品不可自行增减材料</b>，口径不同一律在版本层面复制新版。'],
  ['ubk', 'ubk', 'create', '新增产品三步报价', '第一步录签证属性（国家、签证类型、送签地、有效期、入境次数、停留天数、是否面签录指纹）并选定国家送签材料库版本，第二步填名称、收件地址与上架范围（默认上架 B 端 CSP，可勾选同时上架 C 端），第三步录套餐报价。同一条签证已有别家在卖时，系统自动复用目录条目，不会重复建。'],
  ['ubk', 'ubk', 'products', '上架对外可见', '产品管理 → 产品列表。点击「提交上架审核」后，按已勾选的渠道分别送对应运营审核：B 端审核通过后进入 CSP 门店 / 同业产品预订中心，C 端审核通过后进入客户小程序。两端独立审核，列表中分两行展示各自结论。'],
  ['P', '阶段三 · 交易与履约', '产品上架完成，客户端才能买到。以下是一笔美国签证订单的完整生命周期。'],
  /* 有米这一步 2026-09-02 补进演练：AI 助手是销售接待环节的入口，
     不放进来的话，导览里就看不到它 */
  ['youmi', 'youmi', 'agent', 'AI 签证助手答客问', '销售在客人面前被问到报价、办理进度、目的地政策，一句话问出来。产品报价 / 订单 / 进度 / 政策四类，答案全部取系统实时数据，结果卡片点进去就能代客下单。'],
  ['cust', 'customer', 'shop', '客户下单支付', '客户端首页选「美国」→ 打开 B1/B2 产品 → 选套餐 → 选办签人（C 端必填）→ 立即预定并支付。签证资料支付前后填都行，不卡支付。'],
  ['uom', 'fin', 'recv', '财务确认收款到账', '财务在「收款管理」里核对水单与到账金额并确认。这是整条链的总开关：财务没确认，运营侧和供应商看不到任何工单，也不会对供应商挂应付。'],
  ['cust', 'customer', 'mats', '客户交材料', '回客户端「我的材料」，按人群定制的清单逐项上传。'],
  ['uom', 'uom', 'board', '专员审材料 · 发补料', '操作专员在工单台逐项审核，不合格的发补料通知（最多三轮，七天倒计时）。'],
  ['cust', 'customer', 'supp', '客户应对补料', '客户端收到补料通知，在截止时间前重新上传。'],
  ['uom', 'uom', 'board', '译成英文', '客人填写的是中文，DS-160 官网仅接受英文。人名按护照拼音口径转换，地址、单位、职位由 AI 翻译，专员逐项核对后再前往官网录入。'],
  ['uom', 'uom', 'board', '填表 · 缴费 · 预约', '专员照对照单到官方渠道人工录入并回填受理号，再缴官费、抢面签号。这几步在使领馆官方渠道人工完成。'],
  /* 「组批送签递交」「资料返还」2026-09-03 从链路里摘掉：
     需面签的产品客人本人到馆、护照由使领馆直接寄回，这两步不存在
     （唐美芳：「不需要送签了」「也不存在资料返还」）。
     日本这类必须由指定代办机构递交的国家还要用，页面与路由都留着。 */
  /* 唐美芳 2026-09-04：办理中心挪到供应商侧，供应商只按三档走且可以直接跳到结果。
     导览里得有这一条，否则演练走到「谁来标结果」就断了。 */
  ['ubk', 'ubk', 'board', '供应商办理并登记结果', '签证办理中心。派给该供应商的办签人都在这里，办理状态只有三档（待收料 / 处理中 / 已出结果），<b>允许直接跳到最后登记结果</b>——各国实际流程差异较大，要求供应商逐节点登记的结果是无人登记、系统内进度失真。底层仍写完整六步，中间环节自动补齐。'],
  ['uom', 'uom', 'board', '回填出签结果', '使领馆出结果后回填签证号与有效期；拒签的做归因和责任判定。'],
  ['cust', 'customer', 'track', '客户看到结果', '客户端进度页显示出签结果与护照寄回信息，订单转已完成。']
];

/* 导览页要挂的外部文档。都放在同一个静态站上，版本换了只改这里。
   （唐美芳 2026-09-02：「帮我增加几个重要文档的入口，最新流程图、产品方案」） */
var DOC_BASE = 'https://opc.uuxlink.com/static/aivisa/';
var GUIDE_DOCS = [
  { t: '跨系统业务流程图 v6.1', s: '五个系统怎么衔接：一笔订单从下单到交付，每一步落在谁手上',
    u: DOC_BASE + 'visa-business-flowchart-v5.html', i: '流' },
  { t: '产品方案 v4.0', s: '业务背景、角色分工、功能范围与分期规划',
    u: DOC_BASE + 'visa-product-solution-v4.html', i: '案' },
  { t: '需求规格说明书 v3.2', s: '逐功能的字段、状态流转与校验口径，开发对照这份做',
    u: DOC_BASE + 'visa-spec-v32.html', i: '规' },
  { t: '交互原型 v5', s: '五端页面原型，与本系统实现逐页对照',
    u: DOC_BASE + 'visa-prototype/v5-prototype.html', i: '型' },
  { t: '页面清单', s: '全站页面与路由对照表，验收时逐页勾',
    u: DOC_BASE + 'visa-page-inventory.html', i: '单' }
];
function cnNum(n) { return ['零','一','二','三','四','五','六','七','八','九','十'][n] || n; }

function guideView(main) {
  main.innerHTML =
    '<div class="guide">' +
    '<div class="g-hero"><h1>VisaOps 签证业务系统</h1>' +
    /* 数量写死过一次「四个」，后来加了有米小程序就对不上了。改成按 SYSTEMS 实时算，
       以后再加系统也不会再漂（唐美芳 2026-09-02：「这个页面里每个系统说明及内容
       是否需要调整，你自己检查看看」）。 */
    '<p>众信签证业务的完整数字化底座。' + cnNum(SYSTEMS.length) + '个相互独立、数据互通的系统，' +
    '覆盖从平台初始化配置、供应商上架，到客户下单、履约交付的全链路。' +
    '下方任一系统卡片可直接进入；不知道从哪开始，就照「端到端演练」从第 1 步按顺序点一遍。</p></div>' +
    /* 重要文档放在系统卡片之前：给领导看的时候，先给流程与方案，再进系统看实现 */
    '<h4 class="g-h4">重要文档</h4>' +
    '<div class="g-docs">' + GUIDE_DOCS.map(function (d) {
      return '<a class="g-doc" href="' + d.u + '" target="_blank" rel="noopener">' +
        '<i>' + d.i + '</i><div><b>' + esc(d.t) + '</b><s>' + esc(d.s) + '</s></div>' +
        '<em>打开 ↗</em></a>';
    }).join('') + '</div>' +
    '<h4 class="g-h4">' + cnNum(SYSTEMS.length) + '个系统</h4>' +
    '<div class="g-grid">' + SYSTEMS.map(function (s) {
      var accs = s.roles.map(function (rk) {
        var r = roleOf(rk);
        return '<li><code>' + r.login + '</code>' + esc(r.short || r.t) + '</li>';
      }).join('');
      return '<a class="g-card" href="#' + s.roles[0] + '/">' +
        '<div class="g-top"><i>' + s.icon + '</i><div><b>' + esc(s.t) + '</b><s>' + esc(s.sub) + '</s></div></div>' +
        '<p>' + esc(s.desc) + '</p>' +
        '<div class="g-who">使用人：' + esc(s.who) + '</div>' +
        '<ul class="g-acc">' + accs + '</ul>' +
        '<span class="g-go">进入系统 →</span></a>';
    }).join('') + '</div>' +
    '<h4 class="g-h4">端到端演练 · 美国旅游签（B1/B2）</h4>' +
    '<p class="g-note">全部演示账号密码统一为 <code>888888</code>，点击任一步骤直接跳到对应系统的对应页面。' +
    '提交、缴费、抢号、递交、采指纹五个环节由人工在使领馆官方渠道完成后回填，系统不做自动化。</p>' +
    '<ol class="g-tour">' + (function () {
      var n = 0;
      return TOUR.map(function (t) {
        /* 阶段与步骤说明里带 <b> 强调（这些是本文件里的硬编码常量，不含用户输入），
           原来一律 esc，结果「<b>产品从这里进入系统</b>」这类标签被当文字印在页面上。 */
        if (t[0] === 'P') {
          return '<li class="ph"><b>' + esc(t[1]) + '</b><p>' + t[2] + '</p></li>';
        }
        n++;
        var s = SYSTEMS.filter(function (x) { return x.k === t[0]; })[0];
        return '<li><a href="#' + t[1] + '/' + t[2] + '"><em>' + n + '</em>' +
          '<div><b>' + esc(t[3]) + '</b><s>' + esc(s.t) + ' · ' + esc(roleOf(t[1]).short || '') + '</s>' +
          '<p>' + t[4] + '</p></div></a></li>';
      }).join('');
    })() + '</ol>' +
    '</div>';
}

/* ---------- 徽标（链路上的“该我做了”） ----------
   口径：红点只标「需要本人动手才能往下走」的条数，不标在办总数。
   在办总数是统计，属于 KPI 卡；红点满屏亮等于没有红点，看的人会直接忽略它。
   判断依据是「球在谁手上」：等使领馆出结果、等客户签收，球不在我们手上，不亮。 */
/* 需要签证专员动手的节点：待收材料、材料审核中、材料已齐备（该填表了）、表单填写中、待预约面签。
   已预约、已递交、行政审查中是在等外部，已出结果由返还流程接手，都不算专员待办。 */
/* 需要专员动手才能往下走的节点：收料、审材料、提交官网、抢号预约。
   「待出签」是在等使领馆，球不在我们手上，不算待办。 */
var WO_TODO_PROG = ['P1', 'P2', 'P3', 'P4'];
var BADGE = {};
function refreshBadges() {
  var r = S.role, jobs = [];
  BADGE = {};
  if (r === 'customer' || r === 'csp') {
    jobs.push(api('/my/supp').then(function (j) {
      BADGE.supp = j.list.filter(function (x) { return x.status === 'open'; }).length;
    }));
    if (r === 'csp') jobs.push(api('/my/orders').then(function (j) {
      BADGE.todo = j.list.filter(function (o) { return o.todo; }).length;
    }));
  }
  if (r === 'uom') jobs.push(api('/wo/list?scope=mine').then(function (j) {
    BADGE.wo = j.list.filter(function (w) {
      return w.status !== 'done' && WO_TODO_PROG.indexOf(w.progress) >= 0;
    }).length;
  }));
  if (r === 'lead') jobs.push(api('/lead/board').then(function (j) {
    BADGE.hold = j.hold.length; BADGE.refund = j.refunds.length;
  }));
  if (r === 'fin') {
    jobs.push(api('/fin/inbox').then(function (j) { BADGE.pay = j.list.length; }));
    jobs.push(api('/refund/list').then(function (j) {
      BADGE.refund = j.list.filter(function (x) { return x.status === 'l1'; }).length;
    }));
  }
  /* B 端和 C 端是两拨人各审各的，红点也得各算各的，不能合成一个数 */
  if (r === 'ops') jobs.push(api('/ops/products').then(function (j) {
    BADGE.auditb = j.list.filter(function (p) {
      return p.to_b && p.review_b === 'pending';
    }).length;
    BADGE.auditc = j.list.filter(function (p) {
      return p.to_c && p.review_c === 'pending';
    }).length;
  }));
  if (r === 'ubk') jobs.push(api('/sup/orders').then(function (j) {
    BADGE.sup = j.list.filter(function (w) { return WO_TODO_PROG.indexOf(w.progress) >= 0; }).length;
  }));
  return Promise.all(jobs).catch(function () { });
}

/* ---------- 布局 ----------
   骨架：不再是「顶栏 + 岗位条 + 浅色菜单栏」三层横带，改成一条深色全高导航栏，
   自上而下 品牌 → 系统 → 岗位 → 菜单 → 账号，主区整块留给内容。 */
function renderShell(isGuide) {
  var cur = isGuide ? null : sysOf(S.role);
  if (!isGuide) return;
  $('#roles').innerHTML =
    '<a class="g-link' + (isGuide ? ' on' : '') + '" href="#guide">系统导览</a><span class="sp"></span>' +
    SYSTEMS.map(function (s) {
      return '<button data-s="' + s.k + '"' + (s === cur ? ' class="on"' : '') + '>' +
        '<b>' + esc(s.t) + '</b><s>' + esc(s.sub) + '</s></button>';
    }).join('');
  $$('#roles button').forEach(function (b) {
    b.onclick = function () {
      var s = SYSTEMS.filter(function (x) { return x.k === b.dataset.s; })[0];
      location.hash = '#' + s.roles[0] + '/';
    };
  });
  var u = S.user || {};
  $('#who').innerHTML = isGuide ? '<i class="demo">演示环境 · 数据真实读写</i>' :
    '<i class="demo">当前身份</i><b>' + esc(u.name || '') + '</b>' + (u.org ? ' · ' + esc(u.org) : '');
  renderIdbar(isGuide ? null : cur);
}
/* 系统内身份切换：一个系统多个岗位时挂到顶部，左侧只留当前岗位的菜单 */
function renderIdbar(sys) {
  var el = $('#idbar');
  if (!sys || sys.roles.length < 2) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = '<span class="lb">' + esc(sys.t) + ' · 切换岗位</span><div class="ids">' +
    sys.roles.map(function (rk) {
      var rr = roleOf(rk);
      return '<a data-role="' + rk + '"' + (rk === S.role ? ' class="on"' : '') + '>' +
        '<b>' + esc(rr.short || rr.t) + '</b><s>' + esc(rr.duty || rr.t) + '</s></a>';
    }).join('') + '</div>' +
    '<span class="tip">同一套系统、同一份数据，不同岗位看到的菜单与字段不同</span>';
  $$('#idbar a[data-role]').forEach(function (a) {
    a.onclick = function () { location.hash = '#' + a.dataset.role + '/'; };
  });
}
function renderRail(view) {
  var r = roleOf(S.role), sys = sysOf(S.role), sec = S.cache.psec || 'list';
  var tree = MENU[sys.k] || [];
  var u = S.user || {};
  /* 导航栏头部：品牌 → 四个系统 → 当前系统内的岗位。三层切换收在同一列里，主区不再被横带切走 */
  var h = '<a class="rl-brand" href="#guide"><i>众</i><div><b>VisaOps</b><s>签证业务系统</s></div></a>' +
    '<div class="rl-sys">' + SYSTEMS.map(function (s) {
      return '<a data-s="' + s.k + '"' + (s === sys ? ' class="on"' : '') + ' title="' + esc(s.t) + '">' +
        '<i>' + s.icon + '</i><span>' + esc(s.t.replace(/^(UOM|UBK|CSP)\s*/, '')) + '</span></a>';
    }).join('') + '</div>' +
    '<div class="rl-cur"><b>' + esc(sys.t) + '</b><s>' + esc(sys.sub) + '</s></div>';
  /* 只渲染当前岗位有权的菜单组。无权的组直接不出现——真实后台不会把点不动的菜单
     灰在那儿写「无权限」，那是把权限矩阵摊在工作界面上。权限归属放导览页讲。 */
  /* 功能域可以是两种形态：
       items  —— 浮层里直接列项（多数功能域）
       groups —— 浮层里再分小组（签证管理这种项多的，按唐美芳给的三级结构）
     统一按当前岗位过滤后，把 groups 摊平出一份 items 供高亮判断与角标求和用。 */
  function mine(list) {
    return (list || []).filter(function (n) { return n.roles.indexOf(S.role) >= 0; });
  }
  var mineTree = tree.map(function (g) {
    if (g.groups) {
      var gs = g.groups.map(function (sg) {
        return { t: sg.t, items: mine(sg.items) };
      }).filter(function (sg) { return sg.items.length; });
      var flat = gs.reduce(function (a2, sg) { return a2.concat(sg.items); }, []);
      return { t: g.t, ic: g.ic, groups: gs, items: flat };
    }
    return { t: g.t, ic: g.ic, items: mine(g.items) };
  }).filter(function (g) { return g.items.length; });
  /* 分组标题不编号：编号会让人以为菜单是有先后顺序的向导，
     但这几组是并列的功能域，随时想进哪组进哪组。 */
  /* 菜单改成两级：一级是功能域（竖排，带图标与右箭头），鼠标移上去在右侧弹出二级浮层面板。
     结构照众信后台（唐美芳 2026-08-31：「三个后台的菜单能不能按照这个结构来」），
     样式按本系统自己的皮肤走，没照抄那套深灰浮层。
     只有一项的功能域不弹面板，点一级直接进——多一次悬停换一个二级面板，纯属折腾。 */
  function flyItems(items) {
    return items.map(function (n) {
      var b2 = BADGE[n.badge];
      /* 三条菜单都指向 prods，靠 tab 区分谁高亮；没写 tab 的那条只在
         当前页签不是审核队列时才算选中（2026-09-09 合并审核台后加） */
      var curTab = S.cache['tab:opsprods'];
      var on = n.v === view && (!n.sec || n.sec === sec) &&
        (n.v !== 'prods' ||
          (n.tab ? n.tab === curTab
            : (curTab !== 'waitb' && curTab !== 'waitc')));
      return '<a data-v="' + n.v + '"' + (n.sec ? ' data-sec="' + n.sec + '"' : '') +
        (n.tab ? ' data-tab="' + n.tab + '"' : '') +
        (on ? ' class="on"' : '') + '>' + esc(n.t) +
        (b2 ? '<span class="badge">' + b2 + '</span>' : '') + '</a>';
    }).join('');
  }
  /* 一级菜单只列功能域；二级菜单常驻右侧独立一栏（#subrail），不再用悬停浮层。
     唐美芳 2026-08-31：「我感觉现在弹窗展示子节点菜单不太方便，你还是给我统一放到右侧展示吧」。
     浮层的毛病是：要看另一组得先把鼠标移回去再移过来，且面板会盖住正在看的内容。 */
  var curG = -1;
  mineTree.forEach(function (g, gi) {
    if (g.items.some(function (n) { return n.v === view && (!n.sec || n.sec === sec); })) curG = gi;
  });
  if (curG < 0) curG = +(S.cache.railG || 0);
  if (curG >= mineTree.length) curG = 0;
  S.cache.railG = curG;

  h += '<div class="rl-menu">' + mineTree.map(function (g, gi) {
    var gb = g.items.reduce(function (a2, n) { return a2 + (BADGE[n.badge] || 0); }, 0);
    return '<a class="mg-t' + (gi === curG ? ' on' : '') + '" data-g="' + gi + '">' +
      '<i>' + micon(g.ic || (g.items[0] && g.items[0].ic)) + '</i>' +
      '<span>' + esc(g.t) + '</span>' +
      (gb ? '<span class="badge">' + (gb > 99 ? '99+' : gb) + '</span>' : '') + '</a>';
  }).join('') + '</div>';

  /* 换岗位＝换一个人登录，所以收到底部账号块里，跟真实后台的账号菜单同一个位置，
     并写明是演示账号切换，不做成「一个人可以自己切权限」那种反常识的开关。 */
  var multi = sys.roles.length > 1;
  h += '<div class="rl-foot">' +
    '<div class="rl-me' + (multi ? ' sw' : '') + '"' + (multi ? ' id="meBtn"' : '') + '>' +
    '<i>' + esc((u.name || '·').slice(0, 1)) + '</i>' +
    '<div><b>' + esc(u.name || '') + '</b><s>' + esc(r.short || r.t) +
    (u.org ? ' · ' + esc(u.org) : '') + '</s></div>' +
    (multi ? '<em class="cv">切换</em>' : '') + '</div>' +
    (multi ? '<div class="rl-pop" id="mePop"><div class="rl-poph">切换演示账号<s>' +
      esc(sys.t) + '内不同岗位登录后看到的菜单与字段不同</s></div>' +
      sys.roles.map(function (rk) {
        var rr = roleOf(rk);
        return '<a data-role="' + rk + '"' + (rk === S.role ? ' class="on"' : '') + '>' +
          '<i>' + esc((rr.who || rr.short || rr.t).slice(0, 1)) + '</i>' +
          '<div><b>' + esc(rr.who || rr.short || rr.t) + '</b><s>' +
          esc(rr.duty || rr.t) + '</s></div></a>';
      }).join('') + '</div>' : '') +
    '<div class="chain-note">' + r.note + '</div>' +
    '<a class="rail-guide" href="#guide">← 返回系统导览</a></div>';
  $('#rail').innerHTML = h;

  /* 二级菜单常驻右侧一栏。支持两种形态：items（平铺）与 groups（再分小组）。 */
  (function () {
    var host = $('#subrail');
    if (!host) return;
    var g = mineTree[curG];
    if (!g) { host.innerHTML = ''; host.style.display = 'none'; return; }
    host.style.display = '';
    function items(list) {
      return list.map(function (n) {
        var b2 = BADGE[n.badge];
        /* 三条菜单都指向 prods，靠 tab 区分谁高亮；没写 tab 的那条只在
         当前页签不是审核队列时才算选中（2026-09-09 合并审核台后加） */
      var curTab = S.cache['tab:opsprods'];
      var on = n.v === view && (!n.sec || n.sec === sec) &&
        (n.v !== 'prods' ||
          (n.tab ? n.tab === curTab
            : (curTab !== 'waitb' && curTab !== 'waitc')));
        return '<a data-v="' + n.v + '"' + (n.sec ? ' data-sec="' + n.sec + '"' : '') +
          (n.tab ? ' data-tab="' + n.tab + '"' : '') +
          (on ? ' class="on"' : '') + '>' + esc(n.t) +
          (b2 ? '<span class="badge">' + b2 + '</span>' : '') + '</a>';
      }).join('');
    }
    host.innerHTML = '<div class="sr-h">' + esc(g.t) + '</div>' +
      (g.groups
        ? g.groups.map(function (sg) {
            return '<div class="sr-g"><h6>' + esc(sg.t) + '</h6>' + items(sg.items) + '</div>';
          }).join('')
        : '<div class="sr-g">' + items(g.items) + '</div>');
  })();

  /* 点一级：切右侧二级栏；若当前页不在该组内，顺带跳到该组第一项，不让右栏空转 */
  $$('#rail [data-g]').forEach(function (a) {
    a.onclick = function () {
      var gi = +a.dataset.g;
      S.cache.railG = gi;
      var g = mineTree[gi];
      var here = g && g.items.some(function (n) { return n.v === view; });
      if (!here && g && g.items[0]) {
        var n = g.items[0];
        if (n.sec) S.cache.psec = n.sec;
        var t = '#' + S.role + '/' + n.v;
        if (location.hash === t) render(); else location.hash = t;
      } else {
        renderRail(view);
      }
    };
  });

  var meBtn = $('#meBtn'), mePop = $('#mePop');
  if (meBtn) {
    meBtn.onclick = function (e) { e.stopPropagation(); mePop.classList.toggle('open'); };
    document.addEventListener('click', function () { mePop.classList.remove('open'); });
  }
  $$('#rail a[data-s]').forEach(function (a) {
    a.onclick = function () {
      var s = SYSTEMS.filter(function (x) { return x.k === a.dataset.s; })[0];
      location.hash = '#' + s.roles[0] + '/';
    };
  });
  $$('#rail a[data-role]').forEach(function (a) {
    a.onclick = function () { location.hash = '#' + a.dataset.role + '/'; };
  });
  $$('#rail a[data-v], #subrail a[data-v]').forEach(function (a) {
    a.onclick = function () {
      /* 产品预订中心不是后台的一个页面，是销售自己的订购门户网站，
         套在左菜单 + 后台卡片里既不像也不好看，所以单开一个浏览器标签页。 */
      if (S.role === 'csp' && a.dataset.v === 'book') { openBook(); return; }
      if (a.dataset.sec) S.cache.psec = a.dataset.sec;
      /* 菜单项可以指定进去后停在哪个页签（两个产品审核入口用的就是这个） */
      if (a.dataset.tab) {
        S.cache['tab:opsprods'] = a.dataset.tab;
        S.cache['pg:opsprods'] = 1;
      }
      var t = '#' + S.role + '/' + a.dataset.v;
      if (location.hash === t) render(); else location.hash = t;
    };
  });
}

/* 在新标签页打开门店订购门户；被浏览器拦了就退回当前页跳转，别让人点了没反应 */
function openBook(param) {
  var u = location.pathname + '#csp/book' + (param ? '/' + encodeURIComponent(param) : '');
  var w = window.open(u, 'uzai-book');
  if (w) { try { w.focus(); } catch (e) { } } else { location.hash = u.split('#')[1]; }
}
function go(view, param) {
  location.hash = '#' + S.role + '/' + view + (param ? '/' + encodeURIComponent(param) : '');
}
function render() {
  var h = (location.hash || '').replace(/^#/, '').split('/');
  var role = h[0] || 'guide', view = h[1], param = h.slice(2).join('/');
  /* 中文参数（如国家名）经浏览器编码后必须解回来，否则匹配不到数据 */
  if (param) { try { param = decodeURIComponent(param); } catch (e) { } }
  if (role === 'guide') {
    document.body.classList.add('on-guide');
    document.body.classList.remove('imm');
    renderShell(true);
    $('#rail').innerHTML = '';
    guideView($('#main'));
    return;
  }
  document.body.classList.remove('on-guide');
  if (!roleOf(role)) role = 'customer';
  /* 客户端是小程序，不该套在 PC 后台的顶栏和左菜单里。进入 customer 就切沉浸模式：
     隐藏整套后台外壳，整屏交给「图文展台 + 真机」，只留一个浮动出口回到系统导览。 */
  /* 客户端与有米小程序都是手机形态，脱掉 PC 后台外壳 */
  document.body.classList.toggle('imm', role === 'customer' || role === 'youmi');
  /* UOM 运营平台是「一套系统四种身份」（平台配置 / 专员 / 主管 / 财务）。
     详情页底部操作栏的新样式先只在这套系统里生效，验收通过再铺到 CSP / UBK / 有米
     （唐美芳 2026-09-02：「任务太大了，你一个系统一个系统的修改，先改 uom 吧」）。 */
  document.body.classList.toggle('sys-uom',
    ['ops', 'uom', 'lead', 'fin'].indexOf(role) >= 0);
  var need = role !== S.role;
  var p = need ? login(roleOf(role).login).then(function () { S.role = role; }) : Promise.resolve();
  p.then(refreshBadges).then(function () {
    if (!view) { view = homeView(role); location.replace('#' + role + '/' + view); }
    /* 门店订购门户同样脱掉后台外壳，但它是 PC 网站不是小程序，走自己一套 imm2。
       产品详情与代客下单是门户里的第四、五层，不能漏——漏了就会在门户里点一下详情
       突然跳回后台版式，销售当着客人的面翻页会以为跳错系统了。 */
    document.body.classList.toggle('imm2',
      role === 'csp' && ['book', 'pdetail', 'create'].indexOf(view) >= 0);
    renderShell(); renderRail(view);
    /* 弹窗里改完数据会 reload 整页，浮在上面的旧弹窗内容就成了过期快照，一起收掉 */
    /* 路由一变就把浮层收掉。日期选择器挂在手机壳 .phone 上、不随 #main 重绘消失，
       所以要一起点名。注意只能写 .dpk-mask（日期选择器自己的类），
       **不能写 .dp-mask** —— 那是 C 端产品详情页英雄图上的渐变蒙层，
       误删会把详情页顶图搞花。新增浮层类名时同步加到这里。 */
    $$('.mask, .dpk-mask').forEach(function (x) { x.remove(); });
    /* UOM 运营平台是「一套系统四种身份」，平台配置管理员是其中的超级管理员，
       拥有专员 / 主管 / 财务的全部页面。视图按 ops → uom → lead → fin 依次回退，
       省得每个页面都手写一遍 VIEWS['ops:xxx'] = …（漏一个就是「页面不存在」）。
       唐美芳 2026-08-31：「UOM 管理员应该是全部权限」。 */
    var fn = VIEWS[role + ':' + view];
    if (!fn && role === 'ops')
      fn = VIEWS['uom:' + view] || VIEWS['lead:' + view] || VIEWS['fin:' + view];
    var main = $('#main');
    if (!fn) { main.innerHTML = '<div class="empty">页面不存在</div>'; return; }
    main.innerHTML = '<div class="spin">加载中…</div>';
    Promise.resolve(fn(main, param)).catch(function (e) {
      main.innerHTML = '<div class="note b">加载失败：' + esc(e.message || e) + '</div>';
    });
  }).catch(function (e) { $('#main').innerHTML = '<div class="note b">' + esc(e.message || e) + '</div>'; });
}
function reload() { render(); }

/* 可复制的编码：点一下复制到剪贴板。
   唐美芳 2026-08-31：「产品编码……支持复制编码操作」。
   navigator.clipboard 在 http 非 localhost 下不可用，回退到 execCommand 那套老办法。 */
/* 通用 CSV 导出（2026-09-08 订单列表「导出报表」用）。
   带 UTF-8 BOM，否则 Excel 打开中文是乱码——材料清单那份下载早就踩过，
   这次抽成公共函数，别再各写一份。 */
function csvDown(name, head, rows) {
  var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
  var lines = [head.map(q).join(',')].concat(
    (rows || []).map(function (r) { return r.map(q).join(','); }));
  var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
}

function copyCode(code) {
  return '<span class="cpy" data-cpy="' + esc(code) + '" title="点击复制">' +
    '<b>' + esc(code) + '</b>' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
    '<rect x="9" y="9" width="11" height="11" rx="2"/>' +
    '<path d="M5 15V5a2 2 0 012-2h8"/></svg></span>';
}
function doCopy(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(function () { toast('已复制 ' + text); });
  }
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('已复制 ' + text); }
  catch (e) { toast('复制失败，请手动选中', true); }
  ta.remove();
  return Promise.resolve();
}
/* 一处委托，所有页面的编码都能点 */
document.addEventListener('click', function (e) {
  var el = e.target && e.target.closest && e.target.closest('[data-cpy]');
  if (el) { e.stopPropagation(); doCopy(el.dataset.cpy); }
});

/* 风险标签的问号：一处委托，所有页面通用 */
document.addEventListener('click', function (e) {
  if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-rk')) {
    e.stopPropagation();
    confirmBox('待财务确认到账', GATE_WHY, '知道了').catch(function () { });
  }
});

function login(loginName) {
  return api('/login', { login: loginName, pwd: '888888' }).then(function (j) {
    S.token = j.token; S.user = j.user; return j;
  });
}
function switchRole(k) { location.hash = '#' + k + '/'; }

/* 说明性文字默认收成两行，点一下展开全文，避免整屏灰字压过内容本身 */
document.addEventListener('click', function (e) {
  if (!e.target.closest) return;
  var i = e.target.closest('.page-h .pg-i');
  if (i) {
    i.classList.toggle('on');
    var p = i.closest('.page-h').querySelector('p');
    if (p) p.classList.toggle('open');
    return;
  }
  var sc = e.target.closest('.stage [data-stc]');
  if (sc) { go('shop', 'c-' + sc.dataset.stc); return; }
  var h = e.target.closest('.side-tip .card>h3');
  if (h) { h.parentNode.classList.toggle('open'); return; }
  var t = e.target.closest('.rail .chain-note, .card .pad>.hint');
  if (t) t.classList.toggle('open');
});

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
