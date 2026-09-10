/* ============================================================
   UBK · 套餐与报价（独立页面）
   唐美芳 2026-08-31：「ubk 里的编辑产品套餐信息不要弹窗，应该和创建时的信息保持一致吧」。

   改之前有两个毛病：
   1. 整个「套餐与报价」是一个 modal，弹窗里还套表格，表格行上再弹第二层窗改价；
   2. 编辑被拆成「改价」和「说明与须知」两个弹窗，字段跟新增产品第三步的那张表对不上——
      创建时是一张表 7 个字段填完，编辑时却要开两个窗才凑齐同样的信息。
   现在：独立页面，一张卡片一个套餐，点「编辑」就地展开成跟创建时<b>同样的 7 个字段</b>，
   「添加套餐」也是同一张表单，不再弹窗。
   ============================================================ */

/* 跟新增产品第三步完全同一组字段、同一个顺序 */
function pkgFields(k, locked) {
  k = k || {};
  var lockNote = locked
    ? '<div class="note w">产品<b>已发布在售</b>：门店与客户正按这套价下单，' +
      '此时调价将导致「下单展示价 ≠ 成交价」，故价格与时效已锁定。' +
      '如需修改请先<b>下架</b>，修改完成后重新提交审核。<b>套餐说明与预订须知不影响成交价，可随时修改。</b></div>'
    : '';
  return lockNote +
    '<div class="pk-form">' +
    fRow('name', '套餐名称', k.name || '', '普通办理 / 加急办理 / 代办面签陪同', locked, 1) +
    fRow('visa_fee', '签证费（使领馆收取，元）', k.visa_fee != null ? k.visa_fee : 0, '', locked, 1) +
    fRow('service_fee', '商家服务费（元）', k.service_fee != null ? k.service_fee : 0, '', locked, 1) +
    /* 结算价由供应商自行录入（唐美芳 2026-09-07：「录入结算价不是签证费+服务费，
       允许自己输入，但是结算价肯定不能低于签证费」）。
       它是平台与供应商谈定的价，本来就不一定等于签证费与服务费之和，
       原来按两项之和自动算，供应商改不了。两条硬约束由 pkPriceErr() 与后端各校验一次。 */
    fRow('settle_price', '结算价（元）',
      k.settle_price != null ? k.settle_price : '', '', locked, 1) +
    '<div class="pk-tip">平台与贵司之间按单结算的金额，不得低于签证费</div>' +
    fRow('suggest_retail', '建议零售价（元）', k.suggest_retail != null ? k.suggest_retail : 0, '', locked, 1) +
    fRow('lead_days', '办理时长（工作日）', k.lead_days != null ? k.lead_days : 15, '', locked, 1) +
    /* 价格校验提示紧挨着价格字段，不要放到底部——底下隔着两个富文本编辑器，
       填价的人根本看不见 */
    '<div class="pk-alert" data-pkerr>' + pkPriceErr(k) + '</div>' +
    /* 这两项是给客人看的说明，要能加粗、分条——纯文本框排不出版
       （唐美芳 2026-09-01）。产出的 HTML 由服务端 clean_rich() 过滤后入库。 */
    rtRow('pkg_desc', '套餐说明', k.pkg_desc || '',
      '本套餐包含的服务内容，以及与其他套餐的差异；留空则由系统自动生成') +
    rtRow('book_notice', '预订须知', k.book_notice || '', '下单前必须知晓的约束条件') +
    '</div>' +
    /* 结算价原来只在下面写一句「保存时自动计算」，供应商填的时候<b>看不到这个数</b>——
       可那正是他能拿到手的钱（唐美芳 2026-09-03：「新增产品：少结算价」）。
       改成实时算给他看，签证费/服务费一改就跟着变，顺带把毛利和倒挂也当场提示。 */
    '<div class="pk-live" data-pksum>' + pkSumHtml(k) + '</div>';
}
/* 结算价 / 毛利实时条。供应商最关心的两个数，填价时就要看见。
   ⚠️ 类名用 pk-live 不能用 pk-sum —— 套餐卡片的只读展示区已经占了 .pk-sum，
   起名前 grep 这件事 9-02 栽过一次（.dp-mask），这次差点又栽。 */
