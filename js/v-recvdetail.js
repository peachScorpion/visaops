/* ============================================================
   收款单详情 · 结构对齐众信「财务管理 › 业务资金管理 › 收款管理 › 单据详情」
   订单信息 + 本次收款 + 水单 + 财务审核日志 + 底部四个动作
   （返回 / 未到账 / 水单到账 / 有误 / 生成凭证）。
   唐美芳 2026-08-31：「正常财务在 uom 要操作审核、凭证生成等操作的，单据详情我给你也截图」。
   财务身份可操作，运营 / 主管 / 门店进来只读。
   ============================================================ */

function rdCell(label, val) {
  return '<th class="rd-l">' + esc(label) + '</th><td class="rd-v">' +
    (val === 0 || val ? val : '<span class="od-na">—</span>') + '</td>';
}

VIEWS['fin:recvdetail'] = VIEWS['ops:recvdetail'] = VIEWS['lead:recvdetail'] =
VIEWS['csp:recvdetail'] = function (m, no) {
  if (!no) { m.innerHTML = '<div class="empty">缺少收款单号</div>'; return; }
  return api('/fin/receipt', { no: no }).then(function (d) {
    var o = d.ord, p = d.pay, op = d.can_op;
    var A = { wait: ['待审核', 'warn'], pass: ['已审核', 'ok'], error: ['有误', 'bad'] };
    var a = A[p.audit_status] || A.wait;
    var mn = function (v) { return '¥' + money(v || 0); };
    var diff = p.arrive_amount != null && Math.abs(p.arrive_amount - p.amount) > 0.009;

    var head = '<div class="od-top"><div class="od-top-h"><div>' +
      '<div class="od-no">收款单号：<b>' + esc(p.no) + '</b>' +
      '<span class="tag ' + a[1] + '">' + a[0] + '</span>' +
      (p.confirmed ? '<span class="tag ok">已确认到账</span>' : '') +
      (p.voucher_no ? '<span class="tag info">已生成凭证</span>' : '') + '</div>' +
      '<div class="od-pn">' + mn(p.amount) + '</div>' +
      '<div class="od-pm">' + esc(p.cate || '') + ' · ' + esc(p.method || '') +
      ' · 订单 ' + esc(o.no) + '</div></div>' +
      '<button class="btn" data-rd="back">返回列表</button></div></div>';

    var ordSec = '<div class="od-sec"><div class="od-h"><h3>订单信息</h3></div>' +
      '<table class="rd"><tbody>' +
      '<tr>' + rdCell('订单编号', '<a class="lk" data-rd="ord">' + esc(o.no) + '</a>') +
      rdCell('下单日期', d16(o.created_at)) +
      rdCell('产品名称', esc(o.product)) + '</tr>' +
      '<tr>' + rdCell('销售公司', esc(o.sale_org)) +
      rdCell('渠道名称', esc(o.channel_name)) +
      rdCell('销售', esc(o.sale)) + '</tr>' +
      '<tr>' + rdCell('服务开始日期', o.svc_start) +
      rdCell('服务结束日期', o.svc_end) +
      rdCell('客户信息', esc(o.cust_type)) + '</tr>' +
      '</tbody></table></div>';

    var paySec = '<div class="od-sec"><div class="od-h"><h3>本次收款</h3></div>' +
      '<table class="rd"><tbody>' +
      '<tr>' + rdCell('收款单号', '<span class="mono">' + esc(p.no) + '</span>') +
      rdCell('款项', esc(p.item)) + rdCell('收款类别', esc(p.cate)) + '</tr>' +
      '<tr>' + rdCell('收款渠道', esc(p.channel_name)) +
      rdCell('收款方式', esc(p.method)) + rdCell('交款账户类型', esc(p.acct_type)) + '</tr>' +
      '<tr>' + rdCell('收款金额', '<b>' + mn(p.amount) + '</b>') +
      rdCell('手续费', mn(p.fee)) +
      rdCell('净额', '<b>' + mn(p.net) + '</b>') + '</tr>' +
      '<tr>' + rdCell('到账金额', (diff ? '<b class="bad">' : '<b>') +
        mn(p.arrive_amount != null ? p.arrive_amount : p.amount) + '</b>' +
        (diff ? '<div class="hint bad">与收款金额不符</div>' : '')) +
      rdCell('付款日期', p.pay_date) + rdCell('到账日期', p.arrive_date) + '</tr>' +
      '<tr>' + rdCell('第三方流水号 / 参考号', '<span class="mono">' + esc(p.trade_no || '—') + '</span>') +
      rdCell('账号', '<span class="mono">' + esc(p.acct_no || '—') + '</span>') +
      rdCell('付款人名称', esc(p.payer_name)) + '</tr>' +
      '<tr>' + rdCell('销售备注', esc(p.sale_note || '—')) +
      rdCell('财务备注', p.fin_note ? '<span class="bad">' + esc(p.fin_note) + '</span>' : '—') +
      rdCell('凭证号', p.voucher_no ? '<span class="mono">' + esc(p.voucher_no) + '</span>' : null) +
      '</tr></tbody></table></div>';

    var imgSec = '<div class="od-sec"><div class="od-h"><h3>水单</h3></div>' +
      '<div class="pad">' + (p.receipt_img ?
        '<a class="lk rd-img" data-rd="img">' + esc(p.receipt_img) + '</a>' :
        '<div class="empty">客户尚未上传水单（银行回单）</div>') + '</div></div>';

    var logSec = '<div class="od-sec"><div class="od-h"><h3>财务审核日志</h3></div>' +
      '<div class="pad">' + table(['序号', '审核状态', '审核人', '审核日期', '审核意见'],
        d.logs, function (e) {
          return '<td class="num">' + e.i + '</td><td class="nw"><b>' + esc(e.status) + '</b></td>' +
            '<td class="nw">' + esc(e.actor || '系统') + '</td>' +
            '<td class="nw">' + d16(e.at) + '</td>' +
            '<td>' + esc(e.note || '—') + '</td>';
        }, '暂无数据') + '</div></div>';

    /* 底部动作，照众信那排：返回 / 未到账 / 水单到账 / 有误 / 生成凭证 */
    var btns = ['<button class="btn" data-rd="back">返回</button>'];
    if (op) {
      if (!p.confirmed) {
        btns.push('<button class="btn" data-rd="noarrive">未到账</button>');
        btns.push('<button class="btn r" data-rd="confirm">水单到账</button>');
        btns.push('<button class="btn" data-rd="error">有误</button>');
      }
      if (p.audit_status === 'error')
        btns.push('<button class="btn" data-rd="revert">撤回有误</button>');
      if (p.audit_status === 'pass' && !p.voucher_no)
        btns.push('<button class="btn r" data-rd="voucher">生成凭证</button>');
    } else {
      btns.push('<span class="hint" style="align-self:center">' +
        '只读视图，审核与生成凭证由财务身份执行</span>');
    }

    m.innerHTML = pageH('收款单详情', '收款单号 ' + p.no) + head +
      ordSec + paySec + imgSec + logSec +
      /* 通栏吸底操作条：左边说清楚在处理哪张单、多少钱、审到哪一步，右边才是动作 */
      '<div class="od-bar">' +
      '<div class="bar-ctx">收款单 <span class="mono">' + esc(p.no) + '</span>' +
      '<s>' + mn(p.amount) + ' · ' + a[0] +
      (p.confirmed ? ' · 已确认到账' : '') + ' · 订单 ' + esc(o.no) + '</s></div>' +
      '<div class="bar-act">' + btns.join('') + '</div></div>';

    $$('[data-rd]', m).forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.rd;
        if (k === 'back') { go('recv'); return; }
        if (k === 'ord') { go('odetail', o.no); return; }
        if (k === 'img') {
          confirmBox('水单 · ' + p.no,
            '<div class="rd-ph"><i>' + esc(p.receipt_img) + '</i>' +
            '<s>演示环境不含真实回单图片。生产环境这里是客户或门店上传的银行回单，' +
            '财务点开比对流水号与金额后再点「水单到账」。</s></div>', '知道了')
            .catch(function () { });
          return;
        }
        if (k === 'confirm') {
          return confirmBox('确认水单到账',
            '确认后将<b>立即生成签证工单并派给操作专员</b>，同时对供应商挂应付账款。该动作不可撤销。',
            '确认到账')
            .then(function () { return api('/fin/confirm', { pay_id: p.pay_id }); })
            .then(function (r) { toast(r.msg + '：' + r.wo.join('、')); reload(); }).catch(fail);
        }
        if (k === 'noarrive') {
          return confirmBox('标记未到账',
            '用于水单已交但银行侧尚未入账的情况。单据<b>留在待审核</b>，到账金额清零，不确认到账。', '标记未到账')
            .then(function () { return api('/fin/audit', { pay_id: p.pay_id, action: 'noarrive' }); })
            .then(function (r) { toast(r.msg); reload(); }).catch(fail);
        }
        if (k === 'error') {
          return confirmBox('标记为有误',
            '适用于到账金额与收款金额不符、流水号不一致等情形。标记后不确认到账，退回销售核实。', '标记有误')
            .then(function () { return api('/fin/audit', { pay_id: p.pay_id, action: 'error' }); })
            .then(function (r) { toast(r.msg); reload(); }).catch(fail);
        }
        if (k === 'revert') {
          return api('/fin/audit', { pay_id: p.pay_id, action: 'revert' })
            .then(function (r) { toast(r.msg); reload(); }).catch(fail);
        }
        if (k === 'voucher') {
          return api('/fin/voucher', { pay_id: p.pay_id })
            .then(function (r) { toast(r.msg); reload(); }).catch(fail);
        }
      };
    });
  });
};
