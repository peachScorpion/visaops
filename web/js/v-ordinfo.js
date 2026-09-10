/* ============================================================
   录入客人签证资料 —— 付款前必经的一步
   唐美芳 2026-09-01：「正常应该是付款之前先录入资料，而且必须设定 1 个时间，
   比如下单后 24 个小时内录入办签人的资料，否则自动取消订单。
   所以录入客人资料这个操作，必须在支付之前。」

   对应她给的 CSP 旅游订单截图上那个「录入客人资料」按钮，签证订单沿用同一位置。
   三端共用一个视图：C 端客户自己录、CSP 与有米由销售代录，字段与校验完全一致。
   ============================================================ */

/* 一位办签人的资料表单。字段口径与后端 INFO_REQUIRED 对齐——
   少一项使领馆就退件，所以这里的必填比下单时那几格严。 */
function oiForm(a, crowds) {
  return [
    { k: 'name_cn', label: '中文姓名', value: a.name_cn || '', required: true,
      hint: '与护照上的中文姓名完全一致' },
    { k: 'name_en', label: '英文姓名', value: a.name_en || '', required: true,
      ph: '与护照机读区一致，如 ZHANG/SIYUAN' },
    { k: 'sex', label: '性别', type: 'select', value: a.sex || '男',
      options: [{ v: '男', t: '男' }, { v: '女', t: '女' }], required: true },
    { k: 'birth', label: '出生日期', type: 'date', value: a.birth || '', required: true },
    { k: 'id_type', label: '证件类型', type: 'select', value: a.id_type || '护照',
      options: [{ v: '护照', t: '护照' }, { v: '港澳通行证', t: '港澳通行证' },
                { v: '台湾通行证', t: '台湾通行证' }] },
    { k: 'id_no', label: '证件号码', value: a.id_no || '', required: true },
    { k: 'id_expiry', label: '证件有效期至', type: 'date', value: a.id_expiry || '',
      required: true, hint: '多数国家要求剩余有效期不少于 6 个月' },
    { k: 'id_place', label: '证件签发地', value: a.id_place || '', required: true, ph: '如：北京' },
    { k: 'nation', label: '国籍', value: a.nation || '中国' },
    { k: 'phone', label: '手机号', value: a.phone || '', required: true },
    { k: 'crowd', label: '适用人群', type: 'select', value: a.crowd || 'job',
      options: (crowds || []).map(function (x) { return { v: x.v, t: x.t }; }),
      required: true, hint: '决定该客户要提交哪些材料' }
  ];
}

