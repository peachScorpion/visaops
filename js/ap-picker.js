/* ============================================================
   办签人选择器 —— C 端 / CSP / 有米三端共用
   唐美芳 2026-09-01：「订单填写页面，办签人添加或修改应该像携程那样，
   有个统一管理的界面……最好增删改查，自动识别为本人有 1 个统一管理的界面」。

   在此之前三端各写各的：C 端是「＋从常用选」「＋手动填」两个入口，
   选人的弹窗只能选不能改；CSP 与有米是就地展开表单一个个填。
   同一件事三种做法，客户资料也散落在订单里而不是档案里。

   现在统一成一个入口：「＋ 选择或更改办签人」→ 打开这个面板，
   里面能勾选、新增、编辑、删除、设本人，确定后回填到下单页。
   所有人都落在 traveler 档案里，下一单直接选。
   ============================================================ */

/* 与后端 INFO_REQUIRED 同一份口径：少一项使领馆就退件，卡片上标「信息不全」 */
var AP_REQUIRED = [['name_cn', '中文姓名'], ['name_en', '英文姓名'], ['sex', '性别'],
                   ['birth', '出生日期'], ['id_no', '证件号码'], ['id_expiry', '证件有效期'],
                   ['id_place', '证件签发地'], ['phone', '手机号'], ['crowd', '适用人群']];

var AP_SEX = [{ v: '男', t: '男' }, { v: '女', t: '女' }];
var AP_IDT = [{ v: '护照', t: '护照' }, { v: '港澳通行证', t: '港澳通行证' },
              { v: '台湾通行证', t: '台湾通行证' }];

/* 档案 → 下单页用的办签人对象。字段名跟 /order/create 收的一致。 */
function apFromTv(t) {
  return {
    tid: t.id, name_cn: t.name_cn, name_en: t.name_en || '', crowd: t.crowd || 'job',
    sex: t.sex || '男', birth: t.birth || '', id_type: t.id_type || '护照',
    id_no: t.id_no || '', id_expiry: t.id_expiry || '', id_place: t.id_place || '',
    nation: t.nation || '中国', phone: t.phone || '', is_self: t.is_self ? 1 : 0
  };
}
/* 一位办签人的资料是否齐到可以提交 */
function apFull(a) {
  return !!(a && a.name_cn && a.id_no && a.crowd);
}

function apForm(t, crowds) {
  t = t || {};
  return [
    { k: 'name_cn', label: '中文姓名', value: t.name_cn || '', required: true,
      hint: '与护照上的中文姓名完全一致' },
    { k: 'name_en', label: '英文姓名', value: t.name_en || '',
      ph: '与护照一致，如 ZHANG/SIYUAN' },
    { k: 'sex', label: '性别', type: 'select', value: t.sex || '男', options: AP_SEX },
    /* y0/y1：滚轮的年份区间。出生日期要翻到上世纪，证件有效期要翻到十几年后，
       用默认的「去年→三年后」根本选不到 */
    { k: 'birth', label: '出生日期', type: 'date', value: t.birth || '',
      y0: 1930, y1: new Date().getFullYear() },
    { k: 'id_type', label: '证件类型', type: 'select', value: t.id_type || '护照', options: AP_IDT },
    { k: 'id_no', label: '证件号码', value: t.id_no || '', required: true },
    { k: 'id_expiry', label: '证件有效期至', type: 'date', value: t.id_expiry || '',
      y0: new Date().getFullYear(), y1: new Date().getFullYear() + 20,
      hint: '多数国家要求剩余有效期不少于 6 个月' },
    { k: 'id_place', label: '证件签发地', value: t.id_place || '', ph: '如：北京' },
    { k: 'nation', label: '国籍', value: t.nation || '中国' },
    { k: 'phone', label: '手机号', value: t.phone || '' },
    { k: 'crowd', label: '适用人群', type: 'select', value: t.crowd || 'job',
      options: (crowds || []).map(function (x) { return { v: x.v, t: x.t }; }),
      hint: '决定这个人要交哪些材料，选错会导致材料清单不对' },
    { k: 'is_self', label: '是否本人', type: 'select', value: t.is_self ? '1' : '0',
      options: [{ v: '0', t: '否' }, { v: '1', t: '是，本人' }],
      hint: '标记后下单时自动带入第一位办签人，一个账号只能有一位' }
  ];
}

