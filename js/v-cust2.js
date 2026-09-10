/* C 端（H5）：我的材料 / 补料通知 / 结果与签收 / 退款
   CSP（PC）：我的订单 / 客户材料 / 退款申请 —— CSP 是门店销售与同业的 PC 端，保持桌面表格形态 */

/* ================= C 端 · 我的材料（H5） ================= */
VIEWS['customer:mats'] = function (m, aid) {
  if (!aid) {
    return api('/my/orders').then(function (j) {
      /* 原来这里把「每张订单 × 每位办签人」拉平成一个长列表，同一个人在几十张单里
         各出现一次，产品名和订单号一行行重复，看着就是一屏重复数据
         （唐美芳 2026-09-02：「我的材料里怎么好多重复数据」）。
         改成<b>按订单分组</b>：订单号与产品名在组头出现一次，组内只列人名；
         并且默认只摆<b>还要交东西的订单</b>，办完的收进折叠区——
         材料页的用处就是交材料，已经交齐的单子摆在这里只是噪音。 */
      /* 已完成 / 已取消 / 已退款的单子不再需要交材料，全部不摆出来。
         （后端 todo 对已完成的单仍会算出「待提交材料」——那是历史材料状态没回收，
         不影响业务，但摆在材料页上就是几十行噪音。） */
      var ords = j.list.filter(function (o) {
        return o.status === 'paid' && o.applicants.some(function (a) { return a.state === 'normal'; });
      });
      /* 「这单还要交东西吗」按办签人身上真实的待交项与补料条数算，
         不看订单级的 todo 文案——那个字段在已付款阶段固定是「待财务确认到账」，
         跟材料没关系。 */
      function sumOf(o, k) {
        return o.applicants.reduce(function (n, a) {
          return n + (a.state === 'normal' ? (a[k] || 0) : 0);
        }, 0);
      }
      function todoOf(o) {
        var sp = sumOf(o, 'supp_open'), wt = sumOf(o, 'mat_wait');
        if (sp) return sp + ' 条补料待处理' + (wt ? '，另有 ' + wt + ' 项材料待交' : '');
        return wt ? wt + ' 项材料待交' : '';
      }
      var act = ords.filter(function (o) { return todoOf(o); });
      var rest = ords.filter(function (o) { return !todoOf(o); });
      function grp(o) {
        return '<div class="h5-sec mt-grp">' +
          '<div class="h5-h"><span>' + esc(o.product) + '</span>' +
          '<em class="mut">' + esc(o.no) + '</em></div>' +
          (todoOf(o) ? '<div class="h5-tip warn">' + esc(todoOf(o)) + '</div>' : '') +
          o.applicants.filter(function (a) { return a.state === 'normal'; }).map(function (a) {
            var tip = a.supp_open ? a.supp_open + ' 条补料'
              : a.mat_wait ? a.mat_wait + ' 项待交' : '已交齐';
            return '<div class="h5-row" data-a="' + a.id + '"><span class="lb">' + esc(a.name) +
              '</span><span class="vl' + (a.supp_open || a.mat_wait ? '' : ' mut') + '">' +
              esc(tip) + '</span><span class="ar">›</span></div>';
          }).join('') + '</div>';
      }
      var body = ords.length
        ? (act.map(grp).join('') ||
            '<div class="h5-sec"><div class="h5-tip">材料已全部提交，暂无待办事项。</div></div>') +
          (rest.length ? '<div class="h5-sec od-fold" data-fold>' +
            '<div class="h5-h"><span>其余 ' + rest.length + ' 张订单</span><em class="fc">⌄</em></div>' +
            '<div class="od-fb">' + rest.map(grp).join('') + '</div></div>' : '')
        : '<div class="h5-sec"><div class="h5-empty">暂无可提交材料的订单，需先完成支付</div></div>';
      m.innerHTML = pageH('我的材料',
        '材料清单在下单时按<b>适用人群</b>快照生成，同一订单内不同申请人的清单条目数可能不同。') +
        h5page('所需材料', body, '', '这一步在做什么',
          '清单来自国家送签材料库的某个版本快照。下单后即使运维改了材料库，' +
          '<b>已成交订单的清单不变</b>，避免客户按新旧两套要求反复补件。',
          true, '', '', 'cardy');
      $('[data-back]', m).onclick = function () { go('orders'); };
      $$('[data-a]', m).forEach(function (b) { b.onclick = function () { go('mats', b.dataset.a); }; });
      var fd = $('[data-fold]', m);
      if (fd) $('.h5-h', fd).onclick = function () { fd.classList.toggle('open'); };
    });
  }
  return api('/my/checklist?applicant_id=' + aid).then(function (d) {
    /* 唐美芳 2026-08-31：「只有查看样例，没有提交的入口啊，可不可以有个整体的
       填写页面，现在这样太散了」。
       两个毛病：
       1. 每一项默认折叠，上传按钮藏在展开后的面板里，不点开根本看不见；
       2. 分组按「必须 / 建议」——那是我们内部的分类，客人关心的是
          「我现在到底要干什么」。护照那项只显示「查看样例」，因为它是邮寄件，
          可页面没说这事，客人只会以为功能缺了。
       改成按<b>客人要做的动作</b>分三组，每项直接把动作摆在面上，不折叠。
       跟免登录分享页 fill.js 里的分组口径完全一致，客人两边看到的是一回事。 */
    var GRP = [
      ['upload', '先拍照传给我们', '上传后由签证专员先行预审，不合格将提前告知，避免面签当天才发现问题'],
      /* 美签的支持性文件是面签当天本人带着，没有寄给我们这一步
         （唐美芳 2026-09-03 核对美国签证中心官网后指出，原材料库配错了）。
         申根、日本那类交代办社送签的仍然有 mail，所以这一组保留、只是美签用不到。 */
      ['mail', '要寄原件过来', '这些必须是纸质原件，寄到下面这个地址，不能拍照代替'],
      ['carry', '面签当天带原件', '不用现在寄给我们，面签那天带着纸质原件去使领馆']
    ];
    function grpOf(i) {
      var w = i.provide_way || [];
      if (w.indexOf('upload') >= 0) return 'upload';
      if (w.indexOf('mail') >= 0) return 'mail';
      return 'carry';
    }
    function card(i) {
      var can = (i.provide_way || []).indexOf('upload') >= 0;
      /* 驳回在库里是 'reject'，'rejected' 是历史笔误，两种都认（2026-09-09） */
      return '<div class="h5-mt' + (i.status === 'reject' || i.status === 'rejected' ? ' bad' : '') + '">' +
        '<div class="hd"><span class="nm">' + esc(i.mat_name) +
        (i.necessity === 'must' ? '<em class="must">必交</em>' : '') + '</span>' +
        matTag(i.status) + '</div>' +
        '<div class="rq">' + esc(i.attr_text) + ' × ' + i.copies +
        (i.require_text ? ' · ' + esc(i.require_text) : '') + '</div>' +
        (i.file_name ? '<div class="fl">已上传：' + matFile(i) + '</div>' : '') +
        (i.ai_msg ? '<div class="ai">' + esc(i.ai_msg) + '</div>' : '') +
        (i.reject_reason ? '<div class="rj">被退回：' + esc(i.reject_reason) + '</div>' : '') +
        '<div class="op">' + sampleBtn(i, 'h5-btn') +
        (can
          ? '<button class="h5-btn' + (i.status === 'wait' ? ' solid' : '') +
            '" data-up="' + i.id + '" data-n="' + esc(i.mat_name) + '">' +
            (i.status === 'wait' ? '上传' : '重新上传') + '</button>'
          : '<span class="h5-btn off">' +
            (grpOf(i) === 'mail' ? '寄原件，不能线上交' : '面试当天携带') + '</span>') +
        '</div></div>';
    }
    var groups = GRP.map(function (g) {
      var items = d.list.filter(function (i) { return grpOf(i) === g[0]; });
      if (!items.length) return '';
      var left = g[0] === 'upload'
        ? items.filter(function (i) {
          return i.status === 'wait' || i.status === 'reject' || i.status === 'rejected';
        }).length : 0;
      return '<div class="h5-sec"><div class="h5-h"><span>' + g[1] + '</span>' +
        '<span class="more">' + (left ? left + ' 项待传' : items.length + ' 项') + '</span></div>' +
        '<div class="h5-gn">' + g[2] + '</div>' +
        items.map(card).join('') +
        (g[0] === 'mail' && d.mail_addr
          ? '<div class="h5-note"><b>寄到这里</b>' + esc(d.mail_addr) +
            '<button class="h5-btn" data-copyaddr style="margin-top:9px">复制地址</button></div>'
          : '') + '</div>';
    }).join('');

    var pct = d.stat.total ? Math.round((d.stat.pass + d.stat.review) * 100 / d.stat.total) : 0;
    var left = Math.max(d.stat.total - d.stat.pass - d.stat.review, 0);
    /* 顶部彩色状态头，跟订单详情、填表页一套（唐美芳 2026-08-31 要的同程那种排版） */
    var body =
      '<div class="cf-hero"><div class="st">' +
      (left ? '还差 <em>' + left + ' 项</em>' : '材料已全部提交') + '</div>' +
      '<div class="sub">' +
      (left ? '请拍照上传供预审；纸质原件由申请人于面签当天自行携带至使领馆。'
        : '签证专员正在复核，如有问题将通过补料通知告知。') + '</div>' +
      '<div class="chips"><span>' + esc(d.applicant.name) + '</span>' +
      '<span>' + esc(d.applicant.crowd) + '</span>' +
      '<span>已通过 ' + d.stat.pass + ' / ' + d.stat.total + '</span></div></div>' +
      '<div class="h5-sec"><div class="h5-mhd">' +
      '<div class="l"><b>' + esc(d.applicant.name) + '</b>' +
      '<s>' + esc(d.applicant.crowd) + ' · ' + esc(d.applicant.progress_text) + '</s></div>' +
      '<div class="r"><b>' + (d.stat.pass + d.stat.review) + '<i>/' + d.stat.total + '</i></b>' +
      '<s>已交</s></div></div>' +
      '<div class="h5-pb"><i style="width:' + pct + '%"></i></div>' +
      '<div class="h5-gn">已通过 ' + d.stat.pass + ' 项 · 待审核 ' + d.stat.review + ' 项 · 还差 ' +
      Math.max(d.stat.total - d.stat.pass - d.stat.review, 0) + ' 项</div></div>' +
      groups +
      /* 分享给同行的家人自己填：一张单多个办签人，各人证件材料只有本人手里有 */
      '<div class="h5-sec"><div class="h5-h"><span>让本人自己交</span></div>' +
      '<div class="h5-gn">生成一个链接发给 ' + esc(d.applicant.name) +
      '，对方打开就能传材料、填申请表，不用登录、不用装 App。链接 7 天有效。</div>' +
      '<div class="h5-mail"><button data-share>生成填写链接</button></div></div>' +
      '<div class="h5-sec"><div class="h5-h"><span>还要填申请表</span></div>' +
      '<div class="h5-gn">材料是原件与扫描件，申请表是使领馆要填的表格，两件事都要做。</div>' +
      '<div class="h5-mail"><button data-form>去填申请表</button></div></div>' +
      '<div class="h5-sec"><div class="h5-mail"><button data-mail>导出材料清单</button></div></div>' +
      '<div class="h5-tip">上传后状态转「待审核」，由签证专员人工复核；' +
      '必交项全部通过时，办理进度自动推进到「材料已齐备」。</div>';

    /* 「要不要寄原件」按本单产品的面签属性说，别再写死成美签那一种
       （2026-09-07 定的口径：需面签＝原件本人带去使领馆；
       免面签＝护照原件寄交指定网点或由快递上门取件）。 */
    m.innerHTML = pageH('提交材料 · ' + d.applicant.name,
      '按<b>客人要做的动作</b>分组：先拍照传给我们的、要寄原件的、面签当天带原件的。' +
      (d.need_interview === 0
        ? '<b>本产品为免面签办理，护照等原件需要寄给我们</b>——寄到下方的收料地址，' +
          '由我们统一交至指定网点送使领馆，出结果后原路寄回。'
        : '<b>本产品需本人面签，不用寄原件</b>——支持性文件面签当天本人带着，' +
          '传给我们的扫描件只用于提前预审。') +
      '每项的操作直接摆在面上，不用点开才看得见。' +
      '<b>还能生成免登录链接发给办签人本人</b>，对方打开就能传材料、填 DS-160。',
      '<button class="btn" data-back2>返回办签人列表</button>') +
      h5page('所需材料', body, '', '这一步在做什么',
        '上传后先过一遍 AI 预审再交人工复核。<b>AI 预审只给提示，不替代人工审核</b>，' +
        '也不对签证结果作任何承诺。提交、缴费、抢号、递交、采指纹五个环节仍由人工在' +
        '使领馆官方渠道完成。', true, '', '', 'cardy hue');
    $('[data-back2]', m).onclick = function () { go('mats'); };
    $('[data-back]', m).onclick = function () { go('mats'); };
    $('[data-form]', m).onclick = function () {
      S.cache.cfSec = null; go('form', d.applicant.id);
    };
    $('[data-mail]', m).onclick = function () {
      var t = d.applicant.name + ' 的签证材料清单';
      downloadText(t + '.txt', matListText(t, d.list));
      toast('材料清单已导出');
    };
    var ca = $('[data-copyaddr]', m);
    if (ca) ca.onclick = function () {
      doCopy(d.mail_addr); ca.textContent = '已复制';
      setTimeout(function () { ca.textContent = '复制地址'; }, 1500);
    };
    /* 分享链接统一走 core.js 的 shareTask()（2026-09-08 批 1） */
    $('[data-share]', m).onclick = function () {
      shareTask(d.applicant.id, d.applicant.name);
    };
    bindSample(m);
    $$('[data-up]', m).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        ask('上传：' + b.dataset.n, [
          {
            k: 'files', label: '选择文件', type: 'file', required: true,
            accept: 'image/*,.pdf', hint: '拍清楚四角、不反光；PDF 请上传原件导出版'
          }
        ], '上传', function (f) {
          return api('/mat/upload', {
            mat_id: +b.dataset.up, file_name: f.files[0].name, file_url: f.files[0].url
          });
        }).then(function (r) { toast(r.ai_msg); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    h5bind(m);
  });
};

/* ================= C 端 · 补料通知（H5） ================= */
VIEWS['customer:supp'] = function (m) {
  return api('/my/supp').then(function (j) {
    var body = j.list.length ? j.list.map(function (s) {
      return '<div class="h5-ord"><div class="hd"><span class="no">' + esc(s.no) + ' · 第 ' + s.round + ' 次补料</span>' +
        '<span class="st">' + (s.status === 'open' ? '剩余 ' + s.days_left + ' 天' : '已完成') + '</span></div>' +
        '<div class="bd"><div class="nm">' + esc(s.name) + '　' + esc(s.ord_no) + '</div>' +
        '<div class="pk">截止时间：' + d16(s.due_at) + '</div>' +
        '<div class="h5-tags" style="margin-top:7px"><span style="color:#FF6A00;background:#FFF4EC">' +
        esc(s.reason || '材料需补充') + '</span></div>' +
        s.items.map(function (i) {
          return '<div class="h5-row" style="padding:9px 0"><span class="lb">' + esc(i.mat_name) + '</span>' +
            '<span class="vl">' + esc(i.reject_reason || '') + '　' + matTag(i.status) + '</span></div>';
        }).join('') + '</div>' +
        (s.status === 'open' ? '<div class="ft"><span class="t"></span><span>' +
          '<button class="h5-btn solid" data-go="' + s.applicant_id + '">去补交</button></span></div>' : '') +
        '</div>';
    }).join('') : '<div class="h5-empty">没有待处理的补料通知</div>';
    m.innerHTML = pageH('补料通知',
      '补料单设 <b>7 天倒计时</b>，同一位办签人最多 3 次；第 3 次仍不齐备将转入挂起或退款流程，避免无限期占用签证名额。') +
      h5page('补料通知', body, '', '这一步在做什么',
        '专员驳回材料时会打包生成一张补料单（BL 单号），而不是逐条通知客户。' +
        '客户补齐并通过复核后补料单自动关闭；必交项全部通过则进度自动推进到「材料已齐备」。', true);
    $('[data-back]', m).onclick = function () { go('me'); };
    $$('[data-go]', m).forEach(function (b) { b.onclick = function () { go('mats', b.dataset.go); }; });
  });
};

/* ================= C 端 · 结果与签收（H5） ================= */
/* 2026-09-02 起接一个订单号参数：从订单详情「结果与签收」进来时只看这一单。
   不带参数仍是全量列表（老入口与深链还在用）。 */
VIEWS['customer:result'] = function (m, ordNo) {
  return Promise.all([api('/my/orders'), api('/deliver/list')]).then(function (r) {
    var body = '';
    r[0].list.forEach(function (o) {
      if (ordNo && o.no !== ordNo) return;
      o.applicants.forEach(function (a) {
        if (!a.result && a.progress !== 'P6') return;
        body += '<div class="h5-ord"><div class="hd"><span class="no">' + esc(o.no) + '</span>' +
          '<span class="st">' + esc(a.result || a.progress_text) + '</span></div>' +
          '<div class="bd"><div class="nm">' + esc(a.name) + '</div>' +
          '<div class="pk">' + esc(o.product) + '</div>' +
          '<div class="h5-tags" style="margin-top:7px"><span>' + esc(a.progress_text) + '</span>' +
          (a.result ? '<span style="color:#FF6A00;background:#FFF4EC">' + esc(a.result) + '</span>' : '') +
          '</div></div>' +
          '<div class="ft"><span class="t"></span><span>' +
          '<button class="h5-btn" data-tr="' + a.id + '">办理进度查询</button></span></div></div>';
      });
    });
    body += r[1].list.filter(function (d) {
      return !ordNo || d.ord_no === ordNo;
    }).map(function (d) {
      return '<div class="h5-ord"><div class="hd"><span class="no">资料返还 ' + esc(d.no) + '</span>' +
        '<span class="st">' + (d.status === 'signed' ? '已签收' : '运输中') + '</span></div>' +
        '<div class="bd"><div class="nm">' + esc(d.ord_no) + '</div>' +
        '<div class="pk">' + esc(d.express || '') + '　' + esc(d.express_no || '') + '</div>' +
        (d.status === 'signed' ? '<div class="h5-tags" style="margin-top:7px"><span>' +
          esc(d.sign_name) + ' 于 ' + d16(d.signed_at) + ' 签收</span></div>' : '') + '</div>' +
        (d.status === 'signed' ? '' : '<div class="ft"><span class="t"></span><span>' +
          '<button class="h5-btn solid" data-sign="' + d.no + '">确认签收</button></span></div>') + '</div>';
    }).join('');
    m.innerHTML = pageH('签证结果与资料签收',
      '出签、拒签结果由专员在使领馆官方渠道查询后回填；护照与资料寄回后由客户在线签收，签收即订单闭环。') +
      h5page('出签与配还', body ||
        '<div class="h5-empty">' + (ordNo ? '这张订单还没有出签结果' : '还没有出签结果') + '</div>',
        '', '这一步在做什么',
        '客户签收后，该订单下所有办签人的进度统一推进到「已交付客户」，订单状态自动置为「已完成」。' +
        '签收记录进入订单事件流，作为后续责任判定的依据。', true);
    /* 从订单详情进来的，返回就回那张订单，不要把客人甩回个人中心 */
    $('[data-back]', m).onclick = function () { ordNo ? go('odetail', ordNo) : go('orders'); };
    $$('[data-tr]', m).forEach(function (b) { b.onclick = function () { go('track', b.dataset.tr); }; });
    $$('[data-sign]', m).forEach(function (b) {
      b.onclick = function () {
        ask('确认签收 ' + b.dataset.sign, [{ k: 'sign_name', label: '签收人', required: true, value: S.user.name }])
          .then(function (f) { return api('/deliver/sign', { no: b.dataset.sign, sign_name: f.sign_name }); })
          .then(function () { toast('已签收'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
  });
};

/* ================= 退款：数据层（C 端与 CSP 共用） ================= */
var RF_ST = { applying: ['warn', '待主管审批'], l1: ['info', '待财务出账'], done: ['ok', '已退款'], reject: ['bad', '已驳回'] };
function refundRecords(list) {
  return card('退款申请记录', '<div class="pad">' + table(
    ['退款单', '订单', '办签人', '金额', '责任', '状态'], list, function (x) {
      var st = RF_ST[x.status] || ['plain', x.status];
      return '<td class="mono">' + esc(x.no) + '</td><td class="mono">' + esc(x.ord_no) + '</td><td>' +
        esc(x.names) + '</td><td class="num">¥' + money(x.amount) + '</td><td>' + esc(x.liability_text || '-') +
        '</td><td><span class="tag ' + st[0] + '">' + st[1] + '</span></td>';
    }, '暂无退款申请') + '</div>');
}
function doRefund(no, ids, page) {
  return ask('退款申请', [
    { k: 'reason_cate', label: '退款原因分类', type: 'select', options: ['行程取消', '拒签', '客户主动放弃', '我司服务失误', '其他'] },
    { k: 'reason', label: '具体说明', type: 'textarea', ph: '请描述具体情况' }
  ], '提交', function (f) {
    return api('/refund/apply', { no: no, applicant_ids: ids, reason_cate: f.reason_cate, reason: f.reason });
  }, page).then(function (x) {
    toast('已提交 ' + x.no + '，试算 ¥' + money(x.amount) + '，待主管审批'); reload();
  }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
}

/* ================= C 端 · 退款（H5：选择退款客人 + 底部合计） ================= */
VIEWS['customer:refund'] = function (m, ordNo) {
  return Promise.all([api('/my/orders'), api('/refund/list')]).then(function (r) {
    var orders = r[0].list.filter(function (o) { return o.status !== 'created'; });
    /* 默认别落在一张「已出签、一分不退」的单上：客人一进来看到全是 ¥0、
       勾了也没反应，会以为页面坏了（唐美芳 2026-09-02：「申请退款页面现在是
       假的数据，无法操作」）。优先挑还在办理中、真能退的那张。 */
    var live = orders.filter(function (o) {
      return (o.applicants || []).some(function (a) {
        return a.state === 'normal' && !a.result;
      });
    });
    var no = ordNo || (live[0] || orders[0] || {}).no;
    if (!no) {
      m.innerHTML = pageH('退款', '暂无可退款的订单。') + refundRecords(r[1].list);
      return;
    }
    return api('/refund/quote?no=' + encodeURIComponent(no)).then(function (q) {
      var body = '<div class="h5-sec"><div class="h5-h"><span>选择退款客人</span>' +
        '<span class="more">' + esc(q.pkg) + '</span></div>' +
        q.list.map(function (x) {
          /* 可退 0 元的也要置灰：勾得动却永远合计 ¥0、点了没反应，最像坏页面 */
          var done = x.state === 'refunded';
          var dis = done || !(x.refundable > 0);
          return '<div class="h5-pick' + (dis ? ' dis' : '') + '" data-a="' + x.id + '">' +
            '<span class="bx"></span><span class="gr">' + esc(x.name) +
            '<s>' + esc(x.progress_text) + (x.result ? ' · ' + esc(x.result) : '') +
            ' · 实付 ¥' + money(x.paid) + '<br>' + esc(x.rule) + '</s></span>' +
            '<span class="am">' + (done ? '已退款'
              : (x.refundable > 0 ? '¥' + money(x.refundable) : '不可退')) + '</span></div>';
        }).join('') + '</div>' +
        '<div class="h5-tip">退款金额由规则引擎按「当前办理进度 + 责任判定」自动测算，' +
        '提交后需经签证主管审批、财务出账两道流程。</div>';
      var foot = '<span class="sum">合计可退 <b id="rfsum">¥0</b></span>' +
        '<button class="cta" data-apply>申请退款</button>';
      m.innerHTML = pageH(menuName('refund', '退款申请') + ' · 试算',
        '退款金额由<b>规则引擎</b>按进度节点自动算出，不由人工填数；已递交使领馆后签证费不可退，服务费按节点分档。',
        orders.length > 1 ? '<select class="i" style="width:230px" id="rfno">' + orders.map(function (o) {
          return '<option value="' + esc(o.no) + '"' + (o.no === no ? ' selected' : '') + '>' +
            esc(o.no) + ' · ' + esc(o.product) + '</option>';
        }).join('') + '</select>' : '') +
        h5page('申请退款', body, foot, '这一步在做什么',
          '客户勾选需要退款的客人后系统实时合计可退金额。<b>退款以办签人为单位</b>，' +
          '同一订单里已出签的客人不受影响，避免整单回滚。', true) + refundRecords(r[1].list);
      var sel = $('#rfno', m);
      if (sel) sel.onchange = function () { go('refund', this.value); };
      function sum() {
        var t = 0;
        $$('.h5-pick.on', m).forEach(function (el) {
          var x = q.list.filter(function (y) { return y.id == el.dataset.a; })[0];
          if (x) t += x.refundable;
        });
        $('#rfsum', m).textContent = '¥' + money(t);
      }
      $$('.h5-pick', m).forEach(function (el) {
        if (el.classList.contains('dis')) return;
        el.onclick = function () { el.classList.toggle('on'); sum(); };
      });
      $('[data-apply]', m).onclick = function () {
        var ids = $$('.h5-pick.on', m).map(function (x) { return +x.dataset.a; });
        if (!ids.length) {
          /* 一个能勾的都没有时，说清楚为什么，别只说「请先选择」——
             客人会以为是自己没点对 */
          var any = $$('.h5-pick:not(.dis)', m).length;
          return toast(any ? '请先勾选要退款的客人'
            : '这张订单当前没有可退款的客人：已出签或已退款的不再退款', true);
        }
        doRefund(no, ids, true);   /* 手机上原因表单走整页，不用弹窗 */
      };
    });
  });
};

/* ================= CSP（PC） · 我的订单 ================= */
VIEWS['csp:orders'] = function (m) {
  return api('/my/orders').then(function (j) {
    /* 办理中再按办签进度细分，销售最关心「材料收齐没」和「出签了没」 */
    function pmax(o) {
      return Math.max.apply(null, o.applicants.map(function (a) {
        return parseInt((a.progress || 'P1').slice(1), 10) || 1;
      }));
    }
    var q = srchCard('csford', [
      { k: 'no', t: '订单号', ph: '支持模糊查询' },
      { k: 'contact', t: '联系人', ph: '下单联系人姓名' },
      { k: 'product', t: '产品名称', ph: '支持模糊查询' },
      {
        /* 「订单状态」已经是下面的页签，这里不再重复放一遍下拉。
           销售真正要挑出来的是钱和时间上的异常，这两条和订单状态是可叠加的另一个维度。 */
        k: 'money', t: '支付状态', type: 'sel',
        /* 原来这里是「资金异常」，选项之一是「待财务确认到账」——那是总部财务的内部环节，
           门店销售既看不懂也做不了。换成他真正要追的支付状态
           （唐美芳 2026-09-03：「订单列表直接增加一个支付状态展示吧，
           别展示待财务确认到账了」）。
           原来那个「存在欠款」没单列——「部分支付」本身就是有欠款，欠多少看金额列。 */
        opts: [['unpaid', '待支付'], ['part', '部分支付'], ['paid', '已支付']],
        get: function (o) { return o.pay_state || 'unpaid'; }
      },
      /* 办签进度是独立于订单状态的另一条线，所以是筛选项不是页签：
         一张「已付款」的单同时可能「待收材料」，两个条件要能叠加着查
         （唐美芳 2026-08-31：订单状态就 5 个，不要跟签证办理状态混）。 */
      {
        k: 'work', t: '办理状态', type: 'sel',
        opts: WORK_ST,
        get: function (o) { return o.work_status || '未完成'; }
      },
      {
        k: 'node', t: '办签进度', type: 'sel',
        opts: [['mat', '待收材料'], ['run', '材料已收'],
        ['visa', '已出签待返还'], ['na', '未开始']],
        get: function (o) {
          if (!o.gate || o.status !== 'paid') return 'na';
          var p = pmax(o);
          return p <= 2 ? 'mat' : (p < 8 ? 'run' : 'visa');
        }
      }
    ]);
    var hit = q.filter(j.list);

    /* 页签 = 订单状态，只有这 5 个值（唐美芳 2026-08-31：
       「之前不是说就5个么，你怎么还是把订单状态与签证办理状态混在一起了」）。
       原来这条页签是「待支付 / 待财务放行 / 待收材料 / 办理中 / 已出签待返还 /
       已完成 / 退款取消」——8 个格子里混了三条线：订单状态、资金闸门、办签进度。
       混在一起的后果是它们并不互斥：一张「已付款」的单同时是「待收材料」，
       点哪个页签都对，也都不全。
       现在办签进度与资金闸门降级成筛选项（在上面的查询卡里），各查各的。 */
    var t = subTabs('csford', [
      { k: 'all', t: '全部', fn: function () { return true; } },
      { k: 'created', t: '待付款', fn: function (o) { return o.status === 'created'; } },
      { k: 'paid', t: '已付款', fn: function (o) { return o.status === 'paid'; } },
      { k: 'done', t: '已完成', fn: function (o) { return o.status === 'done'; } },
      { k: 'refunded', t: '已退款', fn: function (o) { return o.status === 'refunded'; } },
      { k: 'cancelled', t: '已取消', fn: function (o) { return o.status === 'cancelled'; } }
    ], hit);
    /* 「下单时间」和「成交额」是数据，销售要的是「最近的排前面」「大单先跟」，
       所以做成可排序表头，而不是再加两个筛选框。 */
    var so = sorter('csford', [
      ['订单信息', function (o) { return o.created_at || ''; }],
      ['金额与收款', function (o) { return o.amount || 0; }]
    ]);
    var pg = pager('csford', so.sort(t.rows), 6);

    m.innerHTML = pageH(menuName('orders', '订单管理'),
      '门店销售与同业在这里跟进自然成交与代客下单的全部订单。') +
      /* 操作说明 2026-09-03 撤掉，同 UOM / UBK 的订单列表（唐美芳：
         「后台的操作说明，不用每个页面都展示，比如订单管理、客户管理」）。 */
      olSum(t.rows) + q.html +
      '<div class="card">' + t.html + '<div class="pad scrollx">' + olTable(pg.rows, {
        view: 'csp',
        /* 操作按钮组按 CSP 现有旅游订单那一排对齐（唐美芳 2026-09-01 给了截图）：
           录入客人签证资料 / 收款 / 开票 / 退款 / 调整合同价 / 调整结算价 /
           调整合同价·结算价 / 签订合同。其中「录入客人签证资料」是本期真做的功能，
           排在收款之前是推荐路径，但不再是硬前置——2026-09-02 起资料没录齐也能收款，
           免得订单卡死在待付款。
           其余几个按她的要求先占位，点了给一句说明，不做假动作。 */
        actions: function (o) {
          var b = [];
          if (o.todo) b.push('<span class="hint" style="margin-right:auto">' + esc(o.todo) + '</span>');
          var live = o.status === 'created' || o.status === 'paid';
          if (live) {
            b.push('<button class="btn ' + (o.info_state === 'done' ? 'sm' : 'r sm') +
              '" data-oinfo="' + esc(o.no) + '">' +
              (o.info_state === 'done' ? '客人签证资料' : '录入客人签证资料') +
              (o.info_state === 'wait' && o.info_left ? '（' + esc(o.info_left) + '）' : '') +
              '</button>');
          }
          if (o.status === 'created')
            b.push('<button class="btn sm" data-pay="' + esc(o.no) + '">收款 ¥' + money(o.amount) + '</button>');
          b.push(oiSoon('开票', o));
          /* 逐位办签人的材料入口原来平铺在这一行，一单三个人就是三个按钮，
             把真正的订单级操作挤到后面（唐美芳 2026-09-01：「已付款、已完成订单的
             按钮里怎么还有某个客人的材料清单按钮展示呢，这个有问题，去掉」）。
             材料按人看，本来就该在订单详情的办签人那张表里点。 */
          if ((o.status === 'paid' && o.gate) || o.status === 'done')
            b.push('<button class="btn sm" data-rf="' + esc(o.no) + '">退款</button>');
          b.push(oiSoon('调整合同价', o), oiSoon('调整结算价', o),
                 oiSoon('调整合同价/结算价', o), oiSoon('签订合同', o));
          b.push('<button class="btn sm" data-pr="' + esc(o.no) + '">办签进度</button>');
          b.push('<button class="btn sm p" data-odt2="' + esc(o.no) + '">查看详情</button>');
          return '<div class="btns">' + b.join('') + '</div>';
        }
      }) + '</div>' + pg.html + '</div>';

    q.bind(m, function () { S.cache['pg:csford'] = 1; reload(); });
    t.bind(m, function () { S.cache['pg:csford'] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:csford'] = 1; reload(); });
    pg.bind(m, reload);
    $$('[data-pay]', m).forEach(function (b) {
      b.onclick = function () {
        api('/order/pay', { no: b.dataset.pay }).then(function (r) { toast(r.msg); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    /* 客人签证资料改在订单详情里就地编辑，不再单开一页
       （唐美芳 2026-09-01：「操作就不散着了，还得每个按钮一个页面」）。
       列表上这个按钮现在是「跳到详情的办签人信息那一块」。 */
    $$('[data-oinfo]', m).forEach(function (b) {
      b.onclick = function () { S.cache.odJump = 'aps'; go('odetail', b.dataset.oinfo); };
    });
    oiSoonBind(m);
    /* 点产品名 → 门店侧产品详情（唐美芳 2026-09-08） */
    $$('[data-olpd]', m).forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); go('pdetail', b.dataset.olpd); };
    });
    $$('[data-odt2],[data-oldet]', m).forEach(function (b) {
      b.onclick = function () { go('odetail', b.dataset.odt2 || b.dataset.oldet); };
    });
    $$('[data-mat]', m).forEach(function (b) { b.onclick = function () { go('mats', b.dataset.mat); }; });
    $$('[data-rf]', m).forEach(function (b) { b.onclick = function () { go('refund', b.dataset.rf); }; });
    $$('[data-pr]', m).forEach(function (b) {
      b.onclick = function () {
        var o = j.list.filter(function (x) { return x.no === b.dataset.pr; })[0];
        modal('办签进度 · ' + o.no,
          '<div class="note">签证是<b>按人推进</b>的：同一张订单里，每个办签人的材料、送签、出签各走各的节点。' +
          '销售跟单看的就是谁卡住了。</div>' +
          o.applicants.map(function (a) {
            return '<div style="margin-bottom:14px"><div style="font-size:13px;margin-bottom:6px">' +
              '<b>' + esc(a.name) + '</b> ' +
              (a.state === 'refunded' ? '<span class="tag bad">已退款</span>' :
                '<span class="tag info">' + esc(a.progress_text) + '</span>') +
              (a.result ? ' <span class="tag ok">' + esc(a.result) + '</span>' : '') +
              '</div>' + steps(a.progress) + '</div>';
          }).join(''), null, true);
      };
    });
  });
};

/* ================= CSP（PC） · 客户材料 ================= */
/* 供应商侧的材料清单：**只读**。护照原件寄到供应商手上，他得知道客人还缺哪几项，
   否则「待收料」这一档他只能干等（唐美芳 2026-09-08）。
   不给上传按钮——材料由客人或门店销售提交，供应商只负责核对与收件；
   申请表那一层对供应商仍然关闭（见后端 task_guard 的注释）。 */
/* 材料清单页：供应商与众信运营共用一份（2026-09-09 两端整合，唐美芳：
   「主要以 ubk 为主……其余操作和内容尽量保持一致」）。
   说明文案按角色换一句，其余完全一样——两边看到的清单、状态、按钮都是同一套。 */
VIEWS['uom:mats'] = VIEWS['lead:mats'] = VIEWS['ops:mats'] =
VIEWS['ubk:mats'] = function (m, aid) {
  if (!aid) return go('board');
  return api('/my/checklist?applicant_id=' + aid).then(function (d) {
    var ex = d.excluded || [];
    m.innerHTML = pageH('材料清单 · ' + d.applicant.name,
      '清单按<b>适用人群「' + esc(d.applicant.crowd) + '」</b>自动裁剪：平台清单共 ' +
      (d.fv_total || d.list.length) + ' 项，适用于本人 <b>' + d.list.length + '</b> 项，' +
      '其中必交 ' + d.stat.must + ' 项，已通过 ' + d.stat.pass + ' 项。',
      '<button class="btn" data-back>← 返回签证办理中心</button>') +
      /* 2026-09-08 权限下放：供应商是实际收料方，代客上传一并放开
         （原来这一页是只读的）。 */
      /* 2026-09-09 唐美芳拍板把材料审核下放给供应商：「按照你建议的来」＋
         「如果是客户填写的材料，还是需要有驳回通过按钮的，让客户知道自己填的有问题」。
         供应商是实际收件人（护照原件寄到他那儿），原来他收齐了也推不动工单。 */
      '<div class="note">' + (S.role === 'ubk' ? '贵司' : '本页') +
      '可代客户上传材料，也可在办理中心点「填申请表」页里的' +
      '「发给客人自己填」让客户自己传。<b>逐项核对后点「通过」或「驳回」</b>：' +
      '必交项全部通过后，工单自动转入「处理中」；' +
      '驳回需写明原因，<b>客户在小程序上会看到该原因并重新上传</b>。' +
      (ex.length ? '另有 <b>' + ex.length + '</b> 项因适用人群不符未列入本清单。' : '') +
      '</div>' +
      card('材料明细', '<div class="pad scrollx">' + table(
        ['材料', '必要性', '属性/份数', '提供方式', '要求', '状态', '操作'], d.list, function (i) {
          return '<td><b>' + esc(i.mat_name) + '</b>' +
            (i.file_name ? '<div class="sub">已上传：' + matFile(i) + '</div>' : '') +
            (i.reject_reason ? '<div class="sub" style="color:#C8102E">驳回：' +
              esc(i.reject_reason) + '</div>' : '') +
            '</td><td>' + (i.necessity === 'must'
              ? '<span class="tag bad">必须</span>' : '<span class="tag plain">建议</span>') +
            '</td><td class="nw">' + esc(i.attr_text) + ' × ' + i.copies +
            '</td><td class="nw">' + esc(i.way_text) +
            '</td><td style="max-width:280px">' + esc(i.require_text || '') +
            '</td><td class="nw">' + matTag(i.status) +
            '</td><td><div class="btns">' + sampleBtn(i) +
            (i.provide_way.indexOf('upload') >= 0
              ? '<button class="btn sm" data-up="' + i.id + '" data-n="' + esc(i.mat_name) + '">' +
                (i.status === 'wait' ? '上传' : '重新上传') + '</button>'
              : '<span class="sub">线下收取</span>') +
            /* 已通过的不再给按钮——改判要走驳回，留痕更清楚 */
            (i.status !== 'pass'
              ? '<button class="btn sm ok" data-mp="' + i.id + '">通过</button>' +
                '<button class="btn sm" data-mr="' + i.id + '" data-n="' +
                esc(i.mat_name) + '">驳回</button>'
              : '') + '</div></td>';
        }) + '</div>');
    $('[data-back]', m).onclick = function () { go('board'); };
    $$('[data-up]', m).forEach(function (b) {
      b.onclick = function () {
        ask('上传：' + b.dataset.n, [
          { k: 'files', label: '选择文件', type: 'file', required: true,
            accept: 'image/*,.pdf', hint: '拍清楚四角、不反光；PDF 请上传原件导出版' }
        ], '上传', function (f) {
          return api('/mat/upload', {
            mat_id: +b.dataset.up, file_name: f.files[0].name, file_url: f.files[0].url
          });
        }).then(function (r) { toast(r.ai_msg); reload(); }).catch(function () { });
      };
    });
    $$('[data-mp]', m).forEach(function (b) {
      b.onclick = function () {
        api('/mat/review', { mat_id: +b.dataset.mp, action: 'pass' })
          .then(function (r) {
            toast(r.stat && r.stat.ready ? '已通过，必交材料已齐备，工单转入「处理中」'
              : '已通过');
            reload();
          }).catch(fail);
      };
    });
    $$('[data-mr]', m).forEach(function (b) {
      b.onclick = function () {
        /* 驳回必须写原因：客户在小程序上看到的就是这句话，写「不合格」等于没说
           （唐美芳 2026-09-09：「让客户知道自己填的有问题」）。 */
        ask('驳回：' + b.dataset.n, [
          { type: 'html', html: '<div class="note">驳回原因会<b>原样展示给客户</b>，' +
            '请写清楚哪里不合格、要怎么重拍或重开，客户照着改一次就能过。</div><br>' },
          { k: 'reason', label: '驳回原因', type: 'textarea', required: true,
            ph: '如：护照资料页反光，四角未拍全，请在自然光下平铺重拍' }
        ], '驳回', function (f) {
          return api('/mat/review', { mat_id: +b.dataset.mr, action: 'reject',
            reason: f.reason });
        }).then(function () { toast('已驳回，客户将收到补交提示'); reload(); }).catch(fail);
      };
    });
    bindSample(m);
  });
};

VIEWS['csp:mats'] = function (m, aid) {
  if (!aid) {
    return api('/my/orders').then(function (j) {
      var all = [];
      j.list.forEach(function (o) {
        if (o.status === 'created') return;
        o.applicants.forEach(function (a) { all.push({ o: o, a: a }); });
      });
      m.innerHTML = pageH('客户材料', '门店可代客户核对与上传材料，操作留痕记在门店账号名下。') +
        card('选择办签人', '<div class="pad">' + (all.length ? table(
          ['办签人', '订单号', '产品', '当前进度', '操作'], all, function (x) {
            return '<td>' + esc(x.a.name) + '</td><td class="mono">' + esc(x.o.no) + '</td><td>' +
              esc(x.o.product) + '</td><td>' + esc(x.a.progress_text) + '</td>' +
              '<td><button class="btn sm" data-a="' + x.a.id + '">查看清单</button></td>';
          }) : '<div class="empty">暂无可提交材料的订单，需先完成支付</div>') + '</div>');
      $$('[data-a]', m).forEach(function (b) { b.onclick = function () { go('mats', b.dataset.a); }; });
    });
  }
  return api('/my/checklist?applicant_id=' + aid).then(function (d) {
    /* 「清单不全」是最常被问的一句（唐美芳 2026-09-08）。少的那几项不是漏，
       是按适用人群裁掉的——把平台清单总数、本人适用数、被裁掉的项都摆出来，
       页面自己答掉这个疑问，不用再来问人。 */
    var ex = d.excluded || [];
    m.innerHTML = pageH('材料清单 · ' + d.applicant.name,
      '清单按<b>适用人群「' + esc(d.applicant.crowd) + '」</b>自动裁剪：平台清单共 ' +
      (d.fv_total || d.list.length) + ' 项，适用于本人 <b>' + d.list.length + '</b> 项，' +
      '其中必交 ' + d.stat.must + ' 项，已通过 ' + d.stat.pass + ' 项。' +
      (d.mail_addr ? '原件邮寄至：' + esc(d.mail_addr) : ''),
      '<button class="btn" data-back2>返回列表</button>') +
      (ex.length
        ? '<div class="note">另有 <b>' + ex.length + '</b> 项因适用人群不符未列入本清单，' +
          '<a class="lnk" data-exsee>查看未列入的材料</a>。' +
          '如客人的实际身份与「' + esc(d.applicant.crowd) + '」不符，请先更正适用人群，' +
          '清单会随之重新生成。</div>'
        : '') +
      card('材料明细', '<div class="pad">' + table(
        ['材料', '必要性', '属性/份数', '提供方式', '要求', '状态', '操作'], d.list, function (i) {
          return '<td><b>' + esc(i.mat_name) + '</b>' +
            (i.file_name ? '<div class="sub">已上传：' + matFile(i) + '</div>' : '') +
            (i.ai_msg ? '<div class="sub">AI 预审：' + esc(i.ai_msg) + '</div>' : '') +
            (i.reject_reason ? '<div class="sub" style="color:#C8102E">驳回：' + esc(i.reject_reason) + '</div>' : '') +
            '</td><td>' + (i.necessity === 'must' ? '<span class="tag bad">必须</span>' : '<span class="tag plain">建议</span>') +
            '</td><td>' + esc(i.attr_text) + ' × ' + i.copies + '</td><td>' + esc(i.way_text) +
            '</td><td style="color:#475467;max-width:260px">' + esc(i.require_text || '') + '</td><td>' + matTag(i.status) +
            '</td><td><div class="btns">' + sampleBtn(i) +
            (i.provide_way.indexOf('upload') >= 0 ?
              '<button class="btn sm" data-up="' + i.id + '" data-n="' + esc(i.mat_name) + '">' +
              (i.status === 'wait' ? '上传' : '重新上传') + '</button>' : '<span class="sub">线下收取</span>') + '</div></td>';
        }) + '</div>');
    $('[data-back2]', m).onclick = function () { go('mats'); };
    $('[data-exsee]', m) && ($('[data-exsee]', m).onclick = function () {
      modal('未列入本清单的材料（' + ex.length + ' 项）',
        '<div class="pad"><div class="hint">以下材料在平台清单中存在，但适用人群与本办签人' +
        '（' + esc(d.applicant.crowd) + '）不符，因此未列入。</div>' +
        table(['材料名称', '适用人群'], ex, function (x) {
          return '<td><b>' + esc(x.name) + '</b></td><td>' + esc(x.crowds) + '</td>';
        }) + '</div>', [{ t: '关闭' }]);
    });
    $$('[data-up]', m).forEach(function (b) {
      b.onclick = function () {
        ask('上传：' + b.dataset.n, [
          {
            k: 'files', label: '选择文件', type: 'file', required: true,
            accept: 'image/*,.pdf', hint: '拍清楚四角、不反光；PDF 请上传原件导出版'
          }
        ], '上传', function (f) {
          return api('/mat/upload', {
            mat_id: +b.dataset.up, file_name: f.files[0].name, file_url: f.files[0].url
          });
        }).then(function (r) { toast(r.ai_msg); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    bindSample(m);
  });
};

/* ================= CSP（PC） · 退款申请 ================= */
VIEWS['csp:refund'] = function (m, ordNo) {
  return Promise.all([api('/my/orders'), api('/refund/list')]).then(function (r) {
    var orders = r[0].list.filter(function (o) { return o.status !== 'created'; });
    var no = ordNo || (orders[0] || {}).no;
    if (!no) { m.innerHTML = pageH(menuName('refund', '退款申请'), '暂无可退款的订单。') + refundRecords(r[1].list); return; }
    return api('/refund/quote?no=' + encodeURIComponent(no)).then(function (q) {
      m.innerHTML = pageH(menuName('refund', '退款申请') + ' · 试算',
        '退款金额由<b>规则引擎</b>按「当前办理进度 + 责任判定」自动算出，门店不可手工改数。') +
        card('订单 ' + esc(no) + ' 退款试算 <span>' + esc(q.pkg) +
          '，单人实付 ¥' + money(q.unit) + '</span>',
          '<div class="pad">' + table(['办签人', '当前进度', '结果', '责任', '实付', '可退', '适用规则'], q.list, function (x) {
            return '<td><label style="display:flex;gap:6px;align-items:center">' +
              (x.state === 'refunded' ? '' : '<input type="checkbox" style="width:auto;height:auto" data-a="' + x.id + '">') +
              esc(x.name) + '</label></td><td>' + esc(x.progress_text) + '</td><td>' + esc(x.result || '-') +
              '</td><td>' + esc(x.liability_text || '-') + '</td><td class="num">¥' + money(x.paid) +
              '</td><td class="num"><b>¥' + money(x.refundable) + '</b></td><td style="color:#475467">' +
              esc(x.rule) + '</td>';
          }) + '<div class="btns" style="margin-top:14px"><button class="btn r" data-apply>提交退款申请</button>' +
          '<select class="i" style="width:230px" id="rfno">' + orders.map(function (o) {
            return '<option value="' + esc(o.no) + '"' + (o.no === no ? ' selected' : '') + '>' +
              esc(o.no) + ' · ' + esc(o.product) + '</option>';
          }).join('') + '</select></div></div>') + refundRecords(r[1].list);
      $('#rfno', m).onchange = function () { go('refund', this.value); };
      $('[data-apply]', m).onclick = function () {
        var ids = $$('[data-a]:checked', m).map(function (x) { return +x.dataset.a; });
        if (!ids.length) return toast('请先勾选要退款的办签人', true);
        doRefund(no, ids);
      };
    });
  });
};

/* ============================================================
   C 端 · 订单详情
   唐美芳 2026-08-31：「C端小程序页面补填资料的入口及办理进度从哪里查看，
   怎么没看到操作页面啊，这块是不完善的」。

   信息结构照她给的 H5 设计图《订单详情》：邮寄地址 / 产品 / 办签人 / 联系人 / 收货 / 发票。
   ⚠ 但视觉不照抄那张图——设计图是 2018 年的老 H5（左侧橙色竖条标题、窄标签双栏、
   底部一排描边按钮），本小程序早就换了一套语言，h5.css 里写得很明白：
   「章节标题：去掉竖条，靠字重和留白建立层级」。第一版我把老图的样式一起搬了进来，
   跟其他页面对不上（唐美芳 2026-08-31：「你设计的这个页面和现在小程序里的页面
   不是一个风格啊，你真正理解逻辑了么」）。
   现在全部用现成组件：.h5-sec 白卡 / .h5-h 粗体标题 / .h5-row 行 /
   底栏 .sum + .cta —— 主操作一个大按钮，次操作在页面里成行，跟「我的」页一致。
   ============================================================ */

/* 一行「标签 —— 值」，就是列表页那个 .h5-row，不带箭头时不可点 */
function odRow(k, v, opt) {
  opt = opt || {};
  return '<div class="h5-row"' + (opt.k ? ' data-k="' + opt.k + '"' : '') +
    (opt.k ? '' : ' style="cursor:default"') + '>' +
    '<span class="lb">' + esc(k) + '</span>' +
    '<span class="vl' + (opt.mut ? ' mut' : '') + '">' + v + '</span>' +
    (opt.k ? '<span class="ar">›</span>' : '') + '</div>';
}
function odSecH(title, more) {
  return '<div class="h5-h"><span>' + esc(title) + '</span>' +
    (more ? '<span class="more">' + more + '</span>' : '') + '</div>';
}

VIEWS['customer:odetail'] = function (m, no) {
  if (!no) return go('orders');
  return api('/my/order/detail?no=' + encodeURIComponent(no)).then(function (d) {
    var paid = d.status !== 'created' && d.status !== 'cancelled';
    /* 邮寄地址只在<b>确实有需要寄原件的材料</b>时才出现。
       2026-09-03 唐美芳指出：美签的支持性文件是面签当天本人带着，没有寄原件这一步，
       原来材料库把 25 项标成「邮寄/自送」是配错了，已按官方流程改成
       「扫描件上传给我们预审 + 原件面签自带」。申根、日本那类交给代办社送签的
       仍然有邮寄，所以这一块不是删掉，是改成按材料方式判断。 */
    var mail = d.need_mail ? d.mail_addr : null;
    /* 材料还没寄出（还有人停在 P1）时默认展开邮寄地址——寄之前它最要紧，寄完就不看了 */
    var needMail = mail && d.applicants.some(function (a) { return a.progress === 'P1'; });
    var waitN = d.applicants.reduce(function (n, a) { return n + a.mat_wait; }, 0);
    var suppN = d.applicants.reduce(function (n, a) { return n + a.supp_open; }, 0);

    /* 顶部彩色状态头（唐美芳 2026-08-31：「怎么一点颜色都没有呀」，
       附同程订单页截图——那张的顶部就是一整块品牌色 + 白色大字状态）。
       一句话说清此刻的状态和下一步该干什么，白卡再压上来。 */
    /* 大标题只能是订单状态那 5 个值之一（唐美芳 2026-08-31：
       「之前不是说就5个么，你怎么还是把订单状态与签证办理状态混在一起了」）。
       我上一版把「办理中」「有 N 条补料通知」直接当成状态标题了——
       前者是另一条线（work_status），后者根本不是状态而是待办。
       现在：标题 = 订单状态，紧跟一个小字的办理状态，待办放到副说明里。 */
    var heroSt = d.status_text;
    var heroWk = (d.status === 'paid' || d.status === 'done') ? (d.work_status || '未完成') : '';
    /* 支付状态（唐美芳 2026-09-03，五端同步）：订单状态说整单走到哪，
       支付状态说钱付了多少——分期付定金的单子只有这一行能看出来。 */
    var heroPst = d.pay_state || 'unpaid';
    var heroSub;
    if (heroPst === 'part') {
      /* 分期付款的单子，客人最想知道的是「我还差多少」。
         这一支要排在 created 前面——已经付过定金了，
         再说「付款后我们才会开始办理」等于当他没付过。 */
      heroSub = '已收到 ¥' + money((d.recv || 0) + (d.recv_wait || 0)) +
        '，还差 ¥' + money(d.owe || 0) + '，付清后我们才能送签。';
    } else if (d.status === 'created') {
      heroSub = '付款后我们才会开始办理，超时未付会自动取消。';
    } else if (d.status === 'cancelled') {
      heroSub = '如已付款，退款按规则原路返回。';
    } else if (d.status === 'refunded') {
      heroSub = '退款已出账，原路返回到付款账户。';
    } else if (!d.gate) {
      heroSub = '商家正在确认收款，确认后立即开始办理。';
    } else if (suppN) {
      heroSub = '有 ' + suppN + ' 条补料通知待处理，请尽快重新提交，以免耽误送签排期。';
    } else if (waitN) {
      heroSub = '还有 ' + waitN + ' 项材料没交，交齐我们才能送签，可在下方逐项提交。';
    } else if (d.status === 'done') {
      heroSub = '结果与资料已处理完毕，可在办理进度里查看。';
    } else {
      heroSub = '材料已齐，签证专员正在推进，进度实时可查。';
    }
    var body =
      '<div class="cf-hero"><div class="st">' + esc(heroSt) +
      (heroWk ? '<em>办理：' + esc(heroWk) + '</em>' : '') +
      '<em>' + esc(PAY_ST_CN[heroPst] || heroPst) + '</em></div>' +
      '<div class="sub">' + heroSub + '</div>' +
      /* 订单号、金额、人数都收进色块里的胶囊，下面就不再单开一张卡重复一遍——
         色块本身已经是「订单头」了 */
      '<div class="chips"><span>' + esc(d.no) + '</span>' +
      '<span>¥' + money(d.amount) + '</span>' +
      '<span>' + d.pax + ' 人 · ' + d10(d.depart_date) + ' 出发</span>' +
      '<span>' + d16(d.created_at).slice(0, 10) + ' 下单</span>' +
      (d.refunded ? '<span>已退 ¥' + money(d.refunded) + '</span>' : '') + '</div></div>' +

      (mail ? '<div class="h5-sec od-fold' + (needMail ? ' open' : '') + '" data-fold>' +
        odSecH('资料邮寄地址', '<em class="fc">⌄</em>') +
        '<div class="od-fb">' +
        '<div class="h5-tip" style="padding-bottom:2px">请把签证资料原件寄到这里，' +
        '包裹里附上办签人姓名与订单号。</div>' +
        odRow('收件地址', esc(mail.region + ' ' + mail.detail)) +
        odRow('联系人', esc((mail.contact || '') + '　' + (mail.phone || ''))) +
        odRow('要交哪些材料', '<span class="mut">按人群定制的清单</span>', { k: 'mats' }) +
        '</div></div>' : '') +

      '<div class="h5-sec">' + odSecH('产品信息') +
      '<div class="od-pd"><b>' + esc(d.product) + '</b>' +
      '<div class="h5-tags"><span>' + esc(d.pkg) + '</span>' +
      (d.visa_cat ? '<span>' + esc(d.visa_cat) + '</span>' : '') +
      '<span>' + d10(d.depart_date) + ' 出发</span><span>' + d.pax + ' 人</span></div></div></div>' +

      /* 办签人按人一行：一张单多个人，进度经常不同步，合成一个状态会骗人。
         整行可点，直接进这个人的材料页。 */
      /* 办签人按人一行：一张单多个人，进度经常不同步，合成一个状态会骗人。
         2026-09-02 每人下面挂上自己的动作 —— 补充资料 / 办理进度 / 填申请表 /
         结果与签收。这四件事本来就是按人走的（唐美芳：「办理进度查询不应该是在
         每个办签人的操作按钮里么」），原先只有订单级一个入口，多人单里点进去
         看到的是第一个人的进度，其余人无从查起。 */
      '<div class="h5-sec">' + odSecH('办签人', waitN ? '共 ' + waitN + ' 项待交' : '') +
      d.applicants.map(function (a) {
        var st = a.state === 'refunded' ? '已退款' : a.state === 'cancelled' ? '已取消' : a.progress_text;
        var canOp = paid && a.state === 'normal';
        return '<div class="od-apw">' +
          '<div class="h5-row" data-ap="' + a.id + '">' +
          '<span class="lb od-apn">' + esc(a.name) +
          '<s>' + esc(a.id_type) + ' ' + esc(a.id_no) + '</s></span>' +
          '<span class="vl">' + esc(st) +
          (a.supp_open ? '<em class="od-wn">' + a.supp_open + ' 条补料</em>'
            : (a.mat_wait ? '<em class="od-mut">' + a.mat_wait + ' 项待交</em>' : '')) +
          '</span><span class="ar">›</span></div>' +
          (canOp ? '<div class="h5-apa od-apa">' +
            '<a data-mat="' + a.id + '">' +
            (a.supp_open ? '去补料' : a.mat_wait ? '补充资料' : '我的材料') + '</a>' +
            '<a data-tr="' + a.id + '">办理进度</a>' +
            '<a data-fm="' + a.id + '">填申请表</a>' +
            ((a.result || a.progress === 'P6') ? '<a data-rs="1">结果与签收</a>' : '') +
            '</div>' : '') +
          '</div>';
      }).join('') + '</div>' +

      '<div class="h5-sec">' + odSecH('联系人与收货') +
      odRow('订单联系人', esc(d.contact.name || '') + '　' + esc(d.contact.phone || '')) +
      odRow('邮箱', esc(d.contact.email || '未填写'), { mut: !d.contact.email }) +
      (d.recv_addr
        ? odRow('护照寄回', esc(d.recv_addr.contact + '　' + d.recv_addr.region + ' ' + d.recv_addr.detail))
        : odRow('护照寄回', '还没填收货地址', { k: 'addrs', mut: true })) +
      /* 发票：系统本期只存开票抬头，没有在线申请流程。不做点了没反应的假入口。 */
      odRow('开票抬头', esc(d.invoice.entity || '未指定'), { mut: !d.invoice.entity }) +
      '<div class="h5-tip">发票本期由客服代开，在「联系客服」提供抬头与税号即可。</div></div>' +

      /* 资料录入入口常驻，但在 C 端不是付款的前置条件，也不显示倒计时——
         客人这边以成交为先，资料送签前补齐即可（唐美芳 2026-09-02）。
         「客人签证资料」是销售侧的叫法，客人是在填自己的，这里改回第一人称口吻。 */
      ((d.status === 'created' || d.status === 'paid')
        ? '<div class="h5-sec">' + odSecH('签证资料') +
          odRow(d.info_state === 'done' ? '资料已填写' : '签证资料待填写',
            d.info_state === 'done'
              ? '可在送签前修改'
              : '支付后再填也可以，送签前补齐即可',
            { k: '@ordinfo', mut: d.info_state === 'done' }) +
          '</div>' : '') +

      /* 「填申请表」「办理进度」已经上移到每位办签人自己那一行（按人走才准），
         这里只留下真正<b>整单一件</b>的两项：发票和退款。 */
      (paid ? '<div class="h5-sec">' + odSecH('整单操作') +
        odRow('结果与签收', '出签结果、资料返还与签收确认', { k: '@result', mut: true }) +
        odRow('申请发票', '联系客服代开', { k: 'service', mut: true }) +
        odRow('申请退款', '按办理进度试算可退金额', { k: '@refund', mut: true }) +
        '</div>' : '');

    /* 底栏跟商品页、退款页一致：左边一句当前要紧的事，右边一个主按钮。
       主按钮随状态变——待支付时是去支付，已付款时是去做那件最要紧的事。 */
    var sumTx, cta, ctaK;
    if (d.status === 'created') {
      /* 待付款一律给「立即支付」。原来资料没录齐就把主按钮换成「录入客人签证资料」，
         客人在这一页根本付不了款——C 端要以成交为先，不能卡支付
         （唐美芳 2026-09-02：「怎么卡都不能卡支付流程啊」）。
         资料是次要动作，做成底栏左侧可点的一行，不抢主按钮，也不显示倒计时。 */
      /* 付过定金的单子，底栏要写「还差多少」而不是订单总额——
         客人已经付了 2000，还挂着「待付款 ¥5,996」会以为定金没到账。 */
      var payLb = heroPst === 'part' ? '还差' : '待付款';
      var payAmt = heroPst === 'part' ? (d.owe || 0) : d.amount;
      sumTx = d.info_state === 'done'
        ? '<span class="sum">' + payLb + ' <b>¥' + money(payAmt) + '</b></span>'
        : '<span class="sum" data-k="@ordinfo">' + payLb + ' <b>¥' + money(payAmt) +
          '</b><s>可先填签证资料 ›</s></span>';
      cta = heroPst === 'part' ? '支付尾款' : '立即支付'; ctaK = 'pay';
    } else if (d.status === 'cancelled') {
      sumTx = '<span class="sum">订单已取消</span>';
      cta = '浏览其他产品'; ctaK = 'shop';
    } else if (suppN) {
      sumTx = '<span class="sum od-urge"><b>' + suppN + '</b> 条补料通知待处理</span>';
      cta = '去补料'; ctaK = 'mats';
    } else if (waitN) {
      sumTx = '<span class="sum"><b>' + waitN + '</b> 项材料待提交</span>';
      cta = '补充资料'; ctaK = 'mats';
    } else {
      sumTx = '<span class="sum">材料已齐，办理中</span>';
      cta = '办理进度查询'; ctaK = 'track';
    }
    var foot = sumTx + '<button class="cta">' + esc(cta) + '</button>' +
      (d.status === 'created' ? '<button class="h5-btn grey" data-cc>取消</button>' : '');

    m.innerHTML = pageH('订单详情',
      '客户在这里一次看全：寄材料寄到哪、买的什么、每位办签人办到哪一步、护照办完寄回哪儿。' +
      '<b>补料与进度的固定入口</b>在这——原先只在订单卡片里挂两个小链接，' +
      '待支付订单干脆没有，客户找不到。') +
      h5page('订单详情', body, foot, '这一步在做什么',
        '信息结构照签证 H5 设计图《订单详情》，<b>视觉沿用本小程序现有语言</b>' +
        '（白卡 + 粗体标题 + 行式信息，不用老设计图的竖条标题与双栏窄标签）。' +
        '底栏一个主按钮随状态变：待支付去支付、有补料去补料、材料齐了看进度——' +
        '客户此刻只需要做一件事，四个平级按钮反而让人不知道点哪个。',
        true, '', '', 'cardy hue');

    $('[data-back]', m).onclick = function () { go('orders'); };
    var fold = $('[data-fold]', m);
    if (fold) $('.h5-h', fold).onclick = function () { fold.classList.toggle('open'); };
    var a1 = d.applicants.filter(function (x) { return x.state === 'normal'; })[0] || d.applicants[0];
    var aid = a1 ? a1.id : '';
    var jump = {
      '@track': function () { go('track', aid); },
      '@form': function () { S.cache.cfSec = null; go('form', aid); },
      '@refund': function () { go('refund', d.no); },
      '@result': function () { go('result', d.no); },
      '@ordinfo': function () { go('ordinfo', d.no); }
    };
    $$('[data-k]', m).forEach(function (a) {
      a.onclick = function (e) {
        e.stopPropagation();
        var k = a.dataset.k;
        if (jump[k]) return jump[k]();
        go(k, k === 'mats' ? aid : undefined);
      };
    });
    $$('[data-ap]', m).forEach(function (a) {
      a.onclick = function () { go('mats', a.dataset.ap); };
    });
    /* 每位办签人自己那一排动作。挂在 od-apw 里，点它们不该冒泡到整行的进材料页。 */
    $$('[data-mat]', m).forEach(function (a) {
      a.onclick = function (e) { e.stopPropagation(); go('mats', a.dataset.mat); };
    });
    $$('[data-tr]', m).forEach(function (a) {
      a.onclick = function (e) { e.stopPropagation(); go('track', a.dataset.tr); };
    });
    $$('[data-fm]', m).forEach(function (a) {
      a.onclick = function (e) { e.stopPropagation(); S.cache.cfSec = null; go('form', a.dataset.fm); };
    });
    $$('[data-rs]', m).forEach(function (a) {
      a.onclick = function (e) { e.stopPropagation(); go('result', d.no); };
    });
    $('.cta', m).onclick = function () {
      if (ctaK === 'pay') {
        return api('/order/pay', { no: d.no })
          .then(function (r) { toast(r.msg); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      }
      if (ctaK === 'mats') return go('mats', aid);
      if (ctaK === 'track') return go('track', aid);
      if (ctaK === 'ordinfo') return go('ordinfo', d.no);
      go(ctaK);
    };
    $('[data-cc]', m) && ($('[data-cc]', m).onclick = function () {
      if (!confirm('确定取消该订单？订单一旦支付将无法直接取消，只能提交退款申请。')) return;
      api('/order/cancel', { no: d.no, reason: '客户在小程序主动取消' })
        .then(function (r) { toast(r.msg); go('orders'); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
    });
    h5bind(m);
  });
};
