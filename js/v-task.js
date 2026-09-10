/* ================= DS-160 填表台（专员端 / 销售代填端）=================
   一张表，三个入口：客人自己填、销售代填、分享链接发给客人填。
   填的都是同一张 form_task，谁填到哪一格实时存，不会互相覆盖。
   这个文件管的是「登录态下的两个入口」——专员和销售；
   免登录的分享链接页是独立的 fill.html，不在这里。 */

var TSK_TONE = { wait: 'plain', filling: 'info', submitted: 'warn', confirmed: 'ok', official: 'ok' };
/* 官方是非题在 DS-160 上是单选，手机上下拉框难点，后台这边也统一给两个按钮式选项。
   靠字段名里的「是否 / 有没有」判断，判不准就退回普通文本框——宁可多给个输入框，
   也不要把一道开放题硬塞成是非题。 */
function isYesNo(name) {
  return /是否|有无/.test(name) && !/说明|详情|哪些|列出/.test(name);
}

function shareUrl(token) {
  var base = location.pathname.replace(/[^/]*$/, '');
  return location.origin + base + 'fill.html?token=' + encodeURIComponent(token);
}

function taskList(m, role) {
  return api('/task/list').then(function (j) {
    var list = j.list || [], SD = j.status_dict || {};
    var q = srchCard('tsk' + role, [
      {
        k: 'kw', t: '客户姓名 / 订单号', ph: '支持模糊查询',
        get: function (t) { return t.name + ' ' + t.ord_no; }
      },
      {
        k: 'filled_by', t: '由谁在填', type: 'sel',
        opts: Object.keys(j.filled_by_dict || {}).map(function (k) {
          return [k, j.filled_by_dict[k]];
        })
      },
      {
        k: 'shared', t: '分享链接', type: 'sel', opts: [['y', '已发出且有效'], ['n', '未发/已过期']],
        get: function (t) { return t.shared ? 'y' : 'n'; }
      },
      {
        k: 'riskdft', t: '高风险题', type: 'sel',
        opts: [['y', '还挂着系统默认'], ['n', '专员已核过']],
        get: function (t) { return t.stat.risk_default ? 'y' : 'n'; }
      }
    ]);
    var tb = subTabs('tsk' + role, [{ k: 'all', t: '全部', fn: function () { return true; } }].concat(
      Object.keys(SD).map(function (k) {
        return { k: k, t: SD[k], fn: function (t) { return t.status === k; } };
      })), q.filter(list));
    var so = sorter('tsk' + role, [
      ['完成度', function (t) { return t.stat.percent; }],
      ['客户必答剩余', function (t) { return t.stat.ask_left; }],
      ['高风险待核', function (t) { return t.stat.risk_default; }],
      ['提交时间', function (t) { return t.submit_at || ''; }]
    ]);
    var pg = pager('tsk' + role, so.sort(tb.rows), 10);
    var sum = function (f) { return list.reduce(function (a, t) { return a + f(t); }, 0); };

    m.innerHTML = pageH(role === 'csp' ? '客户填表 · 代填与提醒' : 'DS-160 填表台',
      role === 'csp'
        ? '本人名下客户的官方申请表汇总于此。可由销售代为填写，也可生成链接由客户自行填写——两者填写的是同一张表。'
        : '官方申请表的填写与复核。系统先把能带出的格子自动填上，客户只答剩下的必答题；' +
        '专员复核确认后，再到官方网站人工录入并回填 Application ID。',
      '') +
      kpiBand('tsk' + role, [
        { t: '在办表单', n: (j.stat || {}).total || 0, unit: '张' },
        { t: '待客户填写', n: ((j.stat || {}).wait || 0) + ((j.stat || {}).filling || 0), unit: '张', tab: 'filling' },
        { t: '已提交待复核', n: (j.stat || {}).submitted || 0, unit: '张', tone: 'warn', tab: 'submitted' },
        { t: '高风险题待专员核', n: sum(function (t) { return t.stat.risk_default; }), unit: '题', tone: 'bad', q: { riskdft: 'y' } },
        { t: '已在官网录入', n: (j.stat || {}).official || 0, unit: '张', tone: 'ok', tab: 'official' }
      ]) + q.html +
      '<div class="card">' + tb.html + '<div class="pad">' + table(
        so.cols(['客户', '订单号', '表单', '完成度', '客户必答剩余', '高风险待核',
          '还差 / 卡在谁', '由谁在填', '分享链接', '状态', '提交时间', '操作']),
        pg.rows, function (t) {
          var s = t.stat;
          return '<td><b>' + esc(t.name) + '</b><div class="hint">' + esc(t.progress_text) + '</div></td>' +
            '<td class="mono">' + esc(t.ord_no) + '</td>' +
            '<td class="mono">' + esc(t.form_code || '—') + '<div class="hint">' + esc(t.ver_no || '') + '</div></td>' +
            '<td class="num"><b>' + s.filled + '</b> / ' + s.fillable +
            '<div class="hint nw">' + s.percent + '%（系统带 ' + s.auto + '）</div></td>' +
            '<td class="num">' + (s.ask_left ? '<b>' + s.ask_left + '</b>' : '<span class="tag ok">已答完</span>') + '</td>' +
            /* 「还差」这一列答的是「这张表此刻卡在谁手里」：
               客户必答的还没答＝等客人；系统带不出来的空着＝等专员补。
               原来只显示总进度，专员得点进去逐格找才知道卡在哪
               （唐美芳 2026-09-01：「流程走不通」）。 */
            '<td class="nw">' + ((t.miss && t.miss.total)
              ? '<b class="bad">还差 ' + t.miss.total + ' 格</b>' +
                '<div class="hint">' +
                (t.miss.ask ? '客户待答 ' + t.miss.ask + '　' : '') +
                (t.miss.agent ? '需专员补 ' + t.miss.agent : '') + '</div>' +
                (t.miss.names.length
                  ? '<div class="hint">' + t.miss.names.map(function (x) {
                      return esc(x.slice(0, 10));
                    }).join('、') + '…</div>' : '')
              : '<span class="tag ok">必填已齐</span>') + '</td>' +
            '<td class="num">' + (s.risk_default ? '<span class="tag bad">' + s.risk_default + '</span>' : '<span class="tag ok">已核</span>') + '</td>' +
            '<td>' + esc(t.filled_by_text || '—') + '</td>' +
            '<td>' + (t.shared ? '<span class="tag info">有效至 ' + d10(t.share_expire) + '</span>'
              : '<span class="hint">未发出</span>') + '</td>' +
            '<td><span class="tag ' + (TSK_TONE[t.status] || 'plain') + '">' + esc(t.status_text) + '</span>' +
            (t.official_app_id ? '<div class="hint mono">' + esc(t.official_app_id) + '</div>' : '') + '</td>' +
            '<td>' + (t.submit_at ? '<span class="mono">' + d16(t.submit_at) + '</span>' : '<span class="hint">—</span>') + '</td>' +
            '<td><div class="btns"><button class="btn sm p" data-t="' + t.task_id + '">打开表单</button>' +
            '<button class="btn sm" data-sh="' + t.task_id + '">分享链接</button></div></td>';
        }, '没有符合条件的表单') + '</div>' + pg.html + '</div>';

    q.bind(m, function () { S.cache['pg:tsk' + role] = 1; reload(); });
    tb.bind(m, function () { S.cache['pg:tsk' + role] = 1; reload(); });
    so.bind(m, function () { S.cache['pg:tsk' + role] = 1; reload(); });
    pg.bind(m, reload);
    kpiBand('tsk' + role, null, m, function () { S.cache['pg:tsk' + role] = 1; reload(); });
    $$('[data-t]', m).forEach(function (b) { b.onclick = function () { go('tasks', b.dataset.t); }; });
    $$('[data-sh]', m).forEach(function (b) { b.onclick = function () { shareBox(+b.dataset.sh); }; });
  });
}

