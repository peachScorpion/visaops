/* ============================================================
   UBK 结算管理三张单：预付款管理 / 付款退款管理 / 账单管理
   唐美芳 2026-08-31 给了众信「结算管理 › 付款管理」三张截图，要求照着复刻列表页，
   「不需要构建子按钮页面」——所以「预付明细 / 查看水单 / 新增 / 导出」这些按钮保留位置，
   点了给一句说明，不再往下做详情页。

   三张单共用一套骨架（截图里也是同一套）：
     说明要点 → 页签 → 两行筛选 → 表格卡（右上「导出 + 新增」）
   状态列都是「文字 + 下面一行时间戳」，驳回的还带驳回人，红/绿区分。
   ============================================================ */

/* 状态单元格：文字 + 时间戳（+ 驳回人），照截图的样式 */
function stCell(text, at, tone, who) {
  var cls = tone === 'ok' ? 'st-ok' : tone === 'bad' ? 'st-bad' : 'st-wait';
  return '<span class="' + cls + '">' + esc(text) +
    (who ? '(' + esc(who) + ')' : '') + '</span>' +
    (at ? '<div class="st-at">' + esc((at || '').slice(0, 19)) + '</div>' : '');
}
function toneOf(k) {
  return k === 'approved' || k === 'paid' || k === 'done' ? 'ok'
    : k === 'rejected' ? 'bad' : '';
}
/* 「本页只做列表」的统一提示，避免点了没反应 */
function notBuilt(title, what) {
  /* 演示范围提示。原来这句写成了跟需求方对话的口吻（「需要的话跟我说」），
     那是聊天记录，不该出现在系统界面上（唐美芳 2026-09-01：页面话术要用官方口吻）。 */
  confirmBox(title, what + '<br><br>本期<b>仅实现列表页</b>，明细页与新增流程' +
    '不在本期范围内，将按同一结构在后续版本中实现。', '知道了').catch(function () { });
}

