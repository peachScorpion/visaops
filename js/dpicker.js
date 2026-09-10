/* ============================================================
   滚轮式日期选择器 —— 移动端（C 端小程序 / 有米小程序）

   类名一律用 dpk- 前缀，不要用 dp-：C 端产品详情页早就有 .dp-hero / .dp-mask
   （英雄图上的渐变蒙层）。我第一版用了 .dp-mask，写在后面的
   `position:fixed;z-index:9000` 把那层图片蒙层变成了盖满全屏的遮罩，
   结果是产品详情页「黑屏、点不动」（唐美芳 2026-09-02 报的）。
   新组件起类名前先 grep 一遍现有 CSS。

   原来两端都用 <input type="date">：C 端走 ask() 的 date 字段，
   有米直接放原生控件。点下去唤起的是手机系统日历，样式不受控，
   跟小程序自己的视觉是断的，而且 iOS / 安卓 / 各家浏览器长得都不一样。

   唐美芳 2026-09-02 给了一张门店统计的截图：「预计出行日期的选择日期控件
   可不可以是这种交互」——年 / 月 / 日三列滚轮 + 重置 + 确认选择。

   她那张图是「起始日期 + 截止日期」的区间选择器，而预计出行日期是单个日期，
   所以这里做成单日期三列滚轮，其余交互（顶部回显、底部重置/确认、
   选中行高亮）照她的图来。区间版留了 range 参数，将来订单列表按日期段
   筛选可以直接复用。
   ============================================================ */

/* 一列滚轮：scroll-snap 负责吸附，滚动停下来后按 scrollTop 反推选中项。
   不用第三方库，也不用 transform 模拟惯性——原生滚动在手机上手感最好。 */
function dpCol(items, cur, key) {
  return '<div class="dpk-col" data-dpk-c="' + key + '">' +
    '<div class="dpk-pad"></div>' +
    items.map(function (it) {
      return '<div class="dpk-it' + (it.v === cur ? ' on' : '') +
        '" data-v="' + it.v + '">' + it.t + '</div>';
    }).join('') +
    '<div class="dpk-pad"></div></div>';
}

function dpDays(y, m) {
  return new Date(y, m, 0).getDate();          /* m 为 1-12，取当月天数 */
}

function dpPad(n) { return (n < 10 ? '0' : '') + n; }

/* opts: { title, value:'YYYY-MM-DD', min:'YYYY-MM-DD', max, hint, years }
   resolve 选中的 'YYYY-MM-DD'；点重置后确认 resolve ''；关闭则 reject。 */