function pkSumHtml(k) {
  k = k || {};
  var vf = +k.visa_fee || 0, sr = +k.suggest_retail || 0;
  var settle = +k.settle_price || 0, gross = sr - settle;
  var rate = sr ? Math.round(gross * 1000 / sr) / 10 : 0;
  /* 零售价还没填时不能报「倒挂」——那会把刚开始填的人吓一跳，
     此时毛利根本无从算起，如实说「还没填」即可。 */
  var noRetail = !sr;
  /* 结算价 2026-09-07 已在表单中单独成行，此处不再重复展示，只留派生信息与校验提示。 */
  return '<i>建议零售价<b>' + (noRetail ? '未填写' : '¥' + money(sr)) +
    '</b><s>门店端与客户端展示的挂牌价</s></i>' +
    '<i class="' + (noRetail ? '' : gross < 0 ? 'bad' : gross ? 'ok' : '') + '">渠道毛利<b>' +
    (noRetail ? '—' : '¥' + money(gross)) + '</b><s>' +
    (noRetail ? '需填写建议零售价后方可计算'
      : gross < 0 ? '<u>建议零售价低于结算价，平台不予通过</u>' : '毛利率 ' + rate + '%') + '</s></i>';
}

/* 两条硬约束的即时提示：填的时候就说清楚，不必等点保存被接口打回来。
   返回空串表示当前没有问题。后端 pkg_prices() 会再校验一次，前端不是唯一防线。 */
function pkPriceErr(k) {
  var vf = +k.visa_fee || 0, st = +k.settle_price || 0, sr = +k.suggest_retail || 0;
  var msg = '';
  if (st && st < vf) msg = '结算价低于签证费 ¥' + money(vf) + '，请调整';
  else if (st && sr && sr < st) msg = '建议零售价低于结算价 ¥' + money(st) + '，请调整';
  return msg ? '<span>' + esc(msg) + '</span>' : '';
}

/* 富文本行：跟 fRow 同一套外观，只是把 textarea 换成编辑器 */
/* ⚠️ 这一行必须是 <div> 不能是 <label>。
   label 会把内部的点击转交给它包住的第一个可聚焦控件——富文本工具栏里的字号
   <select> 正好是第一个，于是点编辑区时焦点被抢走，光标进不去、字打不进
   （唐美芳 2026-09-07：「套餐说明和预订须知富文本框无法输入内容」）。
   受理范围说明那处用的就是 div，一直正常，可作对照。 */
function rtRow(k, label, v, ph) {
  return '<div class="pk-f pk-rt"><span>' + esc(label) + '</span>' +
    richHtml(k, v, ph) + '</div>';
}
function fRow(k, label, v, ph, locked, req, area) {
  return '<label class="pk-f"><span>' + esc(label) + (req ? ' <i>*</i>' : '') + '</span>' +
    (area
      ? '<textarea data-f="' + k + '" rows="2" placeholder="' + esc(ph || '') + '">' + esc(v) + '</textarea>'
      : '<input data-f="' + k + '" value="' + esc(v) + '" placeholder="' + esc(ph || '') + '"' +
        (locked ? ' disabled' : '') + '>') +
    (locked ? '<em class="pk-lock">在售锁定</em>' : '') + '</label>';
}
/* 价格一改，结算价与毛利立刻跟着变。绑在整块上，新增/编辑两处共用。 */
function pkSumBind(root) {
  $$('[data-pksum]', root).forEach(function (box) {
    var form = box.parentNode;
    function upd() {
      var g = {};
      $$('[data-f]', form).forEach(function (el) { g[el.dataset.f] = el.value; });
      box.innerHTML = pkSumHtml(g);
      var er = $('[data-pkerr]', form);
      if (er) er.innerHTML = pkPriceErr(g);
    }
    ['visa_fee', 'service_fee', 'settle_price', 'suggest_retail'].forEach(function (k) {
      var el = $('[data-f="' + k + '"]', form);
      if (el) el.oninput = upd;
    });
  });
}

/* 保存 / 添加前统一校验，返回 true 表示可以提交。
   提示语跟 pkPriceErr() 同源，避免两处措辞不一。 */
function pkgOk(f) {
  if (!f.name) { toast('套餐名称必填', true); return false; }
  var vf = +f.visa_fee || 0, st = +f.settle_price || 0, sr = +f.suggest_retail || 0;
  if (!st) { toast('请填写结算价', true); return false; }
  if (st < vf) { toast('结算价不得低于签证费 ¥' + money(vf), true); return false; }
  if (!sr) { toast('请填写建议零售价', true); return false; }
  if (sr < st) { toast('建议零售价不得低于结算价 ¥' + money(st), true); return false; }
  return true;
}

