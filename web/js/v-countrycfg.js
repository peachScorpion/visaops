/* ============================================================
   UOM · 国家展示与办理流程配置
   唐美芳 2026-09-01：「除产品头图外 C 端仍按国家写死的还有——国家频道页大图、
   国旗图标、目的地卡片图，以及平台默认办理流程那 5 步…… 可以的，都统一放在运营配置里吧」。

   在此之前这些全是 v-cust.js 里的常量：新开一个国家、换一张头图、改一句流程措辞，
   都要改代码发版。现在运营在这里维护，C 端从 /pub/home 读，没配的国家仍回落到内置图。

   办理流程三级回落：产品自配（UBK 上品时填） → 该国默认（这一页） → 平台默认（这一页顶部）。
   ============================================================ */

VIEWS['ops:countrycfg'] = VIEWS['lead:countrycfg'] = function (m) {
  return api('/ops/countries').then(function (j) {
    var list = j.list || [];

    function imgCell(url, label) {
      return url
        ? '<div class="cc-img" style="background-image:url(' + esc(url) + ')" title="' +
          esc(url) + '"></div>'
        : '<div class="cc-img none">未配置<s>用内置图</s></div>';
    }
    function flowText(f, fallback) {
      var use = (f && f.length) ? f : fallback;
      return '<div class="cc-flow' + ((f && f.length) ? '' : ' fb') + '">' +
        use.map(function (x, i) {
          return '<i>' + (i + 1) + '. ' + esc(x.t) + '</i>';
        }).join('') +
        ((f && f.length) ? '' : '<em>未单独配置，执行平台默认</em>') + '</div>';
    }

    var head =
      '<div class="card"><div class="pad">' +
      '<div class="cc-dft"><div class="l"><b>平台默认办理流程</b>' +
      '<s>国家与产品都没有单独配置流程时，客户端展示这一套。' +
      '优先级：产品自配 › 国家默认 › 平台默认。</s></div>' +
      '<button class="btn p" data-dft>编辑平台默认流程</button></div>' +
      '<div class="cc-flow big">' + (j.default_flow || []).map(function (x, i) {
        return '<i>' + (i + 1) + '. ' + esc(x.t) +
          (x.d ? '<s>' + esc(x.d) + '</s>' : '') + '</i>';
      }).join('') + '</div></div></div>';

    var body = table(
      ['国家', '频道页大图', '目的地卡片图', '国旗', '国家页副标题',
       '该国默认办理流程', '在售产品', '状态', '操作'],
      list, function (r) {
        return '<td class="nw"><b>' + esc(r.country) + '</b></td>' +
          '<td>' + imgCell(r.hero_img) + '</td>' +
          '<td>' + imgCell(r.card_img) + '</td>' +
          '<td>' + (r.flag_img
            ? '<div class="cc-flag" style="background-image:url(' + esc(r.flag_img) + ')"></div>'
            : '<span class="hint">未配置</span>') + '</td>' +
          '<td>' + (r.intro ? esc(r.intro) : '<span class="hint">未填写</span>') + '</td>' +
          '<td style="min-width:190px">' + flowText(r.flow, j.default_flow) + '</td>' +
          '<td class="num">' + r.products + '</td>' +
          '<td>' + (r.active ? '<span class="tag ok">展示中</span>'
            : '<span class="tag plain">已停用</span>') + '</td>' +
          '<td class="cc-op"><div class="btns">' +
          '<button class="btn sm" data-ed="' + r.id + '">编辑</button>' +
          '<button class="btn sm g" data-tg="' + r.id + '">' +
          (r.active ? '停用' : '启用') + '</button>' +
          '<button class="btn sm g" data-rm="' + r.id + '">删除</button>' +
          '</div></td>';
      }, '还没有国家展示配置');

    m.innerHTML = pageH(menuName('countrycfg', '国家展示配置'),
      'C 端签证频道里跟「国家」绑定的展示素材与默认办理流程，都在这里维护。' +
      '<b>没有配置的国家不会开天窗</b>，客户端会回落到系统内置图；' +
      '配置后即时生效，无需发版。',
      '<button class="btn p" data-new>新建</button>') +
      (j.missing && j.missing.length
        ? '<div class="note w"><b>还有 ' + j.missing.length + ' 个在售国家没有展示配置</b>' +
          '<div class="hint">' + j.missing.map(esc).join('、') +
          '——客户端当前对这些国家使用系统内置图，建议补齐。</div></div>'
        : '') +
      head +
      '<div class="card"><div class="pad scrollx">' + body + '</div></div>';

    /* 流程编辑复用 UBK 上品那套行编辑器（flwRow / flwRead / flwBind），
       两处口径一致：最多 8 步、步骤名 20 字以内 */
    function flowModal(title, cur, tip, onSave) {
      var box = modal(title,
        '<div class="pad"><div class="hint" style="margin-bottom:10px">' + tip + '</div>' +
        '<div class="flw" id="w-flow">' +
        ((cur && cur.length ? cur : FLOW_DEFAULT).map(function (x, i) {
          return flwRow(i, x.t, x.d);
        }).join('')) + '</div>' +
        '<div class="flw-op"><button type="button" class="btn sm" data-flw-add>+ 添加步骤</button>' +
        '<button type="button" class="btn sm" data-flw-reset>恢复平台默认</button></div></div>',
        [{ t: '取消' },
         { t: '保存', cls: 'r', fn: function (mo, close) {
           var f = flwRead(mo);
           if (!f.length) { toast('至少保留一个步骤', true); return false; }
           return onSave(f).then(function () { toast('已保存'); close(); reload(); })
             .catch(function () { return false; });
         } }], true);
      flwBind(box.mask);
    }

    $('[data-dft]', m).onclick = function () {
      flowModal('编辑平台默认办理流程', j.default_flow,
        '所有国家与产品的兜底流程。修改后，未单独配置流程的国家与产品会立即改按这一套展示。',
        function (f) { return api('/ops/country/save', { is_default: 1, flow: f }); });
    };

    function form(r) {
      r = r || {};
      return [
        { k: 'country', label: '国家 / 目的地', value: r.country || '', required: !r.id,
          hint: r.id ? '已建立的配置不改国家名；如需改名请新建后删除旧配置'
            : '与产品目录里的国家名保持一致，如：美国、日本' },
        { type: 'html', html: '<div class="f"><span>频道页大图</span>' +
          imgField('cc-hero', r.hero_img || '',
            '国家频道页顶部大图，建议 1200×675（16:9）以内、5MB 以下') + '</div>' },
        { type: 'html', html: '<div class="f"><span>目的地卡片图</span>' +
          imgField('cc-card', r.card_img || '',
            '首页与列表里的方块卡片图。留空则沿用频道页大图') + '</div>' },
        { type: 'html', html: '<div class="f"><span>国旗图标</span>' +
          imgField('cc-flag', r.flag_img || '', '产品行前的小图标，建议 60×40 的 PNG') + '</div>' },
        { k: 'intro', label: '国家页副标题', value: r.intro || '',
          ph: '如：材料按人群自动裁剪，最快 7 个工作日出签',
          hint: '展示在国家频道页标题下方，一句话，60 字以内' }
      ];
    }
    function openForm(r) {
      var mo = ask(r ? '编辑国家展示配置 · ' + r.country : '新建国家展示配置',
        form(r), '保存', function (f) {
          return api('/ops/country/save', {
            country: r ? r.country : f.country, intro: f.intro,
            hero_img: imgRead(document, 'cc-hero'),
            card_img: imgRead(document, 'cc-card'),
            flag_img: imgRead(document, 'cc-flag'),
            active: r ? (r.active ? 1 : 0) : 1
          });
        });
      /* ask() 渲染完才有 DOM，下一帧再绑上传控件 */
      setTimeout(function () { imgBind(document); }, 0);
      return mo.then(function () { toast('已保存'); reload(); }).catch(function () { });
    }

    $('[data-new]', m).onclick = function () { openForm(null); };
    $$('[data-ed]', m).forEach(function (b) {
      b.onclick = function () {
        var r = list.filter(function (x) { return x.id === +b.dataset.ed; })[0];
        modal('编辑 · ' + r.country,
          '<div class="pad"><div class="cc-two">' +
          '<button class="btn" data-cc-base>改展示素材</button>' +
          '<button class="btn" data-cc-flow>改该国默认办理流程</button></div>' +
          '<div class="hint" style="margin-top:10px">展示素材＝频道页大图 / 卡片图 / 国旗 / 副标题；' +
          '办理流程留空则执行平台默认。</div></div>', [{ t: '关闭' }]);
        $('[data-cc-base]').onclick = function () {
          $$('.mask').forEach(function (x) { x.remove(); });
          openForm(r);
        };
        $('[data-cc-flow]').onclick = function () {
          $$('.mask').forEach(function (x) { x.remove(); });
          flowModal('该国默认办理流程 · ' + r.country, r.flow,
            '只对 ' + esc(r.country) + ' 的产品生效。供应商在 UBK 上品时单独配过流程的产品，仍以产品为准。',
            function (f) { return api('/ops/country/save', { country: r.country, flow: f }); });
        };
      };
    });
    $$('[data-tg]', m).forEach(function (b) {
      b.onclick = function () {
        var r = list.filter(function (x) { return x.id === +b.dataset.tg; })[0];
        api('/ops/country/save', { country: r.country, active: r.active ? 0 : 1 })
          .then(function () { toast(r.active ? '已停用' : '已启用'); reload(); }).catch(fail);
      };
    });
    $$('[data-rm]', m).forEach(function (b) {
      b.onclick = function () {
        var r = list.filter(function (x) { return x.id === +b.dataset.rm; })[0];
        confirmBox('删除「' + esc(r.country) + '」的展示配置',
          '删除后客户端对该国家<b>回落到系统内置图</b>，不影响产品与订单。', '确认删除')
          .then(function () { return api('/ops/country/del', { id: r.id }); })
          .then(function () { toast('已删除'); reload(); }).catch(function () { });
      };
    });
  });
};
