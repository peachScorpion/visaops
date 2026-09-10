/* ============================================================
   官网填表对照单 —— 专员照着它往 CEAC 官网抄

   唐美芳 2026-09-02 追问「会不会根本没节省人工」。核对下来她的担心成立：
   DS-160 那 68 格在系统里填好之后，**还得在官方网站再录一遍**，
   这一遍是纯增量。官方无公开 API、不授权程序化提交，这一遍省不掉。

   所以这一页解决的是「抄的时候找信息很慢」这一段：
     · 分段顺序＝ CEAC 官网的页面顺序（form_field.section 本来就是按官网分的 21 段），
       官网翻到哪一页，这里就看哪一段，不用在系统里到处翻；
     · 每格一行、值可一键复制，不必手打；
     · 专员要在官网现做的 4 格（密保问题、支付实体、审查、打印确认页）单独列出来，
       不混在要抄的格子里；
     · 支持打印/另存 PDF，双屏或纸质对照都行。

   真正把录入压到接近零要靠浏览器插件自动填充（她 2026-09-02 定为二期，
   等她通知再做）。这一页是在那之前立刻能用的东西，也是插件的数据底稿。
   ============================================================ */

VIEWS['uom:ceac'] = function (m, tid) {
  if (!tid) return go('board');
  return api('/task/get?id=' + encodeURIComponent(tid)).then(function (d) {
    /* 只列要往官网抄的格子。agent 那几格系统里没有值，单独成块。 */
    var secs = (d.sections || []).map(function (s) {
      return { name: s.name, items: (s.items || []).filter(function (i) {
        return i.src !== 'agent';
      }) };
    }).filter(function (s) { return s.items.length; });

    /* 已确认 / 已提交官网的表不能就地改：已确认的要先撤回（复核关口不能绕过），
       已提交官网的改了也不会同步到 CEAC，两边反而对不上。
       这一条不是把「二次修改」关掉，而是把它变成「先撤回、再改、再确认」，每步留痕。 */
    var st = d.status || (d.stat && d.stat.status) || '';
    var locked = st === 'confirmed' || st === 'official';

    var total = secs.reduce(function (a, s) { return a + s.items.length; }, 0);
    var filled = secs.reduce(function (a, s) {
      return a + s.items.filter(function (i) { return i.value; }).length;
    }, 0);

    /* 空格子分三类标注，专员一眼知道该去做什么，而不是笼统一句「未带出」：
         · 客户必答（ask）没答  → 去催客人，或用分享链接让他补
         · 系统本来就没有数据源 → 只能在官网现场填（出生城市、在美住址这类
           DS-160 特有、我们订单里根本不采集的信息）
         · 有数据源但源值为空   → 回订单里把那一项补上，比在官网瞎填强 */
    /* 每一格的值是<b>谁填的</b>，专员抄之前必须一眼看清
       （唐美芳 2026-09-03：「要填的值这一列，应该区分标识出待客人填、
       客人已填的、系统自动填的」）：
         客人已填 —— 客人本人在分享链接里答的，最可信；
         专员已填 —— 我们代填的，抄之前最好再跟客人核一句；
         系统带出 —— 从护照 / 订单里映射出来的；
         系统默认 —— 我们替客人默认成「否 / 无」的，**送签前必须跟客人确认**；
         待客人填 / 待补齐 / 官网现填 —— 还没有值的三种原因。 */
    function origin(i) {
      var v = i.value || '';
      if (!v) {
        return i.src === 'ask'
          ? { k: 'ask', t: '待客人填', tip: '发分享链接让他补' }
          : (i.mapped
            ? { k: 'src', t: '待补齐', tip: '回「' + (i.src_from || '订单资料') + '」里补' }
            : { k: 'own', t: '官网现填', tip: '系统无此项，只能在官网现场填' });
      }
      if (i.value_src === 'manual') {
        return /客户|客人/.test(i.by || '')
          ? { k: 'cust', t: '客人已填', tip: '客人本人填写' }
          : { k: 'staff', t: '专员已填', tip: '由 ' + (i.by || '专员') + ' 代填' };
      }
      if (i.value_src === 'default') {
        return { k: 'dft', t: '系统默认', tip: '系统替客人默认，送签前须与客人核对' };
      }
      return { k: 'auto', t: '系统带出', tip: '来自' + (i.src_from || '证件 / 订单资料') };
    }

    function row(i, n) {
      var v = i.value || '';
      var o = origin(i);
      return '<tr' + (v ? '' : ' class="na ' + o.k + '"') + ' data-fid="' + i.field_id + '">' +
        '<td class="n">' + n + '</td>' +
        '<td class="f"><b>' + esc(i.name) + '</b>' +
        (i.fill_note ? '<s>' + esc(i.fill_note) + '</s>' : '') + '</td>' +
        '<td class="v">' +
        '<span class="ce-src ' + o.k + '" title="' + esc(o.tip) + '">' + esc(o.t) + '</span>' +
        /* 要往官网抄的是<b>英文</b>。需要英文的格子优先摆英文、中文原文放下面小字对照；
           还没译的标出来（唐美芳 2026-09-03：「填写完所有资料后，还得翻译成英文」）。 */
        (v
          ? (i.need_en
            ? (i.value_en
              ? '<code data-val>' + esc(i.value_en) + '</code>' +
                '<s class="ce-cn">中文原文：' + esc(v) + '</s>'
              : '<em class="noen">未译成英文 · 官网只收英文</em>' +
                '<s class="ce-cn">中文原文：' + esc(v) + '</s>')
            : '<code data-val>' + esc(v) + '</code>')
          : '<em class="' + o.k + '">' + esc(o.tip) + '</em>') + '</td>' +
        '<td class="c"><div class="btns">' +
        (v && (!i.need_en || i.value_en)
          ? '<button class="btn sm" data-cp="' +
            esc(i.need_en ? i.value_en : v) + '">复制</button>' : '') +
        /* 任何一格都能就地改：抄之前发现拼错、客人临时更正、
           系统默认的要按实际改成「是」——不该逼专员回填表页再找一遍
           （唐美芳：「且允许二次修改调整」）。 */
        (locked ? ''
          : (i.need_en && v
            ? '<button class="btn sm" data-eden="' + i.field_id + '">改英文</button>'
            : '') +
            '<button class="btn sm" data-ed="' + i.field_id + '">' +
            (v ? (i.need_en ? '改中文' : '修改') : '填写') + '</button>') +
        '</div></td></tr>';
    }

    var n = 0;
    var body = secs.map(function (s) {
      return '<section class="ce-sec"><h3>' + esc(s.name) +
        '<span>' + s.items.length + ' 格</span></h3>' +
        '<table class="ce-tb"><thead><tr><th>#</th><th>官网字段</th>' +
        '<th>要填的值</th><th></th></tr></thead><tbody>' +
        s.items.map(function (i) { n++; return row(i, n); }).join('') +
        '</tbody></table></section>';
    }).join('');

    m.innerHTML = pageH('官网填表对照单 · ' + esc(d.name || ''),
      'DS-160 必须由专员在 <b>CEAC 官网</b>人工填写提交，官方没有公开接口、也不授权程序化提交，' +
      '该环节无法省略。本页用于<b>提高逐项抄录的检索效率</b>：' +
      '以下分段顺序与官网页面顺序一致，官网翻至哪一页即对照哪一段，字段值支持一键复制。' +
      '<b>建议使用双屏或左右分窗</b>，一侧为官网、一侧为本页。',
      '<div class="btns">' +
      '<button class="btn" data-back>← 返回填表页</button>' +
      (d.official_url
        ? '<a class="btn" href="' + esc(d.official_url) + '" target="_blank" rel="noopener">打开 CEAC 官网 ↗</a>'
        : '') +
      (st === 'confirmed'
        ? '<button class="btn" data-unlock>撤回确认以修改</button>' : '') +
      '<button class="btn p" data-print>打印 / 存 PDF</button></div>') +

      (locked
        ? '<div class="note ' + (st === 'official' ? '' : 'w') + '">' +
          (st === 'official'
            ? '本表<b>已提交至官网</b>并回填受理号，页面数值仅作抄录留存，不可再修改。' +
              '如官网信息有误，请在官网更正后同步修改本页。'
            : '本表<b>已复核确认</b>，字段暂时锁定——复核环节由专员对高风险题签署确认，' +
              '直接改会绕过这道关口。要改点右上角<b>「撤回确认以修改」</b>，' +
              '改完重新确认一次，全程留痕。') + '</div>'
        : '') +

      '<div class="ce-hd">' +
      '<div><s>办签人</s><b>' + esc(d.name || '') + '</b></div>' +
      '<div><s>订单</s><b class="mono">' + esc(d.ord_no || '') + '</b></div>' +
      '<div><s>表单</s><b>' + esc(d.form_code || d.formver && d.formver.form_code || '官方申请表') +
      '　' + esc(d.ver_no || '') + '</b></div>' +
      '<div><s>官网受理号</s><b class="mono">' + esc(d.official_app_id || '尚未提交') + '</b></div>' +
      '<div><s>可抄格数</s><b>' + filled + ' / ' + total + '</b></div>' +
      '</div>' +

      (filled < total
        ? (function () {
            var na = [];
            secs.forEach(function (s2) {
              s2.items.forEach(function (i) {
                if (!i.value) na.push(i.src === 'ask' ? 'ask' : (i.mapped ? 'src' : 'own'));
              });
            });
            var cnt = function (k) { return na.filter(function (x) { return x === k; }).length; };
            return '<div class="note w"><b>有 ' + (total - filled) + ' 格系统没带出来</b>，' +
              '下面按原因分了三色：' +
              (cnt('ask') ? '<em class="ask">客人未答 ' + cnt('ask') + ' 格</em>（发分享链接让他补）　' : '') +
              (cnt('src') ? '<em class="src">源为空 ' + cnt('src') + ' 格</em>（回订单/资料里补齐）　' : '') +
              (cnt('own') ? '<em class="own">系统无此项 ' + cnt('own') + ' 格</em>（只能在官网现场填）' : '') +
              '</div>';
          })()
        : '') +

      body +

      ((d.agent_steps || []).length
        ? '<section class="ce-sec ce-agent"><h3>只能在官网现做的动作' +
          '<span>' + d.agent_steps.length + ' 项</span></h3>' +
          '<ol>' + d.agent_steps.map(function (x) {
            return '<li>' + esc(x) + '</li>';
          }).join('') + '</ol>' +
          '<p>以下事项系统内无对应字段：密保问题须由专员在官网现场设定并自行留存，' +
          '支付实体、最终审查、打印确认页均在官网完成。' +
          '<b>提交成功后请将确认页上的受理号回填至工单</b>，进度方可推进至「待预约」。</p></section>'
        : '');

    /* 就地改一格：弹出这一格的填写框，存完只重绘本页，不跳走。
       ftype 决定用什么控件——select 给下拉、bool 给是/否，
       避免又出现「婚姻状况 = 否」那种官网下拉里根本没有的值
       （2026-09-03 已在后端加了按类型校验，这里前端也按类型给控件）。 */
    var byId = {};
    (d.sections || []).forEach(function (s2) {
      (s2.items || []).forEach(function (i) { byId[i.field_id] = i; });
    });
    $$('[data-ed]', m).forEach(function (b) {
      b.onclick = function () {
        var i = byId[+b.dataset.ed];
        if (!i) return;
        var f = { k: 'v', label: i.name, value: i.value || '' };
        if (i.options && i.options.length) {
          f.type = 'select';
          f.options = [{ v: '', t: '（留空）' }].concat(i.options.map(function (o) {
            return { v: o, t: o };
          }));
        } else if (i.ftype === 'bool') {
          f.type = 'select';
          f.options = [{ v: '', t: '（留空）' }, { v: '是', t: '是' }, { v: '否', t: '否' }];
        } else if ((i.fill_note || '').length > 40 || i.ftype === 'group') {
          f.type = 'textarea';
        }
        ask('填写 · ' + i.name, [
          { type: 'html', html: '<div class="note">' +
            (i.fill_note ? esc(i.fill_note) + '<br>' : '') +
            '官网这一格的填法以 CEAC 页面为准；改完这里，填表页与客人端看到的是同一个值。' +
            '</div><br>' },
          f
        ], '保存', function (r2) {
          return api('/task/answer/save', { id: tid,
            answers: [{ field_id: i.field_id, value: r2.v }] });
        }).then(function () { toast('已保存'); reload(); }).catch(function () { });
      };
    });
    /* 改英文：机器翻的是草稿，专员核对时改哪格存哪格 */
    $$('[data-eden]', m).forEach(function (b) {
      b.onclick = function () {
        var i = byId[+b.dataset.eden];
        if (!i) return;
        ask('核对英文 · ' + i.name, [
          { type: 'html', html: '<div class="note">中文原文：<b>' + esc(i.value) + '</b><br>' +
            '官网仅接受英文，录入 CEAC 的即为下面这一行。地址、单位名称一词之差即可能被使领馆问询，' +
            '机器翻译结果请务必逐项复核。</div><br>' },
          { k: 'en', label: '英文', value: i.value_en || '',
            type: (i.value_en || '').length > 40 ? 'textarea' : 'text' }
        ], '保存', function (r2) {
          return api('/task/en/save', { id: tid, field_id: i.field_id, value_en: r2.en });
        }).then(function () { toast('已保存'); reload(); }).catch(function () { });
      };
    });
    var ub = $('[data-unlock]', m);
    if (ub) ub.onclick = function () {
      confirmBox('撤回表单确认',
        '撤回后本表退回「填写中」，可以继续修改格子。' +
        '<b>改完记得重新确认一次</b>——确认时会再走一遍必填校验与高风险题复核。',
        '撤回确认')
        .then(function () { return api('/task/unconfirm', { id: tid }); })
        .then(function (r) { toast(r.msg || '已撤回'); reload(); })
        .catch(function () { });
    };
    $('[data-back]', m).onclick = function () { go('tasks', tid); };
    $('[data-print]', m).onclick = function () { window.print(); };
    $$('[data-cp]', m).forEach(function (b) {
      b.onclick = function () {
        doCopy(b.dataset.cp);
        b.textContent = '已复制';
        setTimeout(function () { b.textContent = '复制'; }, 1200);
      };
    });
  });
};