function pkgRead(m) {
  var o = {};
  $$('[data-f]', m).forEach(function (el) { o[el.dataset.f] = el.value.trim(); });
  /* 富文本不走 input.value，单独取 */
  ['pkg_desc', 'book_notice'].forEach(function (k) {
    if ($('[data-rt="' + k + '"]', m)) o[k] = richRead(m, k);
  });
  return o;
}

/* 套餐与报价页：供应商与平台运营共用（2026-09-09 唐美芳要求 UOM 产品管理
   也能「编辑套餐」）。运营改的是同一条产品，全程留痕。 */
VIEWS['ops:pkgs'] = VIEWS['ubk:pkgs'] = function (m, id) {
  if (!id) return go('products');
  return api('/sup/products').then(function (j) {
    var p = j.list.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p) { m.innerHTML = '<div class="empty">产品不存在或不属于本供应商</div>'; return; }
    var canPrice = pol(p, 'price'), canAdd = pol(p, 'pkg_add');
    var open = S.cache.pkOpen;          // 当前展开编辑的套餐 id，'new' 表示新增

    var cards = p.packages.map(function (k) {
      var g = (k.suggest_retail || 0) - (k.settle_price || 0);
      var editing = String(open) === String(k.id);
      return '<div class="pk-card' + (editing ? ' on' : '') + '">' +
        '<div class="pk-hd"><b>' + esc(k.name) + '</b>' +
        /* 套餐单独起售停售（唐美芳 2026-09-03：「套餐可以单独起售停售和产品信息一样」）。
           场景：加急套餐旺季名额满了要临时停掉，但普通办理照常卖——
           以前只能整个产品下架，等于把还能卖的也一起停了。
           停售只影响新单：已成交的订单照常办，价格与时效按下单时的快照走。 */
        '<span class="tag ' + (k.status === 'off' ? 'plain' : 'ok') + '">' +
        (k.status === 'off' ? '已停售' : '在售') + '</span>' +
        (k.used ? '<span class="tag info">已成交 ' + k.used + ' 单</span>' : '') +
        '<span class="pk-g' + (g < 0 ? ' bad' : '') + '">毛利 ¥' + money(g) + '</span>' +
        '<div class="pk-op">' +
        (editing ? '' :
          '<button class="btn sm' + (k.status === 'off' ? ' ok' : '') + '" data-tog="' + k.id +
          '">' + (k.status === 'off' ? '恢复起售' : '停售') + '</button>') +
        (editing
          ? '<button class="btn sm" data-cancel>取消</button>' +
            '<button class="btn sm r" data-save="' + k.id + '">保存</button>'
          : '<button class="btn sm" data-edit="' + k.id + '">编辑</button>' +
            (canAdd && !k.used
              ? '<button class="btn sm g" data-del="' + k.id + '">删除</button>'
              : lockBtn('删除', k.used ? '该套餐已产生订单，不能删除' : POL_WHY.pkg_add, 'g'))) +
        '</div></div>' +
        (editing
          ? '<div class="pk-bd">' + pkgFields(k, !canPrice) + '</div>'
          : '<div class="pk-sum">' +
            '<i>签证费<b>¥' + money(k.visa_fee) + '</b></i>' +
            '<i>服务费<b>¥' + money(k.service_fee) + '</b></i>' +
            '<i>结算价<b>¥' + money(k.settle_price) + '</b></i>' +
            '<i>建议零售价<b>¥' + money(k.suggest_retail) + '</b></i>' +
            '<i>时效<b>' + k.lead_days + ' 工作日</b></i>' +
            (k.pkg_desc ? '<s>套餐说明<div class="rich-view">' + richView(k.pkg_desc) +
              '</div></s>' : '') +
            (k.book_notice ? '<s>预订须知<div class="rich-view">' + richView(k.book_notice) +
              '</div></s>' : '') +
            '</div>') + '</div>';
    }).join('');

    /* 套上创建向导那条三步条，停在第 3 步（唐美芳 2026-09-02：「编辑套餐报价信息，
       应该和编辑产品信息一样，进入的页面是和创建一样，只不过定位在第 3 步，
       而不是像现在这样是个独立的页面」）。
       前两步可点，跳「编辑产品信息」——那一页渲染的就是创建第 1、2 步的同一批字段。
       没有把编辑塞进创建向导的草稿状态机：那套 W 里存的是「还没落库的新产品」，
       编辑已上架的产品走进去会把两边的数据串在一起。 */
    /* 2026-09-04 新增产品已由三步并成两步，这条步骤条 9-07 之前还停在三步
       （唐美芳：「编辑套餐报价，上面的步骤怎么还是 3 个」）。两边必须同源。 */
    var wizBar = '<div class="wiz wiz-ed">' +
      [['1', '填产品信息与材料清单'], ['2', '录套餐报价']]
        .map(function (x, i) {
          var k = i + 1, cur = k === 2;
          return '<div class="' + (cur ? 'on' : 'done') + '"' +
            (cur ? '' : ' data-wstep="' + k + '"') + '><i>' + (cur ? '2' : '✓') + '</i>' +
            x[1] + '</div>';
        }).join('') + '</div>';

    m.innerHTML = pageH('编辑产品 · 套餐报价',
      '本页为新增产品流程的第 2 步。同一产品可设置多个套餐（普通办理、加急办理、' +
      '代办面签陪同等），各销售渠道统一执行建议零售价，不区分渠道定价。',
      '<button class="btn" data-back>← 返回产品列表</button>') + wizBar +
      '<div class="od-top"><div class="od-top-h"><div>' +
      '<div class="od-pn">' + esc(p.name) + '</div>' +
      '<div class="od-pm">' + esc(p.country || '') +
      (p.submit_city ? ' · ' + esc(p.submit_city) : '') +
      ' · ' + p.packages.length + ' 个套餐</div></div></div></div>' +
      (canPrice ? '' :
        '<div class="note w">产品<b>已发布在售</b>，价格与套餐增删已锁定。' +
        '如需修改请先<b>下架</b>，修改完成后重新提交总部审核；套餐说明与预订须知不受影响，可随时修改。</div>') +
      '<div class="pk-list">' + cards +
      (String(open) === 'new'
        ? '<div class="pk-card on"><div class="pk-hd"><b>新增套餐</b>' +
          '<div class="pk-op"><button class="btn sm" data-cancel>取消</button>' +
          '<button class="btn sm r" data-add>添加</button></div></div>' +
          '<div class="pk-bd">' + pkgFields(null, false) + '</div></div>'
        : '') + '</div>' +
      (String(open) === 'new' ? '' :
        '<div style="margin-top:14px">' +
        (canAdd ? '<button class="btn r" data-new>+ 添加套餐</button>'
          : lockBtn('+ 添加套餐', POL_WHY.pkg_add)) + '</div>');

    richBind(m);   /* 套餐说明与预订须知是富文本，渲染后要绑工具栏 */
    pkSumBind(m);  /* 价格三格实时联动 */
    $('[data-back]', m).onclick = function () { S.cache.pkOpen = null; go('products'); };
    /* 点前两步 → 回到「编辑产品信息」，那页渲染的就是创建第 1、2 步的同一批字段 */
    $$('[data-wstep]', m).forEach(function (x) {
      x.onclick = function () { S.cache.pkOpen = null; go('edit', p.id); };
    });
    if ($('[data-new]', m)) {
      $('[data-new]', m).onclick = function () {
        if (p.packages.length >= 12)
          return toast('单个产品最多 12 个套餐，超出请拆分为多条产品分别上架', true);
        S.cache.pkOpen = 'new'; reload();
      };
    }
    $$('[data-cancel]', m).forEach(function (b) {
      b.onclick = function () { S.cache.pkOpen = null; reload(); };
    });
    $$('[data-tog]', m).forEach(function (b) {
      b.onclick = function () {
        var k = p.packages.filter(function (x) { return String(x.id) === b.dataset.tog; })[0] || {};
        var off = k.status === 'off';
        confirmBox(off ? '恢复起售 · ' + esc(k.name) : '停售 · ' + esc(k.name),
          off
            ? '恢复后门店与客户又能选到这个套餐下单。'
            : '停售后<b>新单选不到这个套餐</b>，同一产品的其他套餐照常卖。<br>' +
              '<b>已成交的订单不受影响</b>——价格、时效按下单时的快照走，该办的照办。',
          off ? '恢复起售' : '确认停售')
          .then(function () {
            return api('/sup/pkg/status', { id: +b.dataset.tog, status: off ? 'on' : 'off' });
          })
          .then(function (r) { toast(r.msg || '已更新'); reload(); })
          .catch(function () { /* 出错时 api() 已弹提示 */ });
      };
    });
    $$('[data-edit]', m).forEach(function (b) {
      b.onclick = function () { S.cache.pkOpen = b.dataset.edit; reload(); };
    });
    $$('[data-save]', m).forEach(function (b) {
      b.onclick = function () {
        var f = pkgRead(m);
        /* 在售锁价时表单里的价格字段是 disabled，读不回来也不该校验 */
        if (canPrice ? !pkgOk(f) : !f.name) {
          if (!canPrice) toast('套餐名称必填', true);
          return;
        }
        var d = { id: +b.dataset.save, book_notice: f.book_notice, pkg_desc: f.pkg_desc };
        if (canPrice) {
          d.name = f.name; d.visa_fee = +f.visa_fee; d.service_fee = +f.service_fee;
          d.settle_price = +f.settle_price;
          d.suggest_retail = +f.suggest_retail; d.lead_days = +f.lead_days;
        }
        api('/sup/pkg/save', d).then(function (r) {
          /* 改价会让在售产品自动下架（唐美芳 2026-09-04），当场说清楚，
             否则供应商以为改完就生效了，回头发现产品不在架上会以为系统坏了 */
          toast((r.settle_price != null ? '已保存，新结算价 ¥' + money(r.settle_price) : '已保存') +
            (r.auto_off ? '；产品已自动下架，返回列表点击「提交上架」即时恢复展示，无需再次审核' : ''));
          S.cache.pkOpen = null; reload();
        }).catch(fail);
      };
    });
    $('[data-add]', m) && ($('[data-add]', m).onclick = function () {
      var f = pkgRead(m);
      if (!pkgOk(f)) return;
      api('/sup/pkg/add', {
        sup_product_id: p.id, name: f.name, visa_fee: +f.visa_fee,
        service_fee: +f.service_fee, settle_price: +f.settle_price,
        suggest_retail: +f.suggest_retail,
        lead_days: +f.lead_days, book_notice: f.book_notice, pkg_desc: f.pkg_desc
      }).then(function (r) {
        toast('已添加' + (r && r.auto_off
          ? '；产品已自动下架，返回列表点击「提交上架」即时恢复展示，无需再次审核' : ''));
        S.cache.pkOpen = null; reload();
      }).catch(fail);
    });
    $$('[data-del]', m).forEach(function (b) {
      b.onclick = function () {
        confirmBox('删除套餐', '已产生订单的套餐不可删除，如需停售请下架该产品。', '删除')
          .then(function () { return api('/sup/pkg/del', { id: +b.dataset.del }); })
          .then(function () { toast('已删除'); reload(); }).catch(fail);
      };
    });
  });
};