/* ---------- 预付款管理 ---------- */
VIEWS['ubk:settle'] = VIEWS['fin:prepay'] = VIEWS['ops:prepay'] = function (m) {
  return api('/sup/prepays').then(function (j) {
    var q = srchCard('ubkpp', [
      { k: 'no', t: '预付款单号', ph: '请输入' },
      { k: 'pay_company', t: '付款公司', ph: '请输入' },
      { k: 'apply_text', t: '申请状态', type: 'sel',
        opts: uniqOpts(j.list, function (r) { return r.apply_text; }) },
      { k: 'invoice_text', t: '发票状态', type: 'sel',
        opts: uniqOpts(j.list, function (r) { return r.invoice_text; }) },
      { k: 'pay_text', t: '付款状态', type: 'sel',
        opts: uniqOpts(j.list, function (r) { return r.pay_text; }) },
      { k: 'apply_by', t: '申请人', ph: '请输入' }
    ]);
    var t = subTabs('ubkpp', [
      { k: 'all', t: '全部', fn: function () { return true; } },
      { k: 'wa', t: '预付申请待审核', fn: function (r) { return r.apply_status === 'pending'; } },
      { k: 'wp', t: '待付款', fn: function (r) {
        return r.apply_status === 'approved' && r.pay_status === 'unpaid'; } },
      { k: 'paid', t: '已付款', fn: function (r) { return r.pay_status === 'paid'; } },
      { k: 'owe', t: '待补发票', fn: function (r) {
        return r.pay_status === 'paid' && r.invoice_status !== 'approved'; } }
    ], q.filter(j.list));
    var so = sorter('ubkpp', [
      ['申请预付金额', function (r) { return r.amount || 0; }],
      ['申请日期', function (r) { return r.apply_at || ''; }]
    ]);
    var pg = pager('ubkpp', so.sort(t.rows), 10);

    m.innerHTML = pageH(menuName('prepay', '预付款管理'), '') +
      '<div class="sx-note"><ul>' +
      '<li><b>预付款请款：</b>根据合同付款约定，供应商可发起出团前预付请款申请</li>' +
      '<li><b>发票提交：</b>提交预付申请时，需要将发票一并进行上传，发票审核通过后才可进行付款</li>' +
      '<li><b>付款公司：</b>为实际付款公司，供应商开票信息应与系统中付款公司对应开票信息一致</li>' +
      '<li><b>状态说明：</b>申请状态为平台对预付款单申请的审核状态，发票状态为发票的审核状态，' +
      '付款状态为财务是否打款状态</li>' +
      '<li><b>查看水单：</b>付款状态为已付款，操作中点击「查看水单」进行查看</li>' +
      '</ul></div>' +
      '<div class="card">' + t.html + '<div class="pad">' + q.html.replace(/^<div class="card">|<\/div>$/g, '') +
      '</div></div>' +
      '<div class="grid" style="margin-bottom:14px">' +
      '<div class="stat' + (j.wait_apply ? ' hot' : '') + '"><b>' + j.wait_apply + '</b><span>待审核申请</span></div>' +
      '<div class="stat"><b>¥' + money(j.wait_pay) + '</b><span>已审核待付款</span></div>' +
      '<div class="stat"><b>¥' + money(j.paid) + '</b><span>累计已付款</span></div>' +
      '<div class="stat"><b>' + j.owe_inv + '</b><span>待补发票</span></div></div>' +
      '<div class="card"><div class="pad">' +
      '<div class="sx-bar"><button class="btn" data-exp>预付款导出</button>' +
      '<button class="btn r" data-new>新建</button></div>' +
      table(so.cols(['预付款单号', '付款公司', '订单数量', '申请预付金额', '申请状态',
        '发票状态', '付款状态', '申请人', '操作']),
        pg.rows, function (r) {
          return '<td class="mono nw"><b>' + esc(r.no) + '</b></td>' +
            '<td class="nw">' + esc(r.pay_company || '—') + '</td>' +
            '<td class="num nw">' + r.ord_count + '</td>' +
            '<td class="num nw"><b class="sx-amt">¥' + money(r.amount) + '</b></td>' +
            '<td class="nw">' + stCell(r.apply_text, r.apply_status === 'rejected' ? r.reject_at : r.apply_at,
              toneOf(r.apply_status), r.apply_status === 'rejected' ? r.reject_by : '') + '</td>' +
            '<td class="nw">' + stCell(r.invoice_text, r.invoice_at, toneOf(r.invoice_status)) + '</td>' +
            '<td class="nw">' + stCell(r.pay_text, r.pay_at, toneOf(r.pay_status)) + '</td>' +
            '<td class="nw">' + esc(r.apply_by || '—') +
            '<div class="st-at">' + esc((r.created_at || '').slice(0, 19)) + '</div></td>' +
            '<td class="nw"><a class="sx-op" data-dt="' + esc(r.no) + '">预付明细</a>' +
            (r.pay_status === 'paid'
              ? '<a class="sx-op" data-sd="' + esc(r.no) + '">查看水单</a>' : '') + '</td>';
        }, '没有符合条件的预付款单') + '</div>' + pg.html + '</div>';

    function rl() { S.cache['pg:ubkpp'] = 1; reload(); }
    q.bind(m, rl); t.bind(m, rl); so.bind(m, rl); pg.bind(m, reload);
    $('[data-exp]', m).onclick = function () { notBuilt('预付款导出', '按当前筛选条件导出预付款单列表。'); };
    $('[data-new]', m).onclick = function () {
      notBuilt('新增预付款申请', '按合同付款约定发起出团前预付请款，需同时上传发票。');
    };
    $$('[data-dt]', m).forEach(function (b) {
      b.onclick = function () { notBuilt('预付明细 · ' + b.dataset.dt, '该笔预付款关联的订单明细与金额构成。'); };
    });
    $$('[data-sd]', m).forEach(function (b) {
      b.onclick = function () {
        var r = j.list.filter(function (x) { return x.no === b.dataset.sd; })[0];
        notBuilt('查看水单 · ' + r.no, '付款水单：<b>' + esc(r.receipt_img || '—') + '</b>');
      };
    });
  });
};