/* 销售端（CSP / 有米）的数据源不一样：代客下单时办签人属于客户，不属于销售本人，
   所以不能往销售自己的 traveler 档案里存。这边读的是客户档案里的历史办签人
   （/crm/customer 的 persons，由历史订单聚合而来，只读），
   加上销售在本单里手工新增的人。两种模式共用同一个面板，
   区别只在「列表从哪来」「新增落到哪」。 */
function apFromPerson(pr) {
  return {
    name_cn: pr.name_cn, name_en: pr.name_en || '', crowd: pr.crowd_k || 'job',
    sex: pr.sex === 'F' ? '女' : (pr.sex === 'M' ? '男' : (pr.sex || '男')),
    birth: pr.birth || '', id_type: pr.id_type || '护照', id_no: pr.id_no || '',
    id_expiry: pr.id_expiry || '', id_place: pr.id_place || '',
    nation: pr.nation || '中国', phone: pr.phone || ''
  };
}

/* 打开选择面板。
   sel  ：当前已选的办签人数组（元素为 apFromTv / apFromPerson 的结构）
   opts ：{ max: 上限人数, title: 面板标题,
            mode: 'my'（默认，C 端读自己的档案）| 'sales'（销售端读客户档案），
            custKey: mode=sales 时的客户档案 key，可为空（新客户） }
   返回 ：Promise<新的已选数组> */
