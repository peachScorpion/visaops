/* ================= UOM · 平台配置：签证表格模板 =================
   和「国家送签材料库」是并列的两层，不是一回事：
     材料库 —— 客户要交哪些件（护照、照片、在职证明，十几项）
     字段库 —— 官方申请表上要填哪些格（美国 DS-160 有 72 格）
   两层靠「字段来源」挂钩：哪几格能由护照 OCR 带出、哪几格系统能带、
   哪几格只能问客户本人。这张分类表就是「AI 到底能替客户省掉多少工作」的账。 */

var SRC_T = { ocr: '证件识别', sys: '系统带出', ask: '客户必答', agent: '专员操作' };
var SRC_TONE = { ocr: 'ok', sys: 'info', ask: 'warn', agent: 'plain' };
/* 填写类型决定客户端问卷把这一格渲染成什么控件。全标「文本」等于把渲染难题甩给前端：
   是否题该给两个按钮、国家走标准字典、组合信息要展开成一组子项。
   group / action 两类根本不是输入框——前者一格套一组子项（父母信息、家庭住址），
   后者是专员在官网上的动作（设密保、打印确认页），客户端不该出题。 */
var FTYPE_T = {
  text: '文本', date: '日期', select: '单选', multi: '多选', bool: '是否题',
  country: '国家地区', file: '文件上传', group: '组合信息', action: '操作动作'
};

function srcTag(f) {
  return '<span class="tag ' + (SRC_TONE[f.src] || 'plain') + '">' + (SRC_T[f.src] || f.src) + '</span>';
}
function optList(x) {
  try { return JSON.parse(x.options || '[]') || []; } catch (e) { return []; }
}
function ftypeTag(x) {
  var o = (x.ftype === 'select' || x.ftype === 'multi') ? optList(x) : [];
  return '<span class="tag">' + esc(FTYPE_T[x.ftype] || x.ftype || '文本') + '</span>' +
    (o.length ? '<div class="hint">' + esc(o.join(' / ')) + '</div>' : '');
}

