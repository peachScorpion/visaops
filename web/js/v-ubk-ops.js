/* C6 供应商（UBK 供应商门户） / UOM 运营平台 · 平台配置身份 */

var CROWD_T = { job: '在职人员', free: '自由职业', student: '在校学生', retire: '退休人员', child: '学龄前儿童' };
/* 省份兜底：/sup/catalog 拿不到时用它，免得控件整块空掉。真源在后端 PROVINCES */
var PROV_FALLBACK = ['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
  '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东',
  '广西', '海南', '重庆', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏',
  '新疆', '香港', '澳门', '台湾'];
var CROWD_S = { job: '在职', free: '自由职业', student: '学生', retire: '退休', child: '儿童' };
var WAY_T = { mail: '邮寄/自送', upload: '电子上传', carry: '面试携带' };
var MODE_T = { origin: '沿用基础结算价', percent: '百分比加价', fixed: '固定加价' };

function yn(v) { return v ? '<span class="tag ok">是</span>' : '<span class="tag plain">否</span>'; }
function tagStatus(s) {
  return s === 'published' ? '<span class="tag ok">已上架</span>' : '<span class="tag plain">草稿</span>';
}

/* ================= 供应商：收料地址 ================= */
function ubkAddrs(m) {
  return api('/sup/addrs').then(function (j) {
    m.innerHTML = pageH('收货地址管理',
      '<b>客户寄送纸质材料的收件地址</b>——即贵司负责接收签证材料的办公地点。' +
      '客户下单后，客户端「材料寄送」卡片上显示的收件人、电话、地址，以及办完签把护照寄回时的寄件方地址，' +
      '均取自此处。<b>新增产品时必须绑定收件地址</b>，否则客户无法确认材料寄送目的地。' +
      '如需按城市分别收件，可建立多条地址，并指定其中一条为默认地址。',
      '<button class="btn p" data-new>新建</button>') +
      card('地址列表 <span>' + j.list.length + ' 个</span>', '<div class="pad">' + table(
        ['所在地区', '详细地址', '联系人', '联系电话', '默认', '操作'], j.list, function (a) {
          return '<td>' + esc(a.region) + '</td><td><b>' + esc(a.detail) + '</b></td><td>' + esc(a.contact) +
            '</td><td class="mono">' + esc(a.phone) + '</td><td>' +
            (a.is_default ? '<span class="tag ok">默认</span>' : '—') +
            '</td><td><button class="btn sm" data-e=\'' + jattr(a) + '\'>编辑</button> ' +
            '<button class="btn sm r" data-d="' + a.id + '">删除</button></td>';
        }, '尚未维护材料收件地址，请先新增') + '</div>');

    function form(a) {
      return ask(a ? '编辑材料收件地址' : '新增材料收件地址', [
        { k: 'region', label: '所在城市/地区', required: true, value: a && a.region, ph: '北京市朝阳区' },
        { k: 'detail', label: '详细地址', required: true, value: a && a.detail, ph: '东三环北路甲2号 XX大厦 18层 签证收料部' },
        { k: 'contact', label: '收件联系人', required: true, value: a && a.contact },
        { k: 'phone', label: '联系电话', required: true, value: a && a.phone },
        { k: 'is_default', label: '设为默认地址', type: 'select', value: a ? String(a.is_default) : '0', options: [{ v: '1', t: '是' }, { v: '0', t: '否' }] }
      ], '保存', function (f) {
        return api('/sup/addr/save', {
          id: a && a.id, region: f.region, detail: f.detail, contact: f.contact,
          phone: f.phone, is_default: f.is_default === '1'
        });
      }).then(function () { toast('已保存'); reload(); }).catch(function () { /* 失败已提示，弹窗保留 */ });
    }
    $('[data-new]', m).onclick = function () { form(null); };
    $$('[data-e]', m).forEach(function (b) { b.onclick = function () { form(JSON.parse(b.dataset.e)); }; });
    $$('[data-d]', m).forEach(function (b) {
      b.onclick = function () {
        confirmBox('删除材料收件地址', '删除不影响历史订单已记录的地址。已被产品引用的地址不可删除。', '删除')
          .then(function () { return api('/sup/addr/del', { id: +b.dataset.d }); })
          .then(function () { toast('已删除'); reload(); }).catch(function () { /* 失败已提示，弹窗保留 */ });
      };
    });
  });
};

/* 服务保障：C 端详情页顶部那条保障栏的数据来源。
   免面签由系统按签证属性自动推，平台能力（电子材料上传等）全平台一致，
   供应商能自己决定的只有这一格——而且只能从平台预置项里勾，不能自由输入：
   这是对客承诺，写「保证出签」这种话兑现不了要担责。 */
var UBK_SVC = { opts: [], fixed: [] };
function svcField(j, cur) {
  UBK_SVC.opts = j.svc_opts || UBK_SVC.opts;
  UBK_SVC.fixed = j.svc_fixed || UBK_SVC.fixed;
  cur = cur || [];
  return '<label class="f" style="margin-top:4px"><span>服务保障</span><div class="scope wrap">' +
    UBK_SVC.opts.map(function (t) {
      return '<label class="chk sm"><input type="checkbox" data-svc="' + esc(t) + '"' +
        (cur.indexOf(t) >= 0 ? ' checked' : '') + '><b>' + esc(t) + '</b></label>';
    }).join('') + '</div><div class="hint">勾选项将展示于客户端产品详情页顶部。' +
    '「免面签」由系统按签证属性自动带出，' +
    UBK_SVC.fixed.join('、') + ' 由平台统一提供，无需在此勾选</div></label>';
}
function svcRead(m) {
  return $$('[data-svc]', m).filter(function (b) { return b.checked; })
    .map(function (b) { return b.dataset.svc; });
}

/* ---------------------------------------------------------------
   「产品信息」表单：新增产品第 2 步和编辑产品页共用同一份。
   唐美芳 2026-08-31：「ubk 里编辑产品信息和编辑套餐信息，为什么不继续沿用
   创建流程的页面呢，现在编辑产品信息还是弹窗」。
   原来编辑走 ask() 弹窗，字段、顺序、说明文案都跟创建时那张表对不上，
   同一件事要在两种界面里学两遍。现在两处都渲染这个函数，改一处两处一起变。

   v  ：当前值 { suffix, vendor_code, addr_id, feature, svc_tags, to_c, fullver_id }
   o.p：编辑态传产品对象，用来算哪些字段被审核/在售锁住；新增时不传
   o.fv：true 表示带上「材料清单版本」——它在新增流程里属于第 1 步，
         编辑时没有第 1 步，得挂到这张表上，否则换版本只能删了重建。
   --------------------------------------------------------------- */
/* 平台默认办理流程：跟 C 端 v-cust.js 的 FLOW 一致，供应商没配时用它 */
var FLOW_DEFAULT = [
  { t: '下单办理', d: '填写办签信息并完成付款' },
  { t: '准备资料', d: '按清单交材料、填申请表' },
  { t: '资料审核', d: '专员复核后递交使领馆' },
  { t: '出签配还', d: '出结果并寄回护照与资料' },
  { t: '出发', d: '按行程出行' }
];
function flwRow(i, t, d) {
  return '<div class="flw-r"><i>' + (i + 1) + '</i>' +
    '<input data-flw="t" value="' + esc(t || '') + '" placeholder="步骤名，如：递交使领馆">' +
    '<input data-flw="d" value="' + esc(d || '') + '" placeholder="该步骤的说明（选填）">' +
    '<a data-flw-del title="删除这一步">×</a></div>';
}
/* 读取与绑定：DOM 顺序即步骤顺序，不另存 sort */
function flwRead(scope) {
  return $$('#w-flow .flw-r', scope).map(function (r) {
    return { t: ($('[data-flw=t]', r) || {}).value.trim(),
             d: ($('[data-flw=d]', r) || {}).value.trim() };
  }).filter(function (x) { return x.t; });
}
function flwBind(scope) {
  var box = $('#w-flow', scope);
  if (!box) return;
  var renum = function () {
    $$('.flw-r i', box).forEach(function (el, i) { el.textContent = i + 1; });
  };
  var bindDel = function () {
    $$('[data-flw-del]', box).forEach(function (a) {
      a.onclick = function () {
        if ($$('.flw-r', box).length <= 1) return toast('至少保留一个步骤', true);
        a.closest('.flw-r').remove(); renum();
      };
    });
  };
  bindDel();
  var add = $('[data-flw-add]', scope);
  if (add) add.onclick = function () {
    if ($$('.flw-r', box).length >= 8) return toast('最多 8 个步骤', true);
    box.insertAdjacentHTML('beforeend', flwRow($$('.flw-r', box).length, '', ''));
    bindDel(); renum();
  };
  var rst = $('[data-flw-reset]', scope);
  if (rst) rst.onclick = function () {
    box.innerHTML = FLOW_DEFAULT.map(function (x, i) { return flwRow(i, x.t, x.d); }).join('');
    bindDel();
  };
}

function prodFields(j, v, o) {
  o = o || {}; v = v || {};
  var p = o.p, lock = [];
  function can(k) { return !p || pol(p, k); }
  function lk(k, label) {
    if (can(k)) return '';
    lock.push('<b>' + esc(label) + '</b>：' + esc(POL_WHY[k]));
    return ' disabled';
  }
  /* 锁住的字段除了灰掉，标题上还挂一个「锁定」小标——只灰掉容易被当成样式差异，
     跟套餐表单的 .pk-lock 是同一套观感 */
  function lkTag(k) { return can(k) ? '' : ' <em class="f-lock">锁定</em>'; }
  var addrs = j.addrs || UBK_ADDRS || [];
  var html =
    '<div class="fgrid">' +
    /* o.name === false：新增产品页把这一项挪到了「签证属性」卡里的签证名称下面，
       这里就不再渲染，免得同一个 id 在页面上出现两次。 */
    (o.name === false ? '' :
    '<label class="f"><span>自定义名称后缀' + lkTag('name') + '</span><input id="w-suffix" value="' + esc(v.suffix || '') +
    '" placeholder="如：加急/免面签代办"' + lk('name', '自定义名称后缀') +
    '><div class="hint">最终产品名 = <b id="w-basename">' +
    esc(o.baseName || '送签地 + 国家 + 签证名称') + '</b> + 后缀</div></label>') +
    /* 自有编码不受 pol 约束：只是对码备注，不影响客户看到的内容也不影响履约 */
    '<label class="f"><span>供应商自有产品编码</span><input id="w-vcode" value="' + esc(v.vendor_code || '') +
    '" placeholder="选填，如 UND-0108"><div class="hint">供应商自有系统中该产品的编码。' +
    '填写后将在产品列表、产品详情与对账单中一并展示，便于双方按编码核对。' +
    '平台另行分配 Q 字头编码，两套编码并存互不影响，在售期间可修改</div></label>' +
    '<label class="f"><span>材料收件地址 <i>*</i>' + lkTag('addr') + '</span><select id="w-addr"' + lk('addr', '材料收件地址') + '>' +
    addrs.map(function (a) {
      return '<option value="' + a.id + '"' +
        (v.addr_id == a.id || (!v.addr_id && a.is_default) ? ' selected' : '') +
        '>' + esc(a.region + ' ' + a.detail) + '</option>';
    }).join('') + '</select><div class="hint">客户寄送护照原件的收件地址。' +
    '如无可选项，请先在「收货地址管理」中新增</div></label>' +
    (o.fv
      ? '<label class="f"><span>材料清单版本' + lkTag('addr') + '</span><select id="w-fv"' + lk('addr', '材料清单版本') + '>' +
        '<option value="">— 未绑定 —</option>' +
        (UBK_FVS || []).filter(function (f) { return !o.country || f.country === o.country; })
          .map(function (f) {
            return '<option value="' + f.id + '"' + (v.fullver_id == f.id ? ' selected' : '') +
              '>' + esc(f.ver_no + ' · ' + f.name) + '</option>';
          }).join('') + '</select><div class="hint">仅列出该目的国已发布的版本。' +
        '变更版本仅对新订单生效，已下单客户按下单时的清单快照执行。</div>' +
        /* 编辑页也要能当场去建一份新版本再回来选（唐美芳 2026-09-07） */
        '<div class="flw-op" style="margin-top:8px">' +
        '<button type="button" class="btn sm" data-fvgo>去国家送签材料库创建</button>' +
        '<button type="button" class="btn sm" data-fvrf>刷新列表</button></div></label>'
      : '') +
    '</div>' +
    /* 产品头图：客户端产品详情页顶部那张大图。原来是按国家写死的一张风景照，
       供应商传不了自己的图（唐美芳 2026-09-01 验收指出）。不传仍回落到国家默认图。 */
    '<label class="f"><span>产品头图</span>' +
    imgField('w-hero', v.hero_img || '',
      '客户端产品详情页顶部的大图，建议 1200×675（16:9）以内、5MB 以下。' +
      '未上传时展示该国家的默认图片。') + '</label>' +
    '<label class="f"><span>产品特色' + lkTag('feature') + '</span><textarea id="w-feature" rows="3"' + lk('feature', '产品特色') +
    ' placeholder="如：北京领区直送，专人陪同面签，材料预审 1 个工作日出结果">' +
    esc(v.feature || '') + '</textarea></label>' +
    svcField(j, v.svc_tags) +
    /* 办理流程：不同签证的流程本来就不一样——电子签没有面签、日本递交纸质表、
       EVUS 是登记不是签证。原来这是前端写死的 5 步常量，四个页面共用一份
       （唐美芳 2026-09-01：「我感觉少一个办理流程的配置」）。
       留空则回落到平台默认 5 步，老产品不受影响。 */
    '<label class="f" style="margin-top:4px"><span>办理流程' + lkTag('feature') + '</span>' +
    '<div class="flw" id="w-flow">' +
    (v.flow && v.flow.length ? v.flow : FLOW_DEFAULT).map(function (x, i) {
      return flwRow(i, x.t, x.d);
    }).join('') + '</div>' +
    '<div class="flw-op"><button type="button" class="btn sm" data-flw-add>+ 添加步骤</button>' +
    '<button type="button" class="btn sm" data-flw-reset>恢复平台默认</button></div>' +
    '<div class="hint">客户端产品详情页展示的办理步骤。留空则展示平台默认流程；' +
    '最多 8 步，步骤名 20 字以内</div></label>' +
    /* 受理居住地范围与受理说明落在平台目录产品上（唐美芳 2026-09-04）。
       新增向导第一步已经问过一次（那里在录签证属性），所以向导第二步传 accept:false
       把这两项关掉——同一个流程里问两遍同一件事，填的人只会怀疑自己填错了地方。 */
    (o.accept === false ? '' :
    /* 外层用 div 不用 label：provBox 内部是一堆 <label>，label 不能嵌套 label */
    '<div class="f" style="margin-top:4px"><span>受理居住地范围' + lkTag('scope') + '</span>' +
    provBox('w-prov', v.accept_provinces, (j.provinces || PROV_FALLBACK), lk('scope', '受理居住地范围')) +
    '<div class="hint">限定本产品受理的申请人<b>居住地</b>；不作限定请勾选「全国受理」。' +
    '日本、韩国等按居住地领区受理的目的国，须按实际领区划分选择。' +
    '本项属于平台目录产品的公共属性，修改后对经营该条签证的全部供应商生效。</div></div>' +
    '<div class="f" style="margin-top:4px"><span>受理范围说明' + lkTag('scope') + '</span>' +
    richHtml('w-note', v.accept_note || '',
      '北京领区受理，需北京户籍或居住证；军人、现役警察请提前联系客服') +
    '<div class="hint">上方为受理居住地范围，此处填写附加受理条件（户籍、居住证、特殊人群等）。' +
    '可加粗、分条排版。</div></div>') +
    '<div class="f" style="margin-top:4px"><span>上架范围 <i>*</i>' + lkTag('scope') + '</span><div class="scope">' +
    '<label class="chk on"><input type="checkbox" checked disabled><b>B 端 · CSP 门店销售/同业</b>' +
    '<i>默认上架，不可取消。CSP 为众信自有销售渠道，产品上架后即进入其产品预订中心。</i></label>' +
    '<label class="chk"><input type="checkbox" id="w-toc"' + (v.to_c ? ' checked' : '') +
    lk('scope', '上架范围') + '><b>C 端 · 客户小程序</b>' +
    '<i>勾选后该产品同时面向终端客户直售；未勾选则仅通过门店与同业渠道销售。</i></label>' +
    '</div></div>';
  /* 锁住的字段不从表单里消失，就地灰掉、底下说明为什么——藏了供应商会以为没这功能 */
  if (lock.length) {
    html += '<div class="note b" style="margin-top:12px"><b>置灰字段当前不可修改</b>' +
      '<div class="hint">' + lock.join('<br>') + '</div></div>';
  }
  return html;
}
/* 与 prodFields 成对：把表单读回一个对象 */
function prodRead(m, o) {
  o = o || {};
  var g = function (id) { var e = $(id, m); return e ? e.value.trim() : undefined; };
  var d = {};
  if (g('#w-suffix') !== undefined) d.name_suffix = g('#w-suffix');
  if (g('#w-vcode') !== undefined) d.vendor_code = g('#w-vcode');
  if (g('#w-addr')) d.addr_id = +g('#w-addr');
  if (o.fv && $('#w-fv', m) && g('#w-fv')) d.fullver_id = +g('#w-fv');
  if (g('#w-feature') !== undefined) d.feature = g('#w-feature');
  d.svc_tags = svcRead(m);
  var toc = $('#w-toc', m);
  if (toc) { d.to_b = 1; d.to_c = toc.checked ? 1 : 0; }
  if ($('#w-flow', m)) d.flow = flwRead(m);
  var pv = provRead(m, 'w-prov');
  if (pv !== undefined) d.accept_provinces = pv;
  if ($('[data-rt="w-note"]', m)) d.accept_note = richRead(m, 'w-note');
  if ($('[data-imf="w-hero"]', m)) d.hero_img = imgRead(m, 'w-hero');
  return d;
}

/* 建产品。两个入口共用：第 3 步录完报价提交，和第 2 步「先保存，稍后录报价」。
   后者传空数组——后端已允许套餐留空（唐美芳 2026-09-04），产品照样建出来，
   只是完整度会标「缺套餐报价」，补齐前不能提交上架。 */
function submitWiz(W, pkgs) {
  return api('/sup/product/create', {
    visa: W.visa, name_suffix: W.suffix, vendor_code: W.vendor_code || '',
    feature: W.feature, svc_tags: W.svc_tags || [], flow: W.flow || [],
    hero_img: W.hero_img || '',
    addr_id: W.addr_id, fullver_id: W.fullver_id, to_c: W.to_c, packages: pkgs || []
  }).then(function (r) {
    toast(r && r.no_pkg
      ? '产品已创建。还差套餐报价，在产品列表点「套餐与报价」补齐后即可提交上架'
      : '已生成草稿，去「签证产品管理」确认后上架');
    S.cache.wiz = null;
    S.cache['tab:ubkprod'] = 'all';
    go('products');
  }).catch(function () { /* 失败已提示，弹窗保留 */ });
}

/* ================= 供应商：新增产品（三步） ================= */
/* 「送签材料清单」筛选项：值取版本号（唯一键），标签给名称 + 版本号。
   两端产品管理共用一份，材料库列表点「关联签证产品」跳过来时填的就是这个值。 */
function fvOpts(list) {
  var seen = {}, out = [];
  (list || []).forEach(function (p) {
    if (p.fullver && !seen[p.fullver]) {
      seen[p.fullver] = 1;
      out.push([p.fullver, (p.fullver_name || p.fullver) + '（' + p.fullver + '）']);
    }
  });
  return out.sort(function (a, b) { return a[1] > b[1] ? 1 : -1; });
}