function apPicker(sel, opts) {
  opts = opts || {};
  var max = opts.max || 9;
  /* 取消时 resolve 原值而不是 reject：调用方只关心「最后选了谁」，
     统一走 then 一条路，省得每处都补一个空的 catch。 */
  return new Promise(function (resolve) {
    var picked = {};   // 档案 id（销售端为展示用 id / 临时负数 id）→ true
    /* 版式照携程「选择办签人」：一屏 2 行 × 4 列的卡片，人多了左右翻页，
       右下角一个「新增办签人」（唐美芳 2026-09-01：「你可以参考下携程填写的页面，
       特别简单清晰」）。原来是竖排长列表，一屏看不了几个人。 */
    /* 两端同一套逻辑，只是外壳不同：小程序里走整页（opts.page），
       CSP 这种 PC 端仍是弹窗——PC 上把选人做成整页反而是倒退。 */
    var box = modal(opts.title || '选择办签人',
      '<div class="ap-wrap">' +
      '<div class="ap-cust" data-ap-cust hidden></div>' +
      '<div class="ap-body"><a class="ap-nav prev" data-ap-prev>‹</a>' +
      '<div class="ap-list">加载中…</div>' +
      '<a class="ap-nav next" data-ap-next>›</a></div>' +
      '<div class="ap-foot"><div class="ap-pg" data-ap-pg></div>' +
      '<a class="ap-add" data-ap-add>＋ 新增办签人</a></div>' +
      '<div class="ap-tip" data-ap-tip></div></div>',
      [{ t: '取消', fn: function (mo, close) { close(); resolve(sel || []); return false; } },
       { t: '确定', cls: 'r', fn: function (mo, close) { done(close); return false; } }],
      true, opts.page);
    /* 点右上角 × 或蒙层关闭，同样按「保持原样」处理 */
    $('[data-x]', box.mask).addEventListener('click', function () { resolve(sel || []); });
    box.mask.addEventListener('click', function (e) {
      if (e.target === box.mask) resolve(sel || []);
    });

    var LIST = [], CROWDS = [];
    var sales = opts.mode === 'sales';
    var custKey = opts.custKey || '';
    var CUSTS = [];
    /* 销售端：本单里手工新增的人没有档案 id，用递减的负数当临时 key，
       这样勾选、编辑、删除都能沿用同一套按 id 索引的逻辑。 */
    var tmpSeq = -1;
    var PAGE = 8;      // 2 行 × 4 列
    var page = 0;
    var TMP = (sel || []).filter(function (a) { return a.tid < 0; });
    TMP.forEach(function (a) { tmpSeq = Math.min(tmpSeq, a.tid - 1); });

    function load() {
      if (!sales) {
        return api('/my/travelers').then(function (j) {
          LIST = j.list; CROWDS = j.crowds;
          draw();
        }).catch(showErr);
      }
      /* 人群选项跟 C 端同一份，从 /my/travelers 顺带取（销售也有这个权限） */
      var pc = CROWDS.length ? Promise.resolve({ crowds: CROWDS })
        : api('/my/travelers').then(function (j) { return { crowds: j.crowds }; });
      var pl = custKey
        ? api('/crm/customer?key=' + encodeURIComponent(custKey))
        : Promise.resolve({ persons: [] });
      var pcs = CUSTS.length ? Promise.resolve({ list: CUSTS }) : api('/crm/customers');
      return Promise.all([pc, pl, pcs]).then(function (r) {
        CUSTS = r[2].list || [];
        CROWDS = r[0].crowds || [];
        LIST = (r[1].persons || []).map(function (pr, i) {
          var a = apFromPerson(pr);
          a.id = 100000 + i;              // 客户档案里的人：只读，给个稳定的展示用 id
          a.crowd_text = pr.crowd_text || (CROWD_CN && CROWD_CN[a.crowd]) || '';
          a.readonly = true;
          return a;
        }).concat(TMP.map(function (a) {
          return Object.assign({}, a, { id: a.tid,
            crowd_text: (CROWD_CN && CROWD_CN[a.crowd]) || '' });
        }));
        draw();
      }).catch(showErr);
    }
    /* 加载失败要给中文和退路，不能把一句英文 JSON 报错糊在列表区
       （唐美芳 2026-09-02 截图：「加载失败：Unexpected token '<', "<html> <h"...」，
       那是接口返回了 HTML——多半是发版瞬间新旧脚本缓存错配）。
       关键是「新增办签人」始终可用：档案读不出来，销售也得能手录一位把单下掉。 */
    function showErr(e) {
      var msg = String((e && e.message) || e || '');
      var friendly = /Unexpected token|not valid JSON|Failed to fetch|NetworkError/i.test(msg)
        ? '没能读到办签人档案，可能是网络波动或页面版本过旧。'
        : msg;
      $('.ap-list', box.mask).innerHTML =
        '<div class="ap-empty"><b>暂时读不到办签人档案</b>' +
        '<s>' + esc(friendly) + '<br>可以点「重新加载」再试一次，' +
        '或者直接用下方「新增办签人」为本单手录一位，不影响下单。</s>' +
        '<a class="ap-retry" data-ap-retry>重新加载</a></div>';
      var rt = $('[data-ap-retry]', box.mask);
      if (rt) rt.onclick = function () {
        $('.ap-list', box.mask).innerHTML = '<div class="ap-empty">加载中…</div>';
        load();
      };
    }
    /* 首次加载后按已选内容回勾。C 端按档案 id，销售端按证件号匹配——
       客户档案里的人没有稳定主键，证件号是唯一能对上的东西。 */
    var marked = false;
    function markPicked() {
      if (marked) return;
      marked = true;
      var ids = (sel || []).map(function (a) { return a.tid; }).filter(Boolean);
      var nos = (sel || []).map(function (a) { return (a.id_no || '').trim(); }).filter(Boolean);
      LIST.forEach(function (t) {
        if (ids.indexOf(t.id) >= 0 || (t.id_no && nos.indexOf(t.id_no.trim()) >= 0)) {
          picked[t.id] = true;
        }
      });
    }
    function draw() {
      markPicked();
      var tip = $('[data-ap-tip]', box.mask);
      if (tip) {
        tip.innerHTML = sales
          ? '勾选本单需要办理签证的人。带「来自客户档案」的是该客户历史订单里的办签人，' +
            '只读；本单新增的人可以改、删，<b>不会写回客户档案</b>。'
          : '勾选本单需要办理签证的人。这里维护的是<b>常用办签人档案</b>，' +
            '删除只影响档案，不影响已提交的订单。';
      }
      drawCust();
      var el = $('.ap-list', box.mask);
      if (!LIST.length) {
        el.className = 'ap-list empty';
        el.innerHTML = '<div class="ap-empty"><b>' +
          (sales ? '该客户名下暂无可选办签人' : '还没有办签人档案') + '</b>' +
          '<s>' + (sales
            ? '点右下角「新增办签人」为本单录入一位；已成交过的客户，其历史办签人会自动出现在这里'
            : '点右下角「新增办签人」建一位，之后每次下单直接选，不用重填证件信息') +
          '</s></div>';
        drawPager();
        return;
      }
      var maxPage = Math.max(0, Math.ceil(LIST.length / PAGE) - 1);
      if (page > maxPage) page = maxPage;
      el.className = 'ap-list';
      el.innerHTML = LIST.slice(page * PAGE, page * PAGE + PAGE).map(function (t) {
        var on = !!picked[t.id];
        var miss = apMissing(t);
        return '<div class="ap-c' + (on ? ' on' : '') + '" data-ap="' + t.id + '">' +
          '<b>' + esc(t.name_cn) + '</b>' +
          (t.is_self ? '<em class="me">本人</em>' : '') +
          (miss.length
            ? '<s class="miss">信息不全，请补充</s>'
            : '<s>' + esc(t.id_type || '护照') + ' ' + esc(t.id_no || '') + '</s>') +
          (t.expiry_warn ? '<u class="wn">' + esc(t.expiry_warn) + '</u>' : '') +
          '<i class="ap-ck">' + (on ? '✓' : '') + '</i>' +
          '<div class="ap-op">' +
          (t.readonly ? '<em class="ap-ro">客户档案</em>'
            : '<a data-ap-ed="' + t.id + '">编辑</a>' +
              (t.is_self ? '' : '<a data-ap-self="' + t.id + '">设为本人</a>') +
              '<a data-ap-rm="' + t.id + '">删除</a>') +
          '</div></div>';
      }).join('');
      drawPager();
      bind();
    }
    /* 缺项按后端那份必填清单算，跟「录入客人签证资料」是同一套口径 */
    function apMissing(t) {
      return AP_REQUIRED.filter(function (x) { return !(t[x[0]] || ''); })
        .map(function (x) { return x[1]; });
    }
    function drawPager() {
      var maxPage = Math.max(0, Math.ceil(LIST.length / PAGE) - 1);
      var pg = $('[data-ap-pg]', box.mask);
      if (pg) {
        pg.innerHTML = LIST.length > PAGE
          ? '第 ' + (page + 1) + ' / ' + (maxPage + 1) + ' 页 · 共 ' + LIST.length + ' 人'
          : (LIST.length ? '共 ' + LIST.length + ' 人' : '');
      }
      var pv = $('[data-ap-prev]', box.mask), nx = $('[data-ap-next]', box.mask);
      if (pv) pv.hidden = LIST.length <= PAGE;
      if (nx) nx.hidden = LIST.length <= PAGE;
      if (pv) pv.classList.toggle('off', page <= 0);
      if (nx) nx.classList.toggle('off', page >= maxPage);
    }
    /* 销售端：客户档案的选择也收进这个弹窗，不再在下单页外面单挂一个下拉
       （唐美芳 2026-09-01：「历史的客户档案，也是通过选择或更改办签人，
       这个操作页面里统一操作」）。 */
    function drawCust() {
      var box2 = $('[data-ap-cust]', box.mask);
      if (!box2) return;
      if (!sales) { box2.hidden = true; return; }
      box2.hidden = false;
      box2.innerHTML = '<span>客户档案</span><select data-ap-custsel>' +
        '<option value="">新客户（本单手工录入）</option>' +
        CUSTS.map(function (x) {
          return '<option value="' + esc(x.key) + '"' +
            (custKey === x.key ? ' selected' : '') + '>' +
            esc((x.name || '未留名') + ' · ' + x.phone + '（' + x.orders + ' 单）') + '</option>';
        }).join('') + '</select>' +
        '<i>选定老客户后，其历史办签人会直接出现在下面，勾选即可，无需重录证件信息</i>';
      $('[data-ap-custsel]', box2).onchange = function () {
        custKey = this.value;
        page = 0;
        load();
      };
    }

    function bind() {
      var mask = box.mask;
      $$('[data-ap]', mask).forEach(function (r) {
        r.onclick = function (e) {
          if (e.target.closest('.ap-op')) return;
          var id = +r.dataset.ap;
          if (picked[id]) { delete picked[id]; }
          else {
            if (Object.keys(picked).length >= max) {
              return toast('一张订单最多 ' + max + ' 位办签人', true);
            }
            picked[id] = true;
          }
          draw();
        };
      });
      $$('[data-ap-ed]', mask).forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          var t = LIST.filter(function (x) { return x.id === +b.dataset.apEd; })[0];
          if (sales) {
            /* 本单内新增的人：改的是本单数据，不入任何档案 */
            return ask('编辑办签人', apForm(t, CROWDS), '保存', null, opts.page).then(function (f) {
              var k = TMP.filter(function (x) { return x.tid === t.id; })[0];
              if (k) Object.assign(k, f, { is_self: 0 });
              return load();
            }).catch(function () { });
          }
          ask('编辑办签人', apForm(t, CROWDS), '保存', function (f) {
            return api('/my/traveler/save',
              Object.assign({ id: t.id }, f, { is_self: +f.is_self || 0 }));
          }, opts.page).then(function () { toast('已保存'); return load(); }).catch(function () { });
        };
      });
      $$('[data-ap-rm]', mask).forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          var t = LIST.filter(function (x) { return x.id === +b.dataset.apRm; })[0];
          if (sales) {
            TMP = TMP.filter(function (x) { return x.tid !== t.id; });
            delete picked[t.id];
            return load();
          }
          confirmBox('删除「' + esc(t.name_cn) + '」',
            '仅从常用办签人档案中移除，<b>不影响已提交的订单</b>——' +
            '历史订单中的办签人信息独立保存。', '确认删除')
            .then(function () { return api('/my/traveler/del', { id: t.id }); })
            .then(function () { delete picked[t.id]; toast('已删除'); return load(); })
            .catch(function () { });
        };
      });
      $$('[data-ap-self]', mask).forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          api('/my/traveler/self', { id: +b.dataset.apSelf })
            .then(function (r) { toast('已将 ' + r.name + ' 标记为本人'); return load(); })
            .catch(fail);
        };
      });
      var pv = $('[data-ap-prev]', mask), nx = $('[data-ap-next]', mask);
      if (pv) pv.onclick = function () { if (page > 0) { page--; draw(); } };
      if (nx) nx.onclick = function () {
        if ((page + 1) * PAGE < LIST.length) { page++; draw(); }
      };
      $('[data-ap-add]', mask).onclick = function () {
        if (sales) {
          return ask('新增办签人', apForm(null, CROWDS), '加入本单', null, opts.page).then(function (f) {
            var a = Object.assign({}, f, { tid: tmpSeq, is_self: 0 });
            tmpSeq -= 1;
            TMP.push(a);
            if (Object.keys(picked).length < max) picked[a.tid] = true;
            return load();
          }).catch(function () { });
        }
        ask('新增办签人', apForm(null, CROWDS), '保存', function (f) {
          return api('/my/traveler/save', Object.assign({}, f, { is_self: +f.is_self || 0 }));
        }, opts.page).then(function (r) {
          /* 新建的人默认勾上——用户点「新增」就是要把他加进这一单 */
          if (r && r.id && Object.keys(picked).length < max) picked[r.id] = true;
          toast('已保存');
          return load();
        }).catch(function () { });
      };
    }

    function done(close) {
      var ids = Object.keys(picked).map(Number);
      if (!ids.length) return toast('请至少勾选一位办签人', true);
      /* 保持列表顺序（本人在最前），而不是勾选的先后顺序 */
      var out = LIST.filter(function (t) { return picked[t.id]; }).map(function (t) {
        if (!sales) return apFromTv(t);
        /* 销售端：档案里的人取只读快照，本单新增的人保留临时 tid 以便再次编辑 */
        var a = Object.assign({}, t);
        delete a.readonly; delete a.crowd_text;
        if (a.id >= 100000) { delete a.id; delete a.tid; }
        return a;
      });
      /* 当前选中的客户档案随结果一起回传：下单页要用它带出联系人，
         也要在下次打开面板时保持选中（客户档案的选择已收进这个面板） */
      out.custKey = custKey;
      close();
      resolve(out);
    }
    load();
  });
}