/* ============================================================
   UBK · 编辑产品信息（独立页面）
   唐美芳 2026-08-31：「ubk 里编辑产品信息和编辑套餐信息，为什么不继续沿用
   创建流程的页面呢，现在编辑产品信息还是弹窗」。

   页面按新增产品的三段结构排：签证属性 → 产品信息 → 套餐报价。
   表单本体就是新增第 2 步那个 prodFields()，一份代码两处渲染。
   第一段只读：国家、签证类型、送签地、有效期这些落在平台目录（product 表）上，
   同一条签证多家供应商共用，改了会连累别人，要改得走运营。
   第三段不重复造轮子，直接引到「套餐与报价」页。
   ============================================================ */
/* 编辑产品页：同上，两端共用 */
VIEWS['ops:edit'] = VIEWS['ubk:edit'] = function (m, id) {
  if (!id) return go('products');
  return Promise.all([api('/sup/products'), api('/sup/catalog'), api('/sup/addrs')]).then(function (r) {
    var p = (r[0].list || []).filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p) { m.innerHTML = '<div class="empty">产品不存在或不属于本供应商</div>'; return; }
    var cat = ubkCatOf(r[1].list, p);
    UBK_ADDRS = r[2].list; UBK_FVS = r[1].fullvers || [];
    var j = { addrs: r[2].list, svc_opts: r[0].svc_opts, svc_fixed: r[0].svc_fixed,
      provinces: r[1].provinces };
    /* 后缀是从完整产品名里去掉平台产品名剩下的那截；平台产品名 = 送签地+国家+签证名称 */
    var baseName = cat ? (cat.submit_city + cat.country + cat.visa_type) :
      (p.name || '').replace(new RegExp(esc(p.name_suffix || '') + '$'), '').trim();

    function seg(n, t, on) {
      return '<div class="' + (on ? 'on' : '') + '"><i>' + n + '</i>' + t + '</div>';
    }
    m.innerHTML = pageH('编辑产品信息',
      '与新增产品使用同一套表单。除目的地国家与送签地外，签证属性与产品信息均可修改；' +
      '修改后本产品将<b>自动下架</b>，完成后返回列表点击「提交上架」即时恢复展示，无需再次审核。' +
      '报价与套餐在下方第三段单独维护。',
      '<button class="btn" data-back>返回产品列表</button>') +
      /* 步骤条跟新增产品保持一致（唐美芳 2026-09-07：「编辑的时候，步骤条现在还是 3 个，
         应该和创建产品的时候保持一致」）。新增那边已并成两步，这里跟上。 */
      '<div class="wiz">' + seg(1, '填产品信息与材料清单', 1) +
      seg(2, '录套餐报价', 0) + '</div>' +
      (p.policy && p.policy.pending
        ? '<div class="note w">该产品正在总部采购审核中，全部字段暂时锁定。' +
          '如需修改，请先返回产品列表点击「撤回审核」。</div>'
        : (p.policy && p.policy.onsale
          /* 2026-09-04 唐美芳整体放开：基础信息随时可改（有单也能改），
             改动会把产品自动下架，改完点上架即刻恢复、不必再过审。 */
          ? '<div class="note">本产品<b>在售中</b>，全部字段均可修改。' +
            '修改后产品将<b>自动下架</b>，以避免门店与客户端按已变更前的内容成交；' +
            '完成后返回产品列表点击「提交上架」即时恢复展示，<b>无需再次审核</b>。' +
            (p.ord_cnt ? '已成交的 ' + p.ord_cnt + ' 笔订单按下单时的快照执行，不受影响。' : '') +
            '</div>'
          : '')) +
      /* 签证属性原来整块只读，录错一个字只能重建产品重新报价
         （唐美芳 2026-09-04：「签证名称、自定义名称后缀能不能都允许修改，
         修改的时候自动下架就行」）。现在除国家与送签地外都可改。
         国家 / 送签地不放开：改这两个等于卖另一条签证了，应该新建产品——
         否则历史订单会挂在一条「国家都变了」的目录上。 */
      card('签证属性 <span>除目的地国家与送签地外均可修改；修改后本产品将自动下架</span>',
        '<div class="pad">' + (cat ? (
          '<div class="fgrid">' +
          '<label class="f"><span>目的地国家</span><input value="' + esc(cat.country) +
          '" disabled><div class="hint">变更目的地国家须新建产品，' +
          '直接修改将导致历史订单关联至错误的平台目录</div></label>' +
          '<label class="f"><span>送签地</span><input value="' + esc(cat.submit_city) +
          '" disabled><div class="hint">同上，变更送签地即构成另一条签证产品</div></label>' +
          '<label class="f"><span>签证名称 <i>*</i></span><input id="e-type" value="' +
          esc(cat.visa_type) + '" placeholder="如：个人旅游签证（B1/B2）">' +
          '<div class="hint">修改后系统将在平台目录中<b>另行登记一条</b>，' +
          '其他供应商经营的原签证不受影响；已成交订单按下单时的名称展示。</div></label>' +
          /* 名称后缀原来在下面的「产品信息」卡里，跟签证名称隔了半屏
             （唐美芳 2026-09-07：「能不能签证名称和产品名称在一起呢」）。 */
          '<label class="f"><span>自定义名称后缀</span><input id="w-suffix" value="' +
          esc(p.name_suffix || '') + '" placeholder="如：加急 / 免面签代办">' +
          '<div class="hint">最终产品名 = <b id="w-basename">' + esc(baseName) + '</b> + 后缀' +
          '<div id="w-fullname" class="fullname"></div></div></label>' +
          '<label class="f"><span>签证类型</span><select id="e-cat">' +
          (r[0].visa_cats || []).map(function (x) {
            return '<option' + (cat.visa_cat === x ? ' selected' : '') + '>' + esc(x) + '</option>';
          }).join('') + '</select></label>' +
          '<label class="f"><span>签证有效期</span><div class="inline2">' +
          '<input id="e-vnum" type="number" min="0" value="' + (cat.valid_num || 0) + '">' +
          '<select id="e-vtype">' +
          ['year', 'month', 'day'].map(function (u) {
            return '<option value="' + u + '"' +
              ((cat.valid_type || 'year') === u ? ' selected' : '') + '>' + VALID_UNIT[u] + '</option>';
          }).join('') + '</select></div></label>' +
          '<label class="f"><span>入境次数</span><select id="e-entries">' +
          [['single', '单次入境'], ['double', '两次入境'], ['multi', '多次入境']].map(function (x) {
            return '<option value="' + x[0] + '"' + (cat.entries === x[0] ? ' selected' : '') +
              '>' + x[1] + '</option>';
          }).join('') + '</select></label>' +
          '<label class="f"><span>单次停留期</span><div class="inline3">' +
          '<input id="e-stmin" type="number" min="0" value="' +
          (cat.stay_min != null ? cat.stay_min : (cat.stay_days || 0)) + '" placeholder="最少">' +
          '<span class="sep">至</span>' +
          '<input id="e-stmax" type="number" min="0" value="' +
          (cat.stay_max != null ? cat.stay_max : (cat.stay_days || 0)) + '" placeholder="最多">' +
          '<select id="e-stunit">' +
          [['day', '天'], ['month', '个月'], ['year', '年']].map(function (u) {
            return '<option value="' + u[0] + '"' +
              ((cat.stay_unit || 'day') === u[0] ? ' selected' : '') + '>' + u[1] + '</option>';
          }).join('') + '</select></div>' +
          '<div class="hint">如无区间，两栏填写相同数值。</div></label>' +
          '<label class="f"><span>是否需要面签</span><select id="e-int">' +
          '<option value="1"' + (cat.need_interview !== 0 ? ' selected' : '') + '>需面签</option>' +
          '<option value="0"' + (cat.need_interview === 0 ? ' selected' : '') +
          '>免面签</option></select>' +
          '<div class="hint"><b>本项用于确定材料清单中原件的提交方式</b>：需面签按「面试携带」下发，' +
          '<b>免面签按「邮寄 / 自送」下发</b>（护照原件须交至指定网点或由快递上门取件）。<br>' +
          '<b class="bad">免面签资格条件各国收紧频繁</b>，请以使领馆最新公告为准，' +
          '并在「受理范围说明」中写明。</div></label>' +
          '<label class="f"><span>是否需要录指纹</span><select id="e-fp">' +
          '<option value="1"' + (cat.need_fingerprint !== 0 ? ' selected' : '') + '>需录指纹</option>' +
          '<option value="0"' + (cat.need_fingerprint === 0 ? ' selected' : '') +
          '>不需要</option></select></label></div>' +
          '<div class="note" style="margin-top:10px">有效期、入境次数、停留期、面签与指纹属于' +
          '<b>该条签证的客观属性</b>，修改后对经营同一条签证的全部供应商同时生效，' +
          '各供应商应保持一致。签证名称仅影响贵司该条产品，不影响其他供应商。</div>'
        ) : '<div class="empty">平台目录中未查到该条签证</div>') + '</div>') +
      card('产品信息 <span>' + esc(baseName) + '</span>',
        '<div class="pad">' +
        prodFields(j, {
          suffix: p.name_suffix, vendor_code: p.vendor_code, addr_id: p.addr_id,
          feature: p.feature, svc_tags: p.svc_tags, to_c: p.to_c, fullver_id: p.fullver_id,
          flow: p.flow, hero_img: p.hero_img,
          accept_provinces: p.accept_provinces, accept_note: p.accept_note
        }, { p: p, baseName: baseName, fv: true, name: false,
          country: cat && cat.country }) +
        '<div style="margin-top:14px"><button class="btn p" data-save>保存产品信息</button> ' +
        '<button class="btn" data-cancel>取消</button></div></div>') +
      card('套餐报价 <span>共 ' + (p.packages || []).length + ' 个套餐</span>',
        '<div class="pad">' +
        '<div class="hint" style="margin-bottom:10px">套餐的签证费、服务费、建议零售价、时效在' +
        '「套餐与报价」页面维护，该表单与新增产品第 3 步为同一张。</div>' +
        (p.packages || []).map(function (k) {
          return '<div class="kv"><i>' + esc(k.name) + '</i><b>结算价 ¥' + money(k.settle_price) +
            ' · 建议零售 ¥' + money(k.suggest_retail) + ' · ' + k.lead_days + ' 工作日</b></div>';
        }).join('') +
        '<div style="margin-top:12px"><button class="btn" data-pk>维护套餐与报价</button></div></div>');

    flwBind(m);   /* 办理流程行的增删绑定 */
    imgBind(m);   /* 头图上传 */
    provBind(m, 'w-prov');   /* 受理居住地范围的「全国受理」与省份互斥 */
    richBind(m);             /* 受理范围说明是富文本，渲染后要绑工具栏 */
    /* 改签证名称或后缀时，实时拼出客户最终看到的产品名 */
    var nameSync = function () {
      var g2 = function (id) { return (($(id, m) || {}).value || '').trim(); };
      var bn = (cat ? cat.submit_city + cat.country : '') + g2('#e-type');
      var el = $('#w-basename', m);
      if (el) el.textContent = bn || baseName;
      var full = $('#w-fullname', m);
      if (full) {
        var sfx = g2('#w-suffix');
        full.innerHTML = '客户端展示的产品名称：<b>' + esc((bn || baseName) + (sfx ? ' ' + sfx : '')) + '</b>';
      }
    };
    ['#e-type', '#w-suffix'].forEach(function (id) {
      var el = $(id, m);
      if (el) el.oninput = nameSync;
    });
    nameSync();
    /* 没有合适的清单版本时，当场去建一份再回来选（唐美芳 2026-09-07） */
    $('[data-fvgo]', m) && ($('[data-fvgo]', m).onclick = function () {
      S.cache.fvFrom = 'edit:' + p.id;
      go('fullvers');
    });
    $('[data-fvrf]', m) && ($('[data-fvrf]', m).onclick = function () {
      return api('/sup/catalog').then(function (j2) {
        UBK_FVS = j2.fullvers || [];
        var sel = $('#w-fv', m), cur = sel.value;
        var cty = cat && cat.country;
        sel.innerHTML = '<option value="">— 未绑定 —</option>' +
          UBK_FVS.filter(function (f) { return !cty || f.country === cty; }).map(function (f) {
            return '<option value="' + f.id + '"' +
              (String(cur) === String(f.id) ? ' selected' : '') + '>' +
              esc(f.ver_no + ' · ' + f.name) + '</option>';
          }).join('');
        toast('清单版本已刷新');
      }).catch(fail);
    });
    $('[data-back]', m).onclick = function () { go('products'); };
    $('[data-cancel]', m).onclick = function () { go('products'); };
    $('[data-pk]', m).onclick = function () { S.cache.pkOpen = null; go('pkgs', p.id); };
    $('[data-save]', m).onclick = function () {
      var d = prodRead(m, { fv: true });
      d.id = p.id;
      /* 签证属性单独打包成 visa 传给后端：改签证名称要走「另立目录并换绑」，
         跟产品自身字段不是一码事，混在一层里后端分不清 */
      if ($('#e-type', m)) {
        var gv = function (id) { var e = $(id, m); return e ? e.value.trim() : ''; };
        if (!gv('#e-type')) return toast('签证名称不能为空', true);
        d.visa = {
          visa_type: gv('#e-type'), visa_cat: gv('#e-cat'),
          valid_type: gv('#e-vtype'), valid_num: +gv('#e-vnum') || 0,
          entries: gv('#e-entries'),
          stay_min: +gv('#e-stmin') || 0, stay_max: +gv('#e-stmax') || 0,
          stay_unit: gv('#e-stunit') || 'day',
          need_interview: gv('#e-int') === '1' ? 1 : 0,
          need_fingerprint: gv('#e-fp') === '1' ? 1 : 0
        };
      }
      api('/sup/product/save', d)
        .then(function (r2) {
          /* 自动下架是后端做的，供应商必须当场知道——不然他以为改完就生效了，
             回头发现产品不在架上，会以为系统出了问题 */
          toast(r2 && r2.auto_off
            ? '已保存。本次修改涉及' + (r2.changed || []).join('、') +
              '，产品已自动下架；返回列表点击「提交上架」即时恢复展示，无需再次审核'
            : '已保存');
          go('products');
        }).catch(fail);
    };
  });
};