VIEWS['ubk:create'] = function (m) {
  var W = S.cache.wiz = S.cache.wiz || { step: 1, pkgs: [] };
  if (W.step > 1 && !W.visa) { W.step = 1; }
  return api('/sup/catalog').then(function (j) {
    /* 2026-09-04 唐美芳：「新增产品的时候，签证属性、填收件地址与上架范围有可能合并吗」。
       合并了：原来的第一、二步都是「这条产品是什么」，拆成两屏只是多一次翻页，
       填的人还得记住上一屏填过什么。套餐报价单独留一步——它是另一件事（定价），
       而且常常要等采购谈完才有，所以那一步允许跳过。 */
    function wiz(n) {
      return '<div class="wiz">' + [['1', '填产品信息与材料清单'], ['2', '录套餐报价']]
        .map(function (s, i) {
          var k = i + 1;
          return '<div class="' + (k === n ? 'on' : (k < n ? 'done' : '')) + '"><i>' + (k < n ? '✓' : s[0]) + '</i>' + s[1] + '</div>';
        }).join('') + '</div>';
    }
    var head = pageH('新增产品',
      '第一步录入签证属性、材料清单版本、产品名称、收件地址与上架范围，第二步录入套餐报价。' +
      '系统会按「国家 + 签证类型 + 送签地」自动将该条签证登记进平台产品目录——' +
      '同一条签证已有其他供应商经营时自动复用，不会重复创建。');

    /* ---- 第 1 步 ---- */
    if (W.step === 1) {
      var V = W.visa || {};
      var fvOpt = function (country) {
        return j.fullvers.filter(function (f) { return !country || f.country === country; });
      };
      m.innerHTML = head + wiz(1) +
        card('签证属性 <span>用于确定客户端展示的产品参数及其在平台目录中的归属</span>',
          '<div class="pad"><div class="fgrid">' +
          '<label class="f"><span>国家 / 目的地 <i>*</i></span><input id="v-country" list="v-clist" value="' + esc(V.country || '') + '" placeholder="美国"><datalist id="v-clist">' +
          Object.keys(j.list.reduce(function (o, p) { o[p.country] = 1; return o; }, {})).map(function (x) {
            return '<option value="' + esc(x) + '">';
          }).join('') + '</datalist><div class="hint">已有国家可直接选择，新国家可直接录入</div></label>' +
          /* 签证类型受控下拉；签证名称仍是自由文本——见 core.js VISA_CATS 处注释 */
          '<label class="f"><span>签证类型 <i>*</i></span><select id="v-cat"><option value="">— 请选择 —</option>' +
          (j.visa_cats || VISA_CATS).map(function (x) {
            return '<option value="' + esc(x) + '"' + (V.visa_cat === x ? ' selected' : '') + '>' + esc(x) + '</option>';
          }).join('') + '</select><div class="hint">客户按此归类检索签证，同时作为平台统计口径，仅可从既定类别中选择</div></label>' +
          '<label class="f"><span>签证名称 <i>*</i></span><input id="v-type" value="' + esc(V.visa_type || '') + '" placeholder="个人旅游签证（B1/B2）"><div class="hint">填写签证的官方名称，即客户端产品页展示的名称；「国家 + 签证名称 + 送签地」在平台目录中唯一确定一条签证</div></label>' +
          '<label class="f"><span>送签地 <i>*</i></span><input id="v-city" value="' + esc(V.submit_city || '') + '" placeholder="北京送签"><div class="hint">领区不同则材料要求与预约规则不同，须分别建立</div></label>' +
          /* 名称后缀原来在下面的「产品信息」卡里，跟签证名称隔了半屏
             （唐美芳 2026-09-07：「能不能签证名称和产品名称在一起呢，你为什么要把他们分开呢」）。
             产品名 = 送签地 + 国家 + 签证名称 + 后缀，本来就是一件事，摆一起才看得出拼出来是什么。 */
          '<label class="f"><span>自定义名称后缀</span><input id="w-suffix" value="' +
          esc(W.suffix || '') + '" placeholder="如：加急 / 免面签代办">' +
          '<div class="hint">最终产品名 = <b id="w-basename">送签地 + 国家 + 签证名称</b> + 后缀' +
          '<div id="w-fullname" class="fullname"></div></div></label>' +
          /* 单位补上「个月」（唐美芳 2026-09-07）：半年多次、3 个月单次这类产品，
             按天写成 90 天不像话、按年又写不出来，供应商只能填个近似值。 */
          '<label class="f"><span>有效期</span><div class="inline2">' +
          '<input id="v-vnum" type="number" min="0" value="' + (V.valid_num || 10) + '">' +
          '<select id="v-vtype">' +
          ['year', 'month', 'day'].map(function (u) {
            return '<option value="' + u + '"' +
              ((V.valid_type || 'year') === u ? ' selected' : '') + '>' + VALID_UNIT[u] + '</option>';
          }).join('') + '</select></div></label>' +
          '<label class="f"><span>入境次数</span><select id="v-entries">' +
          [['single', '单次'], ['double', '两次'], ['multi', '多次']].map(function (e) {
            return '<option value="' + e[0] + '"' + (V.entries === e[0] ? ' selected' : '') + '>' + e[1] + '</option>';
          }).join('') + '</select></label>' +
          /* 停留期是区间 + 单位（唐美芳 2026-08-31）。签证实际很少是一个整数：
             申根写「每 180 天内累计不超过 90 天」，澳洲 600 常见 3/6/12 个月三档。
             两个数填一样就是单值，页面上会显示成「90 天」而不是「90–90 天」。 */
          '<label class="f"><span>单次停留期</span><div class="inline3">' +
          '<input id="v-stmin" type="number" min="0" value="' + (V.stay_min != null ? V.stay_min : (V.stay_days || 180)) + '" placeholder="最少">' +
          '<span class="sep">至</span>' +
          '<input id="v-stmax" type="number" min="0" value="' + (V.stay_max != null ? V.stay_max : (V.stay_days || 180)) + '" placeholder="最多">' +
          '<select id="v-stunit">' +
          [['day', '天'], ['month', '个月'], ['year', '年']].map(function (u) {
            return '<option value="' + u[0] + '"' + ((V.stay_unit || 'day') === u[0] ? ' selected' : '') + '>' + u[1] + '</option>';
          }).join('') + '</select></div>' +
          '<div class="hint">如无区间，两栏填写相同数值，页面仅展示一个值</div></label>' +
          '<label class="f"><span>是否需要面签</span><select id="v-int"><option value="1"' + (V.need_interview !== 0 ? ' selected' : '') + '>需面签</option><option value="0"' + (V.need_interview === 0 ? ' selected' : '') + '>免面签</option></select>' +
          '<div class="hint"><b>本项用于确定材料清单中原件的提交方式</b>：需面签的按' +
          '「面试携带」下发（申请人本人带原件到使领馆）；<b>免面签的按「邮寄 / 自送」下发</b>' +
          '（护照原件须交至指定网点或由快递上门取件，属于寄交原件）。<br>' +
          '<b class="bad">免面签资格条件各国收紧频繁</b>（如美签自 2025 年 10 月起' +
          '将续签时限由 48 个月缩短至 12 个月），请以使领馆最新公告为准，' +
          '并在下方「受理范围说明」中写明具体条件。</div></label>' +
          '<label class="f"><span>是否需要录指纹</span><select id="v-fp"><option value="1"' + (V.need_fingerprint !== 0 ? ' selected' : '') + '>需录指纹</option><option value="0"' + (V.need_fingerprint === 0 ? ' selected' : '') + '>不需要</option></select></label>' +
          /* 受理范围说明改多行（唐美芳 2026-08-31：「受理范围说明支持换行、空格」）。
             领区受理条件常常是分条的：户籍要求一条、居住证一条、特殊人群一条，
             挤在单行输入框里既写不下也读不了。展示侧用 white-space:pre-wrap 保留原样。 */
          /* ⚠️ 外层必须是 div 不能是 label：provBox 内部全是 <label>，
             HTML 不允许 label 嵌套 label，浏览器会把内层拆出去、整块布局散掉
             （2026-09-04 她截图反馈「这个页面怎么这样了」，就是这个原因）。 */
          '</div><div class="f"><span>受理居住地范围</span>' +
          provBox('v-prov', V.accept_provinces, j.provinces) +
          '<div class="hint">限定本产品受理的申请人<b>居住地</b>；不作限定请勾选「全国受理」。' +
          '日本、韩国等按居住地领区受理的目的国，须按实际领区划分选择，' +
          '否则申请人虽已下单亦无法受理。所选范围将在客户端与门店下单页展示。</div></div>' +
          /* 富文本（唐美芳 2026-09-07）：领区受理条件常常要分条、要加粗重点，
             纯文本框排不出版；产出的 HTML 由服务端 clean_rich() 白名单过滤后入库。 */
          '<div class="f"><span>受理范围说明</span>' +
          richHtml('v-note', V.accept_note || '',
            '北京领区受理，需北京户籍或居住证；军人、现役警察请提前联系客服') +
          '<div class="hint">上方为受理居住地范围，此处填写附加受理条件（户籍、居住证、特殊人群等）。' +
          '可加粗、分条排版，客户端按此排版展示。</div></div></div>') +
        card('材料清单 <span>用于确定客户须提交的材料范围，须选择一个已发布的清单版本</span>',
          '<div class="pad"><label class="f"><span>使用的国家送签材料库 <i>*</i></span><select id="v-fv">' +
          '<option value="">— 请选择 —</option>' +
          j.fullvers.map(function (f) {
            return '<option value="' + f.id + '" data-c="' + esc(f.country) + '"' + (W.fullver_id == f.id ? ' selected' : '') +
              '>' + (f.owner_org ? '［本公司自建］' : '［平台统一］') +
              esc(f.country + ' · ' + f.ver_no + ' · ' + f.name) + '（' + f.items + ' 项）</option>';
          }).join('') + '</select><div class="hint">' +
          '<b>［平台统一］</b>由众信运营统一维护，可直接选用；' +
          '<b>［本公司自建］</b>为贵司在「国家送签材料库」中创建并发布的版本，仅可用于贵司产品。' +
          '清单内容由所选版本统一确定，供应商不可针对单条产品增减材料；' +
          '收料要求与平台不一致的，请在「国家送签材料库」中对该版本执行「复制新版」，' +
          '修改并发布后在此改选。已下单客户按下单时的清单快照执行，后续调整对其不生效。</div></label>' +
          /* 2026-09-07 唐美芳：「材料清单 ubk 不允许调整平台统一的产品清单，
             所以调整本产品清单的入口不应该保留」。整块撤掉——
             供应商要另一套收料口径，走「国家送签材料库」复制新版，那是版本级的事，
             有归属、有发布状态、运营也看得见；单产品定制那条路两边口径会悄悄分叉。 */
          /* 没有合适版本时要能当场去建一份，而不是被这个必填项卡住
             （唐美芳 2026-09-07：「本身如果没有想要的模板，就自己创建完了，再重新回来选择，
             所以国家送签材料库下拉的时候数据得实时更新」）。 */
          '<div class="flw-op" style="margin-top:8px">' +
          '<button type="button" class="btn sm" data-fvgo>去国家送签材料库创建</button>' +
          '<button type="button" class="btn sm" data-fvrf>刷新列表</button></div>' +
          (j.fullvers.length ? '' : '<div class="note b">当前无可选的清单版本。' +
            '请点击上方「去国家送签材料库创建」新建并发布，' +
            '或联系众信运营发布该目的国的平台统一版本。</div>') +
          '</div>') +
        /* 产品信息原来是独立的第二步，2026-09-04 并进来：两屏填的都是「这条产品是什么」 */
        card('产品信息 <span>名称后缀、收件地址、上架范围与对客展示内容</span>',
          '<div class="pad">' +
          prodFields(j, {
            suffix: W.suffix, vendor_code: W.vendor_code, addr_id: W.addr_id,
            feature: W.feature, svc_tags: W.svc_tags, to_c: W.to_c, flow: W.flow,
            hero_img: W.hero_img
          }, { accept: false, name: false }) +
          '<div style="margin-top:14px"><button class="btn p" data-next>下一步：录套餐报价</button> ' +
          '<button class="btn" data-draft>仅保存基础信息</button>' +
          '<div class="hint" style="margin-top:8px">选择「仅保存基础信息」后产品即创建完成，' +
          '产品列表的完整度将标注尚缺套餐报价；报价补齐后方可提交上架审核。</div></div>');

      provBind(m, 'v-prov');

      /* 跳去材料库之前，把这一屏已经填的东西尽量存进 W（不校验），回来才不用重填 */
      function softSave() {
        var g = function (id) { return (($(id, m) || {}).value || '').trim(); };
        W.visa = {
          country: g('#v-country'), visa_type: g('#v-type'),
          visa_cat: g('#v-cat'), submit_city: g('#v-city'),
          valid_type: g('#v-vtype'), valid_num: +g('#v-vnum') || 0,
          entries: g('#v-entries'),
          stay_min: +g('#v-stmin') || 0, stay_max: +g('#v-stmax') || 0,
          stay_unit: g('#v-stunit') || 'day',
          need_interview: g('#v-int') === '1' ? 1 : 0,
          need_fingerprint: g('#v-fp') === '1' ? 1 : 0,
          accept_note: richRead(m, 'v-note'),
          accept_provinces: provRead(m, 'v-prov') || []
        };
        W.fullver_id = +g('#v-fv') || W.fullver_id;
        var d = prodRead(m);
        W.suffix = g('#w-suffix');
        W.vendor_code = d.vendor_code;
        W.feature = d.feature;
        W.svc_tags = d.svc_tags;
        W.addr_id = d.addr_id;
        W.to_c = d.to_c;
        W.flow = d.flow;
        W.hero_img = d.hero_img;
      }
      function gotoFv() {
        softSave();
        /* 记下来路，材料库页面顶部会出现「返回新增产品」 */
        S.cache.fvFrom = 'create';
        go('fullvers');
      }
      $('[data-fvgo]', m).onclick = gotoFv;
      /* 刷新只重建下拉，不整页 reload——整页重来会把这一屏填的内容清掉 */
      $('[data-fvrf]', m).onclick = function () {
        return api('/sup/catalog').then(function (j2) {
          var sel = $('#v-fv', m);
          var cur = sel.value;
          sel.innerHTML = '<option value="">— 请选择 —</option>' +
            (j2.fullvers || []).map(function (f) {
              return '<option value="' + f.id + '" data-c="' + esc(f.country) + '"' +
                (String(cur) === String(f.id) ? ' selected' : '') + '>' +
                (f.owner_org ? '［本公司自建］' : '［平台统一］') +
                esc(f.country + ' · ' + f.ver_no + ' · ' + f.name) + '（' + f.items + ' 项）</option>';
            }).join('');
          j.fullvers = j2.fullvers || [];
          toast('清单版本已刷新，共 ' + (j2.fullvers || []).length + ' 份可选');
        }).catch(fail);
      };

      /* 产品信息那半页的控件也在同一屏，绑定一并做 */
      richBind(m);             /* 受理范围说明是富文本，渲染后要绑工具栏 */
      flwBind(m);              /* 办理流程行的增删 */
      imgBind(m);              /* 头图上传 */
      provBind(m, 'w-prov');   /* prodFields 里的受理范围（新增页传了 accept:false，通常不渲染） */
      /* 最终产品名 = 送签地 + 国家 + 签证名称 + 后缀，三个字段一边填一边显示出来，
         免得供应商到第二步才发现名字拼出来不是他想要的 */
      var nameSync = function () {
        var el = $('#w-basename', m);
        if (!el) return;
        var g2 = function (id) { return (($(id, m) || {}).value || '').trim(); };
        var bn = g2('#v-city') + g2('#v-country') + g2('#v-type');
        el.textContent = bn || '送签地 + 国家 + 签证名称';
        /* 拼完整名字给一眼看：光给公式，填的人还得自己在脑子里拼一遍 */
        var full = $('#w-fullname', m);
        if (full) {
          var sfx = g2('#w-suffix');
          full.innerHTML = bn
            ? '客户端展示的产品名称：<b>' + esc(bn + (sfx ? ' ' + sfx : '')) + '</b>' : '';
        }
      };
      ['#v-country', '#v-type', '#v-city', '#w-suffix'].forEach(function (id) {
        var el = $(id, m);
        if (el) el.oninput = nameSync;
      });
      nameSync();

      /* 第一步的表单读回：「下一步」和「先保存」都要用 */
      function step1Read() {
        var g = function (id) { return ($(id, m) || {}).value; };
        var country = (g('#v-country') || '').trim(), vt = (g('#v-type') || '').trim(),
          city = (g('#v-city') || '').trim();
        var vcat = g('#v-cat') || '';
        if (!country || !vt || !city) { toast('请填写国家、签证名称与送签地', true); return false; }
        if (!vcat) { toast('请选择签证类型', true); return false; }
        if (!g('#v-fv')) { toast('请选择国家送签材料库', true); return false; }
        var a = $('#w-addr', m);
        if (!a || !a.value) { toast('请先创建材料收件地址', true); return false; }
        var stmn = +g('#v-stmin') || 0, stmx = +g('#v-stmax') || 0;
        if (stmn && stmx && stmn > stmx) { var t0 = stmn; stmn = stmx; stmx = t0; }
        W.visa = {
          country: country, visa_type: vt, visa_cat: vcat, submit_city: city,
          valid_type: g('#v-vtype'), valid_num: +g('#v-vnum') || 0,
          entries: g('#v-entries'),
          stay_min: stmn, stay_max: stmx || stmn, stay_unit: g('#v-stunit') || 'day',
          need_interview: g('#v-int') === '1' ? 1 : 0,
          need_fingerprint: g('#v-fp') === '1' ? 1 : 0,
          accept_note: richRead(m, 'v-note'),
          accept_provinces: provRead(m, 'v-prov') || []
        };
        W.fullver_id = +g('#v-fv');
        W.baseName = city + country + vt;
        var d = prodRead(m);
        W.suffix = d.name_suffix;
        W.vendor_code = d.vendor_code;
        W.feature = d.feature;
        W.svc_tags = d.svc_tags;
        W.addr_id = d.addr_id;
        W.to_c = d.to_c;
        W.flow = d.flow;
        W.hero_img = d.hero_img;
        return true;
      }
      $('[data-next]', m).onclick = function () {
        if (!step1Read()) return;
        W.step = 2; reload();
      };
      $('[data-draft]', m).onclick = function () {
        if (!step1Read()) return;
        return submitWiz(W, []);
      };
      return;
    }

    /* ---- 第 2 步：套餐报价 ---- */
    /* 套餐这一段跟「套餐与报价」页用同一个 pkgFields()：一张卡片一个套餐，
       点「添加套餐」就地展开成同样的 7 个字段。原来这里是 ask() 弹窗，
       跟编辑套餐时的页面内表单对不上（唐美芳 2026-08-31：
       「为什么不继续沿用创建流程的页面呢」）。 */
    var adding = W.adding;
    m.innerHTML = head + wiz(2) +
      card('套餐报价 <span>结算价由贵司自行录入，须不低于签证费；建议零售价须不低于结算价</span>',
        '<div class="pad">' +
        (W.pkgs.length
          ? W.pkgs.map(function (k, i) {
            var g = (k.suggest_retail || 0) - (k.settle_price || 0);
            var editing = W.editing === i;
            return '<div class="pk-card' + (editing ? ' on' : '') + '">' +
              '<div class="pk-hd"><b>' + esc(k.name) + '</b>' +
              '<span class="pk-g' + (g < 0 ? ' bad' : '') + '">毛利 ¥' + money(g) + '</span>' +
              '<div class="pk-op">' +
              (editing
                ? '<button class="btn sm" data-kcancel>取消</button>' +
                  '<button class="btn sm r" data-ksave="' + i + '">保存</button>'
                : '<button class="btn sm" data-kedit="' + i + '">编辑</button>' +
                  '<button class="btn sm g" data-rm="' + i + '">移除</button>') +
              '</div></div>' +
              (editing
                ? '<div class="pk-bd">' + pkgFields(k, false) + '</div>'
                : '<div class="pk-sum">' +
                  '<i>签证费<b>¥' + money(k.visa_fee) + '</b></i>' +
                  '<i>服务费<b>¥' + money(k.service_fee) + '</b></i>' +
                  '<i>结算价<b>¥' + money(k.settle_price) + '</b></i>' +
                  '<i>建议零售价<b>¥' + money(k.suggest_retail) + '</b></i>' +
                  '<i>时效<b>' + k.lead_days + ' 工作日</b></i></div>') +
              '</div>';
          }).join('')
          : (adding ? '' : '<div class="empty">尚未录入套餐，至少录入一个方可提交</div>')) +
        (adding
          ? '<div class="pk-card on"><div class="pk-hd"><b>新套餐</b><div class="pk-op">' +
            '<button class="btn sm" data-kcancel>取消</button>' +
            '<button class="btn sm r" data-knew>添加</button></div></div>' +
            '<div class="pk-bd">' + pkgFields(null, false) + '</div></div>'
          : '<div style="margin-top:14px"><button class="btn" data-addk>+ 添加套餐</button></div>') +
        '</div>', '') +
      card('确认信息', '<div class="pad">' +
        '<div class="kv"><i>签证</i><b>' + esc(W.baseName) + '</b>' +
        '<s>' + esc(W.visa.entries === 'multi' ? '多次' : (W.visa.entries === 'double' ? '两次' : '单次')) + '入境 · 有效期 ' +
        validTx(W.visa) + ' · 停留 ' + stayTx(W.visa) + ' · ' +
        (W.visa.need_interview ? '需面签' : '免面签') + '</s></div>' +
        '<div class="kv"><i>最终产品名</i><b>' + esc(W.baseName + (W.suffix ? ' ' + W.suffix : '')) + '</b></div>' +
        '<div class="kv"><i>签证类型</i><b>' + esc(W.visa.visa_cat || '—') + '</b></div>' +
        '<div class="kv"><i>自有产品编码</i><b>' + esc(W.vendor_code || '未填') + '</b>' +
        (W.vendor_code ? '' : '<s>选填，用于与贵司自有系统对码</s>') + '</div>' +
        '<div class="kv"><i>材料清单</i><b>' + (function () {
          var f = j.fullvers.filter(function (x) { return x.id === W.fullver_id; })[0];
          return f ? esc(f.name) + '<s>' + esc(f.ver_no) + '</s>' : '—';
        })() + '</b></div>' +
        '<div class="kv"><i>材料收件地址</i><b>' + esc((j.addrs.filter(function (a) { return a.id === W.addr_id; })[0] || {}).detail || '—') + '</b></div>' +
        '<div class="kv"><i>服务保障</i><b>' + esc((W.svc_tags || []).join('、') || '未勾选') +
        '</b><s>另有系统自动带出的免面签与平台统一项</s></div>' +
        '<div class="kv"><i>上架范围</i><b><span class="tag ok">B 端 · CSP 门店/同业</span>' +
        (W.to_c ? ' <span class="tag ok">C 端 · 客户小程序</span>' : ' <span class="tag plain">不上 C 端</span>') + '</b></div>' +
        '<div style="margin-top:14px"><button class="btn" data-back>上一步</button> ' +
        '<button class="btn p" data-submit>提交并生成草稿</button></div></div>');

    richBind(m);   /* 套餐说明与预订须知是富文本，渲染后要绑工具栏 */
    $('[data-back]', m).onclick = function () { W.step = 1; reload(); };
    $$('[data-rm]', m).forEach(function (b) {
      b.onclick = function () {
        W.pkgs.splice(+b.dataset.rm, 1); W.editing = null; reload();
      };
    });
    $('[data-addk]', m) && ($('[data-addk]', m).onclick = function () {
      /* 与后端 PKG_MAX 同值：一个产品挂太多套餐，客人在详情页根本比不过来 */
      if (W.pkgs.length >= 12) return toast('单个产品最多 12 个套餐，超出请拆分为多条产品分别上架', true);
      W.adding = true; W.editing = null; reload();
    });
    $$('[data-kedit]', m).forEach(function (b) {
      b.onclick = function () { W.editing = +b.dataset.kedit; W.adding = false; reload(); };
    });
    $$('[data-kcancel]', m).forEach(function (b) {
      b.onclick = function () { W.adding = false; W.editing = null; reload(); };
    });
    /* 与套餐编辑页同一套读表逻辑：pkgFields 出的表单，pkgRead 读回来 */
    function readPkg() {
      var f = pkgRead(m);
      if (!pkgOk(f)) return null;
      return {
        name: f.name, visa_fee: +f.visa_fee || 0, service_fee: +f.service_fee || 0,
        settle_price: +f.settle_price || 0,
        suggest_retail: +f.suggest_retail || 0, lead_days: +f.lead_days || 15,
        pkg_desc: f.pkg_desc, book_notice: f.book_notice
      };
    }
    $('[data-knew]', m) && ($('[data-knew]', m).onclick = function () {
      var k = readPkg(); if (!k) return;
      W.pkgs.push(k); W.adding = false; reload();
    });
    $$('[data-ksave]', m).forEach(function (b) {
      b.onclick = function () {
        var k = readPkg(); if (!k) return;
        W.pkgs[+b.dataset.ksave] = k; W.editing = null; reload();
      };
    });
    $('[data-submit]', m).onclick = function () {
      if (!W.pkgs.length) return toast('至少添加一个套餐', true);
      return submitWiz(W, W.pkgs);
    };
  });
};

/* ================= 供应商：产品管理 =================
   一个菜单，下分两个分区：产品列表 / 材料收件地址 */
var PSEC = [
  ['list', '产品列表', function (m) { return ubkProdList(m); }],
  ['addr', '收货地址管理', function (m) { return ubkAddrs(m); }]
];
VIEWS['ubk:products'] = function (m) {
  var cur = S.cache.psec || 'list';
  var hit = PSEC.filter(function (x) { return x[0] === cur; })[0] || PSEC[0];
  m.innerHTML = '<div class="subtabs big">' + PSEC.map(function (x) {
    return '<a data-sec="' + x[0] + '"' + (x[0] === hit[0] ? ' class="on"' : '') + '>' + esc(x[1]) + '</a>';
  }).join('') + '</div><div id="secbody"><div class="spin">加载中…</div></div>';
  $$('[data-sec]', m).forEach(function (a) {
    a.onclick = function () { S.cache.psec = a.dataset.sec; reload(); };
  });
  return hit[2]($('#secbody', m));
};
function goSec(k) { S.cache.psec = k; go('products'); }

/* 产品完整度：把「这条产品还差什么才能提交审核」直接摊在列表上。
   借鉴现有旅游产品录入列表的三点式设计——不点进详情就知道下一步该干什么，
   缺项本身就是待办清单，比只给一个「草稿」状态有用得多。 */
/* 完整度只看两件事（唐美芳 2026-09-04：「收料地址不需要保留吧，本身就是必填字段」）。
   收料地址在新增第二步就是必填，建出来的产品一定有，摆进完整度永远是绿的，白占一格。 */
/* 完整度只看「这条产品能不能卖」，两段各自的判定口径：
   · 基础信息＝新增产品前两步的必填项齐备（名称、收件地址、材料清单版本、至少一个销售渠道）。
     ⚠️ 原来判的是「产品特色填没填」——那是选填的营销文案，
     结果每条正常创建的产品基础信息都是灰的（唐美芳 2026-09-07：
     「基础信息为什么也是置灰的，基本信息填完了就是绿色的」）。
   · 套餐报价＝至少录了一个套餐。 */
function pcParts(p) {
  return [
    ['基础信息', !!(String(p.name || '').trim() && p.addr_id && p.fullver_id &&
      (p.to_b || p.to_c))],
    ['套餐报价', !!(p.packages || []).length]
  ];
}
function pcDots(p) {
  return '<div class="cdots">' + pcParts(p).map(function (x) {
    return '<span class="' + (x[1] ? 'y' : 'n') + '">' + esc(x[0]) + '</span>';
  }).join('') + '</div>';
}
function pcMiss(p) {
  return pcParts(p).filter(function (x) { return !x[1]; }).map(function (x) { return x[0]; });
}
/* 编辑弹窗要给「材料收件地址」下拉，而弹窗是从表格行的 data-ed 里起的，取不到当次请求的结果，
   所以列表/详情拉到地址后往这里存一份。取不到就退化成只显示当前值，不编造选项。 */
var UBK_ADDRS = [];
/* 「套餐与报价」弹窗从表格行的 data-pm 起，拿不到当次请求的整条产品，
   所以列表/详情渲染时把产品按 id 存一份给弹窗取。 */
var UBK_PROD = {};
/* 材料清单版本的可选项同理：/sup/catalog 里带的 fullvers 存一份，取不到就不给改，不编造 */
var UBK_FVS = [];
function ubkScope(p) {
  var s = [];
  if (p.to_b) s.push('<span class="tag info">B 端 · CSP</span>');
  if (p.to_c) s.push('<span class="tag ok">C 端 · 小程序</span>');
  return s.join(' ') || '<span class="tag plain">未选</span>';
}
/* 签证属性、材料清单版本这些平台侧字段回查平台目录：/sup/products 没带目录 id，
   而「国家 + 签证类型 + 送签地」在目录里唯一确定一条签证，就用它对。对不上就不显示，不猜。 */
function ubkCatKey(x) { return [x.country, x.visa_type, x.submit_city].join('|'); }
function ubkCatOf(cat, p) {
  return (cat || []).filter(function (x) { return ubkCatKey(x) === ubkCatKey(p); })[0] || null;
}
function ubkPkgMin(p, get) {
  var v = (p.packages || []).map(get).filter(function (x) { return typeof x === 'number'; });
  return v.length ? Math.min.apply(null, v) : 0;
}

/* 套餐表与产品操作在列表页和详情页是同一套动作，绑定逻辑抽出来共用，
   免得两处各写一遍、改价规则改了只改一半。 */
/* 一条产品此刻哪些字段能改，前端跟后端 sup_policy 同一份口径。
   后端才是真正的闸门，这里只是把「为什么点不动」提前告诉人，免得点了才吃报错。 */
/* 2026-09-04 唐美芳整体放开：基础信息与报价随时可改（有单也能改），
   改动会自动下架，改完点上架即刻恢复、无需重新审核。所以锁只剩「审核中」一条，
   七个键的说法都一样——保留七个键是为了跟后端 POLICY_WHY 一一对应，
   哪天再分档不用两边同时动。 */
var POL_WHY = {
  name: '审核中不可修改，请先撤回审核',
  price: '审核中不可修改，请先撤回审核',
  pkg_add: '审核中不可修改，请先撤回审核',
  feature: '审核中不可修改，请先撤回审核',
  scope: '审核中不可修改，请先撤回审核',
  addr: '审核中不可修改，请先撤回审核',
  notice: '审核中不可修改，请先撤回审核'
};
function pol(p, k) { return !p.policy || p.policy[k]; }
/* 锁住的按钮不藏起来：藏了供应商会以为系统没这功能，留着并写明为什么锁，才知道怎么解锁 */
function lockBtn(t, why, cls) {
  return '<button class="btn sm ' + (cls || '') + '" disabled title="' + esc(why) + '">' + esc(t) + '</button>';
}
/* 「套餐与报价」原来的表格 + 三个弹窗（改价 / 改说明 / 添加）2026-08-31 整体废弃，
   改成独立页面 v-ubkpkg.js：一张卡片一个套餐，就地展开成跟创建时同样的 7 字段表单。 */
