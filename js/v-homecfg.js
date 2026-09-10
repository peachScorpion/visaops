/* ============================================================
   UOM · C 端签证频道首页配置（凯撒 PRD 4.12 手机客户端首页配置）
   唐美芳 2026-08-31：「签证频道首页配置确实可以来一个配置页，你直接补就行」。
   在此之前首页的头图、热门国家、热门产品全写死在 v-cust.js 里，
   运营想在旺季换个国家、挂张促销图都要改代码发版。
   三个页签对应 PRD 的 4.12.2 / 4.12.3 / 4.12.4。
   ============================================================ */

var HC_TABS = [
  ['banner', '首页轮播图', 'PRD 4.12.2'],
  ['country', '热门国家', 'PRD 4.12.3'],
  ['product', '热门产品', 'PRD 4.12.4']
];
var HC_LINK = { none: '不跳转', list: '全部目的地', country: '国家列表页', product: '产品详情页' };

VIEWS['ops:homecfg'] = VIEWS['lead:homecfg'] = function (m) {
  return api('/ops/home').then(function (j) {
    var tab = S.cache.hcTab || 'banner';
    var list = j[tab] || [];

    function actCell(r) {
      return '<div class="btns">' +
        '<button class="btn sm g" data-mv="' + r.id + '" data-d="up">↑</button>' +
        '<button class="btn sm g" data-mv="' + r.id + '" data-d="down">↓</button>' +
        '<button class="btn sm" data-ed="' + r.id + '">编辑</button>' +
        '<button class="btn sm g" data-tg="' + r.id + '">' + (r.active ? '停用' : '启用') + '</button>' +
        '<button class="btn sm g" data-rm="' + r.id + '">删除</button></div>';
    }
    function onTag(r) {
      return r.active ? '<span class="tag ok">展示中</span>' : '<span class="tag plain">已停用</span>';
    }
    function linkText(r) {
      return esc(HC_LINK[r.link_kind] || '不跳转') +
        (r.link_val ? '<div class="hint">' + esc(r.link_val) + '</div>' : '');
    }

    var body;
    if (tab === 'banner') {
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
      body = table(['排序', '产品', '上架状态', '状态', '最近维护', '操作'],
        list, function (r) {
          return '<td class="num nw">' + r.sort + '</td>' +
            '<td style="min-width:260px"><b>' + esc(r.product_name || r.title || '—') + '</b>' +
            '<div class="hint mono">sup_product #' + esc(r.link_val || '') + '</div></td>' +
            '<td class="nw">' + (r.on_c ? '<span class="tag ok">C 端在售</span>' :
              '<span class="tag bad">已下架 / 未过审</span>' +
              '<div class="hint bad">C 端首页不会展示</div>') + '</td>' +
            '<td class="nw">' + onTag(r) + '</td>' +
            '<td class="nw hint">' + esc(r.updated_by_name || '—') +
            '<div>' + d16(r.updated_at) + '</div></td>' +
            '<td class="nw">' + actCell(r) + '</td>';
        }, '还没有配置热门产品，C 端首页会按价格自动取前四条');
    }

    m.innerHTML = pageH('C 端首页配置',
      '签证频道首页的轮播图、热门国家、热门产品在这里维护，保存即时生效，不用发版。' +
      '停用的条目 C 端立刻不再展示；已下架或未过审的产品即使配了也不会推给客户。') +
      '<div class="subtabs big">' + HC_TABS.map(function (x) {
        return '<a data-hc="' + x[0] + '"' + (x[0] === tab ? ' class="on"' : '') + '>' + x[1] +
          '<i>' + (j[x[0]] || []).length + '</i></a>';
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
          { k: 'img', label: '图片地址', value: r.img || '', required: true,
            ph: 'img/dest/uk2.jpg 或完整 URL' },
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
      return ask((r ? '编辑' : '新增') + HC_TABS.filter(function (x) { return x[0] === tab; })[0][1],
        form(r), '保存', function (v) {
          var d = { kind: tab, sort: +v.sort || 0, active: v.active };
          ['title', 'subtitle', 'img', 'link_kind', 'link_val', 'grp'].forEach(function (k) {
            if (k in v) d[k] = v[k];
          });
          if (tab === 'product') { d.link_kind = 'product'; d.title = ''; }
          if (tab === 'country') { d.link_kind = 'country'; d.link_val = v.title; }
          if (r) d.id = r.id;
          return api('/ops/home/save', d);
        }).then(function () { toast('已保存，C 端立即生效'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
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
        api('/ops/home/save', { id: r.id, kind: r.kind, title: r.title, subtitle: r.subtitle,
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
          '删除后 C 端首页立即不再展示该条目。如仅需临时下线，建议使用<b>停用</b>，可随时恢复。',
          '确认删除')
          .then(function () { return api('/ops/home/del', { id: r.id }); })
          .then(function () { toast('已删除'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
  });
};
