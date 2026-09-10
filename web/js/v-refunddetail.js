/* ============================================================
   退款单详情 · 结构对齐众信「财务管理 › 业务资金管理 › 退款管理 › 单据详情」
   订单信息 + 退款单据 + 办签人明细（含试算依据）+ 审批与出账日志
   + 底部动作（返回 / 主管批准·驳回 / 财务原路退回出账）。
   唐美芳 2026-09-02：「uom 的收款管理、退款管理，为什么没有查看详情的页面呢」——
   收款单详情 8-31 就有了（v-recvdetail.js），退款一直只有一张列表。
   本页复用 rdCell / .rd 表格与 .od-bar 吸底条，跟收款单详情长一个样，
   财务在两张单据之间来回看时不用重新适应。
   ============================================================ */

VIEWS['fin:refunddetail'] = VIEWS['ops:refunddetail'] = VIEWS['lead:refunddetail'] =
VIEWS['csp:refunddetail'] = function (m, no) {
  if (!no) { m.innerHTML = '<div class="empty">缺少退款单号</div>'; return; }
  return api('/refund/detail', { no: no }).then(function (d) {
    var o = d.ord, r = d.rf;
    var ST = { applying: 'warn', l1: 'info', done: 'ok', reject: 'bad' };
    var mn = function (v) { return '¥' + money(v || 0); };
    /* 本单退的那几个人，和留在单上继续办的那几个人 */
    var inb = d.items.filter(function (x) { return x.in_bill; });
    /* 试算金额有两个来源，不能混：
       - 单据还在途（待审批 / 待出账）时，按当前状态实时重算，主管看到的是最新口径；
       - 单据已终结（出账 / 驳回）时，必须用<b>申请当时</b>写进日志的那个数。
         已出账的人 state 已经是 refunded，实时重算永远是 0，
         摆出来就成了「试算 0 元却退了 460 元」。 */
    var live = inb.reduce(function (a, b) { return a + (b.refundable || 0); }, 0);
    var quoted = (r.settled && r.quote_apply != null) ? r.quote_apply : live;
    /* 主管可以在试算值上调整实退金额，两者不一致要摆出来——
       财务出账看的是实退，责任判定的依据是试算。 */
    var adj = Math.abs((r.amount || 0) - quoted) > 0.009;

    var head = '<div class="od-top"><div class="od-top-h"><div>' +
      '<div class="od-no">退款单号：<b>' + esc(r.no) + '</b>' +
      '<span class="tag ' + (ST[r.status] || 'plain') + '">' + esc(r.status_text) + '</span>' +
      (r.liability_text ? '<span class="tag info">' + esc(r.liability_text) + '</span>' : '') +
      '</div>' +
      '<div class="od-pn">' + mn(r.amount) + '</div>' +
      '<div class="od-pm">' + esc(r.reason_cate || '未分类') + ' · ' + r.n + ' 人 · ' +
      '订单 ' + esc(o.no) + '</div></div>' +
      '<button class="btn" data-rf="back">返回列表</button></div></div>';

    var ordSec = '<div class="od-sec"><div class="od-h"><h3>订单信息</h3></div>' +
      '<table class="rd"><tbody>' +
      '<tr>' + rdCell('订单编号', '<a class="lk" data-rf="ord">' + esc(o.no) + '</a>') +
      rdCell('下单日期', d16(o.created_at)) +
      rdCell('产品名称', esc(o.product)) + '</tr>' +
      '<tr>' + rdCell('套餐', esc(o.pkg)) +
      rdCell('订单金额', '<b>' + mn(o.amount) + '</b>　' + o.pax + ' 人') +
      rdCell('出发日期', o.depart_date) + '</tr>' +
      '<tr>' + rdCell('销售公司', esc(o.sale_org)) +
      rdCell('渠道名称', esc(o.channel_name)) +
      rdCell('销售', esc(o.sale)) + '</tr>' +
      '<tr>' + rdCell('客户信息', esc(o.cust_type)) +
      rdCell('原收款单', r.src_no
        ? '<span class="mono">' + esc(r.src_no) + '</span>' +
          '<div class="hint mono">流水 ' + esc(r.src_trade_no || '—') + '</div>'
        : null) +
      rdCell('原收款方式', r.src_cate
        ? esc(r.src_cate) + '<div class="hint">' + esc(r.src_method || '') + '</div>' : null) +
      '</tr></tbody></table></div>';

    var rfSec = '<div class="od-sec"><div class="od-h"><h3>退款单据</h3></div>' +
      '<table class="rd"><tbody>' +
      '<tr>' + rdCell('退款单号', '<span class="mono">' + esc(r.no) + '</span>') +
      rdCell('退款类别', esc(r.reason_cate || '—')) +
      rdCell('退款方式', esc(r.method) +
        '<div class="hint">按原收款渠道退回，不改收款账户</div>') + '</tr>' +
      '<tr>' + rdCell('试算金额', mn(quoted) +
        '<div class="hint">' + (r.settled && r.quote_apply != null
          ? '申请当时按套餐退改规则算出' : '按套餐退改规则逐人算出') + '</div>') +
      rdCell('实退金额', (adj ? '<b class="bad">' : '<b>') + mn(r.amount) + '</b>' +
        (adj ? '<div class="hint bad">主管调整，与试算差 ' +
          mn(Math.abs((r.amount || 0) - quoted)) + '</div>' : '')) +
      rdCell('退款人数', '<b>' + r.n + '</b> / ' + o.pax + ' 人') + '</tr>' +
      '<tr>' + rdCell('责任归属', r.liability_text || null) +
      rdCell('制单人 / 制单日期', esc(r.created_by_name || '—') +
        '<div class="hint">' + d16(r.created_at) + '</div>') +
      rdCell('退款流水号', r.out_trade_no
        ? '<span class="mono">' + esc(r.out_trade_no) + '</span>' : null) + '</tr>' +
      '<tr>' + rdCell('退款原因', esc(r.reason || '—')) +
      rdCell('审批意见', esc(r.note || '—')) +
      rdCell('审批 / 出账', (r.l1_name ? esc(r.l1_name) + ' ' + d16(r.l1_at) : '待主管审批') +
        '<div class="hint">' + (r.fin_name ? esc(r.fin_name) + ' ' + d16(r.fin_at) : '待财务出账') +
        '</div>') + '</tr>' +
      '</tbody></table></div>';

    /* 办签人明细：整单的人都列出来，本单退的那几个标出来。
       财务出账前必须看清「这一单退的是哪几个人、剩下的人还在办」，
       只列被退的那几个，看不出这张订单是整单退还是退一个人。 */
    var itemSec = '<div class="od-sec"><div class="od-h"><h3>办签人明细</h3>' +
      '<s>本单退 ' + inb.length + ' 人，整单共 ' + d.items.length + ' 人' +
      (r.settled ? '。本单已终结，「规则可退」是按<b>当前</b>状态重算的，只作参考；' +
        '本单实际退了 ' + mn(r.amount) + '' : '') + '</s></div>' +
      '<div class="pad scrollx">' + table(
        ['本单退款', '办签人', '证件号', '办理进度', '签证结果', '人均已收',
         '规则可退', '当前状态', '试算依据'],
        d.items, function (x) {
          return '<td class="nw">' + (x.in_bill
            ? '<span class="tag bad">退款</span>' : '<span class="hint">—</span>') + '</td>' +
            '<td class="nw"><b>' + esc(x.name) + '</b></td>' +
            '<td class="mono nw">' + esc(x.id_type) + ' ' + esc(x.id_no || '—') + '</td>' +
            '<td class="nw">' + esc(x.progress_text) + '</td>' +
            '<td class="nw">' + esc(x.result || '—') + '</td>' +
            '<td class="num nw">' + mn(x.paid) + '</td>' +
            '<td class="num nw"><b>' + mn(x.refundable) + '</b></td>' +
            '<td class="nw">' + ({ normal: '办理中', refunded: '已退款',
              cancelled: '已取消' }[x.state] || x.state) + '</td>' +
            '<td style="min-width:200px">' + esc(x.rule || '—') + '</td>';
        }, '该订单没有办签人') + '</div></div>';

    var logSec = '<div class="od-sec"><div class="od-h"><h3>审批与出账日志</h3></div>' +
      '<div class="pad">' + table(['序号', '动作', '操作人', '时间', '说明'],
        d.logs, function (e) {
          return '<td class="num">' + e.i + '</td><td class="nw"><b>' + esc(e.status) + '</b></td>' +
            '<td class="nw">' + esc(e.actor || '系统') + '</td>' +
            '<td class="nw">' + d16(e.at) + '</td>' +
            '<td>' + esc(e.note || '—') + '</td>';
        }, '暂无数据') + '</div></div>';

    var btns = ['<button class="btn" data-rf="back">返回</button>'];
    if (d.can_approve) {
      btns.push('<button class="btn" data-rf="reject">驳回</button>');
      btns.push('<button class="btn r" data-rf="approve">批准退款</button>');
    } else if (d.can_pay) {
      btns.push('<button class="btn r" data-rf="pay">原路退回出账</button>');
    } else {
      btns.push('<span class="hint" style="align-self:center">' +
        (r.status === 'applying' ? '待签证主管判定责任并批准，主管身份可操作'
          : r.status === 'l1' ? '待总部财务原路退回出账，财务身份可操作'
            : '本单已终结，只读') + '</span>');
    }

    m.innerHTML = pageH('退款单详情',
      '退款单从申请到出账的全过程都在这一页：谁申请的、按什么规则算出多少、' +
      '主管把实退调成了多少、责任算在谁头上、财务哪天原路退回的。' +
      '<b>已递交使领馆的签证费不可退</b>，只退服务费，逐人的判定依据在「试算依据」列。') + head +
      ordSec + rfSec + itemSec + logSec +
      '<div class="od-bar">' +
      '<div class="bar-ctx">退款单 <span class="mono">' + esc(r.no) + '</span>' +
      '<s>' + mn(r.amount) + ' · ' + esc(r.status_text) + ' · ' + r.n + ' 人 · 订单 ' +
      esc(o.no) + '</s></div>' +
      '<div class="bar-act">' + btns.join('') + '</div></div>';

    $$('[data-rf]', m).forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.rf;
        if (k === 'back') { go('refund'); return; }
        if (k === 'ord') { go('odetail', o.no); return; }
        if (k === 'approve') {
          return ask('批准退款 ' + r.no, [
            { k: 'amount', label: '实际退款金额（元）', required: true, value: r.amount,
              hint: '默认取规则试算值 ' + mn(quoted) + '，可调整' },
            { k: 'liability', label: '责任归属', type: 'select', value: r.liability,
              options: (d.liabilities || []).map(function (x) { return { v: x.v, t: x.t }; }) },
            { k: 'note', label: '审批意见', type: 'textarea', value: r.note || '' }
          ], '批准', function (f) {
            return api('/refund/approve', { no: r.no, action: 'ok',
              amount: f.amount, liability: f.liability, note: f.note });
          }).then(function () { toast('已批准，转财务出账'); reload(); }).catch(function () { });
        }
        if (k === 'reject') {
          return ask('驳回退款 ' + r.no,
            [{ k: 'note', label: '驳回理由', type: 'textarea', required: true }], '驳回')
            .then(function (f) {
              return api('/refund/approve', { no: r.no, action: 'reject', note: f.note });
            })
            .then(function () { toast('已驳回'); reload(); }).catch(function () { });
        }
        if (k === 'pay') {
          return confirmBox('退款出账 ' + r.no,
            '将生成一笔出账流水并把本单的 ' + inb.length +
            ' 位办签人标记为已退款；若订单下所有办签人均已退款，订单状态转为「已退款」。' +
            '该动作不可撤销。', '确认出账')
            .then(function () { return api('/refund/pay', { no: r.no }); })
            .then(function () { toast('已出账'); reload(); }).catch(function () { });
        }
      };
    });
  });
};
