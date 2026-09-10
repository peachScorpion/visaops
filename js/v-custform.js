/* ============================================================
   C 端 · 填申请表（H5）
   唐美芳 2026-08-31：「我刚才看了下C端的填写页面，我感觉是不是得有1个完整的填写，
   我发你一个html原型文件，你看看，是否可以参考」——附「闪签原型（填表工具-日本、泰国）」。

   查下来 C 端小程序里**根本没有填申请表这一页**：客户只能交材料、看进度，
   要填 DS-160 只能等销售生成一条分享链接发过来。自己下单的客户在小程序里
   压根找不到入口，这就是她说的「得有 1 个完整的填写」。

   结构照原型《填申请表》：
     板块列表（基本信息 / 证件信息 / …，每块右侧显示填写状态）
       → 点进板块填这一块的格子 → 保存
     右上角暂存、底部「提交信息」+ 二次确认、未填完给标红提示。
   视觉沿用本小程序现有语言（.h5-sec / .h5-h / .h5-row），不照抄原型那套灰底线框。
   ============================================================ */

/* 这一页三端共用：客户自己填、销售代填走的是同一张表、同一批接口。
   外壳按角色切——有米是橙色的销售端壳，客户端还是原来那套
   （唐美芳 2026-09-01：「也可以帮客人填」）。 */
function cfPage(title, body, foot, tipT, tipH, back) {
  return (S.role === 'youmi' && typeof ymPage === 'function')
    ? ymPage(title, body, foot, tipT, tipH, back, '', '', 'ym')
    : h5page(title, body, foot, tipT, tipH, back);
}

/* 当前展开的板块下标，null = 停在板块列表 */
function cfOpen(v) {
  if (v === undefined) return S.cache.cfSec == null ? null : S.cache.cfSec;
  S.cache.cfSec = v;
}

/* 一格的输入控件。是非题给两个按钮，其余按 ftype 给控件——
   跟免登录分享页 fill.js 的判断口径一致，客人两边看到的是同一张表。 */