function shareBox(id) {
  return api('/task/share', { id: id }).then(function (r) {
    var u = shareUrl(r.token);
    modal('将申请表发送至客户本人填写',
      '<div class="note">链接有效期到 <b>' + d16(r.expire) + '</b>，过期后客户无法打开，需重新生成。<br>' +
      '客户打开无需登录或注册，仅可见本人对应的申请表——链接里不含订单金额，也看不到同行其他人的证件信息。<br>' +
      '<b>建议：拒签史、健康与犯罪记录、兵役这几道高风险题由客户本人作答。</b>填错的后果是拒签，' +
      '个别项将按虚假陈述处理并留下永久记录，由销售代答等于将该责任转移至我方。</div><br>' +
      '<label class="f"><span>分享链接</span>' +
      '<input value="' + esc(u) + '" readonly onclick="this.select()"></label>' +
      '<div class="hint">点击自动全选，复制后通过微信或短信发送至客户</div>',
      [{ t: '复制链接', cls: 'p', fn: function (mk) {
        var i = $('input', mk); i.select();
        try { document.execCommand('copy'); toast('已复制，请发送给客户'); }
        catch (e) { toast('复制失败，请手动选中复制', true); }
        return false;
      } }, { t: '关闭' }], true);
  }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
}

function taskDetail(m, id, role) {
  return api('/task/get?id=' + id).then(function (d) {
    var s = d.stat, fv = d.formver || {}, ro = d.status === 'confirmed' || d.status === 'official';
    var canConfirm = role === 'uom';

    var secHtml = (d.sections || []).map(function (sec) {
      var items = sec.items.filter(function (i) { return i.src !== 'agent'; });
      if (!items.length) return '';
      return card(esc(sec.name) + ' <span>' + sec.filled + ' / ' + sec.fillable + ' 已填' +
        (sec.ask_left ? ' · 客户还需答 ' + sec.ask_left + ' 题' : '') + '</span>',
        '<div class="pad">' + items.map(function (i) {
          var v = i.value || '';
          /* 控件按字段真实类型给，不再一律文本框
             （唐美芳 2026-09-03：「填写字段的表单类型与填写说明对不上，
             有的是单选项，有的是上传图片，现在统一都是文本框」）。
             类型来自模板 form_field.ftype / options，后端 sections 已下发。 */
          var ph = i.src === 'ask' ? '需客户本人回答' : '系统未能带出，请人工确认';
          function sel(opts, blank) {
            return '<select data-fid="' + i.field_id + '"' + (ro ? ' disabled' : '') + '>' +
              [''].concat(opts).map(function (o) {
                return '<option value="' + esc(o) + '"' + (v === o ? ' selected' : '') + '>' +
                  (o || blank) + '</option>';
              }).join('') + '</select>';
          }
          var input;
          if (i.options && i.options.length) {
            input = sel(i.options, '未选择');
          } else if (i.ftype === 'bool' || isYesNo(i.name)) {
            input = sel(['是', '否'], '未答');
          } else if (i.ftype === 'date') {
            input = '<input type="date" data-fid="' + i.field_id + '" value="' + esc(v) + '"' +
              (ro ? ' disabled' : '') + '>';
          } else if (i.ftype === 'file') {
            /* 照片这类：真正的文件在「材料」里收，这一格只记「收到没有」，
               所以给一个跳转，不给假的上传框 */
            input = '<div class="fld-file">' + (v
              ? '<span class="tag ok">已收</span> <span class="hint">' + esc(v) + '</span>'
              : '<span class="tag plain">未收</span> <span class="hint">在材料清单里上传</span>') +
              '</div>';
          } else if (i.ftype === 'group' || (i.fill_note || '').length > 60) {
            input = '<textarea data-fid="' + i.field_id + '" rows="2"' +
              (ro ? ' disabled' : '') + ' placeholder="' + ph + '">' + esc(v) + '</textarea>';
          } else {
            input = '<input data-fid="' + i.field_id + '" value="' + esc(v) + '"' +
              (ro ? ' disabled' : '') + ' placeholder="' + ph + '">';
          }
          return '<div class="fld' + (i.risk ? ' risk' : '') + '">' +
            '<div class="fk"><b>' + esc(i.name) + '</b>' +
            (i.risk ? ' <span class="tag bad">高风险</span>' : '') +
            (i.required ? '' : ' <span class="tag plain">选填</span>') +
            '<div class="hint">' + esc(i.src_text) +
            (i.src_from ? ' · ' + esc(i.src_from) : '') +
            (i.value_src === 'auto' ? ' · <b>系统带出</b>' : '') +
            (i.value_src === 'default'
              ? ' · <b class="warnbox">系统默认「否」，未与客户核对</b>' : '') +
            (i.by && i.value_src === 'manual' ? ' · ' + esc(i.by) + ' 填于 ' + d16(i.updated_at) : '') +
            '</div></div>' +
            /* 填报说明直接摊开显示，不再藏在链接后面——填的人一边看说明一边填，
               点开弹窗再关掉是多余的一步（唐美芳 2026-09-03：「能不能把填写说明
               直接放出来展示」）。官方 Help 原文和特别提示仍收在「更多」里，那些很长。 */
            '<div class="fv">' + input +
            (i.fill_note ? '<div class="fld-note">' + esc(i.fill_note) + '</div>' : '') +
            (i.hist && !v
              ? '<div class="fld-hist">上次填的：<b>' + esc(i.hist) + '</b>' +
                (ro ? '' : ' <a data-hist="' + i.field_id + '">用这个</a>') + '</div>'
              : '') +
            (i.help_text || i.notice
              ? '<a class="ht-t" data-fn="' + i.field_id + '">官方帮助与提示 ›</a>' : '') +
            '</div></div>';
        }).join('') + '</div>');
    }).join('');

    m.innerHTML = pageH(d.name + ' · ' + (fv.form_code || '官方申请表'),
      '订单 ' + esc(d.ord_no) + ' · ' + esc(fv.name || '') + ' ' + esc(fv.ver_no || '') +
      ' · <span class="tag ' + (TSK_TONE[d.status] || 'plain') + '">' + esc(d.status_text) + '</span>' +
      (d.official_app_id ? ' · Application ID <b class="mono">' + esc(d.official_app_id) + '</b>' : ''),
      '<button class="btn" data-back>返回工单台</button> ' +
      (ro ? '' : '<button class="btn" data-pre>系统预填</button> ' +
        '<button class="btn" data-sh>发送至客户填写</button> ' +
        '<button class="btn p" data-save>保存已改内容</button> ') +
      (canConfirm && d.status === 'submitted' ? '<button class="btn p" data-cf>复核确认</button> ' : '') +
      /* 对照单：专员一边开 CEAC 官网一边照着抄。这一遍录入省不掉（官方无接口、
         不授权程序化提交），能省的是「抄的时候到处找信息」那段时间
         （唐美芳 2026-09-02 追问「会不会根本没节省人工」后加的）。 */
      (canConfirm ? '<button class="btn" data-ceac>官网填表对照单</button> ' : '') +
      (canConfirm && d.status === 'confirmed' ? '<button class="btn p" data-off>回填官网受理号</button> ' : '')) +
      kpiBand('tskd', [
        { t: '需填格数', n: s.fillable, unit: '格', sub: '另有 ' + s.agent_only + ' 格是专员在官网现做' },
        { t: '系统已带出', n: s.auto, unit: '格', tone: 'ok', sub: '无需客户填写' },
        { t: '客户必答剩余', n: s.ask_left, unit: '题', tone: s.ask_left ? 'warn' : 'ok', sub: '共 ' + s.ask_total + ' 题' },
        { t: '高风险题待专员核', n: s.risk_default, unit: '题', tone: s.risk_default ? 'bad' : 'ok', sub: '共 ' + s.risk_total + ' 题·系统默认「否」' },
        { t: '完成度', n: s.percent, unit: '%', tone: s.percent >= 100 ? 'ok' : '' }
      ]) +
      ((d.missing || []).length
        ? '<div class="note b"><b>还有 ' + d.missing.length + ' 格必填没完成，专员不能确认：</b>' +
        d.missing.slice(0, 12).map(function (x) {
          return esc(x.name) + '（' + esc(x.src_text) + (x.risk ? ' · 高风险' : '') + '）';
        }).join('、') + (d.missing.length > 12 ? ' 等' : '') + '</div>'
        : '<div class="note"><b>必填项已齐。</b>专员复核确认后，到官方网站人工录入并回填 Application ID。</div>') +
      secHtml +
      card('专员在官方网站上现做的动作 <span>系统里没有对应的格子，不计入完成度</span>',
        '<div class="pad"><ol class="steplist">' + (d.agent_steps || []).map(function (x) {
          return '<li>' + esc(x) + '</li>';
        }).join('') + '</ol>' +
        '<div class="hint">官方签证网站没有公开接口、也不授权程序代填，' +
        '这几步只能由专员登录官网人工完成' +
        (d.official_url ? '：<a href="' + esc(d.official_url) + '" target="_blank">打开官方填报入口</a>' : '') +
        '</div></div>');

    /* 填表中心 2026-09-01 起不再单独占菜单（跟工单台是同一批数据的两个视角，
       两个入口会让专员不知道该点哪个）。这一页现在只从工单详情进来，
       返回自然要回工单台。 */
    var ceacBtn = $('[data-ceac]', m);
    if (ceacBtn) ceacBtn.onclick = function () { go('ceac', d.task_id); };
    $('[data-back]', m).onclick = function () {
      go(d.wo_no ? 'board' : 'tasks', d.wo_no || '');
    };
    kpiBand('tskd', null, m, function () { });

    /* 逐格保存：只回传改过的格子。整表覆盖会把客人刚在手机上填的板块洗掉——
       这张表同一时刻可能有销售和客人两个人在填。 */
    var orig = {};
    $$('[data-fid]', m).forEach(function (el) { orig[el.dataset.fid] = el.value; });
    function dirty() {
      return $$('[data-fid]', m).filter(function (el) {
        return el.value !== orig[el.dataset.fid];
      }).map(function (el) { return { field_id: +el.dataset.fid, value: el.value }; });
    }
    if (!ro) {
      $('[data-save]', m).onclick = function () {
        var items = dirty();
        /* 说清楚是「没检测到改动」而不是「点了没反应」——
           这一页 68 格，改没改自己都未必记得（唐美芳 2026-09-03 报过
           「保存已改内容时，点击没有反应」）。 */
        if (!items.length) return toast('没有检测到改动，无需保存');
        api('/task/answer/save', { id: id, answers: items })
          .then(function (r) {
            toast('已保存 ' + (r.saved != null ? r.saved : items.length) + ' 格');
            reload();
          })
          .catch(function () { /* 出错时 api() 已弹提示 */ });
      };
      $('[data-pre]', m).onclick = function () {
        confirmBox('系统预填',
          '把护照信息、订单信息里已有的数据自动带进对应格子。<br>' +
          '<b>仅填写可核实的字段，无法核实的一律留空</b>——遗漏可事后补填，填报不实则构成虚假陈述。<br>' +
          '已经人工改过的格子不会被覆盖。', '开始预填')
          .then(function () { return api('/task/prefill', { id: id }); })
          .then(function (r) {
            toast('自动带出 ' + r.filled + ' 格，' + r.gap + ' 格无数据源需人工填');
            reload();
          }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
      $('[data-sh]', m).onclick = function () { shareBox(id); };
    }
    if ($('[data-cf]', m)) {
      $('[data-cf]', m).onclick = function () {
        /* 高风险题是系统默认「否」填上去的，客人从没见过这些题。
           复核是唯一的人工关口，所以这里把默认清单摊开让专员逐条看，
           勾选即签字——真出事时，流水上留的是专员的名字。 */
        var dft = [];
        (d.sections || []).forEach(function (sec) {
          sec.items.forEach(function (i) {
            if (i.risk && i.value_src === 'default') dft.push(i);
          });
        });
        ask('复核确认', [
          {
            type: 'html', html: '<div class="note">确认后这张表锁定，客户和销售都不能再改。' +
              '后续由专员登录官方网站人工录入，录入完成后回填 Application ID。</div>' +
              (dft.length
                ? '<div class="note b"><b>以下 ' + dft.length + ' 道高风险题由系统默认填「否」，' +
                '客户未被问及。</b>请逐条核对，任何一条实际为「是」都要先回到表单改过来——' +
                '这几题答错属虚假陈述，后果是永久不可入境记录。' +
                '<ol class="steplist">' + dft.map(function (i) {
                  return '<li>' + esc(i.name) + '</li>';
                }).join('') + '</ol></div>'
                : '')
          }
        ].concat(dft.length ? [{
          k: 'ack', type: 'checks', label: '高风险题核对',
          options: [{ v: 'y', t: '我已逐条核对上述高风险题，确认按「否」提交无误' }], required: true
        }] : []), '确认无误')
          .then(function () {
            return api('/task/confirm', { id: id, risk_ack: dft.length ? 1 : 0 });
          })
          .then(function (r) { toast(r.msg); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    }
    if ($('[data-off]', m)) {
      $('[data-off]', m).onclick = function () {
        ask('回填官网录入结果', [
          {
            type: 'html', html: '<div class="note">在官方网站录入并生成确认页后，' +
              '把 Application ID 和条形码号填回来。回填后办签人自动推进到「待预约面签」。</div><br>'
          },
          { k: 'app_id', label: 'DS-160 Application ID', required: true, ph: 'AA00ABCDEF' },
          { k: 'barcode', label: '条形码号', ph: '确认页右上角' }
        ], '回填', function (v) {
          return api('/task/official', { id: id, app_id: v.app_id, barcode: v.barcode });
        }).then(function () { toast('已回填，办签人推进到待预约面签'); reload(); }).catch(function () { /* 出错时 api() 已弹提示；这里只是不让 Promise 变成未捕获异常 */ });
      };
    }
    /* 官方 Help 动辄几百字，铺在表单里没法填，点开看 */
    var byId = {};
    (d.sections || []).forEach(function (sec) {
      sec.items.forEach(function (i) { byId[i.field_id] = i; });
    });
    /* 「用这个」：把上次填的值填进输入框，不自动保存——
       专员/客人看一眼确认没变才点保存，地址、单位这类是会变的。 */
    $$('[data-hist]', m).forEach(function (b) {
      b.onclick = function () {
        var el = $('[data-fid="' + b.dataset.hist + '"]', m);
        if (!el) return;
        var txt = b.parentNode.querySelector('b');
        el.value = txt ? txt.textContent : '';
        el.dispatchEvent(new Event('change', { bubbles: true }));
        toast('已填入，确认无误后点「保存已改内容」');
      };
    });
    $$('[data-fn]', m).forEach(function (b) {
      b.onclick = function () {
        var i = byId[b.dataset.fn], sec = function (t, v, cls) {
          return v ? '<h4 style="margin:12px 0 4px">' + t + '</h4><div' +
            (cls ? ' class="' + cls + '"' : '') +
            ' style="line-height:1.8;white-space:pre-wrap">' + esc(v) + '</div>' : '';
        };
        modal(i.name,
          '<div class="note">' + esc(i.src_text) + (i.src_from ? '：' + esc(i.src_from) : '') +
          (i.risk ? ' · <b>高风险，填错会拒签，务必客户本人确认</b>' : '') + '</div>' +
          sec('填报说明及要求', i.fill_note) +
          sec('官方 Help 帮助提示', i.help_text) +
          sec('官方重要提醒', i.notice, 'warnbox'), null, true);
      };
    });
  });
}

VIEWS['uom:tasks'] = function (m, id) {
  return id ? taskDetail(m, id, 'uom') : taskList(m, 'uom');
};
VIEWS['lead:tasks'] = VIEWS['uom:tasks'];
VIEWS['csp:tasks'] = function (m, id) {
  return id ? taskDetail(m, id, 'csp') : taskList(m, 'csp');
};
