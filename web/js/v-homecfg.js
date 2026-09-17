/* ============================================================
   UOM · 签证频道首页配置（C 端 / 有米共用）
   唐美芳 2026-08-31：「签证频道首页配置确实可以来一个配置页，你直接补就行」。
   在此之前首页的头图、热门国家、热门产品全写死在前端代码里，
   运营想在旺季换个国家、挂张促销图都要改代码发版。
   三个页签对应 PRD 的 4.12.2 / 4.12.3 / 4.12.4。
   2026-09-15：增加有米小程序首页配置，通过 URL 区分渠道。
   有米与 C 端结构不同：
   · C 端：轮播图、热门国家、热门产品
   · 有米：头图（单张）、低价优选产品
   ============================================================ */

var HC_TABS_C = [
  ['banner', '首页轮播图', 'PRD 4.12.2'],
  ['country', '热门国家', 'PRD 4.12.3'],
  ['product', '热门产品', 'PRD 4.12.4']
];

var HC_TABS_YOUMI = [
  ['banner', '头图', '有米签证频道顶部大图'],
  ['product', '低价优选', '首页低价优选产品']
];

var HC_LINK = { none: '不跳转', list: '全部目的地', country: '国家列表页', product: '产品详情页' };

function homeCfgView(m, ch) {
  return api('/ops/home?channel=' + ch).then(function (j) {
    var tab = S.cache.hcTab || 'banner';
    var list = j[tab] || [];
    var chName = ch === 'youmi' ? '有米小程序' : 'C 端';
    var onKey = ch === 'youmi' ? 'on_b' : 'on_c';
    var HC_TABS = ch === 'youmi' ? HC_TABS_YOUMI : HC_TABS_C;

    function actCell(r) {
      return '<div class="btns">' +
        '<button class="btn sm g" data-mv="' + r.id + '" data-d="up">↑</button>' +
        '<button class="btn sm g" data-mv="' + r.id + '" data-d="down">↓</button>' +
        '<button class="btn sm" data-ed="' + r.id + '">编辑</button>' +
        '<button class="btn sm g" data-rm="' + r.id + '">删除</button></div>';
    }
    function onTag(r) {
      return '<a class="sw' + (r.active ? ' on' : '') + '" data-tg="' + r.id + '"' +
        ' title="' + (r.active ? '点击停用' : '点击启用') + '"></a>';
    }
    function linkText(r) {
      return esc(HC_LINK[r.link_kind] || '不跳转') +
        (r.link_val ? '<div class="hint">' + esc(r.link_val) + '</div>' : '');
    }
    /* 页签计数＝该渠道该页签「实际会展示给客户」的条目数，而不只是手动配置数。
       有米无配置时有兜底：头图展示默认图（算 1 条），低价优选自动取最低价前几个（按实际数量算）。 */
    function tabCount(k) {
      var n = (j[k] || []).length;
      if (ch === 'youmi') {
        if (k === 'banner') return n || 1;
        if (k === 'product') return n || (j.auto_products || []).length;
      }
      return n;
    }

    var body;
    if (tab === 'banner') {
      // 有米特殊处理：无配置时展示默认头图
      if (ch === 'youmi' && !list.length) {
        var defaultImg = (typeof CCFG !== 'undefined' && CCFG['英国'] && CCFG['英国'].hero) || 'img/dest/uk2.jpg';
        var defaultTitle = '去哪儿，就办哪儿的签证';
        body = '<div class="note" style="margin-bottom:12px">' +
          '当前有米小程序使用<b>默认头图</b>。点击下方「新增头图」可以配置自定义头图。</div>' +
          table(['预览', '主标题', '状态'], [{
            img: defaultImg,
            title: defaultTitle,
            is_default: true
          }], function (r) {
            return '<td class="nw"><div class="hc-th" style="background-image:url(' + esc(r.img) + ')"></div></td>' +
              '<td style="min-width:230px"><b>' + esc(r.title) + '</b>' +
              '<div class="hint">' + esc(r.img) + '</div></td>' +
              '<td class="nw"><span class="tag plain">默认</span></td>';
          }, '');
      } else {
        body = table(['排序', '预览', '主标题 / 副标题', '跳转', '状态', '最近维护', '操作'],
          list, function (r) {
            return '<td class="num nw">' + r.sort + '</td>' +
              '<td class="nw"><div class="hc-th"' +
              (r.img ? ' style="background-image:url(' + esc(r.img) + ')"' : '') + '></div></td>' +
              '<td style="min-width:230px"><b>' + esc((r.title || '').replace(/\n/g, ' ')) + '</b>' +
              '<div class="hint">' + esc(r.subtitle || '—') + '</div></td>' +
              '<td class="nw">' + linkText(r) + '</td>' +
              '<td class="nw">' + onTag(r) + '</td>' +
              '<td class="nw hint">' + esc(r.updated_by_name || '—') +
              '<div>' + d16(r.updated_at) + '</div></td>' +
              '<td class="nw">' + actCell(r) + '</td>';
          }, '还没有配置轮播图，C 端首页会退回默认头图');
      }
    } else if (tab === 'country') {
      /* 热门国家按分组展示——C 端首页那排「热门 / 亚洲 / 欧洲 / 美洲 / 澳新非」页签就是它 */
      var byG = {};
      list.forEach(function (r) { (byG[r.grp || '未分组'] = byG[r.grp || '未分组'] || []).push(r); });
      body = Object.keys(byG).map(function (g) {
        return '<h4 class="hc-g">' + esc(g) + '<s>' + byG[g].length + ' 个国家</s></h4>' +
          table(['排序', '预览', '国家', '副标题', '状态', '操作'], byG[g], function (r) {
            return '<td class="num nw">' + r.sort + '</td>' +
              '<td class="nw"><div class="hc-th sm"' +
              (r.img ? ' style="background-image:url(' + esc(r.img) + ')"' : '') + '></div></td>' +
              '<td class="nw"><b>' + esc(r.title) + '</b></td>' +
              '<td>' + esc(r.subtitle || '—') + '</td>' +
              '<td class="nw">' + onTag(r) + '</td>' +
              '<td class="nw">' + actCell(r) + '</td>';
          }, '该分组下没有国家');
      }).join('');
    } else {
      // 产品列表：有配置用配置，无配置展示当前自动展示的产品
      var autoProducts = j.auto_products || [];
      var emptyHint = '还没有配置热门产品，' + chName + '首页会按价格自动取前几条';

      // 有米特殊处理：展示当前自动展示的产品
      if (ch === 'youmi' && !list.length && autoProducts.length) {
        body = '<div class="note" style="margin-bottom:12px">' +
          '当前有米小程序自动展示以下<b>' + autoProducts.length + ' 个价格最低的产品</b>。' +
          '点击下方「新增低价优选」可以指定要展示的产品。</div>' +
          table(['序号', '产品名称', '结算价'], autoProducts, function (r, i) {
            return '<td class="num nw">' + (i + 1) + '</td>' +
              '<td style="min-width:260px"><b>' + esc(r.name || '—') + '</b>' +
              '<div class="hint mono">sup_product #' + r.id + '</div></td>' +
              '<td class="num nw">¥' + money(r.settle_price || 0) + '</td>';
          }, '');
      } else {
        body = table(['排序', '产品', '上架状态', '状态', '最近维护', '操作'],
          list, function (r) {
            return '<td class="num nw">' + r.sort + '</td>' +
              '<td style="min-width:260px"><b>' + esc(r.product_name || r.title || '—') + '</b>' +
              '<div class="hint mono">sup_product #' + esc(r.link_val || '') + '</div></td>' +
              '<td class="nw">' + (r[onKey] ? '<span class="tag ok">' + chName + '在售</span>' :
                '<span class="tag bad">已下架 / 未过审</span>' +
                '<div class="hint bad">' + chName + '首页不会展示</div>') + '</td>' +
              '<td class="nw">' + onTag(r) + '</td>' +
              '<td class="nw hint">' + esc(r.updated_by_name || '—') +
              '<div>' + d16(r.updated_at) + '</div></td>' +
              '<td class="nw">' + actCell(r) + '</td>';
          }, emptyHint);
      }
    }

    m.innerHTML = pageH(chName + '首页配置',
      (ch === 'youmi'
        ? '有米小程序签证频道首页的头图和低价优选产品在这里维护，保存即时生效。'
        : '签证频道首页的轮播图、热门国家、热门产品在这里维护，保存即时生效，不用发版。') +
      '停用的条目' + chName + '立刻不再展示；已下架或未过审的产品即使配了也不会推给客户。') +
      '<div class="subtabs big">' + HC_TABS.map(function (x) {
        return '<a data-hc="' + x[0] + '"' + (x[0] === tab ? ' class="on"' : '') + '>' + x[1] +
          '<i>' + tabCount(x[0]) + '</i></a>';
      }).join('') + '</div>' +
      '<div class="card"><div class="pad">' +
      '<div class="btns" style="margin-bottom:12px"><button class="btn r" data-add>新增' +
      HC_TABS.filter(function (x) { return x[0] === tab; })[0][1] + '</button>' +
      '<span class="hint" style="align-self:center;margin-left:8px">' +
      HC_TABS.filter(function (x) { return x[0] === tab; })[0][2] + '</span></div>' +
      body + '</div></div>';

    $$('[data-hc]', m).forEach(function (a) {
      a.onclick = function () { S.cache.hcTab = a.dataset.hc; reload(); };
    });

    function form(r) {
      r = r || {};
      var f = [];
      if (tab === 'banner') {
        f = [
          { k: 'title', label: '主标题', type: 'textarea', rows: 2, value: r.title || '',
            required: true, ph: '支持换行，如「去哪儿\n就办哪儿的签证」' },
          { k: 'subtitle', label: '副标题', value: r.subtitle || '', ph: '一行说明，可留空' },
          { type: 'html', html: '<div class="f"><span>头图 <i>*</i></span>' +
            imgField('hc-img', r.img || '',
              '建议 1200×675（16:9）以内、5MB 以下，支持 JPG/PNG') + '</div>' },
          { k: 'link_kind', label: '点击跳转', type: 'select', value: r.link_kind || 'none',
            options: Object.keys(HC_LINK).map(function (k) { return { v: k, t: HC_LINK[k] }; }) },
          { k: 'link_val', label: '跳转目标', value: r.link_val || '',
            hint: '跳国家列表页填国家名（如 日本）；跳产品详情页填产品编号；其余留空' }
        ];
      } else if (tab === 'country') {
        f = [
          { k: 'grp', label: '所属分组', type: 'select', value: r.grp || '热门',
            options: j.groups.map(function (g) { return { v: g, t: g }; }) },
          { k: 'title', label: '国家 / 地区', value: r.title || '', required: true,
            hint: 'C 端在售的有：' + (j.opt_country.join('、') || '暂无') +
              '。未在售的国家也可以配，前台显示为「覆盖中」灰卡' },
          { k: 'subtitle', label: '副标题', value: r.subtitle || '', ph: '如：东京 · 明治神宫' },
          { k: 'img', label: '图片地址', value: r.img || '', ph: 'img/dest/jp.jpg' }
        ];
      } else {
        f = [
          { k: 'link_val', label: '选择产品', type: 'select', value: r.link_val || '',
            required: true,
            options: j.opt_product.map(function (p) { return { v: String(p.id), t: p.name }; }) }
        ];
      }
      f.push({ k: 'sort', label: '排序号', value: r.sort != null ? r.sort : 99,
               hint: '数字越小越靠前，也可以保存后用 ↑↓ 调' });
      f.push({ k: 'active', label: '是否展示', type: 'select',
               value: r.active === 0 ? '0' : '1',
               options: [{ v: '1', t: '展示中' }, { v: '0', t: '停用' }] });
      return f;
    }

    function save(r) {
      var mo = ask((r ? '编辑' : '新增') + HC_TABS.filter(function (x) { return x[0] === tab; })[0][1],
        form(r), '保存', function (v) {
          var d = { channel: ch, kind: tab, sort: +v.sort || 0, active: v.active };
          ['title', 'subtitle', 'img', 'link_kind', 'link_val', 'grp'].forEach(function (k) {
            if (k in v) d[k] = v[k];
          });
          if (tab === 'banner') {
            d.img = imgRead(document, 'hc-img');
            if (!d.img) { toast('请上传头图', true); return Promise.reject({ shown: true }); }
          }
          if (tab === 'product') { d.link_kind = 'product'; d.title = ''; }
          if (tab === 'country') { d.link_kind = 'country'; d.link_val = v.title; }
          if (r) d.id = r.id;
          return api('/ops/home/save', d);
        });
      /* ask() 渲染完才有 DOM，下一帧再绑头图上传控件 */
      if (tab === 'banner') setTimeout(function () { imgBind(document); }, 0);
      return mo.then(function () { toast('已保存，' + chName + '立即生效'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
    }

    $('[data-add]', m).onclick = function () { save(null); };
    $$('[data-ed]', m).forEach(function (b) {
      b.onclick = function () {
        save(list.filter(function (x) { return x.id === +b.dataset.ed; })[0]);
      };
    });
    $$('[data-tg]', m).forEach(function (b) {
      b.onclick = function () {
        var r = list.filter(function (x) { return x.id === +b.dataset.tg; })[0];
        api('/ops/home/save', { id: r.id, channel: ch, kind: r.kind, title: r.title, subtitle: r.subtitle,
          img: r.img, link_kind: r.link_kind, link_val: r.link_val, grp: r.grp,
          sort: r.sort, active: r.active ? '0' : '1' })
          .then(function () { toast(r.active ? '已停用' : '已启用'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    $$('[data-mv]', m).forEach(function (b) {
      b.onclick = function () {
        api('/ops/home/sort', { id: +b.dataset.mv, dir: b.dataset.d })
          .then(function (r) { if (r.msg) toast(r.msg); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    $$('[data-rm]', m).forEach(function (b) {
      b.onclick = function () {
        var r = list.filter(function (x) { return x.id === +b.dataset.rm; })[0];
        confirmBox('删除「' + esc(r.title || r.product_name || '') + '」',
          '删除后' + chName + '首页立即不再展示该条目。如仅需临时下线，建议使用<b>停用</b>，可随时恢复。',
          '确认删除')
          .then(function () { return api('/ops/home/del', { id: r.id }); })
          .then(function () { toast('已删除'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
  });
}

// C 端首页配置
VIEWS['ops:homecfg'] = VIEWS['lead:homecfg'] = function (m) {
  return homeCfgView(m, 'c');
};

// 有米首页配置（2026-09-15 新增）
VIEWS['ops:homecfgym'] = VIEWS['lead:homecfgym'] = function (m) {
  return homeCfgView(m, 'youmi');
};
