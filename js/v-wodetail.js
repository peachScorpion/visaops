/* ============================================================
   工单详情 · 两端共用（2026-09-09 重做）

   唐美芳：「材料清单统一改成查看详情，点击进入工单详情页，我记得之前这块做过啊，
   但是那个详情有点乱，你整体用新的逻辑梳理看看。」

   旧的那份（v-uom.js 的 woDetail）乱在三处：
     · 六步进度条摆在最上面，可它只是「现在到哪」，不是「现在要干什么」；
     · 材料、申请表、办理信息三张卡平铺，看不出先后，也看不出哪张此刻有事；
     · 动作散在卡里、底栏、进度条上三个地方。

   新逻辑一句话：**先说此刻该做什么，再按办理时间顺序摊开，最后才是留痕。**
     ① 概览        —— 一行 KV，谁的单、哪个产品、谁在办、什么时候到期
     ② 此刻该做什么 —— 随三档变，只放这一档真正要点的按钮
     ③ 材料        —— 收料与审核（通过 / 驳回 / 代传），含补料单
     ④ 申请表      —— 填到哪了，一个入口
     ⑤ 办理进展    —— 提交官网 / 缴费 / 面签 / 结果，四格按官方顺序排
     ⑥ 操作日志    —— 谁在什么时候动了什么

   UBK 与 UOM 看到的是同一份结构，差别只有两处：
   UOM 多「六步节点」与「挂起 / 改派」，且能看到订单金额；供应商侧两样都没有。
   ============================================================ */