VIEWS['ops:forms'] = function (m, id) {
  if (id) return formDetail(m, id);
  return api('/ops/formvers').then(function (j) {
    var list = j.list || [];
    /* 下拉选项源：后端把常量与现有数据的并集算好下发 */
    FV_COUNTRIES = j.countries || [];
    if (j.visa_cats) VISA_CATS = j.visa_cats;
    var sum = function (k) { return list.reduce(function (a, f) { return a + (f[k] || 0); }, 0); };
    var q = srchCard('opsfm', [
      {
        k: 'kw', t: '版本号 / 表格代码 / 名称', ph: '支持模糊查询',
        get: function (f) { return f.ver_no + ' ' + (f.form_code || '') + ' ' + f.name; }
      },
      { k: 'country', t: '国家', type: 'sel', opts: uniqOpts(list, function (f) { return f.country; }) },
      /* 空值＝该国通用，在筛选里也得能选出来，不然那几条模板等于筛不到 */
      { k: 'visa_type', t: '签证类型', type: 'sel',
        opts: [['', '不限（该国通用）']].concat(VISA_CATS.map(function (v) { return [v, v]; })),
        get: function (f) { return f.visa_type || ''; } }
    ]);
    var t = subTabs('opsfm', [
      { k: 'all', t: '全部', fn: function () { return true; } },
      { k: 'on', t: '启用', fn: function (f) { return !!f.active; } },
      { k: 'off', t: '禁用', fn: function (f) { return !f.active; } }
    ], q.filter(list));
    var so = sorter('opsfm', [
      ['字段数', function (f) { return f.fields || 0; }],
      ['可自动带出', function (f) { return f.auto || 0; }],
      ['客户必答', function (f) { return f.ask_net || 0; }],
      ['高风险字段', function (f) { return f.risk || 0; }]
    ].concat(AUD_SORTS));
    var pg = pager('opsfm', so.sort(t.rows), 10);
    var tot = sum('fields'), auto = sum('auto');

    m.innerHTML = pageH('国家签证表模板',
      '维护「某国官方申请表要填哪些格」，并逐格标清楚这一格的数据从哪来——' +
      '证件识别、系统带出、还是只能问客户本人。该分类表决定 AI 可为客户减少的填写量，' +
      '也是后面「AI 预填 + 专员二次确认」功能的字段依据。',
      '<button class="btn p" data-imp-new>新建</button>') +
      kpiBand('opsfm', [
        { t: '在库字段总数', n: tot, unit: '格' },
        { t: 'AI 可自动带出', n: auto, unit: '格', tone: 'act', sub: tot ? Math.round(auto * 100 / tot) + '%' : '' },
        { t: '系统默认代答', n: sum('ask_dft'), unit: '格', sub: '高风险是非题默认填否' },
        /* 这里必须用 ask_net 而不是 src_stat.ask：后者把系统默认代答否的高风险题也算进去了，
           而那些题客人根本看不到。用毛数会让运营高估「客人要填多少」将近一倍。 */
        { t: '必须客户本人答', n: sum('ask_net'), unit: '格', tone: 'warn' },
        { t: '高风险字段', n: sum('risk'), unit: '格', tone: 'bad', sub: '填错会拒签' }
      ]) + q.html +
      '<div class="card">' + t.html + '<div class="pad">' + table(
        /* 唐美芳 2026-09-07：「未覆盖字段不是去掉了么，怎么列表里还展示」。
           v110 只删了详情页的「现有覆盖」列，列表这一列漏了。
           覆盖度是导入 Excel 时的可选标注，运营实际不维护，长期显示 0，占一列宽度还让人以为有问题。 */
        /* 单位统一用「格」——表模板管的是**表格里要填的格子**；
           送签材料库管的是**要交的材料**，那边用「项」。
           两边原来都叫「项数」，唐美芳 2026-09-09：「国家送签材料库里的材料项数，
           与国家签证表模板的材料项数的区别在哪里，怎么感觉数字对不上」。 */
        so.cols(['版本号', '表格代码', '名称', '国家', '签证类型', '表格字段', '可自动带出',
          '需客户填写', '高风险字段', '状态'].concat(AUD_COLS, ['操作'])),
        pg.rows, function (f) {
          var st = f.src_stat || {};
          return '<td class="mono"><b>' + esc(f.ver_no) + '</b></td>' +
            '<td class="mono">' + esc(f.form_code || '—') + '</td>' +
            '<td style="min-width:200px"><b>' + esc(f.name) + '</b>' +
            (f.official_url ? '<div class="hint"><a href="' + esc(f.official_url) +
              '" target="_blank">官方填报入口</a></div>' : '') + '</td>' +
            '<td class="nw">' + esc(f.country) + '</td>' +
            '<td>' + (f.visa_type ? '<span class="tag info">' + esc(f.visa_type) + '</span>'
              : '<span class="hint">不限（该国通用）</span>') + '</td>' +
            '<td class="num"><b>' + (f.fields || 0) + '</b> 格</td>' +
            '<td class="num"><b>' + (f.auto || 0) + '</b> 格' +
            '<div class="hint nw">证件识别 ' + (st.ocr || 0) + ' · 系统带出 ' + (st.sys || 0) +
            '</div></td>' +
            '<td class="num"><b>' + (f.ask_net || 0) + '</b> 格' +
            (f.ask_dft ? '<div class="hint nw">另 ' + f.ask_dft + ' 格默认代答</div>' : '') + '</td>' +
            '<td class="num">' + (f.risk ? '<span class="tag bad">' + f.risk + '</span>' : '—') + '</td>' +
            /* 表模板是**底层字典**，被国家送签材料库的清单版本引用，一份模板可被
               多个清单版本引用。它自己只需要启用 / 禁用——能不能用由引用它的清单版本决定
               （唐美芳 2026-09-09 纠正：「你现在加上了发布未发布状态整复杂了，退回下」）。
               我 06:19 那版给它加过「已发布 / 待发布」，当天退回。 */
            '<td>' + (f.active ? '<span class="tag ok">启用</span>'
              : '<span class="tag plain">禁用</span>') + '</td>' +
            audTd(f) +
            '<td><div class="btns">' +
            '<button class="btn sm p" data-v="' + f.id + '">查看字段</button>' +
            '<button class="btn sm" data-fe=\'' + jattr({
              id: f.id, country: f.country, visa_type: f.visa_type, form_code: f.form_code,
              name: f.name, official_url: f.official_url
            }) + '\'>编辑</button>' +
            '<button class="btn sm" data-imp="' + f.id + '">导入更新</button>' +
            '<button class="btn sm" data-tg="' + f.id + '">' +
            (f.active ? '禁用' : '启用') + '</button></div></td>';
        }, '还没有表模板，点右上角「新增」导入第一份官方字段表') + '</div>' + pg.html + '</div>';

    q.bind(m, function () { S.cache['pg:opsfm'] = 1; reload(); });
    t.bind(m, function () { S.cache['pg:opsfm'] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:opsfm'] = 1; reload(); });
    pg.bind(m, reload);
    kpiBand('opsfm', null, m, function () { S.cache['pg:opsfm'] = 1; reload(); });
    bindChain(m);
    $$('[data-v]', m).forEach(function (b) { b.onclick = function () { go('forms', b.dataset.v); }; });
    $$('[data-imp]', m).forEach(function (b) {
      b.onclick = function () { importFlow(+b.dataset.imp, null); };
    });
    $$('[data-fe]', m).forEach(function (b) {
      b.onclick = function () { fvForm(JSON.parse(b.dataset.fe)); };
    });
    $$('[data-tg]', m).forEach(function (b) {
      b.onclick = function () {
        api('/ops/formver/toggle', { id: +b.dataset.tg }).then(function (r) {
          toast(r.active ? '已启用' : '已禁用'); reload();
        }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    $('[data-imp-new]', m).onclick = function () { importFlow(null, null); };
  });
};

/* 国家与签证类型改成下拉（唐美芳 2026-08-31：「uom的美国签证表模板的签证类型、
   国家也应该是下拉选择的」）。手输的后果这套系统里已经见过一次：产品目录里
   「访客签证 600 类别」「标准访问签证（Standard Visitor）」「个人旅游签证」
   同为旅游签却写法各异，模板靠「国家 + 签证类型」匹配产品，写法对不上就匹配不到。

   签证类型这里用的是 VISA_CATS（旅游/商务/留学…那 9 类），不是产品上的
   「签证名称」——一张官方表管一整类签证（美国非移民签证全用 DS-160），
   细到「个人旅游签证（B1/B2）」反而会让同一张表被迫建好几份。
   留一个空选项：模板常常是整个国家通用的，不限签证类型。 */
function fvCountryOpts(cur) {
  /* 首项留空：不留的话下拉默认选中排序第一的「俄罗斯」，
     运营手一快就建成俄罗斯的模板了。required 校验会拦住空值。 */
  var seen = {}, out = [{ v: '', t: '— 请选择 —' }];
  (FV_COUNTRIES || []).concat(cur ? [cur] : []).forEach(function (x) {
    if (x && !seen[x]) { seen[x] = 1; out.push({ v: x, t: x }); }
  });
  return out;
}
function fvCatOpts(cur) {
  var out = [{ v: '', t: '不限（该国通用）' }];
  var seen = {};
  VISA_CATS.concat(cur ? [cur] : []).forEach(function (x) {
    if (x && !seen[x]) { seen[x] = 1; out.push({ v: x, t: x }); }
  });
  return out;
}
/* 已有模板里出现过的国家 + 系统常量，合起来给下拉；页面加载时填充 */
var FV_COUNTRIES = [];

/* 模板抬头信息的编辑。只改这几个说明性字段，不动 form_field——
   打错个名字不该逼着运营重导一遍整张表，那会让已标好的字段来源分类全部重来。 */
function fvForm(f) {
  return ask('编辑模板信息 · ' + f.name, [
    { k: 'country', label: '国家', type: 'select', required: true,
      value: f.country, options: fvCountryOpts(f.country) },
    { k: 'visa_type', label: '签证类型', type: 'select', value: f.visa_type || '',
      options: fvCatOpts(f.visa_type),
      hint: '一张官方表单通常适用于同一类签证；选择「不限」表示该国全部签证均适用本表单' },
    { k: 'form_code', label: '表格代码（选填）', value: f.form_code, ph: '如：DS-160',
      hint: '官方为该表单编制的编号，如无可留空' },
    { k: 'name', label: '模板名称', required: true, value: f.name },
    { k: 'official_url', label: '官方填报入口（选填）', value: f.official_url, ph: 'https://ceac.state.gov/GENNIV/' }
  ], '保存', function (v) {
    return api('/ops/formver/save', {
      id: f.id, country: v.country, visa_type: v.visa_type,
      form_code: v.form_code, name: v.name, official_url: v.official_url
    });
  }).then(function () { toast('已保存'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
}

/* 导入两步走：先解析给预览，看清楚要新增/变更多少条，确认了才入库。
   不做「传上来直接覆盖」——那会把运营已经标好的字段来源分类洗掉，等于白干一遍。 */
function importFlow(formverId, seed) {
  var fields = [{
    type: 'html', html: '<div class="note">上传官方字段表，支持 <b>.xlsx / .csv / .docx</b> 格式。' +
      '文件须包含「信息板块」与「具体字段名称」两列；「填报说明」「官方 Help」「重要提醒」' +
      '「覆盖范围」等列可识别时一并导入。Word 文档仅解析其中的<b>表格</b>，正文段落不予读取；' +
      '文档含多张表格时，系统自动匹配包含上述两列表头的表格。<br>' +
      '解析完成后先行预览，确认无误后方可入库；已标注的字段来源分类不会被覆盖。</div><br>'
  }];
  if (!formverId) {
    fields = fields.concat([
      { k: 'country', label: '国家', type: 'select', required: true,
        value: (seed && seed.country) || '', options: fvCountryOpts(seed && seed.country) },
      { k: 'visa_type', label: '签证类型', type: 'select', value: (seed && seed.visa_type) || '',
        options: fvCatOpts(seed && seed.visa_type),
        hint: '一张官方表单通常适用于同一类签证；选择「不限」表示该国全部签证均适用本表单' },
      { k: 'form_code', label: '表格代码（选填）', value: seed && seed.form_code, ph: '如：DS-160',
        hint: '官方为该表单编制的编号，如无可留空' },
      { k: 'name', label: '版本名称', required: true, value: seed && seed.name, ph: '如：DS-160 在线非移民签证申请表 完整字段' },
      { k: 'official_url', label: '官方填报入口（选填）', value: seed && seed.official_url, ph: 'https://ceac.state.gov/GENNIV/' }
    ]);
  }
  /* 字段表改成选填（唐美芳 2026-08-31：「表格代码、官方字段表是不是可以不用填」）。
     不传就先把模板抬头建起来，字段回头在详情页「导入更新」补——
     运营常常是先知道要建哪张表，官方字段表还在整理。
     导入更新时仍然必须传：那一步本来就是为了导字段。 */
  /* 模板下载（唐美芳 2026-09-01）：各国官方表格式不一，运营手动整理时最容易错的是列名——
     解析器只认「信息板块」「具体字段名称」两个必需列，对不上整张表都读不进来。
     给一份带表头、填写说明与示例行的空模板，照着填一次就能过。 */
  fields.push({
    type: 'html',
    html: '<div class="f"><span>字段表模板</span>' +
      '<div><button type="button" class="btn sm" data-tpl>下载标准模板（.xlsx）</button></div>' +
      '<div class="hint">按模板的列名与格式填写，可直接上传。模板第二行为填写说明，' +
      '导入时会自动跳过，无需删除。</div></div>'
  });
  fields.push({
    k: 'file', label: '官方字段表' + (formverId ? '' : '（选填）'), type: 'file',
    required: !!formverId, accept: '.xlsx,.xls,.csv,.docx,.doc',
    hint: formverId ? '单次仅支持上传一个文件'
      : '可暂不上传。先建立模板，后续在模板详情页通过「导入更新」补充字段'
  });
  /* 提交走 onSubmit：解析失败、重名、后端校验不通过时，弹窗与已填内容原样留着，
     不用把国家、名称、官方入口再敲一遍（唐美芳 2026-09-01）。 */
  return ask(formverId ? '导入更新 · 覆盖现有版本' : '新增国家签证表模板',
    fields, formverId ? '解析预览' : '下一步',
    function (v) {
      var f = (v.file || [])[0];
      if (!f) {
        if (formverId) return Promise.reject(new Error('请先上传官方字段表'));
        // 未上传文件：先建立一张空模板，字段稍后导入
        return api('/ops/formver/save', {
          country: v.country, visa_type: v.visa_type, form_code: v.form_code,
          name: v.name, official_url: v.official_url
        }).then(function (r) {
          toast('模板已建立，尚无字段。请在模板详情页通过「导入更新」上传官方字段表');
          go('forms', r.id);
        });
      }
      var payload = {
        formver_id: formverId, url: f.url, country: v.country, visa_type: v.visa_type,
        form_code: v.form_code, name: v.name, official_url: v.official_url
      };
      return api('/ops/form/import', payload).then(function (p) { preview(p, payload); });
    }).catch(function () { /* 失败已在 ask 内提示，弹窗保留 */ });
}
/* 模板下载按钮挂在 ask 弹窗里，弹窗是 modal 动态插入的，
   所以用事件委托绑在 document 上，一次就够，不随弹窗反复绑。 */
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('[data-tpl]');
  if (!b) return;
  b.disabled = true;
  api('/ops/form/tpl').then(function (r) {
    var a = document.createElement('a');
    a.href = r.url; a.download = r.name || '官方字段表模板.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    toast('模板已下载');
  }).catch(fail).then(function () { b.disabled = false; });
});

function preview(p, payload) {
  var li = function (title, n, rowsArr, tone) {
    if (!n) return '';
    return '<div class="card" style="margin:0 0 12px"><h3>' + title +
      ' <span>' + n + ' 条</span></h3><div class="pad hint">' +
      (rowsArr || []).map(function (x) { return esc(x.section + ' · ' + x.name); }).join('<br>') +
      (n > (rowsArr || []).length ? '<br>…… 另有 ' + (n - rowsArr.length) + ' 条' : '') +
      '</div></div>';
  };
  var st = p.src_stat || {};
  var pct = function (n) { return p.total ? Math.round(n * 100 / p.total) + '%' : ''; };
  modal('导入预览 · 工作表「' + p.sheet + '」',
    '<div class="note">表格里共解析出 <b>' + p.total + '</b> 个字段：' +
    '新增 <b>' + p.add + '</b> 条，内容有变更 <b>' + p.upd + '</b> 条，无变化 ' + p.same + ' 条' +
    (p.gone ? '，资料库中存在但该表未包含 <b>' + p.gone + '</b> 条' : '') + '。<br>' +
    '确认入库只会「新增 + 更新说明文字」，<b>不会删除</b>库里已有字段，也不会改动运营已标好的字段来源分类。' +
    (p.gone ? '下面「表里没有」的字段请人工核对是否官网已删。' : '') + '</div><br>' +
    /* 运营传完表最先想知道的不是「新增几条」，是「客人还得自己填几格」。
       所以自动分析结果排在差异清单前面。 */
    '<div class="card" style="margin:0 0 12px"><h3>自动分析 · 该表 AI 可为客户减少的填写量</h3>' +
    '<div class="pad">' +
    kpiBand(null, [
      { t: 'AI 可自动填', n: p.auto, unit: '格', tone: 'act',
        sub: '证件识别 ' + (st.ocr || 0) + ' · 系统带出 ' + (st.sys || 0) + ' · ' + pct(p.auto) },
      { t: '系统默认代答', n: p.ask_dft, unit: '格', sub: '高风险是非题默认填「否」，不打扰客户' },
      { t: '必须客户本人提交', n: p.ask_net, unit: '格', tone: 'warn', sub: '下面逐条列出 · ' + pct(p.ask_net) },
      { t: '专员在官网操作', n: st.agent || 0, unit: '格', sub: '设密保、终审、打印确认页' }
    ]).replace('class="kpis"', 'class="kpis" style="grid-template-columns:repeat(4,1fr)"') +
    '<div class="hint" style="margin-top:10px">' +
    '分类依据是字段名关键词，导入后可在详情页逐格改判——系统只负责先分好，不替运营拍板。' +
    '其中 <b>' + p.risk + '</b> 格是高风险字段（填错会拒签）。</div></div></div>' +
    '<div class="card" style="margin:0 0 12px"><h3>必须客户本人提交的字段 <span>' +
    p.ask_net + ' 条</span></h3><div class="pad hint">' +
    (p.ask_list || []).map(function (x) {
      return esc(x.section + ' · ' + x.name) + (x.risk ? ' <span class="tag bad">高风险</span>' : '');
    }).join('<br>') + '</div></div>' +
    li('新增字段', p.add, p.add_list) +
    li('内容有变更', p.upd, p.upd_list) +
    li('资料库中存在、该表未包含', p.gone, p.gone_list),
    [{ t: '取消' }, {
      t: '确认入库', cls: 'p', fn: function () {
        return api('/ops/form/import/commit', payload).then(function (r) {
          toast('已入库：新增 ' + r.add + ' 条 / 更新 ' + r.upd + ' 条');
          go('forms', r.formver_id);
        }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      }
    }], true);
}

/* ---------------- 详情：逐格看这张表怎么填、这一格数据从哪来 ---------------- */
function formDetail(m, id) {
  return api('/ops/formver?id=' + id).then(function (j) {
    var f = j.formver, all = j.fields || [];
    FV_COUNTRIES = j.countries || FV_COUNTRIES;
    if (j.visa_cats) VISA_CATS = j.visa_cats;
    var st = {};
    all.forEach(function (x) { st[x.src] = (st[x.src] || 0) + 1; });
    var auto = (st.ocr || 0) + (st.sys || 0);
    var askNet = all.filter(function (x) { return x.src === 'ask' && !x.dft_no; }).length;
    var askDft = (st.ask || 0) - askNet;
    /* 这是子页面，运营进来是为了「按分类快速扫一遍、就地改」，不是来做数据分析的。
       所以这里不放操作说明、不放 KPI 汇总、不放筛选搜索——分类直接做成页签，
       每个页签一句话说清它是什么、在这儿该干什么，进来就能动手。 */
    var TABS = [
      {
        k: 'all', t: '全部字段', fn: function () { return true; },
        note: '官方申请表的全部格子，按官方板块和顺序排列。这一版共 ' + all.length +
          ' 格，其中 ' + auto + ' 格 AI 能自动带出，客户实际只需自己填 ' + askNet + ' 格。'
      },
      {
        k: 'auto', t: 'AI 自动填',
        fn: function (x) { return x.src === 'ocr' || x.src === 'sys'; },
        note: '以下字段无需客户填写：证件识别 ' + (st.ocr || 0) + ' 格（护照页、身份证、' +
          '在职证明扫描件中直接读取），系统带出 ' + (st.sys || 0) + ' 格（订单、产品、行程、' +
          '联系方式中已有）。<b>请重点核对「数据来自」一列</b>——填写越具体，AI 预填越准确；' +
          '标注为「客户本人确认」的表示尚未配置来源，将退化为由客户填写。'
      },
      {
        k: 'dft', t: '系统默认代答',
        fn: function (x) { return x.src === 'ask' && x.dft_no; },
        note: '高风险是非题，按现行流程<b>系统默认填「否」、不向客户提问</b>（拒签史、犯罪、' +
          '兵役、移民违规这类）。<b>重点确认这里没有误伤</b>——比如「是否曾去过美国」' +
          '答「是」属加分项，不应纳入本类；如发现归类有误，点击「编辑」取消勾选即可。'
      },
      {
        k: 'ask', t: '必须客户提交',
        fn: function (x) { return x.src === 'ask' && !x.dft_no; },
        note: '<b>这一页就是客户端问卷的真实题量（' + askNet + ' 题）。</b>' +
          '如需压缩客户填写量，请在本页调整：可从证件或订单中取得的，改为 AI 自动填充；' +
          '现行流程不向客户提问的是非题，改为系统默认代答。'
      },
      {
        k: 'agent', t: '专员官网操作',
        fn: function (x) { return x.src === 'agent'; },
        note: '不是输入框，是专员在官方网站上的动作（设密保问题、终审、打印确认页）。' +
          '官方网站没有公开接口也不授权代提交，这几步只能留人工，不能对外承诺自动化。'
      },
      {
        k: 'risk', t: '高风险',
        fn: function (x) { return !!x.risk; },
        note: '此类字段填写错误的后果不是退回重填，而是<b>拒签</b>，个别项将按虚假陈述处理。' +
          '凡需客户回答的高风险题，必须由客户本人确认并留痕，不得由销售或专员代为决定。'
      }
    ];
    var t = subTabs('opsfd', TABS, all);
    var curTab = TABS.filter(function (x) { return x.k === t.cur; })[0] || TABS[0];

    m.innerHTML = pageH('表单 ' + f.ver_no + ' · ' + f.name,
      esc(f.country) + ' · ' + esc(f.visa_type || '该国通用') +
      (f.form_code ? ' · ' + esc(f.form_code) : '') +
      ' · 共 ' + all.length + ' 格' +
      (f.official_url ? ' · <a href="' + esc(f.official_url) + '" target="_blank">官方填报入口</a>' : ''),
      '<button class="btn" data-back>返回列表</button> ' +
      '<button class="btn" data-imp>导入更新</button> ' +
      '<button class="btn p" data-add>新增字段</button>') +
      '<div class="card">' + t.html +
      '<div class="pad"><div class="note b" style="margin-bottom:12px">' + curTab.note + '</div>' +
      table(
        ['序号', '信息板块', '字段名称', '填写类型', '字段来源', '数据来自',
          '填报说明与官方提示', '操作'],
        t.rows, function (x) {
          return '<td class="num">' + (x.sort || 0) + '</td>' +
            '<td class="nw">' + esc(x.section) + '</td>' +
            '<td style="min-width:200px"><b>' + esc(x.name) + '</b>' +
            (x.risk ? ' <span class="tag bad">高风险</span>' : '') +
            (x.required ? '' : ' <span class="tag plain">选填</span>') + '</td>' +
            '<td class="nw">' + ftypeTag(x) + '</td>' +
            '<td>' + srcTag(x) +
            (x.src === 'ask' && x.dft_no ? '<div class="hint nw">默认答「否」</div>' : '') + '</td>' +
            '<td class="hint">' + esc(x.src_from || '—') + '</td>' +
            /* 官方 Help 动辄几百字，整段铺开一行就有半屏高，列表就没法扫了。
               这里只露三行，全文点「看全文」弹出来。 */
            '<td class="hint fnote">' +
            (x.fill_note || x.help_text || x.notice
              ? '<div class="clamp3">' + esc(x.fill_note || x.help_text || x.notice) + '</div>' +
              '<a class="ht-t" data-n="' + x.id + '">看全文</a>'
              : '—') + '</td>' +
            '<td><div class="btns"><button class="btn sm" data-e=\'' + jattr({
              id: x.id, name: x.name, src: x.src, src_from: x.src_from, ftype: x.ftype,
              options: x.options, risk: x.risk, required: x.required, dft_no: x.dft_no,
              fill_note: x.fill_note
            }) + '\'>编辑</button>' +
            '<button class="btn sm r" data-d="' + x.id + '" data-dn="' + esc(x.name) +
            '">删除</button></div></td>';
        }, '这一类下暂时没有字段') + '</div></div>';

    t.bind(m, reload);
    $('[data-back]', m).onclick = function () { go('forms'); };
    $('[data-add]', m).onclick = function () { fieldForm(f, null, all); };
    $$('[data-d]', m).forEach(function (b) {
      b.onclick = function () {
        confirmBox('删除字段', '确定删除「' + esc(b.dataset.dn) + '」？<br>' +
          '已经有办签人填过的格子不允许删除，系统会拦下。', '删除').then(function () {
            return api('/ops/form/field/del', { id: +b.dataset.d });
          }).then(function () { toast('已删除'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    });
    $('[data-imp]', m).onclick = function () { importFlow(f.id, null); };
    $$('[data-n]', m).forEach(function (b) {
      b.onclick = function () {
        var x = all.filter(function (y) { return y.id == b.dataset.n; })[0];
        var sec = function (t, v, cls) {
          return v ? '<h4 style="margin:12px 0 4px">' + t + '</h4><div' +
            (cls ? ' class="' + cls + '"' : '') + ' style="line-height:1.8;white-space:pre-wrap">' +
            esc(v) + '</div>' : '';
        };
        modal(x.section + ' · ' + x.name,
          '<div class="note">数据来源：' + (SRC_T[x.src] || x.src) +
          (x.src_from ? '（' + esc(x.src_from) + '）' : '') +
          (x.risk ? ' · <b>高风险字段，填错会拒签，必须客户本人确认并留痕</b>' : '') + '</div>' +
          sec('填报说明及要求', x.fill_note) +
          sec('官方 Help 帮助提示', x.help_text) +
          sec('官方重要提醒', x.notice, 'warnbox'), null, true);
      };
    });
    $$('[data-e]', m).forEach(function (b) {
      b.onclick = function () { fieldForm(f, JSON.parse(b.dataset.e), all); };
    });
  });
}

/* 新增和编辑共用一个表单：两边要填的东西本来就是同一套，拆成两份迟早改漏一边。
   x 为空是新增——这时才让运营选板块、起名字；编辑不给改名，
   因为字段名是官方申请表上的原话，也是导入时比对新旧版本的键，改了下次导入会变成一条新字段。 */
function fieldForm(f, x, all) {
  x = x || {};
  var isNew = !x.id;
  var fields = [{
    type: 'html', html: '<div class="note">「字段来源」决定这一格由谁负责：' +
      '标成证件识别或系统带出，客户端问卷里就不再问客户；标成客户必答，' +
      '客户端将据此生成对应题目。标注有误会导致客户重复填写或系统遗漏字段。<br>' +
      '「填写类型」决定客户端对该字段渲染的控件形态：是非题渲染为两个选项按钮、' +
      '国家走标准字典、组合信息展开成一组子项。</div><br>'
  }];
  if (isNew) {
    fields.push({
      k: 'section', label: '信息板块', required: true,
      type: 'select',
      options: uniqOpts(all, function (y) { return y.section; })
        .map(function (o) { return { v: o[0], t: o[1] }; })
    });
    fields.push({
      k: 'name', label: '字段名称', required: true,
      ph: '与官方申请表原文保持一致，如：您是否曾经去过美国？',
      hint: '字段名是比对新旧版本的依据，建库后不再支持改名'
    });
  }
  fields = fields.concat([
    {
      k: 'ftype', label: '填写类型', type: 'select', value: x.ftype || 'text',
      options: Object.keys(FTYPE_T).map(function (k) { return { v: k, t: FTYPE_T[k] }; })
    },
    {
      k: 'options', label: '选项值', type: 'textarea', rows: 4,
      value: optList(x).join('\n'),
      ph: '一行一个，如：\n男\n女',
      hint: '只有单选 / 多选要填。国家地区不用列，走系统标准字典'
    },
    {
      k: 'src', label: '字段来源', type: 'select', value: x.src || 'ask',
      options: Object.keys(SRC_T).map(function (k) { return { v: k, t: SRC_T[k] }; })
    },
    {
      k: 'src_from', label: '数据来自', value: x.src_from,
      ph: '如：护照资料页 / 订单联系方式 / 客户本人确认'
    },
    {
      k: 'flags', label: '标记', type: 'checks',
      value: [].concat(x.required || isNew ? ['required'] : [],
        x.risk ? ['risk'] : [], x.dft_no ? ['dft_no'] : []),
      options: [{ v: 'required', t: '必填' },
        { v: 'risk', t: '高风险（填错会拒签）' },
        { v: 'dft_no', t: '系统默认代答「否」，不向客户提问' }]
    },
    { k: 'fill_note', label: '填报说明', type: 'textarea', rows: 4, value: x.fill_note }
  ]);
  return ask(isNew ? '新增字段' : '编辑字段 · ' + x.name, fields, '保存', function (v) {
    var has = function (k) { return (v.flags || []).indexOf(k) >= 0 ? 1 : 0; };
    var opts = (v.options || '').split('\n').map(function (s) { return s.trim(); })
      .filter(function (s) { return s; });
    return api('/ops/form/field/save', {
      id: x.id, formver_id: f.id, section: v.section, name: v.name,
      ftype: v.ftype, options: opts.length ? JSON.stringify(opts) : '',
      src: v.src, src_from: v.src_from,
      risk: has('risk'), required: has('required'), dft_no: has('dft_no'),
      fill_note: v.fill_note
    });
  }).then(function () { toast(isNew ? '已新增' : '已保存'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
}
