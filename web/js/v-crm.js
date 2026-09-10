/* ================= 客户档案（UOM 平台配置/专员/主管 与 CSP 门店共用） =================
   系统没有独立的客户表：客户是「同一个联系人手机号」在历次订单里沉淀出来的档案，
   办签人再按证件号去重。这样客户第二次办签时，护照信息与上次交过的材料能直接回显复用，
   不必从头重填。CSP 只能看到本门店经手的客户，UOM 侧看全量。 */

function crmProgTag(t) {
  if (!t) return '—';
  return '<span class="tag plain">' + esc(t) + '</span>';
}
function crmResultTag(r) {
  /* 这一列是「签证结果」（出签 / 拒签 / 撤签 / 行政审查），没出结果就写「未出结果」。
     原来写的是「办理中」——那是办理状态那条线上的词，混进结果列会让人以为
     这是个状态字段（唐美芳 2026-08-31：订单状态、办理状态、签证结果要分清）。 */
  if (!r) return '<span class="tag plain">未出结果</span>';
  if (r === '出签') return '<span class="tag ok">出签</span>';
  if (r === '拒签') return '<span class="tag bad">拒签</span>';
  return '<span class="tag warn">' + esc(r) + '</span>';
}
var CRM_CH = { C: 'C 端自助', CSP: 'CSP 门店', B: '同业' };