VIEWS['ubk:wo'] = VIEWS['uom:wo'] = VIEWS['lead:wo'] = VIEWS['ops:wo'] =
function (m, no) {
  if (!no) return go('board');
  return api('/wo/detail?no=' + encodeURIComponent(no)).then(function (d) {
    var isSup = S.role === 'ubk';
    var isLead = S.role === 'lead' || S.role === 'ops';
    var a = d.applicant || {};
    var st = d.mat || {};
    var openSupp = (d.supps || []).filter(function (s) { return s.status === 'open'; })[0];
    var reloadMe = function () { reload(); };
    /* /wo/detail 的剩余题数在 form.stat.ask_left；/sup/orders 列表里是 form.ask_left。
       两个接口结构不同，这里兜一层，免得详情页显示「剩 0 题」而列表显示「剩 10 题」。 */
    function fAskLeft() {
      if (!d.form) return 0;
      return (d.form.stat && d.form.stat.ask_left) || d.form.ask_left || 0;
    }

    /* ---------- 此刻该做什么：收成进展条下面的一句话 ----------
       原来它单独占一整块，跟进展条讲的是同一件事。现在只留一句提示，
       动作按钮跟着各自的模块走（2026-09-09 按唐美芳给的模块顺序重排）。 */
    function todoLine() {
      var tx;
      if (d.stage === 'G3') {
        tx = '本单已出结果' + (d.result_text ? '（' + esc(d.result_text) + '）' : '') +
          '，如需更正请联系' + (isSup ? '众信' : '主管') + '。';
      } else if (d.stage === 'G1') {
        var left = st.cust_todo || 0;
        tx = left
          ? '<b>此刻要做的：</b>等申请人补齐材料，还差 ' + left +
            ' 项。可在下面的材料清单里代客户上传，或把填写链接发给客户本人；逐项核对后点「通过」。'
          : '<b>此刻要做的：</b>必交材料已全部通过，工单即将转入「处理中」。';
      } else {
        var step = !d.app_id ? 'form' : !d.appt_no ? 'appt' : 'wait';
        tx = '<b>此刻要做的：</b>' + {
          form: '在官方渠道人工提交申请，再回填' + esc(d.official_id_name || '受理号') +
            '。系统不代为提交。',
          appt: '在官方预约系统取号并与客户确认时间后登记，登记后客户在小程序上就能看到面签时间。',
          wait: '等使领馆出结果。出结果后在上面最后一段登记出签或拒签；' +
            '若受理后迟迟不给结论，按「行政审查」登记，进度不动、15 天后复查。'
        }[step];
      }
      return '<div class="wd-now">' + tx + '</div>';
    }

    /* ---------- 办理进展条：进度条与办理进展合并成一条 ----------
       唐美芳 2026-09-09：「详情页最上面最好是有个进度条，看看能不能和办理进展合并在一起」。
       原来是「三档标签 + 下面四格卡片」两套东西各说各的；现在做成一条五段流程：
       收材料 → 提交官网 → 缴费 → 面签 → 结果，每段自带当前值与操作入口，
       走到哪一段哪一段高亮。三档（待收料/处理中/已出结果）是这五段的粗分，
       仍在概览里以标签形式给出，不再单独占一块。 */
    function progBlock() {
      var cells = [
        /* 第一段是收材料——原来这一格没有，进度条从「提交官网」起跳，
           而待收料档恰恰是最常停留的一档，条上却什么都不显示。 */
        ['收材料', st.ready,
          (st.ready ? '<span class="tag ok">已齐备</span>'
            : '<span class="tag warn">尚缺 ' + (st.cust_todo || 0) + ' 项</span>') +
          '<div class="hint">客户必交 ' + ((st.cust_must || 0) - (st.cust_todo || 0)) +
          ' / ' + (st.cust_must || 0) + '</div>',
          'mat', '看材料'],
        ['提交至官网', d.app_id, d.app_id ? (d.official_id_name || '受理号') + ' ' + esc(d.app_id) +
          (d.barcode ? '<div class="hint">条形码 ' + esc(d.barcode) + '</div>' : '') : '未提交',
          'form', '提交至官网'],
        /* 「官费缴纳」2026-09-09 从进展条上撤掉（唐美芳：「缴费回填这个功能可以去掉，
           毕竟给大使馆是否缴费不影响状态流转」）。它确实不是状态节点——
           只是取号的前置条件之一，由办理人自己掌握。字段与历史记录保留。 */
        ['面签预约', d.appt_no, d.appt_no
          ? esc(d.appt_no) + '<div class="hint">' + d16(d.appt_at) +
            (d.appt_place ? ' · ' + esc(d.appt_place) : '') + '</div>'
          : (d.need_interview ? '未预约' : '该产品免面签'), 'appt', d.appt_no ? '改期' : '预约面签'],
        /* 行政审查不算走完——它表示使领馆还没给结论，打上勾会让这一条
           看起来已经办结（唐美芳 2026-09-09 定的口径：只有出签 / 拒签是终态）。 */
        ['签证结果', d.visa_result && d.visa_result !== 'ap', d.visa_result
          ? ubkResTag(d.visa_result) + (a.visa_no ? '<div class="hint">' + esc(a.visa_no) +
            (a.visa_valid_to ? ' · 至 ' + d10(a.visa_valid_to) : '') + '</div>' : '') +
            (a.reject_cate ? '<div class="hint">归因：' + esc(a.reject_cate) + '</div>' : '')
          : '未出结果', 'res', '登记结果']
      ];
      /* 当前段 = 第一个还没完成的那段；它之前的都算走过了 */
      var curIdx = cells.length - 1;
      for (var i2 = 0; i2 < cells.length; i2++) {
        if (!cells[i2][1]) { curIdx = i2; break; }
      }
      return '<div class="wd-flow">' + cells.map(function (x, i3) {
        var done = !!x[1];
        var cls = done ? ' on' : (i3 === curIdx ? ' cur' : '');
        return '<div class="wd-fs' + cls + '">' +
          '<i>' + (done ? '✓' : (i3 + 1)) + '</i>' +
          '<div class="wd-fb"><s>' + esc(x[0]) + '</s><b>' + x[2] + '</b>' +
          (d.stage === 'G3' || x[3] === 'mat' ? ''
            : '<a data-' + (x[3] === 'res' ? 'res' : 'step="' + x[3] + '"') + '>' +
              esc(x[4]) + ' ›</a>') +
          '</div></div>';
      }).join('') + '</div>';
    }

    /* ---------- ③ 材料 ---------- */
    function matRow(i) {
      /* 「提供方式」原来单独占一列，把「操作」挤进了横向滚动条里——
         材料表在详情页里本来就窄，一列都不能浪费。挪到材料名下面当小字。 */
      return '<td><b>' + esc(i.mat_name) + '</b>' +
        '<div class="hint">' + esc(i.way_text || '') + '</div>' +
        (i.file_name ? '<div class="sub">已上传：' + matFile(i) + '</div>' : '') +
        (i.reject_reason ? '<div class="sub" style="color:#C8102E">驳回：' +
          esc(i.reject_reason) + '</div>' : '') + '</td>' +
        '<td>' + (i.necessity === 'must'
          ? '<span class="tag bad">必须</span>' : '<span class="tag plain">建议</span>') + '</td>' +
        '<td class="nw">' + matTag(i.status) + '</td>' +
        '<td><div class="btns">' +
        /* 「查看」：客户自己传的、销售代传的，点开就能看原件
           （唐美芳 2026-09-09：「申请人的材料为什么没有看详情的位置，
           比如客人填了或者销售代填了，从哪里看呢」）。 */
        (i.file_url ? '<button class="btn sm g" data-view="' + esc(i.file_url) +
          '" data-vn="' + esc(i.file_name || i.mat_name) + '">查看</button>' : '') +
        ((i.provide_way || []).indexOf('upload') >= 0
          ? '<button class="btn sm" data-up="' + i.id + '" data-n="' + esc(i.mat_name) + '">' +
            (i.status === 'wait' ? '上传' : '重新上传') + '</button>'
          : '<span class="sub">线下收取</span>') +
        (i.status !== 'pass'
          ? '<button class="btn sm ok" data-mp="' + i.id + '">通过</button>' +
            '<button class="btn sm" data-mr="' + i.id + '" data-n="' + esc(i.mat_name) + '">驳回</button>'
          : '') + '</div></td>';
    }

    m.innerHTML = pageH('工单 ' + esc(d.no) + ' · ' + esc(d.name),
      esc(d.product || '') + ' · ' + esc(d.pkg || '') + ' · 订单 ' + esc(d.ord_no) +
      (d.sla_due ? ' · 办结截止 ' + d10(d.sla_due) : '') +
      (d.overdue ? ' <b style="color:#B42318">已超期</b>' : ''),
      /* 右上角只放**通用操作**（唐美芳 2026-09-09：「通用操作按钮放在页面右上角」）。
         办理动作跟着它所属的模块走：材料相关的在材料清单模块里，
         官方渠道那三步在办理进展条上，登记结果也在进展条最后一段。
         「挂起工单」按她的意见撤掉——全库 390 张工单没有一张用过这个状态，
         真遇到暂缓办理，走订单侧的取消 / 退款更说得清。 */
      '<div class="btns">' +
      (d.stage !== 'G3' ? '<button class="btn" data-as>改派</button>' : '') +
      '<button class="btn" data-back>返回签证办理中心</button>' +
      '</div>') +
      /* 模块顺序按唐美芳 2026-09-09 给的：
         办理进展 → 工单基础信息 → 申请人材料清单（含官方申请表入口）→ 操作日志。
         原来「此刻该做什么」单独占一块，现在收进办理进展条下面一句话，不再抢版面。 */
      (d.status === 'hold'
        ? '<div class="note w">工单已挂起：' + esc(d.hold_reason || '') + '</div>' : '') +

      card('办理进展 <span>提交、缴费、抢号、递交、采指纹五项由人工在官方渠道完成后回填</span>',
        '<div class="pad">' + progBlock() + todoLine() + '</div>') +

      card('工单基础信息', '<div class="pad"><div class="wd-kv">' + [
        ['工单号', '<span class="mono">' + esc(d.no) + '</span>'],
        ['办理状态', '<span class="tag ' + (d.stage === 'G3' ? 'ok' : d.stage === 'G2' ? 'info' : 'plain') +
          '">' + esc(d.stage_text || '') + '</span>' +
          (isSup ? '' : '<i class="hint"> · ' + esc(d.progress_text || '') + '</i>')],
        ['申请人', esc(d.name) + '<i class="hint"> · ' + esc(d.crowd || '') + '</i>'],
        ['联系方式', esc(d.phone || '—')],
        ['证件号码', esc(a.id_no || '—') +
          (a.id_expiry ? '<i class="hint"> · 有效期至 ' + d10(a.id_expiry) + '</i>' : '')],
        ['国家 / 送签地', flag(d.country) + ' ' + esc(d.country || '') +
          (d.submit_city ? ' · ' + esc(d.submit_city) : '')],
        ['签证类型', (d.visa_cat ? esc(d.visa_cat) : '—') +
          (d.visa_type ? '<i class="hint"> · ' + esc(d.visa_type) + '</i>' : '')],
        ['签证产品', esc(d.product || '—') +
          (d.pkg ? '<i class="hint"> · ' + esc(d.pkg) + '</i>' : '')],
        ['所属订单', '<span class="mono">' + esc(d.ord_no) + '</span>'],
        ['办结截止日', (d.sla_due ? d10(d.sla_due) : '—') +
          (d.overdue ? ' <span class="tag bad">已超期</span>' : '')],
        ['供应商', d.supplier ? esc(d.supplier) : '<span class="hint">未派</span>'],
        ['当前办理人', (isSup
          ? (d.sup_owner_name || '<span class="hint">未指派</span>')
          : (esc(d.owner || '未指派') +
             (d.sup_owner_name ? '<i class="hint"> · 供应商 ' + esc(d.sup_owner_name) + '</i>' : '')))],
        /* 创建 / 最近操作 2026-09-09 补上（唐美芳：「签证办理中心的工单为什么没有
           创建人/时间、最近操作人/时间」）。库里一直有这四个值，只是详情页没摆出来。 */
        ['创建', d16(d.created_at || '') +
          (d.created_by_name ? '<i class="hint"> · ' + esc(d.created_by_name) + '</i>' : '')],
        /* 没有更新时间就只写「—」——带上人名会变成「— · 陈曦」，像是这个人在空时间点操作过 */
        ['最近操作', d.updated_at
          ? d16(d.updated_at) +
            (d.updated_by_name ? '<i class="hint"> · ' + esc(d.updated_by_name) + '</i>' : '')
          : '<span class="hint">建单后未再变更</span>']
      ].map(function (x) {
        return '<div><s>' + x[0] + '</s><b>' + x[1] + '</b></div>';
      }).join('') + '</div></div>') +

      /* 材料清单模块：材料相关的主按钮都收在这里（她：「相关操作主按钮放在这个模块里」），
         官方申请表不再单独成块，作为这一模块里的一个入口（她：「在申请人材料清单里
         放个入口就可以了吧」）——申请表本来就是「客户要交的东西」之一。 */
      /* 口径与列表一致：主线只讲**客户必交**这一档，已通过 X / M、尚缺 = M − X，
         建议项与我方凭证单独说（唐美芳 2026-09-09：「尚缺 6 项与已通过里的 0/10 对不上」）。 */
      card('申请人材料清单 <span>要<b>交</b>的材料 · 按适用人群「' + esc(d.crowd || '') + '」裁剪：' +
        '客户必交 <b>' + ((st.cust_must || 0) - (st.cust_todo || 0)) + ' / ' +
        (st.cust_must || 0) + '</b> 已通过' +
        (st.cust_todo ? '，<b style="color:#B42318">尚缺 ' + st.cust_todo + ' 项</b>' : '，已交齐') +
        '；另有建议 ' + (st.opt_total || 0) + ' 项、我方凭证 ' + (st.ours_total || 0) + ' 项。' +
        '下方的官方申请表是要<b>填</b>的表格，两者分开计数</span>',
        '<div class="pad">' +
        (openSupp
          ? '<div class="note w">补料单 <b>' + esc(openSupp.no) + '</b> 未回：' +
            esc(openSupp.reason || '') + '</div>' : '') +

        /* 官方申请表：**要填的表格**，跟上面那张**要交的材料**清单是两件事。
           唐美芳 2026-09-09：「申请人材料那状态明明是已交齐，为什么操作还有填申请表剩 X 题」
           ——问题不在数据，在这一行没说清楚自己是什么。现在标题直接写明白，
           计数也分开写；三个动作挨在一起放右侧，不再被中间的空白撑散。 */
        '<div class="wd-form">' +
        '<div class="wd-fi"><s>官方申请表 <i>· 需填写，与上面的材料分开计数</i></s><b>' +
        (d.form_avail === false
          ? '该国家递交纸质表，系统内无在线申请表'
          : d.form
            ? esc(d.form.status_text || '') +
              '<i class="hint"> · 客户必答共 ' +
              ((d.form.stat && d.form.stat.ask_total) || 0) + ' 题，还剩 ' + fAskLeft() + ' 题' +
              (d.form.filled_by_text ? ' · 填写人 ' + esc(d.form.filled_by_text) : '') + '</i>'
            : '尚未开始填写') + '</b></div>' +
        (d.form_avail === false ? ''
          : '<div class="btns">' +
            (d.form ? '<button class="btn" data-viewform>查看已填内容</button>' : '') +
            '<button class="btn" data-goshare>发给客人自己填</button>' +
            '<button class="btn p" data-goform>' +
            (fAskLeft() ? '代填申请表 · 剩 ' + fAskLeft() + ' 题' : '填申请表') + '</button></div>') +
        '</div>' +

        '<div class="scrollx">' + table(['材料', '必要性', '状态', '操作'],
          d.materials || [], matRow, '本产品未配置材料清单') + '</div></div>') +

      card('操作日志 <span>本申请人的动作单独标注，其余为同订单事件</span>',
        '<div class="pad">' + woLogs(d.events) + '</div>');

    /* ---------- 绑定 ---------- */
    $('[data-back]', m).onclick = function () { go('board'); };
    var gf = $$('[data-goform]', m);
    gf.forEach(function (b) {
      b.onclick = function () {
        S.cache.cfSec = null; S.cache.cfRO = null; go('formfill', d.applicant_id);
      };
    });
    $$('[data-view]', m).forEach(function (b) {
      b.onclick = function () { window.open(b.dataset.view, '_blank'); };
    });
    $$('[data-viewform]', m).forEach(function (b) {
      /* 只读打开填表页：核对客户 / 销售填了什么，不改内容 */
      b.onclick = function () {
        S.cache.cfSec = null; S.cache.cfRO = 1; go('formfill', d.applicant_id);
      };
    });
    $$('[data-goshare]', m).forEach(function (b) {
      b.onclick = function () { shareTask(d.applicant_id, d.name); };
    });
    $$('[data-step]', m).forEach(function (b) {
      b.onclick = function () { ubkStep(d, b.dataset.step, reloadMe); };
    });
    $$('[data-res]', m).forEach(function (b) {
      b.onclick = function () { woResultAsk(d, reloadMe); };
    });
    $$('[data-up]', m).forEach(function (b) {
      b.onclick = function () {
        ask('上传：' + b.dataset.n, [
          { k: 'files', label: '选择文件', type: 'file', required: true,
            accept: 'image/*,.pdf', hint: '拍清楚四角、不反光；PDF 请上传原件导出版' }
        ], '上传', function (f) {
          return api('/mat/upload', {
            mat_id: +b.dataset.up, file_name: f.files[0].name, file_url: f.files[0].url
          });
        }).then(function (r) { toast(r.ai_msg || '已上传'); reloadMe(); }).catch(function () { });
      };
    });
    $$('[data-mp]', m).forEach(function (b) {
      b.onclick = function () {
        api('/mat/review', { mat_id: +b.dataset.mp, action: 'pass' })
          .then(function (r) {
            toast(r.stat && r.stat.ready ? '已通过，必交材料已齐备，工单转入「处理中」' : '已通过');
            reloadMe();
          }).catch(fail);
      };
    });
    $$('[data-mr]', m).forEach(function (b) {
      b.onclick = function () {
        /* 驳回必须写原因：客户在小程序上看到的就是这句话 */
        ask('驳回：' + b.dataset.n, [
          { type: 'html', html: '<div class="note">驳回原因会<b>原样展示给客户</b>，' +
            '请写清楚哪里不合格、要怎么重拍或重开。</div><br>' },
          { k: 'reason', label: '驳回原因', type: 'textarea', required: true,
            ph: '如：护照资料页反光，四角未拍全，请在自然光下平铺重拍' }
        ], '驳回', function (f) {
          return api('/mat/review', { mat_id: +b.dataset.mr, action: 'reject', reason: f.reason });
        }).then(function () { toast('已驳回，客户将收到补交提示'); reloadMe(); }).catch(fail);
      };
    });
    var as = $('[data-as]', m);
    /* 改派两端都有，但派的是两个人：
       供应商派的是**本公司经办人**（wo.sup_owner），众信派的是**承办专员**（wo.owner_user）。
       一单两边各有一个负责人，互不覆盖（唐美芳 2026-09-09：「uom 有改派，ubk 应该也有，
       主要干活还是在 ubk，所以操作按钮不能少」）。 */
    if (as) as.onclick = function () { woAssign(d, reloadMe); };
    bindSample(m);
  });
};
