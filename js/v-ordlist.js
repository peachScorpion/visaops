/* ============================================================
   订单列表 · 众信七段结构（UOM / CSP 共用一套渲染）
   唐美芳 2026-08-31：「订单信息、产品信息、客户信息、销售信息、订单金额、结算金额、
   订单状态，还是和众信旅游订单一样延续这个结构」「CSP 列表里需要展示供应商信息」
   「uom 和 csp 所有的内容和字段最好是尽量保持一致，但对于特殊的操作，销售是没有权限的」。

   一张订单占三行：
     L1  订单信息 + 销售信息（订单编号 / 下单时间 / 渠道 / 销售人员 / 合同状态 / 查看详情）
     L2  产品信息 | 日期 | 人数 | 客户信息 | 订单金额 | 结算金额 | 订单状态
     L3  操作行（按角色给，销售侧没有送签处理）
   ============================================================ */

var OL_COLS = ['产品信息', '日期', '人数', '客户信息', '订单金额', '结算金额',
               '订单 / 支付 / 办签状态'];
/* 供应商视角第 5/6 段换了内容（成本毛利 + 结算状态），表头得跟着换，
   否则「订单金额」底下写的是结算收入，看的人会以为是客户付的钱 */
var OL_COLS_UBK = ['产品信息', '日期', '人数', '客户信息', '结算与毛利', '收款状态',
                   '订单状态 / 办签状态'];

/* ============ 行首勾选（2026-09-08）============
   众信那张表每单前面都有勾选框。唐美芳 2026-09-08：「签证订单勾选后，可以开发票，
   把开发票的按钮展示出来就可以」。
   选中的订单号存 S.cache，翻页 / 换筛选不清空——运营常常是筛一批、翻两页、一起开票。 */
function olSel() { return S.cache.olSel || (S.cache.olSel = []); }
function olSelBind(root, onChange) {
  $$('[data-olck]', root).forEach(function (b) {
    b.onchange = function () {
      var a = olSel(), i = a.indexOf(b.dataset.olck);
      if (b.checked) { if (i < 0) a.push(b.dataset.olck); }
      else if (i >= 0) a.splice(i, 1);
      if (onChange) onChange();
    };
  });
}
/* 批量操作条：有勾选才出现，摆在表格上方。 */
function olBatch(rows) {
  var sel = olSel();
  if (!sel.length) return '';
  var hit = rows.filter(function (o) { return sel.indexOf(o.no) >= 0; });
  var amt = hit.reduce(function (a, o) { return a + (o.recv || 0); }, 0);
  return '<div class="ol-bat"><b>已选 ' + sel.length + ' 单</b>' +
    '<s>可开票金额（按实收）¥' + money(amt) + '</s>' +
    '<a data-olclr>取消选择</a>' +
    '<button class="btn sm p" data-olinv>开发票</button></div>';
}

/* 汇总条：众信是横排一条，不是六张大卡（六张卡占掉半屏，翻单要多滚一次） */
function olSum(rows, view) {
  function s(k) { return rows.reduce(function (a, o) { return a + (o[k] || 0); }, 0); }
  var pax = rows.reduce(function (a, o) { return a + (o.pax || 0); }, 0);
  /* 供应商看到的是自己这侧的账：结算收入 / 签证费成本 / 毛利，
     不含客户成交价与平台毛利 */
  var items = view === 'ubk'
    ? [['结算收入', s('settle_amount')], ['签证成本', s('cost')],
       ['毛利', s('profit'), 'g'],
       /* 供应商口径一律说「收款」不说「结算」，跟列表和筛选对齐 */
       ['待收款', rows.filter(function (o) { return o.recv_state !== 'paid'; })
         .reduce(function (a, o) { return a + (o.settle_amount || 0); }, 0), 'r'],
       ['已收款', rows.filter(function (o) { return o.recv_state === 'paid'; })
         .reduce(function (a, o) { return a + (o.settle_amount || 0); }, 0)]]
    /* 顺序照众信酒店订单那条：合同 / 应收 / 结算 / 实收 / 未收（唐美芳 2026-09-08）。
       「已退 / 待付供应商 / 毛利」是签证这边多出来的口径，接在后面，不打乱前五项。 */
    : [
    ['合同', s('amount')], ['应收', s('amount')], ['结算', s('settle_amount')],
    ['实收', s('recv')], ['未收', s('owe'), s('owe') > 0 ? 'r' : ''],
    ['已退', s('refunded')], ['待付供应商', s('payable_open')],
    ['毛利', s('gross'), 'g']
  ];
  return '<div class="ol-sum">' + items.map(function (x) {
    return '<i>' + x[0] + '<u' + (x[2] ? ' class="' + x[2] + '"' : '') + '>¥' + money(x[1]) + '</u></i>';
  }).join('') + '<i>订单<u>' + rows.length + '</u></i><i>人数<u>' + pax + '</u></i></div>';
}

