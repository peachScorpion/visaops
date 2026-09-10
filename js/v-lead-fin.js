/* C4 签证主管 / C5 财务 */

/* ---------- 主管：工单负载 ---------- */
/* 「工单负载」2026-08-31 已并入工单台（顶部专员负载条 + 行内改派）。
   老链接与书签还会打到这里，直接转过去，不留一个说「已迁移」的空壳页。 */
VIEWS['lead:load'] = VIEWS['ops:load'] = function () { go('board'); };

/* ---------- 主管：挂起池（兼工单详情入口） ---------- */
/* 「挂起池」已撤：工单台查询卡的「异常标记 › 已挂起」就是同一批数据。
   带工单号进来时仍走工单详情，那是主管从别处点进来的深链。 */
VIEWS['lead:hold'] = VIEWS['ops:hold'] = function (m, no) {
  if (no) return woDetail(m, no);
  S.cache['q:woboard'] = { flag: 'hold' };
  sessionStorage.setItem('wo_scope', 'all');
  go('board');
};

/* ---------- 主管：退款审批 ---------- */
VIEWS['lead:approve'] = function (m) {
  return api('/refund/list').then(function (j) {
    m.innerHTML = pageH('退款审批', '系统按规则引擎给出试算金额，主管可调整并写明责任归属；批准后由财务出账，主管无出账权限。') +
      (function () {
        var q = srchCard('leadrf', [
          {
            k: 'kw', t: '退款单号 / 订单号 / 办签人', ph: '支持模糊查询',
            get: function (r) { return r.no + ' ' + r.ord_no + ' ' + (r.names || ''); }
          },
          { k: 'reason_cate', t: '退款原因', type: 'sel', opts: uniqOpts(j.list, function (r) { return r.reason_cate; }) },
          { k: 'liability_text', t: '责任归属', type: 'sel', opts: uniqOpts(j.list, function (r) { return r.liability_text; }) }
        ]);
        var t = subTabs('leadrf', [
          { k: 'all', t: '全部', fn: function () { return true; } },
          { k: 'applying', t: '待我审批', fn: function (r) { return r.status === 'applying'; } },
          { k: 'l1', t: '待财务出账', fn: function (r) { return r.status === 'l1'; } },
          { k: 'done', t: '已完成', fn: function (r) { return r.status === 'done'; } },
          { k: 'reject', t: '已驳回', fn: function (r) { return r.status === 'reject'; } }
        ], q.filter(j.list), 'applying');   /* 默认停在待我审批 */
        var so = sorter('leadrf', [
          ['试算金额', function (r) { return r.amount || 0; }]
        ].concat(AUD_SORTS));
        S.cache._leadrf = t;
        S.cache._leadrfq = q;
        S.cache._leadrfs = so;
        S.cache._leadrfp = pager('leadrf', so.sort(t.rows), 10);
        return q.html + '<div class="card"><h3>退款审批</h3>' + t.html;
      })() + '<div class="pad">' + table(
        S.cache._leadrfs.cols(['退款单号', '订单号', '办签人', '退款原因', '试算金额', '责任归属', '状态'].concat(AUD_COLS, ['操作'])),
        S.cache._leadrfp.rows, function (r) {
          var st = { applying: ['warn', '待我审批'], l1: ['info', '待财务出账'], done: ['ok', '已完成'], reject: ['bad', '已驳回'] }[r.status] || ['plain', r.status];
          return '<td class="mono">' + esc(r.no) + '</td><td class="mono">' + esc(r.ord_no) + '</td><td>' + esc(r.names) +
            '</td><td>' + esc(r.reason_cate || '') + '<div class="hint">' + esc(r.reason || '') + '</div></td>' +
            '<td class="num"><b>¥' + money(r.amount) + '</b></td><td>' + esc(r.liability_text || '-') +
            '</td><td><span class="tag ' + st[0] + '">' + st[1] + '</span></td>' +
            audTd(r) + '<td>' +
            '<div class="btns"><button class="btn sm g" data-rfd="' + esc(r.no) + '">详情</button>' +
            (r.status === 'applying' ? '<button class="btn sm ok" data-ok="' + esc(r.no) +
              '" data-amt="' + r.amount + '">批准</button><button class="btn sm bad" data-no="' + esc(r.no) + '">驳回</button>' : '') +
            '</div></td>';
        }, '没有符合条件的退款单') + '</div>' + S.cache._leadrfp.html + '</div>';
    S.cache._leadrfq.bind(m, function () { S.cache['pg:leadrf'] = 1; reload(); });
    S.cache._leadrf.bind(m, function () { S.cache['pg:leadrf'] = 1; reload(); });
    S.cache._leadrfs.bind(m, function () { S.cache['pg:leadrf'] = 1; reload(); });
    S.cache._leadrfp.bind(m, reload);
    $$('[data-rfd]', m).forEach(function (b) {
      b.onclick = function () { go('refunddetail', b.dataset.rfd); };
    });
    $$('[data-ok]', m).forEach(function (b) {
      b.onclick = function () {
        ask('批准退款 ' + b.dataset.ok, [
          { k: 'amount', label: '实际退款金额（元）', required: true, value: b.dataset.amt, hint: '默认取规则引擎试算值，可调整' },
          { k: 'liability', label: '责任归属', type: 'select', options: [{ v: 'none', t: '未判定' }, { v: 'company', t: '我司责任' }, { v: 'customer', t: '客户责任' }, { v: 'official', t: '使领馆/第三方' }] },
          { k: 'note', label: '审批意见', type: 'textarea' }
        ], '批准', function (f) {
          return api('/refund/approve', { no: b.dataset.ok, action: 'ok', amount: f.amount, liability: f.liability, note: f.note });
        }).then(function () { toast('已批准，转财务出账'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    $$('[data-no]', m).forEach(function (b) {
      b.onclick = function () {
        ask('驳回退款 ' + b.dataset.no, [{ k: 'note', label: '驳回理由', type: 'textarea', required: true }], '驳回')
          .then(function (f) { return api('/refund/approve', { no: b.dataset.no, action: 'reject', note: f.note }); })
          .then(function () { toast('已驳回'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
  });
};

/* ---------- 主管：拒签归因 ---------- */
VIEWS['lead:reject'] = function (m) {
  return api('/lead/board').then(function (b) {
    var total = Object.keys(b.reject_cate).reduce(function (a, k) { return a + b.reject_cate[k]; }, 0);
    m.innerHTML = pageH('拒签归因复盘', '每一笔拒签都必须归因入库。归因不是为了追责，而是反向修正材料清单与产品准入口径——这是签证业务唯一能积累的资产。') +
      '<div class="grid" style="margin-bottom:16px">' +
      '<div class="stat"><b>' + (b.pass_rate == null ? '—' : b.pass_rate + '%') + '</b><span>整体出签率</span></div>' +
      '<div class="stat hot"><b>' + total + '</b><span>累计拒签</span></div></div>' +
      card('拒签原因分布', '<div class="pad">' + (total ? Object.keys(b.reject_cate).map(function (k) {
        var n = b.reject_cate[k], pct = Math.round(n * 100 / total);
        return '<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13px">' +
          '<b>' + esc(k) + '</b><span>' + n + ' 例 · ' + pct + '%</span></div>' +
          '<div style="height:8px;background:#F1F3F7;border-radius:4px;margin-top:5px;overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;background:#C8102E"></div></div></div>';
      }).join('') : '<div class="empty">暂无拒签记录</div>') + '</div>');
  });
};

/* ---------- 订单总览（UOM 运营 / 主管 / 财务共用） ----------
   信息按「使用者关心什么」分区：左边看这笔是谁的什么单，右边三段钱各管一件事——
   应收（该收多少）、实收（收到没有、还欠多少）、结算（该付供应商多少、付了没有），
   最后单列毛利。管理视角一律脱敏。 */
function ordChan(ch) { return ({ C: '直客', CSP: '门店', B: '同业' }[ch] || ch); }

VIEWS['lead:orders'] = VIEWS['ops:orders'] = VIEWS['fin:orders'] = function (m) {
  return api('/ops/orders').then(function (j) {
    /* 筛选区按众信「酒店订单」的结构重做（唐美芳 2026-09-08 给了截图：
       「uom 订单列表，请按现有 uom 酒店订单结构来，字段基本要一致，
         特殊签证订单的字段灵活替换」）。逐格对位，签证没有的字段换成等价的：
         入住日期 → 预计出行日期；离店日期 → 签证没有「离店」，撤掉；
         旅游类型 → 签证类型；入住人 → 办签人；酒店编号/名称 → 产品编码/名称；
         目的城市 → 目的地国家 + 送签地（领区决定材料与预约规则，只给国家筛不出那批单）；
         活动来源 → 系统没有活动体系，撤掉，不摆空控件；
         仅查看未入住 → 仅看办签未完成。 */
    var sel = function (a) { return (a || []).map(function (v) { return [v, v]; }); };
    var q = filtPanel('opsord', [
      { k: 'no', t: '订单编号 / 产品编码 / 产品名称', ph: '支持模糊查询',
        get: function (o) { return o.no + ' ' + (o.code || '') + ' ' + o.product; } },
      { k: 'depart', t: '预计出行日期', type: 'dr',
        get: function (o) { return o.depart_date; } },
      { k: 'created', t: '下单日期', type: 'dr',
        get: function (o) { return o.created_at; } },
      { k: 'visa_cat', t: '签证类型', type: 'sel', opts: sel(j.visa_cats) },
      { k: 'channel', t: '业务来源', type: 'sel',
        opts: [['C', '直客（C 端小程序）'], ['CSP', '门店（CSP）'], ['B', '同业（B 端）']] },
      { k: 'status', t: '订单状态', type: 'sel',
        opts: [['created', '待付款'], ['paid', '已付款'], ['done', '已完成'],
               ['refunded', '已退款'], ['cancelled', '已取消']] },
      { k: 'ap_names', t: '办签人', ph: '输入办签人姓名' },
      { k: 'sale_name', t: '销售人员', ph: '输入销售人员姓名' },
      { k: 'supplier', t: '供应商', ph: '输入供应商名称' },
      { k: 'org', t: '销售公司 / 企业客户', ph: '输入机构名称' },
      { k: 'contract_status', t: '订单合同状态', type: 'sel',
        opts: [['未签约', '未签约'], ['已签约', '已签约']] },
      { k: 'country', t: '目的地国家', type: 'sel', opts: sel(j.countries) },
      { k: 'submit_city', t: '送签地', type: 'sel', opts: sel(j.cities) },
      { k: 'contact', t: '联系人', ph: '输入联系人姓名或手机号',
        get: function (o) { return (o.contact || '') + ' ' + (o.phone || ''); } },
      { k: 'pay_state', t: '支付状态', type: 'sel',
        opts: [['unpaid', '待支付'], ['part', '部分支付'], ['paid', '已支付']],
        get: function (o) { return o.pay_state || 'unpaid'; } },
      {
        /* 众信那张叫「是否异常订单」，签证这边的异常都是钱上的，沿用原有口径 */
        k: 'money', t: '是否异常订单', type: 'sel',
        opts: [['gate0', '待财务确认到账'], ['owe', '存在欠款'],
               ['pay', '待付供应商款'], ['none', '无异常']],
        get: function (o) {
          if (!o.gate && o.status !== 'cancelled') return 'gate0';
          if (o.owe > 0 && o.status !== 'cancelled') return 'owe';
          if (o.payable_open > 0) return 'pay';
          return 'none';
        }
      },
      { k: 'work', t: '办理状态', type: 'sel', opts: WORK_ST,
        get: function (o) { return o.work_status || '未完成'; } },
      { k: 'nosend', type: 'ck', t: '仅看办签未完成',
        fn: function (o) { return (o.work_status || '未完成') !== '已完成'; } }
    ]);
    var hit = q.filter(j.list);

    /* 页签 = 订单状态，就这 5 个值（唐美芳 2026-08-31：
       「之前不是说就5个么，你怎么还是把订单状态与签证办理状态混在一起了」）。
       我上一版把「待放行」「办理中」也做成了页签，还在注释里替自己辩解说
       「做成页签比塞进订单状态清楚」——错在这两个根本不是订单状态，
       跟订单状态并排放就是混线：一张单可以既「已付款」又「待放行」又「办理中」，
       三个页签都能查到它，每个都不全。而且「退款/取消」把两个状态并成一格，
       连 5 个都数不齐。资金闸门在「资金异常」筛选里，办理状态见旁边的新筛选项。 */
    var t = subTabs('opsord', [
      { k: 'all', t: '全部', fn: function () { return true; } },
      { k: 'created', t: '待付款', fn: function (o) { return o.status === 'created'; } },
      { k: 'paid', t: '已付款', fn: function (o) { return o.status === 'paid'; } },
      { k: 'done', t: '已完成', fn: function (o) { return o.status === 'done'; } },
      { k: 'refunded', t: '已退款', fn: function (o) { return o.status === 'refunded'; } },
      { k: 'cancelled', t: '已取消', fn: function (o) { return o.status === 'cancelled'; } }
    ], hit);
    /* 金额、毛利、下单时间是数据列，给表头排序：财务要「按欠款从大到小催」。 */
    var so = sorter('opsord', [
      ['应收', function (o) { return o.amount || 0; }],
      ['实收与欠款', function (o) { return o.owe || 0; }],
      ['结算（成本）', function (o) { return o.payable_open || 0; }],
      ['毛利', function (o) { return o.gross || 0; }]
    ]);
    /* 众信那张表在汇总条上方另有一排「下单日期(由近到远) | (由远到近) |
       入住日期(由近到远) | (由远到近)」的快捷排序 + 右侧「导出报表」。
       签证没有入住日期，换成预计出行日期（唐美芳 2026-09-08）。 */
    var QS = [
      ['cd', '下单日期（由近到远）', function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }],
      ['ca', '下单日期（由远到近）', function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); }],
      ['dd', '出行日期（由近到远）', function (a, b) { return String(a.depart_date || '9999').localeCompare(String(b.depart_date || '9999')); }],
      ['da', '出行日期（由远到近）', function (a, b) { return String(b.depart_date || '').localeCompare(String(a.depart_date || '')); }]
    ];
    var qsk = S.cache.opsordQS || 'cd';
    var qsRows = t.rows.slice().sort((QS.filter(function (x) { return x[0] === qsk; })[0] || QS[0])[2]);
    var qsBar = '<div class="ol-qs"><div class="l">' + QS.map(function (x) {
      return '<a data-qs="' + x[0] + '"' + (x[0] === qsk ? ' class="on"' : '') + '>' +
        esc(x[1]) + '</a>';
    }).join('') + '</div><button class="btn sm" data-export>导出报表</button></div>';

    var pg = pager('opsord', so.sort(qsRows), 8);

    var sum = function (k) {
      return t.rows.reduce(function (a, o) { return a + (o[k] || 0); }, 0);
    };
    var rate = function (o) {
      return o.amount ? Math.round(o.gross * 1000 / o.amount) / 10 : 0;
    };

    m.innerHTML = pageH(menuName('orders', '订单总览'),
      '结构对齐众信订单：订单与销售信息通栏一行，下面分产品 / 日期 / 人数 / 客户 / 订单金额 / ' +
      '结算金额 / 订单状态七段。客户姓名、手机号、机构名称一律脱敏。') +
      /* 操作说明 2026-09-03 撤掉（唐美芳：「后台的操作说明，不用每个页面都展示，
         比如订单管理、客户管理，我感觉就不需要」）。订单列表和客户档案是天天要用的
         日常作业页，说明块占掉小半屏还得每次收起。配置类页面（材料库、表模板、
         国家配置）的说明保留——那些是偶尔进一次、口径又容易记混的。 */
      q.html +
      '<div class="card">' + t.html + qsBar + olSum(t.rows) + olBatch(j.list) +
      '<div class="pad scrollx">' +
      olTable(pg.rows, {
        view: 'uom',
        actions: function (o) {
          return '<div class="btns">' +
            '<span class="hint" style="margin-right:auto">建单 ' + esc(o.created_by_name || '—') +
            (o.updated_by_name ? ' · 最近 ' + esc(o.updated_by_name) + ' ' + d16(o.updated_at) : '') + '</span>' +
            /* 「金额明细」2026-08-31 去掉：订单详情的「交易信息」页签已经把
               销售金额 / 结算金额 / 收款单据 / 审批信息全铺开了，弹窗是第二个入口，重复。 */
            '<button class="btn sm p" data-odt3="' + esc(o.no) + '">查看详情</button></div>';
        }
      }) + '</div>' + pg.html + '</div>';

    /* 勾选 → 批量条（唐美芳 2026-09-08：「签证订单勾选后，可以开发票，
       把开发票的按钮展示出来就可以」）。 */
    olSelBind(m, reload);
    $('[data-olclr]', m) && ($('[data-olclr]', m).onclick = function () {
      S.cache.olSel = []; reload();
    });
    $('[data-olinv]', m) && ($('[data-olinv]', m).onclick = function () {
      var sel = olSel();
      var hit = j.list.filter(function (o) { return sel.indexOf(o.no) >= 0; });
      /* 开票动作在众信财务系统里完成，本系统只登记抬头，不做开票
         （这条口径 v-orddetail / v-ordinfo / C 端都写着，不能在这儿开第二个版本）。
         所以这颗按钮做的是「整理开票清单」：按抬头分组、算可开票金额、可导出交财务。
         不做点了没反应的假入口，也不假装能开票。 */
      var byEnt = {};
      hit.forEach(function (o) {
        var k = o.invoice_entity || '未登记抬头';
        (byEnt[k] || (byEnt[k] = [])).push(o);
      });
      var ents = Object.keys(byEnt);
      var noRecv = hit.filter(function (o) { return !(o.recv > 0); });
      var box = modal('开发票 · 已选 ' + hit.length + ' 单',
        '<div class="pad">' +
        '<div class="note">开票动作在<b>众信财务系统</b>中完成，本系统登记抬头并整理开票清单。' +
        '开票金额按<b>已收金额</b>计，未收款的订单不计入。</div>' +
        (noRecv.length
          ? '<div class="note w">其中 <b>' + noRecv.length + '</b> 单尚未收款，' +
            '不计入本次开票金额：' + esc(noRecv.map(function (o) { return o.no; }).join('、')) +
            '</div>' : '') +
        ents.map(function (k) {
          var list = byEnt[k];
          var amt = list.reduce(function (a, o) { return a + (o.recv || 0); }, 0);
          return '<div class="kv2"><i>' + esc(k) + '</i><b>' + list.length + ' 单 · 可开票 ¥' +
            money(amt) + '<div class="hint mono">' +
            esc(list.map(function (o) { return o.no; }).join('、')) + '</div></b></div>';
        }).join('') +
        (ents.length > 1
          ? '<div class="hint" style="margin-top:8px">存在 <b>' + ents.length +
            '</b> 个开票抬头，需分别开具，不能合并为一张发票。</div>' : '') +
        '</div>',
        [{ t: '关闭' },
         { t: '导出开票清单', cls: 'p', fn: function () {
           csvDown('开票清单_' + today10() + '.csv',
             ['开票抬头', '订单编号', '产品', '联系人', '合同金额', '已收金额', '订单状态'],
             hit.map(function (o) {
               return [o.invoice_entity || '未登记抬头', o.no, o.product, o.contact,
                       o.amount, o.recv, o.status_text];
             }));
           toast('已导出 ' + hit.length + ' 单的开票清单');
           return false;
         } }]);
      return box;
    });
    $$('[data-qs]', m).forEach(function (a) {
      a.onclick = function () { S.cache.opsordQS = a.dataset.qs; S.cache['pg:opsord'] = 1; reload(); };
    });
    /* 导出报表：直接把当前筛选结果导成 CSV，不另起接口——列表上有什么就导什么，
       导出的口径与屏幕上看到的一致，对不上账时好核。 */
    $('[data-export]', m).onclick = function () {
      var head = ['订单编号', '下单时间', '业务来源', '销售人员', '产品', '套餐', '供应商',
                  '目的地', '送签地', '签证类型', '预计出行日期', '人数', '办签人',
                  '联系人', '联系电话', '合同金额', '实收', '欠款', '结算金额', '毛利',
                  '订单状态', '支付状态', '办理状态'];
      var body = t.rows.map(function (o) {
        return [o.no, o.created_at, ordChan(o.channel), o.sale_name, o.product, o.pkg,
                o.supplier, o.country, o.submit_city, o.visa_cat, o.depart_date || '',
                o.pax, o.ap_names, o.contact, o.phone, o.amount, o.recv, o.owe,
                o.settle_amount, o.gross, o.status_text, o.pay_state_text, o.work_status];
      });
      csvDown('签证订单_' + today10() + '.csv', head, body);
      toast('已导出 ' + t.rows.length + ' 条订单');
    };
    q.bind(m, function () { S.cache['pg:opsord'] = 1; reload(); });
    t.bind(m, function () { S.cache['pg:opsord'] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:opsord'] = 1; reload(); });
    pg.bind(m, reload);

    /* 点产品名 → 运营侧产品详情（唐美芳 2026-09-08） */
    $$('[data-olpd]', m).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        /* 记下来源，产品详情的返回按钮才知道该回订单列表 */
        S.cache.upBack = 'orders'; S.cache.upTab = 'info';
        go('prod', b.dataset.olpd);
      };
    });
    $$('[data-odt3],[data-oldet]', m).forEach(function (b) {
      b.onclick = function () { go('odetail', b.dataset.odt3 || b.dataset.oldet); };
    });
  });
};

/* ---------- 财务：应付挂账 ---------- */
VIEWS['fin:payable'] = VIEWS['ops:payable'] = VIEWS['lead:payable'] = function (m) {
  return api('/fin/payables').then(function (j) {
    var open = j.list.filter(function (x) { return x.status === 'open'; });
    m.innerHTML = pageH('供应商结算', '财务确认收款到账时即按结算价对供应商挂账，之后按月付给供应商，与客户收款分离记账。') +
      '<div class="grid" style="margin-bottom:16px">' +
      '<div class="stat hot"><b>¥' + money(open.reduce(function (a, b) { return a + b.amount; }, 0)) + '</b><span>待付供应商</span></div>' +
      '<div class="stat"><b>' + open.length + '</b><span>待付笔数</span></div>' +
      '<div class="stat"><b>' + j.list.length + '</b><span>累计挂账</span></div></div>' +
      (function () {
        var q = srchCard('finpay', [
          { k: 'ord_no', t: '订单号', ph: '支持模糊查询' },
          { k: 'sup', t: '供应商', type: 'sel', opts: uniqOpts(j.list, function (r) { return r.sup; }) }
        ]);
        var t = subTabs('finpay', [
          { k: 'all', t: '全部', fn: function () { return true; } },
          { k: 'open', t: '待付', fn: function (r) { return r.status !== 'paid'; } },
          { k: 'paid', t: '已付', fn: function (r) { return r.status === 'paid'; } }
        ], q.filter(j.list), 'open');       /* 默认停在待付 */
        var so = sorter('finpay', [
          ['结算金额', function (r) { return r.amount || 0; }],
          ['挂账时间', function (r) { return r.created_at || ''; }]
        ].concat(AUD_SORTS));
        S.cache._finpay = t;
        S.cache._finpayq = q;
        S.cache._finpays = so;
        S.cache._finpayp = pager('finpay', so.sort(t.rows), 10);
        return q.html + '<div class="card"><h3>挂账明细</h3>' + t.html;
      })() + '<div class="pad">' + table(
        S.cache._finpays.cols(['订单号', '供应商', '结算金额', '挂账时间', '状态'].concat(AUD_COLS, ['操作'])),
        S.cache._finpayp.rows, function (r) {
          return '<td class="mono">' + esc(r.ord_no) + '</td><td>' + esc(r.sup || '') + '</td><td class="num">¥' +
            money(r.amount) + '</td><td class="mono">' + d16(r.created_at) + '</td><td>' +
            (r.status === 'paid' ? '<span class="tag ok">已付 ' + d10(r.paid_at) + '</span>' : '<span class="tag warn">待付</span>') +
            '</td>' + audTd(r) +
            '<td>' + (r.status === 'open' ? '<button class="btn sm p" data-p="' + r.id + '">确认付款</button>' : '') + '</td>';
        }, '没有符合条件的挂账') + '</div>' + S.cache._finpayp.html + '</div>';
    S.cache._finpayq.bind(m, function () { S.cache['pg:finpay'] = 1; reload(); });
    S.cache._finpay.bind(m, function () { S.cache['pg:finpay'] = 1; reload(); });
    S.cache._finpays.bind(m, function () { S.cache['pg:finpay'] = 1; reload(); });
    S.cache._finpayp.bind(m, reload);
    $$('[data-p]', m).forEach(function (b) {
      b.onclick = function () {
        api('/fin/pay', { id: +b.dataset.p }).then(function () { toast('已确认付款'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
  });
};

/* ---------- 财务：退款出账 ---------- */
/* 退款管理 · 字段对齐众信「财务管理 › 业务资金管理 › 退款管理」。
   原收款单与两个第三方流水号（收款侧 / 退款侧）是原路退回的追溯依据，单独占一列。
   UOM 财务可出账，CSP 只读。 */
VIEWS['fin:refund'] = VIEWS['csp:refund'] = VIEWS['ops:refund'] = VIEWS['lead:refund'] = function (m) {
  return api('/refund/list').then(function (j) {
    var ro = !!j.readonly;
    var nw = !!j.narrow;
    var key = nw ? 'csprf' : 'finrf';
    var q = srchCard(key, [
      {
        k: 'kw', t: '退款单号 / 订单编号 / 办签人', ph: '支持模糊查询',
        get: function (r) { return r.no + ' ' + r.ord_no + ' ' + (r.names || ''); }
      },
      { k: 'reason_cate', t: '退款类别', type: 'sel', opts: uniqOpts(j.list, function (r) { return r.reason_cate; }) },
      { k: 'method', t: '退款方式', type: 'sel', opts: uniqOpts(j.list, function (r) { return r.method; }) },
      { k: 'cust_type', t: '客户类型', type: 'sel', opts: uniqOpts(j.list, function (r) { return r.cust_type; }) },
      { k: 'liability_text', t: '责任归属', type: 'sel', opts: uniqOpts(j.list, function (r) { return r.liability_text; }) }
    ]);
    var defs = [
      { k: 'all', t: '全部', fn: function () { return true; } },
      { k: 'applying', t: '待审核', fn: function (r) { return r.status === 'applying'; } },
      { k: 'l1', t: ro ? '主管已审批' : '待我出账', fn: function (r) { return r.status === 'l1'; } },
      { k: 'done', t: '已出账', fn: function (r) { return r.status === 'done'; } },
      { k: 'reject', t: '已驳回', fn: function (r) { return r.status === 'reject'; } },
      /* 凯撒 PRD 4.13.2「待退款订单」是订单视角：一张单退了几个人、合计多少。
         上面五个页签是单据视角，一张单退三人就是三行，看不出整单退了多少。 */
      { k: 'byord', t: '按订单汇总', fn: function () { return true; } }
    ];
    var t = subTabs(key, defs, q.filter(j.list));
    var byOrd = t.cur === 'byord';
    var so = sorter(key, [['退款金额', function (r) { return r.amount || 0; }],
                          ['制单日期', function (r) { return r.created_at || ''; }]]);
    var pg = pager(key, so.sort(t.rows), 10);

    var cols = ['退款单号 / 订单编号', '原收款单 / 流水号', '退款类别 / 渠道 / 方式', '客户类型'];
    if (!nw) cols.push('销售公司 / 渠道名称');
    cols = cols.concat(['销售 / 制单日期', '办签人', '退款金额', '责任归属',
      '审核状态 / 退款状态', '审核人 / 审核日期', '退款原因', '操作']);

    m.innerHTML = pageH(nw ? '退款查询' : '退款管理',
      nw ? '本店订单的退款单据，只读。发起退款在订单列表操作行，审批与出账在总部。'
         : ro ? '退款单台账，只读。出账由财务身份执行——右上角「切换」可切到财务。'
         : '退款单据从申请到出账的完整生命周期。未经主管审批的单据财务侧无出账按钮，接口层也会拒绝。') +
      '<div class="grid" style="margin-bottom:16px">' +
      '<div class="stat' + (j.list.filter(function (r) { return r.status === 'l1'; }).length ? ' hot' : '') + '"><b>' +
        j.list.filter(function (r) { return r.status === 'l1'; }).length + '</b><span>' + (ro ? '主管已批待出账' : '待我出账') + '</span></div>' +
      '<div class="stat"><b>' + j.list.filter(function (r) { return r.status === 'applying'; }).length + '</b><span>待主管审批</span></div>' +
      '<div class="stat"><b>¥' + money(j.list.filter(function (r) { return r.status === 'done'; })
        .reduce(function (a, b) { return a + (b.amount || 0); }, 0)) + '</b><span>已退金额</span></div>' +
      '<div class="stat"><b>' + j.list.length + '</b><span>累计单据</span></div></div>' + q.html +
      '<div class="card">' + t.html + '<div class="pad scrollx">' + (byOrd ? table(
        ['订单编号', '销售渠道 / 机构', '销售', '退款人数', '办签人', '退款金额',
         '已出账金额', '整单状态', '首次申请', '最近更新'],
        (j.by_order || []), function (g) {
          var S2 = { applying: 'warn', l1: 'info', done: 'ok', reject: 'bad', part: 'warn' };
          return '<td class="mono nw"><b>' + esc(g.ord_no) + '</b></td>' +
            '<td class="nw">' + ({ C: '直客 C 端', CSP: '门店 CSP', B: '同业 B 端' }[g.channel] || '—') +
            '<div class="hint">' + esc(g.org || '') + '</div></td>' +
            '<td class="nw">' + esc(g.sale || '—') + '</td>' +
            '<td class="num nw"><b>' + g.n + '</b> / ' + (g.pax || '—') + ' 人</td>' +
            '<td style="min-width:120px">' + esc(g.names || '—') + '</td>' +
            '<td class="num nw"><b>¥' + money(g.amount) + '</b></td>' +
            '<td class="num nw">¥' + money(g.done_amount) +
            (g.done_amount < g.amount ? '<div class="hint w">未出账 ¥' +
              money(g.amount - g.done_amount) + '</div>' : '') + '</td>' +
            '<td class="nw"><span class="tag ' + (S2[g.status] || 'plain') + '">' +
              esc(g.status_text) + '</span></td>' +
            '<td class="nw">' + d16(g.first_at) + '</td>' +
            '<td class="nw">' + d16(g.last_at) + '</td>';
        }, '暂无退款订单') : table(
        so.cols(cols), pg.rows, function (r) {
          var st = { applying: ['warn', '待审核'], l1: ['info', '主管已审批'],
                     done: ['ok', '已出账'], reject: ['bad', '已驳回'] }[r.status] || ['plain', r.status];
          var fs = r.status === 'reject' ? '已驳回' : (r.status === 'applying' ? '待审核' : '已审核');
          return '<td class="mono nw"><b>' + esc(r.no) + '</b><div class="hint mono">' + esc(r.ord_no) + '</div></td>' +
            '<td class="mono nw">' + esc(r.src_no || '—') +
            '<div class="hint mono">收 ' + esc(r.src_trade_no || '—') + '</div>' +
            '<div class="hint mono">退 ' + esc(r.status === 'done' ? ('TRF' + (r.no || '').slice(-8)) : '—') + '</div></td>' +
            '<td class="nw">' + esc(r.reason_cate || '—') +
            '<div class="hint">' + esc(r.channel_name || '—') + '</div>' +
            '<div class="hint">' + esc(r.method || '原路退回') + '</div></td>' +
            '<td class="nw">' + esc(r.cust_type || '个人客户') + '</td>' +
            (nw ? '' : '<td class="nw">' + esc(r.org || '直客') +
              '<div class="hint">' + ({ C: '直客 C 端', CSP: '门店 CSP', B: '同业 B 端' }[r.channel] || '') + '</div></td>') +
            '<td class="nw">' + esc(r.sale || '—') + '<div class="hint">' + d16(r.created_at).slice(0, 10) + '</div></td>' +
            '<td style="min-width:110px">' + esc(r.names) + '</td>' +
            '<td class="num nw"><b>¥' + money(r.amount) + '</b></td>' +
            '<td class="nw">' + esc(r.liability_text || '—') + '</td>' +
            '<td class="nw">' + fs + '<div class="hint"><span class="tag ' + st[0] + '">' + st[1] + '</span></div></td>' +
            '<td class="nw">' + esc(r.l1_name || '—') + '<div class="hint">' + (d16(r.l1_at) || '—') + '</div></td>' +
            '<td style="min-width:150px">' + esc(r.reason || '—') +
            (r.note ? '<div class="hint">' + esc(r.note) + '</div>' : '') + '</td>' +
            /* 详情按钮所有角色都给 —— 单据这么多列，列表里塞不下退款依据、
               逐人试算与审批日志，要看全只能进详情（唐美芳 2026-09-02）。 */
            '<td class="nw"><button class="btn sm g" data-rfd="' + esc(r.no) + '">详情</button>' +
            (ro ? '' :
              (r.status === 'l1' ? '<button class="btn sm r" data-r="' + esc(r.no) + '">原路退回出账</button>' : '')) +
            '</td>';
        }, '没有符合条件的退款单')) + '</div>' + (byOrd ? '' : pg.html) + '</div>';

    function rl() { S.cache['pg:' + key] = 1; reload(); }
    q.bind(m, rl); t.bind(m, rl); so.bind(m, rl); pg.bind(m, reload);
    $$('[data-rfd]', m).forEach(function (b) {
      b.onclick = function () { go('refunddetail', b.dataset.rfd); };
    });
    $$('[data-r]', m).forEach(function (b) {
      b.onclick = function () {
        confirmBox('退款出账 ' + b.dataset.r,
          '将生成一笔出账流水并把对应办签人标记为已退款；若订单下所有办签人均已退款，订单状态转为「已退款」。', '确认出账')
          .then(function () { return api('/refund/pay', { no: b.dataset.r }); })
          .then(function () { toast('已出账'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
  });
};

/* ---------- 财务：收款管理（单据式） ---------- */
/* 收款管理 · 字段与页签对齐众信「财务管理 › 业务资金管理 › 收款管理」。
   UOM 财务是操作台（审核 / 标记有误 / 生成凭证 / 放行），CSP 是同一张表的只读视图。
   唐美芳 2026-08-31：「uom 是需要财务确认审核的，csp 主要是查看作用」。 */
VIEWS['fin:recv'] = VIEWS['csp:recv'] = VIEWS['ops:recv'] = VIEWS['lead:recv'] = function (m) {
  return api('/fin/receipts').then(function (j) {
    var ro = !!j.readonly;      // 非财务角色＝只读，不显示审核 / 生成凭证按钮
    var nw = !!j.narrow;        // CSP 才收窄列（隐藏销售公司、凭证号）
    var key = nw ? 'csprecv' : 'finrecv';
    var q = srchCard(key, [
      {
        k: 'kw', t: '收款单号 / 订单编号 / 第三方流水号', ph: '支持模糊查询',
        get: function (p) { return p.no + ' ' + p.ord_no + ' ' + (p.trade_no || ''); }
      },
      { k: 'cate', t: '收款类别', type: 'sel', opts: uniqOpts(j.list, function (p) { return p.cate; }) },
      { k: 'method', t: '收款方式', type: 'sel', opts: uniqOpts(j.list, function (p) { return p.method; }) },
      { k: 'cust_type', t: '客户类型', type: 'sel', opts: uniqOpts(j.list, function (p) { return p.cust_type; }) },
      { k: 'item', t: '款项类型', type: 'sel', opts: uniqOpts(j.list, function (p) { return p.item; }) },
      { k: 'org', t: '客户 / 机构', ph: '支持模糊查询' }
    ]);
    /* 众信那六个页签：全部 / 待审核 / 已审核 / 待生成凭证 / 已生成凭证 / 有误。
       凭证与差错是财务内部流程，CSP 侧只留前三个。 */
    var defs = [
      { k: 'all', t: '全部', fn: function () { return true; } },
      { k: 'wait', t: '待审核', fn: function (r) { return r.audit_status === 'wait'; } },
      { k: 'pass', t: '已审核', fn: function (r) { return r.audit_status === 'pass'; } }
    ];
    if (!nw) defs = defs.concat([
      { k: 'novo', t: '待生成凭证', fn: function (r) { return r.audit_status === 'pass' && !r.voucher_no; } },
      { k: 'vo', t: '已生成凭证', fn: function (r) { return !!r.voucher_no; } },
      { k: 'err', t: '标记有误', fn: function (r) { return r.audit_status === 'error'; } }
    ]);
    var t = subTabs(key, defs, q.filter(j.list));
    var so = sorter(key, [
      ['制单日期', function (p) { return p.created_at || ''; }],
      ['收款金额', function (p) { return p.amount || 0; }],
      ['到账日期', function (p) { return p.arrive_date || ''; }]
    ]);
    var pg = pager(key, so.sort(t.rows), 10);
    var A = { wait: ['待审核', 'warn'], pass: ['已审核', 'ok'], error: ['标记有误', 'bad'] };

    var cols = ['收款单号 / 订单编号 / 流水号', '收款类别 / 渠道 / 方式', '客户类型'];
    if (!nw) cols.push('销售公司 / 渠道名称');
    cols = cols.concat(['销售 / 制单日期', '款项', '收款金额 / 到账金额', '审核状态',
      '审核人 / 审核日期', '付款 / 到账日期', '付款人名称', '销售备注 / 财务备注']);
    if (!nw) cols.push('凭证号');
    cols.push('操作');

    m.innerHTML = pageH(nw ? '收款查询' : '收款管理',
      nw ? '本店订单的收款单据，只读。审核与到账确认由总部财务处理，有疑问在「销售备注」里留言。'
         : ro ? '资金台账，只读。审核、到账确认与生成凭证由财务身份执行——右上角「切换」可切到财务。'
              : '每一笔客户付款生成一张收款单，财务核对水单并确认到账，是整条链路的唯一总开关。') +
      '<div class="grid" style="margin-bottom:16px">' +
      '<div class="stat' + (j.wait_amt ? ' hot' : '') + '"><b>¥' + money(j.wait_amt) + '</b><span>待审核金额</span></div>' +
      '<div class="stat"><b>¥' + money(j.done_amt) + '</b><span>已审核收款</span></div>' +
      '<div class="stat"><b>' + j.list.filter(function (r) { return r.audit_status === 'wait'; }).length + '</b><span>待审核单据</span></div>' +
      '<div class="stat"><b>' + j.list.length + '</b><span>累计单据</span></div></div>' + q.html +
      '<div class="card">' + t.html + '<div class="pad scrollx">' + table(
        so.cols(cols), pg.rows, function (p) {
          var a = A[p.audit_status] || A.wait;
          var diff = p.arrive_amount != null && Math.abs(p.arrive_amount - p.amount) > 0.009;
          return '<td class="mono nw"><b>' + esc(p.no) + '</b>' +
            '<div class="hint mono">' + esc(p.ord_no) + '</div>' +
            '<div class="hint mono">' + esc(p.trade_no || '—') + '</div></td>' +
            '<td class="nw">' + esc(p.cate || '—') +
            '<div class="hint">' + esc(p.channel_name || '—') + '</div>' +
            '<div class="hint">' + esc(p.method || '—') + '</div></td>' +
            '<td class="nw">' + esc(p.cust_type || '—') + '</td>' +
            (nw ? '' : '<td class="nw">' + esc(p.org) +
              '<div class="hint">' + ({ C: '直客 C 端', CSP: '门店 CSP', B: '同业 B 端' }[p.channel] || '') + '</div></td>') +
            '<td class="nw">' + esc(p.sale || '—') + '<div class="hint">' + d16(p.created_at).slice(0, 10) + '</div></td>' +
            '<td class="nw">' + esc(p.item || '团款') + '</td>' +
            '<td class="num nw"><b>¥' + money(p.amount) + '</b>' +
            '<div class="hint' + (diff ? ' bad' : '') + '">到账 ¥' + money(p.arrive_amount != null ? p.arrive_amount : p.amount) +
            (p.fee ? ' · 手续费 ¥' + money(p.fee) : '') + '</div></td>' +
            '<td class="nw"><span class="tag ' + a[1] + '">' + a[0] + '</span>' +
            (p.confirmed ? '<div class="hint">已确认到账</div>' : '') + '</td>' +
            '<td class="nw">' + esc(p.fin_user || '—') + '<div class="hint">' + (d16(p.fin_at) || '—') + '</div></td>' +
            '<td class="nw">' + esc(p.pay_date || '—') + '<div class="hint">' + esc(p.arrive_date || '—') + '</div></td>' +
            '<td class="nw">' + esc(p.payer_name || '—') + '</td>' +
            '<td style="min-width:150px">' + (p.sale_note ? esc(p.sale_note) : '<span class="hint">—</span>') +
            '<div class="hint' + (p.fin_note ? ' bad' : '') + '">' + esc(p.fin_note || '—') + '</div></td>' +
            (nw ? '' : '<td class="mono nw">' + esc(p.voucher_no || '—') + '</td>') +
            '<td class="nw">' + '<button class="btn sm g" data-rdt="' + esc(p.no) + '">详情</button>' +
            (ro ? '' :
              (p.audit_status === 'wait' ?
                '<button class="btn sm r" data-c="' + p.pay_id + '">确认到账</button>' +
                '<button class="btn sm g" data-e="' + p.pay_id + '">标记有误</button>' :
                p.audit_status === 'error' ?
                  '<button class="btn sm g" data-v="' + p.pay_id + '">撤回有误</button>' :
                  (p.voucher_no ? '<span class="hint">已完成</span>' :
                    '<button class="btn sm g" data-g="' + p.pay_id + '">生成凭证</button>'))) +
            '</td>';
        }, '没有符合条件的收款单据') + '</div>' + pg.html + '</div>';

    function rl() { S.cache['pg:' + key] = 1; reload(); }
    q.bind(m, rl); so.bind(m, rl); t.bind(m, rl); pg.bind(m, reload);

    $$('[data-c]', m).forEach(function (b) {
      b.onclick = function () {
        confirmBox('确认收款到账',
          '确认后将<b>立即生成签证工单并派给操作专员</b>，同时对供应商挂应付账款。该动作不可撤销。', '确认到账')
          .then(function () { return api('/fin/confirm', { pay_id: +b.dataset.c }); })
          .then(function (r) { toast(r.msg + '：' + r.wo.join('、')); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    $$('[data-e]', m).forEach(function (b) {
      b.onclick = function () {
        confirmBox('标记为有误',
          '适用于到账金额与收款金额不符、流水号无法匹配等情形。标记后<b>不会确认到账</b>，单据进入「标记有误」页签，待销售核实。', '标记有误')
          .then(function () { return api('/fin/audit', { pay_id: +b.dataset.e, action: 'error' }); })
          .then(function (r) { toast(r.msg); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    $$('[data-v]', m).forEach(function (b) {
      b.onclick = function () {
        api('/fin/audit', { pay_id: +b.dataset.v, action: 'revert' })
          .then(function (r) { toast(r.msg); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    $$('[data-g]', m).forEach(function (b) {
      b.onclick = function () {
        api('/fin/voucher', { pay_id: +b.dataset.g })
          .then(function (r) { toast(r.msg); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    $$('[data-rdt]', m).forEach(function (b) {
      b.onclick = function () { go('recvdetail', b.dataset.rdt); };
    });
    $$('[data-r]', m).forEach(function (b) {
      b.onclick = function () {
        var p = j.list.filter(function (x) { return x.pay_id === +b.dataset.r; })[0];
        confirmBox('收款单 ' + p.no,
          '<div class="kv"><i>订单编号</i><b>' + esc(p.ord_no) + '</b></div>' +
          '<div class="kv"><i>收款类别</i><b>' + esc(p.cate || '—') + ' · ' + esc(p.method || '') + '</b></div>' +
          '<div class="kv"><i>收款渠道</i><b>' + esc(p.channel_name || '—') + '</b></div>' +
          '<div class="kv"><i>款项</i><b>' + esc(p.item || '团款') + '</b></div>' +
          '<div class="kv"><i>收款金额</i><b>¥' + money(p.amount) + '</b></div>' +
          '<div class="kv"><i>到账金额</i><b>¥' + money(p.arrive_amount != null ? p.arrive_amount : p.amount) + '</b></div>' +
          '<div class="kv"><i>付款人</i><b>' + esc(p.payer_name || '—') + '</b></div>' +
          '<div class="kv"><i>第三方流水号</i><b class="mono">' + esc(p.trade_no || '—') + '</b></div>' +
          '<div class="kv"><i>财务备注</i><b>' + esc(p.fin_note || '—') + '</b></div>', '知道了').catch(function () { });
      };
    });
  });
};
