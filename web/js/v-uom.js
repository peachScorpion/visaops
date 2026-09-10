/* C3 签证操作专员（UOM）：工单台 → 审材料/补料 → 填表缴费预约 → 送签递交 → 回填结果 → 返还 */

/* 页签 = 「此刻该做什么」，一个页签对应一个明确动作，一步推进到下一个页签。
   2026-09-01 对照业务流程图验收时发现：原来「待预约」把 P3 材料已齐备、
   P4 表单填写中、P5 待预约面签 三个状态混在一起，可这三步要做的事完全不同——
   P3 该去填表、P4 该去确认并到官网录入、P5 才是去抢号预约。
   页签名与操作对不上，专员点进去不知道下一步该干什么（唐美芳语音反馈）。
   2026-09-02 按她重定的六步收敛：
     待收料(P1) → 收材料 → 待审核(P2) → 审材料 → 待提交至官网(P3) → 官网提交并回填 App ID
     → 待预约(P4) → 抢号并登记 → 待出签(P5) → 回填结果 → 已完成(P6)
   补料是分支不是主线：任何阶段都可能发出补料单，所以单独一个页签横切。 */
/* 进度分桶。2026-09-03 去掉了「补料中」——
   它<b>不是一个进度</b>，是「这单有未回的补料单」这个事实，跟客人办到哪一步是两个维度。
   把它塞进进度页签，一发补料单这张工单就从「待收料」里消失、跑到「补料中」去了，
   专员反而找不着；而且材料本来就能随时改，没必要冻在一个独立状态里
   （唐美芳：「补料中这个状态，我感觉有点多余，因为这个操作办签的人员可以随时编辑啊」）。
   补料未回仍然要看得见，但它属于<b>异常标记</b>那一维（跟「已超过办结截止日」并列），
   筛选区里本来就有。 */
var BUCKET_MAP = {
  '待收料': function (w) { return w.status !== 'done' && w.progress === 'P1'; },
  '待审核': function (w) { return w.status !== 'done' && w.progress === 'P2'; },
  '待提交至官网': function (w) { return w.status !== 'done' && w.progress === 'P3'; },
  '待预约': function (w) { return w.status !== 'done' && w.progress === 'P4'; },
  '待出结果': function (w) { return w.status !== 'done' && w.progress === 'P5'; },
  '已完成': function (w) { return w.status === 'done' || w.progress === 'P6'; },
  '超期': function (w) { return !!w.overdue; },
  '补料未回': function (w) { return w.status !== 'done' && !!w.supp_no; }
};

/* 每个进度对应的「下一步该做什么」。列表按钮、详情提示都取这里，
   一处定义，不会出现列表写「处理」详情写别的。 */
var NEXT_ACT = {
  P1: ['收材料', '客户提交齐备后逐项审核，或勾选缺的打包成补料单'],
  P2: ['审材料', '逐项审核通过或驳回；驳回的可打包成补料单发回'],
  P3: ['提交至官网', '材料与表都齐了，到官方网站人工提交，回填 Application ID（这一步会校验订单已付款）'],
  P4: ['去预约', '官方预约系统要「护照号 + 缴费收据编号 + 官网受理号」三样才能约号：先回填缴费，再抢号、与客户确认时间后登记'],
  P5: ['回填结果', '面签后等使领馆出结果，出签或拒签都在这里回填'],
  P6: ['已完成', '本人流程已结束；资料返还在「资料返还」页签办理']
};

/* 专员负载条：原「调度管理 › 工单负载」的核心信息，收进工单台顶部。
   点某个专员＝把工单台切到全部工单并按他筛，比原来跳另一个菜单再跳回来少两步。 */
/* ⚠️ 2026-09-09 起不再渲染：唐美芳要求把「专员负载」从工单台顶部撤掉
   （按承办专员筛这件事，查询区的下拉本来就能做）。函数保留是因为
   主管的调度视图后面可能还要用，若确认不用了再删。 */
function loadBand(LB) {
  if (!LB || !LB.owners || !LB.owners.length) return '';
  var max = Math.max.apply(null, LB.owners.map(function (o) { return o.total; })) || 1;
  return '<div class="ldband"><div class="ldh">专员负载' +
    '<s>点一位专员可把下方工单按他筛选；行内「改派」可转给其他人</s></div>' +
    '<div class="ldrow">' + LB.owners.map(function (o) {
      return '<a data-lo="' + esc(o.owner) + '"><i>' + esc(o.owner) + '</i>' +
        '<b>' + o.open + '</b><s>在办 / 共 ' + o.total + '</s>' +
        (o.overdue ? '<em class="bad">超期 ' + o.overdue + '</em>' : '') +
        (o.hold ? '<em>挂起 ' + o.hold + '</em>' : '') +
        '<u style="width:' + Math.round(o.total * 100 / max) + '%"></u></a>';
    }).join('') + '</div></div>';
}

/* 国家签证办理中心的三个页签：工单 / 送签批次 / 资料返还。
   三者都是专员每天要做的事，只是组织维度不同——
   工单按「办签人」，批次按「一次送馆的一批护照」，返还按「一次寄回的包裹」。
   合成一页三个页签，菜单上只占一项（唐美芳 2026-09-01）。 */
/* 2026-09-03：「送签批次」「资料返还」两个页签隐藏。
   需面签的产品（美国这类）客人本人到馆、护照由使领馆直接寄回，这两步根本不存在
   （唐美芳：「不需要送签了，现在签证中心都是线上办理了」「也不存在资料返还」）。
   **页面与路由都留着**——日本这类必须由指定代办机构递交的国家仍然要用，
   把下面这行的注释解开就回来了。 */
var WO_TABS = [['board', '签证工单']];
var WO_TABS_FULL = [['board', '签证工单'], ['batch', '送签批次'], ['deliver', '资料返还']];
function woTopTabs(cur) {
  return '<div class="wo-tabs">' + WO_TABS.map(function (x) {
    return '<a data-wt="' + x[0] + '"' + (x[0] === cur ? ' class="on"' : '') + '>' +
      esc(x[1]) + '</a>';
  }).join('') + '</div>';
}
function woTabsBind(m) {
  $$('[data-wt]', m).forEach(function (a) {
    a.onclick = function () { go(a.dataset.wt); };
  });
}