/* 办签进度：多人单在列表里聚合成「2 人待收材料 · 1 人已递交」，逐人明细进详情页 */
/* 办签进度这一格只放办签进度（P1–P10 的节点名），不放订单状态。
   唐美芳 2026-08-31：「你怎么还是把订单状态与签证办理状态混在一起了」。
   原来这里把办签人的 state（normal / refunded / cancelled）当成进度显示，
   于是格子里会出现「已退款」——那是订单状态线上的词，混进来就分不清
   「这个人退出了」和「整张单退款了」。退出的人改用中性的「已退出」灰标。
   订单本身还没付款或已取消时整格给「—」：那种单根本还没进入办签流程。 */
function olProg(aps, ord) {
  if (ord && (ord.status === 'created' || ord.status === 'cancelled')) {
    return '<span class="ol-na">—</span>';
  }
  if (!aps || !aps.length) return '<span class="ol-na">—</span>';
  var g = {}, order = [];
  aps.forEach(function (a) {
    var k = a.state === 'normal' ? a.progress_text : '已退出';
    if (!(k in g)) { g[k] = 0; order.push(k); }
    g[k]++;
  });
  return order.map(function (k) {
    return '<span class="tag ' + (k === '已退出' ? 'plain' : 'info') + '">' +
      (aps.length > 1 ? g[k] + ' 人' : '') + esc(k) + '</span>';
  }).join(' ');
}

/* 办签状态一格：粗粒度（未完成 / 部分完成 / 已完成）+ 细粒度（每位办签人到哪一步）。
   订单还没付款或已取消时办签这条线根本没起步，直接给一句话，不摆空标签。 */
function olVisa(o) {
  if (o.status === 'created') return '<span class="ol-na">未完成（待付款）</span>';
  if (o.status === 'cancelled') return '<span class="ol-na">已取消</span>';
  /* 只给粗粒度（唐美芳 2026-09-08：「办签状态先不用展示明细」）。
     逐位办签人到了哪一步，在订单详情的「办签人信息」里看——
     多人单在列表上摊开成「2 人待收料 · 1 人已递交」会把整格撑高，一屏看不了几单。 */
  var w = o.work_status || '未完成';
  return '<span class="tag ' + (WORK_TAG[w] || 'plain') + '">' + esc(w) + '</span>';
}

function olMoney(v, cls) {
  return '<b' + (cls ? ' class="' + cls + '"' : '') + '>¥' + money(v || 0) + '</b>';
}
/* 一行「标签 —— （副信息） 值」。
   唐美芳 2026-08-31：「后台列表中多字段信息的展示有点不太规则，看着信息太分散了」。
   原来是 space-between：标签长短不一（「毛利」2 字 vs「签证费成本」5 字），
   中间空白宽窄不等，金额右缘也对不齐；毛利率还塞在金额后面把金额往左推，
   三行数字压根不在一条竖线上。
   改成三栏栅格：标签定宽左对齐 | 副信息 | 数值右对齐，整列数字咬同一条右边线。 */
function olRow(label, val, extra) {
  return '<div class="ol-r"><i>' + label + '</i>' +
    '<em>' + (extra || '') + '</em>' + val + '</div>';
}