/* ---------- 付款退款管理 ---------- */
VIEWS['ubk:srefund'] = VIEWS['fin:srefund'] = VIEWS['ops:srefund'] = function (m) {
  return api('/sup/refunds').then(function (j) {
    var q = srchCard('ubksrf', [
      { k: 'no', t: '付款退款单号', ph: '请输入' },
      { k: 'biz_pay_no', t: '业务付款单号', ph: '请输入' },
      { k: 'recv_company', t: '收款公司', ph: '请输入' },
      { k: 'apply_text', t: '申请状态', type: 'sel',
        opts: uniqOpts(j.list, function (r) { return r.apply_text; }) },
      { k: 'status_text', t: '付款退款状态', type: 'sel',
        opts: uniqOpts(j.list, function (r) { return r.status_text; }) },
      { k: 'ord_no', t: '订单编号', ph: '请输入' }
    ]);
    var t = subTabs('ubksrf', [
      { k: 'all', t: '全部', fn: function () { return true; } },
      { k: 'wa', t: '付款退款待审核', fn: function (r) { return r.apply_status !== 'approved'; } },
      { k: 'wr', t: '待退款', fn: function (r) { return r.status === 'confirmed'; } }
    ], q.filter(j.list));
    var so = sorter('ubksrf', [
      ['付款退款金额', function (r) { return r.amount || 0; }],
      ['申请日期', function (r) { return r.created_at || ''; }]
    ]);
    var pg = pager('ubksrf', so.sort(t.rows), 10);
    var isSup = S.role === 'ubk';

    m.innerHTML = pageH(menuName('srefund', '付款退款管理'), '') +
      '<div class="sx-note"><ul>' +
      '<li><b>状态说明：</b>申请状态为平台对付款退款单申请的审核状态；' +
      '付款退款状态为供应商进行实际退款后平台完成确认的状态</li>' +
      '<li><b>收款公司：</b>为供应商实际退款到账公司</li>' +
      '<li>提交付款退款申请时请上传水单</li>' +
      '<li><b>金额计算规则：</b>按办签进度分档——尚未开始办理的全额退回；已填表或已预约的，代缴签证费不予退还；' +
      '已递交使领馆的，签证费不予退还，服务费留存 50%</li>' +
      '</ul></div>' +
      '<div class="card">' + t.html + '<div class="pad">' +
      q.html.replace(/^<div class="card">|<\/div>$/g, '') + '</div></div>' +
      '<div class="grid" style="margin-bottom:14px">' +
      '<div class="stat' + (j.pending_amt ? ' hot' : '') + '"><b>¥' + money(j.pending_amt) +
      '</b><span>待确认</span></div>' +
      '<div class="stat"><b>¥' + money(j.confirmed_amt) + '</b><span>已确认待退款</span></div>' +
      '<div class="stat"><b>¥' + money(j.done_amt) + '</b><span>已退回</span></div>' +
      '<div class="stat"><b>' + j.list.length + '</b><span>累计单据</span></div></div>' +
      '<div class="card"><div class="pad">' +
      '<div class="sx-bar"><button class="btn" data-exp>付款退款导出</button>' +
      '<button class="btn r" data-new>新建</button></div>' +
      table(so.cols(['付款退款单号 / 业务付款单号', '收款公司', '退款订单数量', '付款退款金额',
        '申请状态', '退换发票', '发票状态', '付款退款状态', '申请人', '操作']),
        pg.rows, function (r) {
          return '<td class="mono nw"><b>' + esc(r.no) + '</b>' +
            '<div class="st-at mono">' + esc(r.biz_pay_no || '—') + '</div></td>' +
            '<td class="nw">' + esc(r.recv_company || '—') + '</td>' +
            '<td class="num nw">' + (r.ord_count || 1) + '</td>' +
            '<td class="num nw"><b class="sx-amt">¥' + money(r.amount) + '</b>' +
            '<div class="st-at">原结算 ¥' + money(r.settle_amount) + '</div></td>' +
            '<td class="nw">' + stCell(r.apply_text, r.confirm_at, toneOf(r.apply_status)) + '</td>' +
            '<td class="nw">' + (r.invoice_exchange ? '是' : '否') + '</td>' +
            '<td class="nw">' + (r.invoice_status
              ? stCell(r.invoice_text, r.confirm_at, toneOf(r.invoice_status)) : '—') + '</td>' +
            '<td class="nw">' + stCell(r.status_text, r.done_at, toneOf(r.status)) + '</td>' +
            '<td class="nw">' + esc(r.apply_by || '—') +
            '<div class="st-at">' + esc((r.created_at || '').slice(0, 19)) + '</div></td>' +
            '<td class="nw"><a class="sx-op" data-dt="' + esc(r.no) + '">退款明细</a>' +
            (isSup && r.status === 'pending'
              ? '<a class="sx-op" data-cf="' + esc(r.no) + '">确认</a>' +
                '<a class="sx-op" data-rj="' + esc(r.no) + '">提异议</a>'
              : (!isSup && r.status === 'confirmed'
                ? '<a class="sx-op" data-dn="' + esc(r.no) + '">确认收款</a>' : '')) + '</td>';
        }, '没有符合条件的付款退款单') + '</div>' + pg.html + '</div>';

    function rl() { S.cache['pg:ubksrf'] = 1; reload(); }
    q.bind(m, rl); t.bind(m, rl); so.bind(m, rl); pg.bind(m, reload);
    $('[data-exp]', m).onclick = function () { notBuilt('付款退款导出', '按当前筛选条件导出付款退款单列表。'); };
    $('[data-new]', m).onclick = function () {
      notBuilt('新增付款退款申请', '客户退款出账后由系统自动生成，通常无需手工新增。');
    };
    $$('[data-dt]', m).forEach(function (b) {
      b.onclick = function () {
        var r = j.list.filter(function (x) { return x.no === b.dataset.dt; })[0];
        notBuilt('退款明细 · ' + r.no,
          '订单 <b>' + esc(r.ord_no) + '</b>（' + esc(r.progress_text) + '）<br>' +
          '原结算 ¥' + money(r.settle_amount) + '，供应商留存 ¥' + money(r.keep_amount) +
          '（已发生成本），应退回 <b>¥' + money(r.amount) + '</b><br>' +
          '关联客户退款单 ' + esc(r.cust_refund_no || '—'));
      };
    });
    $$('[data-cf]', m).forEach(function (b) {
      b.onclick = function () {
        var r = j.list.filter(function (x) { return x.no === b.dataset.cf; })[0];
        confirmBox('确认退回 ¥' + money(r.amount),
          '原结算 ¥' + money(r.settle_amount) + '，按办签进度「' + esc(r.progress_text) +
          '」可留存 <b>¥' + money(r.keep_amount) + '</b>，应退回 <b>¥' + money(r.amount) +
          '</b>。<br><br>如金额有误，请点击「提异议」，勿直接确认。', '确认无误')
          .then(function () { return api('/sup/refund/act', { no: r.no, action: 'confirm' }); })
          .then(function (x) { toast(x.msg); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    $$('[data-rj]', m).forEach(function (b) {
      b.onclick = function () {
        ask('对冲减金额提出异议', [
          { k: 'note', label: '异议说明', type: 'textarea', rows: 3, required: true,
            ph: '如：该单已完成面签陪同，服务费应全额留存' }
        ], '提交异议', function (f) {
          return api('/sup/refund/act', { no: b.dataset.rj, action: 'reject', note: f.note });
        }).then(function (x) { toast(x.msg); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    $$('[data-dn]', m).forEach(function (b) {
      b.onclick = function () {
        confirmBox('确认收到退回款',
          '确认后系统将<b>自动冲减该订单对供应商的应付账款</b>，请先核对银行到账信息。', '确认收款')
          .then(function () { return api('/sup/refund/act', { no: b.dataset.dn, action: 'done' }); })
          .then(function (x) { toast(x.msg); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
  });
};

/* ---------- 账单管理 ---------- */
VIEWS['ubk:bill'] = VIEWS['fin:bill'] = VIEWS['ops:bill'] = function (m) {
  return api('/sup/bills').then(function (j) {
    var q = srchCard('ubkbill', [
      { k: 'no', t: '账单编号', ph: '请输入' },
      { k: 'pay_company', t: '付款公司', ph: '请输入' },
      { k: 'apply_text', t: '申请状态', type: 'sel',
        opts: uniqOpts(j.list, function (r) { return r.apply_text; }) },
      { k: 'invoice_text', t: '发票状态', type: 'sel',
        opts: uniqOpts(j.list, function (r) { return r.invoice_text; }) },
      { k: 'pay_text', t: '付款状态', type: 'sel',
        opts: uniqOpts(j.list, function (r) { return r.pay_text; }) },
      { k: 'apply_by', t: '申请人', ph: '请输入' }
    ]);
    var t = subTabs('ubkbill', [
      { k: 'all', t: '全部账单', fn: function () { return true; } },
      { k: 'wa', t: '待审核账单', fn: function (r) { return r.apply_status === 'pending'; } },
      { k: 'wp', t: '待付款', fn: function (r) { return r.pay_status === 'unpaid'; } },
      { k: 'part', t: '部分付款', fn: function (r) { return r.pay_status === 'part'; } },
      { k: 'paid', t: '已付款', fn: function (r) { return r.pay_status === 'paid'; } },
      { k: 'owe', t: '待补发票', fn: function (r) {
        return r.invoice_status === 'none' || r.invoice_status === 'rejected'; } }
    ], q.filter(j.list));
    var so = sorter('ubkbill', [
      ['请款金额', function (r) { return r.claim_amount || 0; }],
      ['申请日期', function (r) { return r.apply_at || ''; }]
    ]);
    var pg = pager('ubkbill', so.sort(t.rows), 10);

    m.innerHTML = pageH(menuName('bill', '账单管理'), '') +
      '<div class="sx-note"><ul>' +
      '<li><b>对账请款：</b>根据合同付款约定，订单出账后可发起请款</li>' +
      '<li><b>付款公司：</b>为实际付款公司，供应商开票信息应与系统中付款公司对应开票信息一致</li>' +
      '<li><b>状态说明：</b>申请状态为平台对账单申请的审核状态，发票状态为提交及审核状态，' +
      '付款状态为财务是否打款状态</li>' +
      '<li><b>发票提交：</b>提交账单申请时，需要将发票一并进行上传，发票审核通过后才可进行付款</li>' +
      '<li><b>查看水单：</b>账单中点击「付款明细」进行水单查看</li>' +
      '</ul></div>' +
      '<div class="card">' + t.html + '<div class="pad">' +
      q.html.replace(/^<div class="card">|<\/div>$/g, '') + '</div></div>' +
      '<div class="grid" style="margin-bottom:14px">' +
      '<div class="stat' + (j.wait_apply ? ' hot' : '') + '"><b>' + j.wait_apply + '</b><span>待审核账单</span></div>' +
      '<div class="stat"><b>¥' + money(j.wait_pay) + '</b><span>已审核未付</span></div>' +
      '<div class="stat"><b>¥' + money(j.paid) + '</b><span>累计已付</span></div>' +
      '<div class="stat"><b>' + j.owe_inv + '</b><span>待补发票</span></div></div>' +
      '<div class="card"><div class="pad scrollx">' +
      '<div class="sx-bar"><button class="btn" data-exp>导出报表</button>' +
      '<button class="btn r" data-new>新建</button></div>' +
      table(so.cols(['账单编号', '付款公司', '订单数量', '金额', '申请状态', '发票状态',
        '付款金额', '付款状态', '申请人', '操作']),
        pg.rows, function (r) {
          return '<td class="mono nw"><b>' + esc(r.no) + '</b></td>' +
            '<td class="nw">' + esc(r.pay_company || '—') + '</td>' +
            '<td class="num nw">' + r.ord_count + '</td>' +
            '<td class="nw sx-3"><i>账单总金额：<b>¥' + money(r.total_amount) + '</b></i>' +
            '<i>已收金额：<b>¥' + money(r.received_amount) + '</b></i>' +
            '<i>请款金额：<b>¥' + money(r.claim_amount) + '</b></i></td>' +
            '<td class="nw">' + stCell(r.apply_text, r.apply_at, toneOf(r.apply_status),
              r.apply_status === 'rejected' ? r.reject_by : '') + '</td>' +
            '<td class="nw">' + stCell(r.invoice_text, r.invoice_at, toneOf(r.invoice_status),
              r.invoice_status === 'rejected' ? r.invoice_reject_by : '') + '</td>' +
            '<td class="nw sx-3"><i>应付：<b>¥' + money(r.payable_amount) + '</b></i>' +
            '<i>已付：<b>¥' + money(r.paid_amount) + '</b></i>' +
            '<i>未付：<b>¥' + money(r.unpaid_amount) + '</b></i></td>' +
            '<td class="nw">' + stCell(r.pay_text, r.pay_at, toneOf(r.pay_status)) + '</td>' +
            '<td class="nw">' + esc(r.apply_by || '—') +
            '<div class="st-at">' + esc((r.created_at || '').slice(0, 19)) + '</div></td>' +
            '<td class="nw"><a class="sx-op" data-dt="' + esc(r.no) + '">账单明细</a>' +
            (r.pay_status !== 'unpaid' ? '<a class="sx-op" data-pd="' + esc(r.no) + '">付款明细</a>' : '') +
            (r.invoice_status === 'rejected'
              ? '<a class="sx-op" data-iv="' + esc(r.no) + '">修改发票</a>' : '') + '</td>';
        }, '没有符合条件的账单') + '</div>' + pg.html + '</div>';

    function rl() { S.cache['pg:ubkbill'] = 1; reload(); }
    q.bind(m, rl); t.bind(m, rl); so.bind(m, rl); pg.bind(m, reload);
    $('[data-exp]', m).onclick = function () { notBuilt('导出报表', '按当前筛选条件导出账单列表。'); };
    $('[data-new]', m).onclick = function () {
      notBuilt('新增账单请款', '订单出账后按合同付款约定发起请款，需同时上传发票。');
    };
    $$('[data-dt]', m).forEach(function (b) {
      b.onclick = function () { notBuilt('账单明细 · ' + b.dataset.dt, '这张账单包含的订单明细与金额构成。'); };
    });
    $$('[data-pd]', m).forEach(function (b) {
      b.onclick = function () { notBuilt('付款明细 · ' + b.dataset.pd, '每一笔实际打款的时间、金额与水单。'); };
    });
    $$('[data-iv]', m).forEach(function (b) {
      b.onclick = function () { notBuilt('修改发票 · ' + b.dataset.iv, '发票被驳回后重新上传。'); };
    });
  });
};