VIEWS['uom:board'] = VIEWS['lead:board'] = VIEWS['ops:board'] = function (m, no) {
  if (no) return woDetail(m, no);
  /* 2026-09-09 唐美芳：「不用区分我的工单和全部工单了，这个用数据权限做到就可以」。
     专员看自己名下的，主管 / 平台管理员看全部——由角色直接决定，不再给按钮让人自己切。
     原来那两颗按钮还把选择存进 sessionStorage，换个浏览器 tab 看到的范围就不一样。 */
  var scope = (S.role === 'lead' || S.role === 'ops') ? 'all' : 'mine';
  /* 主管与平台管理员多取一份负载数据：原来「调度管理 › 工单负载」是个独立菜单，
     跟工单台的「全部工单」是同一批数据、只多一个改派动作，合并进来（唐美芳 2026-08-31）。 */
  var isLead = S.role === 'lead' || S.role === 'ops';
  return Promise.all([api('/wo/list?scope=' + scope),
                      isLead ? api('/lead/board') : Promise.resolve(null)]).then(function (rr) {
    var j = rr[0], LB = rr[1];
    var uniq = function (f) { return uniqOpts(j.list, f); };
    var q = srchCard('woboard', [
      /* 2026-09-09 与 UBK 办理中心对齐（唐美芳：「主要以 ubk 为主，我看现在 uom 和
         ubk 的列表字段还是对不齐的，请你整合，只不过 uom 里多供应商和当前办理人字段」）。
         查询项按 UBK 的顺序拆成三格，另加「当前节点」——UBK 只有三档，
         众信自己的六步不能丢，改成筛选项而不是页签。 */
      { k: 'name', t: '办签人', ph: '支持模糊查询' },
      { k: 'no', t: '工单号', ph: '支持模糊查询' },
      { k: 'ord_no', t: '订单号', ph: '支持模糊查询' },
      { k: 'progress', t: '当前节点', type: 'sel',
        opts: [['P1', '待收料'], ['P2', '待审核'], ['P3', '待提交至官网'],
          ['P4', '待预约'], ['P5', '待出结果'], ['P6', '已完成']] },
      { k: 'country', t: '国家 / 目的地', type: 'sel', opts: uniq(function (w) { return w.country; }) },
      { k: 'continent', t: '洲', type: 'sel', opts: uniq(function (w) { return w.continent; }) },
      { k: 'visa_cat', t: '签证类型', type: 'sel', opts: uniq(function (w) { return w.visa_cat; }) },
      { k: 'product', t: '签证产品', type: 'sel', opts: uniq(function (w) { return w.product; }) },
      { k: 'crowd', t: '适用人群', type: 'sel', opts: uniq(function (w) { return w.crowd; }) },
      /* 承办专员筛选：顶部负载条点某个人就是往这里塞值 */
      { k: 'owner', t: '承办专员', type: 'sel', opts: uniq(function (w) { return w.owner; }) },
      /* 供应商维度（唐美芳 2026-09-04：「uom 里应该也能看到这个签证办理中心，
         供应商处理的进度……但是需要加入供应商字段」）。同一条签证多家在供，
         出结果慢、超期多的是哪一家，运营得能一眼筛出来。 */
      { k: 'supplier', t: '供应商', type: 'sel', opts: uniq(function (w) { return w.supplier; }) },
      {
        k: 'flag', t: '异常标记', type: 'sel',
        /* 「已挂起」这一项跟着挂起功能一起撤（2026-09-09）：入口没了，
           全库也没有一张 hold 的单，留着就是一个永远筛不出东西的选项。 */
        opts: [['overdue', '已超过办结截止日'], ['supp', '补料未回'], ['none', '无异常']],
        get: function (w) {
          return w.overdue ? 'overdue' : w.supp_no ? 'supp' : 'none';
        }
      }
    ]);
    var hit = q.filter(j.list);
    /* 页签只留真实的工单状态。「超期」不是状态而是标记（一张待审核的工单也可能超期），
       它已经在查询卡的「异常标记」里，做成页签会和状态页签互相打架。 */
    /* 页签与 UBK 统一成三档（待收料 / 处理中 / 已出结果）。六步没有丢：
       列里仍然显示到具体节点，要按节点挑就用查询卡的「当前节点」。
       原来这里是六个页签，跟供应商那边对不上，两边的人在电话里说的不是同一个词。 */
    var defs = [{ k: 'all', t: '全部', fn: function () { return true; } }].concat(
      UBKWO_TABS.map(function (x) {
        return { k: x[0], t: x[1], fn: function (w) { return w.stage === x[0]; } };
      }));
    var t = subTabs('woboard', defs, hit, 'all');
    var so = sorter('woboard', [
      ['材料通过数', function (w) { return (w.mat.total ? w.mat.pass / w.mat.total : 0); }],
      ['办结截止日', function (w) { return w.sla_due || ''; }]
    ].concat(AUD_SORTS));
    var pg = pager('woboard', so.sort(t.rows), 10);
    var cnt = function (k) { return j.list.filter(BUCKET_MAP[k]).length; };
    var band = kpiBand('woboard', [
      { t: '在办工单', n: j.list.filter(function (w) { return w.status !== 'done' && w.progress !== 'P6'; }).length,
        unit: '单', sub: '共 ' + j.list.length + ' 单', tab: 'all' },
      /* 页签 2026-09-09 改成三档后，这些格子不能再跳页签（页签里已经没有「待审核」
         这种六步名字了），改成往查询卡里塞「当前节点」。点击效果一样，
         区别只是筛选条件写在查询卡里、看得见也改得掉。 */
      { t: '待收材料', n: cnt('待收料'), unit: '单', sub: '发送填写链接提醒客户',
        q: { progress: 'P1' }, tone: 'act' },
      { t: '待我审材料', n: cnt('待审核'), unit: '单', sub: '进入即可逐项核',
        q: { progress: 'P2' }, tone: 'act' },
      { t: '待提交至官网', n: cnt('待提交至官网'), unit: '单',
        sub: '先译成英文，再去官网录', q: { progress: 'P3' }, tone: 'act' },
      { t: '待预约', n: cnt('待预约'), unit: '单', sub: '取号并与客户确认时间',
        q: { progress: 'P4' } },
      { t: '待出结果', n: cnt('待出结果'), unit: '单', sub: '等使领馆签发',
        q: { progress: 'P5' } },
      { t: '补料未回', n: cnt('补料未回'), unit: '单', sub: '每单上限 3 次',
        q: { flag: 'supp' }, tone: 'warn' },
      { t: '已超期', n: cnt('超期'), unit: '单', sub: '需立即介入', q: { flag: 'overdue' }, tone: 'bad' }
    ]);
    /* 唐美芳 2026-09-01：「我的工单台是不是这个名字有点奇怪，应该叫国家签证办理中心」
       「送签批次和资料返还的操作是不是也可以并进我的工单台里」。
       改名之外，把送签批次与资料返还收成这一页的两个页签——
       它们是跨订单的批量对象（一次送馆的一批护照 / 一次寄回的包裹），
       列表本身不能拆掉，但没必要各占一个菜单。 */
    m.innerHTML = pageH(menuName('board', '国家签证办理中心'),
      /* 2026-09-09 唐美芳定的分工：「签证办理中心现在主要就是 ubk 干活，
         uom 只是查看整体节奏和协助操作，所以主要以 ubk 为主」。
         页签、列、操作都按 UBK 那套对齐，本页只多「供应商」与「当前办理人」两列。 */
      '一位办签人 = 一张签证工单（VW 单号）。工单在财务确认收款到账后进入这里，' +
      '<b>办结截止日</b>按套餐承诺时效自动算出。<b>办理主要由供应商在其门户完成</b>，' +
      '本页用于掌握整体节奏与协助操作，页签与操作与供应商侧一致：' +
      '<b>待收料 → 处理中 → 已出结果</b>。' +
      '众信内部的六步节点（待审核 / 待提交至官网 / 待预约 / 待出结果）没有取消，' +
      '在「办理状态」列里显示到具体节点，要按节点挑用查询区的<b>「当前节点」</b>；' +
      '每一步的完整操作仍在工单详情页里。' +
      '补料未回、已超过办结截止日属于<b>异常标记</b>，在筛选区里挑，不占进度页签。',
      '') +
      woTopTabs('board') +
      /* 工单台空着的时候要说清楚「为什么空、下一步谁来做」。
         工单是财务确认收款到账那一刻才生成的，付了款没确认，这里就是一片白板
         （唐美芳 2026-09-02：「下订单后，怎么国家签证办理中心的数据怎么是空的……
         后续办签进度怎么流转啊，这个流程卡住断节了」）。 */
      (function () {
        if (!j.pending_gate) return '';
        /* 收款管理是财务的页面，专员身份没有这个菜单（uom/recv 是不存在的路由）。
           所以只有能进那一页的身份才给跳转链接，专员只看到「等谁来做」。 */
        var canGo = S.role === 'ops' || S.role === 'fin';
        var link = canGo ? '<a class="lnk" data-gogate>去收款管理确认 ›</a>' : '';
        return j.list.length
          /* 这条提示原来紧贴在页头下面，跟下面的 KPI 卡不在一个视觉层次上
             （唐美芳 2026-09-09 看截图：「提示文案样式是不是乱掉了，没有对齐」）。
             改成与 KPI 带同宽同圆角的告知条，左边一条竖线做标记。 */
          ? '<div class="note w wo-gate">另有 <b>' + j.pending_gate +
            '</b> 张已付款订单在等财务确认收款到账，确认后才会为每位办签人生成工单。' + link + '</div>'
          : '<div class="note w" style="margin:0 0 16px"><b>当前没有签证工单，' +
            '有 ' + j.pending_gate + ' 张已付款订单在等财务确认收款到账</b>' +
            '<div class="hint">工单是<b>财务确认收款到账那一刻</b>才生成的：' +
            '财务在「财务管理 › 收款管理」里核对水单、点「确认到账」，' +
            '系统才会为该订单的每位办签人各开一张工单派到这里，同时对供应商挂应付。' +
            link + '</div></div>';
      })() +
      /* 「操作说明」整块与「专员负载」条 2026-09-09 撤掉（唐美芳看截图后：
         「uom 我看列表上方的内容有点乱……操作说明和专员负载都去掉吧，放到筛选条件里」）。
         专员负载原来是一排人名卡片，点一下等于按承办专员筛——那件事查询区的
         「承办专员」下拉本来就能做，两个入口做同一件事，页面还长了一截。
         作业规范不该常驻在工作台顶部，它属于培训材料。 */
      band + q.html +
      '<div class="card">' + t.html +
        /* 列结构 2026-09-09 与 UBK 办理中心对齐（唐美芳：「请你整合，只不过 uom 里
           多供应商和当前办理人字段，其余操作和内容尽量保持一致」）。
           原来 UOM 是 12 列平铺（人群 / 国家·洲 / 签证类型 / 签证产品各占一列），
           跟 UBK 的 8 列对不上，两边看同一张单说的不是同一套字段。
           现在按 UBK 的分组合并：人群并进办签人下方、国家与产品并进「订单 / 产品」、
           状态并进「办理状态」；UOM 多出来的两列是**供应商**与**当前办理人**。 */
        /* 与 UBK 同一套列，本端多「供应商」与「当前办理人」。
           国家、签证类型 2026-09-09 放回独立列；「SLA 到期 / 办理时限」统一改叫
           「办结截止日」——她问「办理时限的意思是截止日期么，字段名称最好写清楚」。 */
        /* 订单号与签证产品拆成两列（唐美芳 2026-09-09：「订单、产品字段拆分开…
           和之前 uom 比较早的版本一样，以前的字段比较清晰」）。
           创建 / 最近操作用现成的 AUD_COLS（本端一直有，供应商侧这次才补）。 */
        '<div class="pad">' + table(so.cols(['工单号', '办签人', '国家 / 送签地', '签证类型',
            '订单号', '签证产品', '申请人材料', '办理状态', '签证结果', '办结截止日',
            '供应商', '当前办理人'].concat(AUD_COLS, ['操作'])),
          pg.rows, function (w) {
            /* 工单号下面原来重复一遍建单日期，审计列里已经有创建时间，这里不重复 */
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
              '<td style="min-width:130px">' + ubkMatCell(w) +
              (w.mat.reject ? '<div class="hint"><span class="tag bad">' + w.mat.reject +
                ' 项驳回</span></div>' : '') + '</td>' +
              /* 主标签用三档（与供应商侧同一个词），小字给六步中的具体节点——
                 众信自己的作业粒度不能丢，但对外口径要跟 UBK 一致。 */
              '<td class="nw"><span class="tag ' +
              (w.stage === 'G3' ? 'ok' : w.stage === 'G2' ? 'info' : 'plain') + '">' +
              esc(w.stage_text || '') + '</span>' +
              '<div class="hint">' + esc(w.progress_text || '') +
              (w.status === 'hold' ? ' · 已挂起' : '') +
              (w.supp_no ? ' · 补料中' : '') + '</div>' +
              (w.appt_at ? '<div class="hint">面签 ' +
                esc(String(w.appt_at).slice(5, 16)) + '</div>'
                : w.app_id ? '<div class="hint">已提交官网</div>' : '') + '</td>' +
              '<td class="nw">' + ubkResTag(w.visa_result) + '</td>' +
              '<td class="nw">' + (w.sla_due
                ? (w.overdue ? '<span class="tag bad">已超期</span><div class="hint">'
                  : '<div class="hint">') + d10(w.sla_due) + '</div>'
                : '<span class="hint">—</span>') + '</td>' +
              '<td class="nw">' + (w.supplier
                ? esc(w.supplier) : '<span class="hint">未派供应商</span>') + '</td>' +
              /* 一单两边各有一个负责人：众信承办专员 + 供应商经办人（2026-09-09） */
              '<td class="nw">' + (w.owner
                ? esc(w.owner) : '<span class="hint">未指派</span>') +
              (w.sup_owner_name
                ? '<div class="hint">供应商：' + esc(w.sup_owner_name) + '</div>' : '') +
              '</td>' +
              audTd(w) +
              /* 2026-09-09 唐美芳收窄：「uom 要不只放查看详情和签证结果登记这 2 个按钮好了」。
                 分工已经定了——**活主要在 UBK 干，UOM 是看整体节奏 + 协助**，
                 列表上摆一排办理动作反而像是在这儿办。
                 需要协助操作时进详情页，那里按钮一个不少（改派也在详情页右上角）。 */
              '<td><div class="btns">' +
              '<button class="btn sm p" data-wd="' + esc(w.no) + '">' +
              esc(w.supp_no ? '查看详情 · 补料未回'
                : w.mat.review ? '查看详情 · 待审 ' + w.mat.review : '查看详情') + '</button>' +
              (w.stage !== 'G3'
                ? '<button class="btn sm" data-wres="' + w.applicant_id +
                  '">登记签证结果</button>' : '') +
              '</div></td>';
          }, '没有符合条件的工单') + '</div>' + pg.html + '</div>';
    woTabsBind(m);
    $$('[data-gogate]', m).forEach(function (a) {
      a.onclick = function () { go('recv'); };
    });
    q.bind(m, function () { S.cache['pg:woboard'] = 1; reload(); });
    t.bind(m, function () { S.cache['pg:woboard'] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:woboard'] = 1; reload(); });
    pg.bind(m, reload);
    kpiBand('woboard', null, m, reload);
    $$('[data-w]', m).forEach(function (b) { b.onclick = function () { go('board', b.dataset.w); }; });
    /* 列表上只剩「查看详情」和「登记签证结果」两个动作（2026-09-09 唐美芳收窄），
       填申请表 / 提交至官网 / 回填缴费 / 预约面签 / 改派都挪进了详情页。 */
    $$('[data-wd]', m).forEach(function (b) {
      b.onclick = function () { go('wo', b.dataset.wd); };
    });
    $$('[data-wres]', m).forEach(function (b) {
      b.onclick = function () {
        var aid = +b.dataset.wres;
        woResultAsk(j.list.filter(function (x) { return x.applicant_id === aid; })[0] || {}, reload);
      };
    });
  });
};

/* 工单里的操作日志：本办签人自己的动作标出来，其余是同订单的事件。
   一单多人时，不区分就看不出哪条是这位客人的
   （唐美芳 2026-09-01：「每个客人的签证办理，详情里也需要有详细的操作日志」）。 */
function woLogs(events) {
  if (!events || !events.length) return '<div class="empty">暂无动态</div>';
  return '<div class="tl wo-tl">' + events.map(function (e) {
    /* 时间拆成日期 + 时刻两行：19 个字符横排在 104px 的列里装不下，
       会溢出压到动作名上（唐美芳 2026-09-03 截图）。 */
    var t19 = d19(e.created_at);
    return '<div' + (e.mine ? ' class="mine"' : '') + '><time>' +
      esc(t19.slice(0, 10)) + '<i>' + esc(t19.slice(11)) + '</i></time>' +
      '<b>' + esc(e.action) + (e.mine ? '' : '<em class="ord">同订单</em>') + '</b>' +
      '<p>' + esc(e.detail || '') +
      (e.actor_name ? ' · ' + esc(e.actor_name) : '') + '</p></div>';
  }).join('') + '</div>';
}

function woDetail(m, no) {
  return api('/wo/detail?no=' + encodeURIComponent(no)).then(function (d) {
    var a = d.applicant, isLead = S.role === 'lead';
    /* 办签人资料缺哪几项——摘要行里直接点名，专员不用逐格找 */
    var miss = [['中文姓名', a.name_cn], ['英文姓名', a.name_en], ['性别', a.sex],
                ['出生日期', a.birth], ['证件号', a.id_no], ['证件有效期', a.id_expiry],
                ['签发地', a.id_place], ['国籍', a.nation], ['手机号', a.phone]]
      .filter(function (x) { return !x[1]; }).map(function (x) { return x[0]; });
    var openSupp = d.supps.filter(function (s) { return s.status === 'open'; })[0];
    m.innerHTML = pageH('工单 ' + d.no + ' · ' + d.name,
      esc(d.product) + ' · ' + esc(d.pkg) + ' · 订单 ' + esc(d.ord_no) + ' · 办结截止 ' + d10(d.sla_due) +
      (d.overdue ? ' <b style="color:#B42318">已超期</b>' : ''),
      '<div class="btns"><button class="btn" data-back>返回工单台</button>' +
      /* 「挂起工单」2026-09-09 按唐美芳意见撤掉（「挂起功能感觉没必要吧」）——
         全库工单没有一张用过这个状态，真要暂缓办理，走订单侧的取消 / 退款更说得清。
         状态字段与筛选保留，历史数据仍能查。 */
      '</div>') +
      card('办理进度 <span>点击任一节点可推进；跳段推进时中间环节自动补齐</span>',
        '<div class="pad">' + steps(a.progress, !isLead) +
        (d.status === 'hold'
          ? '<div class="note w">工单已挂起：' + esc(d.hold_reason || '') + '</div>'
          : (function () {
            /* 「此刻该做什么」写在进度条下面，与列表按钮、页签取同一份 NEXT_ACT。
               专员点进来第一眼就知道下一步动作，不用自己对着状态猜
               （唐美芳 2026-09-01 语音：「下一步操作是不是能到下一个 tab 页签的状态流转」）。 */
            if (d.supp_no) {
              return '<div class="wo-next warn"><b>下一步：等待客户补交材料</b>' +
                '<s>补料单 ' + esc(d.supp_no) + ' 已发出，客户补齐后回到材料审核。' +
                '也可以在下方材料表里直接标记「已收到」。</s></div>';
            }
            var n = NEXT_ACT[a.progress];
            if (!n) return '';
            return '<div class="wo-next"><b>下一步：' + esc(n[0]) + '</b>' +
              '<s>' + esc(n[1]) + '</s></div>';
          })()) +
        '</div>') +
      /* 布局 2026-09-01 重排（唐美芳：「客户订单信息、操作日志放在右侧一小块感觉放不下，
         你重新调整下布局吧」）：
           办理进度（通栏）→ 客户与订单（通栏横排）→ 材料审核（通栏，表格要宽）
           → 官方申请表 + 办理信息（两栏）→ 操作日志（通栏）
           办理动作按钮从卡片里挪到页面底部的吸底条，滚到哪都点得到。 */
      /* 客人填了什么，专员在这一页就要能看见——不然「材料齐不齐、表填没填」
         全靠猜（唐美芳 2026-09-02：「也没有反显客人填写的资料内容，
         正常应该可以查看」）。这一栏把送签基础资料逐项列出来，缺哪项标红。 */
      /* 「客人已填的签证资料」与「客户与订单」2026-09-03 合并成一个「工单信息」。
         两张卡原来都摆了办签人姓名、证件、有效期、联系方式、人群，重复五处；
         「客户与订单」这个叫法也不像后台用语（唐美芳：「名字很少有这么叫的」）。
         合并后左边是这个人的资料（缺项标红，专员一眼看出还差什么），
         右边是这一单的产品与要求，两栏并排，一屏看全。 */
      /* 工单信息 2026-09-03 再瘦身：办签人的中文名/英文名/性别/生日/护照号/有效期/
         签发地/国籍这 8 项，**和下面「官方申请表」里 OCR 带出的格子是同一批数据**，
         摆两遍等于把同一份资料抄了两份（唐美芳：「工单信息里的基本资料与官方填写的
         资料有没有重合，这部分信息模块有点太大了」）。
         这里压成一行摘要 + 缺项提醒，要看逐格明细点下面的申请表。
         按钮也全撤了——同一个动作只留一个入口，都收进底部操作条。 */
      card('工单信息',
        '<div class="pad">' +
        '<div class="wo-who' + (miss.length ? ' bad' : '') + '">' +
        '<b>' + esc(a.name_cn || '—') + '</b>' +
        (a.name_en ? '<em>' + esc(a.name_en) + '</em>' : '') +
        '<s>' + [a.sex, d10(a.birth), (a.id_type || '证件') + ' ' + (a.id_no || ''),
                 a.id_expiry ? d10(a.id_expiry) + ' 到期' : '', d.crowd, a.phone]
          .filter(function (x) { return x && String(x).trim() && String(x).trim() !== '证件'; })
          .map(esc).join(' · ') + '</s>' +
        (miss.length
          ? '<i class="wo-miss">还差 ' + miss.length + ' 项：' + esc(miss.join('、')) + '</i>'
          : '<i class="wo-ok">资料已录齐，送签前仍可改</i>') +
        '</div>' +
        '<div class="wo-kv">' +
        [['订单号', '<span class="mono">' + esc(d.ord_no) + '</span>　' +
           '<a class="lnk" data-ord="' + esc(d.ord_no) + '">查看订单 ›</a>'],
         ['订单状态', esc(d.order.status_text)],
         ['渠道', ({ C: '直客 C 端', CSP: '门店销售', B: '同业渠道' }[d.order.channel] || d.order.channel)],
         ['供应商产品', esc(d.sup_product)],
         ['国家 / 洲', esc(d.country || '—') + '　<s>' + esc(d.continent || '') + '</s>'],
         ['签证类型', esc(d.visa_cat || d.visa_type || '—')],
         ['领区', esc(a.consulate_region || '—')],
         ['出行日期', d10(d.order.depart_date) || '未填'],
         ['面签要求', (d.need_interview ? '需面签' : '免面签') +
           (d.need_fingerprint ? ' · 需录指纹' : '')]
        ].map(function (kv) {
          return '<div><i>' + kv[0] + '</i><b>' + kv[1] + '</b></div>';
        }).join('') + '</div></div>') +

      /* 这一块在不同节点是两副面孔（唐美芳 2026-09-03：「在客人未填写之前，
         也不需要审核啊，所以这个审核清单存在的意义是什么」——问得对）：
           待收料：客人一份没交，没有东西可审，它是<b>待收清单</b>，
                   作用是「还差什么、催谁交」，动作是整体催一次；
           待审核起：客人交上来了，这才是<b>材料审核</b>，逐项核、不合格的打包补料。
         另外「还差 N 项」只算<b>客人该交的必交项</b>——
         建议项不交也能送签，我方产出项（DS-160 确认页 / 预约单 / 缴费收据）
         客人手上根本没有，都算进去会让专员去催根本催不到的东西。 */
      card((a.progress === 'P1' ? '待收材料' : '材料审核') +
        ' <span>客户尚需提交 <b>' + d.mat.cust_wait + '</b> / ' + d.mat.cust_must + ' 项必交' +
        (d.mat.opt_wait ? '，另有 ' + d.mat.opt_wait + ' 项建议材料可补强' : '') +
        (d.mat.ours_total ? '；另有 ' + d.mat.ours_total +
          ' 项我方办出的凭证在「办理信息」里' : '') +
        (d.mat.review ? '；待审 ' + d.mat.review + ' 项' : '') + '</span>',
        /* 表头第一格放全选（唐美芳 2026-09-03：「勾选打包成补料单，支持全部勾选」）。
           全选只勾<b>还没通过</b>的那些——已通过的本来就没有勾选框，
           一次补料把已过的也带上，客人会以为交过的东西又不合格了。 */
        /* 客人的材料清单只列<b>客人要提供的</b>。DS-160 确认页 / 面签预约确认单 /
           签证费收据这三项是我方办出来的凭证，挂在客人清单里既催不动也占位置，
           2026-09-03 挪到「办理信息」块——它们本来就是办理过程的产物
           （唐美芳：「按照你说的改」）。 */
        /* 免面签单必须当面提示专员（唐美芳 2026-09-07：「有一些要紧的内容，
           重点提示下文案提醒操作人员就好」）：这类单的护照原件要真的寄进来，
           收料动作跟需面签的单完全不同——需面签的客人只传扫描件预审、原件自己带去使领馆。 */
        (d.need_interview === 0
          ? '<div class="note b" style="margin:0 12px 10px"><b>本单为免面签办理，' +
            '护照等原件须由客户寄交</b>：原件寄到本单的收料地址，' +
            '由我方或供应商统一交至指定网点 / 由快递上门取件送使领馆，出结果后原路寄回。' +
            '<div class="hint">下方清单中标注「邮寄 / 自送」的项即为需寄交原件的材料；' +
            '仅标「电子上传」的传扫描件即可。收到原件后请当面清点并在操作日志中记录。</div></div>'
          : '<div class="note" style="margin:0 12px 10px"><b>本单需本人面签，' +
            '原件由客户面签当日自带</b>，此处只收扫描件用于预审，' +
            '<b>请勿要求客户邮寄原件</b>。</div>') +
        '<div class="pad scrollx">' + table(
          (a.progress === 'P1'
            ? ['', '资料名称', '属性 / 方式 / 份数', '谁来提供', '状态', '']
            : ['<input type="checkbox" style="width:auto;height:auto" data-mall title="全选未通过项">',
               '资料名称', '属性 / 方式 / 份数', '客户上传', 'AI 预审', '状态', '操作']),
          d.materials.filter(function (x) { return !x.by_us; }), function (i) {
            /* 待收料这一步表格是<b>只读清单</b>：客人一份没交，没有东西可审，
               逐行摆 10 个「催客人上传」，专员得点 10 次，还都是同一件事
               （唐美芳 2026-09-03：「在客人未填写之前，也不需要审核啊」）。
               这一步唯一要做的是让客人去交 —— 一个动作，收在卡片下面。
               到了待审核，客人交上来了，逐项动作和勾选补料才有意义。 */
            var p1 = a.progress === 'P1';
            if (p1) {
              return '<td></td>' +
                '<td><b>' + esc(i.mat_name) + '</b>' +
                (i.by_us ? ' <span class="tag info">我方办理</span>'
                  : i.necessity === 'must' ? ' <span class="tag bad">必须</span>'
                    : ' <span class="tag plain">建议</span>') +
                '<div class="hint">' + esc(i.require_text || '') + '</div></td>' +
                '<td class="hint">' + esc(i.attr_text) + ' · ' + esc(i.way_text) +
                ' · ' + i.copies + ' 份</td>' +
                '<td class="hint nw">' + (i.by_us
                  ? ({ 'DS-160 确认页': '我方 · 官网填完表后',
                       '面签预约确认单': '我方 · 约到号后',
                       '签证费收据': '我方 · 缴费后' }[i.mat_name] || '我方办出后回填')
                  : '客户提供') + '</td>' +
                '<td>' + matTag(i.status) + '</td><td></td>';
            }
            return '<td>' + (i.status === 'pass' ? ''
              : '<input type="checkbox" style="width:auto;height:auto" data-mi="' + i.id + '">') +
              '</td>' +
              '<td><b>' + esc(i.mat_name) + '</b>' +
              (i.by_us ? ' <span class="tag info">我方办理</span>'
                : i.necessity === 'must' ? ' <span class="tag bad">必须</span>'
                  : ' <span class="tag plain">建议</span>') +
              '<div class="hint">' + esc(i.require_text || '') + '</div></td>' +
              '<td class="hint">' + esc(i.attr_text) + ' · ' + esc(i.way_text) + ' · ' + i.copies + ' 份</td>' +
              '<td class="hint">' + matFile(i) + '</td>' +
              '<td class="hint" style="max-width:220px">' + esc(i.ai_msg || '') + '</td>' +
              '<td>' + matTag(i.status) + (i.reject_reason ? '<div class="hint" style="color:#B42318">' + esc(i.reject_reason) + '</div>' : '') + '</td>' +
              '<td class="nw"><div class="btns">' + sampleBtn(i) +
              /* 未提交时能做什么，要看这项材料是怎么交的
                 （唐美芳 2026-09-02：「详情里面标记已收到是什么意思，
                 这时候客人的资料还没填呢，怎么能标记已收到呢」）：
                   · 只能电子上传的 → 客人没传，我们手上什么都没有，
                     标「已收到」是假动作，只给「催客人上传」；
                   · 可以邮寄/自送的 → 客人把原件寄来、专员签收，
                     这才是真的「签收原件」，按钮也照实叫这个名；
                   · 面签当天自带的 → 根本不经我们的手，标成「客人自带」。 */
              (isLead ? '' : (
                i.status === 'review'
                  ? '<button class="btn sm ok" data-pass="' + i.id + '">审核通过</button>' +
                    '<button class="btn sm bad" data-rej="' + i.id + '">驳回</button>'
                  : i.status === 'pass'
                    ? '<button class="btn sm" data-rej="' + i.id + '">撤回通过</button>'
                    : (function (ws) {
                      /* 我方办出来才有的（DS-160 确认页 / 面签预约确认单 / 签证费收据）
                         不能催客人——他手上根本没有，催也交不出来（唐美芳 2026-09-03）。
                         这几项等专员走到对应节点、办完之后回填。 */
                      if (i.by_us) {
                        return '<span class="hint">' +
                          ({ 'DS-160 确认页': '官网填完表后打印上传',
                             '面签预约确认单': '约到号后下载上传',
                             '签证费收据': '缴费后上传' }[i.mat_name] || '我方办出后回填') +
                          '</span>';
                      }
                      if (ws.indexOf('mail') >= 0) {
                        return '<button class="btn sm ok" data-pass="' + i.id + '">签收原件</button>';
                      }
                      if (ws.length === 1 && ws[0] === 'carry') {
                        return '<span class="hint">面签当日由客户自带</span>';
                      }
                      /* 到了「待审核」，客人可能是线下把材料给专员的（微信、邮件、当面），
                         系统里还挂着「未提交」。这时候除了催，也得让专员能直接标通过。 */
                      return '<button class="btn sm" data-urge="' + i.id + '">提醒客户上传</button>' +
                        (a.progress === 'P2'
                          ? '<button class="btn sm ok" data-pass="' + i.id + '">已收到 · 通过</button>'
                          : '');
                    })(i.provide_way || [])
              )) + '</div></td>';
          }) +
        '<div class="btns" style="margin-top:14px">' +
        (isLead ? ''
          : a.progress === 'P1'
            /* 待收料只有一个动作：让客人去交。补料单是「交了但不合格」才用的，
               这一步客人一份没交，发补料单不合适。 */
            ? '<button class="btn r" data-shareinfo>发送提交链接至客户</button>' +
              '<span class="hint" style="align-self:center">' +
              '客户打开链接后可逐项上传，提交齐备后自动转入「待审核」</span>'
            : '<button class="btn r" data-supp>将勾选项打包成补料单</button>' +
              '<span class="hint" style="align-self:center">已发出 ' + d.supps.length +
              ' 次补料，上限 3 次</span>') +
        '</div></div>') +

      (openSupp ? card('进行中的补料单', '<div class="pad"><div class="note w"><b>' + esc(openSupp.no) +
        '</b> 第 ' + openSupp.round + ' 次 · 截止 ' + d19(openSupp.due_at) + '<br>' +
        esc(openSupp.reason || '') + '</div></div>') : '') +

      /* 原来这里是两列布局：左「官方申请表」右「办理信息」。
         2026-09-03 把办理信息改成按节点出现之后，待收料这几步右列是空的，
         申请表卡旁边就空出一大块（唐美芳截图指出）。
         改成两张卡各自占满一行，卡内用多列网格铺开，不再靠外层分栏。 */
      (d.form
        ? card('官方申请表 <span>与填表页是同一张表，改哪边都一样</span>',
          '<div class="pad"><div class="kv wide">' +
          '<dt>状态</dt><dd><span class="tag ' +
          ({ wait: 'warn', filling: 'info', submitted: 'info',
             confirmed: 'ok', official: 'ok' }[d.form.status] || 'plain') + '">' +
          esc(d.form.status_text) + '</span>' +
          (d.form.filled_by_text ? ' · ' + esc(d.form.filled_by_text) : '') + '</dd>' +
          '<dt>完成度</dt><dd><b>' + d.form.stat.filled + '</b> / ' + d.form.stat.fillable +
          ' 格（系统带出 ' + d.form.stat.auto + '）</dd>' +
          '<dt>还差</dt><dd>' + (d.form.miss.total
            ? '<b style="color:#B42318">' + d.form.miss.total + ' 格必填</b>' +
              (d.form.miss.ask ? ' · 客户待答 ' + d.form.miss.ask : '') +
              (d.form.miss.agent ? ' · 需专员补 ' + d.form.miss.agent : '')
            : '<span class="tag ok">必填已齐</span>') + '</dd>' +
          '<dt>分享链接</dt><dd>' + (d.form.shared
            ? '<span class="tag info">有效至 ' + d10(d.form.share_expire) + '</span>'
            : '未发出') + '</dd>' +
          '<dt>Application ID</dt><dd class="mono">' +
          esc(d.form.official_app_id || '未回填') + '</dd>' +
          /* 「生成客户填写链接」与底部操作条的「发链接给客人填」是同一个动作，
             2026-09-03 撤掉这一颗，只留「打开并填写」——那是进这张表本身，
             跟本模块强绑定，留在卡里合理。 */
          '</div><div class="btns" style="margin-top:14px">' +
          '<button class="btn p" data-wform>打开并填写</button>' +
          (d.form.stat && d.form.stat.filled
            ? '<button class="btn" data-wceac>官网填表对照单</button>' : '') +
          '</div></div>')
        : card('官方申请表', '<div class="pad"><div class="note w">' +
          '该国家尚无已发布的官方申请表模板，本单没有在线填表环节。' +
          '如需启用，请在「签证管理 › 签证配置 › 国家签证表模板」中发布对应版本。' +
          '</div></div>')) +

      /* 「办理信息」2026-09-03 改成<b>按节点出现</b>：待收料这一步，
         受理号 / 缴费 / 预约 / 批次 / 结果 / 行政审查 / 责任判定 七行全是「未回填」，
         专员一行有用的都读不到，纯噪音（唐美芳：「现在收料操作有点复杂」）。
         规则：已经回填过的照常显示（是事实），没回填的只显示<b>当前节点及之前</b>该有的，
         再往后的还没轮到，不摆出来。整块都没内容时连卡片一起收掉。 */
      (function () {
        var PORDER2 = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
        var P = PORDER2.indexOf(a.progress);
        function show(minP, has) { return has || P >= PORDER2.indexOf(minP); }
        var rows = [];
        if (show('P3', !!a.app_id)) {
          rows.push(['<dt>' + esc(d.official_id_name || '官网受理号') + '</dt><dd>' +
            esc(a.app_id || '未回填') + (a.barcode ? ' / 条码 ' + esc(a.barcode) : '') + '</dd>']);
        }
        if (show('P4', !!a.cgi_receipt)) {
          rows.push(['<dt>缴费收据</dt><dd>' + (a.cgi_receipt
            ? esc(a.cgi_receipt) + (a.fee_amount ? ' · ¥' + money(a.fee_amount) : '')
            : (a.progress === 'P4'
              ? '<b style="color:#B42318">未缴费 · 预约前必须先缴并回填收据号</b>'
              : '未缴费')) + '</dd>']);
        }
        if (show('P4', !!a.appt_no)) {
          rows.push(['<dt>面签预约</dt><dd>' + (a.appt_no
            ? esc(a.appt_no) + ' · ' + d19(a.appt_at) + ' · ' + esc(a.appt_place || '') +
              (a.appt_change ? ' <span class="tag warn">已改期 ' + a.appt_change + ' 次</span>' : '')
            : '未预约') + '</dd>']);
        }
        if (show('P5', !!a.batch_id)) {
          rows.push(['<dt>送签批次</dt><dd>' + (a.batch_id ? '批次 #' + a.batch_id : '未并批') + '</dd>']);
        }
        if (show('P5', !!d.result_text)) {
          rows.push(['<dt>签证结果</dt><dd>' + (d.result_text
            ? '<span class="tag ' + (a.visa_result === 'pass' ? 'ok' : 'bad') + '">' +
              esc(d.result_text) + '</span>' +
              (a.visa_no ? ' 签证号 ' + esc(a.visa_no) + '，有效期至 ' + d10(a.visa_valid_to) : '') +
              (a.reject_reason ? ' · ' + esc(a.reject_reason) : '') +
              (a.reject_cate ? ' <span class="tag plain">' + esc(a.reject_cate) + '</span>' : '')
            : '未出结果') + '</dd>']);
        }
        if (a.ap_due) {
          rows.push(['<dt>行政审查</dt><dd>需于 ' + d10(a.ap_due) + ' 前人工复查（官方无 API）</dd>']);
        }
        /* 判「有没有判定过」要看原始字段，不能看 liability_text——
           后端给它兜了个「未判定」的文案，永远是真值，一路显示到待收料工单上。 */
        if (show('P6', !!(a.liability && a.liability !== 'none'))) {
          rows.push(['<dt>责任判定</dt><dd>' + esc(d.liability_text || '未判定') + '</dd>']);
        }
        /* 我方办出来的三份凭证（DS-160 确认页 / 面签预约确认单 / 签证费收据）
           从客人材料清单挪到这里——它们是办理过程的产物，跟上面的受理号、
           缴费收据、预约号是同一类东西，专员在同一块里就能看全「我这边办到哪、
           凭证收齐没有」（唐美芳 2026-09-03）。 */
        var ours = (d.materials || []).filter(function (x) { return x.by_us; });
        ours.forEach(function (x) {
          var when = { 'DS-160 确认页': '官网填完表后打印上传',
                       '面签预约确认单': '约到号后下载上传',
                       '签证费收据': '缴费后上传' }[x.mat_name] || '办出后上传';
          rows.push(['<dt>' + esc(x.mat_name) + '</dt><dd>' +
            (x.status === 'pass'
              ? '<span class="tag ok">已上传</span>' +
                (x.file_name ? ' <span class="hint">' + esc(x.file_name) + '</span>' : '')
              : x.status === 'review'
                ? '<span class="tag warn">待审核</span>'
                : '<span class="hint">' + esc(when) + '</span>') + '</dd>']);
        });
        if (!rows.length) return '';
        return card('办理信息 <span>提交、缴费、抢号、递交、采指纹由人工在官方渠道完成后回填；' +
          '还没轮到的节点不在这里显示</span>',
          '<div class="pad"><div class="kv wide">' + rows.join('') + '</div></div>');
      })() + '' +
      (false ? card('办理信息', '<div class="pad"><div class="kv">' +
        /* 受理号的叫法按国家取（后端 official_id_name）：
           美国 Application ID、澳洲 TRN、申根 VFS 受理号——专员看到的是他在
           官网上真实看到的那个词（唐美芳 2026-09-02 问流程能否扩展到其他国家）。 */
        '<dt>' + esc(d.official_id_name || '官网受理号') + '</dt><dd>' +
        esc(a.app_id || '未回填') + (a.barcode ? ' / 条码 ' + esc(a.barcode) : '') + '</dd>' +
        /* 缴费不是可有可无的一栏：官方预约系统要「护照号 + 缴费收据编号 + 受理号」
           三样才放行，缺一样就约不上号。走到「待预约」还没缴费的，这里直接标红提醒。 */
        '<dt>缴费收据</dt><dd>' + (a.cgi_receipt
          ? esc(a.cgi_receipt) + (a.fee_amount ? ' · ¥' + money(a.fee_amount) : '')
          : (a.progress === 'P4'
            ? '<b style="color:#B42318">未缴费 · 预约前必须先缴并回填收据号</b>'
            : '未缴费')) + '</dd>' +
        '<dt>面签预约</dt><dd>' + (a.appt_no ? esc(a.appt_no) + ' · ' + d19(a.appt_at) + ' · ' + esc(a.appt_place || '') +
          (a.appt_change ? ' <span class="tag warn">已改期 ' + a.appt_change + ' 次</span>' : '') : '未预约') + '</dd>' +
        '<dt>送签批次</dt><dd>' + (a.batch_id ? '批次 #' + a.batch_id : '未并批') + '</dd>' +
        '<dt>签证结果</dt><dd>' + (d.result_text ? '<span class="tag ' + (a.visa_result === 'pass' ? 'ok' : 'bad') + '">' +
          esc(d.result_text) + '</span>' + (a.visa_no ? ' 签证号 ' + esc(a.visa_no) + '，有效期至 ' + d10(a.visa_valid_to) : '') +
          (a.reject_reason ? ' · ' + esc(a.reject_reason) : '') + (a.reject_cate ? ' <span class="tag plain">' + esc(a.reject_cate) + '</span>' : '')
          : '未出结果') + '</dd>' +
        '<dt>行政审查</dt><dd>' + (a.ap_due ? '需于 ' + d10(a.ap_due) + ' 前人工复查（官方无 API）' : '—') + '</dd>' +
        '<dt>责任判定</dt><dd>' + esc(d.liability_text || '未判定') + '</dd>' +
        '</div></div>') : '') +
      card('操作日志 <span>本办签人的动作单独标注，其余为同订单事件</span>',
        '<div class="pad">' + woLogs(d.events) + '</div>') +

      /* 办理动作吸底：这些按钮是专员在这一页最常点的东西，
         原来埋在中间某张卡里，滚下去就够不着了（唐美芳 2026-09-01：
         「办理操作按钮看看是不是可以吸底或吸顶」）。 */
      (isLead ? '' : (function () {
        /* 底部动作按当前进度给，不再一次摆七个
           （唐美芳 2026-09-02：「正常这个流程下的操作应该只有填写资料按钮」）。
           在「待收料」这一步摆着「回填签证结果」「资料返还寄出」，专员根本不知道
           该点哪个，也容易误点把进度跳过去。每一步只留这一步真正要做的，
           外加一个「更多操作」兜住例外情况（补录、跳步、纠错）。 */
        var P = a.progress;
        /* 2026-09-03 改成<b>严格按节点</b>：不属于当前这一步的动作一个都不渲染。
           上一版是「主按钮 + 更多操作抽屉」，抽屉里那些还是能点，等于没约束
           （唐美芳：「虽然你是把按钮收起了，但还是能继续看到并且操作……
           我最终要的是，不到那个 tab 页签节点下，就完全看不见操作按钮，
           一步一步引导操作人员操作」）。
           ⚠️ 代价：补录 / 跳步 / 纠错的口子一起没了。回填错了要改，只能等进度
           走到对应节点，或由主管在工单列表里回退。这一条已经跟她说明。 */
        var main = [];
        var B = {
          fill:   '<button class="btn r" data-fill>代客户填写资料</button>',
          share:  '<button class="btn" data-shareinfo>发送填写链接至客户</button>',
          ceac:   '<button class="btn" data-ceac>官网填表对照单</button>',
          /* 中译英：客人填的是中文，DS-160 官网只收英文/拼音，这一步 2026-09-03 才补上
             （唐美芳：「填写完所有资料后，还得翻译成英文……最后才是提交到官网」）。
             排在「提交至官网」前面——没英文就去官网，等于到了那边现翻。 */
          en:     '<button class="btn' + (d.form && d.form.en_left ? ' r' : '') +
                  '" data-en>生成/核对英文' +
                  (d.form && d.form.en_left ? ' · 还差 ' + d.form.en_left + ' 格' : '') +
                  '</button>',
          form:   '<button class="btn r" data-form>提交至官网并回填</button>',
          fee:    '<button class="btn' + (a.cgi_receipt ? '' : ' r') + '" data-fee>' +
                  (a.cgi_receipt ? '修改缴费记录' : '回填 CGI 缴费') + '</button>',
          appt:   '<button class="btn r" data-appt>' + (a.appt_no ? '改期预约' : '登记预约') + '</button>',
          batch:  '<button class="btn" data-batch>并入送签批次</button>',
          result: '<button class="btn r" data-result>回填签证结果</button>',
          liab:   '<button class="btn" data-liab>责任判定</button>',
          deliver:'<button class="btn" data-deliver>资料返还寄出</button>',
          /* 「待审核」这一步专员要做的是<b>审</b>，可原来底栏只有「帮客人填资料 / 发链接」，
             逐项的审核按钮又只在客人已提交(review)的行上才出现——客人线下把材料
             发到微信、专员手上已经有了，页面上却一个能点的都没有
             （唐美芳 2026-09-03：「待审核状态，没有审核通过、驳回按钮」）。 */
          passall:'<button class="btn r" data-passall>材料审核通过</button>',
          suppgo: '<button class="btn" data-suppgo>有问题 · 发补料单</button>'
        };
        /* 每一步只有这一步该做的事。下一步是什么写在左边，专员照着走就行。 */
        var NEXT = {
          P1: '资料收齐后自动转「待审核」',
          P2: '材料审过后转「待提交至官网」；有不合格的勾选打包成补料单发回',
          P3: '先把中文译成英文，再照对照单去 CEAC 官网录入、回填受理号后转「待预约」',
          P4: '缴费收据与预约号都回填后转「待出签」',
          P5: '使领馆出结果后回填，转「已完成」',
          P6: ''
        };
        if (P === 'P1') {
          /* 待收料：客人资料还没齐，专员要做的就是让资料进来 */
          main = [B.fill, B.share];
        } else if (P === 'P2') {
          /* 待审核：逐项审在上面那张表里，底部给整体的通过 / 驳回 */
          main = [B.passall, B.suppgo, B.fill];
        } else if (P === 'P3') {
          main = [B.en, B.ceac, B.form, B.fill];
        } else if (P === 'P4') {
          main = [B.fee, B.appt];
        } else if (P === 'P5') {
          /* 需面签的产品（美国这类）客人本人到馆，材料不经我们的手，
             没有「送签批次」这一步（唐美芳 2026-09-03：「待出签状态，不需要送签了，
             现在签证中心都是线上办理了」）。免面签、要把材料交给签证中心代传递的
             （日本、澳洲、部分申根）仍然有，所以是按产品判断而不是删功能。 */
          main = d.need_interview ? [B.result] : [B.result, B.batch];
        } else {
          /* 同理：需面签的，护照由使领馆/中信银行直接寄回客人，不经我们的手，
             没有「资料返还寄出」（唐美芳：「也不存在资料返还，一般都是大使馆直接寄回了」）。 */
          main = d.need_interview ? [B.liab] : [B.deliver, B.liab];
        }
        return '<div class="wo-bar">' +
          '<div class="bar-ctx">工单 <span class="mono">' + esc(d.no) + '</span>' +
          '<s>' + esc(a.name_cn) + ' · ' + esc(d.country || '') +
          (d.visa_cat || d.visa_type ? ' ' + esc(d.visa_cat || d.visa_type) : '') +
          ' · 第 ' + (P || 'P1').slice(1) + ' 步 ' + esc(progText(a.progress)) +
          (d.status === 'hold' ? ' · 已挂起' : '') +
          (NEXT[P] ? '　→ ' + esc(NEXT[P]) : '') + '</s></div>' +
          '<div class="btns">' + main.join('') + '</div>' +
          '</div>';
      })());

    $('[data-back]', m).onclick = function () { go('board'); };
    $$('[data-ord]', m).forEach(function (a2) {
      a2.onclick = function () { go('odetail', a2.dataset.ord); };
    });
    var wf = $('[data-wform]', m);
    if (wf) wf.onclick = function () { S.cache.cfSec = null; go('tasks', d.form.task_id); };

    /* 帮客人填资料 / 发链接给客人填：待收料这一步真正该做的两件事 */
    var fillBtn = $('[data-fill]', m);
    if (fillBtn) fillBtn.onclick = function () { go('odetail', d.ord_no); };
    /* 全选：只勾还没通过的那些（已通过的行根本没有勾选框） */
    var mall = $('[data-mall]', m);
    if (mall) mall.onclick = function () {
      $$('[data-mi]', m).forEach(function (cb) { cb.checked = mall.checked; });
    };
    /* 材料区那颗「分享给客人填写」与底部的是同一个动作，
       专员在材料表下方就能发链接，不用再滚到页面底（唐美芳 2026-09-03 要求
       把整块的操作按钮摆在模块里）。 */
    /* 「发链接给客人填」只在底部操作条上有一处。上一版我在材料卡里也加了一颗，
       结果同一个动作在页面上出现三次（材料卡、申请表卡、底栏）——
       唐美芳 2026-09-03：「你现在这个页面的操作太分散了」。
       现在的规矩：**一个动作只留一个入口**，跨模块的动作一律收进底部操作条，
       只有跟本模块内容强绑定的才留在卡里（比如「打包成补料单」要配合材料勾选）。 */
    /* 生成链接统一走 core.js 的 shareTask()（2026-09-08 批 1）：
       原来这段在运营端、门店端、有米、客户端各写了一遍，弹窗措辞四个版本。 */
    $$('[data-shareinfo]', m).forEach(function (shBtn) {
      shBtn.onclick = function () { shareTask(a.id, a.name_cn); };
    });
    var fi = $('[data-fillinfo]', m);
    if (fi) fi.onclick = function () { S.cache.odJump = 'aps'; go('odetail', d.ord_no); };
    /* 「官网填表对照单」三个入口（工单信息里的、申请表卡里的、底部条的）绑同一个动作，
       用 $$ 全绑上——$ 只返回第一个。 */
    var enBtn = $('[data-en]', m);
    if (enBtn) enBtn.onclick = function () {
      if (!d.form || !d.form.task_id) return toast('该国家还没有已发布的申请表模板', true);
      confirmBox('生成英文译文',
        '客户填写的是中文，DS-160 官网仅接受英文。系统将<b>人名按护照拼音口径转换</b>、' +
        '<b>地址 / 单位 / 职位 / 职责由 AI 翻译</b>，通常需十余秒。<br><br>' +
        '<b>译文仅为草稿</b>——地址、单位名称一词之差即可能被使领馆问询，' +
        '请在「官网填表对照单」中逐项核对后再前往官网录入。',
        '开始生成')
        .then(function () {
          toast('正在翻译，请稍候…');
          return api('/task/en/gen', { id: d.form.task_id });
        })
        .then(function (r) { toast(r.msg || '已生成'); go('ceac', d.form.task_id); })
        .catch(function () { });
    };
    $$('[data-viewform], [data-wceac], [data-ceac]', m).forEach(function (ceacBtn2) {
      ceacBtn2.onclick = function () {
      if (!d.form || !d.form.task_id) return toast('该国家还没有已发布的申请表模板', true);
      go('ceac', d.form.task_id);
      };
    });
    /* 催客人上传：只能电子上传、客人还没传的材料，能做的就是催 */
    $$('[data-urge]', m).forEach(function (b) {
      b.onclick = function () {
        if (!d.form || !d.form.task_id) return toast('该国家还没有已发布的申请表模板', true);
        api('/task/share', { id: d.form.task_id, days: 7 }).then(function (r) {
          var url = location.origin + r.url;
          modal('提醒客户上传材料',
            '<div class="pad"><div class="hint" style="margin-bottom:10px">' +
            '该项材料须由客户本人上传，我方未持有原件，' +
            '<b>不能代为标记已收到</b>。请将下方链接发送至客户，客户打开后即可上传。</div>' +
            '<div class="sh-lk"><i>🔗</i><span>' + esc(url) + '</span></div>' +
            '<div class="btns" style="margin-top:12px">' +
            '<button class="btn p" data-cp3>复制链接</button></div></div>',
            [{ t: '关闭' }], true);
          $('[data-cp3]', m.ownerDocument).onclick = function () { doCopy(url); };
        }).catch(fail);
      };
    });
    /* data-wshare 这个入口在 2026-09-03「一个动作只留一个入口」时已从页面上撤掉，
       绑定留到今天是死代码，一并清掉（2026-09-08 批 1）。 */
    /* 五个官方渠道动作（提交/缴费/抢号/递交/采指纹）系统不能自动化，
       只能人工办完后回填凭证。所以推进这几个节点必须先填凭证，不能点一下就宣称已办。 */
    var NEED_PROOF = {
      P4: ['官网受理号', 'app_id', '在该国官方渠道提交后回填'],
      P5: ['CGI 缴费收据号', 'cgi_receipt', '在官方缴费渠道缴完后回填'],
      P6: ['面签预约号', 'appt_no', '在使领馆预约系统抢到号后回填'],
      P7: ['递交/面签受理号', 'submit_no', '现场递交或面签完成后回填'],
      P9: ['结果通知号', 'result_no', '官方出结果后回填，随后到「回填签证结果」录明细']
    };
    bindSteps(m, function (p) {
      var idx = PROG.map(function (x) { return x[0]; }).indexOf(p);
      var cur = PROG.map(function (x) { return x[0]; }).indexOf(a.progress);
      if (idx <= cur) return toast('进度只能向前推进。如需回退请挂起工单并说明原因', true);
      var nd = NEED_PROOF[p];
      var pre = nd ? ask('推进到「' + PROG[idx][1] + '」', [
        { type: 'html', html: '<div class="note w">官方渠道无对接接口，本节点须<b>人工办理完成后回填凭证</b>。' +
          nd[2] + '。</div><br>' },
        { k: 'proof', label: nd[0], required: true },
        { k: 'at', label: '实际办理日期', value: new Date().toISOString().slice(0, 10) }
      ], '确认已办理并推进') : Promise.resolve({});
      pre.then(function (f) {
        return api('/progress/set', { applicant_id: a.id, progress: p,
          proof: f.proof || '', proof_at: f.at || '' });
      }).then(function (r) {
        toast('进度已更新' + (r.auto_filled.length ? '（自动补齐 ' + r.auto_filled.join('、') + '）' : ''));
        reload();
      }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
    });
    bindSample(m);
    var pa = $('[data-passall]', m);
    if (pa) pa.onclick = function () {
      confirmBox('材料审核通过',
        '把这位办签人<b>必交且由客户提供</b>的材料一次性标为通过。' +
        '建议材料与我方办出的凭证（DS-160 确认页 / 预约单 / 缴费收据）不在其中。<br><br>' +
        '通过后必交项齐了就自动转入<b>「待提交至官网」</b>。' +
        '有不合格的请先用「有问题 · 发补料单」发回，不要一起放行。',
        '全部通过')
        .then(function () { return api('/mat/passall', { applicant_id: a.id }); })
        .then(function (r) { toast(r.msg || '已通过'); reload(); })
        .catch(function () { });
    };
    var sg = $('[data-suppgo]', m);
    if (sg) sg.onclick = function () {
      var card2 = $('.wo-mat-card', m) || m;
      var box = $('[data-mall]', m);
      if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('在材料表里勾出不合格的那几项，再点「将勾选项打包成补料单」');
    };
    $$('[data-pass]', m).forEach(function (b) {
      b.onclick = function () {
        api('/mat/review', { mat_id: +b.dataset.pass, action: 'pass' }).then(function (r) {
          toast(r.stat.ready ? '必交材料全部通过，进度自动推进到「材料已齐备」' : '已通过'); reload();
        }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    $$('[data-rej]', m).forEach(function (b) {
      b.onclick = function () {
        ask('驳回材料', [{ k: 'reason', label: '驳回原因', type: 'textarea', required: true, ph: '如：银行流水未加盖银行公章，且余额低于建议标准' }])
          .then(function (f) { return api('/mat/review', { mat_id: +b.dataset.rej, action: 'reject', reason: f.reason }); })
          .then(function () { toast('已驳回，可打包成补料单一次性通知客户'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    if ($('[data-supp]', m)) $('[data-supp]', m).onclick = function () {
      var ids = $$('[data-mi]:checked', m).map(function (x) { return +x.dataset.mi; });
      if (!ids.length) return toast('请先勾选需要补交的材料', true);
      ask('生成补料单', [
        { type: 'html', html: '<div class="note w">将一次性通知客户补交 <b>' + ids.length + '</b> 项材料，7 天倒计时。同一位办签人补料上限 3 次。</div><br>' },
        { k: 'reason', label: '补料说明', type: 'textarea', required: true, ph: '请一次性说清需要补什么、达到什么标准' }
      ], '发出补料单', function (f) {
        return api('/supp/create', { applicant_id: a.id, mat_ids: ids, reason: f.reason });
      }).then(function (r) { toast('补料单 ' + r.no + ' 已发出，截止 ' + d16(r.due_at)); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
    };
    /* 按节点渲染后，不属于当前这一步的按钮压根不在 DOM 里，绑定必须判空。
       原来它们总在（藏在「更多操作」抽屉里），所以这里是直接赋值——
       2026-09-03 改成严格按节点后，第一个非该节点的工单就崩在这一行。 */
    if ($('[data-form]', m)) $('[data-form]', m).onclick = function () {
      /* 还有中文没译成英文就去官网，等于到了 CEAC 现翻。软提醒不硬拦——
         有些格子本来就是英文/数字，专员比系统清楚（2026-09-03）。 */
      if (d.form && d.form.en_left) {
        return confirmBox('还有 ' + d.form.en_left + ' 格没译成英文',
          'DS-160 官网仅接受英文。以上字段仍为中文，直接前往官网需现场翻译，' +
          '容易出现译法不一致。<b>建议先点击「生成 / 核对英文」</b>。<br><br>' +
          '如确认以上字段本应填写中文或数字，可继续提交。',
          '仍要继续提交')
          .then(function () { doOfficial(); }).catch(function () { });
      }
      doOfficial();
    };
    function doOfficial() {
      /* 各国的受理号叫法与官方渠道都不同，标签和说明按国家取；
         条形码留空会由后端从受理号派生，不必再问一遍。
         提交这一步会校验订单付款状态——这是全流程唯一一道付款闸门。 */
      var idn = d.official_id_name || '官网受理号';
      ask('提交至官网并回填', [
        { type: 'html', html: '<div class="note">' + esc(d.country || '该国') +
          '的签证须由专员在官方渠道<b>人工提交</b>，系统只做结果回填与留痕' +
          '（官方无公开 API，不支持程序化提交）。<br>提交后把官网给出的' +
          esc(idn) + '填到下面。</div><br>' },
        { k: 'app_id', label: idn, required: true, value: a.app_id || '',
          hint: '在官方渠道提交成功后的页面上复制' },
        { k: 'barcode', label: '确认页条形码', value: a.barcode || '',
          hint: '留空则按受理号自动生成' }
      ], '保存', function (f) { return api('/form/save', { applicant_id: a.id, app_id: f.app_id, barcode: f.barcode }); })
        .then(function (r) {
          toast(r && r.next === 'P5'
            ? '已回填。该产品免面签，直接进入「待出签」'
            : '已回填，进度推进到「待预约」');
          reload();
        }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
    }
    /* 按节点渲染后，不属于当前这一步的按钮压根不在 DOM 里，绑定必须判空。
       原来它们总在（藏在「更多操作」抽屉里），所以这里是直接赋值——
       2026-09-03 改成严格按节点后，第一个非该节点的工单就崩在这一行。 */
    if ($('[data-fee]', m)) $('[data-fee]', m).onclick = function () {
      ask('回填签证费缴纳', [
        { type: 'html', html: '<div class="note w">签证费由我司垫付至使领馆指定渠道，回填后自动进入<b>垫付台账</b>，由财务核销。</div><br>' },
        /* 2026-09-03 走查修的两处：
           1. 金额原来写死 1240（美签的官费），换个国家就是错的，
              专员照着点确认，垫付台账里的钱就记错了。改成按套餐的 visa_fee 带出。
           2. 收据号原来预填一个 'CGI'+时间戳的假号。这个号<b>只能从官网缴费收据上抄</b>，
              系统不可能知道；预填一个假号，专员一路回车就把假数据存进去了。
              改成不预填、只给提示，告诉他去哪儿抄。 */
        { k: 'item', label: '费用项', type: 'select',
          value: d.fee_item || '签证费',
          options: ['CGI 签证费', 'VFS 服务费', '签证申请费', '签证费', '快递费'] },
        { k: 'amount', label: '金额（元）', required: true, value: d.visa_fee || '',
          hint: d.visa_fee ? '按该套餐配置的官费带出，与实缴不符时以实缴为准' : '按实缴金额填写' },
        { k: 'receipt_no', label: '收据号', required: true,
          ph: '请按官网缴费收据填写，如 CGI 收据号 / VFS 参考号',
          hint: '这个号预约面签时要用，务必与收据完全一致' }
      ], '保存', function (f) {
        return api('/fee/save', { applicant_id: a.id, item: f.item, amount: f.amount, receipt_no: f.receipt_no });
      }).then(function () { toast('已入垫付台账'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
    };
    /* 按节点渲染后，不属于当前这一步的按钮压根不在 DOM 里，绑定必须判空。
       原来它们总在（藏在「更多操作」抽屉里），所以这里是直接赋值——
       2026-09-03 改成严格按节点后，第一个非该节点的工单就崩在这一行。 */
    if ($('[data-appt]', m)) $('[data-appt]', m).onclick = function () {
      ask(a.appt_no ? '改期预约' : '登记面签预约', [
        { type: 'html', html: '<div class="note">面签号需人工在使领馆预约系统抢号，系统只登记结果并统计改期次数。</div><br>' },
        /* 预约号同理：抢到号之后官网才会给，系统生不出来。
           已经登记过的（改期）带出原值，第一次登记不预填。 */
        { k: 'appt_no', label: '预约号', required: true, value: a.appt_no || '',
          ph: '官网预约成功页上的确认号', hint: '与面签确认单上的号码保持一致' },
        { k: 'appt_at', label: '面签时间', type: 'datetime-local', required: true, value: (a.appt_at || '').replace(' ', 'T').slice(0, 16) },
        { k: 'appt_place', label: '面签地点', value: a.appt_place || '美国驻华大使馆（北京）' }
      ], '保存', function (f) {
        return api('/appt/save', { applicant_id: a.id, appt_no: f.appt_no, appt_at: f.appt_at.replace('T', ' ') + ':00', appt_place: f.appt_place });
      }).then(function (r) {
        toast('预约已登记' + (r.appt_change ? '（第 ' + r.appt_change + ' 次改期）' : '') + '，进度推进到「已预约待面签」'); reload();
      }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
    };
    /* 按节点渲染后，不属于当前这一步的按钮压根不在 DOM 里，绑定必须判空。
       原来它们总在（藏在「更多操作」抽屉里），所以这里是直接赋值——
       2026-09-03 改成严格按节点后，第一个非该节点的工单就崩在这一行。 */
    if ($('[data-batch]', m)) $('[data-batch]', m).onclick = function () {
      ask('并入送签批次', [
        { k: 'submit_city', label: '送签地', value: '北京送签' },
        { k: 'submit_date', label: '送签日期', type: 'date', value: new Date().toISOString().slice(0, 10) },
        { k: 'deliver_way', label: '递交方式', type: 'select', value: 'staff',
          options: [{ v: 'staff', t: '专人递交' }, { v: 'courier', t: '快递送达' },
          { v: 'self', t: '使馆自取' }] },
        { k: 'courier', label: '快递公司（快递送达时填）', ph: '如：顺丰' },
        { k: 'express', label: '快递单号（快递送达时填）', ph: '如：SF000069453' }
      ], '新建批次并并入', function (f) {
        return api('/batch/create', { applicant_ids: [a.id], submit_city: f.submit_city, submit_date: f.submit_date, deliver_way: f.deliver_way,
          courier: f.courier, express: f.express });
      }).then(function (r) { toast('已并入批次 ' + r.no); go('batch'); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
    };
    /* 按节点渲染后，不属于当前这一步的按钮压根不在 DOM 里，绑定必须判空。
       原来它们总在（藏在「更多操作」抽屉里），所以这里是直接赋值——
       2026-09-03 改成严格按节点后，第一个非该节点的工单就崩在这一行。 */
    if ($('[data-result]', m)) $('[data-result]', m).onclick = function () {
      ask('回填签证结果', [
        { type: 'html', html: '<div class="note w">结果需人工在使领馆官方渠道查询后回填。选择「行政审查」将自动设置 15 天后的人工复查日。</div><br>' },
        { k: 'result', label: '结果', type: 'select', options: [{ v: 'pass', t: '出签' }, { v: 'reject', t: '拒签' }, { v: 'ap', t: '行政审查（Administrative Processing）' }, { v: 'withdraw', t: '撤签' }] },
        { k: 'visa_no', label: '签证号（出签填）', value: '' },
        { k: 'visa_valid_to', label: '签证有效期至（出签填）', type: 'date', value: '' },
        { k: 'visa_stay', label: '单次停留天数（出签填）', value: '' },
        { k: 'reject_cate', label: '拒签归因（拒签填）', type: 'select', options: [''].concat(['移民倾向', '材料不实', '资金约束不足', '行程不合理', '面签表现', '过往拒签史', '使领馆未说明']) },
        { k: 'reject_reason', label: '拒签 / 撤签说明', type: 'textarea',
          hint: '拒签填归因说明；撤签填撤回原因与客户确认情况。凯撒 PRD 要求两者都可维护说明。' }
      ], '保存', function (f) {
        return api('/result/save', {
          applicant_id: a.id, result: f.result, visa_no: f.visa_no, visa_valid_to: f.visa_valid_to,
          visa_stay: f.visa_stay, reject_cate: f.reject_cate, reject_reason: f.reject_reason
        });
      }).then(function (r) {
        toast(r.ap_due ? '已转行政审查，' + d10(r.ap_due) + ' 前需人工复查' : '结果已回填'); reload();
      }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
    };
    /* 按节点渲染后，不属于当前这一步的按钮压根不在 DOM 里，绑定必须判空。
       原来它们总在（藏在「更多操作」抽屉里），所以这里是直接赋值——
       2026-09-03 改成严格按节点后，第一个非该节点的工单就崩在这一行。 */
    if ($('[data-liab]', m)) $('[data-liab]', m).onclick = function () {
      ask('责任判定', [
        { type: 'html', html: '<div class="note">责任判定直接影响退款金额：判为「我司责任」时拒签可全额退还。</div><br>' },
        { k: 'liability', label: '责任归属', type: 'select', options: [{ v: 'none', t: '未判定' }, { v: 'company', t: '我司责任' }, { v: 'customer', t: '客户责任' }, { v: 'official', t: '使领馆/第三方' }] },
        { k: 'note', label: '判定说明', type: 'textarea' }
      ], '保存', function (f) { return api('/liability/set', { applicant_id: a.id, liability: f.liability, note: f.note }); })
        .then(function (r) { toast('已判定 · 退款试算 ¥' + money(r.refund_hint.amount) + '（' + r.refund_hint.rule + '）'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
    };
    /* 按节点渲染后，不属于当前这一步的按钮压根不在 DOM 里，绑定必须判空。
       原来它们总在（藏在「更多操作」抽屉里），所以这里是直接赋值——
       2026-09-03 改成严格按节点后，第一个非该节点的工单就崩在这一行。 */
    if ($('[data-deliver]', m)) $('[data-deliver]', m).onclick = function () {
      ask('资料返还寄出', [
        { type: 'html', html: '<div class="note">只返还本工单办签人 <b>' + esc(d.name) + '</b> 的资料，同订单其他办签人不受影响。客户在线签收后本人链路闭环。</div><br>' },
        { k: 'express', label: '快递公司', value: '顺丰速运' },
        { k: 'express_no', label: '快递单号', required: true, value: '',
          ph: '快递面单上的运单号', hint: '回填后客户端进度页会显示，客户可自行查询' }
      ], '寄出', function (f) {
        return api('/deliver/create', { ord_no: d.ord_no, applicant_ids: [a.id],
          express: f.express, express_no: f.express_no });
      }).then(function (r) { toast('资料返还单 ' + r.no + ' 已寄出'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
    };
  });
}

/* ---------- 送签批次 ---------- */
VIEWS['uom:batch'] = function (m) {
  return Promise.all([api('/batch/list'), api('/wo/list?scope=all')]).then(function (r) {
    /* 可并批＝已登记预约、还没并进批次的人（新六步里就是「待出签」这一档） */
    var ready = r[1].list.filter(function (w) { return w.progress === 'P5' && !w.batch_id; });
    var q = srchCard('uombat', [
      { k: 'no', t: '批次号', ph: '支持模糊查询' },
      { k: 'submit_city', t: '送签地', type: 'sel', opts: uniqOpts(r[0].list, function (b) { return b.submit_city; }) },
      /* 原来这里拿 courier 去重当选项，而那个字段存的是「顺丰 SF000069453」，
         于是下拉里列出 19 个快递单号——运营根本没法按方式筛。
         2026-09-01 拆成 deliver_way（方式）+ courier（快递公司）+ express（单号）。 */
      { k: 'deliver_way', t: '递交方式', type: 'sel',
        opts: (r[0].deliver_ways || [['courier', '快递送达'], ['staff', '专人递交'], ['self', '使馆自取']]) },
      { k: 'express', t: '快递单号', ph: '支持模糊查询' }
    ]);
    var t = subTabs('uombat', [
      { k: 'all', t: '全部批次', fn: function () { return true; } },
      { k: 'open', t: '待递交', fn: function (b) { return b.status !== 'sent'; } },
      { k: 'sent', t: '已递交', fn: function (b) { return b.status === 'sent'; } }
    ], q.filter(r[0].list), 'open');        /* 默认停在待递交 */
    var so = sorter('uombat', [
      ['送签日期', function (b) { return b.submit_date || ''; }],
      ['人数', function (b) { return b.count || 0; }]
    ].concat(AUD_SORTS));
    var pg = pager('uombat', so.sort(t.rows), 10);
    m.innerHTML = pageH('送签批次',
      '递交是线下人工动作：把一批办签人的材料送到使领馆或签证中心，系统按批次管理。' +
      '<b>这是「国家签证办理中心」的第二个页签</b>，与签证工单是同一批数据的批量视角。') +
      woTopTabs('batch') +
      card('可并批的办签人 <span>已预约、尚未并入批次</span>', '<div class="pad">' +
        table(['', '工单', '办签人', '产品', '进度', '面签时间'], ready, function (w) {
          return '<td><input type="checkbox" style="width:auto;height:auto" data-a="' + w.applicant_id + '"></td>' +
            '<td class="mono">' + esc(w.no) + '</td><td><b>' + esc(w.name) + '</b></td><td>' + esc(w.product) +
            '</td><td>' + esc(w.progress_text) + '</td><td class="mono">' + d16(w.appt_at) + '</td>';
        }, '暂无可并批的办签人') +
        '<div class="btns" style="margin-top:14px"><button class="btn r" data-new>新建</button></div></div>') +
      q.html +
      '<div class="card">' + t.html + '<div class="pad">' + table(
        so.cols(['批次号', '送签地', '送签日期', '递交方式', '快递单号', '人数', '状态'].concat(AUD_COLS, ['操作'])),
        pg.rows, function (b) {
          return '<td class="mono">' + esc(b.no) + '</td><td>' + esc(b.submit_city) + '</td><td class="mono">' +
            d10(b.submit_date) + '</td><td>' + esc(b.deliver_way_text || '快递送达') +
            (b.courier ? '<div class="hint">' + esc(b.courier) + '</div>' : '') +
            '</td><td class="mono">' + esc(b.express || '—') + '</td><td class="num">' + b.count +
            '<div class="hint">' + b.applicants.map(function (x) { return esc(x.name_cn); }).join('、') + '</div></td>' +
            '<td>' + (b.status === 'sent' ? '<span class="tag ok">已递交</span>' : '<span class="tag warn">待递交</span>') + '</td>' +
            audTd(b) +
            '<td>' + (b.status === 'sent' ? '' : '<button class="btn sm r" data-send="' + esc(b.no) + '">确认已递交</button>') + '</td>';
        }, '没有符合条件的批次') + '</div>' + pg.html + '</div>';
    q.bind(m, function () { S.cache['pg:uombat'] = 1; reload(); });
    t.bind(m, function () { S.cache['pg:uombat'] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:uombat'] = 1; reload(); });
    woTabsBind(m);
    pg.bind(m, reload);
    $('[data-new]', m).onclick = function () {
      var ids = $$('[data-a]:checked', m).map(function (x) { return +x.dataset.a; });
      if (!ids.length) return toast('请先勾选办签人', true);
      ask('新建送签批次', [
        { k: 'submit_city', label: '送签地', value: '北京送签' },
        { k: 'submit_date', label: '送签日期', type: 'date', value: new Date().toISOString().slice(0, 10) },
        { k: 'deliver_way', label: '递交方式', type: 'select', value: 'staff',
          options: [{ v: 'staff', t: '专人递交' }, { v: 'courier', t: '快递送达' },
          { v: 'self', t: '使馆自取' }] },
        { k: 'courier', label: '快递公司（快递送达时填）', ph: '如：顺丰' },
        { k: 'express', label: '快递单号（快递送达时填）', ph: '如：SF000069453' }
      ], '创建', function (f) {
        return api('/batch/create', { applicant_ids: ids, submit_city: f.submit_city, submit_date: f.submit_date, deliver_way: f.deliver_way,
          courier: f.courier, express: f.express });
      }).then(function (r) { toast('批次 ' + r.no + ' 已创建'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
    };
    $$('[data-send]', m).forEach(function (b) {
      b.onclick = function () {
        confirmBox('确认递交 ' + b.dataset.send, '确认后批内所有办签人进度将推进到「已递交/已面签」，该动作会写入事件流。', '确认已递交')
          .then(function () { return api('/batch/send', { no: b.dataset.send }); })
          .then(function () { toast('已递交'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
  });
};

/* ---------- 垫付台账 ---------- */
VIEWS['uom:advance'] = VIEWS['fin:advance'] = VIEWS['ops:advance'] = function (m) {
  return api('/fin/advance').then(function (j) {
    var q = srchCard('uomadv', [
      {
        k: 'kw', t: '订单号 / 办签人 / 收据号', ph: '支持模糊查询',
        get: function (r) { return r.ord_no + ' ' + r.name + ' ' + (r.receipt_no || ''); }
      },
      { k: 'item', t: '费用项', type: 'sel', opts: uniqOpts(j.list, function (r) { return r.item; }) }
    ]);
    var hit = q.filter(j.list);
    /* 垫付台账没有状态流转，只有金额和时间——财务要的是「按金额从大到小核」，
       所以这里不设页签，把金额和时间做成可排序列。 */
    var so = sorter('uomadv', [
      ['垫付时间', function (r) { return r.created_at || ''; }],
      ['垫付金额', function (r) { return r.amount || 0; }]
    ]);
    var pg = pager('uomadv', so.sort(hit), 12);
    m.innerHTML = pageH(menuName('advance', '垫付与缴费台账'), '签证费、签证中心服务费由我司先行垫付到官方渠道，凭收据入账，由财务统一核销。') +
      '<div class="grid" style="margin-bottom:16px"><div class="stat hot"><b>¥' + money(j.total) +
      '</b><span>累计垫付</span></div><div class="stat"><b>' + j.list.length + '</b><span>垫付笔数</span></div></div>' +
      q.html +
      card('垫付明细', '<div class="pad">' + table(
        so.cols(['垫付时间', '订单号', '办签人', '费用项', '垫付金额', '收据号', '经办人']),
        pg.rows, function (r) {
          return '<td class="mono">' + d16(r.created_at) + '</td><td class="mono">' + esc(r.ord_no) + '</td><td>' +
            esc(r.name) + '</td><td>' + esc(r.item) + '</td><td class="num">¥' + money(r.amount) +
            '</td><td class="mono">' + esc(r.receipt_no || '') + '</td>' +
            '<td>' + esc(r.created_by_name || '—') +
            (r.updated_by_name && r.updated_at !== r.created_at ?
              '<div class="hint">最近 ' + esc(r.updated_by_name) + ' · ' + d16(r.updated_at) + '</div>' : '') + '</td>';
        }, '没有符合条件的垫付记录') + '</div>' + pg.html);
    q.bind(m, function () { S.cache['pg:uomadv'] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:uomadv'] = 1; reload(); });
    pg.bind(m, reload);
  });
};

/* ---------- 资料返还 ---------- */
VIEWS['uom:deliver'] = function (m) {
  return api('/deliver/list').then(function (j) {
    var q = srchCard('uomdlv', [
      {
        k: 'kw', t: '返还单号 / 订单号 / 快递单号', ph: '支持模糊查询',
        get: function (d) { return d.no + ' ' + d.ord_no + ' ' + (d.express_no || ''); }
      },
      { k: 'express', t: '快递公司', type: 'sel', opts: uniqOpts(j.list, function (d) { return d.express; }) }
    ]);
    var t = subTabs('uomdlv', [
      { k: 'all', t: '全部返还单', fn: function () { return true; } },
      { k: 'wait', t: '待客户签收', fn: function (d) { return d.status !== 'signed'; } },
      { k: 'signed', t: '已签收', fn: function (d) { return d.status === 'signed'; } }
    ], q.filter(j.list), 'wait');           /* 默认停在待客户签收 */
    var so = sorter('uomdlv', [
      ['寄出时间', function (d) { return d.created_at || ''; }]
    ]);
    var pg = pager('uomdlv', so.sort(t.rows), 12);
    m.innerHTML = pageH('资料返还',
      '护照与原件寄回客户，客户在线签收后订单闭环。签收记录进入事件流，作为纠纷判责依据。' +
      '<b>这是「国家签证办理中心」的第三个页签</b>，按「一次寄回的包裹」组织。') +
      woTopTabs('deliver') +
      q.html +
      '<div class="card">' + t.html + '<div class="pad">' + table(
        so.cols(['返还单号', '订单号', '快递公司', '快递单号', '寄出时间', '签收状态', '经办人']),
        pg.rows, function (d) {
          return '<td class="mono">' + esc(d.no) + '</td><td class="mono">' + esc(d.ord_no) + '</td><td>' +
            esc(d.express || '') + '</td><td class="mono">' + esc(d.express_no || '') + '</td><td class="mono">' +
            d16(d.created_at) + '</td><td>' + (d.status === 'signed' ?
              '<span class="tag ok">' + esc(d.sign_name) + ' · ' + d16(d.signed_at) + '</span>' :
              '<span class="tag warn">待客户签收</span>') + '</td>' +
            '<td>' + esc(d.created_by_name || '—') + '</td>';
        }, '没有符合条件的返还单') + '</div>' + pg.html + '</div>';
    q.bind(m, function () { S.cache['pg:uomdlv'] = 1; reload(); });
    t.bind(m, function () { S.cache['pg:uomdlv'] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:uomdlv'] = 1; reload(); });
    woTabsBind(m);
    pg.bind(m, reload);
  });
};

/* ================= 签证政策内容（UOM · 平台配置） =================
   产品回答「这条产品怎么卖」，政策回答「这个国家现在什么规矩」。后者跟供应商、
   报价都无关，变动频率高得多（免签开关、材料要求调整、领区变更），所以不挂在产品
   下面，单独由总部运营维护一份，B 端门店销售与 C 端客户读的是同一份。
   唐美芳 2026-08-27：「不止 C 端要看，B 端也要看的」。 */
var PKIND = {
  free: ['ok', '免签'], landing: ['ok', '落地签'], evisa: ['info', '电子签'],
  change: ['warn', '政策变动'], notice: ['plain', '办理提醒']
};
function pkTag(k) {
  var t = PKIND[k] || ['plain', k];
  return '<span class="tag ' + t[0] + '">' + t[1] + '</span>';
}

VIEWS['ops:policies'] = function (m) {
  return Promise.all([api('/ops/policies'), api('/shop/products')]).then(function (r) {
    var list = r[0].list;
    /* 目的地下拉取「已有政策的国家」并上「已有在售产品的国家」的并集：
       只取前者会让新国家永远录不进来，只取后者则通用政策（*）没处放。 */
    var cs = [];
    list.forEach(function (p) { if (cs.indexOf(p.country) < 0) cs.push(p.country); });
    r[1].list.forEach(function (p) { if (cs.indexOf(p.country) < 0) cs.push(p.country); });
    cs.sort();

    var q = srchCard('opspol', [
      { k: 'kw', t: '标题 / 摘要', ph: '支持模糊查询',
        get: function (t) { return (t.title || '') + ' ' + (t.summary || ''); } },
      { k: 'country', t: '目的地', type: 'sel', opts: uniqOpts(list, function (t) { return t.country; }) },
      { k: 'kind', t: '政策类型', type: 'sel',
        opts: Object.keys(PKIND).map(function (k) { return [k, PKIND[k][1]]; }) },
      { k: 'scope', t: '可见范围', type: 'sel',
        opts: [['all', '两端可见'], ['b', '仅门店销售可见']] }
    ]);
    var t = subTabs('opspol', [
      { k: 'all', t: '全部', fn: function () { return true; } },
      { k: 'published', t: '已发布', fn: function (p) { return p.status === 'published'; } },
      { k: 'draft', t: '草稿', fn: function (p) { return p.status !== 'published'; } }
    ], list, 'published');                  /* 默认停在已发布 */
    var so = sorter('opspol', [
      ['生效日期', function (p) { return p.effect_at || ''; }],
      ['目的地', function (p) { return p.country; }]
    ].concat(AUD_SORTS));
    var hit = so.sort(q.filter(t.rows));
    var pg = pager('opspol', hit, 10);

    m.innerHTML = pageH('签证政策内容',
      '维护各目的地国的现行政策口径：免签与落地签规则、政策变动、办理提醒。' +
      '<b>发布后门店销售的产品预订中心与客户小程序同时可见</b>，改一处两端同步，' +
      '不用两边各录一遍。目的地填 <code>*</code> 表示通用政策，对所有国家都适用。',
      '<button class="btn p" data-new>新建</button>') +
      q.html + t.html +
      '<div class="card"><div class="pad">' + table(
        so.cols(['目的地', '政策类型', '标题与摘要', '停留期', '生效日期', '来源', '可见范围']
          .concat(AUD_COLS, ['操作'])), pg.rows, function (p) {
          return '<td><b>' + (p.country === '*' ? '<span class="tag plain">通用</span>'
            : flag(p.country) + ' ' + esc(p.country)) + '</b></td>' +
            '<td>' + pkTag(p.kind) + (p.pin ? ' <span class="tag warn">置顶</span>' : '') + '</td>' +
            '<td style="min-width:280px"><b>' + esc(p.title) + '</b>' +
            (p.summary ? '<div class="hint">' + esc(p.summary) + '</div>' : '') + '</td>' +
            '<td>' + (p.stay ? esc(p.stay) : '<span class="hint">—</span>') + '</td>' +
            '<td>' + (p.effect_at ? esc(p.effect_at) : '<span class="hint">未标注</span>') + '</td>' +
            '<td>' + (p.source ? esc(p.source) : '<span class="tag bad">未填</span>') + '</td>' +
            '<td>' + (p.scope === 'b' ? '<span class="tag warn">仅门店销售</span>'
              : '<span class="tag ok">两端可见</span>') + '</td>' + audTd(p) +
            '<td><div class="btns">' +
            '<button class="btn sm" data-e=\'' + jattr(p) + '\'>编辑</button>' +
            '<button class="btn sm r" data-d="' + p.id + '">删除</button></div></td>';
        }, '没有符合条件的政策内容') + '</div>' + pg.html + '</div>';

    q.bind(m, function () { S.cache['pg:opspol'] = 1; reload(); });
    t.bind(m, function () { S.cache['pg:opspol'] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:opspol'] = 1; reload(); });
    pg.bind(m, reload);

    function form(p) {
      return ask(p ? '编辑签证政策' : '新增签证政策', [
        { k: 'country', label: '目的地', type: 'select', value: (p && p.country) || '',
          options: [{ v: '*', t: '* 通用（对所有国家适用）' }]
            .concat(cs.filter(function (x) { return x !== '*'; })
              .map(function (x) { return { v: x, t: x }; })) },
        { k: 'kind', label: '政策类型', type: 'select', value: (p && p.kind) || 'notice',
          options: Object.keys(PKIND).map(function (k) { return { v: k, t: PKIND[k][1] }; }) },
        { k: 'title', label: '标题', required: true, value: p && p.title,
          ph: '如：泰国对中国公民免签' },
        { k: 'summary', label: '一句话摘要', value: p && p.summary,
          ph: '如：持普通护照免签入境，单次停留不超过 30 天',
          hint: '门店端与客户端的列表与卡片均展示此句，请写成客户可直接理解的表述' },
        { k: 'body', label: '正文', type: 'textarea', rows: 6, value: p && p.body,
          hint: '仅在展开详情时显示。请写清适用条件与例外情形，便于销售向客户准确转述' },
        { k: 'stay', label: '停留期', value: p && p.stay, ph: '如：30 天',
          hint: '免签 / 落地签才填，其他类型留空' },
        { k: 'effect_at', label: '生效日期', type: 'date', value: p && p.effect_at },
        { k: 'source', label: '来源', value: p && p.source,
          ph: '如：中泰互免签证协定 / 美国驻华使领馆',
          hint: '发布前必填。注明是哪个使领馆、官网或协定的口径，出了错能追回出处' },
        { k: 'source_url', label: '来源链接', value: p && p.source_url, ph: 'https://' },
        { k: 'scope', label: '可见范围', type: 'select', value: (p && p.scope) || 'all',
          options: [{ v: 'all', t: '两端可见（门店销售 + 客户小程序）' },
            { v: 'b', t: '仅门店销售可见（内部口径，不发给客户）' }] },
        { k: 'status', label: '状态', type: 'select', value: (p && p.status) || 'draft',
          options: [{ v: 'draft', t: '草稿（两端都看不到）' }, { v: 'published', t: '已发布' }] },
        { k: 'pin', label: '置顶', type: 'select', value: p && p.pin ? '1' : '0',
          options: [{ v: '0', t: '不置顶' }, { v: '1', t: '置顶（排在两端最前面）' }] }
      ], '保存', function (f) {
        f.id = p && p.id;
        f.pin = f.pin === '1';
        return api('/ops/policy/save', f);
      }).then(function () { toast('已保存'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
    }
    $('[data-new]', m).onclick = function () { form(null); };
    $$('[data-e]', m).forEach(function (b) {
      b.onclick = function () { form(JSON.parse(b.dataset.e)); };
    });
    $$('[data-d]', m).forEach(function (b) {
      b.onclick = function () {
        confirmBox('删除签证政策', '删除后两端立即不再展示，不可恢复。', '删除')
          .then(function () { return api('/ops/policy/del', { id: +b.dataset.d }); })
          .then(function () { toast('已删除'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
  });
};