/* ============ 众信式筛选面板（2026-09-08）============
   唐美芳给了众信「销售管理 › 酒店产品 › 酒店订单」的截图：
   「uom 订单列表，请按现有 uom 酒店订单结构来，字段基本要一致，
     特殊签证订单的字段灵活替换」。
   酒店那张是四列栅格的大面板 + 收起 / 清空 / 查询，跟我们原来的 srchCard
   （一排几个下拉）不是一个量级。这里照它做一个通用面板，字段由调用方给。

   字段类型：text（输入）/ sel（下拉）/ dr（日期区间，两个输入）/ ck（底部复选框）。
   收起状态只留前 4 个，其余折起来——酒店那张默认也是展开的，但 20 个格子占掉半屏，
   给个收起按钮，选择权留给使用者。 */
function filtPanel(key, fields, opts) {
  opts = opts || {};
  var v = S.cache['fp:' + key] || (S.cache['fp:' + key] = {});
  var open = S.cache['fpo:' + key];
  if (open === undefined) open = S.cache['fpo:' + key] = true;
  var cks = fields.filter(function (f) { return f.type === 'ck'; });
  var body = fields.filter(function (f) { return f.type !== 'ck'; });
  var shown = open ? body : body.slice(0, 4);

  function cell(f) {
    var cur = v[f.k] || '';
    var inner;
    if (f.type === 'sel') {
      inner = '<select data-fp="' + f.k + '"><option value="">请选择</option>' +
        (f.opts || []).map(function (o) {
          return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === cur ? ' selected' : '') +
            '>' + esc(o[1]) + '</option>';
        }).join('') + '</select>';
    } else if (f.type === 'dr') {
      inner = '<div class="fp-dr"><input data-fp="' + f.k + '_a" type="date" value="' +
        esc(v[f.k + '_a'] || '') + '"><s>—</s><input data-fp="' + f.k + '_b" type="date" value="' +
        esc(v[f.k + '_b'] || '') + '"></div>';
    } else {
      inner = '<input data-fp="' + f.k + '" value="' + esc(cur) + '" placeholder="' +
        esc(f.ph || '请输入') + '">';
    }
    return '<label class="fp-c"><s>' + esc(f.t) + '</s>' + inner + '</label>';
  }

  var html = '<div class="fp"><div class="fp-g">' + shown.map(cell).join('') + '</div>' +
    '<div class="fp-b">' +
    cks.map(function (f) {
      return '<label class="fp-ck"><input type="checkbox" data-fp="' + f.k + '"' +
        (v[f.k] ? ' checked' : '') + '><span>' + esc(f.t) + '</span></label>';
    }).join('') +
    '<a class="fp-more" data-fptg>' + (open ? '收起 ⌃' : '展开 ⌄') + '</a>' +
    '<button class="btn" data-fprst>清空</button>' +
    '<button class="btn p" data-fpgo>查询</button></div></div>';

  return {
    html: html,
    filter: function (list) {
      return (list || []).filter(function (r) {
        return fields.every(function (f) {
          if (f.type === 'dr') {
            var a = v[f.k + '_a'], b = v[f.k + '_b'];
            if (!a && !b) return true;
            var d = String(f.get ? (f.get(r) || '') : (r[f.k] || '')).slice(0, 10);
            if (!d) return false;
            return (!a || d >= a) && (!b || d <= b);
          }
          if (f.type === 'ck') return v[f.k] ? f.fn(r) : true;
          var qv = String(v[f.k] || '').trim();
          if (!qv) return true;
          var got = f.get ? f.get(r) : r[f.k];
          if (f.multi) return (got || []).indexOf(qv) >= 0;
          if (f.type === 'sel') return String(got) === qv;
          return String(got == null ? '' : got).toLowerCase().indexOf(qv.toLowerCase()) >= 0;
        });
      });
    },
    bind: function (root, onChange) {
      $$('[data-fp]', root).forEach(function (el) {
        if (el.type === 'checkbox') {
          el.onchange = function () { v[el.dataset.fp] = el.checked ? 1 : 0; onChange(); };
        } else {
          el.oninput = el.onchange = function () { v[el.dataset.fp] = el.value; };
          el.onkeydown = function (e) { if (e.key === 'Enter') onChange(); };
        }
      });
      $('[data-fptg]', root).onclick = function () {
        S.cache['fpo:' + key] = !open; onChange();
      };
      $('[data-fpgo]', root).onclick = onChange;
      $('[data-fprst]', root).onclick = function () {
        S.cache['fp:' + key] = {}; onChange();
      };
    }
  };
}