/* ---------- 列表 ---------- */
function crmList(m) {
  return api('/crm/customers').then(function (j) {
    var q = srchCard('crmcust', [
      {
        k: 'kw', t: '客户姓名 / 手机号 / 订单号', ph: '支持模糊查询',
        get: function (x) { return (x.name || '') + ' ' + (x.phone || '') + ' ' + (x.email || '') + ' ' + (x.last_no || ''); }
      },
      {
        k: 'ch', t: '来源渠道', type: 'sel', multi: true,
        opts: [['C', 'C 端自助'], ['CSP', 'CSP 门店'], ['B', '同业']],
        get: function (x) { return x.channels || []; }
      },
      { k: 'org', t: '归属机构', type: 'sel', opts: uniqOpts(j.list, function (x) { return x.org; }) },
      {
        k: 'rep', t: '复购状态', type: 'sel',
        opts: [['y', '复购客户（2 单及以上）'], ['n', '仅一单']],
        get: function (x) { return x.orders > 1 ? 'y' : 'n'; }
      },
      {
        k: 'doing', t: '在办订单', type: 'sel',
        opts: [['y', '有在办订单'], ['n', '无在办订单']],
        get: function (x) { return x.last_status_k === 'paid' ? 'y' : 'n'; }
      }
    ]);
    /* 客户档案没有业务状态——「复购 / 有在办 / 仅一单」是筛选条件而不是状态流转，
       原来既做成页签又做成下拉，同一件事出现两遍，现在统一收进查询卡。 */
    var hit = q.filter(j.list);
    /* 订单数、人数、成交额、下单时间是数据列，做成可排序表头：
       客服要的是「按累计成交从高到低看谁是大客户」，不是「累计成交等于多少」。 */
    var so = sorter('crmcust', [
      ['订单数', function (x) { return x.orders || 0; }],
      ['办签人数', function (x) { return x.persons || 0; }],
      ['累计成交', function (x) { return x.amount || 0; }],
      ['最近下单', function (x) { return x.last_at || ''; }]
    ]);
    var pg = pager('crmcust', so.sort(hit), 10);

    m.innerHTML = pageH('客户档案',
      '按联系人手机号沉淀的客户档案，档案内的办签人再按证件号去重，' +
      (S.role === 'csp' ? '门店只能看到本门店经手的客户。' : '运营侧看到全平台客户。')) +
      /* 操作说明 2026-09-03 撤掉（唐美芳：「后台的操作说明，不用每个页面都展示，
         比如订单管理、客户管理，我感觉就不需要」）。订单列表和客户档案是天天要用的
         日常作业页，说明块占掉小半屏还得每次收起。配置类页面（材料库、表模板、
         国家配置）的说明保留——那些是偶尔进一次、口径又容易记混的。 */
 q.html +
      '<div class="card"><div class="pad">' + table(
        so.cols(['客户', '联系方式', '来源渠道', '归属机构', '订单数', '办签人数', '累计成交', '最近订单', '最近下单']),
        pg.rows, function (x) {
          return '<td><b>' + esc(x.name || '未留名') + '</b>' +
            (x.orders > 1 ? ' <span class="tag ok">复购 ' + x.orders + ' 次</span>' : '') + '</td>' +
            '<td class="mono">' + esc(x.phone || '—') + (x.email ? '<div class="hint">' + esc(x.email) + '</div>' : '') + '</td>' +
            '<td>' + x.channels.map(function (ch) {
              return '<span class="tag">' + esc(CRM_CH[ch] || ch) + '</span>';
            }).join(' ') + '</td>' +
            '<td>' + esc(x.org) + '</td>' +
            '<td class="num">' + x.orders + '</td>' +
            '<td class="num">' + x.persons + (x.approved ? '<div class="hint">已出签 ' + x.approved + '</div>' : '') + '</td>' +
            '<td class="num">¥' + money(x.amount) + '</td>' +
            '<td class="mono">' + esc(x.last_no) + '<div class="hint">' + esc(x.last_status) + '</div></td>' +
            '<td>' + d10(x.last_at) + '<div class="hint"><a class="lk" data-k="' + esc(x.key) + '">查看档案 →</a></div></td>';
        }, '没有符合条件的客户') + '</div>' + pg.html + '</div>';

    q.bind(m, function () { S.cache['pg:crmcust'] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:crmcust'] = 1; reload(); });
    pg.bind(m, reload);
    $$('[data-k]', m).forEach(function (a) {
      a.onclick = function () { go('customers', a.dataset.k); };
    });
  });
}

/* ---------- 详情 ---------- */
function crmDetail(m, key) {
  return api('/crm/customer?key=' + encodeURIComponent(key)).then(function (j) {
    var p = j.profile;
    var sec = S.cache.crmsec || 'person';
    m.innerHTML = pageH('客户档案 · ' + (p.name || '未留名'),
      '这份档案由该客户历次订单自动沉淀而成。办签人资料与已交材料都可以在下次下单时直接复用。',
      '<button class="btn" data-back>← 返回客户列表</button>') +
      card('客户概览', '<div class="pad"><div class="kvs">' +
        '<div class="kv"><i>客户姓名</i><b>' + esc(p.name || '未留名') + '</b></div>' +
        '<div class="kv"><i>联系电话</i><b class="mono">' + esc(p.phone || '—') + '</b></div>' +
        '<div class="kv"><i>邮箱</i><b>' + esc(p.email || '—') + '</b></div>' +
        '<div class="kv"><i>来源渠道</i><b>' + p.channels.map(function (ch) {
          return '<span class="tag">' + esc(CRM_CH[ch] || ch) + '</span>';
        }).join(' ') + '</b></div>' +
        '<div class="kv"><i>归属机构</i><b>' + esc(p.org) + '</b></div>' +
        '<div class="kv"><i>累计订单</i><b>' + p.orders + ' 单 · ¥' + money(p.amount) + '</b></div>' +
        '<div class="kv"><i>首次下单</i><b>' + d10(p.first_at) + '</b></div>' +
        '<div class="kv"><i>最近下单</i><b>' + d10(p.last_at) + '</b></div>' +
        '</div></div>') +
      '<div class="subtabs big">' +
      /* 收货地址簿：凯撒 PRD 4.11「用户管理 › 收货地址管理」。
         签证办完要把护照原件寄回，客服替客户改地址原来只能一单一单进订单详情改。 */
      [['person', '办签人资料库（' + j.persons.length + '）'],
       ['order', '历史订单（' + j.orders.length + '）'],
       ['addr', '收货地址簿（' + (j.addrs || []).length + '）']]
        .map(function (x) {
          return '<a data-sec="' + x[0] + '"' + (x[0] === sec ? ' class="on"' : '') + '>' + esc(x[1]) + '</a>';
        }).join('') + '</div><div id="crmbody"></div>';

    $('[data-back]', m).onclick = function () { go('customers'); };
    $$('[data-sec]', m).forEach(function (a) {
      a.onclick = function () { S.cache.crmsec = a.dataset.sec; reload(); };
    });

    var body = $('#crmbody', m);
    if (sec === 'addr') {
      var uid = (j.orders[0] || {}).buyer_user;
      body.innerHTML = '<div class="card"><div class="pad">' +
        '<div class="note">签证办完要把护照原件寄回客户，这里维护的就是寄回地址。' +
        '<b>改地址会影响在办订单</b>——下方「在办订单」列出的那几张单，其寄件地址会一并变更，' +
        '改前请先跟客户确认。有在办订单的地址不允许删除。</div>' +
        '<div class="btns" style="margin-bottom:12px">' +
        (uid ? '<button class="btn r" data-anew>新建</button>' :
          '<span class="hint">该客户没有关联账号，无法新增地址</span>') + '</div>' +
        table(['收货人', '联系电话', '收货地址', '默认', '被引用', '在办订单', '最近维护', '操作'],
          (j.addrs || []), function (a) {
            return '<td class="nw"><b>' + esc(a.contact || '—') + '</b></td>' +
              '<td class="mono nw">' + esc(a.phone || '—') + '</td>' +
              '<td style="min-width:230px">' + esc(a.region || '') + ' ' + esc(a.detail || '') + '</td>' +
              '<td class="nw">' + (a.is_default ? '<span class="tag ok">默认</span>' : '—') + '</td>' +
              '<td class="num nw">' + a.used + ' 单</td>' +
              '<td style="min-width:150px">' + (a.live.length
                ? '<span class="tag warn">' + a.live.length + ' 张在办</span><div class="hint mono">' +
                  a.live.slice(0, 4).map(esc).join('、') + (a.live.length > 4 ? ' …' : '') + '</div>'
                : '<span class="hint">无</span>') + '</td>' +
              '<td class="nw hint">' + esc(a.updated_by_name || '—') +
              '<div>' + (d16(a.updated_at) || '—') + '</div></td>' +
              '<td class="nw"><div class="btns">' +
              '<button class="btn sm" data-aed="' + a.id + '">编辑</button>' +
              (a.live.length ? '' : '<button class="btn sm g" data-adel="' + a.id + '">删除</button>') +
              '</div></td>';
          }, '该客户还没有收货地址') + '</div></div>';

      function addrForm(a) {
        a = a || {};
        return [
          { k: 'contact', label: '收货人', value: a.contact || '', required: true },
          { k: 'phone', label: '联系电话', value: a.phone || '', required: true },
          { k: 'region', label: '所在地区', value: a.region || '', required: true,
            ph: '如：北京市海淀区' },
          { k: 'detail', label: '详细地址', type: 'textarea', rows: 2, value: a.detail || '',
            required: true, ph: '街道、门牌号、楼层' },
          { k: 'is_default', label: '设为默认', type: 'select',
            value: a.is_default ? '1' : '0',
            options: [{ v: '0', t: '否' }, { v: '1', t: '是' }] }
        ];
      }
      if ($('[data-anew]', m)) {
        $('[data-anew]', m).onclick = function () {
          ask('新增收货地址', addrForm(), '保存', function (f) {
            return api('/crm/addr/save', Object.assign({ owner_id: uid }, f));
          }).then(function () { toast('已新增'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
        };
      }
      $$('[data-aed]', m).forEach(function (btn) {
        btn.onclick = function () {
          var a = j.addrs.filter(function (x) { return x.id === +btn.dataset.aed; })[0];
          var warn = a.live.length
            ? [{ type: 'html', html: '<div class="note w">这个地址正被 <b>' + a.live.length +
                '</b> 张在办订单使用（' + a.live.slice(0, 3).map(esc).join('、') +
                (a.live.length > 3 ? ' 等' : '') + '）。' +
                '保存后这些订单的寄件地址一并变更，请先跟客户确认。</div><br>' }]
            : [];
          ask('编辑收货地址', warn.concat(addrForm(a)), '保存', function (f) {
            return api('/crm/addr/save', Object.assign({ id: a.id }, f));
          }).then(function () { toast('已保存'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
        };
      });
      $$('[data-adel]', m).forEach(function (btn) {
        btn.onclick = function () {
          confirmBox('删除收货地址', '删除后不影响历史订单已记录的地址，但客户下单时不再能选到它。', '确认删除')
            .then(function () { return api('/crm/addr/del', { id: +btn.dataset.adel }); })
            .then(function () { toast('已删除'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
        };
      });
      return;
    }
    if (sec === 'order') {
      body.innerHTML = '<div class="card"><div class="pad">' + table(
        ['订单号', '渠道', '产品 / 套餐', '人数', '金额', '出发日期', '办签人与结果', '状态', '下单时间'],
        j.orders, function (o) {
          return '<td class="mono">' + esc(o.no) + '</td>' +
            '<td><span class="tag">' + esc(CRM_CH[o.channel] || o.channel) + '</span></td>' +
            '<td><b>' + esc(o.product) + '</b><div class="hint">' + esc(o.pkg) + '</div></td>' +
            '<td class="num">' + o.pax + '</td><td class="num">¥' + money(o.amount) + '</td>' +
            '<td>' + (o.depart_date ? d10(o.depart_date) : '未定') + '</td>' +
            '<td>' + o.applicants.map(function (a) {
              return esc(a.name) + ' ' + crmResultTag(a.result);
            }).join('<br>') + '</td>' +
            '<td>' + esc(o.status_text) + '</td><td>' + d10(o.created_at) + '</td>';
        }, '暂无订单') + '</div></div>';
      return;
    }

    /* 办签人资料库 = 这位客户「常用办签人」的档案，是<b>汇总</b>性质的。
       原来一人一张大卡片、卡片里再嵌一张把他每一单都列出来的表，
       一个办过五次签的客人就是五行材料记录，页面拉不到底
       （唐美芳 2026-09-02：「不需要提现每个订单的材料吧，这样数据太长了…
       应该是汇总性质的，可以有按钮点进去看具体详情，本来也有历史订单列表」）。
       现在一人一行，只摆下次办签要复用的东西：证件、人群、办过几次、最近一次什么结果、
       资料齐不齐；每一单的明细和材料收进「查看档案」。 */
    var KEYF = [['name_en', '英文姓名'], ['sex', '性别'], ['birth', '出生日期'],
                ['id_no', '证件号'], ['id_expiry', '证件有效期'], ['nation', '国籍']];
    function lackOf(x) {
      return KEYF.filter(function (f) { return !x[f[0]]; }).map(function (f) { return f[1]; });
    }
    /* 护照剩余有效期不足半年，多数国家不给签——资料库里要一眼看见 */
    function expTag(x) {
      if (!x.id_expiry) return '';
      var left = Math.floor((new Date(x.id_expiry) - new Date()) / 86400000);
      if (isNaN(left)) return '';
      if (left < 0) return '<div class="hint bad">已过期</div>';
      if (left < 183) return '<div class="hint bad">剩余不足 6 个月</div>';
      return '';
    }
    body.innerHTML = '<div class="card"><div class="pad">' +
      '<div class="note">这里是<b>这位客户名下的常用办签人</b>——本人、家属或销售历次替他录入过的人。' +
      '一人一行，只留下次办签能直接复用的信息；' +
      '每一单的办理明细与提交过的材料在「查看档案」里，整单维度的记录在「历史订单」页签。</div>' +
      table(['办签人', '性别 / 出生日期', '证件号 / 有效期', '人群属性', '手机',
             '办签次数', '最近一次', '出签 / 拒签', '资料完整度', '操作'],
        j.persons, function (x) {
          var last = x.records[0] || {};
          var pass = x.records.filter(function (r) { return r.result === '出签'; }).length;
          var rej = x.records.filter(function (r) { return r.result === '拒签'; }).length;
          var lack = lackOf(x);
          return '<td class="nw"><b>' + esc(x.name_cn || '未命名') + '</b>' +
            (x.name_en ? '<div class="hint">' + esc(x.name_en) + '</div>' : '') + '</td>' +
            '<td class="nw">' + esc(x.sex === 'F' ? '女' : (x.sex === 'M' ? '男' : (x.sex || '—'))) +
            '<div class="hint">' + (d10(x.birth) || '—') + '</div></td>' +
            '<td class="mono nw">' + esc(x.id_no || '—') +
            '<div class="hint">' + (d10(x.id_expiry) || '—') + '</div>' + expTag(x) + '</td>' +
            '<td class="nw">' + esc(x.crowd || '—') +
            (x.id_place ? '<div class="hint">签发地 ' + esc(x.id_place) + '</div>' : '') + '</td>' +
            '<td class="mono nw">' + esc(x.phone || '—') + '</td>' +
            '<td class="num nw"><b>' + x.times + '</b> 次</td>' +
            '<td style="min-width:170px">' + (last.ord_no
              ? d10(last.ord_at) + '<div class="hint">' + esc(last.product || '') + '</div>'
              : '<span class="hint">—</span>') + '</td>' +
            '<td class="nw">' + (pass || rej
              ? (pass ? '<span class="tag ok">出签 ' + pass + '</span>' : '') +
                (rej ? '<span class="tag bad">拒签 ' + rej + '</span>' : '')
              : '<span class="hint">办理中</span>') + '</td>' +
            '<td style="min-width:150px">' + (lack.length
              ? '<span class="tag warn">缺 ' + lack.length + ' 项</span>' +
                '<div class="hint">' + esc(lack.join('、')) + '</div>'
              : '<span class="tag ok">齐全</span>') + '</td>' +
            '<td class="nw"><button class="btn sm" data-pf=\'' + jattr(x) + '\'>查看档案</button></td>';
        }, '这位客户还没有录入过办签人') + '</div></div>';

    /* 「查看档案」：这个人历次办签的明细，原来平铺在页面上的那张表搬到这里 */
    $$('[data-pf]', body).forEach(function (b) {
      b.onclick = function () {
        var x = JSON.parse(b.dataset.pf);
        var mo = modal('办签人档案 · ' + (x.name_cn || '未命名'),
          '<div class="pad"><div class="kvs">' +
          '<div class="kv"><i>中文姓名</i><b>' + esc(x.name_cn || '—') + '</b></div>' +
          '<div class="kv"><i>英文姓名</i><b>' + esc(x.name_en || '—') + '</b></div>' +
          '<div class="kv"><i>性别</i><b>' + esc(x.sex === 'F' ? '女' : (x.sex === 'M' ? '男' : (x.sex || '—'))) + '</b></div>' +
          '<div class="kv"><i>出生日期</i><b>' + (d10(x.birth) || '—') + '</b></div>' +
          '<div class="kv"><i>证件号</i><b class="mono">' + esc(x.id_no || '—') + '</b></div>' +
          '<div class="kv"><i>证件有效期至</i><b>' + (d10(x.id_expiry) || '—') + '</b></div>' +
          '<div class="kv"><i>签发地</i><b>' + esc(x.id_place || '—') + '</b></div>' +
          '<div class="kv"><i>国籍</i><b>' + esc(x.nation || '—') + '</b></div>' +
          '<div class="kv"><i>人群属性</i><b>' + esc(x.crowd || '—') + '</b></div>' +
          '<div class="kv"><i>手机</i><b class="mono">' + esc(x.phone || '—') + '</b></div>' +
          '</div>' +
          '<h6 class="sub-h">历次办签记录</h6>' + table(
            ['办签时间', '订单号', '产品', '进度', '结果', '签证号 / 有效期', '材料', '操作'],
            x.records, function (r) {
              return '<td class="nw">' + d10(r.ord_at) + '</td><td class="mono nw">' + esc(r.ord_no) + '</td>' +
                '<td>' + esc(r.product) + '</td><td class="nw">' + crmProgTag(r.progress_text) + '</td>' +
                '<td class="nw">' + crmResultTag(r.result) +
                (r.reject_reason ? '<div class="hint">' + esc(r.reject_reason) + '</div>' : '') + '</td>' +
                '<td class="mono nw">' + (r.visa_no ? esc(r.visa_no) +
                  '<div class="hint">有效至 ' + d10(r.visa_valid_to) +
                  (r.visa_stay ? ' · 停留 ' + r.visa_stay + ' 天' : '') + '</div>' : '—') + '</td>' +
                '<td class="num nw">' + r.mat_done + ' / ' + r.mat_total + '</td>' +
                '<td class="nw"><button class="btn sm" data-mat=\'' + jattr(r) + '\'>查看材料</button></td>';
            }, '暂无办签记录') + '</div>', null, true);
        /* 材料按钮在这层弹窗里，绑定要落在弹窗自己的 DOM 上——
           页面上的 body 里已经没有 [data-mat] 了。 */
        bindMat($$('[data-mat]', mo.mask));
      };
    });

    function bindMat(list) {
      list.forEach(function (b) {
      b.onclick = function () {
        var r = JSON.parse(b.dataset.mat);
        modal('材料回显 · ' + r.ord_no,
          '<div class="note">这份清单是该办签人在这一单实际提交的材料。' +
          '下次为同一个人办签时，护照、户口本、身份证等长期有效件可以直接沿用，' +
          '只需补交时效性材料（在职证明、银行流水、行程单等）。</div>' +
          table(['材料名称', '原件/复印件', '状态', '文件', '补料轮次', '更新时间'], r.mats, function (t2) {
            return '<td><b>' + esc(t2.mat_name) + '</b></td><td>' + esc(t2.attr_text) + '</td>' +
              '<td>' + (t2.status === 'pass' ? '<span class="tag ok">已通过</span>' :
                (t2.status === 'reject' ? '<span class="tag bad">已驳回</span>' : '<span class="tag plain">待提交</span>')) + '</td>' +
              '<td>' + matFile(t2) + '</td>' +
              '<td class="num">' + (t2.round || 0) + '</td><td>' + d16(t2.updated_at) + '</td>';
          }, '这一单没有材料记录'), null, true);
      };
      });
    }
  });
}

['ops', 'uom', 'lead', 'csp'].forEach(function (role) {
  VIEWS[role + ':customers'] = function (m, param) {
    return param ? crmDetail(m, param) : crmList(m);
  };
});