function ubkBindProd(m) {
  $$('[data-go]', m).forEach(function (b) {
    b.onclick = function () { go('product', b.dataset.go); };
  });
  /* 「编辑产品信息」2026-08-31 从弹窗改成独立页面（唐美芳：「ubk 里编辑产品信息和
     编辑套餐信息，为什么不继续沿用创建流程的页面呢，现在编辑产品信息还是弹窗」）。
     原来是 ask() 弹窗，字段、顺序、说明文案都跟创建第 2 步那张表对不上；
     现在两处渲染同一个 prodFields()。 */
  $$('[data-ed]', m).forEach(function (b) {
    b.onclick = function () { go('edit', b.dataset.ed); };
  });
  /* 「套餐与报价」2026-08-31 从弹窗改成独立页面（唐美芳：「编辑产品套餐信息不要弹窗，
     应该和创建时的信息保持一致」）。原来是 modal 里套表格、表格行再弹第二层窗改价，
     而且编辑被拆成「改价」「说明与须知」两个窗，跟新增产品第三步那张 7 字段表对不上。 */
  $$('[data-pm]', m).forEach(function (b) {
    b.onclick = function () { S.cache.pkOpen = null; go('pkgs', b.dataset.pm); };
  });
  $$('[data-rs]', m).forEach(function (b) {
    b.onclick = function () {
      var tk = b.dataset.tk, T = tk === 'b' ? 'B 端（CSP 门店与同业）' : 'C 端（客户小程序）';
      confirmBox('重新提交 ' + tk.toUpperCase() + ' 端审核',
        '把这条产品的 ' + T + ' 审核重新置为「待审核」，' +
        '<b>另一端的审核结论不受影响</b>，已在售的一端照常销售。提交前请确认驳回意见已整改完毕。',
        '重新提交')
        .then(function () {
          return api('/sup/product/save', { id: +b.dataset.rs, status: 'published', resubmit: tk });
        })
        .then(function () { toast('已重新提交 ' + tk.toUpperCase() + ' 端审核'); reload(); })
        .catch(fail);
    };
  });
  $$('[data-sh]', m).forEach(function (b) {
    b.onclick = function () {
      var to = b.dataset.st, act = b.dataset.act;
      /* 上架分两种情形，说法必须分开写：
           · 这一端以前审过并通过 → 沿用原结论，点完立刻展示，不进审核队列
             （唐美芳 2026-09-04：「上架后不需要 uom 审核就直接上架了」）；
           · 从没审过、或上次被驳回 → 仍要走一次审核，平台根本没看过这条产品。 */
      var seen = ['b', 'c'].some(function (t) {
        return b.dataset['rv' + t] === 'approved';
      });
      var fresh = ['b', 'c'].some(function (t) {
        return b.dataset['to' + t] === '1' && b.dataset['rv' + t] !== 'approved';
      });
      var txt = to === 'published'
        ? (seen && !fresh
          ? '本产品此前已通过运营审核，重新上架将<b>沿用原审核结论并即时恢复展示</b>，无需再次审核。'
          : '尚未审核的渠道将<b>提交对应运营审核</b>：B 端审核通过后在 CSP 门店 / 同业产品预订中心展示，'
          + 'C 端审核通过后在客户小程序展示，两端分别审核。'
          + (seen ? '已通过审核的渠道沿用原结论，即时恢复展示。' : ''))
        + '提交前系统将校验：至少一个套餐报价、已选择收料地址。'
        : (act === '撤回审核'
          ? '撤回后本次送审作废，产品回到「待发布」状态，各字段解除锁定可继续修改；修改完成后需重新提交审核。'
          : '下架后 CSP 与客户小程序<b>均</b>不再展示，已成交订单不受影响。'
          + '<br>下架期间可调整价格、增删套餐、修改产品名称；完成后点击「提交上架」即时恢复展示。');
      confirmBox(act, txt, act)
        .then(function () { return api('/sup/product/save', { id: +b.dataset.sh, status: to }); })
        .then(function (r2) {
          var direct = r2 && r2.review_b !== 'pending' && r2.review_c !== 'pending';
          toast(to === 'published'
            ? (direct ? '已上架，客户端与门店即时可见' : '已提交，等待运营审核')
            : (act === '撤回审核' ? '已撤回审核' : '已下架'));
          reload();
        }).catch(function () { /* 失败已提示，弹窗保留 */ });
    };
  });
}
/* 一条产品的审核状态：B 端与 C 端各审各的，所以是两行不是一行。
   渠道就叫 B 端 / C 端（唐美芳 2026-08-27），不在这里重复 CSP、小程序这些落地位置——
   那是「上架范围」列回答的事，写两遍反而看不清审到哪一步了。
   状态只有三态：待审核 / 审核驳回 / 审核通过；没申请的端不占行，免得混进第四种。
   驳回必须把原因带出来，供应商照着改。 */
/* 发布状态列（唐美芳 2026-09-04：「审核状态文案改为发布状态，基本截图一样就好」）。
   照众信产品列表那张表的写法：一行一个彩点加一句话，不摆 label。
   供应商关心的是「这条现在卖不卖得出去」，而不是「B 端结论是 approved」——
   审核只是通往发布的其中一步，所以状态名以发布为准，审批中/驳回是其中两种未发布的原因。 */
function pubDot(cls, txt, sub) {
  return '<div class="pst ' + cls + '"><i></i><span>' + txt +
    (sub ? '<s>' + sub + '</s>' : '') + '</span></div>';
}
function ubkPubZn(p) {
  var out = [];
  ['b', 'c'].forEach(function (t) {
    if (!p['to_' + t]) return;
    var T = t === 'b' ? '销售端' : 'C端';
    var rv = p['review_' + t];
    if (rv === 'pending') { out.push(pubDot('w', '审批中（' + T + '）')); return; }
    if (rv === 'rejected') {
      out.push(pubDot('b', '审核驳回（' + T + '）', esc(p['review_' + t + '_note'] || '')));
      return;
    }
    if (p['on_' + t]) {
      out.push(pubDot('g', t === 'b' ? '已发布（销售端）' : '已上架（C端）'));
      return;
    }
    out.push(pubDot('n', (rv === 'approved' ? '已下架' : '未提交') + '（' + T + '）'));
  });
  if (!out.length) out.push(pubDot('n', '未选销售渠道'));
  /* 完整度没配齐的，按截图口径统一显示「未完善」——它比「未提交」更能说明下一步做什么 */
  if (pcMiss(p).length && p.status !== 'published') {
    out = [pubDot('n', '未完善')];
  }
  return out.join('');
}
function ubkRvZn(p) {
  var out = [];
  ['b', 'c'].forEach(function (t) {
    if (!p['to_' + t]) return;
    var T = t === 'b' ? 'B 端' : 'C 端';
    out.push([T, rvTag(p['review_' + t]), out.length ? '' : 'top']);
    if (p['review_' + t] === 'rejected' && p['review_' + t + '_note']) {
      out.push([T + '驳回原因', esc(p['review_' + t + '_note']), 'bad']);
    }
  });
  if (!out.length) out.push(['审核', '<span class="tag plain">未提交上架</span>', 'mut']);
  return zn(out);
}

/* 一条产品在列表行里可执行的动作。唐美芳 2026-08-27：光有「编辑产品信息」不够，
   套餐与报价这些字段也得能在列表上直接改，详情页退回纯查看。
   所以改价 / 加套餐 / 改须知从详情页搬到这里的「套餐与报价」弹窗里。
   viewOnly=true 时只留主操作按钮，给详情页用。 */
function ubkRowOps(p, viewOnly) {
  var pending = p.policy && p.policy.pending, onsale = p.state === 'on';
  /* 主动作按状态各只有一个正解：审核中只能撤回，在售只能下架，其余都是（重新）送审。
     以前不管什么状态都渲染「下架 / 提交审核」两选一，审核中的产品点「下架」，
     供应商根本不知道自己是在撤回送审。 */
  var rejected = p.review_b === 'rejected' || p.review_c === 'rejected';
  /* 配置没齐就不摆上架按钮（唐美芳 2026-09-07：「发布状态为未完善时，
     不应该展示提交上架审核按钮」）。点了也会被接口挡下来，摆着只是让人白点一次
     再去猜哪里没填——「完整度」列已经写明缺什么了。 */
  var incomplete = pcMiss(p).length > 0;
  var main = pending
    ? { st: 'draft', t: '撤回审核', cls: 'r' }
    : (onsale ? { st: 'draft', t: '下架', cls: 'r' }
      : (incomplete ? null
        : { st: 'published', t: rejected ? '重新提交审核' : '提交上架审核', cls: 'p' }));
  var b = [];
  if (!viewOnly) {
    b.push('<button class="btn sm p" data-go="' + p.id + '">查看详情</button>');
    b.push('<button class="btn sm" data-ed="' + p.id + '">编辑产品信息</button>');
    b.push('<button class="btn sm" data-pm="' + p.id + '">套餐与报价</button>');
  }
  /* 审核结论带在 data 上，确认框要靠它区分「即刻上架」还是「送审」 */
  if (main) {
    b.push('<button class="btn sm ' + main.cls + '" data-sh="' + p.id + '" data-st="' + main.st +
      '" data-rvb="' + esc(p.review_b || '') + '" data-rvc="' + esc(p.review_c || '') +
      '" data-tob="' + (p.to_b ? 1 : 0) + '" data-toc="' + (p.to_c ? 1 : 0) +
      '" data-act="' + esc(main.t) + '">' + main.t + '</button>');
  }
  /* 配置未齐时不摆按钮即可，不再补一句提示文案
     （唐美芳 2026-09-07：「操作按钮那里不用再额外展示文案了」）——
     左侧「完整度」列已经用两个圆点写明缺哪一段。 */
  /* 只有一端被驳回、另一端还在售时，整条下架再上架会把在售那端也打下来。
     所以给被驳回的那一端单独一个「重新提交」，只重置这一端。 */
  if (p.status === 'published' && !pending) {
    ['b', 'c'].forEach(function (t) {
      if (p['review_' + t] === 'rejected') {
        b.push('<button class="btn sm p" data-rs="' + p.id + '" data-tk="' + t + '">重新提交 ' +
          t.toUpperCase() + ' 端审核</button>');
      }
    });
  }
  return '<div class="btns">' + b.join('') + '</div>';
}