var CF_SRC = { ocr: '证件识别', sys: '订单带出', agent: '专员官网操作' };
function cfField(f) {
  var v = f.value || '';
  var yn = f.ftype === 'bool' || /^是否|吗？?$/.test(f.name);
  var s = '<div class="cf-q' + (f.risk ? ' risk' : '') + '" data-fid="' + f.field_id + '">' +
    '<div class="cf-nm">' + esc(f.name) +
    (f.risk ? '<em class="rk">重要</em>' : '') +
    (v ? '<em class="dn">已填</em>' : (f.required ? '<em class="rq">必填</em>' : '')) +
    /* 销售代填时会看到系统带出的字段，标明来源，改之前知道自己在覆盖什么 */
    (CF_SRC[f.src] ? '<em class="sr">' + CF_SRC[f.src] + '</em>' : '') + '</div>' +
    (f.fill_note ? '<div class="cf-note">' + esc(f.fill_note) + '</div>' : '') +
    (f.notice ? '<div class="cf-must">' + esc(f.notice) + '</div>' : '');
  if (yn) {
    var pick = v.indexOf('是') === 0 ? '是' : (v ? '否' : '');
    var ex = v.indexOf('：') > 0 ? v.split('：').slice(1).join('：') : '';
    s += '<div class="cf-yn">' +
      ['是', '否'].map(function (o) {
        return '<button data-yn="' + f.field_id + '" data-v="' + o + '"' +
          (pick === o ? ' class="on"' : '') + '>' + o + '</button>';
      }).join('') + '</div>' +
      '<textarea class="cf-ipt" data-tx="' + f.field_id + '" rows="2"' +
      (pick === '是' ? '' : ' style="display:none"') +
      ' placeholder="选「是」请在这里写清时间、地点、经过">' + esc(ex) + '</textarea>';
  } else if (f.ftype === 'date') {
    s += '<input class="cf-ipt" type="date" data-tx="' + f.field_id + '" value="' + esc(v) + '">';
  } else if ((f.ftype === 'select' || f.ftype === 'country') && (f.options || []).length) {
    s += '<select class="cf-ipt" data-tx="' + f.field_id + '">' +
      '<option value="">— 请选择 —</option>' +
      f.options.map(function (o) {
        return '<option value="' + esc(o) + '"' + (v === o ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('') + '</select>';
  } else if ((f.fill_note || '').length > 40) {
    s += '<textarea class="cf-ipt" data-tx="' + f.field_id + '" rows="3" placeholder="按上面的说明填写">' +
      esc(v) + '</textarea>';
  } else {
    s += '<input class="cf-ipt" data-tx="' + f.field_id + '" value="' + esc(v) + '" placeholder="请填写">';
  }
  return s + '</div>';
}

VIEWS['customer:form'] = function (m, aid) {
  /* 不带办签人时先选人，跟「我的材料」一个路子 */
  if (!aid) {
    return api('/my/orders').then(function (j) {
      var all = [];
      j.list.forEach(function (o) {
        if (o.status === 'created' || o.status === 'cancelled') return;
        o.applicants.forEach(function (a) {
          if (a.state === 'normal') all.push({ o: o, a: a });
        });
      });
      var body = '<div class="h5-sec"><div class="h5-h"><span>选择办签人</span></div>' +
        (all.length ? all.map(function (x) {
          return '<div class="h5-row" data-a="' + x.a.id + '"><span class="lb od-apn">' +
            esc(x.a.name) + '<s>' + esc(x.o.product) + '　' + esc(x.o.no) + '</s></span>' +
            '<span class="ar">›</span></div>';
        }).join('') : '<div class="h5-empty">暂无需要填表的订单</div>') + '</div>' +
        '<div class="h5-tip">一张订单每位办签人各填一份申请表，内容不能混填。</div>';
      m.innerHTML = pageH('填申请表', '每位办签人各一份官方申请表。') +
        cfPage('填申请表', body, '', '这一步在做什么',
          '官方申请表的字段由平台的「国家签证表模板」定义，' +
          '<b>可从证件与订单中带出的字段由系统预先填写</b>，客人仅需填写其余项。',
          true, '', '', 'cardy hue');
      $('[data-back]', m).onclick = function () { go('orders'); };
      $$('[data-a]', m).forEach(function (b) {
        b.onclick = function () { cfOpen(null); go('form', b.dataset.a); };
      });
      h5bind(m);
    });
  }

  return api('/task/get?applicant_id=' + aid).then(function (d) {
    /* 板块已由后端 merge_for_customer 归并成中国人办签的那几步并带了 step 序号，
       前端不再自己拆官方板块名（原来是「个人 1 / 个人 2 / 家庭：配偶」那种直译）。 */
    /* 客人端只填 src=ask 的格子：ocr / sys 是系统带出来的，agent 是专员在官网做的动作。
       销售代填时**所有字段都放开**（唐美芳 2026-09-08：「代填申请表，所有字段都可填写，
       可发给客人二次确认」）——销售拿着客人的证件当面录，系统带出来的那几格万一识别错了，
       让他退出去找顾问改反而更慢。每格标出来源，销售知道自己在覆盖什么。 */
    var agent = S.role !== 'customer';
    var secs = (d.sections || []).map(function (s) {
      return { name: s.name, items: (s.items || [])
        .filter(function (f) { return agent || f.src === 'ask'; }) };
    }).filter(function (s) { return s.items.length; });
    var auto = [];
    (d.sections || []).forEach(function (s) {
      (s.items || []).forEach(function (f) {
        if ((f.src === 'ocr' || f.src === 'sys') && f.value) auto.push(f);
      });
    });
    var open = cfOpen();
    /* 只读模式：从已完成 / 已取消订单的「查看申请表」进来（唐美芳 2026-09-08）。
       订单已经走完，内容只能看不能改，跟顾问确认后的锁定同一套表现。 */
    var roView = String(S.cache.cfRO || '') === String(aid);
    var locked = roView || d.status === 'confirmed' || d.status === 'official';
    var submitted = d.status === 'submitted';

    /* 「还差几项」与提交校验一律只数**客人必答**（src=ask）那部分。
       销售代填时页面上多出了证件识别 / 订单带出 / 专员官网操作的字段，
       那些不是客人要答的题：把它们算进必填，销售会被自己填不了的格子挡住提交
       （唐美芳 2026-09-08 放开全字段编辑，但提交口径不能跟着变）。 */
    function secLeft(s) {
      return s.items.filter(function (f) {
        return f.src === 'ask' && f.required && !f.value;
      }).length;
    }
    var totalLeft = secs.reduce(function (n, s) { return n + secLeft(s); }, 0);
    var askItems = secs.reduce(function (a, s) {
      return a.concat(s.items.filter(function (f) { return f.src === 'ask'; }));
    }, []);
    var totalAsk = askItems.length;
    var done = askItems.filter(function (f) { return !!f.value; }).length;
    var pct = totalAsk ? Math.round(done * 100 / totalAsk) : 100;

    /* 顶部彩色状态头：一句话说清此刻的状态，下面第一张卡压上来
       （唐美芳 2026-08-31 要的同程那种排版）。 */
    function hero(st, sub, chips) {
      return '<div class="cf-hero"><div class="st">' + st + '</div>' +
        '<div class="sub">' + sub + '</div>' +
        (chips && chips.length
          ? '<div class="chips">' + chips.map(function (x) {
            return '<span>' + esc(x) + '</span>';
          }).join('') + '</div>' : '') + '</div>';
    }

    var body;
    if (open == null) {
      /* ---- 板块列表（原型第一屏） ---- */
      body =
        hero(
          locked ? (roView ? '订单已结束，本表仅供查看' : '签证顾问已复核确认')
            : totalLeft ? '尚有 <em>' + totalLeft + ' 项</em>未填写'
              : submitted ? '已提交，签证顾问复核中' : '必填项已全部完成',
          locked ? (roView ? '该订单已完成或已取消，申请表内容仅供查阅，不可修改。'
            : '表单已锁定，如需修改请联系签证顾问撤回后办理。')
            : totalLeft ? '请补齐剩余必填项，完成后点击底部「提交信息」提交至签证顾问复核。'
              : submitted ? '复核确认前仍可修改。'
                : '请点击底部「提交信息」提交至签证顾问复核，复核确认前仍可修改。',
          [esc(d.form_code || '官方申请表'), esc(d.ord_no),
           '系统已带出 ' + auto.length + ' 项']) +
        '<div class="h5-sec"><div class="h5-mhd">' +
        '<div class="l"><b>' + esc(d.name) + '</b><s>' + esc(d.form_code || '官方申请表') +
        ' · ' + esc(d.ord_no) + '</s></div>' +
        '<div class="r"><b>' + done + '<i>/' + totalAsk + '</i></b><s>已填</s></div></div>' +
        '<div class="h5-pb"><i style="width:' + pct + '%"></i></div>' +
        '<div class="h5-gn">' +
        (locked ? '签证顾问已复核确认，表单不可再修改；如需修改请联系顾问撤回。'
          : submitted ? '已提交至签证顾问复核，复核确认前仍可修改。'
            : totalLeft ? '尚有 <b>' + totalLeft + '</b> 项必填未完成，请补齐后提交。'
              : '必填项已全部完成，可提交至签证顾问复核。') + '</div></div>' +

        (auto.length ? '<div class="h5-sec"><div class="h5-h"><span>系统已带出 ' +
          auto.length + ' 项</span></div>' +
          '<div class="h5-gn">以下信息由护照、身份证及订单资料自动带出，无需重复填写。' +
          '如与证件原件不一致，请联系签证顾问核对更正，本页不支持直接修改。</div>' +
          auto.slice(0, 6).map(function (f) {
            return '<div class="h5-row" style="cursor:default"><span class="lb">' + esc(f.name) +
              '</span><span class="vl">' + esc(f.value) + '</span></div>';
          }).join('') +
          (auto.length > 6 ? '<div class="h5-gn">另有 ' + (auto.length - 6) + ' 项已自动带出</div>' : '') +
          '</div>' : '') +

        '<div class="h5-sec"><div class="h5-h"><span>需本人填写的部分</span>' +
        '<span class="more">共 ' + secs.length + ' 步</span></div>' +
        secs.map(function (s, i) {
          var left = secLeft(s);
          /* 步骤序号：唐美芳 2026-08-31「第一步是基础信息，第二步是xx信息之类的」。
             填完的那一步序号打勾，一眼看出还剩哪几步。 */
          return '<div class="h5-row cf-step" data-sec="' + i + '">' +
            '<i class="cf-no' + (left ? '' : ' ok') + '">' + (left ? (i + 1) : '✓') + '</i>' +
            '<span class="lb od-apn">' + esc(s.name) +
            '<s>共 ' + s.items.length + ' 项</s></span>' +
            '<span class="vl ' + (left ? 'cf-left' : 'cf-ok') + '">' +
            (left ? '待填 ' + left + ' 项' : '已填写完成') + '</span><span class="ar">›</span></div>';
        }).join('') + '</div>' +
        '<div class="h5-tip">填写内容自动保存，可随时退出后继续填写。' +
        '<b>保存不等于提交</b>：全部填写完成后请点击底部「提交信息」，签证顾问方可收到。</div>';
    } else {
      /* ---- 单个板块的填写页（原型第二屏） ---- */
      var s = secs[open];
      body = hero('第 ' + (open + 1) + ' 步<em>' + esc(s.name) + '</em>',
        secLeft(s) ? '本步骤尚有 ' + secLeft(s) + ' 项未填写。' : '本步骤已填写完成，可进入下一步。',
        [esc(d.name), '共 ' + secs.length + ' 步']) +
        '<div class="h5-sec"><div class="h5-mhd">' +
        '<div class="l"><b>' + esc(s.name) + '</b>' +
        '<s>第 ' + (open + 1) + ' / ' + secs.length + ' 步</s></div>' +
        '<div class="r"><b>' + (s.items.length - secLeft(s)) + '<i>/' + s.items.length +
        '</i></b><s>已填</s></div></div></div>' +
        '<div class="h5-sec cf-form' + (locked ? ' locked' : '') + '">' +
        s.items.map(cfField).join('') + '</div>' +
        '<div class="h5-tip">本步骤填写完成后请点击下方「保存并返回」，亦可直接进入下一步。</div>';
    }

    var foot;
    if (open != null) {
      foot = '<span class="sum">第 ' + (open + 1) + ' / ' + secs.length + ' 步</span>' +
        (open < secs.length - 1
          ? '<button class="h5-btn grey" data-next>下一步</button>' : '') +
        '<button class="cta" data-savesec>保存并返回</button>';
    } else if (locked) {
      foot = '<span class="sum">' + (roView ? '订单已结束，本表仅供查看' : '签证顾问已复核确认') +
        '</span><button class="cta" data-back3>返回订单</button>';
    } else {
      foot = '<span class="sum' + (totalLeft ? ' od-urge' : '') + '">' +
        (totalLeft ? '尚有 <b>' + totalLeft + '</b> 项必填' : '必填项已齐') + '</span>' +
        /* 「发给客人二次确认」2026-09-08 批 1 与页头的「发给客人自己填」合并——
           两颗按钮生成的是同一条 7 天链接，只是时机不同（我不填了让他填 /
           我填完了让他核一遍），同页摆两颗正是唐美芳说的「怎么感觉这么混乱呢」。
           现在页头一颗管这两种时机，弹窗里把两种用法都写清楚。 */
        '<button class="cta" data-submit>' + (submitted ? '重新提交' : '提交信息') + '</button>';
    }

    /* 「发给客人自己填」收进本页（2026-09-08 批 1）：代填与发给客人填是同一件事的
       两条路径，进到同一个页面里再决定，列表行上不再各占一个按钮。
       客人自己在小程序里打开这一页时不需要这颗按钮（他就是本人）；
       只读态（订单已结束）也不给。 */
    var canShare = agent && !locked;
    m.innerHTML = pageH('填申请表 · ' + d.name,
      '客户在小程序里自己填官方申请表。<b>系统已带出的格子不再问客人</b>，' +
      '只列出必须本人回答的；按官方板块分块填，边填边存。' +
      '原来这一页只存在于分享链接里，小程序内没有入口。',
      (canShare ? '<button class="btn" data-cfshare>发给客人自己填</button> ' : '') +
      '<button class="btn" data-back2>返回办签人列表</button>') +
      cfPage(open == null ? '填申请表' : esc(secs[open].name), body, foot, '这一步在做什么',
        '结构照唐美芳给的闪签原型《填申请表》：板块列表 + 每块的填写状态 + 底部统一提交。' +
        '<b>保存与提交是两件事</b>：保存仅存草稿，提交才表示申请人确认并交由签证顾问复核，' +
        '提交后至顾问确认前仍可修改。高风险题按业务口径不向客人提起的，这里整格不显示。',
        true, '', 'od-acts', 'cardy hue');

    $('[data-cfshare]', m) && ($('[data-cfshare]', m).onclick = function () {
      shareTask(aid, d.name);
    });
    $('[data-back2]', m) && ($('[data-back2]', m).onclick = function () { cfOpen(null); go('form'); });
    $('[data-back]', m).onclick = function () {
      if (cfOpen() != null) { cfOpen(null); reload(); } else { go('odetail', d.ord_no); }
    };
    $('[data-back3]', m) && ($('[data-back3]', m).onclick = function () { go('odetail', d.ord_no); });
    $$('[data-sec]', m).forEach(function (b) {
      b.onclick = function () { cfOpen(+b.dataset.sec); reload(); };
    });

    /* ---- 填写交互：改完即存，跟分享页一样不需要客人点保存 ---- */
    var TM = {}, LAST = {};
    /* 值没变就不发：input 防抖与 blur 会为同一格连发两次，
       后端虽然已经改成原子 upsert 不会再 500，但白跑两趟请求没必要 */
    function save(fid, val) {
      if (LAST[fid] === val) return Promise.resolve();
      LAST[fid] = val;
      return api('/task/answer/save', {
        applicant_id: aid, answers: [{ field_id: fid, value: val }]
      }).catch(function (e) { LAST[fid] = undefined; return fail(e); });
    }
    function readYn(fid) {
      var q = $('[data-fid="' + fid + '"]', m);
      var on = $('[data-yn="' + fid + '"].on', q);
      var tx = $('[data-tx="' + fid + '"]', q);
      if (!on) return '';
      var v = on.dataset.v;
      return v === '是' && tx && tx.value.trim() ? '是：' + tx.value.trim() : v;
    }
    $$('[data-yn]', m).forEach(function (b) {
      b.onclick = function () {
        var fid = b.dataset.yn, q = $('[data-fid="' + fid + '"]', m);
        $$('[data-yn="' + fid + '"]', q).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        var tx = $('[data-tx="' + fid + '"]', q);
        if (tx) tx.style.display = b.dataset.v === '是' ? '' : 'none';
        save(fid, readYn(fid));
        var tag = $('.cf-nm em', q);
        if (tag) { tag.className = 'dn'; tag.textContent = '已填'; }
      };
    });
    $$('[data-tx]', m).forEach(function (el) {
      var fid = el.dataset.tx;
      var flush = function () {
        clearTimeout(TM[fid]);
        var q = $('[data-fid="' + fid + '"]', m);
        var isYn = !!$('[data-yn="' + fid + '"]', q);
        save(fid, isYn ? readYn(fid) : el.value.trim());
      };
      el.oninput = function () { clearTimeout(TM[fid]); TM[fid] = setTimeout(flush, 700); };
      el.onblur = flush;
      el.onchange = flush;
    });

    $('[data-savesec]', m) && ($('[data-savesec]', m).onclick = function () {
      cfOpen(null); toast('这一步已保存'); reload();
    });
    $('[data-next]', m) && ($('[data-next]', m).onclick = function () {
      cfOpen(cfOpen() + 1); reload();
    });
    $('[data-submit]', m) && ($('[data-submit]', m).onclick = function () {
      /* 原型这里是一个二次确认弹窗，照做——提交是个有后果的动作 */
      if (totalLeft) {
        return toast('尚有 ' + totalLeft + ' 项必填未完成，请补齐后提交', true);
      }
      confirmBox('提交申请表',
        '提交后签证顾问开始复核。复核确认前仍可修改，顾问确认后不可再修改。',
        '确认提交')
        .then(function () { return api('/task/submit', { applicant_id: aid }); })
        .then(function (r) { toast(r.msg); reload(); }).catch(fail);
    });
    h5bind(m);
  });
};


/* 有米（门店销售）代客填表：与客户端同一个视图函数，只是外壳换成销售端的
   （唐美芳 2026-09-01：订单详情里既能「发给客人填」，也能「帮客人填」）。 */
/* 2026-09-08 权限下放：供应商也能代填官方申请表（唐美芳：「真正干活办理签证的人，
   还是供应商」）。后端 task_guard 按工单归属限定范围，前端复用同一张表。 */
VIEWS['youmi:formfill'] = VIEWS['csp:formfill'] =
/* uom / lead / ops 2026-09-09 补上：办理中心两端整合后，众信侧列表上也有
   「填申请表」这颗按钮，原来只有 UBK / CSP / 有米注册了这个路由，
   点了会落到「页面不存在」。 */
VIEWS['uom:formfill'] = VIEWS['lead:formfill'] = VIEWS['ops:formfill'] =
VIEWS['ubk:formfill'] = VIEWS['customer:form'];
