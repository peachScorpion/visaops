/* ============================================================
   订单详情 · 三端共用（UOM / CSP / UBK，客户端另有 H5 版）
   结构对齐众信「销售管理 › 订单 › 订单详情」：
     顶部产品条 + 关键信息行 + 四个页签（订单信息 / 联系人信息 / 办签人信息 / 交易信息）
     + 右上「订单日志」+ 底部操作条。
   唐美芳 2026-08-31：「ubk、uom、csp 都需要有」「退款操作、取消订单、操作日志这些操作都需要增加上」
   「对于 uom 和 csp 所有的内容和字段最好是尽量保持一致，但对于特殊的操作，肯定销售是没有权限的，
     比如送签处理，这个肯定是送签人员来操作，但销售可查看详情」。
   ============================================================ */

function odKV(label, val, span) {
  return '<div class="od-kv' + (span ? ' sp' + span : '') + '"><i>' + esc(label) + '</i><b>' +
    (val === 0 || val ? val : '<span class="od-na">—</span>') + '</b></div>';
}

function odSec(title, body, right) {
  return '<div class="od-sec"><div class="od-h"><h3>' + esc(title) + '</h3>' +
    (right || '') + '</div>' + body + '</div>';
}

VIEWS['uom:odetail'] = VIEWS['csp:odetail'] = VIEWS['ubk:odetail'] =
VIEWS['ops:odetail'] = VIEWS['lead:odetail'] = VIEWS['fin:odetail'] = function (m, no) {
  if (!no) { m.innerHTML = '<div class="empty">缺少订单号</div>'; return; }
  return api('/order/detail', { no: no }).then(function (d) {
    var o = d.ord, p = d.product, t = d.trade || {};
    var STG = { created: 'warn', paid: 'info',
                done: 'ok', cancelled: 'plain', refunded: 'bad' };

    /* ---- 顶部：产品条 + 关键信息 ----
       2026-09-08 按唐美芳给的众信「酒店订单详情」截图重排：
         订单编号行（+ 状态标签 + 订单日志）→ 产品名 + 属性标签 → 供应商与收件地址
         → 三列关键信息网格 → 整行的政策段（取消与退款 / 受理与时效 / 发票信息）。
       酒店的字段按业务替换：
         入离日期 → 预计出行日期；入住晚数 → 办签人数；房型 → 套餐；
         床型 → 有效期与停留；房间数量 → 办理时长；早餐 → 面签与指纹要求；
         取消政策 → 取消与退款政策；确认政策 → 受理与时效；发票信息照旧。 */
    var head =
      '<div class="od-top">' +
      '<div class="od-top-h"><div>' +
      '<div class="od-no">订单编号：<b>' + esc(o.no) + '</b>' +
      '<span class="tag ' + (STG[o.status] || 'plain') + '">' + esc(o.status_text) + '</span>' +
      '<span class="tag ' + (WORK_TAG[o.work_status] || 'plain') + '">' +
      esc(o.work_status || '未完成') + '</span>' +
      '<span class="tag ' + (PAY_ST_TAG[(d.sup_view ? o.recv_state : o.pay_state) || 'unpaid'] || 'plain') +
      '">' + esc((d.sup_view ? RECV_ST_CN : PAY_ST_CN)[
        (d.sup_view ? o.recv_state : o.pay_state) || 'unpaid']) + '</span>' +
      (o.info_state === 'wait'
        ? '<span class="tag warn">待录入客户签证资料' +
          (o.info_left ? ' · ' + esc(o.info_left) : '') + '</span>'
        : o.info_state === 'expired'
          ? '<span class="tag bad">资料录入超时</span>' : '') + '</div>' +
      /* 产品名 + 属性标签（酒店那行是星级与「高档型」；签证换成签证类型与领区） */
      '<div class="od-pn">' + esc(p.name) +
      (p.visa_type ? '<em class="od-lv">' + esc(p.visa_type) + '</em>' : '') +
      (p.submit_city ? '<em class="od-lv plain">' + esc(p.submit_city) + '</em>' : '') + '</div>' +
      /* 酒店这一行是地址 + 电话；签证对应「供应商 + 材料收件地址」——
         客人把护照寄到哪，是这一单最要紧的一条地址。 */
      '<div class="od-pm">供应商：' + esc(p.supplier || p.supplier_short || '—') +
      (p.code ? '　产品编码：<span class="mono">' + esc(p.code) + '</span>' : '') +
      (o.third_no ? '　第三方订单号：<span class="mono">' + esc(o.third_no) + '</span>' : '') +
      '</div></div>' +
      '<button class="btn" data-od="log">订单日志</button></div>' +
      '<div class="od-fast">' +
      odKV('预计出行日期', o.depart_date) +
      odKV('办签人数', o.pax + ' 人') +
      odKV('套餐', esc(p.pkg)) +
      odKV('有效期与停留', esc((p.valid ? p.valid + ' · ' : '') + '可停留 ' + (p.stay_text || '—'))) +
      odKV('办理时长', p.lead_days ? p.lead_days + ' 个工作日' : null) +
      odKV('入境次数', esc(ENTRIES[p.entries] || p.entries || '')) +
      odKV('面签与指纹', (p.need_interview ? '需本人面签' : '免面签') + ' · ' +
        (p.need_fingerprint ? '需采指纹' : '免采指纹')) +
      odKV('资料录入', o.info_done_at
        ? '<span class="tag ok">已录齐</span>'
        : '<span class="tag warn">待录入</span>') +
      odKV('资料截止', o.info_deadline
        ? d16(o.info_deadline) + (o.info_left ? '（' + esc(o.info_left) + '）' : '')
        : null) +
      '</div>' +
      /* 整行政策段：酒店是「取消政策 / 确认政策 / 发票信息」三条，签证一一对应。
         内容全部取自这一单真实存在的口径，没有的就说没有，不编条款。 */
      '<div class="od-pol">' +
      '<div><i>取消与退款</i><s>' +
      (o.status === 'created'
        ? '订单支付前可直接取消。'
        : '订单已支付，取消需提交退款申请，按已产生的官费与服务成本核减后退还余款。') +
      '拒签按办理进度退还未发生费用；签证费为使领馆收取的官方费用，按各国规定不予退还。</s></div>' +
      '<div><i>受理与时效</i><s>' + esc(p.submit_city || '—') + '领区受理，' +
      '本套餐办理时长约 ' + (p.lead_days || '—') + ' 个工作日（不含使领馆节假日与行政审查）。' +
      '提交、缴费、抢号、递交、采指纹由持证专员在使领馆官方渠道人工办理。</s></div>' +
      '<div><i>发票信息</i><s>发票由 ' + esc(o.invoice_entity || '众信旅游集团') +
      ' 开具，结算主体 ' + esc(o.settle_entity || '—') +
      '；开票在众信财务系统中完成，可联系服务销售人员申请。</s></div>' +
      '</div></div>';

    /* ---- 页签 1：订单信息（众信是三列多行）----
       UOM 与 CSP 字段完全一致；UBK 供应商只给履约需要的字段，
       平台的销售人员 / 销售公司 / 业务来源 / 客户机构属于渠道商业信息，不下发给供应商。 */
    var base = odSec('订单信息', '<div class="od-grid bd">' +
      odKV('订单编号', esc(o.no)) + odKV('下单日期', d16(o.created_at)) +
      odKV('平台订单状态', '<span class="tag ' + (STG[o.status] || 'plain') + '">' + esc(o.status_text) + '</span>') +
      (d.sup_view ? '' :
        odKV('业务来源', esc(o.biz_source)) +
        /* 众信那张有「活动来源」，签证没有活动/促销体系，留格写「—」不编内容 */
        odKV('活动来源', null) +
        odKV('下单客户端', esc(o.client))) +
      /* 酒店的「供应商订单状态」＝供应商那侧受理到哪一步；签证对应办签状态 */
      odKV('供应商订单状态', '<span class="tag ' + (WORK_TAG[o.work_status] || 'plain') + '">' +
        esc(o.work_status || '未完成') + '</span>') +
      (d.sup_view ? '' :
        odKV('销售渠道', esc(o.channel_text)) + odKV('服务销售人员', esc(o.sale_name))) +
      (d.sup_view ? '' :
        odKV('服务销售渠道', esc(o.channel_text)) +
        odKV('服务销售公司', esc(o.sale_org)) +
        odKV('客户类型', esc(o.cust_type))) +
      (d.sup_view ? '' : odKV('客户名称', esc(o.cust_name))) +
      odKV('预订人数', o.pax + ' 人') +
      /* 采购这一组：签证的「采购」是平台向供应商采购。采购公司＝结算主体（真实字段），
         采购人 / 采购部门系统没有维护，留「—」，不拿建单人顶上去。 */
      (d.sup_view ? '' : odKV('采购人', null) + odKV('采购部门', null) +
        odKV('采购公司', esc(o.settle_entity))) +
      (d.sup_view ? '' :
        odKV('订单合同状态', '<span class="tag warn">' + esc(o.contract_status) + '</span>')) +
      odKV('供应商', esc(p.supplier || '—')) +
      odKV('供应商销售人员', null) +
      /* 众信的「意向单」是销售线索转来的单，签证暂无线索体系 */
      (d.sup_view ? '' : odKV('意向单', null)) +
      odKV('第三方订单号', '<span class="mono">' + esc(o.third_no) + '</span>') +
      odKV(d.sup_view ? '收款状态' : '支付状态',
        '<span class="tag ' + (PAY_ST_TAG[(d.sup_view ? o.recv_state : o.pay_state) || 'unpaid'] || 'plain') +
        '">' + esc((d.sup_view ? RECV_ST_CN : PAY_ST_CN)[
          (d.sup_view ? o.recv_state : o.pay_state) || 'unpaid']) + '</span>') +
      (d.sup_view ? '' :
        odKV('财务确认收款', o.gate ? '<span class="tag ok">已确认到账</span>'
          : gateTag(o) || '<span class="od-na">—</span>')) +
      (d.sup_view ? '' :
        odKV('建单人', esc(o.created_by_name)) +
        odKV('最近操作', (o.updated_by_name ? esc(o.updated_by_name) + ' · ' + d16(o.updated_at) : null))) +
      '</div>' +
      /* 订单备注：整行一格，跟众信那张最后一行一样。系统本期没有备注字段，
         写明它由销售在订单日志里补记，不做一个存不进去的输入框。 */
      '<div class="od-grid bd one">' +
      odKV('订单备注', '<span class="od-na">—　销售备注请在「订单日志」中补记</span>') + '</div>' +
      (p.book_notice ? '<div class="od-notice"><i>预订须知</i><div>' +
        richView(p.book_notice) + '</div></div>' : ''));

    /* ---- 页签 2：联系人信息 ---- */
    /* PRD 4.8.2 / 4.13.3 要求这块同时列「订单联系人」与「收货人」——
       签证办完要把护照原件寄回客户，收货地址是履约必需信息，不能只有联系人。 */
    var contact = odSec('联系人信息',
      '<div class="pad">' + table(['联系人', '联系电话', '电子邮箱'], [d.contact], function (x) {
        return '<td>' + esc(x.name || '—') + '</td><td class="mono">' + esc(x.phone || '—') +
          '</td><td>' + esc(x.email || '—') + '</td>';
      }, '未填写联系人') + '</div>') +
      odSec('收货人信息（资料返还）',
        '<div class="pad">' + table(['收货人', '联系电话', '收货地址'],
          d.receiver && d.receiver.name ? [d.receiver] : [], function (x) {
            return '<td class="nw">' + esc(x.name || '—') + '</td>' +
              '<td class="mono nw">' + esc(x.phone || '—') + '</td>' +
              '<td>' + esc(x.addr || '—') + '</td>';
          }, '未填写收货地址，资料返还前需补充') + '</div>',
        /* 销售可以就地补：跟录入客人资料一样，都是送签前要补齐的东西 */
        (d.view === 'csp' && o.status !== 'cancelled' && o.status !== 'refunded'
          ? '<button class="btn sm" data-recvaddr>' +
            (d.receiver && d.receiver.name ? '修改收货地址' : '填写收货地址') + '</button>' : ''));

    /* ---- 页签 3：办签人信息（对应众信订单详情里的「出行人信息」）----
       众信那张表右侧是「查看 / 编辑」，编辑就地弹窗改。签证订单同理：
       客人签证资料的录入与修改都收在这里，不再另开一个页面
       （唐美芳 2026-09-01：「客人签证资料的调整应该放到订单详情里，
       这样操作就不散着了，还得每个按钮一个页面」）。
       销售与专员都能改——付款前销售要录，付款后专员发现证件号写错也要能改；
       供应商只读。 */
    var canOp = d.view === 'uom' || d.view === 'ops';   // 平台管理员＝ UOM 超级管理员
    var canEditInfo = !d.sup_view &&
      (o.status === 'created' || o.status === 'paid');
    var apsTitle = '办签人信息（' + d.applicants.length + ' 人）';
    var infoLeft = d.applicants.filter(function (a) { return !a.info_done; }).length;
    var aps = odSec(apsTitle,
      /* 「资料录齐前不能收款」2026-09-02 起已不成立——收款不再被资料卡住。
         提示照留，但要说清楚真正的后果：未付款的单会超时取消，付了款的单
         资料不齐排不进送签批次。 */
      (canEditInfo && infoLeft
        ? '<div class="note w" style="margin:0 14px 12px"><b>还有 ' + infoLeft +
          ' 位办签人的签证资料没录齐</b>' +
          '<div class="hint">' +
          (o.status === 'created'
            ? '未付款的订单，下单后 ' + (o.info_hours || 24) + ' 小时内录不齐会被系统自动取消。'
            : '资料齐备后工单方可编入送签批次，不影响已完成的收款。') +
          '点行末「录入资料」逐位补齐，官方申请表点「代填申请表」。</div></div>'
        : '') +
      '<div class="pad scrollx">' + table(
        /* 列按众信那张办签人表的密度收敛：这里放客人自身的信息 + 资料与进度 + 操作，
           办理侧的细节（签证结果 / 领区 / 面签时间 / 承办专员 / SLA）收进「查看」弹窗，
           否则 14 列横着排，操作按钮被挤出屏幕，得横向滚动才点得到。 */
        /* 「操作」不再占一列：按钮挪到每条记录下面独占一行（table 的 actFn），
           加上「代填申请表」后这一列有 5 个按钮，横着排会把表撑出 556px 溢出，
           按钮直接被挤到屏幕外点不到（唐美芳给过众信那张表的截图，也是这个排法）。 */
        ['姓名', '性别', '出生日期', '证件类型 / 号码', '证件有效期', '签发地 / 国籍',
          '手机号', '适用人群', '资料状态', '办签进度'],
        d.applicants, function (a) {
          return '<td class="nw"><b>' + esc(a.name) + '</b>' +
            (a.name_en ? '<div class="hint">' + esc(a.name_en) + '</div>' : '') + '</td>' +
            '<td class="nw">' + esc(a.sex || '—') + '</td>' +
            '<td class="nw">' + esc(a.birth || '—') + '</td>' +
            '<td class="nw">' + esc(a.id_type || '护照') +
            '<div class="hint mono">' + esc(a.id_no || '—') + '</div></td>' +
            '<td class="nw">' + esc(a.id_expiry || '—') + '</td>' +
            '<td class="nw">' + esc(a.id_place || '—') +
            '<div class="hint">' + esc(a.nation || '—') + '</div></td>' +
            '<td class="mono nw">' + esc(a.phone || '—') + '</td>' +
            '<td class="nw">' + esc(a.crowd || '—') + '</td>' +
            '<td class="nw">' + (a.info_done
              ? '<span class="tag ok">已录入</span>'
              : '<span class="tag warn">待录入</span>' +
                (a.missing && a.missing.length
                  ? '<div class="hint">缺 ' + esc(a.missing.join('、')) + '</div>' : '')) +
            '</td>' +
            '<td class="nw"><span class="tag info">' + esc(a.progress_text) + '</span>' +
            (a.result ? '<div class="hint">' + esc(a.result) + '</div>' : '') +
            (a.state === 'refunded' ? '<div class="hint bad">已退款</div>' : '') + '</td>' +
            '';
        }, '该订单还没有办签人',
        /* 每条记录下面独占一行的操作区：看进度 / 材料 / 录基础资料 / 代填官方申请表 /
           发链接让客人自己填 / 送签处理。与有米订单详情的动作一一对应
           （唐美芳 2026-09-02：「尽量保证 csp 和有米的功能操作一致的哈」）。 */
        function (a) {
          return '<div class="btns">' +
            '<button class="btn sm g" data-apv="' + a.id + '">查看进度</button>' +
            /* 材料按人看，入口收在这张表里——列表行上原来一人一个按钮，
               人一多就把订单级操作挤没了（唐美芳 2026-09-01） */
            (d.view === 'csp' && o.status !== 'created' && a.state !== 'refunded'
              ? '<button class="btn sm g" data-apmat="' + a.id + '">材料</button>' : '') +
            (canEditInfo
              ? '<button class="btn sm' + (a.info_done ? '' : ' r') + '" data-apedit="' + a.id +
                '">' + (a.info_done ? '编辑资料' : '录入资料') + '</button>' : '') +
            /* 「录入资料」只有 11 格送签基础信息，真正要代填的是官方申请表那几十格。
               订单详情里原来没有这个入口，销售在 CSP 上没法帮客人代填
               （唐美芳 2026-09-02：「点录入资料，为什么资料特别少，
               销售如何在 csp 帮客人代填呢」）。按钮上直接带进度，
               不用点进去才知道还差多少。 */
            /* 按钮上给「还差几道客户必答题」，不是整表 filled/fillable——
               整表里那些没带出来的格子归专员补，销售看了会误判表没填完。 */
            (a.form
              ? (canEditInfo
                ? '<button class="btn sm" data-apform="' + a.id + '">' +
                  /* 统一叫「填申请表」：进去之后既能自己填、也能一键发给客人填，
                     不再按动作分两个按钮两种叫法（2026-09-08 批 1） */
                  (a.form.ask_left ? '填申请表 · 剩 ' + a.form.ask_left + ' 题'
                                   : '申请表 · ' + esc(a.form.status_text || '已填')) +
                  '</button>'
                /* 订单已完成 / 已取消时不能再改，但售后核对还要看得到已填内容
                   （唐美芳 2026-09-08 问「办签人那里为什么没有帮客人代写」——
                   她看的那张单不是「待付款 / 已付款」，整组按钮都被 canEditInfo 收掉了）。
                   这里补一个只读入口。 */
                : '<button class="btn sm" data-apformro="' + a.id + '">查看申请表</button>')
              : '') +
            /* 「发给客人填」2026-09-08 收进申请表页（批 1：代填与发给客人填合成一个页面），
               列表行上不再单独占按钮——两个动作本来就是同一件事的两条路径。 */
            (canOp ? '<button class="btn sm" data-ap="' + a.id + '">送签处理</button>' : '') +
            '</div>';
        }) + '</div>',
      '<button class="btn sm" data-apcsv>导出名单</button>');

    /* ---- 页签 4：交易信息 ----
       众信这一块下面还有一排二级页签（交易信息 / 资金信息 / 合同信息 / 资料信息 /
       开票信息 / 销售备注…）。签证订单用得上的是其中五个，按同样的形式分开，
       不再把明细、单据、退款审批堆成一长条（唐美芳 2026-09-01：按众信的结构调整）。
       没有内容的页签照样保留，里面写清「本期不做处理」，不做假数据。 */
    var money2 = function (v) { return '¥' + money(v || 0); };

    /* 交易明细按众信现有系统重做（唐美芳 2026-09-08 给了截图：
       「订单详情里交易信息模块尽量和众信现有的系统保持一致」）。
       结构 = 审批信息表 + 交易明细表（左销售金额 / 右结算金额，行：报名 / 改价 / 优惠 / 合计）。
       签证没有的行按业务替换：
         · 报名 → 套餐 × 人数（酒店那边是房间 × 间夜）
         · 改价 → 退款冲减；本系统的改价只发生在下单前，成交后调价一律走退款
         · 优惠 → 系统没有优惠券 / 协议优惠体系，留行占位并写「—」，不编数字 */
    var apRows = (d.refunds || []).map(function (r) {
      var S3 = { applying: 'warn', l1: 'info', done: 'ok', reject: 'bad' };
      /* 退款单接口没下发发起人（退款台账里才有），这里不编，留「—」 */
      return '<td class="nw">' + esc(r.by_name || '—') + '</td>' +
        '<td class="nw">' + (d16(r.created_at) || '—') + '</td>' +
        '<td class="nw">退款申请</td>' +
        '<td>' + esc(r.no) + '　' + money2(r.amount) + '　' + esc(r.reason || '') + '</td>' +
        '<td class="nw"><span class="tag ' + (S3[r.status] || 'plain') + '">' +
          esc(r.status_text) + '</span></td>' +
        '<td class="nw">' + esc(r.status === 'applying' ? '主管' :
          (r.status === 'l1' ? '财务' : '—')) + '</td>' +
        /* 退款单据现在归在「资金信息」页签下（众信那排没有独立的退款审批） */
        '<td class="nw"><a class="lnk" data-odtr2="fund">查看</a></td>';
    });
    var tradeApproval =
      '<div class="od-th"><b>审批信息</b></div>' +
      '<div class="pad scrollx">' + table(
        ['发起人', '发起时间', '审批名称', '审批信息', '审批状态', '当前审批人', '操作'],
        d.refunds || [], function (r) { return apRows[(d.refunds || []).indexOf(r)]; },
        '暂无数据') + '</div>';

    var pax = o.pax || 1;
    var saleUnit = t.sale ? t.sale.unit : 0;
    var settleUnit = t.settle ? Math.round(t.settle.settle_amount / pax * 100) / 100 : 0;
    function tRow(label, sale, settle, cls) {
      return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th>' + label + '</th>' +
        '<td>' + sale + '</td><td>' + settle + '</td></tr>';
    }
    var tradeDetail = (t.sale || t.settle)
      ? tradeApproval +
        '<div class="od-th"><b>交易明细</b>' +
        '<button class="btn sm" data-odchg>查看变更明细</button></div>' +
        '<div class="pad scrollx"><table class="od-tt">' +
        '<thead><tr><th></th><th>销售金额</th><th>结算金额</th></tr></thead><tbody>' +
        tRow('报名',
          t.sale ? esc(o.pkg || '套餐') + '：' + money2(saleUnit) + ' * ' + pax : '—',
          t.settle ? esc(o.pkg || '套餐') + '：' + money2(settleUnit) + ' * ' + pax : '—') +
        tRow('改价',
          (t.sale && t.sale.refunded)
            ? '<b class="r">退款：− ' + money2(t.sale.refunded) + '</b>' : '—',
          '—') +
        tRow('优惠', '—', '—') +
        tRow('合计',
          (t.sale
            ? '<div class="od-tt-k"><i>合同金额</i><b>' + money2(t.sale.amount) + '</b></div>' +
              '<div class="od-tt-k"><i>已开票金额</i><b>' + money2(t.sale.invoiced) + '</b></div>' +
              '<div class="od-tt-k"><i>应收金额</i><b>' +
                money2(t.sale.amount - (t.sale.refunded || 0)) + '</b></div>' +
              '<div class="od-tt-k"><i>实收金额</i><b>' + money2(t.sale.recv) + '</b></div>' +
              (t.sale.recv_wait ? '<div class="od-tt-k"><i>待审核收款</i><b class="w">' +
                money2(t.sale.recv_wait) + '</b></div>' : '') +
              '<div class="od-tt-k"><i>待收金额</i><b class="' + (t.sale.owe ? 'r' : '') + '">' +
                money2(t.sale.owe) + '</b></div>'
            : '—'),
          (t.settle
            ? '<div class="od-tt-k"><i>结算金额</i><b>' + money2(t.settle.settle_amount) + '</b></div>' +
              '<div class="od-tt-k"><i>协议优惠</i><b>—</b></div>' +
              '<div class="od-tt-k"><i>成本金额</i><b>' + money2(t.settle.settle_amount) + '</b></div>' +
              '<div class="od-tt-k"><i>实付金额</i><b>' + money2(t.settle.payable_paid) + '</b></div>' +
              (t.gross != null ? '<div class="od-tt-k"><i>毛利</i><b class="g">' + money2(t.gross) +
                '（' + (t.sale && t.sale.amount ? Math.round(t.gross / t.sale.amount * 100) : 0) +
                '%）</b></div>' : '')
            : '—'), 'tot') +
        '</tbody></table>' +
        '<div class="od-tt-ft"><a class="lnk" data-odtr2="fund">费用明细 ›</a></div></div>'
      : '<div class="pad"><div class="empty">暂无交易明细</div></div>';

    var tradeRecv = '<div class="pad scrollx">' + table(
      ['收款单号', '收款类别 / 方式', '款项', '收款金额', '到账金额', '审核状态', '交易流水号', '制单时间'],
      d.pays || [], function (x) {
        var A = { wait: ['待审核', 'warn'], pass: ['已审核', 'ok'], error: ['有误', 'bad'] };
        var a = A[x.audit_status] || A.wait;
        return '<td class="mono nw"><b>' + esc(x.no || '—') + '</b></td>' +
          '<td class="nw">' + esc(x.cate || '—') + '<div class="hint">' + esc(x.method || '') + '</div></td>' +
          '<td class="nw">' + esc(x.item || '团款') + '</td>' +
          '<td class="num nw"><b>' + money2(x.amount) + '</b></td>' +
          '<td class="num nw">' + money2(x.arrive_amount != null ? x.arrive_amount : x.amount) + '</td>' +
          '<td class="nw"><span class="tag ' + a[1] + '">' + a[0] + '</span>' +
          (x.confirmed ? '<div class="hint">已确认到账</div>' : '') + '</td>' +
          '<td class="mono nw">' + esc(x.trade_no || '—') + '</td>' +
          '<td class="nw">' + d16(x.created_at) + '</td>';
      }, '无收款单据') + '</div>';

    var tradeRefund = '<div class="pad scrollx">' + table(
      ['退款单号', '退款金额', '责任归属', '审批状态', '主管审批时间', '财务出账时间', '退款原因'],
      d.refunds || [], function (r) {
        var S2 = { applying: 'warn', l1: 'info', done: 'ok', reject: 'bad' };
        return '<td class="mono nw"><b>' + esc(r.no) + '</b></td>' +
          '<td class="num nw"><b>' + money2(r.amount) + '</b></td>' +
          '<td class="nw">' + esc(r.liability_text || '—') + '</td>' +
          '<td class="nw"><span class="tag ' + (S2[r.status] || 'plain') + '">' +
            esc(r.status_text) + '</span></td>' +
          '<td class="nw">' + (d16(r.l1_at) || '—') + '</td>' +
          '<td class="nw">' + (d16(r.fin_at) || '—') + '</td>' +
          '<td style="min-width:180px">' + esc(r.reason || '—') + '</td>';
      }, '暂无退款单据') + '</div>';
    /* 众信那排二级页签里没有单独的「退款审批」，退款单据归在资金信息下
       （唐美芳 2026-09-08：「和我截图里的要一致」）。 */
    var tradeFund = '<div class="od-th"><b>收款单据</b></div>' + tradeRecv +
      '<div class="od-th"><b>退款单据</b></div>' + tradeRefund;

    /* 资料信息＝这一单每位办签人的材料收齐情况，从办签进度里能看出来；
       这里给一份汇总，省得为了看「谁还没交材料」去翻工单台。 */
    var tradeDoc = '<div class="pad scrollx">' + table(
      ['办签人', '签证资料', '办签进度', '承办专员', 'SLA'],
      d.applicants, function (a) {
        return '<td class="nw"><b>' + esc(a.name) + '</b></td>' +
          '<td class="nw">' + (a.info_done
            ? '<span class="tag ok">已录入</span>' +
              (a.info_at ? '<div class="hint">' + d16(a.info_at) + '</div>' : '')
            : '<span class="tag warn">待录入</span>') + '</td>' +
          '<td class="nw"><span class="tag info">' + esc(a.progress_text) + '</span></td>' +
          '<td class="nw">' + esc(a.owner || '未派单') + '</td>' +
          '<td class="nw">' + (a.sla_due ? d16(a.sla_due).slice(0, 10) : '—') + '</td>';
      }, '暂无数据') + '</div>';

    var tradeInv = '<div class="pad">' +
      '<div class="od-grid">' +
      odKV('开票抬头', esc(o.invoice_entity || '未指定')) +
      odKV('结算主体', esc(o.settle_entity || '—')) +
      odKV('已开票金额', t.sale ? money2(t.sale.invoiced) : money2(0)) +
      '</div>' +
      '<div class="note" style="margin-top:12px">订单开票在众信财务系统中完成，' +
      '签证订单沿用同一套发票流程与抬头档案，<b>本期只登记抬头，不做开票动作</b>。</div></div>';

    /* ---- 合同信息 ----
       系统本期没有合同模块（合同在众信合同系统里签），只登记状态与主体，
       所以这一页给的是「这一单的合同口径」而不是一份假合同。 */
    var tradeContract = '<div class="pad"><div class="od-grid bd">' +
      odKV('订单合同状态', '<span class="tag warn">' + esc(o.contract_status) + '</span>') +
      odKV('合同编号', null) +
      odKV('签约主体', esc(o.sale_org)) +
      odKV('结算主体', esc(o.settle_entity)) +
      odKV('开票主体', esc(o.invoice_entity)) +
      odKV('签约日期', null) +
      '</div>' +
      '<div class="note" style="margin-top:12px">签证订单的合同在<b>众信合同系统</b>中签署与归档，' +
      '本系统只登记合同状态与签约主体，不生成合同文本。</div></div>';

    /* ---- 订单异常记录 ----
       系统里真实存在的异常有四类：资金（欠款 / 待付供应商 / 未确认到账）、
       时效（SLA 超期）、结果（拒签 / 行政审查）、退款。逐条列出来，不编「异常等级」。 */
    var exList = [];
    if (t.sale && t.sale.owe > 0 && o.status !== 'cancelled') {
      exList.push(['资金', '存在欠款', money2(t.sale.owe), '待收款', 'warn']);
    }
    if (!o.gate && o.status === 'paid') {
      exList.push(['资金', '客户已付款，财务尚未确认到账', '—', '待财务核对', 'warn']);
    }
    if (t.settle && t.settle.payable_open > 0) {
      exList.push(['资金', '待付供应商款', money2(t.settle.payable_open), '待付款', 'warn']);
    }
    (d.applicants || []).forEach(function (a) {
      if (a.sla_due && a.wo_status === 'open' && a.sla_due < today10()) {
        exList.push(['时效', esc(a.name) + ' 办理超出时限', d16(a.sla_due), '已超期', 'bad']);
      }
      if (a.result && a.result !== '出签') {
        exList.push(['结果', esc(a.name) + ' 签证结果：' + esc(a.result), '—',
          a.result === '拒签' ? '已拒签' : esc(a.result), 'bad']);
      }
    });
    (d.refunds || []).forEach(function (r) {
      exList.push(['退款', '退款单 ' + esc(r.no) + '　' + esc(r.reason || ''),
        money2(r.amount), esc(r.status_text), r.status === 'done' ? 'ok' : 'warn']);
    });
    var tradeEx = '<div class="pad scrollx">' + table(
      ['异常类型', '异常说明', '涉及金额', '当前状态'], exList, function (x) {
        return '<td class="nw">' + x[0] + '</td><td>' + x[1] + '</td>' +
          '<td class="num nw">' + x[2] + '</td>' +
          '<td class="nw"><span class="tag ' + x[4] + '">' + x[3] + '</span></td>';
      }, '本单无异常记录') + '</div>';

    /* ---- 其他杂费 ----
       主价之外真实发生过的费用只有一项：专员在使领馆现场垫付的官费。
       没有的时候如实说没有，不摆一张空表加一堆占位科目。 */
    var feeRows = [];
    if (t.settle && t.settle.advance) {
      feeRows.push(['专员垫付官费', money2(t.settle.advance),
        '由承办专员在使领馆现场垫付，随结算单与供应商结清']);
    }
    var tradeFee = '<div class="pad scrollx">' + table(
      ['费用项目', '金额', '说明'], feeRows, function (x) {
        return '<td class="nw">' + x[0] + '</td><td class="num nw"><b>' + x[1] + '</b></td>' +
          '<td>' + x[2] + '</td>';
      }, '本单无其他杂费') +
      '<div class="hint" style="margin-top:10px">签证订单的费用构成为「签证费 + 商家服务费」，' +
      '主价之外不另收杂费；此处只登记履约中实际发生的代垫与补收。</div></div>';

    /* 二级页签顺序照众信那一排（唐美芳 2026-09-08 给的截图）：
       交易信息 / 资金信息 / 合同信息 / 资料信息 / 订单异常记录 / 开票信息 / 其他杂费 */
    var TR_TABS = [['detail', '交易信息', tradeDetail], ['fund', '资金信息', tradeFund],
                   ['contract', '合同信息', tradeContract], ['doc', '资料信息', tradeDoc],
                   ['ex', '订单异常记录', tradeEx], ['inv', '开票信息', tradeInv],
                   ['fee', '其他杂费', tradeFee]];
    var trCur = S.cache.odTrTab || 'detail';
    if (!TR_TABS.some(function (x) { return x[0] === trCur; })) trCur = 'detail';
    var trade = odSec('交易信息',
      '<div class="od-subtabs">' + TR_TABS.map(function (x) {
        return '<a data-odtr="' + x[0] + '"' + (x[0] === trCur ? ' class="on"' : '') + '>' +
          x[1] + '</a>';
      }).join('') + '</div>' +
      TR_TABS.map(function (x) {
        return '<div class="od-subpane"' + (x[0] === trCur ? '' : ' hidden') +
          ' data-odtrp="' + x[0] + '">' + x[2] + '</div>';
      }).join(''));

    /* 四块内容一次全铺开，页签改成吸顶锚点：滚到哪块自动高亮，点页签平滑跳过去。
       唐美芳 2026-08-31：「订单详情页每个 tab 页签可以滑动交互展示，不是现在的只能点击展示」。
       原来一次只渲染一块，想看交易信息必须先点一下——但这四块本来就是一张单的四个侧面，
       专员核单时是要连着往下看的。 */
    var TABS = [['base', '订单信息']].concat(
      d.sup_view ? [] : [['contact', '联系人信息']],
      [['aps', '办签人信息'], ['trade', '交易信息']]);
    var SEC = { base: base, contact: contact, aps: aps, trade: trade };
    var body = TABS.map(function (x) {
      return '<div class="od-anchor" id="odsec-' + x[0] + '">' + (SEC[x[0]] || '') + '</div>';
    }).join('');

    /* ---- 底部操作条 ----
       通栏吸底，左边是「这是哪一单、现在什么状态」，右边是动作，位置固定。
       原来只有一排裸按钮浮在页面中间，滚到哪都分不清它属于哪块内容
       （唐美芳 2026-09-02：「底部操作按钮怎么悬浮在页面上，没有底色背景呢」）。 */
    var ops = d.actions.filter(function (a) { return a.k !== 'log'; });
    var bar = ops.length ? '<div class="od-bar">' +
      '<div class="bar-ctx">订单 <span class="mono">' + esc(o.no) + '</span>' +
      '<s>' + esc(o.status_text) + ' · 办签' + esc(o.work_status || '未完成') +
      (p && p.name ? ' · ' + esc(p.name) : '') + '</s></div>' +
      '<div class="bar-act">' + ops.map(function (a) {
        return '<button class="btn' + (a.p ? ' r' : '') + '" data-od="' + a.k + '">' + esc(a.t) + '</button>';
      }).join('') + '</div></div>' : '';

    /* 详情页原来没有返回入口，只能靠浏览器后退（唐美芳 2026-09-08：
       「订单详情没有返回按钮呢」）。按角色回各自的订单列表。 */
    m.innerHTML = pageH('订单详情', '订单编号 ' + o.no,
      '<button class="btn" data-odback>← 返回订单列表</button>') + head +
      '<div class="od-tabs" id="odtabs">' + TABS.map(function (x, i) {
        return '<a data-odt="' + x[0] + '"' + (i === 0 ? ' class="on"' : '') + '>' + x[1] + '</a>';
      }).join('') + '</div>' + body + bar;

    /* 点页签＝平滑滚到那一块；反过来滚动时页签跟着高亮。
       滚动容器是 .main（不是 window），监听要挂在它身上。 */
    (function () {
      var tabsEl = $('#odtabs', m);
      var scroller = m.closest('.main') || m;
      var secs = TABS.map(function (x) { return { k: x[0], el: $('#odsec-' + x[0], m) }; })
                     .filter(function (x) { return x.el; });
      $$('[data-odt]', m).forEach(function (a) {
        a.onclick = function () {
          var t = secs.filter(function (x) { return x.k === a.dataset.odt; })[0];
          if (!t) return;
          var top = t.el.offsetTop - (tabsEl ? tabsEl.offsetHeight + 12 : 0);
          scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        };
      });
      function sync() {
        var cur;
        /* 已经滚到底：最后一块不管多矮都该高亮，否则点最后一个页签会「跳过去了但高亮没动」
           —— 因为滚动被 maxScroll 截住，判定线还落在上一块里。 */
        if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 4) {
          cur = secs[secs.length - 1].k;
        } else {
          var line = scroller.scrollTop + (tabsEl ? tabsEl.offsetHeight : 0) + 24;
          cur = secs[0].k;
          secs.forEach(function (x) { if (x.el.offsetTop <= line) cur = x.k; });
        }
        $$('[data-odt]', m).forEach(function (a) {
          a.classList.toggle('on', a.dataset.odt === cur);
        });
      }
      scroller.addEventListener('scroll', sync, { passive: true });
      sync();
      /* 从订单列表点「录入客人签证资料」进来时，直接落到办签人信息那一块 */
      if (S.cache.odJump) {
        var jk = S.cache.odJump; S.cache.odJump = null;
        var tj = secs.filter(function (x) { return x.k === jk; })[0];
        if (tj) {
          setTimeout(function () {
            scroller.scrollTo({
              top: Math.max(0, tj.el.offsetTop - (tabsEl ? tabsEl.offsetHeight + 12 : 0)),
              behavior: 'smooth'
            });
          }, 60);
        }
      }
    })();
    /* 返回订单列表：按当前身份回各自那张列表 */
    $('[data-odback]', m) && ($('[data-odback]', m).onclick = function () { go('orders'); });
    /* 交易明细里指向其他二级页签的链接（费用明细 / 查看审批） */
    $$('[data-odtr2]', m).forEach(function (a) {
      a.onclick = function () {
        var k = a.dataset.odtr2;
        var tab = $('[data-odtr="' + k + '"]', m);
        if (tab) tab.click();
      };
    });
    /* 「查看变更明细」：把这一单跟金额有关的动作按时间列出来——退款单 + 操作日志里
       改价 / 收款 / 退款那几类。不另起接口，也不编「变更记录」这张表：
       系统里真实存在的就是这两处（唐美芳 2026-09-08 要求对齐众信的按钮位置）。 */
    $('[data-odchg]', m) && ($('[data-odchg]', m).onclick = function () {
      var items = (d.refunds || []).map(function (r) {
        return { at: r.created_at, who: r.by_name || '—', what: '退款申请 ' + r.no,
                 note: '¥' + money(r.amount) + '　' + (r.reason || '') + '　' + (r.status_text || '') };
      }).concat((d.logs || []).filter(function (l) {
        return /价|款|退|结算|开票/.test(l.action || '');
      }).map(function (l) {
        /* 订单详情的 logs 字段是 actor / action / detail / at（见后端 /order/detail），
           不是 by_name / created_at——第一版按后者取，时间与操作人全渲染成空。
           ⚠️ 同一份数据在不同接口里字段名不一样（收款详情里叫 status/note），
           跨接口复用渲染逻辑前先看一眼真实返回。 */
        return { at: l.at, who: l.actor || '—', what: l.action, note: l.detail || '' };
      }));
      items.sort(function (a2, b2) { return String(b2.at).localeCompare(String(a2.at)); });
      modal('变更明细 · ' + o.no,
        '<div class="pad scrollx">' + table(['时间', '操作人', '变更事项', '说明'], items,
          function (x) {
            return '<td class="nw">' + d16(x.at) + '</td><td class="nw">' + esc(x.who) + '</td>' +
              '<td class="nw">' + esc(x.what) + '</td><td>' + esc(x.note) + '</td>';
          }, '这一单没有金额变更记录') + '</div>', [{ t: '关闭' }]);
    });
    /* 二级页签只切显示，不重拉数据——同一份 d 里的四个侧面 */
    $$('[data-odtr]', m).forEach(function (a) {
      a.onclick = function () {
        S.cache.odTrTab = a.dataset.odtr;
        $$('[data-odtr]', m).forEach(function (x) {
          x.classList.toggle('on', x.dataset.odtr === a.dataset.odtr);
        });
        $$('[data-odtrp]', m).forEach(function (x) {
          x.hidden = x.dataset.odtrp !== a.dataset.odtr;
        });
      };
    });
    $$('[data-od]', m).forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.od;
        if (k === 'log') return odLog(d);
        if (k === 'cancel') {
          /* 2026-09-08 起「取消订单」只在未支付时出现，所以这里不再有
             「已收款怎么办」那一支——已收款的单按钮本身就不给了，只给「申请退款」。 */
          return confirmBox('取消订单 ' + o.no,
            '该订单尚未支付，可直接取消。取消后办签人一并作废，<b>该动作不可撤销</b>。' +
            '如订单已支付，请改用「申请退款」。', '确认取消')
            .then(function () { return api('/order/cancel', { no: o.no }); })
            .then(function () { toast('订单已取消'); reload(); }).catch(fail);
        }
        if (k === 'pay') {
          return api('/order/pay', { no: o.no })
            .then(function (r) { toast(r.msg); reload(); }).catch(fail);
        }
        if (k === 'refund') { go('refund', o.no); return; }
        if (k === 'progress') { go('board', o.no); return; }
      };
    });
    $$('[data-ap]', m).forEach(function (b) {
      b.onclick = function () { go('board', o.no); };
    });
    /* 就地编辑客人签证资料：不跳页，改完当场刷新这一页 */
    var rab = $('[data-recvaddr]', m);
    if (rab) rab.onclick = function () {
      var r = d.receiver || {};
      ask('收货地址 · 护照原件寄回', [
        { k: 'contact', label: '收货人', value: r.name || '', required: true },
        { k: 'phone', label: '联系电话', value: r.phone || '', required: true },
        { k: 'region', label: '所在地区', value: r.region || '', required: true,
          ph: '如：北京市朝阳区' },
        { k: 'detail', label: '详细地址', value: r.detail || '', required: true,
          ph: '街道、门牌号、楼层房间号' }
      ], '保存', function (f) {
        return api('/order/recv_addr', Object.assign({ no: o.no, addr_id: r.id || 0 }, f));
      }).then(function (rr) { toast(rr.msg || '已保存'); reload(); }).catch(function () { });
    };
    /* 「发给客人填」的弹窗 2026-09-08 统一收进 core.js 的 shareTask()，
       这里只保留绑定（其他页面若还挂着这个 data 属性，行为也一致）。 */
    $$('[data-apshare]', m).forEach(function (b) {
      b.onclick = function () {
        var a = d.applicants.filter(function (x) { return x.id === +b.dataset.apshare; })[0] || {};
        shareTask(a.id, a.name);
      };
    });
    /* 只读查看申请表：进去之前打上只读标记，填表页据此锁住全部字段 */
    $$('[data-apformro]', m).forEach(function (b) {
      b.onclick = function () {
        S.cache.cfRO = String(b.dataset.apformro); S.cache.cfSec = null;
        go(d.view === 'csp' ? 'formfill' : 'form', b.dataset.apformro);
      };
    });
    $$('[data-apmat]', m).forEach(function (b) {
      b.onclick = function () { go('mats', b.dataset.apmat); };
    });
    /* 代填官方申请表：68 格没法塞进弹窗，进整页填。
       CSP 走 formfill（与有米、客户端同一张表），UOM/运营侧走填表任务页。 */
    $$('[data-apform]', m).forEach(function (b) {
      /* 走可编辑入口时清掉只读标记，否则上一次「查看」会把这次也锁住 */

      b.onclick = function () {
        var ap = d.applicants.filter(function (x) { return x.id === +b.dataset.apform; })[0];
        S.cache.cfSec = null; S.cache.cfRO = null;
        if (d.view === 'csp') return go('formfill', ap.id);
        if (ap.form && ap.form.task_id) return go('tasks', ap.form.task_id);
        toast('该办签人暂无官方申请表任务', true);
      };
    });
    $$('[data-apedit]', m).forEach(function (b) {
      b.onclick = function () {
        var a = d.applicants.filter(function (x) { return x.id === +b.dataset.apedit; })[0];
        /* 表单字段与 C 端 / 有米那一版同一份（v-ordinfo.js 的 oiForm），
           三端改的是同一批字段、同一套必填口径 */
        var f0 = Object.assign({}, a, { name_cn: a.name, crowd: a.crowd_k || 'job' });
        ask('客户签证资料 · ' + (a.name || ''), oiForm(f0, d.crowds), '保存', function (f) {
          return api('/order/info/save', Object.assign({ no: o.no, applicant_id: a.id }, f));
        }).then(function (r) { toast(r.msg || '已保存'); reload(); }).catch(function () { });
      };
    });
    /* 导出名单：众信那张表右上角也是这个按钮。走前端拼 CSV，不新增接口 */
    var csvBtn = $('[data-apcsv]', m);
    if (csvBtn) csvBtn.onclick = function () {
      var cols = ['姓名', '英文姓名', '性别', '出生日期', '证件类型', '证件号码', '证件有效期',
                  '签发地', '国籍', '手机号', '适用人群', '资料状态', '办签进度', '签证结果'];
      var lines = [cols.join(',')].concat(d.applicants.map(function (a) {
        return [a.name, a.name_en, a.sex, a.birth, a.id_type, a.id_no, a.id_expiry,
                a.id_place, a.nation, a.phone, a.crowd,
                a.info_done ? '已录入' : '待录入', a.progress_text, a.result || '未出结果']
          .map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; })
          .join(',');
      }));
      /* \ufeff：Excel 打开 UTF-8 CSV 不加 BOM 会乱码 */
      var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var a2 = document.createElement('a');
      a2.href = URL.createObjectURL(blob);
      a2.download = o.no + '_办签人名单.csv';
      a2.click();
      setTimeout(function () { URL.revokeObjectURL(a2.href); }, 1000);
      toast('已导出 ' + d.applicants.length + ' 位办签人');
    };
    /* 「查看」＝客户端那套办签进度时间轴，同一个接口、同一份文案渲染
       （唐美芳 2026-09-01：「每个办签人的办签进度不应该和 C 端一样有详情可以看么」）。
       弹窗里还能点姓名切换同订单的其他办签人，跟客户端的行为一致。 */
    $$('[data-apv]', m).forEach(function (b) {
      b.onclick = function () { apTrack(+b.dataset.apv); };
    });
    function apTrack(aid) {
      var a = d.applicants.filter(function (x) { return x.id === aid; })[0] || {};
      api('/my/track?applicant_id=' + aid).then(function (t) {
        var box = modal('办签进度 · ' + (a.name || t.name || ''),
          '<div class="pad">' +
          '<div class="od-grid" style="margin-bottom:12px">' +
          odKV('当前进度', '<span class="tag info">' + esc(t.progress_text || '') + '</span>') +
          odKV('承办专员', esc(a.owner || '未派单')) +
          odKV('领区', esc(a.consulate_region || '—')) +
          odKV('面签时间', t.appt_at ? d16(t.appt_at) : '未预约') +
          odKV('签证结果', esc(t.result || '未出结果')) +
          odKV('SLA', a.sla_due ? d16(a.sla_due).slice(0, 10) : '—') +
          '</div>' +
          '<div class="od-track">' + trackHtml(t, aid) + '</div>' +
          '<div class="hint" style="margin-top:10px">送签处理由签证操作专员在 UOM 工单台执行，' +
          '此处只读。该时间轴与客户在小程序端所见为同一份。</div></div>',
          [{ t: '关闭' }], true);
        /* 同订单其他办签人：点姓名就地切换，不用关掉再点一次 */
        $$('[data-ap]', box.mask).forEach(function (x) {
          x.onclick = function () {
            if (+x.dataset.ap === aid) return;
            box.close();
            apTrack(+x.dataset.ap);
          };
        });
      }).catch(fail);
    }
  });
};

/* 订单日志：众信右上角那个「订单日志」按钮 */
function odLog(d) {
  var rows_ = d.logs;
  confirmBox('订单日志 · ' + d.ord.no,
    (rows_.length ? '<div class="od-log">' + rows_.map(function (e) {
      return '<div class="od-le"><i>' + d19(e.at) + '</i>' +
        '<b>' + esc(e.actor || '系统') + '</b>' +
        '<s>' + esc(e.action) + '</s>' +
        (e.detail ? '<em>' + esc(e.detail) + '</em>' : '') + '</div>';
    }).join('') + '</div>' : '<div class="empty">暂无日志</div>'), '关闭')
    .catch(function () { });
}
