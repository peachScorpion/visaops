/* ============================================================
   UBK · 签证办理中心
   唐美芳 2026-09-04：「国家签证办理中心挪到供应商去，且里面的流程节点弄成通用的，
   可以让他们直接跳过中间流程，直接标记最后是否出签，怕他们觉得标记系统太过麻烦，
   增加他们的工作量。」

   所以这一页跟众信自己那套工单台是两种东西：
     · 众信侧按美签六步走（待收料 → 待审核 → 待提交至官网 → 待预约 → 待出结果 → 已完成），
       每一步都有对应的作业动作；
     · 供应商侧只有三档（待收料 / 处理中 / 已出结果），且<b>允许直接跳到最后</b>——
       他们手上国家五花八门，日本递纸质、韩国走代传，根本没有「提交至官网」这一步；
       逼他们逐个节点点，最后的结果是没人点，系统里的进度全是假的。
   底层仍写六步：set_progress() 跳跃时会自动补齐中间环节，轨迹不丢。

   动作只有两个：「开始处理」和「登记签证结果」。多一个按钮，就多一个他们不点的理由。
   ============================================================ */

var UBKWO_TABS = [
  ['G1', '待收料'], ['G2', '处理中'], ['G3', '已出结果']
];

/* 结果标签：出签绿、拒签红、行政审查黄，跟众信侧同一套配色，
   两边的人在电话里对同一张单时说的是同一个词。 */
function ubkResTag(v) {
  var M = { pass: ['ok', '出签'], reject: ['bad', '拒签'],
    withdraw: ['plain', '撤签'], ap: ['warn', '行政审查'] };
  var t = M[v];
  return t ? '<span class="tag ' + t[0] + '">' + t[1] + '</span>' : '<span class="hint">—</span>';
}

/* 材料进度：供应商关心的只有「客人交齐没有」，我方凭证那几项跟他无关。
   数字后面跟一句人话，不让他自己去比 7/9 是什么意思。 */
function ubkMatCell(w) {
  var s = w.mat || {};
  var need = s.cust_must || 0, wait = s.cust_wait || 0;
  if (!need) return '<span class="hint">无需申请人提交</span>';
  /* ⚠️ 口径必须自洽：上一版「尚缺 N 项」数的是**客户必交**里没交的，
     而「已通过 X / Y」的 Y 是**全部材料**（含建议项与我方凭证），
     于是出现「尚缺 6 项」配「已通过 0/10」，两个数怎么算都对不上
     （唐美芳 2026-09-09：「尚缺 6 项与已通过里的 0/10 还是对不上啊」）。
     现在主线只讲**客户必交这一档**：已通过 X / M，尚缺 = M − X；
     建议项与我方凭证挪到第二行单列，不掺进这笔账。 */
  return (wait
    ? '<span class="tag warn">尚缺 ' + wait + ' 项</span>'
    : '<span class="tag ok">已交齐</span>') +
    '<div class="hint">客户必交 ' + (need - wait) + ' / ' + need + ' 已通过' +
    (s.reject ? ' · <b style="color:#B42318">' + s.reject + ' 项驳回</b>' : '') + '</div>' +
    '<div class="hint">另有建议 ' + (s.opt_total || 0) + ' 项 · 我方凭证 ' +
    (s.ours_total || 0) + ' 项</div>';
}