/* 三端同一个视图函数，只有外壳不同：C 端与有米是手机壳，CSP 是 PC 页面。 */
function ordInfoView(m, no, shell) {
  if (!no) return go('orders');
  return api('/order/info?no=' + encodeURIComponent(no)).then(function (d) {
    var left = d.applicants.filter(function (a) { return !a.info_done; }).length;
    var stCls = { done: 'ok', wait: 'warn', expired: 'bad' }[d.info_state] || '';
    /* C 端是客人在填自己的资料，销售端是代客录入——同一张表，两套口吻 */
    var isCust = S.role === 'customer';

    /* 顶部状态条同样分端：
       C 端不催、不显示倒计时，只说清楚这些信息干什么用、什么时候要
       （唐美芳 2026-09-02：「C 端不需要体现待录入客人资料还剩多少小时」）；
       销售端保留时限与倒计时，那是他们的跟单抓手。
       两端都去掉「资料录齐前不能收款」——2026-09-02 起收款不再被资料卡住。 */
    var head =
      '<div class="oi-head ' + (isCust && d.info_state === 'wait' ? '' : stCls) + '">' +
      '<div class="l"><b>' + esc(isCust && d.info_state === 'wait'
        ? '签证资料待填写' : d.info_state_text) + '</b>' +
      '<s>' + (d.info_state === 'done'
        ? '资料已于 ' + d16(d.done_at) + ' 填写完成，送签前都可以修改。'
        : d.info_state === 'expired'
          ? (isCust ? '本单已超时未填写，将被系统自动取消。'
                    : '已超过 ' + d.hours + ' 小时时限，订单将被系统自动取消。')
          : isCust
            ? '以下信息为使领馆审核所需，支付前后均可填写，于送签前补齐即可。'
            : '下单后 <b>' + d.hours + ' 小时</b>内未付款且未录齐资料的订单会被系统自动取消；' +
              '资料齐备后工单方可编入送签批次。') + '</s></div>' +
      (d.info_state === 'wait' && !isCust
        ? '<div class="r"><em>' + esc(d.left_text) + '</em><s>截止 ' + d16(d.deadline) + '</s></div>'
        : '') + '</div>';

    var list = d.applicants.map(function (a, i) {
      var miss = a.missing || [];
      return '<div class="oi-card' + (a.info_done ? ' done' : '') + '">' +
        '<div class="hd"><b>' + esc(a.name_cn || ('办签人 ' + (i + 1))) + '</b>' +
        '<span class="tag ' + (a.info_done ? 'ok' : 'warn') + '">' +
        (a.info_done ? (isCust ? '已填写' : '已录入')
                     : (isCust ? '待填写' : '待录入')) + '</span>' +
        '<span class="tag info">' + esc(a.crowd_text || '') + '</span>' +
        '<a class="btn sm r" data-oi="' + a.id + '">' +
        (a.info_done ? '修改资料' : (isCust ? '填写资料' : '录入资料')) + '</a></div>' +
        '<div class="oi-kv">' +
        [['英文姓名', a.name_en], ['性别', a.sex], ['出生日期', a.birth],
         [(a.id_type || '护照') + '号', a.id_no], ['有效期至', a.id_expiry],
         ['签发地', a.id_place], ['国籍', a.nation], ['手机号', a.phone]]
          .map(function (kv) {
            return '<i><s>' + esc(kv[0]) + '</s><b' + (kv[1] ? '' : ' class="ph"') + '>' +
              esc(kv[1] || '未填') + '</b></i>';
          }).join('') + '</div>' +
        (miss.length
          ? '<div class="oi-miss">还差：' + miss.map(esc).join('、') + '</div>' : '') +
        /* 官方申请表（DS-160 这类）跟在同一张卡里：上面是送签要用的基础资料，
           下面是几十格的正式表单。销售可以代填，也可以生成链接发给客人自己填
           （唐美芳 2026-09-01：「在有米小程序的订单详情里也应该有这样 1 个按钮，
           发给客人填写。也可以帮客人填」）。
           但「代填」「发给客人填」都是销售侧视角——C 端本来就是客人在填自己的表，
           发给谁？所以客户端只留一个「去填写」（唐美芳 2026-09-02：
           「补录资料和发给客人是销售侧视角，不是 C 端视角」）。 */
        (a.form
          ? '<div class="oi-form"><div class="l"><b>官方申请表' +
            (a.form.status ? '<span class="tag ' +
              ({ wait: 'warn', filling: 'info', submitted: 'info',
                 confirmed: 'ok', official: 'ok' }[a.form.status] || 'plain') + '">' +
              esc(a.form.status_text) + '</span>' : '') + '</b>' +
            /* 进度按「该客人/销售填的那些格」算，跟填表页同一个口径。
               原来显示整表 filled/fillable（44/68），剩下的 24 格其实是证件识别与
               系统带出没带全的，不归客人填——销售看到 44/68 会以为表没填完
               （唐美芳 2026-09-02：「都保存提交完了，但是再次进入录入资料还是未填状态」）。 */
            '<s>' + (a.form.ask_left
              ? '还有 <b>' + a.form.ask_left + '</b> 道客户必答题'
              : '客户必答已答完') +
            '　·　整表已带出 ' + a.form.filled + '/' + a.form.fillable + ' 格' +
            (a.form.shared ? '　·　分享链接生效中' : '') + '</s></div>' +
            '<div class="r">' +
            (isCust
              ? '<button class="btn sm p" data-fmfill="' + a.id + '">去填写</button>'
              : '<button class="btn sm" data-fmfill="' + a.id + '">代填</button>' +
                '<button class="btn sm p" data-fmshare="' + a.id + '">发送至客户填写</button>') +
            '</div></div>'
          : (a.form_note
            ? '<div class="oi-form none">' + esc(a.form_note) + '</div>' : '')) +
        '</div>';
    }).join('');

    /* 收货地址跟资料录入放同一页：两件事都是送签前要补齐的，分两处客人会漏
       （唐美芳 2026-09-01：「填写订单的收货人地址信息，是不是可以和录入资料放到一起呢」）。 */
    var ra = d.recv_addr;
    var addrBlock =
      '<div class="oi-addr' + (ra ? '' : ' none') + '">' +
      '<div class="hd"><b>收货地址</b>' +
      '<span class="tag ' + (ra ? 'ok' : 'warn') + '">' + (ra ? '已填写' : '待填写') + '</span>' +
      '<a class="btn sm' + (ra ? '' : ' r') + '" data-oi-addr>' +
      (ra ? '修改' : '填写收货地址') + '</a></div>' +
      (ra
        ? '<div class="oi-kv">' +
          [['收货人', ra.contact], ['联系电话', ra.phone],
           ['所在地区', ra.region], ['详细地址', ra.detail]].map(function (kv) {
            return '<i><s>' + esc(kv[0]) + '</s><b>' + esc(kv[1] || '—') + '</b></i>';
          }).join('') + '</div>'
        : '<div class="oi-miss">签证办完要把护照原件寄回，送签前需要填写收货地址。</div>') +
      '</div>';

    var body = head + '<div class="oi-list">' + list + '</div>' + addrBlock +
      '<div class="oi-tip">这些信息将用于向使领馆递交签证申请，' +
      '姓名拼音、证件号码、有效期任何一位与护照不符都会被退件，退件后需要重新排队送签。</div>';

    /* 标题与说明按端分开写。同一张表，C 端是客人填自己的，销售端是代客录入，
       口吻不能混（唐美芳 2026-09-02）。另外「资料录齐前收款会被拦截」这句
       2026-09-02 起已不成立——收款不再被资料卡住，三端说明一并改掉。 */
    var oiTitle = isCust ? '填写签证资料' : '录入客户签证资料';
    if (shell === 'phone') {
      m.innerHTML = pageH(oiTitle,
        isCust
          ? '送签要用的信息，支付前后填都可以。<b>姓名拼音、证件号、有效期必须与护照完全一致</b>——' +
            '其中一位不符即会被使领馆退件，退件后要重新排队。'
          : '下单时只收了姓名与证件号，这里补齐送签真正要用的完整信息。' +
            '<b>未付款的单，下单后 ' + d.hours + ' 小时内录不齐会被系统自动取消</b>。') +
        (S.role === 'youmi'
          ? ymPage(oiTitle, body, '', '这一步在做什么',
            '下单时只收了姓名与证件号，这里补齐送签真正要用的完整信息。' +
            '资料齐备后工单方可编入送签批次，收款不受影响。', true, '', '', 'ym')
          : h5page(oiTitle, body, '', '这一步在做什么',
            '下单时只填了姓名与证件号，这一步补齐送签要用的完整信息。' +
            '亦可先行支付，于送签前补齐即可。', true, null));
    } else {
      m.innerHTML = pageH(oiTitle,
        '下单时只收了姓名与证件号，这里补齐送签真正要用的完整信息。' +
        '<b>未付款的单，下单后 ' + d.hours + ' 小时内录不齐会被系统自动取消</b>；' +
        '资料齐备后工单方可编入送签批次。',
        '<button class="btn" data-back>返回订单列表</button>') +
        '<div class="card"><div class="pad">' + body + '</div></div>';
    }

    var back = $('[data-back]', m);
    if (back) back.onclick = function () { go('orders'); };

    $$('[data-oi]', m).forEach(function (b) {
      b.onclick = function () {
        var a = d.applicants.filter(function (x) { return x.id === +b.dataset.oi; })[0];
        ask('录入签证资料 · ' + (a.name_cn || ''), oiForm(a, d.crowds), '保存',
          function (f) {
            return api('/order/info/save', Object.assign({ no: no, applicant_id: a.id }, f));
          }).then(function (r) { toast(r.msg || '已保存'); reload(); }).catch(function () { });
      };
    });
    /* 代填：进系统内的填表页；销售端与客户端进的是同一张表 */
    $$('[data-fmfill]', m).forEach(function (b) {
      b.onclick = function () {
        S.cache.cfSec = null;
        go(S.role === 'customer' ? 'form' : 'formfill', b.dataset.fmfill);
      };
    });
    /* 发给客人填：统一走 core.js 的 shareTask()（2026-09-08 批 1，
       原来这段生成链接的代码在四个页面各写了一遍，措辞四个版本）。 */
    $$('[data-fmshare]', m).forEach(function (b) {
      b.onclick = function () {
        var a = d.applicants.filter(function (x) { return x.id === +b.dataset.fmshare; })[0] || {};
        shareTask(a.id, a.name_cn);
      };
    });
    var ab = $('[data-oi-addr]', m);
    if (ab) ab.onclick = function () {
      var r = d.recv_addr || {};
      ask('收货地址 · 护照原件寄回', [
        { k: 'contact', label: '收货人', value: r.contact || '', required: true },
        { k: 'phone', label: '联系电话', value: r.phone || '', required: true },
        { k: 'region', label: '所在地区', value: r.region || '', required: true,
          ph: '如：北京市朝阳区' },
        { k: 'detail', label: '详细地址', value: r.detail || '', required: true,
          ph: '街道、门牌号、楼层房间号' }
      ], '保存', function (f) {
        return api('/order/recv_addr', Object.assign({ no: no, addr_id: r.id || 0 }, f));
      }).then(function (rr) { toast(rr.msg || '已保存'); reload(); }).catch(function () { });
    };
    if (shell === 'phone' && S.role === 'youmi') ymBind(m, 'orders');
    else if (shell === 'phone') h5bind(m);
  });
}