/* 「下单后再填写办签人资料」开关 —— 三端共用的一小段 UI。
   唐美芳 2026-09-01：「办签人信息加个开关，可以预订下单后再填写，
   因为订单有不填写资料就会自动取消订单，所以这块不用担心」。
   打开后只报人数，系统按人数建占位办签人；付款前必须补齐，
   逾期整单自动取消——两道闸都在，所以这里放开是安全的。 */
function apLaterHtml(on, n, hours) {
  return '<div class="ap-later">' +
    '<label class="ap-sw"><input type="checkbox" data-ap-later' + (on ? ' checked' : '') +
    '><i></i><span>下单后再填写办签人资料</span></label>' +
    (on
      ? '<div class="ap-num">办签人数' +
        '<a data-ap-n="-1">−</a><b>' + n + '</b><a data-ap-n="1">＋</a>' +
        '<em>先按人数占位，' + (hours || 24) + ' 小时内在订单里补齐每位办签人的资料</em></div>'
      : '') + '</div>';
}
/* 绑定开关与人数步进。onChange(on, n) 由调用方决定怎么重绘。 */
function apLaterBind(scope, get, onChange) {
  var sw = $('[data-ap-later]', scope);
  if (sw) sw.onchange = function () { onChange(sw.checked, get().n); };
  $$('[data-ap-n]', scope).forEach(function (a) {
    a.onclick = function () {
      var n = Math.min(9, Math.max(1, get().n + (+a.dataset.apN)));
      onChange(true, n);
    };
  });
}