VIEWS['ubk:board'] = function (m) {
  return api('/sup/orders').then(function (j) {
    var list = j.list || [];
    var q = srchCard('ubkwo', [
      { k: 'name', t: '办签人', ph: '支持模糊查询' },
      /* 工单号是这张表的唯一键，必须能搜（唐美芳 2026-09-09：「为什么签证办理中心
         列表没有唯一编号啦，后续不好定位哪个工单了」）。 */
      { k: 'no', t: '工单号', ph: '支持模糊查询' },
      { k: 'ord_no', t: '订单号', ph: '支持模糊查询' },
      { k: 'country', t: '国家', type: 'sel', opts: uniqOpts(list, function (w) { return w.country; }) },
      { k: 'product', t: '产品', type: 'sel', opts: uniqOpts(list, function (w) { return w.product; }) },
      {
        /* 超期是「该办没办」，跟办到哪一步是两回事，所以做筛选项不做页签 */
        k: 'overdue', t: '是否超期', type: 'sel',
        opts: [['y', '已超期'], ['n', '未超期']],
        get: function (w) { return w.overdue ? 'y' : 'n'; }
      }
    ]);
    var hit = q.filter(list);
    /* 「全部」放第一个（唐美芳 2026-09-04：「全部 tab 页签在最前面，
       你怎么每次都把全部放到最后面，不太友好」）。全站已统一成这个顺序。 */
    var t = subTabs('ubkwo', [{ k: 'all', t: '全部', fn: function () { return true; } }]
      .concat(UBKWO_TABS.map(function (x) {
        return { k: x[0], t: x[1], fn: function (w) { return w.stage === x[0]; } };
      })), hit, 'G1');   /* 默认停在待收料——那才是要动手的那一档 */
    var so = sorter('ubkwo', [
      ['办结截止日', function (w) { return w.sla_due || ''; }],
      ['办理状态', function (w) { return w.stage || ''; }]
    ], ['办结截止日', 'asc']);
    var pg = pager('ubkwo', so.sort(t.rows), 10);

    m.innerHTML = pageH('签证办理中心',
      '本页展示派发至贵司的全部办签人。办理状态分三档：<b>待收料 → 处理中 → 已出结果</b>。' +
      '申请人材料齐备并通过审核后自动进入「处理中」；<b>结果出具后登记即可</b>，' +
      '中间环节无须逐档登记，系统自动补齐。' +
      '「开始处理」仅在材料齐备后出现，用于线下收料等系统外场景；' +
      '已出结果的工单不再提供操作，如需更正请联系众信。' +
      /* 没有「填申请表」按钮的那些工单要有个交代，否则供应商只会以为按钮丢了
         （唐美芳 2026-09-09 就是这么问的，只不过她碰到的是按钮在、点了报错）。 */
      '<br>部分国家（如日本）向使领馆递交的是<b>纸质申请表</b>，系统内没有在线申请表这一层，' +
      '此类工单不显示「填申请表」，按贵司既有流程线下填写即可；' +
      '材料清单不受影响，仍按平台清单收料。',
      '') +
      /* 工单要等平台财务确认收款到账才下发。列表为空时必须说清是这个原因，
         否则供应商只看到一张空表（唐美芳 2026-09-08：「这个订单都收款了，
         ubk 的签证办理中心还是没有数据」——问的就是这一条规则不透明）。 */
      (j.gate_wait
        ? '<div class="note w">另有 <b>' + j.gate_wait + '</b> 位办签人所在的订单' +
          '<b>客户已付款、平台财务尚未确认到账</b>，按现行规则暂不派发至贵司，' +
          '财务确认后自动出现在本页，无须联系平台。</div>'
        : '') +
/* 操作说明整块撤掉（唐美芳 2026-09-04：「ubk 里页面的操作说明都先去掉吧」）。
   页面顶部保留一句话说明；供应商是外部用户，不需要我们把内部作业规范摆给他看。 */
      q.html +
      '<div class="card">' + t.html + '<div class="pad">' + table(
        /* 国家、签证类型这些关键字段 2026-09-09 从小字里放回独立列
           （唐美芳：「比如国家，签证类型，这些都是非常关键的字段，你现在把这些都隐藏了」）。
           「办理时限」改叫「办结截止日」——原来的名字看不出是日期还是天数。 */
        /* 2026-09-09 唐美芳：「订单、产品字段拆分开，申请人材料也拆分开，
           和之前 uom 比较早的版本一样，以前的字段比较清晰」。
           订单号与签证产品各占一列；创建 / 最近操作也补上。 */
        so.cols(['工单号', '办签人', '国家 / 送签地', '签证类型', '订单号', '签证产品',
          '申请人材料', '办理状态', '签证结果', '办结截止日', '当前办理人',
          '创建', '最近操作', '操作']),
        pg.rows, function (w) {
          /* 工单号下面原来重复一遍派发日期，现在「创建」单独成列，这里不重复 */
          return '<td class="nw"><b class="mono">' + esc(w.no) + '</b></td>' +
            '<td class="nw"><b>' + esc(w.name) + '</b>' +
            '<div class="hint">' + esc(w.crowd || '') + '</div></td>' +
            '<td class="nw"><b>' + flag(w.country) + ' ' + esc(w.country || '—') + '</b>' +
            (w.submit_city ? '<div class="hint">' + esc(w.submit_city) + '</div>' : '') + '</td>' +
            '<td class="nw">' + (w.visa_cat
              ? '<span class="tag info">' + esc(w.visa_cat) + '</span>' : '—') +
            (w.visa_type ? '<div class="hint">' + esc(w.visa_type) + '</div>' : '') + '</td>' +
            '<td class="nw mono">' + esc(w.ord_no) + '</td>' +
            '<td style="min-width:190px">' + esc(w.product || '—') +
            (w.pkg_name ? '<div class="hint">' + esc(w.pkg_name) + '</div>' : '') + '</td>' +
            '<td style="min-width:130px">' + ubkMatCell(w) + '</td>' +
            '<td class="nw">' + '<span class="tag ' +
            (w.stage === 'G3' ? 'ok' : w.stage === 'G2' ? 'info' : 'plain') + '">' +
            esc(w.stage_text || '') + '</span>' +
            /* 办到哪一步，一眼看得到（唐美芳 2026-09-09：客户问「面签约到几号」
               得有人答得上）。这三样由供应商自己回传，没传就不占位。 */
            (w.appt_at ? '<div class="hint">面签 ' + esc(String(w.appt_at).slice(5, 16)) +
              (w.appt_place ? ' · ' + esc(w.appt_place) : '') + '</div>'
              : w.app_id ? '<div class="hint">已提交官网</div>' : '') +
            '</td>' +
            '<td class="nw">' + ubkResTag(w.visa_result) + '</td>' +
            '<td class="nw">' + (w.sla_due
              ? (w.overdue ? '<span class="tag bad">已超期</span><div class="hint">'
                : '<div class="hint">') + d10(w.sla_due) + '</div>'
              : '<span class="hint">—</span>') + '</td>' +
            /* 按钮按档位排（唐美芳 2026-09-09）：
                 待收料  → 查看详情 · 填申请表 · 登记签证结果
                 处理中  → 查看详情 · 提交至官网 · 回填缴费 · 预约面签 · 登记签证结果
                 已出结果 → 查看详情
               两条口径变化：
               ① 原来的「材料清单」统一改叫「查看详情」，进的是工单详情页
                  （材料仍在详情页里，且比原来那个只有材料的页面看得全）；
               ② **处理中不再出现「填申请表」**——到了这一档申请表按定义已经填完，
                  再摆一个填表按钮只会让人以为还没填完。要改仍可从详情页进。 */
            '<td class="nw">' + (w.sup_owner_name
              ? esc(w.sup_owner_name) : '<span class="hint">未指派</span>') + '</td>' +
            '<td class="nw hint">' + d16(w.created_at || '') +
            (w.created_by_name ? '<div>' + esc(w.created_by_name) + '</div>' : '') + '</td>' +
            '<td class="nw hint">' + (w.updated_at
              ? d16(w.updated_at) + (w.updated_by_name
                ? '<div>' + esc(w.updated_by_name) + '</div>' : '')
              : '未再变更') + '</td>' +
            '<td><div class="btns">' +
            '<button class="btn sm g" data-wd="' + esc(w.no) + '">查看详情</button>' +
            (w.stage === 'G1' && w.form_avail
              ? '<button class="btn sm" data-wform="' + w.applicant_id + '">' +
                (w.form && w.form.ask_left ? '填申请表 · 剩 ' + w.form.ask_left + ' 题'
                                           : '填申请表') + '</button>'
              : '') +
            /* 「开始处理」2026-09-09 撤掉（唐美芳：「待收料为什么会有开始处理按钮？
               起个什么逻辑作用？」）。她问得对：材料审核已经下放给供应商，
               必交项逐条点「通过」之后系统自动转「处理中」，
               再摆一个手动按钮等于留了一条不收料也能标处理中的旁路。 */
            (w.stage === 'G2'
              ? '<button class="btn sm' + (w.app_id ? '' : ' p') +
                '" data-step="form:' + w.applicant_id + '">' +
                (w.app_id ? '受理号已回填' : '提交至官网') + '</button>' +
                /* 「回填缴费」2026-09-09 撤掉（唐美芳：「缴费回填这个功能可以去掉，
                   毕竟给大使馆是否缴费不影响状态流转」）。它确实不是状态节点，
                   只是取号的前置条件之一，由办理人自己掌握。字段与历史记录保留。 */
                '<button class="btn sm" data-step="appt:' + w.applicant_id + '">' +
                (w.appt_no ? '面签改期' : '预约面签') + '</button>'
              : '') +
            (w.stage !== 'G3'
              ? '<button class="btn sm p" data-res="' + w.applicant_id +
                '">登记签证结果</button>' : '') +
            (w.stage !== 'G3'
              ? '<button class="btn sm g" data-as="' + esc(w.no) + '">改派</button>' : '') +
            '</div></td>';
        }, '暂无派发至贵司的工单') + '</div>' + pg.html + '</div>';

    q.bind(m, function () { S.cache['pg:ubkwo'] = 1; reload(); });
    t.bind(m, function () { S.cache['pg:ubkwo'] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:ubkwo'] = 1; reload(); });
    pg.bind(m, reload);

    $$('[data-wd]', m).forEach(function (b) {
      b.onclick = function () { go('wo', b.dataset.wd); };
    });
    $$('[data-as]', m).forEach(function (b) {
      b.onclick = function () {
        woAssign(list.filter(function (x) { return x.no === b.dataset.as; })[0] || {}, reload);
      };
    });
    /* 代填官方申请表：与门店 / 运营同一张表，后端按工单归属限定范围 */
    $$('[data-wform]', m).forEach(function (b) {
      b.onclick = function () {
        S.cache.cfSec = null; S.cache.cfRO = null; go('formfill', b.dataset.wform);
      };
    });

    /* 办理进展：三个动作各自成钮（唐美芳 2026-09-09：「处理中的话就是回填签证 ID 信息、
       预约面签时间这些，对了之前还有提交至官网的按钮」），点哪个问哪个。
       前置不满足的（比如没回填受理号就来约号）由后端拦，提示写清缺什么。 */
    $$('[data-step]', m).forEach(function (b) {
      b.onclick = function () {
        var p = b.dataset.step.split(':'), aid = +p[1];
        var w = list.filter(function (x) { return x.applicant_id === aid; })[0] || {};
        ubkStep(w, p[0], reload);
      };
    });

    /* 「登记签证结果」：一步到底。从「待收料」也能直接点——她要的就是这个，
       中间节点由 set_progress() 自动补齐，不让供应商为了填结果先走完流程。
       弹窗抽成 woResultAsk()，UOM 侧办理中心用的是同一份（2026-09-09 两端整合）。 */
    $$('[data-res]', m).forEach(function (b) {
      b.onclick = function () {
        var aid = +b.dataset.res;
        woResultAsk(list.filter(function (x) { return x.applicant_id === aid; })[0] || {}, reload);
      };
    });
  });
};

/* 供应商 / 专员回传办理进展。三个动作各自独立（2026-09-09 唐美芳按档位重排按钮时定），
   kind: form=提交至官网并回填受理号 · fee=回填缴费 · appt=预约面签。
   官方渠道那三件事系统都不代办——提交、缴费、抢号都是人工在官网做完再回填，
   所以按钮叫「提交至官网」，做的事是回填，弹窗里把这层说清楚，别让人以为点了就提交了。 */
function ubkStep(w, kind, done) {
  var aid = w.applicant_id;
  var idname = w.official_id_name || '官网受理号';
  if (kind === 'form') {
    return ask('提交至官网 · ' + esc(w.name || ''), [
      { type: 'html', html: '<div class="note"><b>系统不代为提交</b>：' +
        '请在该国官方渠道人工提交申请，再把官方给出的<b>' + esc(idname) + '</b>回填到这里。' +
        '回填后进度自动推进，众信与客户端同步可见。<br>' +
        '（官方渠道无公开接口，提交、缴费、抢号、递交、采指纹五项均需人工操作。）</div><br>' },
      { k: 'app_id', label: idname, required: true, value: w.app_id || '' },
      { k: 'barcode', label: '条形码 / 副号', value: w.barcode || '',
        hint: '美签 DS-160 请填十位条形码；其他国家没有可留空' }
    ], '保存', function (f) {
      return api('/form/save', { applicant_id: aid, app_id: f.app_id, barcode: f.barcode });
    }).then(function () { toast('已回填'); done(); }).catch(fail);
  }
  /* ⚠️ fee 分支 2026-09-09 起没有入口了（唐美芳：缴费不影响状态流转，功能去掉）。
     代码留着是因为历史单据里已有收据号，将来若要改正仍可直接调用。 */
  if (kind === 'fee') {
    return ask('回填缴费 · ' + esc(w.name || ''), [
      { type: 'html', html: '<div class="note">在官方渠道缴费后回填收据编号。' +
        (S.role === 'ubk'
          ? '这笔是<b>贵司的办理成本</b>，已含在结算价内，<b>不进入众信垫付台账</b>，'
          : '本方缴纳的官费会<b>计入垫付台账</b>，由财务统一核销，') +
        '并用于后续官方系统取号。</div><br>' },
      { k: 'item', label: '费用项目', value: '签证费' },
      { k: 'amount', label: '金额（元）', type: 'number', required: true },
      { k: 'receipt_no', label: '缴费收据编号', required: true, value: w.cgi_receipt || '' }
    ], '保存', function (f) {
      return api('/fee/save', { applicant_id: aid, item: f.item,
        amount: f.amount, receipt_no: f.receipt_no });
    }).then(function () { toast('已回填'); done(); }).catch(fail);
  }
  return ask((w.appt_no ? '面签改期 · ' : '预约面签 · ') + esc(w.name || ''), [
    { type: 'html', html: '<div class="note">在官方预约系统取号并与客户确认时间后登记。' +
      '官方要「护照号 + 缴费收据编号 + ' + esc(idname) + '」三样才放号，' +
      '前两项没回填的这一步会被拦下。<br>' +
      '登记后<b>客户在小程序上即可看到面签时间与地点</b>，门店销售也不必再来问。</div><br>' },
    { k: 'appt_no', label: '面签预约号', required: true, value: w.appt_no || '' },
    { k: 'appt_at', label: '面签时间', type: 'datetime-local',
      value: (w.appt_at || '').replace(' ', 'T').slice(0, 16), required: true },
    { k: 'appt_place', label: '面签地点', value: w.appt_place || '',
      ph: '如：北京 · 美国驻华大使馆' }
  ], '保存', function (f) {
    return api('/appt/save', { applicant_id: aid, appt_no: f.appt_no,
      appt_at: f.appt_at.replace('T', ' ') + ':00', appt_place: f.appt_place });
  }).then(function () { toast(w.appt_no ? '已改期' : '已登记'); done(); }).catch(fail);
}

/* 登记签证结果：UBK 与 UOM 两端共用同一张表单（2026-09-09 唐美芳：
   「主要以 ubk 为主……其余操作和内容尽量保持一致」）。
   字段跟着「结果」动态出现，隐藏的字段不参与必填校验。 */
function woResultAsk(w, done) {
  var aid = w.applicant_id;
  return ask('登记签证结果 · ' + esc(w.name || ''), [
    { type: 'html', html: '<div class="note">请按使领馆出具的实际结果填写。' +
      '登记后申请人端即时可见，众信据此对账与结算；<b>拒签归因</b>将进入' +
      '责任判定与退款金额计算，请如实选择。<br>尚未出具结果但已进入行政审查（AP）的，' +
      '请选择「行政审查」，系统将记录复查日期，不计为办结。</div><br>' },
    /* 结果只有出签 / 拒签两个终态（唐美芳 2026-09-09：「签证结果只有出签和拒签
       2 个终态，其他状态都属于中间态，不具备意义」）。
       原来混在这里的「行政审查」是**中间态**——它表示使领馆还没给结论，
       放在结果里会让列表出现一批「已出结果但查不到结果」的单；
       现在它挪到「办理进展」那一侧（下面单独一个勾），进度仍停在待出结果。
       「撤签」是客户单方撤回，属于订单侧的取消 / 退款，不是使领馆给的结果。
       历史数据里已有的 ap / withdraw 仍能正常展示，只是不再新增。 */
    { k: 'result', label: '结果', type: 'select',
      options: [{ v: 'pass', t: '出签' }, { v: 'reject', t: '拒签' }],
      showIf: function (v) { return !(v.ap || []).length; } },
    { k: 'ap', label: '尚未出结果，转行政审查（AP）', type: 'checks',
      options: [{ v: '1', t: '使领馆已受理但尚未给出结论，登记为行政审查并记复查日期' }],
      hint: '勾选后本次不写结果，进度停在「待出结果」，15 天后提醒复查。' },
    /* 字段跟着「结果」动态出现（唐美芳 2026-09-09：「登记签证结果应该根据结果状态，
       动态展示下面的字段，比如选中拒签结果，下面的拒签原因及说明才会展示」）。 */
    { k: 'visa_no', label: '签证号',
      showIf: function (v) { return v.result === 'pass' && !(v.ap || []).length; } },
    { k: 'visa_valid_to', label: '签证有效期至', type: 'date',
      showIf: function (v) { return v.result === 'pass' && !(v.ap || []).length; } },
    { k: 'visa_stay', label: '单次停留天数',
      showIf: function (v) { return v.result === 'pass' && !(v.ap || []).length; } },
    { k: 'reject_cate', label: '拒签归因', type: 'select',
      hint: '该项进入责任判定与退款金额计算，请如实选择。',
      options: [''].concat(['移民倾向', '材料不实', '资金约束不足', '行程不合理',
        '面签表现', '过往拒签史', '使领馆未说明']),
      showIf: function (v) { return v.result === 'reject' && !(v.ap || []).length; } },
    { k: 'reject_reason', label: '拒签说明', type: 'textarea',
      hint: '填写使领馆给出的理由，或本方判断的原因。',
      showIf: function (v) { return v.result === 'reject' && !(v.ap || []).length; } }
  ], '登记', function (f) {
    /* 勾了「行政审查」就不是在登记结果，走 ap 分支：不写 visa_result 终态，
       进度停在待出结果并记一个 15 天后的复查日。 */
    if ((f.ap || []).length) {
      return api('/result/save', { applicant_id: aid, result: 'ap' });
    }
    if (f.result === 'pass' && !f.visa_no) {
      return Promise.reject(new Error('出签须填写签证号'));
    }
    if (f.result === 'reject' && !f.reject_cate) {
      return Promise.reject(new Error('拒签须选择归因，退款金额依据该项计算'));
    }
    return api('/result/save', {
      applicant_id: aid, result: f.result, visa_no: f.visa_no,
      visa_valid_to: f.visa_valid_to, visa_stay: f.visa_stay,
      reject_cate: f.reject_cate, reject_reason: f.reject_reason
    });
  }).then(function (r) {
    toast(r && r.ap_due ? '已转行政审查，请于 ' + d10(r.ap_due) + ' 前复查后再登记结果'
      : '结果已登记');
    if (done) done();
  }).catch(fail);
}

/* 改派：供应商派本公司经办人，众信派承办专员。两端共用一个入口，
   按角色决定问谁、调哪个接口（2026-09-09）。 */
function woAssign(w, done) {
  var isSup = S.role === 'ubk';
  return api(isSup ? '/sup/members' : '/lead/board').then(function (j) {
    var opts = (isSup ? j.list : (j.uoms || [])).map(function (u) {
      return { v: u.id, t: u.name };
    });
    if (!opts.length) {
      toast(isSup ? '贵司暂无其他可承接工单的账号' : '没有可指派的专员', true);
      return Promise.reject(new Error('no-op'));
    }
    return ask('改派工单 ' + esc(w.no), [
      { type: 'html', html: '<div class="note">' + (isSup
        ? '指派本公司负责这张工单的经办人。众信侧的承办专员不受影响，两边各记各的。'
        : '指派众信侧的承办专员。供应商那边的经办人由供应商自己指派，不受影响。') +
        '</div><br>' },
      { k: 'who', label: '指派给', type: 'select', options: opts,
        value: isSup ? (w.sup_owner || '') : '' }
    ], '改派', function (f) {
      return isSup
        ? api('/sup/assign', { no: w.no, sup_owner: +f.who })
        : api('/wo/assign', { no: w.no, owner_user: +f.who });
    });
  }).then(function (r) {
    toast('已改派' + (r && r.name ? '给 ' + r.name : ''));
    if (done) done();
  }).catch(function () { });
}