/* opts: { view: 'uom'|'csp', actions: function(o){return html}, sub: function(o){return html} } */
function olTable(rows, opts) {
  if (!rows.length) return '<div class="empty">没有符合条件的订单</div>';
  var csp = opts.view === 'csp';
  var cols = csp || opts.view !== 'ubk' ? OL_COLS : OL_COLS_UBK;
  return '<table class="ol"><thead><tr>' +
    cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') +
    '</tr></thead><tbody>' + rows.map(function (o) {
      var acts = opts.actions ? opts.actions(o) : '';
      return '<tr class="ol-l1"><td colspan="' + cols.length + '"><div class="ol-l1i">' +
        /* 行首复选框：众信那张表每单前面都有，留给批量导出 / 批量标记用。
           这一版先把位置和勾选状态做出来，批量动作等业务口径定了再接。 */
        '<label class="ol-ck"><input type="checkbox" data-olck="' + esc(o.no) + '"' +
        (olSel().indexOf(o.no) >= 0 ? ' checked' : '') + '></label>' +
        '<i>订单编号' + copyCode(o.no) + '</i>' +
        '<i>下单时间<b>' + d16(o.created_at) + '</b></i>' +
        '<i>渠道信息<b>' + ordChan(o.channel) + '</b></i>' +
        (opts.view === 'ubk' ? '' :
          '<i>销售人员<b>' + esc(o.sale_name || '—') + '</b></i>' +
          '<i>订单合同状态<b><span class="tag warn">' + esc(o.contract_status || '未签约') + '</span></b></i>') +
        '<a class="ol-det" data-oldet="' + esc(o.no) + '">查看详情 ›</a></div></td></tr>' +

        '<tr class="ol-l2">' +
        /* 1 产品信息 —— CSP 也显示供应商（唐美芳 2026-08-31 明确要求） */
        /* 产品名可点，跳各自后台的产品详情（唐美芳 2026-09-08：
           「每个管理后台系统的订单列表，点产品名称跳转至产品详情页」）。
           三端的产品详情是三张不同的页（运营看全量、门店看可售视角、供应商看自己的），
           所以路由由 opts.view 决定，不是同一个地址。 */
        '<td class="ol-p">' +
        (o.sup_product_id
          ? '<b class="lnk" data-olpd="' + o.sup_product_id + '">' + esc(o.product) + '</b>'
          : '<b>' + esc(o.product) + '</b>') +
        '<div class="ol-s">套餐：' + esc(o.pkg || '—') + '</div>' +
        /* 供应商自己看自己的单，不用再显示一遍「供应商：优耐德」 */
        (opts.view === 'ubk' ? ''
          : '<div class="ol-s">供应商：' + esc(o.supplier || '—') + '</div>') + '</td>' +
        /* 2 日期 */
        /* 出行日期是下单必填项，不该出现空值（唐美芳 2026-09-08：「订单列表中的
           出行日期不可能为空的啊」）。接口层已补必填校验，存量空值由
           server/mig_depart.py 按「下单日期 + 套餐时效」补录。 */
        '<td>' + olRow('出行', '<b>' + esc(o.depart_date || '—') + '</b>') +
        olRow('下单', '<b>' + d16(o.created_at).slice(0, 10) + '</b>') + '</td>' +
        /* 3 人数 */
        '<td><b class="ol-pax">' + o.pax + '</b><div class="ol-s">人</div></td>' +
        /* 4 客户信息 */
        '<td>' + (csp ? '' : '<b>' + esc(o.org || '直客') + '</b>') +
        '<div class="ol-s' + (csp ? ' t' : '') + '">' + esc(o.contact || '—') + '</div>' +
        '<div class="ol-s mono">' + esc(o.phone || '—') + '</div></td>' +
        /* 5 订单金额 —— 供应商视角换成成本与毛利：客户成交价与平台毛利不给供应商看，
             那是平台与客户之间的价（唐美芳 2026-08-31 统一三端订单列表时定的口径）。 */
        (opts.view === 'ubk'
          ? '<td class="ol-m">' +
            olRow('结算收入', olMoney(o.settle_amount)) +
            olRow('签证成本', olMoney(o.cost)) +
            olRow('毛利', olMoney(o.profit, o.profit < 0 ? 'r' : 'g'),
              (o.margin || 0) + '%') + '</td>'
          : '<td class="ol-m">' +
        olRow('合同', olMoney(o.amount)) +
        olRow('应收', olMoney(o.amount)) +
        olRow('实收', olMoney(o.recv)) +
        (o.recv_wait ? olRow('待审核', olMoney(o.recv_wait, 'w')) : '') +
        olRow('欠款', olMoney(o.owe, o.owe > 0 ? 'r' : '')) +
        (o.refunded ? olRow('已退', olMoney(o.refunded, 'w')) : '') +
        olRow('毛利', olMoney(o.gross, o.gross < 0 ? 'r' : 'g'),
          (o.amount ? Math.round(o.gross * 1000 / o.amount) / 10 : 0) + '%') +
        '</td>') +
        /* 6 结算金额 —— 供应商看的是「平台什么时候把这笔钱付给我」 */
        (opts.view === 'ubk'
          /* 这一格放的是状态与套餐名，不是数字，跟「订单状态」列一样靠左排；
             搁在 .ol-m 里会被右对齐，跟旁边那列的金额右缘撞在一起 */
          /* 供应商这一格原来写「待结算 / 已结算」，跟唐美芳 2026-09-03 定的
             供应商口径不一致，统一换成「待收款 / 部分收款 / 已收全款」，
             并把该收多少、收到多少摆出来——供应商最关心的就是这两个数。 */
          ? '<td class="ol-st">' +
            olRow('收款状态', payTag(o, true)) +
            olRow('应收结算', olMoney(o.settle_amount)) +
            olRow('套餐', '<b>' + esc(o.pkg || '—') + '</b>') + '</td>'
          : '<td class="ol-m">' +
        olRow('结算', olMoney(o.settle_amount)) +
        olRow('待付', olMoney(o.payable_open, o.payable_open > 0 ? 'w' : '')) +
        (o.payable_paid ? olRow('已付', olMoney(o.payable_paid, 'g')) : '') +
        /* 「垫付」撤掉（唐美芳 2026-09-08：「结算金额没有垫付一说」）——
           专员垫付是履约过程中的代垫，属于费用报销那条线，不是这一单结算金额的构成。
           数据仍在（订单详情的结算金额里还看得到），只是不摆进列表的结算列。 */
        '</td>') +
        /* 7 订单状态 / 办签状态
           唐美芳 2026-09-01：「订单列表上的订单状态，办理和办签是不是可以合并，
           拆分成一个订单状态，一个订单办签状态，这样更清晰一点」。
           原来是三行：订单 / 办理 / 办签——「办理」（未开始·办理中·已完成）与
           「办签」（P1–P10 到哪一步）说的是同一条线的粗细两级，分两行看着像两个状态。
           现在合成一格：粗粒度做主标签，细粒度的人数分布跟在下面。 */
        /* 2026-09-03 加了一行支付状态，并把「待财务确认到账」那个红标撤了
           （唐美芳：「订单列表直接增加一个支付状态展示吧，别展示待财务确认到账了」）。
           财务确认是内部核对环节，客人明明付过钱，列表上挂个红标看着像没付。
           那个标识仍留在财务自己的页面（收款管理 / 订单总览的资金异常筛选）。
           <b>供应商看到的是收款状态</b>——他关心的是平台把结算款付给他没有，
           跟客户付没付钱是两笔账。 */
        '<td class="ol-st">' +
        olRow('订单状态', '<span class="tag ' + (ORD_TAG[o.status] || 'plain') + '">' +
          esc(o.status_text) + '</span>') +
        /* 供应商的收款状态已经摆在左边「结算状态」那一格了，这里不再重复一遍 */
        (opts.view === 'ubk' ? '' : olRow('支付状态', payTag(o))) +
        olRow('办签状态', olVisa(o)) +
        '</td></tr>' +

        (acts ? '<tr class="ol-l3"><td colspan="' + cols.length + '">' + acts + '</td></tr>' : '');
    }).join('') + '</tbody></table>';
}