function ubkProdList(m) {
  /* 目录与收料地址一起取：签证属性、材料清单版本、收件地址都不在 /sup/products 里，
     要么另取要么不显示，不能在前端造。 */
  return Promise.all([api('/sup/products'), api('/sup/catalog'), api('/sup/addrs')]).then(function (r) {
    var j = r[0], cat = r[1].list, addrs = r[2].list;
    UBK_ADDRS = addrs;
    UBK_FVS = r[1].fullvers || [];
    UBK_PROD = {};
    j.list.forEach(function (x) { UBK_PROD[x.id] = x; });
    UBK_SVC.opts = j.svc_opts || UBK_SVC.opts;
    UBK_SVC.fixed = j.svc_fixed || UBK_SVC.fixed;
    var q = srchCard('ubkprod', [
      { k: 'name', t: '产品名称', ph: '支持模糊查询' },
      { k: 'country', t: '国家', type: 'sel', opts: uniqOpts(j.list, function (p) { return p.country; }) },
      /* 类型走受控枚举（固定 9 项，不随数据变），名称走数据去重 */
      {
        k: 'visa_cat', t: '签证类型', type: 'sel',
        opts: (j.visa_cats || VISA_CATS).map(function (v) { return [v, v]; })
      },
      { k: 'visa_type', t: '签证名称', type: 'sel', opts: uniqOpts(j.list, function (p) { return p.visa_type; }) },
      { k: 'submit_city', t: '送签城市', type: 'sel', opts: uniqOpts(j.list, function (p) { return p.submit_city; }) },
      { k: 'fullver', t: '送签材料清单', type: 'sel', opts: fvOpts(j.list) },
      {
        /* 上架范围和报价预警不是产品的状态，是两个独立的维度：
           一个「在售」产品既可能只上 B 端，也可能有报价预警。放页签里会和审核状态互斥。 */
        k: 'scope', t: '上架范围', type: 'sel',
        opts: [['bc', '已上 C 端'], ['b', '仅 B 端']],
        get: function (p) { return p.to_c ? 'bc' : 'b'; }
      },
      {
        k: 'comp', t: '信息完整度', type: 'sel',
        opts: [['full', '已完善'], ['part', '存在缺项']],
        get: function (p) { return pcMiss(p).length ? 'part' : 'full'; }
      },
      {
        k: 'warn', t: '报价预警', type: 'sel',
        opts: [['y', '有预警'], ['n', '无预警']],
        get: function (p) { return p.warn ? 'y' : 'n'; }
      },
      {
        /* 审核结论从页签降级成筛选项：它是「待发布」内部的细分原因（没提交 / 审核中 / 被驳回），
           跟「已发布」不是并列关系，当页签会让人以为四个格子互斥。
           B 端与 C 端各审各的，所以拆成两个筛选项，各自只看自己那一端的结论。 */
        /* 唐美芳 2026-09-01：「列表筛选B端审核结论、C端审核结论这种就不要出现，
           正常应该是B端审核状态、C端审核状态」。
           顺带把选项也规范了：原来「未申请 / 未提交」一个选项里塞两个词，
           「审核驳回 / 审核通过」是动宾短语，跟「待审核」不是一套体例。
           状态值统一成「未提交 / 待审核 / 已驳回 / 已通过」。 */
        k: 'review_b', t: 'B 端审核状态', type: 'sel',
        opts: [['none', '未提交'], ['pending', '待审核'],
        ['rejected', '已驳回'], ['approved', '已通过']],
        get: function (p) { return p.review_b; }
      },
      {
        k: 'review_c', t: 'C 端审核状态', type: 'sel',
        opts: [['none', '未提交'], ['pending', '待审核'],
        ['rejected', '已驳回'], ['approved', '已通过']],
        get: function (p) { return p.review_c; }
      }
    ]);
    /* 状态只留三个：全部 / 待发布 / 已发布（唐美芳 2026-08-26 定）。
       「已发布」= 供应商提交且总部审核通过，也就是此刻真的在卖。 */
    var t = subTabs('ubkprod', [
      { k: 'all', t: '全部', fn: function () { return true; } },
      { k: 'off', t: '待发布', fn: function (p) { return p.state !== 'on'; } },
      { k: 'on', t: '已发布', fn: function (p) { return p.state === 'on'; } }
    ], q.filter(j.list));
    /* 能比大小的才挂排序：报价看起价、审核看结论时间、维护看最近操作时间。 */
    /* 默认按最近操作倒序：供应商刚改完的产品排在第一行，是这张表最常见的用法。
       创建时间、套餐报价、审核状态都能点表头改排序。 */
    var so = sorter('ubkprod', [
      ['套餐与报价', function (p) { return p.base_settle || 0; }],
      ['审核状态', function (p) { return p.review_b_at || p.review_c_at || ''; }]
    ].concat(AUD_SORTS), ['最近操作', 'desc']);
    var pg = pager('ubkprod', so.sort(t.rows), 10);

    /* 标题与左侧菜单同名。原来菜单叫「签证产品管理」、页面叫「我的产品与报价」，
       同一个页面两个名字（唐美芳 2026-09-01：「列表的标题最好和菜单名称保持一致」）。 */
    /* 顶部说明整段撤掉（唐美芳 2026-09-07：「列表也不需要展示其他多余文案，都隐藏下」）。
       计价与结算口径改在新增 / 编辑产品的套餐表单里就地说明，
       那才是需要看到它的时机；列表页只呈现数据。 */
    m.innerHTML = pageH('签证产品管理', '',
      '<button class="btn p" data-new>新建</button>') +
/* 操作说明整块撤掉（唐美芳 2026-09-04：「ubk 里页面的操作说明都先去掉吧」）。
   页面顶部保留一句话说明；供应商是外部用户，不需要我们把内部作业规范摆给他看。 */
      q.html +
      '<div class="card">' + t.html + '<div class="pad">' + table(
        /* 完整度紧挨发布状态（唐美芳 2026-09-04：「完整度字段放到发布状态左侧」）——
           这两列回答的是同一件事：这条产品现在能不能卖、还差什么。 */
        so.cols(['产品信息', '签证属性', '办理要求', '套餐与报价',
          '上架范围', '完整度', '发布状态'].concat(AUD_COLS)),
        pg.rows, function (p) {
          var c = ubkCatOf(cat, p), miss = pcMiss(p);
          var lead = ubkPkgMin(p, function (k) { return k.lead_days; });
          return '<td style="min-width:230px">' + zn([
            ['产品', '<span class="lnk" data-go="' + p.id + '">' + flag(p.country) + ' ' + esc(p.name) + '</span>', 'top'],
            /* 原来露的是数据库自增主键，供应商跟平台对账、电话里报编号都用不了。
               改成业务编码 Q+6 位，点一下可复制（唐美芳 2026-08-31）。 */
            ['产品编码', copyCode(p.code || ('Q' + String(100000 + p.id))), 'mut'],
            /* 供应商自有编码是选填项。原来「填了才占一行」，结果同一张表里有的产品
               三行、有的两行，看着像数据缺失（唐美芳 2026-09-08：
               「产品列表怎么有的有自有编码，有的没有」）。
               改成固定占位，没填的写「未填写」并说明它是选填的对码字段。 */
            ['自有编码', p.vendor_code
              ? copyCode(p.vendor_code)
              : '<span class="hint">未填写（选填，用于与贵司自有系统对码）</span>', 'mut']
          ]) + '</td>' +
            '<td style="min-width:150px">' + zn([
              ['目的地', esc(p.country), 'top'],
              ['签证类型', p.visa_cat ? '<span class="tag info">' + esc(p.visa_cat) + '</span>' : '—'],
              ['签证名称', esc(p.visa_type), 'mut'],
              ['送签地', esc(p.submit_city), 'mut'],
              c ? ['有效期', esc(c.valid) + ' · 停留 ' + stayTx(c), 'mut'] : null,
              c ? ['入境', esc((typeof ENTRIES !== 'undefined' && ENTRIES[c.entries]) || c.entries), 'mut'] : null
            ]) + '</td>' +
            '<td style="min-width:150px">' + zn([
              c ? ['面签', c.need_interview ? '<span class="tag warn">需本人面签</span>'
                : '<span class="tag ok">免面签</span>', 'top'] : null,
              c ? ['指纹', c.need_fingerprint ? '需现场采集' : '不需要', 'mut'] : null,
              /* 收料地址是新增第二步的必填项，列表里每行都有值，摆着没有区分度
                 （唐美芳 2026-09-04：「收料地址不需要保留吧，本身就是必填字段」）。
                 具体地址仍在产品详情的「受理与收料」里看。 */
              /* 这一格原来只回显版本号（XIDHJS 这种六位码），跟选清单时下拉里看到的
                 「日本个人旅游签证资料清单」对不上（唐美芳 2026-09-08：
                 「材料清单的字段回显成选择的那个名字，现在这个编码有点对应不上」）。
                 改成名称在前、版本号做小字，跟下拉里的写法一致。 */
              ['材料清单', c && c.fullver
                ? esc(c.fullver_name || c.fullver) + '（' + c.items + ' 项）' +
                  '<div class="hint mono">' + esc(c.fullver) + '</div>'
                : '<span class="tag bad">未绑定</span>', c && c.fullver ? 'mut' : 'bad']
            ]) + '</td>' +
            '<td style="min-width:170px">' + zn([
              ['套餐', (p.packages || []).length + ' 个' + (lead ? ' · 最快 ' + lead + ' 工作日' : ''), 'top'],
              ['结算价', (p.packages || []).length ? znMoney(p.base_settle) + ' 起' : '—', 'hi'],
              p.warn ? ['预警', '存在报价倒挂', 'bad'] : null
            ]) + '</td>' +
            /* 供应商在自己的门户里看自己的产品，「供应商侧：已提交上架」等于自问自答
               （唐美芳 2026-09-01：「上架范围不应该展示供应商侧的状态吧，
               本来就在ubk系统里」）。这一列只回答「上到哪些渠道、卖了多少」，
               提交与否已经由右边的审核状态列表达。 */
            '<td>' + zn([
              ['销售渠道', ubkScope(p), 'top'],
              ['已成交', p.ord_cnt ? p.ord_cnt + ' 笔订单' : '暂无', p.ord_cnt ? 'hi' : 'mut']
            ]) + '</td>' +
            /* 完整度单独成列（唐美芳 2026-09-04）。原来它挤在产品信息里当第四行，
               一眼扫不出「哪几条还差东西」——那恰恰是这张表最该先回答的问题。 */
            /* 圆点本身已经分绿 / 灰标出哪一段没配齐，不再重复一行「缺 xx」文字
               （唐美芳 2026-09-07：「列表也不需要展示其他多余文案，都隐藏下」） */
            '<td style="min-width:120px">' + pcDots(p) + '</td>' +
            '<td style="min-width:190px">' + ubkPubZn(p) + '</td>' +
            audTd(p);
          /* actFn 的第二个参数是行号，不能把 ubkRowOps 直接传进去当回调——会被当成 noDetail */
        }, '没有符合条件的产品', function (p) { return ubkRowOps(p); }) + '</div>' + pg.html + '</div>';

    q.bind(m, function () { S.cache['pg:ubkprod'] = 1; reload(); });
    t.bind(m, function () { S.cache['pg:ubkprod'] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:ubkprod'] = 1; reload(); });
    pg.bind(m, reload);
    ubkBindProd(m);
    $('[data-new]', m).onclick = function () { S.cache.wiz = { step: 1, pkgs: [] }; go('create'); };
  });
};

/* ================= 供应商 · 签证产品详情 =================
   唐美芳 2026-08-27：「你能不能不要我说改哪个点你就只改哪个点啊……
   产品详情页尽量和现在我们 uom 旅游产品的结构保持一致」。
   所以 UBK 这张详情页跟 UOM 那张一起改成同一套结构（up-* 那套：
   标题条 → 主页签 → 左锚点 + 右分区信息表），三端看同一条产品时
   字段摆放位置一致，运营跟供应商在电话里对字段不会各说各的。

   跟 UOM 版的差别只在「谁看」：
     · 供应商要看自己缺什么（完整度、缺项拦截提示、驳回原因与重提入口），这些 UOM 版没有；
     · 平台毛利不给供应商看，套餐表里只有他自己的签证费 / 服务费 / 结算价 / 建议零售价；
     · 材料清单对供应商是只读的收料依据，所以留「预览 / 下载 CSV」。
   详情页仍然只读（她 2026-08-27 定的：详情页主要是查看作用，只保留主要操作按钮），
   改价、加套餐、改产品信息一律回「我的产品与报价」列表行上做。 */
VIEWS['ubk:product'] = function (m, id) {
  return Promise.all([api('/sup/products'), api('/sup/catalog'), api('/sup/addrs')]).then(function (r) {
    var p = r[0].list.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p) {
      m.innerHTML = pageH('产品详情', '', '<button class="btn" data-back>返回产品列表</button>') +
        '<div class="empty">产品不存在或已被删除</div>';
      $('[data-back]', m).onclick = function () { goSec('list'); };
      return;
    }
    var c = ubkCatOf(r[1].list, p);
    UBK_ADDRS = r[2].list;
    UBK_FVS = r[1].fullvers || [];
    UBK_PROD = {}; UBK_PROD[p.id] = p;
    UBK_SVC.opts = r[0].svc_opts || UBK_SVC.opts;
    UBK_SVC.fixed = r[0].svc_fixed || UBK_SVC.fixed;
    var addr = r[2].list.filter(function (a) { return a.id === p.addr_id; })[0];

    /* 材料明细要逐项列出来，供应商得照它收料、还要打给客人看，
       只显示「38 项」没用。清单真源在平台侧，/ops/fullver 本来就对 ubk 放行，直接复用。 */
    var fvid = p.fullver_id || (c && c.fullver_id);
    return (fvid ? api('/ops/fullver?id=' + fvid).catch(function () { return null; })
      : Promise.resolve(null)).then(function (fd) {
        ubkProdDraw(m, p, c, addr, fd);
      });
  });
};

function ubkProdDraw(m, p, c, addr, fd) {
  var tab = S.cache.upTab || 'info';
  var miss = pcMiss(p);
  var pks = p.packages || [];

  /* 锚点只列当前页签里真实存在的区块，点进去落空最伤信任 */
  var ANCH = {
    info: [['rv', '审核状态'], ['base', '基础信息'], ['attr', '签证属性'],
    ['req', '办理要求'], ['acc', '受理与收料'], ['svc', '服务保障']],
    mat: [['fv', '清单版本'], ['items', '材料明细']],
    pkg: [['pks', '套餐与价格'], ['rule', '售价与结算口径'], ['notice', '预订须知']],
    log: [['rvb', 'B 端审核'], ['rvc', 'C 端审核'], ['ev', '操作日志']]
  };

  /* 审核记录用产品自带的创建 / 审核 / 最近操作三个时间点拼，
     后端目前只保留最近一次审核结论，多次送审的历史看不到。 */
  var events = [{
    created_at: p.created_at, action: '创建产品',
    detail: esc(p.name), actor_name: p.created_by_name
  }];
  ['b', 'c'].forEach(function (t) {
    var at = p['review_' + t + '_at'], rv = p['review_' + t];
    if (!at) return;
    var side = t === 'b' ? 'B 端' : 'C 端';
    events.push({
      created_at: at,
      action: side + (rv === 'approved' ? '上架审核通过' : (rv === 'rejected' ? '上架审核驳回' : '上架审核处理')),
      detail: p['review_' + t + '_note'] || '', actor_name: p['review_' + t + '_by']
    });
  });
  if (p.updated_at && p.updated_at !== p.created_at) {
    events.push({ created_at: p.updated_at, action: '最近操作', detail: '', actor_name: p.updated_by_name });
  }
  events.sort(function (a, b) { return (a.created_at || '') > (b.created_at || '') ? -1 : 1; });

  /* 顶部拦截提示：驳回了要看到原因和重提路径，缺项要在提交前就知道会被拦下 */
  var rjNotes = ['b', 'c'].filter(function (t) { return p['review_' + t] === 'rejected'; })
    .map(function (t) {
      return '<b>' + (t === 'b' ? 'B 端' : 'C 端') + '审核驳回：</b>' +
        esc(p['review_' + t + '_note'] || '') + '（' + d16(p['review_' + t + '_at']) + '）';
    });
  var pdNotes = ['b', 'c'].filter(function (t) { return p['review_' + t] === 'pending'; })
    .map(function (t) { return t === 'b' ? 'B 端' : 'C 端'; });
  var alerts =
    (rjNotes.length ? '<div class="note b">' + rjNotes.join('<br>') +
      '<div class="hint">请在「签证产品管理」列表中修改完成后，点击对应渠道的「重新提交 X 端审核」。</div></div>' : '') +
    (pdNotes.length ? '<div class="note w">' + pdNotes.join('、') + '审核中，通过前不在对应渠道展示。</div>' : '') +
    (miss.length ? '<div class="note w">还差 <b>' + esc(miss.join('、')) +
      '</b> 尚未配齐，配齐前提交审核将被系统拦截。</div>' : '') +
    (p.warn ? '<div class="note b"><b>报价倒挂：</b>存在套餐的结算价高于所填建议零售价，' +
      '每成交一单即产生亏损，请返回列表核对报价。</div>' : '');

  function rvBlk(t) {
    var T = TRK[t], v = p['review_' + t];
    return upKv([
      ['是否申请上架', p['to_' + t] ? '<span class="tag ok">已申请</span>'
        : '<span class="tag plain">未申请</span>'],
      ['审核结论', rvTag(v)],
      ['当前展示', p['on_' + t] ? '<span class="tag ok">已展示</span>'
        : '<span class="tag plain">未展示</span>'],
      ['审核人', esc(p['review_' + t + '_by'] || '')],
      ['审核时间', d16(p['review_' + t + '_at'])],
      ['审核方', '众信' + T.who],
      v === 'rejected' ? ['驳回原因', esc(p['review_' + t + '_note'] || ''), 'bad'] : null,
      v === 'approved' && p['review_' + t + '_note'] ?
        ['审核备注', esc(p['review_' + t + '_note'])] : null
    ]);
  }

  function infoHtml() {
    return upSec('rv', '审核状态', upKv([
      ['配置完整度', pcDots(p), 'top'],
      ['上架申请状态', p.status === 'published' ? '已提交上架' : '未提交（草稿）'],
      ['申请上架范围', ubkScope(p)],
      ['B 端上架审核', rvTag(p.review_b) +
        (p.on_b ? ' <span class="tag ok">已展示</span>' : '')],
      ['C 端上架审核', rvTag(p.review_c) +
        (p.on_c ? ' <span class="tag ok">已展示</span>' : '')],
      ['累计成交', p.ord_cnt ? p.ord_cnt + ' 笔订单' : '暂无']
    ]) +
      /* 详情页原来只写「请回列表操作」——既然编辑已经是独立页面，直接给入口，
         少一次来回（2026-08-31） */
      '<div class="pad-s">' + ubkRowOps(p, true) +
      '<button class="btn sm" data-ed="' + p.id + '">编辑产品信息</button> ' +
      '<button class="btn sm" data-pm="' + p.id + '">套餐与报价</button>' +
      '<div class="hint" style="margin-top:8px">上架、撤回、重新送审等操作亦可返回' +
      '「签证产品管理」列表，在该产品行上执行。</div></div>') +
      upSec('base', '基础信息', upKv([
        ['产品名称', esc(p.name)],
        ['名称后缀', esc(p.name_suffix || '')],
        ['产品编码', copyCode(p.code || ('Q' + String(100000 + p.id)))],
        ['供应商自有编码', p.vendor_code ? copyCode(p.vendor_code) :
          '<span class="hint">未填 —— 供应商自有系统中的编码，填写后双方对码无需引用产品名称</span>'],
        ['产品特色', esc(p.feature || ''),
          p.feature ? '' : 'mut'],
        ['创建人 / 时间', esc(p.created_by_name || '') + ' · ' + d16(p.created_at)],
        ['最近修改', d16(p.updated_at) + (p.updated_by_name ? ' · ' + esc(p.updated_by_name) : '')]
      ]) + (p.feature ? '' :
        '<div class="hint pad-s">尚未填写产品特色，客户端与门店无法看到该产品的卖点说明。</div>')) +
      upSec('attr', '签证属性', (c ? upKv([
        ['目的地国家', esc(c.country)],
        ['签证类型', c.visa_cat ? '<span class="tag info">' + esc(c.visa_cat) + '</span>' :
          '<span class="hint">未归类</span>'],
        ['签证名称', esc(c.visa_type)],
        ['送签地', esc(c.submit_city)],
        ['入境次数', esc((typeof ENTRIES !== 'undefined' && ENTRIES[c.entries]) || c.entries)],
        ['签证有效期', esc(c.valid)],
        ['单次停留', stayTx(c)]
      ]) : '<div class="empty">平台目录中未匹配到该条签证</div>') +
        '<div class="hint pad-s">签证属性归属平台目录，同一条签证全平台执行同一套口径，如需修改请联系众信运营；' +
        '供应商可维护的范围为报价、产品特色与上架范围。</div>') +
      upSec('req', '办理要求', upKv([
        ['是否需本人面签', !c ? null : (c.need_interview
          ? '<span class="tag warn">需本人到馆面签</span>' : '<span class="tag ok">免面签</span>')],
        ['是否需采集指纹', !c ? null : (c.need_fingerprint
          ? '<span class="tag warn">需现场采集</span>' : '<span class="tag ok">不需要</span>')],
        ['最快出签', pks.length ? ubkPkgMin(p, function (k) { return k.lead_days; }) + ' 个工作日' : null],
        /* 这几项是签证业务的硬约束，不是产品配置项：官方渠道没有公开接口，
           只能由持证专员人工在使领馆渠道办，写在这里免得供应商以为平台能自动化。 */
        ['人工必办环节', '提交、缴费、抢号、递交、采指纹五项由专员人工操作', 'mut'],
        ['套餐数', pks.length + ' 个'],
        ['最低结算价', pks.length ? znMoney(p.base_settle) + ' 起' : null]
      ])) +
      upSec('acc', '受理与收料', upKv([
        ['受理居住地范围', (p.accept_provinces && p.accept_provinces.length)
          ? p.accept_provinces.map(function (x) {
            return '<span class="tag info">' + esc(x) + '</span>';
          }).join(' ') + '<div class="hint">只受理这些省份居住的申请人</div>'
          : '<span class="tag plain">全国受理</span>'],
        ['受理说明', c ? '<div class="rich-view">' + richView(c.accept_note) + '</div>' : null],
        ['收料地址', addr ? esc(addr.region + ' ' + addr.detail)
          : '<span class="tag bad">未设置</span>'],
        ['收件联系人', addr ? esc(addr.contact + ' · ' + addr.phone) : null]
      ]) + '<div class="pad-s">' +
        (addr ? '' : '<div class="note w">尚未绑定收件地址，客户无法确认护照原件的寄送地址。</div>') +
        '<button class="btn sm" data-addr>去维护收件地址</button></div>') +
      upSec('svc', '服务保障', '<div class="pad-s">' +
        ((p.svc_tags || []).length ? p.svc_tags.map(function (v) {
          return '<span class="tag ok">' + esc(v) + '</span>';
        }).join(' ') : '<span class="hint">尚未勾选服务保障项</span>') +
        '<div class="hint" style="margin-top:8px">勾选项展示在客户端产品详情页顶部。' +
        '另有系统按签证属性自动带出的免面签，以及 ' +
        esc((UBK_SVC.fixed || []).join('、')) + ' 等平台统一提供的项目，无需在此勾选。</div></div>');
  }

  function matHtml() {
    if (!fd) {
      return '<div class="note b">未绑定国家送签材料库，客户无法获知需提交的材料，' +
        '该产品亦无法通过审核。请返回列表在产品行上绑定清单版本。</div>';
    }
    var f = fd.fullver, base = fd.items || [];
    /* 这张页面从「平台清单是什么」改成「本产品实际收什么」：
       供应商照它收料、打给客人看，看到的必须是定制之后的那一份
       （唐美芳 2026-09-03：「可以让供应商自定义材料清单」）。 */
    var mc = p.mat_custom || { add: [], skip: [] };
    var its = mcMerge(base, mc);
    var off = base.length + (mc.add || []).length - its.length;
    var canEdit = pol(p, 'addr');
    return upSec('fv', '清单版本', upKv([
      ['版本号', '<span class="mono">' + esc(f.ver_no) + '</span>'],
      ['清单名称', esc(f.name)],
      ['适用', esc(f.country) + ' · ' + esc(f.visa_type || '通用')],
      ['状态', f.status === 'published' ? '<span class="tag ok">已发布</span>'
        : '<span class="tag warn">草稿</span>'],
      ['生效时间', d10(f.effective_at)],
      ['平台清单', base.length + ' 项'],
      ['本产品实际收', '<b>' + its.length + '</b> 项' +
        (off ? '　<span class="tag warn">关掉 ' + off + ' 项建议</span>' : '') +
        ((mc.add || []).length ? '　<span class="tag info">额外 ' +
          mc.add.length + ' 项</span>' : ''), off || (mc.add || []).length ? 'hi' : null],
      fd.fullver.form ? ['关联表格模板', esc(formLabel(fd.fullver.form))] : null
    ]) + '<div class="pad-s"><div class="btns">' +
      /* 详情页只看不改（唐美芳 2026-09-04：「产品详情页不用展示这个按钮，
         创建&编辑产品的时候需要展示」）。详情页本来就是纯查看，
         改清单跟改价、改名一样回编辑页做，一个动作一个入口。 */
      '<button class="btn sm" data-fvp="' + f.id + '">预览平台原版</button>' +
      '<button class="btn sm" data-fvd="' + f.id + '">下载 CSV</button></div>' +
      /* 唐美芳 2026-09-07：UBK 不允许调整平台统一的清单，入口已撤。
         这段原来指路「编辑产品信息」里改，按钮没了，话不能留。 */
      '<div class="hint" style="margin-top:8px">清单版本由众信运营统一维护，' +
      '<b>供应商侧不可单条增减</b>。本公司收料要求与平台不同的，请到' +
      '<b>「国家送签材料库」</b>对该版本执行「复制新版」，改出自建版本并发布后，' +
      '在编辑产品时改选该版本。改版只对之后的新订单生效，' +
      '已下单客户按下单时的清单快照执行。</div></div>') +
      upSec('items', '材料明细', '<div class="pad-s">' +
        matCwBar(its) + matCwSum(matCwPick(its)) + matTable(matCwPick(its)) +
        (off ? '<div class="hint" style="margin-top:8px">另有 <b>' + off +
          '</b> 项平台建议材料已被本产品停用，不再向客户下发；' +
          '该定制为历史配置，供应商侧已不可自行增减，如需恢复请联系众信运营。</div>' : '') + '</div>');
  }

  function pkgHtml() {
    return upSec('pks', '套餐与价格', '<div class="pad-s">' +
      table(['套餐', '签证费', '服务费', '结算价', '建议零售价', '时效', '已成交'],
        pks, function (k) {
          return '<td style="min-width:150px"><b>' + esc(k.name) + '</b></td>' +
            '<td class="num">¥' + money(k.visa_fee) + '</td>' +
            '<td class="num">¥' + money(k.service_fee) + '</td>' +
            '<td class="num"><b>¥' + money(k.settle_price) + '</b></td>' +
            '<td class="num">¥' + money(k.suggest_retail) +
            (k.settle_price > k.suggest_retail && k.suggest_retail > 0
              ? '<div class="hint" style="color:var(--bad)">低于结算价</div>' : '') + '</td>' +
            '<td class="num">' + k.lead_days + ' 个工作日</td>' +
            '<td class="num">' + (k.used ? '<b>' + k.used + '</b> 单' : '—') + '</td>';
        }, '暂无套餐报价，请返回列表点击「套餐与报价」添加') +
      '<div class="hint" style="margin-top:10px">调整价格、增删套餐请返回「签证产品管理」列表，' +
      '点击该产品行上的<b>「套餐与报价」</b>。已产生成交的套餐不可删除。</div></div>') +
      /* 原来这里是一张「渠道发布」表，列各渠道分组上的差异化价格。业务上不存在这层：
         渠道统一按供应商定的售价卖，订单完成后按该订单结算价结算（唐美芳 2026-08-26）。 */
      upSec('rule', '售价与结算口径', upKv1([
        ['对外售价', '各销售渠道统一按上方建议零售价销售，不分渠道定价'],
        ['结算价', '结算价 = 签证费 + 服务费，由系统自动计算，仅需维护这两项'],
        ['结算方式', '订单完成后按<b>该笔订单成交时快照的结算价</b>结算，后续调价不影响已成交订单'],
        ['报价倒挂', p.warn ? '有套餐结算价高于建议零售价，卖一单亏一单，请核对'
          : '当前无倒挂：所有套餐结算价均不高于建议零售价', p.warn ? 'bad' : 'ok']
      ])) +
      upSec('notice', '预订须知', '<div class="pad-s">' +
        (pks.length ? pks.map(function (k) {
          return '<div class="up-nt"><b>' + esc(k.name) + '</b><div>' +
            richView(k.book_notice || '未填写') + '</div></div>';
        }).join('') : '<div class="empty">暂无套餐，因此没有预订须知</div>') + '</div>');
  }

  function logHtml() {
    return upSec('rvb', 'B 端上架审核', rvBlk('b')) +
      upSec('rvc', 'C 端上架审核', rvBlk('c')) +
      upSec('ev', '操作日志', '<div class="pad-s">' + timeline(events) +
        '<div class="hint" style="margin-top:10px">每一渠道仅保留最近一次审核结论，' +
        '多次送审的历史结论不在此逐条留痕。</div></div>');
  }

  m.innerHTML = pageH('签证产品详情', '',
    /* 文案跟着来源走：从订单列表点产品名进来的，写「返回订单列表」 */
    '<button class="btn" data-back>返回' +
    (S.cache.ubkPdBack === 'orders' ? '订单列表' : '产品列表') + '</button>') +
    (alerts ? '<div class="up-al">' + alerts + '</div>' : '') +
    '<div class="up-hd">' +
    '<div class="up-t"><h3>' + esc(p.name) + '</h3><div class="tg">' +
    '<span class="tag info">' + esc(p.country) + '</span>' +
    '<span class="tag info">' + esc(p.visa_type) + '</span>' +
    '<span class="tag plain">' + esc(p.submit_city) + '</span>' +
    (p.to_b ? '<span class="tag ' + (p.on_b ? 'ok' : 'plain') + '">B 端' +
      (p.on_b ? '在售' : '未上架') + '</span>' : '') +
    (p.to_c ? '<span class="tag ' + (p.on_c ? 'ok' : 'plain') + '">C 端' +
      (p.on_c ? '在售' : '未上架') + '</span>' : '') +
    '</div></div>' +
    '<div class="up-meta">' + [
      ['产品编码', copyCode(p.code || ('Q' + String(100000 + p.id)))],
      ['供应商', esc((S.user && S.user.org) || '本公司')],
      ['产品维护人', esc(p.updated_by_name || p.created_by_name || '—')],
      ['创建时间', d16(p.created_at)],
      ['最近修改', d16(p.updated_at)],
      ['累计成交', p.ord_cnt ? p.ord_cnt + ' 笔' : '暂无']
    ].map(function (x) {
      return '<div><s>' + esc(x[0]) + '</s><b>' + x[1] + '</b></div>';
    }).join('') + '</div></div>' +

    '<div class="up-tabs">' + UP_TABS.map(function (t) {
      return '<a data-ut="' + t[0] + '"' + (tab === t[0] ? ' class="on"' : '') + '>' + t[1] + '</a>';
    }).join('') + '</div>' +

    '<div class="up-main"><nav class="up-rail">' + ANCH[tab].map(function (a) {
      return '<a data-an="up-' + a[0] + '">' + a[1] + '</a>';
    }).join('') + '</nav><div class="up-cont">' +
    (tab === 'info' ? infoHtml() : tab === 'mat' ? matHtml() :
      tab === 'pkg' ? pkgHtml() : logHtml()) +
    '</div></div>';

  /* 从订单列表点产品名进来的，返回要回订单列表（唐美芳 2026-09-08） */
  $('[data-back]', m).onclick = function () {
    S.cache.upTab = 'info';
    if (S.cache.ubkPdBack === 'orders') { S.cache.ubkPdBack = null; return go('orders'); }
    goSec('list');
  };
  $$('[data-ut]', m).forEach(function (a) {
    a.onclick = function () { S.cache.upTab = a.dataset.ut; reload(); };
  });
  matCwBind(m);
  $$('[data-an]', m).forEach(function (a) {
    a.onclick = function () {
      var el = document.getElementById(a.dataset.an);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
  if ($('[data-addr]', m)) $('[data-addr]', m).onclick = function () { goSec('addr'); };
  if ($('[data-fvp]', m)) $('[data-fvp]', m).onclick = function () { fvPreview(+$('[data-fvp]', m).dataset.fvp); };
  if ($('[data-fvd]', m)) $('[data-fvd]', m).onclick = function () { fvDownload(+$('[data-fvd]', m).dataset.fvd); };
  ubkBindProd(m);
  bindSample(m);
}

/* 平台清单原版的预览与下载：供应商要照它收料、要打给客人看，所以得能预览能拿走。
   /ops/fullver 本来就对 ubk 放行，直接复用，不另开接口、不在服务器上落文件。
   注意这两个函数给的是<b>平台原版</b>，不含本产品的定制——
   本产品实际收什么看详情页「材料明细」，那份是 mcMerge() 合成的。 */
function fvRows(d) {
  return d.items.map(function (i) {
    return [i.sort || 0, i.mat_name, i.attr_text, i.way_text, i.copies,
      i.necessity === 'must' ? '必须' : '建议',
      i.crowds.map(function (x) { return (typeof CROWD_S !== 'undefined' && CROWD_S[x]) || x; }).join('/'),
      i.require_text || ''];
  });
}
/* 表模板的展示名。模板名本身经常已经带了表格代码（「DS-160 在线非移民签证申请表」），
   无脑前缀会出现「DS-160 DS-160 …」，所以名字里已经有代码就不再加。 */
function formLabel(x) {
  if (!x) return '';
  var code = x.form_code || '', name = x.name || '';
  return (code && name.indexOf(code) < 0 ? code + ' ' : '') + name;
}

var FV_COLS = ['排序', '资料名称', '属性', '提供方式', '份数', '必要性', '适用人群', '提交要求'];
function fvPreview(id) {
  return api('/ops/fullver?id=' + id).then(function (d) {
    var f = d.fullver;
    modal('材料清单 · ' + f.ver_no + ' ' + f.name,
      '<div class="hint" style="margin-bottom:10px">' + esc(f.country) +
      (f.form ? ' · 依据 ' + esc(formLabel(f.form)) : '') +
      ' · 共 ' + d.items.length + ' 项。清单由平台运营维护，供应商只读。</div>' +
      table(FV_COLS, fvRows(d), function (r) {
        return '<td class="num">' + r[0] + '</td><td><b>' + esc(r[1]) + '</b></td><td>' + esc(r[2]) +
          '</td><td>' + esc(r[3]) + '</td><td class="num">' + r[4] + '</td><td>' +
          (r[5] === '必须' ? '<span class="tag bad">必须</span>' : '<span class="tag plain">建议</span>') +
          '</td><td class="hint">' + esc(r[6]) + '</td><td class="hint" style="max-width:280px">' +
          esc(r[7]) + '</td>';
      }, '清单是空的'),
      [{ t: '下载 CSV', fn: function () { fvDownload(id); return false; } }, { t: '关闭' }], true);
  }).catch(function () { /* 失败已提示，弹窗保留 */ });
}
function fvDownload(id) {
  return api('/ops/fullver?id=' + id).then(function (d) {
    var f = d.fullver;
    var esc2 = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var lines = [FV_COLS.map(esc2).join(',')].concat(
      fvRows(d).map(function (r) { return r.map(esc2).join(','); }));
    // 加 UTF-8 BOM，否则 Excel 打开中文是乱码
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '材料清单_' + f.country + '_' + f.ver_no + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast('已下载 ' + a.download);
  }).catch(function () { /* 失败已提示，弹窗保留 */ });
}

/* ============================================================
   本产品材料清单定制（唐美芳 2026-09-03：「可以让供应商自定义材料清单」）
   平台清单是同一国家的统一口径，供应商在它上面做两件事：
     · 平台的<b>建议项</b>标「本产品不需要」——那本来就是加分项，
       不同供应商对加分项的判断确实不同；
     · <b>追加</b>本供应商额外要的材料，客人侧会标明「本供应商额外要求」，
       一眼能看出这不是使领馆的硬性要求。
   必交项不给动：删了客人到使领馆才发现少材料，砸的是平台和供应商两块招牌。
   接口层同样挡（/sup/mat/custom → clean_mat_custom），前端灰掉不是唯一防线。
   ============================================================ */
var MC_ATTR = [['copy', '复印件 / 扫描件'], ['origin', '原件']];
var MC_MAX = 10;

function mcRow(x) {
  x = x || {};
  var cw = x.crowds && x.crowds.length ? x.crowds : Object.keys(CROWD_S);
  return '<div class="mcx-r"><a data-mc-del title="去掉这一项">&times;</a>' +
    '<div class="mcx-g">' +
    '<input data-mc="mat_name" maxlength="40" value="' + esc(x.mat_name || '') +
    '" placeholder="材料名称，如：近半年社保缴纳记录">' +
    '<select data-mc="attr">' + MC_ATTR.map(function (a) {
      return '<option value="' + a[0] + '"' + ((x.attr || 'copy') === a[0] ? ' selected' : '') +
        '>' + a[1] + '</option>';
    }).join('') + '</select>' +
    '<input data-mc="copies" type="number" min="1" max="5" value="' + (x.copies || 1) +
    '" title="份数">' +
    '</div><div class="mcx-g2"><input data-mc="require_text" maxlength="200" value="' +
    esc(x.require_text || '') + '" placeholder="提交要求（选填），如：需加盖单位公章、三个月内开具"></div>' +
    '<div class="mcx-cw"><b>适用人群</b>' + Object.keys(CROWD_S).map(function (k) {
      var on = cw.indexOf(k) >= 0;
      return '<label' + (on ? ' class="on"' : '') + '><input type="checkbox" data-mc-cw="' + k +
        '"' + (on ? ' checked' : '') + '>' + CROWD_S[k] + '</label>';
    }).join('') + '</div></div>';
}

function mcRead(scope) {
  return $$('.mcx-r', scope).map(function (r) {
    var g = function (k) { var e = $('[data-mc=' + k + ']', r); return e ? e.value.trim() : ''; };
    var cw = $$('[data-mc-cw]', r).filter(function (b) { return b.checked; })
      .map(function (b) { return b.dataset.mcCw; });
    return { mat_name: g('mat_name'), attr: g('attr'), copies: +g('copies') || 1,
      require_text: g('require_text'), provide_way: ['upload', 'carry'], crowds: cw };
  }).filter(function (x) { return x.mat_name; });
}

/* 打开定制弹窗。fvid＝平台清单版本；cur＝已有定制 {add,skip}；
   save(data) 返回 Promise，由调用方决定是落到接口还是先存进新增向导的草稿。 */
function matCustomBox(fvid, cur, save) {
  cur = cur || {};
  var curAdd = cur.add || [];
  var skip = (cur.skip || []).map(Number);
  return api('/ops/fullver?id=' + fvid).then(function (d) {
    var items = d.items || [];
    var f = d.fullver;
    var body =
      '<div class="note" style="margin-bottom:12px">' +
      '<b>' + esc(f.country) + ' · ' + esc(f.ver_no) + '</b> 平台统一清单共 ' + items.length +
      ' 项，其中必交 ' + items.filter(function (i) { return i.necessity === 'must'; }).length +
      ' 项。<div class="hint">必交材料为该目的国送签的基本要求，不可取消；' +
      '建议材料可根据本产品实际受理口径停用；本公司另有要求的材料请在下方补充，' +
      '客户端将标注「本供应商额外要求」。<b>调整仅对调整后新产生的订单生效</b>，' +
      '已成交订单按下单时的清单快照执行。</div></div>' +
      '<div class="mcx-sum" id="mc-sum"></div>' +
      /* 弹窗宽度有限，五列会把最关键的「本产品是否收取」挤进横向滚动区，
         调整清单的人第一眼看不到该点哪儿。适用人群在这里不影响判断，去掉。 */
      '<h4 class="mcx-h">平台清单</h4>' +
      table(['材料名称', '必要性', '属性 / 份数', '本产品是否收取'], items, function (i) {
        var off = skip.indexOf(i.id) >= 0;
        return '<td><b>' + esc(i.mat_name) + '</b>' +
          (i.require_text ? '<div class="hint" style="max-width:320px">' +
            esc(i.require_text) + '</div>' : '') + '</td>' +
          '<td class="nw">' + (i.necessity === 'must'
            ? '<span class="tag bad">必须</span>' : '<span class="tag plain">建议</span>') + '</td>' +
          '<td class="nw hint">' + esc(i.attr_text) + ' · ' + i.copies + ' 份' +
          '<div class="hint">' + i.crowds.map(function (x) {
            return CROWD_S[x] || x;
          }).join(' / ') + '</div></td>' +
          '<td class="nw">' + (i.necessity === 'must'
            ? '<span class="hint">必交，不可取消</span>'
            : '<label class="mcx-off"><input type="checkbox" data-mc-skip="' + i.id + '"' +
              (off ? ' checked' : '') + '>本产品不收取</label>') + '</td>';
      }, '该版本暂无材料项') +
      '<h4 class="mcx-h">本公司补充材料 <span>最多 ' + MC_MAX + ' 项</span></h4>' +
      '<div class="mcx" id="mc-add">' + curAdd.map(mcRow).join('') + '</div>' +
      '<div class="flw-op"><button type="button" class="btn sm" data-mc-add>+ 追加材料项</button>' +
      '</div><div class="hint" style="margin-top:6px">补充材料一律按「建议材料」下发。' +
      '使领馆未作要求的材料若标为必交，将影响申请人对材料范围的判断，亦不利于后续争议处理；' +
      '非必要的提示性内容，建议填写至产品的「受理范围说明」。</div>';

    var mo = modal('本产品材料清单调整', body, [
      { t: '取消' },
      { t: '保存', cls: 'p', fn: function (mask) {
        var add = mcRead(mask);
        if (add.length > MC_MAX) return toast('最多追加 ' + MC_MAX + ' 项', true), false;
        var bad = add.filter(function (x) { return !x.crowds.length; });
        if (bad.length) return toast('「' + bad[0].mat_name + '」至少要选一类适用人群', true), false;
        return save({ add: add, skip: mcSkip(mask) });
      } }
    ], true);
    mcBind(mo.mask, items);
  });
}

function mcSkip(scope) {
  return $$('[data-mc-skip]', scope).filter(function (b) { return b.checked; })
    .map(function (b) { return +b.dataset.mcSkip; });
}

function mcBind(mask, items) {
  var box = $('#mc-add', mask);
  var sum = function () {
    var off = mcSkip(mask).length, add = $$('.mcx-r', box).length;
    $('#mc-sum', mask).innerHTML = '本产品实际下发 <b>' + (items.length - off + add) +
      '</b> 项：平台清单 ' + items.length + ' 项' +
      (off ? '，停用建议材料 <b class="bad">' + off + '</b> 项' : '') +
      (add ? '，本公司补充 <b>' + add + '</b> 项' : '');
  };
  var bindDel = function () {
    $$('[data-mc-del]', box).forEach(function (a) {
      a.onclick = function () { a.closest('.mcx-r').remove(); bindDel(); sum(); };
    });
    /* 人群 chip 的选中态：勾选框本身被样式藏起来了，靠 label.on 表达 */
    $$('[data-mc-cw]', box).forEach(function (b) {
      b.onchange = function () { b.closest('label').classList.toggle('on', b.checked); };
    });
  };
  bindDel();
  $$('[data-mc-skip]', mask).forEach(function (b) { b.onchange = sum; });
  $('[data-mc-add]', mask).onclick = function () {
    if ($$('.mcx-r', box).length >= MC_MAX) return toast('最多追加 ' + MC_MAX + ' 项', true);
    box.insertAdjacentHTML('beforeend', mcRow(null));
    bindDel(); sum();
  };
  sum();
}

/* ============================================================
   受理居住地范围（唐美芳 2026-09-04）
   「部分国家严控只能在指定区域才能办理签证。对于日本签证，严格依据居住地受理
   是官方的硬性规定——客人住北京却买了『上海送签』的日本签证产品，是办不成的。」
   所以产品要能声明「只受理哪些省份居住的申请人」。留空＝全国受理。
   做成通用能力而不是给日本开后门：韩国、意大利这些按领区划分的国家都用得上。
   ============================================================ */
function provBox(id, cur, opts, dis) {
  cur = cur || [];
  var all = !cur.length;
  return '<div class="prov" id="' + id + '">' +
    '<label class="prov-all"><input type="checkbox" data-prov-all' +
    (all ? ' checked' : '') + (dis || '') + '>' +
    '<b>全国受理</b><i>不限制申请人居住地</i></label>' +
    '<div class="prov-grid' + (all ? ' off' : '') + '">' +
    (opts || []).map(function (v) {
      return '<label' + (cur.indexOf(v) >= 0 ? ' class="on"' : '') + '>' +
        '<input type="checkbox" data-prov="' + esc(v) + '"' +
        (cur.indexOf(v) >= 0 ? ' checked' : '') + (dis || '') + '>' + esc(v) + '</label>';
    }).join('') + '</div></div>';
}
function provRead(scope, id) {
  var box = $('#' + id, scope);
  if (!box) return undefined;
  if (($('[data-prov-all]', box) || {}).checked) return [];
  return $$('[data-prov]', box).filter(function (b) { return b.checked; })
    .map(function (b) { return b.dataset.prov; });
}
function provBind(scope, id) {
  var box = $('#' + id, scope);
  if (!box) return;
  var grid = $('.prov-grid', box), all = $('[data-prov-all]', box);
  all.onchange = function () {
    grid.classList.toggle('off', all.checked);
    /* 勾了全国就把下面的清空——留着一堆选中的省却按全国受理算，
       下次打开会以为限制还在 */
    if (all.checked) {
      $$('[data-prov]', box).forEach(function (b) {
        b.checked = false; b.closest('label').classList.remove('on');
      });
    }
  };
  $$('[data-prov]', box).forEach(function (b) {
    b.onchange = function () {
      b.closest('label').classList.toggle('on', b.checked);
      /* 手点了具体省份，「全国受理」自动取消——两者是互斥的 */
      if (b.checked && all.checked) { all.checked = false; grid.classList.remove('off'); }
    };
  });
}

/* ============================================================
   材料明细 · 按适用人群分档展示
   唐美芳 2026-09-04（语音）：「直接根据适用人群去区分展示就好了」。
   原来 5 类人群挤在表格的一列里，一条产品 38 项、每项后面跟一串
   「在职/自由职业/学生/退休/儿童」——谁也看不出「一个在职的人到底要交几样」，
   而那恰恰是运营和供应商唯一真正要回答的问题。
   改成顶部按人群分档，选谁看谁；必交排在前面；我方办理的那几项单独标出来，
   免得被当成要催客人交的材料（客人手上根本没有）。
   UOM 与 UBK 两张详情页共用这一份，两端看同一条产品长得一样。
   ============================================================ */
var CROWD_ORDER = ['job', 'free', 'student', 'retire', 'child'];

function matCw() { return S.cache.matCw || 'all'; }
function matCwHit(i, k) { return k === 'all' || (i.crowds || []).indexOf(k) >= 0; }

function matCwBar(items) {
  var cur = matCw();
  return '<div class="cwbar">' +
    [['all', '全部（总表）']].concat(CROWD_ORDER.map(function (k) { return [k, CROWD_T[k]]; }))
      .map(function (x) {
        var n = items.filter(function (i) { return matCwHit(i, x[0]); }).length;
        return '<a data-cw="' + x[0] + '"' + (cur === x[0] ? ' class="on"' : '') + '>' +
          esc(x[1]) + '<i>' + n + '</i></a>';
      }).join('') + '</div>';
}

/* 选中人群的那批材料。必交排前面——客人第一眼该看到的是「不交就办不了的那些」，
   而不是按录入顺序把「房产证明」摆在「护照」前面。 */
function matCwPick(items) {
  var k = matCw();
  return items.filter(function (i) { return matCwHit(i, k); }).sort(function (a, b) {
    var m = (b.necessity === 'must' ? 1 : 0) - (a.necessity === 'must' ? 1 : 0);
    return m || ((a.sort || 0) - (b.sort || 0));
  });
}

function matCwSum(list) {
  var k = matCw();
  var must = list.filter(function (i) { return i.necessity === 'must'; }).length;
  var ours = list.filter(function (i) { return i.by_us; }).length;
  var sup = list.filter(function (i) { return i.by_sup; }).length;
  return '<div class="cwsum">' +
    (k === 'all' ? '全部人群的<b>总表</b>共 ' : CROWD_T[k] + '实际需提交 ') +
    '<b>' + list.length + '</b> 项：必交 <b class="bad">' + must + '</b> 项 · 建议 ' +
    (list.length - must) + ' 项' +
    (ours ? ' · 其中 <b>' + ours + '</b> 项由办理方在办理过程中产出，无须客户提交' : '') +
    (sup ? ' · <b>' + sup + '</b> 项为本供应商额外要求' : '') +
    (k === 'all' ? '<s>总表为本清单的全集。客户下单后系统按其所属人群自动裁剪，' +
      '仅展示与其身份相关的材料。点击上方人群可查看裁剪结果。</s>' : '') + '</div>';
}

/* 两端共用的材料明细表。选定具体人群时不再摆「适用人群」列——
   那一列此时每行都是同一个值，纯占地方。 */
var MAT_COLS_ALL = ['资料名称', '必要性', '属性', '提供方式', '份数', '适用人群', '提交要求'];
var MAT_COLS_ONE = ['资料名称', '必要性', '属性', '提供方式', '份数', '提交要求'];
function matTable(list) {
  var all = matCw() === 'all';
  return table(all ? MAT_COLS_ALL : MAT_COLS_ONE, list, function (i) {
    return '<td style="min-width:170px"><b>' + esc(i.mat_name) + '</b>' +
      (i.by_sup ? ' <span class="tag info">本公司额外要求</span>' : '') +
      (i.by_us ? ' <span class="tag warn">我方办理</span>' : '') + '</td>' +
      '<td class="nw">' + (i.necessity === 'must'
        ? '<span class="tag bad">必交</span>' : '<span class="tag plain">建议</span>') + '</td>' +
      '<td class="nw hint">' + esc(i.attr_text || (i.attr === 'origin' ? '原件' : '复印件')) + '</td>' +
      '<td class="nw hint">' + esc(i.way_text ||
        (i.provide_way || []).map(function (w) { return WAY_T[w] || w; }).join(' / ')) + '</td>' +
      '<td class="num">' + i.copies + '</td>' +
      (all ? '<td class="nw hint">' + (i.crowds || []).map(function (x) {
        return CROWD_S[x] || x;
      }).join('/') + '</td>' : '') +
      '<td class="hint" style="max-width:320px;white-space:normal">' +
      esc(i.require_text || '') + '</td>';
  }, matCw() === 'all' ? '该版本暂无材料项' : CROWD_T[matCw()] + '不需要提交任何材料，请检查清单的人群设置');
}

/* 切人群整页重绘，跟主页签（data-ut）用的是同一套做法：
   材料明细是详情页里唯一按人群变的块，为它单独做局部刷新不划算。 */
function matCwBind(m, redraw) {
  $$('[data-cw]', m).forEach(function (a) {
    a.onclick = function () { S.cache.matCw = a.dataset.cw; (redraw || reload)(); };
  });
}

/* 新增 / 编辑产品页里那行清单定制摘要。没定制过就说清楚「按平台原版收」，
   不留空——空着看不出是没定制还是没生效。 */
function wizMcSum(o) {
  var mc = o && o.mat_custom;
  if (!mc || (!(mc.add || []).length && !(mc.skip || []).length)) {
    return '本产品按所选清单版本执行。如需停用部分建议材料，或补充本公司要求的材料，请点击下方按钮调整。';
  }
  var t = [];
  if ((mc.skip || []).length) t.push('停用建议材料 <b class="bad">' + mc.skip.length + '</b> 项');
  if ((mc.add || []).length) t.push('本公司补充 <b>' + mc.add.length + '</b> 项');
  return '本产品清单已调整：' + t.join('，') + '。';
}

/* 把平台清单与本产品定制合成一份「客人实际会收到的清单」，详情页照它展示。
   后端 checklist_for() 是同一套规则，两边算出来的必须一致——
   页面上说收 39 项、客人那儿收 37 项，是最难查的那类不一致。 */
function mcMerge(items, cur) {
  cur = cur || {};
  var skip = (cur.skip || []).map(Number);
  var out = (items || []).filter(function (i) {
    return i.necessity === 'must' || skip.indexOf(i.id) < 0;
  }).map(function (i) { return i; });
  (cur.add || []).forEach(function (x, n) {
    out.push({ id: -(n + 1), mat_name: x.mat_name, attr: x.attr,
      attr_text: (x.attr === 'origin' ? '原件' : '复印件'),
      way_text: '电子上传/面试携带', copies: x.copies || 1, necessity: 'suggest',
      require_text: x.require_text || '', crowds: x.crowds || Object.keys(CROWD_S),
      sort: 900 + n, by_sup: 1 });
  });
  return out;
}

/* ================= 供应商：首页工作台 ================= */
var UBK_TOOLS = [
  ['products', '新增产品上架', 'M12 5v14M5 12h14'],
  ['products', '材料收件地址', 'M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z'],
  ['orders', '进度回传', 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
  ['orders', 'SLA 超期工单', 'M12 8v5M12 16h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'],
  ['settle', '结算单据', 'M7 3h10v18H7zM10 8h4M10 12h4'],
  ['home', '经营数据看板', 'M4 20V10M10 20V4M16 20v-7M22 20H2']
];
var UBK_NOTICE = [
  ['2026-08-24', '美国签证北京领区面签号源紧张，请如实回传预约结果并同步风险'],
  ['2026-08-22', '新版结算单据已启用，对账口径按结算价计，请核对后再确认'],
  ['2026-08-19', '产品材料版本沿用平台清单版本，平台更新后将自动生效'],
  ['2026-08-16', 'SLA 超期将计入供应商季度考核，超期请补充说明原因']
];

VIEWS['ubk:home'] = function (m) {
  return Promise.all([api('/sup/orders'), api('/sup/products'), api('/sup/settle')]).then(function (a) {
    var wo = a[0], pd = a[1].list, st = a[2];
    var todo = wo.list.filter(function (w) { return PORD(w.progress) < 7 && w.status !== 'done'; });
    var over = wo.list.filter(function (w) { return w.overdue; });
    var sent = wo.list.filter(function (w) { return PORD(w.progress) >= 7 && !w.visa_result; });
    var onC = pd.filter(function (p) { return p.to_c; }).length;
    var draft = pd.filter(function (p) { return p.status !== 'published'; }).length;

    m.innerHTML = pageH('首页工作台',
      '优耐德签证 · 供应商门户。左侧四个菜单对应供应商的完整闭环：' +
      '<b>产品管理</b>上品并选定上架范围 → <b>订单管理</b>接单回传进度 → <b>预付款管理</b>与平台对账收款。') +
      '<div class="wsplit"><div>' +
      '<div class="grid" style="margin-bottom:12px">' +
      '<div class="stat' + (todo.length ? ' hot' : '') + '"><b>' + todo.length + '</b><span>待处理工单</span></div>' +
      '<div class="stat"><b>' + sent.length + '</b><span>已递交待出结果</span></div>' +
      '<div class="stat' + (over.length ? ' hot' : '') + '"><b>' + over.length + '</b><span>SLA 超期</span></div>' +
      '<div class="stat"><b>¥' + money(wo.sum_income) + '</b><span>在办订单收入</span></div>' +
      '<div class="stat"><b>¥' + money(wo.sum_profit) + '</b><span>在办订单毛利</span></div>' +
      '<div class="stat' + (st.open ? ' hot' : '') + '"><b>¥' + money(st.open) + '</b><span>待平台结算</span></div>' +
      '<div class="stat"><b>' + pd.length + '</b><span>在售产品</span></div>' +
      '<div class="stat"><b>' + onC + ' / ' + pd.length + '</b><span>已上 C 端</span></div></div>' +

      card('近 14 日接单趋势 <span>按平台派单日期聚合本供应商工单</span>',
        trendBars(wo.list, 14) +
        '<div class="chart-ft"><span><b>' + wo.list.length + '</b>累计接单</span>' +
        '<span><b>¥' + money(wo.sum_income) + '</b>累计结算收入</span>' +
        '<span><b>' + (wo.sum_income ? Math.round(wo.sum_profit / wo.sum_income * 100) : 0) +
        '%</b>综合毛利率</span></div>') +

      card('今日待办', '<div class="pad">' + (
        /* 待办文案统一改为陈述式的官方口吻（唐美芳 2026-09-07：
           「口语化的表达文案需要整体替换成专业严谨官方的表达」）。 */
        (todo.length ? item('待处理工单 ' + todo.length + ' 个', '客户材料已由运营审核通过，请按办理节点回传进度。', 'orders') : '') +
        (over.length ? item('SLA 超期工单 ' + over.length + ' 个', '超期将计入供应商考核，请优先处理并说明原因。', 'orders') : '') +
        (draft ? item('待完善产品 ' + draft + ' 个', '补齐套餐报价并提交上架审核后，方可在各销售渠道展示。', 'products') : '') +
        (st.open ? item('待平台结算 ¥' + money(st.open), '请核对结算单据金额，并与财务完成对账收款。', 'settle') : '')
        || '<div class="empty">当前无待办事项</div>') + '</div>') +

      card('金额口径说明 <span>供应商视角</span>', '<div class="pad"><div class="note">' +
        '本门户所有金额均按<b>供应商视角</b>列示：<b>收入</b> = 平台应付本方的结算价；' +
        '<b>成本</b> = 使领馆签证费等硬性支出；<b>毛利</b> = 收入 − 成本。' +
        '客户端零售成交价属于渠道定价，不对供应商开放。</div></div>') +
      '</div><aside>' +
      card('常用工具', '<div class="tgrid">' + UBK_TOOLS.map(function (t) {
        return '<a data-tool="' + t[0] + '"><i>' + svg(t[2]) + '</i>' + esc(t[1]) + '</a>';
      }).join('') + '</div>') +
      card('平台通知', '<div class="ntc">' + UBK_NOTICE.map(function (n) {
        return '<div><s>' + n[0] + '</s><p>' + esc(n[1]) + '</p></div>';
      }).join('') + '</div>') +
      '</aside></div>';

    function item(t, d, g) {
      return '<div class="todoline"><div><b>' + esc(t) + '</b><s>' + esc(d) + '</s></div>' +
        '<button class="btn sm p" data-go="' + g + '">去处理</button></div>';
    }
    $$('[data-go]', m).forEach(function (b) { b.onclick = function () { go(b.dataset.go); }; });
    $$('[data-tool]', m).forEach(function (a) { a.onclick = function () { go(a.dataset.tool); }; });
  });
};

/* ================= 供应商：订单管理 ================= */
/* 供应商订单列表 2026-08-31 从「工单粒度」改成「订单粒度」，跟 UOM / CSP 用同一套七段渲染。
   唐美芳：「ubk 里的订单管理是不是和 csp、uom 订单管理有点脱节了，我看状态不太一样」。
   原来这里列的是工单（一个办签人一张 VW 单），菜单却叫「订单列表」——
   供应商跟平台对账说「这张订单」，两边指的不是一个东西。
   工单没有消失：它变成订单行里的办签人明细，回传进度仍然按人。 */
VIEWS['ubk:orders'] = function (m) {
  return api('/sup/orderlist').then(function (j) {
    var q = srchCard('ubkord', [
      { k: 'no', t: '订单号', ph: '支持模糊查询' },
      { k: 'product', t: '签证产品', type: 'sel',
        opts: uniqOpts(j.list, function (o) { return o.product; }) },
      { k: 'pkg', t: '套餐', type: 'sel', opts: uniqOpts(j.list, function (o) { return o.pkg; }) },
      { k: 'settle_text', t: '结算状态', type: 'sel',
        opts: uniqOpts(j.list, function (o) { return o.settle_text; }) },
      /* 办理状态与办签进度是独立于订单状态的另外两条线，做成可叠加的筛选项 */
      {
        k: 'work', t: '办理状态', type: 'sel',
        opts: [['未开始', '未开始'], ['办理中', '办理中'], ['已完成', '已完成']],
        get: function (o) { return o.work_status || '未开始'; }
      },
      {
        k: 'node', t: '办签进度', type: 'sel',
        opts: [['mat', '待收材料'], ['run', '材料已收'],
        ['sent', '已递交待出结果'], ['res', '已出结果'], ['na', '未开始']],
        get: function (o) {
          if (o.status !== 'paid' && o.status !== 'done') return 'na';
          if ((o.applicants || []).some(function (a) {
            return a.progress === 'P6';
          })) return 'res';
          if ((o.applicants || []).some(function (a) {
            return a.progress === 'P5';
          })) return 'sent';
          return o.work_status === '未开始' ? 'mat' : 'run';
        }
      }
    ]);
    var hit = q.filter(j.list);
    function anyP(o, f) { return (o.applicants || []).some(f); }
    /* 页签 = 订单状态，只有这 5 个值（唐美芳 2026-08-31：
       「之前不是说就5个么，你怎么还是把订单状态与签证办理状态混在一起了」）。
       原来这条页签里「待收材料 / 办理中 / 已递交待出结果 / 已出结果」是办签进度，
       跟「已完成 / 退款取消」这些订单状态并排放，两条线互相不互斥：
       一张单可以既「已付款」又「已递交待出结果」，点哪个都对也都不全。
       办签进度移到上面的查询卡当筛选项，能跟订单状态叠加着查。 */
    var t = subTabs('ubkord', [
      { k: 'all', t: '全部', fn: function () { return true; } },
      { k: 'created', t: '待付款', fn: function (o) { return o.status === 'created'; } },
      { k: 'paid', t: '已付款', fn: function (o) { return o.status === 'paid'; } },
      { k: 'done', t: '已完成', fn: function (o) { return o.status === 'done'; } },
      { k: 'refunded', t: '已退款', fn: function (o) { return o.status === 'refunded'; } },
      { k: 'cancelled', t: '已取消', fn: function (o) { return o.status === 'cancelled'; } }
    ], hit);
    var so = sorter('ubkord', [
      ['结算收入', function (o) { return o.settle_amount || 0; }],
      ['下单时间', function (o) { return o.created_at || ''; }]
    ]);
    var pg = pager('ubkord', so.sort(t.rows), 8);

    m.innerHTML = pageH(menuName('orders', '订单管理'),
      '结构与平台、门店的订单列表一致——一行一张订单，办签人明细在「订单状态」段里。' +
      esc(j.note)) +
/* 操作说明整块撤掉（唐美芳 2026-09-04：「ubk 里页面的操作说明都先去掉吧」）。
   页面顶部保留一句话说明；供应商是外部用户，不需要我们把内部作业规范摆给他看。 */
      olSum(t.rows, 'ubk') + q.html +
      '<div class="card">' + t.html + '<div class="pad scrollx">' +
      olTable(pg.rows, {
        view: 'ubk',
        actions: function (o) {
          var b = [];
          (o.applicants || []).forEach(function (a) {
            if (a.wo_no && a.state !== 'refunded' && a.progress !== 'P6')
              b.push('<button class="btn sm" data-wp="' + esc(a.wo_no) + '">' +
                esc(a.name) + ' · 回传进度</button>');
          });
          var od = (o.applicants || []).filter(function (a) { return a.overdue; }).length;
          return '<div class="btns">' +
            (od ? '<span class="hint" style="margin-right:auto;color:var(--bad)">' +
              od + ' 位办签人 SLA 已超期</span>' : '') +
            (b.length ? b.join('') : '<span class="hint">无待回传的办签人</span>') + '</div>';
        }
      }) + '</div>' + pg.html + '</div>';

    function rl() { S.cache['pg:ubkord'] = 1; reload(); }
    q.bind(m, rl); t.bind(m, rl); so.bind(m, rl); pg.bind(m, reload);
    /* 点产品名 → 供应商自己的产品详情（唐美芳 2026-09-08） */
    $$('[data-olpd]', m).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation(); S.cache.ubkPdBack = 'orders'; go('product', b.dataset.olpd);
      };
    });
    $$('[data-oldet]', m).forEach(function (b) {
      b.onclick = function () { go('odetail', b.dataset.oldet); };
    });
    $$('[data-wp]', m).forEach(function (b) {
      b.onclick = function () {
        var no = b.dataset.wp;
        var cur = null;
        j.list.forEach(function (o) {
          (o.applicants || []).forEach(function (a) { if (a.wo_no === no) cur = a; });
        });
        var keys = PROG.map(function (x) { return x[0]; });
        var ci = keys.indexOf(cur ? cur.progress : 'P1');
        var opt = PROG.filter(function (x) {
          return ['P5', 'P6'].indexOf(x[0]) >= 0 && keys.indexOf(x[0]) > ci;
        });
        if (!opt.length)
          return toast('当前节点「' + (cur ? cur.progress_text : '') + '」没有可回传的下一步', true);
        ask('回传办理进度 · ' + no, [
          { type: 'html', html: '<div class="note">供应商只负责送签环节，可回传' +
            '<b>已递交 / 行政审查 / 已出结果</b>三个节点，且只能往前推。</div><br>' },
          { k: 'progress', label: '推进到', type: 'select',
            options: opt.map(function (x) { return { v: x[0], t: x[1] }; }) },
          { k: 'note', label: '备注', type: 'textarea', rows: 2 }
        ], '回传', function (f) {
          return api('/sup/progress', { no: no, progress: f.progress, note: f.note });
        }).then(function () { toast('已回传'); reload(); }).catch(function () { /* 失败已提示，弹窗保留 */ });
      };
    });
  });
};
function PORD(p) { return PROG.map(function (x) { return x[0]; }).indexOf(p) + 1; }

/* ================= 供应商：结算对账 ================= */
/* 「预付款管理」2026-08-31 按众信截图重做，移到 v-settle3.js */

/* ================= UOM · 平台配置：数据看板 ================= */
VIEWS['ops:dash'] = function (m) {
  return Promise.all([api('/ops/stats'), api('/ops/orders')]).then(function (r) {
    var s = r[0], ords = r[1].list;
    var maxP = Math.max.apply(null, Object.keys(s.by_progress).map(function (k) { return s.by_progress[k]; })) || 1;
    var CH = { C: '直客 C 端', CSP: '门店 CSP', B: '同业 B 端' };
    var byCh = {};
    ords.forEach(function (o) {
      var k = CH[o.channel] || o.channel;
      byCh[k] = byCh[k] || { n: 0, amt: 0 };
      byCh[k].n++; byCh[k].amt += o.amount;
    });
    var maxCh = Math.max.apply(null, Object.keys(byCh).map(function (k) { return byCh[k].amt; })) || 1;
    m.innerHTML = pageH('数据看板', '经营与风险两条线：左边看规模，右边看卡点。') +
      '<div class="grid" style="margin-bottom:16px">' +
      '<div class="stat"><b>' + s.orders + '</b><span>订单总数</span></div>' +
      '<div class="stat"><b>¥' + money(s.gmv) + '</b><span>已确认收款 GMV</span></div>' +
      '<div class="stat"><b>' + s.applicants + '</b><span>办签人数</span></div>' +
      '<div class="stat"><b>' + s.wo_open + '</b><span>在办工单</span></div>' +
      '<div class="stat' + (s.wo_overdue ? ' hot' : '') + '"><b>' + s.wo_overdue + '</b><span>超期工单</span></div>' +
      '<div class="stat' + (s.pending_pay ? ' hot' : '') + '"><b>' + s.pending_pay + '</b><span>待财务确认到账</span></div>' +
      '<div class="stat' + (s.supp_open ? ' hot' : '') + '"><b>' + s.supp_open + '</b><span>补料进行中</span></div>' +
      '<div class="stat' + (s.refund_open ? ' hot' : '') + '"><b>' + s.refund_open + '</b><span>退款处理中</span></div>' +
      '<div class="stat"><b>¥' + money(s.payable_open) + '</b><span>应付供应商</span></div>' +
      '<div class="stat"><b>¥' + money(s.advance) + '</b><span>累计垫付</span></div></div>' +
      '<div class="wsplit"><div>' +
      card('近 14 日成交金额趋势 <span>按下单日期聚合全平台订单</span>',
        trendBars(ords, 14, null, function (o) { return o.amount; }) +
        '<div class="chart-ft"><span><b>' + ords.length + '</b>累计订单</span>' +
        '<span><b>¥' + money(s.gmv) + '</b>已确认收款 GMV</span>' +
        '<span><b>¥' + money(ords.length ? Math.round(s.gmv / ords.length) : 0) + '</b>笔均金额</span></div>') +
      card('办签人进度分布 <span>看链路堵在哪一段</span>', '<div class="pad">' +
        Object.keys(s.by_progress).map(function (k) {
          var n = s.by_progress[k];
          return '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">' +
            '<span style="width:110px;font-size:12.5px;color:#475467">' + esc(k) + '</span>' +
            '<div style="flex:1;height:10px;background:#F1F3F7;border-radius:5px;overflow:hidden">' +
            '<div style="height:100%;width:' + (n * 100 / maxP) + '%;background:#0E2A47"></div></div>' +
            '<b style="width:28px;text-align:right">' + n + '</b></div>';
        }).join('') + '</div>') +
      '</div><aside>' +
      card('渠道结构 <span>成交金额占比</span>', '<div class="pad">' +
        Object.keys(byCh).map(function (k) {
          var v = byCh[k];
          return '<div class="chrow"><div class="t"><span>' + esc(k) + '</span>' +
            '<b>¥' + money(v.amt) + '</b></div>' +
            '<div class="bar"><i style="width:' + (v.amt * 100 / maxCh) + '%"></i></div>' +
            '<s>' + v.n + ' 笔 · 笔均 ¥' + money(Math.round(v.amt / v.n)) + '</s></div>';
        }).join('') + '</div>') +
      '</aside></div>';
  });
};

/* ================= UOM · 平台配置：三层链路导航条 =================
   它回答的是「我现在在哪一层、上下游是谁」，是导航不是步骤。
   一个页面上只能有一处讲步骤，那就是下面的「操作说明」，
   所以这里不写「第 N 步」、不放大段解释，压成一行可点的链路。 */
/* 这四步是串联的，先后顺序不能颠倒：
   官方表格决定了「这条签证要填哪些格」，而填表要靠 OCR 自动填，就反过来决定了
   「客户必须交哪几份证件」——护照资料页、身份证、在职证明这些不是走流程收的，
   是为了把那 34 格自动填掉才收的。所以必须先有表格模板，材料清单才知道打底该收什么。
   第四位是「本节点与下一个节点之间用什么连接符」。 */
var CFGCHAIN = [
  /* 副标题写这一步「产出什么」，不写口语化的设问
     （唐美芳 2026-09-01：操作说明要用官方专业的口吻）。 */
  ['forms', '国家签证表模板', '定义表单字段', '›'],
  ['samples', '材料样例库', '维护材料范本', '›'],
  ['fullvers', '国家送签材料库', '定义材料清单', '›'],
  ['prodb', 'B 端上架审核', 'CSP 渠道准入', '·'],
  ['prodc', 'C 端上架审核', '小程序渠道准入', '']
];
function cfgChain(cur) {
  return '<div class="chainbar">' + CFGCHAIN.map(function (x, i) {
    return (i ? '<span class="arw">' + CFGCHAIN[i - 1][3] + '</span>' : '') +
      '<a class="node' + (x[0] === cur ? ' on' : '') + '" data-cg="' + x[0] + '">' +
      esc(x[1]) + '<i>' + esc(x[2]) + '</i></a>';
  }).join('') + '</div>';
}
function bindChain(m) {
  $$('[data-cg]', m).forEach(function (d) { d.onclick = function () { go(d.dataset.cg); }; });
}

/* ================= UOM · 平台配置：材料样例库 ================= */
/* 适用范围的展示口径（列表列、下拉项文案共用一套，避免两处写出不同说法）。
   唐美芳 2026-09-07 加的字段：空国家＝各国通用，有国家无类型＝该国全部签证类型。 */
function smpScope(t) {
  var cs = t.countries || [], vs = t.visa_types || [];
  if (!cs.length) return '<span class="tag plain">通用</span>';
  /* 国家可能勾很多个（申根一片），全列会把列撑开：列出前 3 个，其余折成「等 N 个」，
     完整列表挂在 title 上，鼠标悬停可见。 */
  var head = cs.slice(0, 3).map(function (v) {
    return '<span class="tag info">' + esc(v) + '</span>';
  }).join(' ');
  if (cs.length > 3) {
    head += ' <span class="tag plain" title="' + esc(cs.join('、')) + '">等 ' +
      cs.length + ' 个</span>';
  }
  return head + (vs.length
    ? '<div class="ts">' + esc(vs.join('、')) + '</div>' : '');
}

/* 挑出适用于某个清单版本（f: {country, visa_type}）的样例。
   排序：本国本类型专用 → 本国通用 → 各国通用，让最贴切的落在下拉最上面。 */
function smpPick(list, f, keepId) {
  var hit = (list || []).filter(function (s) {
    if (keepId && s.id === keepId) return true;          /* 已挂上的一律保留 */
    var cs = s.countries || [], vs = s.visa_types || [];
    if (!cs.length) return true;                          /* 各国通用 */
    if (cs.indexOf(f.country) < 0) return false;
    return !vs.length || !f.visa_type || vs.indexOf(f.visa_type) >= 0;
  });
  function rank(s) {
    if ((s.countries || []).length && (s.visa_types || []).length) return 0;
    if ((s.countries || []).length) return 1;
    return 2;
  }
  hit.sort(function (a, b) { return rank(a) - rank(b) || a.id - b.id; });
  return hit.map(function (s) {
    var cs = s.countries || [], vs = s.visa_types || [];
    var sc = !cs.length ? '通用'
      : (cs.length > 2 ? cs.slice(0, 2).join('、') + ' 等 ' + cs.length + ' 国' : cs.join('、')) +
        (vs.length ? ' · ' + vs.join('、') : '');
    return { v: String(s.id), t: s.name + '（' + sc + '）' };
  });
}

VIEWS['ops:samples'] = function (m) {
  return api('/ops/samples').then(function (j) {
    var q = srchCard('opssmp', [
      {
        k: 'kw', t: '编码 / 模版名称', ph: '支持模糊查询',
        get: function (t) { return (t.code || '') + ' ' + t.name; }
      },
      { k: 'mat_name', t: '对应资料名称', type: 'sel', opts: uniqOpts(j.list, function (t) { return t.mat_name; }) },
      /* 适用国家筛选把「通用」单列成一个值：运营配日本清单时要看的是
         「日本专用 + 通用」两拨，只按国家筛会漏掉通用件。 */
      {
        k: 'country', t: '适用国家', type: 'sel', multi: true,
        opts: [['__all__', '通用（不限国家）']].concat((j.countries || []).map(function (v) {
          return [v, v];
        })),
        /* 多选之后一条样例可能落在多个国家上，下拉要按「包含」匹配（srchCard 的 multi）。
           通用件用 __all__ 这个哨兵值单列，否则按国家筛会把它们全过滤掉。 */
        get: function (t) { return (t.countries || []).length ? t.countries : ['__all__']; }
      },
      {
        k: 'has', t: '样例附件', type: 'sel', opts: [['y', '已上传'], ['n', '未上传']],
        get: function (t) { return (t.files || []).length ? 'y' : 'n'; }
      }
      /* 「被引用几次」是数值，做成可排序列而不是下拉筛选：
         运营要的是「哪些模版没人用」，点一下表头升序排就在最前面。 */
    ]);
    /* 材料样例没有业务状态（不存在待审、生效、作废这类流转），
       所以这里不该有状态页签——「有没有附件、被引用几次」是筛选条件，不是状态。 */
    var so = sorter('opssmp', [
      ['引用清单数', function (t) { return t.used || 0; }]
    ].concat(AUD_SORTS));
    var hit = so.sort(q.filter(j.list));
    var pg = pager('opssmp', hit, 10);
    m.innerHTML = pageH('材料样例库',
      '维护合格材料的标准范本：在职证明模板、资金证明范例、照片规格图。' +
      '国家送签材料库的每一项都可以挂一个材料样例，客户提交材料时直接看到范例。' +
      '同一种资料各国要求不同的（照片规格、确认页），在适用国家中勾选全部适用国；' +
      '各国通用的（身份证复印件、银行流水）不勾选任何国家即可。',
      '<button class="btn p" data-new>新建</button>') +
      q.html +
      '<div class="card"><div class="pad">' + table(
        so.cols(['编码', '模版名称', '对应资料名称', '适用范围', '样例附件', '引用清单数']
          .concat(AUD_COLS, ['操作'])), pg.rows, function (t) {
          return '<td class="mono">' + esc(t.code || '') + '</td><td><b>' + esc(t.name) + '</b></td><td>' +
            esc(t.mat_name) + '</td><td class="nw">' + smpScope(t) + '</td><td>' + ((t.files || []).map(function (f) {
              return f.url ? '<a class="tag plain" href="' + esc(f.url) + '" target="_blank">' +
                esc(f.name) + '</a>' : '<span class="tag plain">' + esc(f.name || f) + '</span>';
            }).join(' ') || '<span class="hint">未上传</span>') +
            '</td><td class="num">' + (t.used ? t.used + ' 处' : '<span class="hint">未挂接</span>') +
            '</td>' + audTd(t) +
            '<td><div class="btns">' + sampleBtn({ sample: t }, 'btn sm') +
            '<button class="btn sm" data-e=\'' + jattr(t) + '\'>编辑</button>' +
            '<button class="btn sm r" data-d="' + t.id + '">删除</button></div></td>';
        }, '没有符合条件的材料样例') + '</div>' + pg.html + '</div>';
    q.bind(m, function () { S.cache['pg:opssmp'] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:opssmp'] = 1; reload(); });
    pg.bind(m, reload);

    function form(t) {
      return ask(t ? '编辑材料样例' : '新建材料样例', [
        { k: 'name', label: '模版名称', required: true, value: t && t.name, ph: '如：在职证明标准模板' },
        { k: 'mat_name', label: '对应资料名称', required: true, value: t && t.mat_name, ph: '如：在职证明', hint: '要与国家送签材料库里的资料名称一致，方便挂接' },
        /* 唐美芳 2026-09-07：「材料样例库应该加上国家字段吧，因为不同国家的护照样例是不一样的」。
           两个字段都可留空，空＝通用——身份证复印件、银行流水这类各国一样，
           强制填国家会逼运营为每个国家复制一份。 */
        /* 唐美芳 2026-09-07：「适用范围应该是多选框，现在是单选不符合业务侧使用」。
           一份范本常同时适用多个国家（申根各国的在职证明、日韩通用的照片规格），
           单选会逼运营把同一个文件复制很多份，改一次要改很多条。 */
        {
          k: 'countries', label: '适用国家（可多选）', type: 'checks',
          value: (t && t.countries) || [],
          options: (j.countries || []).map(function (v) { return { v: v, t: v }; }),
          hint: '照片规格、确认页这类各国要求不同的，勾选全部适用的国家；' +
            '一个都不勾选即为各国通用（身份证复印件、银行流水等）'
        },
        {
          k: 'visa_types', label: '适用签证类型（可多选）', type: 'checks',
          value: (t && t.visa_types) || [],
          options: (j.visa_types || []).map(function (v) { return { v: v, t: v }; }),
          hint: '仅在同一国家内不同签证类型要求不同时才需勾选（如留学签的资金证明口径与旅游签不同）；' +
            '不勾选即适用于所选国家的全部签证类型。勾选本项时须同时选择适用国家'
        },
        {
          k: 'files', label: '样例附件', type: 'file', multiple: true,
          value: (t && t.files) || [], accept: 'image/*,.pdf',
          hint: '客户端、门店端与专员审核页的「查看样例」将展示此处上传的文件'
        }
      ], '保存', function (f) {
        return api('/ops/sample/save', {
          id: t && t.id, name: f.name, mat_name: f.mat_name, files: f.files || [],
          countries: f.countries || [], visa_types: f.visa_types || []
        });
      }).then(function () { toast('已保存'); reload(); }).catch(function () { /* 失败已提示，弹窗保留 */ });
    }
    bindChain(m);
    bindSample(m);
    $('[data-new]', m).onclick = function () { form(null); };
    $$('[data-e]', m).forEach(function (b) { b.onclick = function () { form(JSON.parse(b.dataset.e)); }; });
    $$('[data-d]', m).forEach(function (b) {
      b.onclick = function () {
        confirmBox('删除材料样例', '已被材料清单引用的模版不允许删除。', '删除')
          .then(function () { return api('/ops/sample/del', { id: +b.dataset.d }); })
          .then(function () { toast('已删除'); reload(); }).catch(function () { /* 失败已提示，弹窗保留 */ });
      };
    });
  });
};

/* ================= UOM · 平台配置：国家送签材料库 ================= */
/* 国家送签材料库。原来只有运营（UOM）能进，2026-09-04 唐美芳（语音）要求
   「UBK 的系统新增产品需要把 UOM 里的国家材料库也有一个入口可以去添加，
   要同步挪到 UBK 里，跟 UOM 一模一样」，所以同一份页面两端共用。
   两端看到的不是同一批数据：供应商只看得到平台统一版本 + 自己建的，看不到同行的；
   平台版本对供应商只读（后端 fv_guard 同样拦，前端灰掉不是唯一防线）。 */
VIEWS['ubk:fullvers'] = VIEWS['ops:fullvers'] = function (m, id) {
  if (id) return fullverDetail(m, id);
  return api('/ops/fullvers').then(function (j) {
    var sel = function (a) { return a.map(function (v) { return [v, v]; }); };
    var q = srchCard('opsfv', [
      { k: 'kw', t: '版本号 / 清单名称', ph: '支持模糊查询', get: function (f) { return f.ver_no + ' ' + f.name; } },
      { k: 'country', t: '国家', type: 'sel', opts: sel(j.countries || []) },
      { k: 'visa_type', t: '签证类型', type: 'sel', opts: sel(j.visa_types || []) },
      {
        k: 'used', t: '引用状态', type: 'sel',
        opts: [['y', '已被引用'], ['n', '尚未引用']],
        get: function (f) { return (f.used_by || []).length ? 'y' : 'n'; }
      }
    ]);
    var hit = q.filter(j.list);
    var t = subTabs('opsfv', [
      { k: 'all', t: '全部', fn: function () { return true; } },
      { k: 'draft', t: '待发布', fn: function (f) { return f.status === 'draft'; } },
      { k: 'pub', t: '已发布', fn: function (f) { return f.status === 'published'; } },
      { k: 'wd', t: '已撤回', fn: function (f) { return f.status === 'withdrawn'; } }
    ], hit);
    /* 材料项数、被引用条数是数据列——运营要的是「哪个版本挂得最多」，
       不是逐个值去等于筛选，所以做成可排序表头。 */
    var so = sorter('opsfv', [
      ['材料项数', function (f) { return f.items || 0; }],
      ['关联签证产品', function (f) { return (f.used_by || []).length; }]
    ].concat(AUD_SORTS));
    var pg = pager('opsfv', so.sort(t.rows), 10);

    /* 同一个页面两端共用，说明与操作指引得各说各的：
       运营维护的是全平台口径，供应商维护的是自己那一套。 */
    var isSup = S.role === 'ubk';
    m.innerHTML = pageH('国家送签材料库',
      isSup
        ? '维护「某国某类签证需提交哪些材料」的标准清单，新增产品时绑定，申请人据此提交材料。' +
          '列表中<b>平台统一版本</b>由众信运营统一维护，供应商可直接选用，不可修改；' +
          '如本公司收料要求与平台不一致，请对该版本执行「复制新版」，' +
          '在副本基础上调整为<b>本公司自建</b>版本。自建版本仅本公司可见，' +
          '亦仅可用于本公司产品。'
        : '在这里维护「某国某类签证要交哪些材料」的标准清单，供后面的签证产品直接绑定。' +
          '此处录入的是<b>覆盖全部人群的总表</b>，客户下单后系统按在职 / 自由职业 / 学生 / 退休 / 儿童自动裁剪，' +
          '仅展示与其身份相关的材料。' +
          '<b>供应商也能在 UBK 建自己的版本</b>，归属列可区分，本页可代其修改。',
      /* 从新增 / 编辑产品页跳过来的，给一条回去的路——建完版本正是要回去选它
         （唐美芳 2026-09-07：「自己创建完了，再重新回来选择」）。 */
      (S.cache.fvFrom
        ? '<button class="btn" data-fvback>返回' +
          (S.cache.fvFrom === 'create' ? '新增产品' : '编辑产品') + '</button> ' : '') +
      '<button class="btn p" data-new>新建</button>') +
      q.html +
      '<div class="card">' + t.html + '<div class="pad">' + table(
        so.cols(['版本号', '清单名称', '归属', '国家', '签证类型', '关联表模板', '需提交材料',
          '状态', '关联签证产品'].concat(AUD_COLS, ['操作'])),
        pg.rows, function (f) {
          return '<td class="mono"><b>' + esc(f.ver_no) + '</b></td><td>' + esc(f.name) +
            '</td><td class="nw">' + (f.owner_org
              ? '<span class="tag ' + (f.mine ? 'info' : 'plain') + '">' +
                esc(f.mine ? '本公司自建' : f.owner_text) + '</span>'
              : '<span class="tag plain">平台统一</span>') +
            '</td><td class="nw">' + esc(f.country) + '</td><td>' + esc(f.visa_type || '—') +
            '</td><td style="min-width:150px">' + (f.form
              ? '<b>' + esc(formLabel(f.form)) + '</b>' +
                '<div class="hint mono">' + esc(f.form.ver_no) +
                (f.form.active ? '' : ' · <span class="tag warn">已禁用</span>') + '</div>'
              : '<span class="hint">未关联</span>') +
            /* 「项」是**要交的材料**，跟表模板的「格」（要填的表格字段）不是一回事；
               而且这个数是**全人群合集**，具体某位申请人按适用人群裁剪后只交其中一部分
               （唐美芳 2026-09-09 就是被这两个数字绕住了）。 */
            '</td><td class="num"><b>' + f.items + '</b> 项' +
            '<div class="hint nw">全人群合集</div>' +
            '</td><td>' +
            (f.status === 'published' ? '<span class="tag ok">已发布</span>'
              : f.status === 'withdrawn' ? '<span class="tag warn">已撤回</span>'
                : '<span class="tag plain">待发布</span>') + '</td><td>' +
            /* 关联产品可点击跳到「签证产品管理」并自动按本清单筛出来
               （唐美芳 2026-09-09：「国家送签材料库列表里有个字段叫关联签证产品，
               允许点击跳转至签证产品管理里，自动筛选出产品」）。
               筛选值用版本号而不是名称——名称可能重名，版本号是唯一键。 */
            ((f.used_by || []).length
              ? '<a class="lnk" data-usedby="' + esc(f.ver_no) + '"><b>' + f.used_by.length +
                ' 条</b></a><div class="hint">' + esc(f.used_by.join('、')) + '</div>'
              : '<span class="hint">尚未被引用</span>') +
            '</td>' + audTd(f) +
            /* 改不了的版本不摆「编辑信息 / 发布」——摆出来点了报 403，比不摆更难受。
               「复制新版」对所有人都留着：供应商想另起一套口径，最省事的起点
               就是平台那一版，从零手录 38 项谁也不干。 */
            '<td><div class="btns">' +
            '<button class="btn sm p" data-f="' + f.id + '">' +
            (f.can_edit ? '编辑清单' : '查看清单') + '</button>' +
            (f.can_edit ? '<button class="btn sm" data-fe=\'' + jattr({
              id: f.id, country: f.country, visa_type: f.visa_type,
              name: f.name, formver_id: f.formver_id
            }) + '\'>编辑信息</button>' : '') +
            '<button class="btn sm" data-cp=\'' + jattr({
              id: f.id, country: f.country, visa_type: f.visa_type,
              name: f.name, formver_id: f.formver_id
            }) + '\'>复制新版</button>' +
            (f.can_edit
              ? '<button class="btn sm ' + (f.status === 'published' ? 'r' : 'p') + '" data-pb="' + f.id +
                '" data-a="' + (f.status === 'published' ? 'unpublish' : 'publish') + '">' +
                (f.status === 'published' ? '撤回发布' : '发布') + '</button>' +
                /* 删除（唐美芳 2026-09-04：「ubk 系统里自己创建的数据，uom 也能看到、编辑、删除」）。
                   被产品绑定或被历史订单引用的一律删不掉，接口层挡。 */
                '<button class="btn sm r" data-fd=\'' + jattr({
                  id: f.id, ver_no: f.ver_no, name: f.name, items: f.items,
                  owner: f.owner_text, used: (f.used_by || []).length
                }) + '\'>删除</button>'
              : '') + '</div></td>';
        }, '没有符合条件的清单版本') + '</div>' + pg.html + '</div>';

    q.bind(m, function () { S.cache['pg:opsfv'] = 1; reload(); });
    t.bind(m, function () { S.cache['pg:opsfv'] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:opsfv'] = 1; reload(); });
    pg.bind(m, reload);
    bindChain(m);
    $$('[data-f]', m).forEach(function (b) { b.onclick = function () { go('fullvers', b.dataset.f); }; });

    function form(f, from) {
      return ask(from ? '基于 ' + from.name + ' 复制新版' : (f ? '编辑清单版本' : '新建清单版本'), [
        { type: 'html', html: '<div class="note">' + (from ? '会把原版本的全部材料项一并复制过来，改完再发布。' : '版本号由系统生成。发布后仍可撤回，但已被在架平台产品使用的版本不能撤回。') + '</div><br>' },
        {
          k: 'country', label: '国家', type: 'select', required: true,
          value: (from || f || {}).country,
          options: (j.countries || []).map(function (v) { return { v: v, t: v }; })
        },
        {
          k: 'visa_type', label: '适用签证类型', type: 'select', required: true,
          value: (from || f || {}).visa_type,
          options: (j.visa_types || []).map(function (v) { return { v: v, t: v }; }),
          hint: '同一国家不同签证类型材料不同，须分别建清单：美国旅游签要 DS-160，学生签要 I-20 与 SEVIS 收据'
        },
        { k: 'name', label: '版本名称', required: true, value: from ? from.name + '（新版）' : (f && f.name), ph: '美国个人旅游签证资料' },
        {
          k: 'formver_id', label: '关联国家签证表模板', type: 'select',
          value: String((from || f || {}).formver_id || ''),
          options: [{ v: '', t: '暂不关联' }].concat((j.forms || []).map(function (x) {
            return {
              v: String(x.id),
              t: x.country + ' · ' + (x.visa_type || '通用') +
                ' · ' + formLabel(x)
            };
          })),
          hint: '<b>关联后系统会按表模板自动生成材料项</b>——表模板里标注为「证件识别」的字段，' +
            '其来源载体（护照资料页、身份证、在职证明等）即为本清单要收的件，不必再手工录一遍。' +
            '使领馆单独要求的材料（资金证明、行程单等）与表单字段无对应关系，仍须人工补充。' +
            '该国尚未导入表模板的可先留空，导入后再回来关联'
        }
      ], '保存', function (v) {
        return api('/ops/fullver/save', {
          id: f && f.id, from_id: from && from.id, country: v.country,
          visa_type: v.visa_type, name: v.name,
          formver_id: v.formver_id ? +v.formver_id : null
        });
      }).then(function (r) {
        toast(r.generated
          ? '已按表模板自动带出 ' + r.generated + ' 项材料，可在详情页增删调整'
          : '已保存');
        /* 改抬头信息的人是想继续看列表，不必甩进详情页；新建与复制才直接进去编清单 */
        if (f && !from) return reload();
        S.cache['tab:opsfv'] = 'all';
        go('fullvers', r.id);
      }).catch(function () { /* 失败已提示，弹窗保留 */ });
    }
    $('[data-fvback]', m) && ($('[data-fvback]', m).onclick = function () {
      var from = S.cache.fvFrom;
      S.cache.fvFrom = null;
      if (from === 'create') return go('create');
      return go('edit', String(from).split(':')[1]);
    });
    $('[data-new]', m).onclick = function () { form(null); };
    $$('[data-usedby]', m).forEach(function (a2) {
      a2.onclick = function () {
        var isSup = S.role === 'ubk';
        var key = isSup ? 'ubkprod' : 'opsprods';
        S.cache['q:' + key] = { fullver: a2.dataset.usedby };
        S.cache['pg:' + key] = 1;
        S.cache['tab:' + key] = 'all';
        go(isSup ? 'products' : 'prods');
      };
    });
    $$('[data-cp]', m).forEach(function (b) { b.onclick = function () { form(null, JSON.parse(b.dataset.cp)); }; });
    $$('[data-fe]', m).forEach(function (b) { b.onclick = function () { form(JSON.parse(b.dataset.fe)); }; });
    $$('[data-fd]', m).forEach(function (b) {
      b.onclick = function () {
        var f = JSON.parse(b.dataset.fd);
        confirmBox('删除清单版本 ' + f.ver_no,
          '<b>' + esc(f.name) + '</b>（' + esc(f.owner) + '，共 ' + f.items + ' 条材料项）' +
          '将连同其全部材料项一并删除，不可恢复。' +
          (f.used ? '<br><b class="bad">该版本已被 ' + f.used + ' 个产品绑定，系统将拒绝删除。</b>'
            : '<br>已被产品绑定或被历史订单引用的版本，系统会拒绝删除。'),
          '确认删除')
          .then(function () { return api('/ops/fullver/del', { id: f.id }); })
          .then(function () { toast('已删除'); reload(); }).catch(fail);
      };
    });
    $$('[data-pb]', m).forEach(function (b) {
      b.onclick = function () {
        var a = b.dataset.a;
        confirmBox(a === 'publish' ? '发布清单版本' : '撤回发布',
          a === 'publish' ? '发布后平台产品才能绑定这份清单。发布前会校验材料项不为空。'
            : '撤回后该版本回到草稿状态。已被在架平台产品使用的版本不允许撤回。',
          a === 'publish' ? '发布' : '撤回')
          .then(function () { return api('/ops/fullver/publish', { id: +b.dataset.pb, action: a }); })
          .then(function () { toast(a === 'publish' ? '已发布' : '已撤回'); reload(); }).catch(function () { /* 失败已提示，弹窗保留 */ });
      };
    });
  });
};

function fullverDetail(m, id) {
  return Promise.all([api('/ops/fullver?id=' + id), api('/ops/samples')]).then(function (a) {
    var d = a[0], samples = a[1].list, f = d.fullver;
    /* 供应商看平台统一版本时整页只读：改不了的东西不给按钮，
       点了报 403 比没有按钮更难受。要另起一套口径走列表页的「复制新版」。 */
    var ro = f.can_edit === 0;
    m.innerHTML = pageH('材料清单 ' + f.ver_no + ' · ' + f.name,
      esc(f.country) +
      (f.owner_text ? ' · <span class="tag ' + (f.owner_org ? 'info' : 'plain') + '">' +
        esc(f.owner_text) + '</span>' : '') +
      (f.form ? ' · 依据 <b>' + esc(formLabel(f.form)) +
        '</b>' : ' · <span class="tag warn">未关联表模板</span>') +
      ' · 共 ' + d.items.length + ' 项 · ' +
      (f.status === 'published' ? '<span class="tag ok">已发布</span>' : '<span class="tag plain">草稿</span>'),
      '<button class="btn" data-back>返回列表</button>' +
      /* 表模板后来补了新的证件识别字段时，不必重建一版，回来补带一次即可 */
      (!ro && f.formver_id && f.status !== 'published'
        ? ' <button class="btn" data-regen>按表模板补带</button>' : '') +
      (ro ? '' : ' <button class="btn p" data-add>+ 新增材料项</button>')) +
      (ro ? '<div class="note">本版本由<b>平台统一维护</b>，全平台执行同一套口径，' +
        '供应商可直接选用，不可修改。如本公司收料要求与之不同，' +
        '请返回列表对该版本执行<b>「复制新版」</b>，在副本基础上调整并发布，' +
        '新增或编辑产品时改选该版本即可。</div>' : '') +
      card('材料清单 <span>拖不动就改「排序」数字，小的在前</span>', '<div class="pad">' + table(
        ['排序', '资料名称', '属性', '提供方式', '份数', '必要性', '适用人群', '材料样例', '提交要求', '操作'],
        d.items, function (i) {
          return '<td class="num">' + (i.sort || 0) + '</td><td><b>' + esc(i.mat_name) + '</b></td><td>' + esc(i.attr_text) +
            '</td><td>' + esc(i.way_text) + '</td><td class="num">' + i.copies + '</td><td>' +
            (i.necessity === 'must' ? '<span class="tag bad">必须</span>' : '<span class="tag plain">建议</span>') +
            '</td><td>' + i.crowds.map(function (c) {
              return '<span class="tag plain">' + (CROWD_S[c] || c) + '</span>';
            }).join(' ') + '</td><td class="hint">' +
            esc((samples.filter(function (s) { return s.id === i.sample_tpl_id; })[0] || {}).name || '—') +
            '</td><td class="hint" style="max-width:260px">' + esc(i.require_text || '') + '</td>' +
            (ro ? '<td class="hint">只读</td>'
              : '<td><button class="btn sm" data-i=\'' + jattr({
                id: i.id, mat_name: i.mat_name, attr: i.attr, provide_way: i.provide_way,
                copies: i.copies, necessity: i.necessity, require_text: i.require_text,
                sample_tpl_id: i.sample_tpl_id, crowds: i.crowds, sort: i.sort
              }) + '\'>编辑</button> <button class="btn sm r" data-id="' + i.id + '">删除</button></td>');
        }, '清单还是空的，点右上角新增材料项') + '</div>') +
      card('按人群裁剪结果 <span>下单时按办签人所选人群自动生成清单</span>', '<div class="pad"><div class="grid">' +
        Object.keys(d.by_crowd).map(function (k) {
          return '<div class="card" style="margin:0"><h3>' + CROWD_T[k] + ' <span>' + d.by_crowd[k].length + ' 项</span></h3>' +
            '<div class="pad hint">' + (d.by_crowd[k].map(esc).join('、') || '无') + '</div></div>';
        }).join('') + '</div></div>');

    $('[data-back]', m).onclick = function () { go('fullvers'); };

    function form(i) {
      return ask(i ? '编辑材料项 · ' + i.mat_name : '新增材料项', [
        { k: 'mat_name', label: '资料名称', required: true, value: i && i.mat_name, ph: '如：护照原件 / 在职证明' },
        { k: 'attr', label: '属性', type: 'select', value: i && i.attr, options: [{ v: 'origin', t: '原件' }, { v: 'copy', t: '复印件' }] },
        { k: 'provide_way', label: '提供方式（可多选）', type: 'checks', required: true,
          value: (i && i.provide_way) || ['upload'],
          options: Object.keys(WAY_T).map(function (k) { return { v: k, t: WAY_T[k] }; }),
          hint: '<b>同时勾选「邮寄/自送」与「面试携带」的，系统会按产品是否需要面签自动分流：' +
            '需面签的产品显示「面试携带」，免面签的产品显示「邮寄/自送」。</b>' +
            '只勾一种的按录入执行，不做分流。<br>' +
            '判断依据：需面签时申请人本人带原件到使领馆，原件不离手；' +
            '免面签（如美签 dropbox 续签）须将护照原件交至指定的中信银行网点或由 EMS 上门取件，' +
            '属于寄交原件。' },
        { k: 'copies', label: '份数', value: i ? i.copies : 1 },
        { k: 'necessity', label: '必要性', type: 'select', value: i && i.necessity, options: [{ v: 'must', t: '必须材料' }, { v: 'suggest', t: '建议材料' }] },
        { k: 'crowds', label: '适用人群（可多选）', type: 'checks', required: true, value: (i && i.crowds) || Object.keys(CROWD_T), options: Object.keys(CROWD_T).map(function (k) { return { v: k, t: CROWD_T[k] }; }) },
        /* 样例带了适用国家之后，这里只列「本国专用 + 通用」两拨，
           不能把全部样例摊出来——日本清单挂上美签照片规格图，客人照着拍就是废片。
           已经挂着的那条即使不匹配也保留在选项里，否则编辑别的字段会把它悄悄清掉。 */
        {
          k: 'sample_tpl_id', label: '关联材料样例', type: 'select', value: i && i.sample_tpl_id,
          options: [{ v: '', t: '不关联' }].concat(smpPick(samples, f, i && i.sample_tpl_id)),
          hint: '仅列出适用于本清单（' + esc(f.country) + (f.visa_type ? ' · ' + esc(f.visa_type) : '') +
            '）的样例与各国通用样例。缺样例请到「材料样例库」新建。'
        },
        { k: 'sort', label: '排序', value: i ? i.sort : '' },
        { k: 'require_text', label: '资料提交要求', type: 'textarea', rows: 6, value: i && i.require_text, ph: '如：距回国日期有效期 6 个月以上，至少 2 页连续空白签证页' }
      ], '保存', function (v) {
        return api('/ops/item/save', {
          id: i && i.id, fullver_id: id, mat_name: v.mat_name, attr: v.attr,
          provide_way: v.provide_way, copies: +v.copies || 1, necessity: v.necessity,
          crowds: v.crowds, sample_tpl_id: v.sample_tpl_id ? +v.sample_tpl_id : null,
          sort: v.sort ? +v.sort : 0, require_text: v.require_text
        });
      }).then(function () { toast('已保存'); reload(); }).catch(function () { /* 失败已提示，弹窗保留 */ });
    }
    /* 只读态下这些按钮压根没渲染，绑定必须判空——
       把常驻元素改成条件渲染却没回头改绑定，是这个项目里栽过好几次的同一个跟头 */
    $('[data-add]', m) && ($('[data-add]', m).onclick = function () { form(null); });
    /* 表模板后来补了新的证件识别字段时，不必重建一版，回来补带一次即可 */
    $('[data-regen]', m) && ($('[data-regen]', m).onclick = function () {
      confirmBox('按表模板补带材料项',
        '将按关联的国家签证表模板中「证件识别」字段的来源载体，补充尚未录入的材料项。' +
        '<b>已存在的同名材料项不会重复添加</b>，也不会覆盖已修改的内容。',
        '补带')
        .then(function () { return api('/ops/fullver/regen', { id: f.id }); })
        .then(function (r) {
          toast(r.added ? '已补带 ' + r.added + ' 项材料' : '没有可补带的材料项，清单已是最新');
          reload();
        }).catch(fail);
    });
    $$('[data-i]', m).forEach(function (b) { b.onclick = function () { form(JSON.parse(b.dataset.i)); }; });
    $$('[data-id]', m).forEach(function (b) {
      b.onclick = function () {
        confirmBox('删除材料项', '已下单客户的清单为下单时的快照，不受影响。', '删除')
          .then(function () { return api('/ops/item/del', { id: +b.dataset.id }); })
          .then(function () { toast('已删除'); reload(); }).catch(function () { /* 失败已提示，弹窗保留 */ });
      };
    });
  });
}

/* ================= UOM · 平台配置：B 端 / C 端上架审核 =================
   数据源是供应商在 UBK 上的每一条产品。供应商录完属性与套餐报价点「上架」，
   产品就落到这里等运营审核。
   B 端和 C 端是两拨人各审各的（唐美芳 2026-08-27 定）：B 端审的是给门店与同业看的
   结算价与渠道口径，过审后在 CSP 产品预订中心展示；C 端审的是给消费者看的文案与合规，
   过审后在客户小程序展示。所以拆成两个菜单，每个队列只装申请了这一端的产品。
   版式按正常管理后台来：顶部查询卡 → 状态页签 → 信息分区表 → 独立操作行 → 分页。 */
var RV_TAG = {
  pending: ['warn', '待审核'], approved: ['ok', '审核通过'],
  rejected: ['bad', '审核驳回'], none: ['plain', '未申请']
};
/* 只要文字不要标签的场合（比如 C 端上架列里那一行小字） */
function rvText(v) { return (RV_TAG[v] || ['', v || '未申请'])[1]; }

function rvTag(v) {
  var t = RV_TAG[v] || ['plain', v];
  return '<span class="tag ' + t[0] + '">' + t[1] + '</span>';
}

/* 驳回截图缩略图条。审核人上传的那几张，供应商与运营回看时都要点得开。 */
function rvImgs(list) {
  if (!list || !list.length) return '';
  return '<div class="imgs-row" style="margin-top:8px">' + list.map(function (u) {
    return '<a class="imgs-c" style="background-image:url(' + esc(u) +
      ');width:76px;height:76px" href="' + esc(u) + '" target="_blank"></a>';
  }).join('') + '</div>';
}

/* 两端的差异都收在这里，下面那套表格逻辑一份代码两处用 */
var TRK = {
  b: {
    t: 'B 端', name: '签证产品管理（B端）', ch: 'CSP 门店 / 同业产品预订中心',
    who: '渠道运营', key: 'opsprodb',
    focus: '结算价是否成立、渠道口径与受理范围是否写清、材料清单版本是否绑对'
  },
  c: {
    t: 'C 端', name: '签证产品管理（C端）', ch: 'C 端客户小程序',
    who: '内容运营', key: 'opsprodc',
    focus: '面向消费者的产品名称与特色文案是否合规、零售价是否合理、服务保障是否与实际相符'
  }
};

function opsProdView(tk) {
  var T = TRK[tk], RK = 'review_' + tk, OK = tk === 'b' ? 'c' : 'b';
  return function (m) { return opsProdList(m, tk, T, RK, OK); };
}
/* B 端审核并进了「签证产品管理」，这个路由留成重定向（书签 / 旧链接不至于点空）。
   ⚠️ **C 端审核不合并**——唐美芳 2026-09-09：「B 只审核 B 的，C 只审核 C 的，
   2 拨人处理，所以千万不要混在一起」。C 端仍是独立页面，见下面的 opsProdList('c')。 */
VIEWS['ops:prodb'] = function () {
  S.cache['tab:opsprods'] = 'wait'; S.cache['pg:opsprods'] = 1; go('prods');
};
VIEWS['ops:prodc'] = opsProdView('c');

/* ================= UOM · 签证产品详情 =================
   唐美芳 2026-08-27：「ubk 的产品有详情，为什么到了 uom 里就没有详情了呢，
   只能看套餐报价了」「产品详情页尽量和现在我们 uom 旅游产品的结构保持一致」。
   之前采购运营在审核台上只能开一个「套餐与报价」弹窗，想看签证属性、受理范围、
   收料地址、绑的哪一版材料清单，就得跑去供应商自己的 UBK 后台看——等于让运营
   去翻供应商的台账，这不合理。

   版式照搬现有 UOM 旅游产品详情：
     顶部标题条（产品名 + 标签 + 编号/供应商/管理人员三列元信息）
     → 主页签（产品信息 / 材料清单 / 套餐报价 / 审核与日志）
     → 左侧锚点导航 + 右侧分区块，每区一张 label/value 三列信息表。
   跟团游那套字段（线路信息、团期报价、儿童价标准）在签证业务里没有对应物，
   换成签证真正的三段：签证属性、办理要求、受理与收料。不硬套空字段。 */

var UP_TABS = [['info', '产品信息'], ['mat', '材料清单'], ['pkg', '套餐报价'], ['log', '审核与日志']];

/* 一张分区信息表：cells 是 [label, value] 数组，三列铺开，
   value 传 null 的项自动跳过（比如没填收料地址就不占一格空表格） */
function upKv(cells) {
  var c = cells.filter(Boolean);
  return '<div class="up-kv">' + c.map(function (x) {
    return '<div class="l">' + esc(x[0]) + '</div><div class="v' +
      (x[2] ? ' ' + x[2] : '') + '">' + (x[1] == null || x[1] === '' ? '—' : x[1]) + '</div>';
  }).join('') + '</div>';
}
/* 单列版：整句说明放三列格里会挤成一堆折行，铺成一列才读得下去 */
function upKv1(cells) {
  return upKv(cells).replace('class="up-kv"', 'class="up-kv one"');
}
function upSec(id, title, body) {
  return '<section class="up-sec" id="up-' + id + '"><h4>' + esc(title) + '</h4>' + body + '</section>';
}

VIEWS['ops:prod'] = function (m, id) {
  if (!id) return go('prodb');
  return api('/ops/product?id=' + id).then(function (d) {
    var p = d.product, tab = S.cache.upTab || 'info';
    /* 2026-09-08 起订单列表也能点产品名进来，返回按钮要能回订单列表——
       原来只认「产品目录 / C 端审核 / B 端审核」三个来源，从订单进来点返回会跑到审核列表。 */
    var back = ['prodc', 'prods', 'orders'].indexOf(S.cache.upBack) >= 0
      ? S.cache.upBack : 'prodb';
    var mgs = d.packages.map(function (k) { return k.suggest_retail - k.settle_price; });
    var mgLo = mgs.length ? Math.min.apply(null, mgs) : null;

    /* 锚点只列当前页签里真实存在的区块，点进去落空最伤信任 */
    var ANCH = {
      info: [['rv', '审核状态'], ['base', '基础信息'], ['attr', '签证属性'],
      ['req', '办理要求'], ['acc', '受理与收料'], ['svc', '服务保障']],
      mat: [['fv', '清单版本'], ['items', '材料明细']],
      pkg: [['pks', '套餐与价格'], ['notice', '预订须知']],
      log: [['rvb', 'B 端审核'], ['rvc', 'C 端审核'], ['ev', '操作日志']]
    };

    function rvBlk(t) {
      var T = TRK[t], v = d['review_' + t];
      return upKv([
        ['是否申请上架', d['to_' + t] ? '<span class="tag ok">已申请</span>'
          : '<span class="tag plain">未申请</span>'],
        ['审核结论', rvTag(v)],
        ['当前展示', d['on_' + t] ? '<span class="tag ok">已展示</span>'
          : '<span class="tag plain">未展示</span>'],
        ['审核人', esc(d['review_' + t + '_by'] || '')],
        ['审核时间', d16(d['review_' + t + '_at'])],
        ['审核方', '众信' + T.who + '负责'],
        /* 驳回原因是多行文本（一条原因一行），照原样断行；
           截图跟在后面，点开看原图——供应商要照着改，得先看得见问题本身 */
        v === 'rejected' ? ['驳回原因',
          esc(d['review_' + t + '_note'] || '').replace(/\n/g, '<br>') +
          rvImgs(d['review_' + t + '_imgs']), 'bad'] : null,
        v === 'approved' && d['review_' + t + '_note'] ?
          ['审核备注', esc(d['review_' + t + '_note'])] : null
      ]);
    }

    function infoHtml() {
      return upSec('rv', '审核状态', upKv([
        ['上架申请状态', d.status === 'published' ? '已提交上架' : '未提交（草稿）'],
        ['送审时间', d16(d.submit_at)],
        ['累计订单', d.ord_count ? d.ord_count + ' 笔' : '暂无'],
        ['B 端上架审核', rvTag(d.review_b) +
          (d.on_b ? ' <span class="tag ok">已展示</span>' : '')],
        ['C 端上架审核', rvTag(d.review_c) +
          (d.on_c ? ' <span class="tag ok">已展示</span>' : '')],
        ['最低毛利', mgLo == null ? '<span class="tag bad">未配套餐</span>' :
          '<b style="color:' + (mgLo < 0 ? 'var(--bad)' : 'var(--ok)') + '">¥' +
          money(mgLo) + '</b>' + (mgLo < 0 ? '（报价倒挂，不能上架）' : '')]
      ])) +
        upSec('base', '基础信息', upKv([
          ['产品名称', esc(d.name)],
          /* 两个编号不是一回事：Q 码是这家供应商这条产品的业务编码（对账、报单号用），
             平台产品编号是目录里那条签证的编码（同一条签证多家供应商共用）。 */
          ['产品编码', copyCode(d.sup_code || '—')],
          ['供应商自有编码', d.vendor_code ? copyCode(d.vendor_code) :
            '<span class="hint">未填 —— 供应商自己系统里的编码，用于双方对码</span>'],
          ['平台产品编号', '<span class="mono">' + esc(d.code) + '</span>'],
          ['供应商', esc(d.supplier_full)],
          ['产品特色', esc(d.feature || '')],
          ['创建人', esc(d.created_by_name || '')],
          ['最近修改', d16(d.updated_at) + (d.updated_by_name ? ' · ' + esc(d.updated_by_name) : '')]
        ])) +
        upSec('attr', '签证属性', upKv([
          ['目的地国家', esc(p.country)],
          ['签证类型', p.visa_cat ? '<span class="tag info">' + esc(p.visa_cat) + '</span>' :
            '<span class="hint">未归类</span>'],
          ['签证名称', esc(p.visa_type)],
          ['送签地', esc(p.submit_city)],
          ['入境次数', esc(ENTRIES[p.entries] || p.entries)],
          ['签证有效期', validTx(p)],
          ['单次停留', stayTx(p)]
        ])) +
        upSec('req', '办理要求', upKv([
          ['是否需本人面签', p.need_interview ? '<span class="tag warn">需本人到馆面签</span>'
            : '<span class="tag ok">免面签</span>'],
          ['是否需采集指纹', p.need_fingerprint ? '<span class="tag warn">需现场采集</span>'
            : '<span class="tag ok">不需要</span>'],
          ['最快出签', d.packages.length ? Math.min.apply(null, d.packages.map(function (k) {
            return k.lead_days;
          })) + ' 个工作日' : null],
          /* 这几项在签证业务里是硬约束，不是产品卖点：官方渠道没有公开接口，
             只能由持证专员人工在使领馆渠道办，产品配得再好也绕不过去。 */
          ['人工必办环节', '提交、缴费、抢号、递交、采指纹五项由专员人工操作', 'mut'],
          ['可售渠道', (d.to_b ? 'B 端 ' : '') + (d.to_c ? 'C 端' : '') || '未选'],
          ['套餐数', d.packages.length + ' 个']
        ])) +
        upSec('acc', '受理与收料', upKv([
          ['受理说明', '<div class="rich-view">' + richView(p.accept_note) + '</div>'],
          ['受理省份', d.accept_provinces.length ?
            d.accept_provinces.map(function (x) {
              return '<span class="tag plain">' + esc(x) + '</span>';
            }).join(' ') : '<span class="tag warn">未限定</span>'],
          ['收料地址', d.addr ? esc(d.addr.region + ' ' + d.addr.detail)
            : '<span class="tag bad">未设置</span>'],
          ['收件联系人', d.addr ? esc(d.addr.contact + ' ' + d.addr.phone) : null]
        ])) +
        upSec('svc', '服务保障', '<div class="pad-s">' +
          (d.svc.length ? d.svc.map(function (v) {
            return '<span class="tag ok">' + esc(v) + '</span>';
          }).join(' ') : '<span class="hint">供应商未勾选服务保障项</span>') +
          '<div class="hint" style="margin-top:8px">勾选项会显示在 C 端产品详情页顶部；' +
          '免面签由系统按签证属性自动带出，供应商不能自己勾。</div></div>');
    }

    function matHtml() {
      if (!d.fullver) return '<div class="empty">该产品还没有绑定材料清单版本，不能通过审核</div>';
      var f = d.fullver;
      /* d.items 是后端按「平台清单 + 该供应商定制」合成后的实际清单，
         运营在这儿看到的必须跟客人收到的一致——运营审的是平台原版、
         客人收到的是定制版，这种落差最难查（2026-09-04）。 */
      var its = d.items || [];
      var mc = d.mat_custom || { add: [], skip: [] };
      return upSec('fv', '清单版本', upKv([
        ['版本号', '<span class="mono">' + esc(f.ver_no) + '</span>'],
        ['清单名称', esc(f.name)],
        ['归属', f.owner_org ? '<span class="tag info">供应商自建</span>'
          : '<span class="tag plain">平台统一版本</span>'],
        ['适用', esc(f.country) + ' · ' + esc(f.visa_type || '通用')],
        ['状态', f.status === 'published' ? '<span class="tag ok">已发布</span>'
          : '<span class="tag warn">草稿</span>'],
        ['生效时间', d10(f.effective_at)],
        ['本产品实际收', '<b>' + its.length + '</b> 项' +
          ((mc.skip || []).length ? '　<span class="tag warn">供应商关掉 ' +
            mc.skip.length + ' 项建议</span>' : '') +
          ((mc.add || []).length ? '　<span class="tag info">额外 ' +
            mc.add.length + ' 项</span>' : ''),
          (mc.skip || []).length || (mc.add || []).length ? 'hi' : null]
      ])) +
        upSec('items', '材料明细', '<div class="pad-s">' +
          matCwBar(its) + matCwSum(matCwPick(its)) + matTable(matCwPick(its)) + '</div>');
    }

    function pkgHtml() {
      return upSec('pks', '套餐与价格', '<div class="pad-s">' +
        '<div class="note">采购审核该表的唯一判断标准：<b>毛利是否为正</b>。' +
        '结算价是平台付给供应商的，零售参考价是对外卖的，两者之差才是平台的毛利空间。' +
        '倒挂的套餐不能上架。</div>' +
        table(['套餐', '供应商编码', '签证费', '服务费', '结算价', '零售参考价', '毛利', '时效'],
          d.packages, function (k) {
            var g = k.suggest_retail - k.settle_price;
            return '<td><b>' + esc(k.name) + '</b></td><td class="hint mono">' +
              esc(k.sup_code || '—') + '</td><td class="num">¥' + money(k.visa_fee) +
              '</td><td class="num">¥' + money(k.service_fee) + '</td><td class="num"><b>¥' +
              money(k.settle_price) + '</b></td><td class="num">¥' + money(k.suggest_retail) +
              '</td><td class="num"><b style="color:' + (g < 0 ? 'var(--bad)' : 'var(--ok)') +
              '">¥' + money(g) + '</b><div class="hint">' +
              (k.suggest_retail ? Math.round(g / k.suggest_retail * 100) : 0) +
              '%</div></td><td class="num">' + k.lead_days + ' 个工作日</td>';
          }, '该产品没有套餐报价，不能通过审核') + '</div>') +
        upSec('notice', '预订须知', '<div class="pad-s">' + d.packages.map(function (k) {
          return '<div class="up-nt"><b>' + esc(k.name) + '</b><div>' +
            richView(k.book_notice || '未填写') + '</div></div>';
        }).join('') + '</div>');
    }

    function logHtml() {
      return upSec('rvb', 'B 端上架审核', rvBlk('b')) +
        upSec('rvc', 'C 端上架审核', rvBlk('c')) +
        upSec('ev', '操作日志', '<div class="pad-s">' + timeline(d.events) +
          '<div class="hint" style="margin-top:10px">只保留该产品的操作事件；' +
          '每一渠道仅保留最近一次审核结论，多次送审的历史结论不覆盖记录于该日志中。</div></div>');
    }

    /* 从审核台点「产品审核」进来时，右上角放出审核动作
       （唐美芳 2026-09-09：「产品审核跳转至详情页并放出审核驳回、审核通过按钮」）。
       审核结论必须看完产品再下——列表上直接点通过，等于没看就签字。 */
    var rvTk = S.cache.upReview;
    var rvNow = rvTk && d['review_' + rvTk] === 'pending' ? TRK[rvTk] : null;
    m.innerHTML = pageH('签证产品详情' + (rvNow ? ' · ' + rvNow.t + '审核' : ''), '',
      /* 审核结论按钮 2026-09-10 从右上角挪到页面**底部**（唐美芳：「底部是审核驳回、
         通过按钮」）。右上角留通用操作，审核动作放在看完整页产品之后——
         位置本身就是一道提醒：先看完再下结论。 */
      '<div class="btns">' +
      '<button class="btn" data-ped2>编辑产品</button>' +
      /* 返回按钮的文案要和左侧菜单一个名字，否则「返回产品目录」这种说法在菜单上
         根本找不到对应项（唐美芳定过的规矩：列表标题与菜单名保持一致）。 */
      '<button class="btn" data-back>返回' +
      (back === 'prods' ? '签证产品管理（B端）' : back === 'prodc' ? '签证产品管理（C端）'
        : back === 'orders' ? '订单列表' : '签证产品管理（B端）') +
      '</button></div>') +
      '<div class="up-hd">' +
      '<div class="up-t"><h3>' + esc(d.name) + '</h3><div class="tg">' +
      '<span class="tag info">' + esc(p.country) + '</span>' +
      '<span class="tag info">' + esc(p.visa_type) + '</span>' +
      '<span class="tag plain">' + esc(p.submit_city) + '</span>' +
      (d.to_b ? '<span class="tag ' + (d.on_b ? 'ok' : 'plain') + '">B 端' +
        (d.on_b ? '在售' : '未上架') + '</span>' : '') +
      (d.to_c ? '<span class="tag ' + (d.on_c ? 'ok' : 'plain') + '">C 端' +
        (d.on_c ? '在售' : '未上架') + '</span>' : '') +
      '</div></div>' +
      '<div class="up-meta">' + [
        ['平台产品编号', '<span class="mono">' + esc(d.code) + '</span>'],
        ['供应商', esc(d.supplier_full)],
        ['产品管理人员', esc(d.updated_by_name || d.created_by_name || '—')],
        ['创建时间', d16(d.created_at)],
        ['送审时间', d16(d.submit_at)],
        ['累计订单', d.ord_count ? d.ord_count + ' 笔' : '暂无']
      ].map(function (x) {
        return '<div><s>' + esc(x[0]) + '</s><b>' + x[1] + '</b></div>';
      }).join('') + '</div></div>' +

      '<div class="up-tabs">' + UP_TABS.map(function (t) {
        return '<a data-ut="' + t[0] + '"' + (tab === t[0] ? ' class="on"' : '') + '>' +
          t[1] + '</a>';
      }).join('') + '</div>' +

      '<div class="up-main"><nav class="up-rail">' + ANCH[tab].map(function (a) {
        return '<a data-an="up-' + a[0] + '">' + a[1] + '</a>';
      }).join('') + '</nav><div class="up-cont">' +
      (tab === 'info' ? infoHtml() : tab === 'mat' ? matHtml() :
        tab === 'pkg' ? pkgHtml() : logHtml()) +
      '</div></div>' +
      (rvNow
        ? '<div class="pr-foot">' +
          '<span class="hint">' + rvNow.who + '审核：' + esc(rvNow.focus) + '。' +
          '本页只读，如需改动产品内容请用「编辑产品」。</span>' +
          '<button class="btn" data-cxl>取消</button>' +
          '<button class="btn bad" data-rjt>审核驳回</button>' +
          '<button class="btn p" data-apt>' + rvNow.t + '审核通过</button></div>'
        : '');

    $('[data-back]', m).onclick = function () { S.cache.upReview = null; go(back); };
    $('[data-cxl]', m) && ($('[data-cxl]', m).onclick = function () {
      S.cache.upReview = null; go(back);
    });
    $('[data-ped2]', m) && ($('[data-ped2]', m).onclick = function () {
      S.cache.upBack = back; go('edit', id);
    });
    /* 审核通过 / 驳回：与审核台上原来那两颗按钮走同一个接口，只是挪到了看完产品之后 */
    $('[data-apt]', m) && ($('[data-apt]', m).onclick = function () {
      confirmBox(rvNow.t + '审核通过',
        '通过后本产品即在<b>' + rvNow.ch + '</b>展示并可被下单。<br>' +
        '请确认结算价与零售价区间、材料清单版本、受理范围均已核对无误。', '确认通过')
        .then(function () {
          return api('/ops/product/review', { id: id, track: rvTk, action: 'approve' });
        })
        .then(function () { toast('已通过'); S.cache.upReview = null; go(back); })
        .catch(function () { });
    });
    $('[data-rjt]', m) && ($('[data-rjt]', m).onclick = function () {
      /* 与 C 端审核页共用同一个弹窗（预置原因多选 + 补充说明 + 驳回截图），
         只是预置原因换成 B 端渠道运营那一套。两端审核人看到的是同一种界面，
         供应商收到的也是同样结构的一段话——照着改一次就能过。 */
      rejectModal(function (payload) {
        return api('/ops/product/review',
          { id: id, track: rvTk, action: 'reject',
            note: payload.note, note_imgs: payload.imgs });
      }, rvTk).then(function () { toast('已驳回'); S.cache.upReview = null; go(back); })
        .catch(function () { });
    });
    $$('[data-ut]', m).forEach(function (a) {
      a.onclick = function () { S.cache.upTab = a.dataset.ut; reload(); };
    });
    matCwBind(m);
    $$('[data-an]', m).forEach(function (a) {
      a.onclick = function () {
        var el = document.getElementById(a.dataset.an);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
    bindSample(m);
  });
};

/* ============ 签证产品列表的公共列（2026-09-09）============
   唐美芳给了众信旅游「产品管理」列表的截图，要求按那个骨架来、字段按签证属性替换：
     产品编号(+供应商编码) · 产品名称(+属性标签) · 供应商 · 供应商计调 ·
     出发地/目的地→送签地/目的地国家 · 线路数/团期数→套餐数/可售数 ·
     结算价区间 · 零售价区间 · 利润率区间 · 销售状态 · C 端是否上架 · 创建/更新
   「签证产品管理」与「B 端产品审核」两张表共用这一份，免得两边字段又长歪。 */
/* 复制客户端（小程序）产品页链接。三张产品表的「复制小程序链接」共用
   （唐美芳 2026-09-09）。指向的就是客人扫码 / 点链接看到的那一页，
   与门店端「发送至客户」用的是同一个地址，两处口径不会走偏。 */
function copyMiniLink(p) {
  if (!p) return;
  var url = location.origin + location.pathname.replace(/[^/]*$/, '') +
    '#customer/shop/p-' + p.id;
  doCopy(url);
  toast('已复制客户端产品链接');
}

/* ============ 产品列表的公共列（2026-09-09 第三版）============
   ⚠️ **B 与 C 严格分开**。唐美芳：「你现在把 B 和 C 混合的太多了，导致现在 B 和 C
   两个产品列表状态混乱……B 只审核 B 的，C 只审核 C 的，2 拨人处理，
   所以千万不要混在一起」。
   上一版我在同一张表里既显示 B 端审核结论、又显示 C 端上架状态，两拨人都被对方的
   状态干扰。现在：**每张表只显示自己那一端的状态**，`tk` 决定是哪一端。

   · 签证产品管理（tk='b'）＝渠道运营的台子，B 端审核已并入，末两列＝B 端审核状态 + 销售状态
   · C 端产品审核（tk='c'）＝内容运营的台子，末两列＝C 端审核状态 + C 端上架状态
*/
var OPS_PROD_BASE = ['产品编号', '产品名称', '签证属性', '供应商', '供应商计调',
  '套餐数量', '结算价', '零售价', '利润率'];

function opsProdCols(tk) {
  return OPS_PROD_BASE.concat(
    tk === 'c' ? ['C 端审核状态', 'C 端上架']
      /* 「C 端上架」在 B 端表上是**只读告知**，不是把两端混起来审：
         渠道运营停售一条产品之前，得知道它是不是也在客户小程序上卖着
         （唐美芳 2026-09-10：「签证产品管理（B端）为什么没有 C 端上架状态呢」）。
         这一格没有任何可点的东西，C 端的审核与上下架仍只在 C 端那张台子上做。 */
      : ['B 端审核状态', '销售状态', 'C 端上架'],
    ['操作']);
}

/* 金额 / 利润率两行：上行最低、下行最高，**两行都写**（唐美芳要的是固定两行的读法，
   相同也照写，否则列与列之间对不齐、还让人以为漏了字段）。 */
function twoLine(lo, hi, unit) {
  if (!lo && !hi) return '<span class="hint">未报价</span>';
  var f = function (v) { return unit === '%' ? (v || 0) + '%' : '¥' + money(v || 0); };
  return '<div class="tl2"><s>最低</s><b>' + f(lo) + '</b></div>' +
    '<div class="tl2"><s>最高</s><b>' + f(hi) + '</b></div>';
}
/* 同上，但标签可指定（利润率那列是「最大 / 最小」） */
function twoLine2(a, b, la, lb, unit) {
  if (!a && !b) return '<span class="hint">—</span>';
  var f = function (v) { return unit === '%' ? (v || 0) + '%' : '¥' + money(v || 0); };
  return '<div class="tl2"><s>' + la + '</s><b>' + f(a) + '</b></div>' +
    '<div class="tl2"><s>' + lb + '</s><b>' + f(b) + '</b></div>';
}

function opsProdCells(p, tk) {
  var RK = 'review_' + tk, TO = 'to_' + tk, ON = 'on_' + tk;
  return '<td class="nw"><b class="mono">' + copyCode(p.code || '—') + '</b>' +
    '<div class="hint">供应商编码 ' +
    (p.vendor_code ? copyCode(p.vendor_code) : '未填写') + '</div></td>' +
    '<td style="min-width:210px"><b>' + esc(p.name) + '</b>' +
    (p.feature ? '<div class="hint">' + esc(p.feature) + '</div>' : '') + '</td>' +
    '<td style="min-width:180px">' + zn([
      ['目的地', flag(p.country) + ' ' + esc(p.country || '') +
        (p.visa_cat ? ' · ' + esc(p.visa_cat) : ''), 'top'],
      ['送签地', esc(p.submit_city || '—'), 'mut'],
      ['有效期', esc(p.valid || '—') + ' · 停留 ' + esc(p.stay_text || '—'), 'mut'],
      ['入境', esc((typeof ENTRIES !== 'undefined' && ENTRIES[p.entries]) || p.entries || '—') +
        (p.need_interview ? ' · 需面签' : ' · 免面签') +
        (p.need_fingerprint ? ' · 需指纹' : ''), 'mut']
    ]) + '</td>' +
    '<td class="nw">' + esc(p.supplier || '—') + '</td>' +
    '<td class="nw">' + (p.sup_owner_name
      ? esc(p.sup_owner_name) : '<span class="hint">—</span>') + '</td>' +
    '<td class="num nw"><b>' + (p.pkg_count || 0) + '</b>' +
    '<div class="hint">可售 ' + (p.pkg_on || 0) + '</div></td>' +
    '<td class="num nw">' + twoLine(p.settle_min, p.settle_max) + '</td>' +
    '<td class="num nw">' + twoLine(p.retail_min, p.retail_max) + '</td>' +
    '<td class="num nw">' + twoLine2(p.margin_max, p.margin_min, '最大', '最小', '%') + '</td>' +
    /* 本端审核状态：没申请这一端就写「未申请上架」，别让人以为是漏审。
       ⚠️ 这一格**不能用 nw**：驳回原因是整句话，nowrap 会把它铺成一行，
       实测把这一列撑到 557px（其余列 80–210px），看上去就成了「审核状态和销售状态
       之间隔着一大片空白」（唐美芳 2026-09-10 提的就是这个）。
       固定 190px 并允许换行，驳回原因超过两行截断，全文点「查看详情」看。 */
    '<td style="width:190px;min-width:190px">' + (p[TO]
      ? rvTag(p[RK]) +
        (p.submit_at ? '<div class="hint">送审 ' + d10(p.submit_at) + '</div>' : '') +
        (p[RK] === 'rejected' && p[RK + '_note']
          ? '<div class="hint clamp2" style="color:#B42318" title="' +
            esc(p[RK + '_note']) + '">' + esc(p[RK + '_note']) + '</div>' : '')
      : '<span class="hint">未申请上架</span>') + '</td>' +
    (tk === 'c'
      /* C 端台子：这一列回答「客户端现在能不能买到」 */
      ? '<td class="nw">' + (p[ON]
          ? '<span class="tag ok">已上架</span>'
          : p.off_sale ? '<span class="tag warn">已停售</span>'
            : p[RK] === 'approved' ? '<span class="tag warn">已过审未上架</span>'
              : '<span class="tag plain">未上架</span>') + '</td>'
      /* B 端台子：销售状态做成开关，关掉＝平台强制停售（不动审核结论），
         后面再跟一格**只读**的 C 端上架状态——只告知，不给操作。 */
      : '<td class="nw">' +
        '<a class="sw' + (p.off_sale ? '' : ' on') + '" data-sale="' + p.id + '"></a>' +
        '<div class="hint">' + (p.off_sale ? '已停售'
          : p[ON] ? '在售'
            : p.status === 'published' ? '待上架' : '草稿') + '</div></td>' +
        '<td class="nw">' + (p.to_c
          ? (p.on_c ? '<span class="tag ok">已上架</span>'
            : p.off_sale ? '<span class="tag warn">已停售</span>'
              : p.review_c === 'approved' ? '<span class="tag warn">已过审未上架</span>'
                : p.review_c === 'pending' ? '<span class="tag info">C 端待审核</span>'
                  : p.review_c === 'rejected' ? '<span class="tag bad">C 端已驳回</span>'
                    : '<span class="tag plain">未上架</span>')
          : '<span class="hint">未申请 C 端</span>') +
        '<div class="hint">C 端由内容运营处理</div></td>');
}

function opsProdList(m, tk, T, RK, OK) {
  return api('/ops/products').then(function (j) {
    /* 只装申请了这一端的产品：C 端运营不该被一堆只上 B 端的同业专供产品刷屏 */
    j.list = j.list.filter(function (p) { return p['to_' + tk]; });
    var uniq = function (k) {
      var o = [];
      j.list.forEach(function (p) { if (o.indexOf(p[k]) < 0) o.push(p[k]); });
      return o.map(function (v) { return [v, v]; });
    };
    var q = srchCard(T.key, [
      { k: 'name', t: '产品名称', ph: '支持模糊查询' },
      { k: 'supplier', t: '供应商', type: 'sel', opts: uniq('supplier') },
      { k: 'country', t: '目的地国家', type: 'sel', opts: uniq('country') },
      { k: 'visa_cat', t: '签证类型', type: 'sel', opts: VISA_CATS.map(function (v) { return [v, v]; }) },
      { k: 'submit_city', t: '送签地', type: 'sel', opts: uniq('submit_city') },
      {
        /* 采购真正要挑出来看的两类问题件：报价倒挂、材料清单没绑。
           它们不是审核状态（一个待审核的产品也可能倒挂），所以是筛选条件而不是页签。 */
        k: 'risk', t: '问题件', type: 'sel',
        opts: [['gross', '报价倒挂'], ['nover', '材料清单未绑'], ['ok', '无问题']],
        get: function (p) {
          if (p.gross_min < 0) return 'gross';
          if (!p.fullver) return 'nover';
          return 'ok';
        }
      }
    ]);
    var hit = q.filter(j.list);

    /* 页签按唐美芳 2026-09-09 定的三个：待审核 / 已上架 / 已下架。
       这张表**只讲 C 端**——B 端的审核结论与销售状态都不在这里露面。 */
    var t = subTabs(T.key, [
      { k: 'pending', t: '待审核', fn: function (p) { return p[RK] === 'pending'; } },
      { k: 'on', t: '已上架', fn: function (p) { return p['on_' + tk]; } },
      { k: 'off', t: '已下架', fn: function (p) { return !p['on_' + tk]; } }
    ], hit, 'pending');                     /* 默认停在待审核 */
    /* 这张表一格里是一组信息，所以只给能比大小的两组挂排序：
       「套餐与报价」按最低毛利排（倒挂的先冒出来），「审核状态」按送审时间排（先送先审）。 */
    var so = sorter(T.key, [
      ['套餐与报价', function (p) { return p.gross_min || 0; }],
      ['审核状态', function (p) { return p.submit_at || ''; }]
    ]);
    var pg = pager(T.key, so.sort(t.rows), 8);

    /* 另一端的结论也要露出来：同一条产品两端各审各的，
       这一端放行前得知道另一端是不是刚把它驳了 */
    function otherSide(p) {
      var O = TRK[OK];
      if (!p['to_' + OK]) return O.t + '未申请上架';
      return O.t + ' ' + (p['on_' + OK] ? '已上架' : (RV_TAG[p['review_' + OK]] || ['', ''])[1]);
    }

    m.innerHTML = pageH(T.name,
      '<b>这里是' + T.who + '的审核台，只管一件事：这条产品能不能在' + T.ch + '展示。</b>' +
      '供应商在 UBK 供应商门户录完产品属性、材料清单与套餐报价后提交上架，' +
      '勾了' + T.t + '的产品进入这里的「待审核」。<b>' + T.t + '审核通过，产品才会出现在' +
      T.ch + '里</b>；不合格的写明原因驳回，由供应商修改后重新提交。' +
      '<b>' + T.t + '与' + TRK[OK].t + '互不影响</b>——这里驳回不会把另一端已经在售的产品打下来。') +
      q.html +
      '<div class="card">' + t.html + '<div class="pad">' + table(
        /* 与「签证产品管理」共用同一套列（2026-09-09 唐美芳：按截图结构来）。
           原来这里是六个信息块（产品信息 / 签证属性 / 办理要求 …），字段虽全但
           跟产品管理那张表长得不一样，同一条产品在两个页面对不上号。 */
        so.cols(opsProdCols(tk)),
        pg.rows, function (p) {
          return opsProdCells(p, tk);
        }, '没有符合条件的产品', function (p) {
          /* C 端审核台：审核产品 + 复制小程序链接。审核动作在专门的审核页里做——
             列表上直接点通过等于没看产品就签字。 */
          return '<div class="btns">' +
            '<button class="btn sm p" data-rv2="' + p.id + '">审核产品</button>' +
            '<button class="btn sm g" data-cp="' + p.id + '">复制小程序链接</button>' +
            '</div>';
        }) + '</div>' + pg.html + '</div>';

    q.bind(m, function () { S.cache['pg:' + T.key] = 1; reload(); });
    t.bind(m, function () { S.cache['pg:' + T.key] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:' + T.key] = 1; reload(); });
    pg.bind(m, reload);
    bindChain(m);

    var byId = function (id) {
      return j.list.filter(function (x) { return x.id === +id; })[0];
    };
    $$('[data-pd]', m).forEach(function (b) {
      b.onclick = function () {
        /* 记住是从哪个审核台点进去的，详情页「返回」要退回原队列 */
        S.cache.upBack = 'prod' + tk; S.cache.upTab = 'info';
        go('prod', b.dataset.pd);
      };
    });
    $$('[data-ped]', m).forEach(function (b) {
      b.onclick = function () { S.cache.upBack = 'prod' + tk; go('edit', b.dataset.ped); };
    });
    $$('[data-rv2]', m).forEach(function (b) {
      b.onclick = function () {
        S.cache.upBack = 'prod' + tk;
        S.cache.upReview = tk;
        go('review', b.dataset.rv2);
      };
    });
    $$('[data-cp]', m).forEach(function (b) {
      b.onclick = function () { copyMiniLink(byId(b.dataset.cp)); };
    });
    $$('[data-pk]', m).forEach(function (b) {
      b.onclick = function () {
        var p = byId(b.dataset.pk);
        modal('套餐与报价 · ' + p.name,
          '<div class="note">' + T.who + '该表的核心判断为<b>毛利是否为正</b>：结算价是平台付给供应商的，' +
          '零售价是对外卖的，两者之差才是平台的毛利空间。倒挂的套餐不能上架。</div>' +
          table(['套餐', '结算价', '零售参考价', '毛利', '办理时长'], p.pkgs, function (k) {
            var g = k.suggest_retail - k.settle_price;
            return '<td><b>' + esc(k.name) + '</b></td><td class="num">¥' +
              money(k.settle_price) + '</td><td class="num">¥' + money(k.suggest_retail) +
              '</td><td class="num"><b style="color:' + (g < 0 ? 'var(--bad)' : 'var(--ok)') +
              '">¥' + money(g) + '</b></td><td class="num">' + k.lead_days +
              ' 个工作日</td>' +
              '</td>';
          }), null, true);
      };
    });
    $$('[data-nt]', m).forEach(function (b) {
      b.onclick = function () {
        var p = byId(b.dataset.nt);
        modal(T.t + '驳回原因 · ' + p.name,
          '<div class="note b">' + esc(p[RK + '_note'] || '') + '</div>' +
          '<div class="hint">' + d16(p[RK + '_at']) + ' 由 ' + esc(p[RK + '_by'] || '') +
          ' 驳回。供应商在 UBK 修改后重新提交' + T.t + '审核，会回到「待审核」。</div>');
      };
    });
    $$('[data-ap]', m).forEach(function (b) {
      b.onclick = function () {
        var p = byId(b.dataset.ap);
        ask(T.t + '审核通过 · ' + p.name, [
          { k: 'note', label: '审核备注', type: 'textarea', ph: '可留空。写在这里的备注会记进产品操作日志。' }
        ], '确认通过', function (v) {
          return api('/ops/product/review',
            { id: p.id, track: tk, action: 'approve', note: v.note });
        }).then(function () {
          toast('已通过，该产品现在在' + T.ch + '可售');
          reload();
        }).catch(function () { /* 失败已提示，弹窗保留 */ });
      };
    });
    $$('[data-rj],[data-rv]', m).forEach(function (b) {
      b.onclick = function () {
        var rv = !!b.dataset.rv, p = byId(b.dataset.rj || b.dataset.rv);
        ask((rv ? '撤销' + T.t + '上架 · ' : T.t + '驳回 · ') + p.name, [
          {
            k: 'note', label: rv ? '撤销原因' : '驳回原因', type: 'textarea', required: true,
            ph: rv ? '例：供应商报价已变更，需重新报备后再上架。'
              : '例：加急套餐结算价高于零售价，报价倒挂；受理范围未写明领区。'
          }
        ], rv ? '确认撤销' : '确认驳回', function (v) {
          return api('/ops/product/review',
            { id: p.id, track: tk, action: rv ? 'revoke' : 'reject', note: v.note });
        }).then(function () {
          toast(rv ? ('已撤销，产品已从' + T.ch + '下架')
            : ('已驳回，供应商可修改后重新提交' + T.t + '审核'));
          reload();
        }).catch(function () { /* 失败已提示，弹窗保留 */ });
      };
    });
  });
}

/* ================= UOM · 签证产品管理（平台侧产品目录） =================
   唐美芳 2026-08-31 给的菜单结构里，「签证管理 › 签证产品管理」下第一项就是它。
   在此之前平台侧只有 B 端 / C 端两个审核台，各自只列「等我审的」，
   想看「平台上一共有哪些签证产品、各自在哪端在售」没有地方看——
   审核台是待办队列，目录是资产台账，两回事。
   这里按平台视角一行一条产品，两端上架状态并列展示，不做审核动作（去审核台做）。 */
VIEWS['ops:prods'] = function (m) {
  return api('/ops/products').then(function (j) {
    var q = srchCard('opsprods', [
      { k: 'name', t: '产品名称 / 编码', ph: '支持模糊查询',
        get: function (p) { return p.name + ' ' + (p.code || ''); } },
      { k: 'country', t: '国家 / 地区', type: 'sel',
        opts: uniqOpts(j.list, function (p) { return p.country; }) },
      { k: 'supplier', t: '供应商', type: 'sel',
        opts: uniqOpts(j.list, function (p) { return p.supplier; }) },
      { k: 'submit_city', t: '送签地', type: 'sel',
        opts: uniqOpts(j.list, function (p) { return p.submit_city; }) },
      /* 按清单版本筛产品：材料库列表里点「关联签证产品」跳过来时填的就是这一格
         （唐美芳 2026-09-09）。值是版本号（唯一键），显示的是名称。 */
      { k: 'fullver', t: '送签材料清单', type: 'sel', opts: fvOpts(j.list) }
    ]);
    var hit = q.filter(j.list);
    /* 接口已经算好 on_b / on_c（勾了该端 + 该端审核通过），别在前端重算一遍口径。
       审核状态的取值是 none / pending / approved / rejected，不是 pass。 */
    var onB = function (p) { return !!p.on_b; };
    var onC = function (p) { return !!p.on_c; };
    /* 2026-09-09 第三版：B 端审核并进本页，**本页从此就是渠道运营（B 端）的台子**，
       页签按她定的四个：全部 / 待审核 / 在售 / 停售。
       C 端不在这里露面——「B 只审核 B 的，C 只审核 C 的，2 拨人处理，
       所以千万不要混在一起」。 */
    var t = subTabs('opsprods', [
      { k: 'all', t: '全部', fn: function () { return true; } },
      { k: 'wait', t: '待审核', fn: function (p) { return p.review_b === 'pending'; } },
      { k: 'on', t: '在售', fn: function (p) { return onB(p); } },
      { k: 'offsale', t: '停售', fn: function (p) { return !!p.off_sale; } }
    ], hit);
    var so = sorter('opsprods', [
      ['产品', function (p) { return p.name || ''; }],
      ['套餐 / 售价', function (p) { return p.retail_min || 0; }],
      ['成交单量', function (p) { return p.ord_count || 0; }]
    ]);
    var pg = pager('opsprods', so.sort(t.rows), 10);

    m.innerHTML = pageH('签证产品管理（B端）',
      '渠道运营的产品台，只管一件事：这条产品能不能在 <b>CSP 门店 / 同业产品预订中心</b>卖。' +
      '待审的产品在「待审核」页签里，行上直接给「审核产品」。' +
      'C 端的上架由内容运营在「签证产品管理（C端）」里单独处理，两边互不影响。' +
      '产品由供应商在 UBK 自行录入，这里只看与查，审核动作在 B 端 / C 端审核台。') +
      '<div class="grid" style="margin-bottom:14px">' +
      '<div class="stat"><b>' + j.list.length + '</b><span>平台产品总数</span></div>' +
      '<div class="stat"><b>' + j.list.filter(onB).length + '</b><span>B 端在售</span></div>' +
      '<div class="stat"><b>' + j.list.filter(onC).length + '</b><span>C 端在售</span></div>' +
      '<div class="stat"><b>' + uniqOpts(j.list, function (p) { return p.supplier; }).length +
      '</b><span>供货供应商</span></div>' +
      '<div class="stat"><b>' + j.list.reduce(function (a, p) { return a + (p.ord_count || 0); }, 0) +
      '</b><span>累计成交单量</span></div></div>' + q.html +
      '<div class="card">' + t.html + '<div class="pad scrollx">' + table(
        so.cols(opsProdCols('b')),
        pg.rows, function (p) {
          /* 待 B 端审核的行，第一颗按钮就是「审核产品」；C 端的事不在这张表上办 */
          var pb = p.review_b === 'pending';
          return opsProdCells(p, 'b') +
            '<td class="nw"><div class="btns">' +
            (pb ? '<button class="btn sm p" data-rvb="' + p.id + '">审核产品</button>' : '') +
            '<button class="btn sm' + (pb ? '' : ' p') + '" data-pv="' + p.id +
            '">查看详情</button>' +
            '<button class="btn sm" data-ped="' + p.id + '">编辑产品</button>' +
            '<button class="btn sm" data-ppk="' + p.id + '">编辑套餐</button>' +
            '<button class="btn sm g" data-cp="' + p.id + '">复制小程序链接</button>' +
            '</div></td>';
        }, '没有符合条件的产品') + '</div>' + pg.html + '</div>';

    function rl() { S.cache['pg:opsprods'] = 1; reload(); }
    q.bind(m, rl); t.bind(m, rl); so.bind(m, rl); pg.bind(m, reload);
    $$('[data-ped]', m).forEach(function (b) {
      /* 编辑产品 / 编辑套餐：复用供应商侧那两个页面，运营进去改的是同一条产品。
         带上 upBack，改完「返回」回到本列表而不是掉进 UBK 的产品列表。 */
      b.onclick = function () { S.cache.upBack = 'prods'; go('edit', b.dataset.ped); };
    });
    $$('[data-cp]', m).forEach(function (b) {
      b.onclick = function () {
        copyMiniLink((j.list || []).filter(function (x) { return x.id === +b.dataset.cp; })[0]);
      };
    });
    $$('[data-rvb]', m).forEach(function (b) {
      b.onclick = function () {
        /* B 端审核进的是**产品详情页**，底部挂审核驳回 / 通过
           （唐美芳 2026-09-10：「我之前说的 B 端产品审核进入的是产品详情页，
           底部是审核驳回、通过按钮。C 端审核的页面才需要二次编辑，
           你现在把 2 个端的审核页面都变成一样了」）。
           两端要审的东西本来就不同：B 端渠道运营看的是结算价成不成立、材料清单绑没绑对，
           这些都是供应商的口径，运营不该在审核时顺手改；C 端内容运营要调的是对客文案，
           所以只有 C 端那张页面带编辑区。 */
        S.cache.upBack = 'prods'; S.cache.upReview = 'b'; S.cache.upTab = 'info';
        go('prod', b.dataset.rvb);
      };
    });
    $$('[data-sale]', m).forEach(function (a2) {
      a2.onclick = function () {
        var p = (j.list || []).filter(function (x) { return x.id === +a2.dataset.sale; })[0] || {};
        var off = !p.off_sale;   /* 当前在售 → 点一下变停售 */
        confirmBox(off ? '停售' : '启售',
          off
            ? '停售后<b>客户端与门店端立即不再展示</b>本产品，已下单的订单不受影响。<br>' +
              '审核结论保留，重新启售不需要再走一遍审核。'
            : '启售后按各端<b>审核结论</b>恢复展示：审核通过的端才会重新出现。',
          off ? '确认停售' : '确认启售')
          .then(function () { return api('/ops/product/onsale', { id: p.id, off: off ? 1 : 0 }); })
          .then(function (r) { toast(r.msg || '已更新'); reload(); })
          .catch(function () { });
      };
    });
    $$('[data-ppk]', m).forEach(function (b) {
      b.onclick = function () { S.cache.upBack = 'prods'; go('pkgs', b.dataset.ppk); };
    });
    $$('[data-pv]', m).forEach(function (b) {
      b.onclick = function () {
        /* 详情页的「返回」按 upBack 决定回哪，从目录进来就回目录 */
        S.cache.upBack = 'prods';
        go('prod', b.dataset.pv);
      };
    });
  });
};

/* ================= UBK · 预付款退款管理 =================
   唐美芳 2026-08-31 给的 UBK 菜单结构里的「结算管理 › 预付款退款管理」。
   业务上补的是一个真实缺口：客户退款出账后，平台已经对供应商挂的结算款原来没有任何冲减——
   钱退给客户了，账还挂在供应商名下。这张单算的是「供应商该退回平台多少」。
   金额按办签进度分档：没开工全退，填表/预约中签证费已代缴不退，已递交则服务费再留一半。 */
/* 「付款退款管理」2026-08-31 按众信截图重做，移到 v-settle3.js */