function datePicker(opts) {
  opts = opts || {};
  var today = new Date();
  var minD = opts.min || '';
  var maxD = opts.max || '';
  var init = opts.value || '';
  var y, mo, da;
  if (/^\d{4}-\d{2}-\d{2}$/.test(init)) {
    y = +init.slice(0, 4); mo = +init.slice(5, 7); da = +init.slice(8, 10);
  } else {
    y = today.getFullYear(); mo = today.getMonth() + 1; da = today.getDate();
  }
  /* 年份区间：出生日期要翻到几十年前、证件有效期要翻到十几年后，
     所以允许调用方显式指定，不给才用「去年 → 三年后」这个下单场景的默认值。 */
  var y0 = opts.y0 || (today.getFullYear() - 1);
  var y1 = opts.y1 || (today.getFullYear() + (opts.years || 3));
  if (y1 < y0) y1 = y0;

  return new Promise(function (resolve, reject) {
    /* 挂到手机壳里，不是挂 document.body。挂 body 的话选择器会按整个浏览器视口
       铺开，在小程序演示里就"漏"到手机外面去了
       （唐美芳 2026-09-02：「有米小程序里选择日期控件怎么不在小程序里，
       而是超出展示区了」）。overlayHost() 在沉浸模式下返回手机壳。 */
    var host = (typeof overlayHost === 'function') ? overlayHost() : document.body;
    /* 打开前先清掉同类残留：手机壳里的浮层不随 #main 重绘消失，
       上一次没关干净的话会叠一层看不见的遮罩，把整页点击吃掉。 */
    $$('.dpk-mask').forEach(function (x) { x.remove(); });
    var box = document.createElement('div');
    box.className = 'dpk-mask' + (host === document.body ? '' : ' in-ph');
    box.innerHTML =
      '<div class="dpk-sheet">' +
      '<div class="dpk-hd"><b>' + esc(opts.title || '选择') + '</b>' +
      '<a class="dpk-x" data-dpk-x>&times;</a></div>' +
      '<div class="dpk-cur"><s>' + esc(opts.label || '出行日期') + '</s>' +
      '<b data-dpk-cur></b></div>' +
      '<div class="dpk-body">' +
      '<div class="dpk-sel"></div>' +
      '<div class="dpk-cols" data-dpk-cols></div>' +
      '</div>' +
      (opts.hint ? '<div class="dpk-hint" data-dpk-hint>' + esc(opts.hint) + '</div>'
                 : '<div class="dpk-hint" data-dpk-hint></div>') +
      '<div class="dpk-ft"><button class="dpk-btn" data-dpk-reset>重置</button>' +
      '<button class="dpk-btn p" data-dpk-ok>确认选择</button></div>' +
      '</div>';
    host.appendChild(box);

    var cols = $('[data-dpk-cols]', box), cur = $('[data-dpk-cur]', box);
    var hintEl = $('[data-dpk-hint]', box);
    var picked = !!init;                       /* 没给初值时不算「已选」 */

    /* 三列一起重绘：改了年或月，天数要跟着变（2 月 28/29 天） */
    function draw() {
      var dmax = dpDays(y, mo);
      if (da > dmax) da = dmax;
      var ys = [], ms = [], ds = [];
      for (var i = y0; i <= y1; i++) ys.push({ v: i, t: i + '年' });
      for (var j = 1; j <= 12; j++) ms.push({ v: j, t: j + '月' });
      for (var k = 1; k <= dmax; k++) ds.push({ v: k, t: k + '日' });
      cols.innerHTML = dpCol(ys, y, 'y') + dpCol(ms, mo, 'm') + dpCol(ds, da, 'd');
      cur.textContent = picked ? (y + '年' + mo + '月' + da + '日') : '未选择';
      cur.className = picked ? '' : 'ph';
      bind();
      warn();
    }

    /* 超出可选范围时给一句话，而不是把日期悄悄改掉——
       客人自己选的日子被系统改了却不说，比拦下来更难查。 */
    function warn() {
      var v = y + '-' + dpPad(mo) + '-' + dpPad(da);
      var bad = (minD && v < minD) ? '不能早于 ' + minD
              : (maxD && v > maxD) ? '不能晚于 ' + maxD : '';
      hintEl.textContent = bad || (opts.hint || '');
      hintEl.classList.toggle('bad', !!bad);
      $('[data-dpk-ok]', box).disabled = !!bad;
      return !bad;
    }

    /* 上下 .dpk-pad 的高度正好是 (列高 - 行高) / 2，所以「第 i 项居中」
       等价于 scrollTop = i * 行高。定位和反查都用这一个公式，
       之前定位用 offsetTop、反查用 scrollTop/行高，两套算法对不上，
       一打开就跳到 2028 年。 */
    var lock = false;                          /* 程序设置滚动时不要回头触发选中 */
    function bind() {
      $$('[data-dpk-c]', box).forEach(function (col) {
        /* 属性叫 data-dpk-c，dataset 上就是 dpkC。改类名那次漏改了这里，
           key 变成 undefined，三列滚动都落不回 y/mo/da —— 选完日期值不变。 */
        var key = col.dataset.dpkC;
        var its = $$('.dpk-it', col);
        var h = its[0] ? its[0].offsetHeight : 42;
        var idx = 0;
        its.forEach(function (x, n) { if (x.classList.contains('on')) idx = n; });
        lock = true;
        col.scrollTop = idx * h;
        setTimeout(function () { lock = false; }, 60);
        var tm;
        col.onscroll = function () {
          if (lock) return;
          clearTimeout(tm);
          tm = setTimeout(function () {
            var i = Math.round(col.scrollTop / h);
            i = Math.max(0, Math.min(its.length - 1, i));
            its.forEach(function (x, n) { x.classList.toggle('on', n === i); });
            var v = +its[i].dataset.v;
            picked = true;
            if (key === 'y') { y = v; if (da > dpDays(y, mo)) { draw(); return; } }
            else if (key === 'm') { mo = v; if (da > dpDays(y, mo)) { draw(); return; } }
            else da = v;
            cur.textContent = y + '年' + mo + '月' + da + '日';
            cur.className = '';
            warn();
          }, 90);
        };
        /* 直接点某一行也能选中：手机上滚到边缘的年份不好拨 */
        its.forEach(function (it, n) {
          it.onclick = function () { col.scrollTo({ top: n * h, behavior: 'smooth' }); };
        });
      });
    }

    function close() { box.remove(); }
    box.onclick = function (e) { if (e.target === box) { close(); reject(); } };
    $('[data-dpk-x]', box).onclick = function () { close(); reject(); };
    $('[data-dpk-reset]', box).onclick = function () {
      picked = false;
      y = today.getFullYear(); mo = today.getMonth() + 1; da = today.getDate();
      draw();
    };
    $('[data-dpk-ok]', box).onclick = function () {
      if (!warn()) return;
      var v = picked ? (y + '-' + dpPad(mo) + '-' + dpPad(da)) : '';
      close(); resolve(v);
    };
    draw();
  });
}