VIEWS['customer:ordinfo'] = function (m, no) { return ordInfoView(m, no, 'phone'); };
VIEWS['youmi:ordinfo'] = function (m, no) { return ordInfoView(m, no, 'phone'); };
VIEWS['csp:ordinfo'] = function (m, no) { return ordInfoView(m, no, 'pc'); };


/* 本期只保留入口、不做真实功能的那几个操作（唐美芳 2026-09-01：
   「其他操作按钮暂不需要做真实功能」）。做成灰按钮 + 一句说明，
   而不是点了没反应，也不是弹一个假成功。 */
var OI_SOON = {
  '开票': '订单开票在众信财务系统中完成，签证订单沿用同一套发票流程与抬头档案。',
  '调整合同价': '调整客户实际成交价。签证订单的成交价受结算价与建议零售价护栏约束，' +
    '调价需重新计算毛利并留痕。',
  '调整结算价': '调整与供应商的结算价。签证订单结算价由供应商报价决定，' +
    '单笔调整需走采购审批。',
  '调整合同价/结算价': '同时调整成交价与结算价，用于整单重新议价的场景。',
  '签订合同': '生成并签署旅游/签证服务合同。签证订单沿用众信电子合同模板与签署通道。'
};
function oiSoon(name) {
  return '<button class="btn sm ghost" data-oisoon="' + esc(name) + '">' + esc(name) + '</button>';
}
function oiSoonBind(m) {
  $$('[data-oisoon]', m).forEach(function (b) {
    b.onclick = function () {
      var k = b.dataset.oisoon;
      confirmBox(k, (OI_SOON[k] || '') +
        '<br><br><b>本期范围</b>：该操作的入口按签证订单的作业顺序保留，' +
        '功能将在后续版本中实现，本期不做处理。', '知道了').catch(function () { });
    };
  });
}
