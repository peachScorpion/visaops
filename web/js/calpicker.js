/* ============================================================
   日历式日期选择器 —— 预计出行日期专用

   唐美芳 2026-09-07（附携程订单填写页截图）：「有米产品进入预订订单填写的时候，
   默认弹出日历控件，选择预计出行日期，不要现在的日期控件，不太合适。
   包括 csp 也一样……而且进入填写页的时候，默认弹出来，可以关闭」。

   ⚠️ 这是对 9-02 那次的修正：当时她指定「年 / 月 / 日三列滚轮」（见 dpicker.js），
   那套仍然保留给出生日期、证件有效期这类**要翻很远**的字段用；
   出行日期只在未来两三个月内挑，用月历一眼能看到周末、节假日和最早可办日，滚轮做不到这些。
   两个组件并存，各管各的场景，不要互相替换。

   类名前缀 cal-。起名前已 grep：现有 CSS 里没有 .cal- 开头的规则
   （dpicker.js 的注释里记着 .dp- 撞过 .dp-hero 那次教训）。
   ============================================================ */

/* 法定节假日：只标**节日当天**，不猜调休。
   调休（哪个周末补班、哪天连休）每年由国务院单独发文，年底才定，
   系统里编一份出来一定会跟真实安排对不上，宁可不标。
   农历节日的公历日期逐年不同，2027 之后要按当年公告补录。 */
var CAL_HOLI = {
  '2026-01-01': '元旦', '2026-02-17': '春节', '2026-04-05': '清明节',
  '2026-05-01': '劳动节', '2026-06-19': '端午节', '2026-09-25': '中秋节',
  '2026-10-01': '国庆节',
  '2027-01-01': '元旦', '2027-05-01': '劳动节', '2027-10-01': '国庆节'
};

function calPad(n) { return (n < 10 ? '0' : '') + n; }
function calKey(d) {
  return d.getFullYear() + '-' + calPad(d.getMonth() + 1) + '-' + calPad(d.getDate());
}
/* 今天 + n 个自然日 */
function calPlus(n) {
  var d = new Date(new Date().toDateString());
  d.setDate(d.getDate() + (n || 0));
  return calKey(d);
}
/* 工作日换算成自然日：签证时效按工作日报，日历上要落到具体某天。
   ×7/5 向上取整是行业里通行的粗算，不含节假日顺延——真正的顺延由专员在办理中告知。 */
function calWork2Nat(days) {
  return Math.ceil((+days || 0) * 7 / 5);
}

/* opts:
     title    弹层标题
     tip      标题下那条蓝色说明
     value    已选日期 'YYYY-MM-DD'
     min      最早可选（含），默认今天
     minTag   最早那天角标文案，默认「最早」
     months   往后铺几个月，默认 4
     price    每格下面显示的价格（数字），不传则不显示
   resolve 选中的日期；关闭时 reject（调用方一般 catch 掉即可）。 */
function calPicker(opts) {
  opts = opts || {};
  var min = opts.min || calPlus(0);
  var months = opts.months || 4;
  var cur = opts.value || '';
  var price = opts.price;

  var start = new Date(min.slice(0, 4), +min.slice(5, 7) - 1, 1);

  function monthHtml(y, m) {          /* m: 0-11 */
    var first = new Date(y, m, 1);
    var days = new Date(y, m + 1, 0).getDate();
    var cells = '';
    for (var i = 0; i < first.getDay(); i++) cells += '<i class="cal-e"></i>';
    for (var d = 1; d <= days; d++) {
      var dt = new Date(y, m, d), k = calKey(dt);
      var wk = dt.getDay() === 0 || dt.getDay() === 6;
      var holi = CAL_HOLI[k];
      var off = k < min;
      var on = k === cur;
      cells += '<i class="cal-d' + (off ? ' off' : '') + (on ? ' on' : '') + '"' +
        (off ? '' : ' data-cal="' + k + '"') + '>' +
        '<s' + (holi ? ' class="h"' : '') + '>' +
        (holi ? esc(holi) : (wk ? '休' : '')) + '</s>' +
        '<b>' + d + '</b>' +
        (price != null ? '<u>¥' + money(price) + '</u>' : '') +
        (k === min ? '<em>' + esc(opts.minTag || '最早') + '</em>' : '') +
        '</i>';
    }
    return '<div class="cal-m"><h4>' + y + '年' + (m + 1) + '月</h4>' +
      '<div class="cal-g">' + cells + '</div></div>';
  }

  var body = '';
  for (var i = 0; i < months; i++) {
    var dd = new Date(start.getFullYear(), start.getMonth() + i, 1);
    body += monthHtml(dd.getFullYear(), dd.getMonth());
  }

  return new Promise(function (resolve, reject) {
    /* ⚠️ 浮层要挂进手机壳，不能挂 document.body（唐美芳 2026-09-08：
       「C 端小程序下单的时候弹出的这个日历控件怎么这么大，而不是在小程序页面里」）。
       小程序类页面渲染在 .phone 里，挂 body 的话 position:fixed 会铺满整个浏览器，
       七列摊到 1200px 宽，完全不像小程序。滚轮版 dpicker 早就走 overlayHost()，
       这次写新组件时漏了同一条约定。CSP 是电脑端页面，没有 .phone，仍回落到 body。 */
    var host = (typeof overlayHost === 'function') ? overlayHost() : document.body;
    /* 上一次没关干净的残留先清掉，否则会叠一层吃掉点击 */
    $$('.cal-mask').forEach(function (x) { x.remove(); });
    var mask = document.createElement('div');
    mask.className = 'cal-mask' + (host === document.body ? '' : ' in-ph');
    mask.innerHTML =
      '<div class="cal-sheet">' +
      '<div class="cal-hd"><a class="x" data-calx>✕</a><b>' +
      esc(opts.title || '选择日期') + '</b></div>' +
      (opts.tip ? '<div class="cal-tip"><i>i</i>' + esc(opts.tip) + '</div>' : '') +
      '<div class="cal-wk"><s>日</s><span>一</span><span>二</span><span>三</span>' +
      '<span>四</span><span>五</span><s>六</s></div>' +
      '<div class="cal-body">' + body + '</div></div>';
    host.appendChild(mask);
    /* 加一帧再上 show，否则没有过渡动画（元素刚插进 DOM 就已经是终态） */
    requestAnimationFrame(function () { mask.classList.add('show'); });

    function close(v) {
      mask.classList.remove('show');
      setTimeout(function () {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
        if (v) resolve(v); else reject(new Error('closed'));
      }, 180);
    }
    mask.onclick = function (e) {
      if (e.target === mask) return close(null);       /* 点遮罩关闭 */
      var x = e.target.closest('[data-calx]');
      if (x) return close(null);
      var c = e.target.closest('[data-cal]');
      if (c) close(c.dataset.cal);
    };
    /* 已选日期滚到可视区；没选过就停在最早可选那个月（body 本来就从那儿起） */
    if (cur) {
      var el = mask.querySelector('[data-cal="' + cur + '"]');
      if (el) el.scrollIntoView({ block: 'center' });
    }
  });
}
