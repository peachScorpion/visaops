/* ============================================================
   C 端 · 常用办签人 与 收货地址（凯撒 PRD 4.14.4 常旅客 / 收货地址）
   唐美芳 2026-08-31：「收货地址和办签人员管理是不是 C 端小程序也应该有 2 个模块进行管理，
   我的模块也应该有入口展示」。
   在此之前办签人信息只存在订单里，客户第二次下单要重填一遍护照号、有效期、签发地，
   填错一位就补料重来；收货地址也只能在下单流程里临时填。
   ============================================================ */

var TV_SEX = [{ v: '男', t: '男' }, { v: '女', t: '女' }];
var TV_IDT = [{ v: '护照', t: '护照' }, { v: '港澳通行证', t: '港澳通行证' },
              { v: '台湾通行证', t: '台湾通行证' }];

/* ---------- 常用办签人 ---------- */
VIEWS['customer:travelers'] = function (m) {
  return api('/my/travelers').then(function (j) {
    var list = j.list;

    var body = (list.length
      ? '<div class="h5-sec"><div class="h5-h"><span>常用办签人</span>' +
        '<span class="more">共 ' + list.length + ' 人</span></div>' +
        /* 「本人」置顶并标出来：下单时默认带的就是这一位
           （唐美芳 2026-09-01：「包括标记本人等，默认带出本人的办签人信息」）。
           后端按 is_self desc 排序，所以本人天然在第一个。 */
        list.map(function (t) {
          return '<div class="h5-tv' + (t.is_self ? ' me' : '') + '" data-tv="' + t.id + '">' +
            '<div class="hd"><b>' + esc(t.name_cn) + '</b>' +
            (t.name_en ? '<s>' + esc(t.name_en) + '</s>' : '') +
            (t.is_self ? '<span class="tag ok">本人</span>' : '') +
            '<span class="tag info">' + esc(t.crowd_text) + '</span></div>' +
            '<div class="ln">' + esc(t.id_type || '护照') + ' ' +
            esc(t.id_no || '未填') + '</div>' +
            '<div class="ln">有效期至 ' + esc(t.id_expiry || '未填') +
            (t.expiry_warn ? '<em class="wn">' + esc(t.expiry_warn) + '</em>' : '') + '</div>' +
            (t.used ? '<div class="ln mut">已用于 ' + t.used + ' 次办签</div>' : '') +
            '<div class="op">' +
            (t.is_self ? '' : '<a data-self="' + t.id + '">设为本人</a>') +
            '<a data-ed="' + t.id + '">编辑</a>' +
            '<a data-rm="' + t.id + '">删除</a></div></div>';
        }).join('') + '</div>'
      : '<div class="h5-empty"><b>还没有常用办签人</b>' +
        '<s>把常办签证的家人同事存下来，下次下单直接选，不用重填护照信息</s></div>') +
      '<div class="h5-sec"><a class="h5-add" data-add>+ 新增办签人</a></div>' +
      '<div class="h5-tip">标为<b>「本人」</b>的那一位，下单时会自动带到第一位办签人，' +
      '不用每次手动选。一个账号只能有一位本人，设新的会自动取消原来那位。</div>' +
      '<div class="h5-tip">证件信息要与护照原件完全一致——姓名拼音、证件号、有效期任何一位对不上，' +
      '使领馆都会退件。<b>护照剩余有效期不足 6 个月的，多数国家不受理</b>，系统会在这里标出来。</div>';

    m.innerHTML = pageH('常用办签人',
      '客户把常办签证的人存成档案，下单时直接选，不用每次重填护照号、有效期、签发地。' +
      '这份档案同时决定材料清单怎么裁（在职 / 学生 / 退休 / 自由职业 / 儿童）。') +
      h5page('常用办签人', body, '', '这一步在做什么',
        '签证订单最容易出错的就是证件信息录入——一位数字错了就要补料重来，' +
        '而补料会把送签排期整体往后推。存成档案后复用，把错误率压在第一次。' +
        '<b>护照有效期不足 6 个月会在这里预警</b>，避免客户交了钱才发现护照不能用。',
        true, null);

    $('[data-back]', m).onclick = function () { go('me'); };

    function form(t) {
      t = t || {};
      return [
        { k: 'name_cn', label: '中文姓名', value: t.name_cn || '', required: true },
        { k: 'name_en', label: '英文姓名', value: t.name_en || '',
          ph: '与护照一致，如 ZHANG/SIYUAN' },
        { k: 'sex', label: '性别', type: 'select', value: t.sex || '男', options: TV_SEX },
        { k: 'birth', label: '出生日期', type: 'date', value: t.birth || '' },
        { k: 'id_type', label: '证件类型', type: 'select', value: t.id_type || '护照', options: TV_IDT },
        { k: 'id_no', label: '证件号码', value: t.id_no || '', required: true },
        { k: 'id_expiry', label: '证件有效期至', type: 'date', value: t.id_expiry || '',
          hint: '多数国家要求剩余有效期不少于 6 个月' },
        { k: 'id_place', label: '证件签发地', value: t.id_place || '', ph: '如：北京' },
        { k: 'nation', label: '国籍', value: t.nation || '中国' },
        { k: 'phone', label: '手机号', value: t.phone || '' },
        { k: 'crowd', label: '适用人群', type: 'select', value: t.crowd || 'job',
          options: j.crowds.map(function (x) { return { v: x.v, t: x.t }; }),
          hint: '决定这个人要交哪些材料，选错会导致清单不对' },
        { k: 'is_self', label: '是否本人', type: 'select',
          value: t.is_self ? '1' : '0',
          options: [{ v: '0', t: '否' }, { v: '1', t: '是，这是我本人' }],
          hint: '标为本人后，下单时自动带到第一位办签人。一个账号只能有一位' }
      ];
    }
    /* 提交交给 ask 托管：证件号重复这类后端校验失败时，弹窗与已填内容保留，
       不用整张表重填一遍（2026-09-01 全站统一的做法）。 */
    $('[data-add]', m).onclick = function () {
      ask('新增办签人', form(), '保存', function (f) {
        return api('/my/traveler/save', Object.assign({}, f, { is_self: +f.is_self || 0 }));
      }).then(function () { toast('已保存'); reload(); }).catch(function () { });
    };
    $$('[data-ed]', m).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var t = list.filter(function (x) { return x.id === +b.dataset.ed; })[0];
        ask('编辑办签人', form(t), '保存', function (f) {
          return api('/my/traveler/save',
            Object.assign({ id: t.id }, f, { is_self: +f.is_self || 0 }));
        }).then(function () { toast('已保存'); reload(); }).catch(function () { });
      };
    });
    /* 列表上直接切「本人」，不用进编辑弹窗 */
    $$('[data-self]', m).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        api('/my/traveler/self', { id: +b.dataset.self })
          .then(function (r) { toast('已把 ' + r.name + ' 设为本人'); reload(); }).catch(fail);
      };
    });
    $$('[data-rm]', m).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var t = list.filter(function (x) { return x.id === +b.dataset.rm; })[0];
        confirmBox('删除「' + esc(t.name_cn) + '」',
          '只是从常用列表里移除，<b>不影响已提交的订单</b>——历史订单里的信息独立保存。', '确认删除')
          .then(function () { return api('/my/traveler/del', { id: t.id }); })
          .then(function () { toast('已删除'); reload(); }).catch(fail);
      };
    });
    h5bind(m);
  });
};

/* ---------- 收货地址 ---------- */
VIEWS['customer:addrs'] = function (m) {
  return api('/my/addrs').then(function (j) {
    var list = j.list;

    var body = (list.length
      ? '<div class="h5-sec"><div class="h5-h"><span>收货地址</span>' +
        '<span class="more">共 ' + list.length + ' 条</span></div>' +
        list.map(function (a) {
          return '<div class="h5-tv">' +
            '<div class="hd"><b>' + esc(a.contact) + '</b><s>' + esc(a.phone) + '</s>' +
            (a.is_default ? '<span class="tag ok">默认</span>' : '') + '</div>' +
            '<div class="ln">' + esc(a.region || '') + ' ' + esc(a.detail || '') + '</div>' +
            (a.live.length ? '<div class="ln wn">' + a.live.length +
              ' 张在办订单用这个地址寄回资料</div>' : '') +
            '<div class="op"><a data-ed="' + a.id + '">编辑</a>' +
            (a.is_default ? '' : '<a data-df="' + a.id + '">设为默认</a>') +
            (a.live.length ? '' : '<a data-rm="' + a.id + '">删除</a>') + '</div></div>';
        }).join('') + '</div>'
      : '<div class="h5-empty"><b>还没有收货地址</b>' +
        '<s>签证办结后需将护照原件寄回，请预先维护收件地址</s></div>') +
      '<div class="h5-sec"><a class="h5-add" data-add>+ 新增收货地址</a></div>' +
      '<div class="h5-tip">签证办完后，护照原件与签证页由专员通过快递寄回，寄到这里维护的地址。' +
      '<b>正被在办订单使用的地址不能删除</b>，需要换地址请直接编辑，或新增一条后在订单里改选。</div>';

    m.innerHTML = pageH('收货地址',
      '签证办完把护照原件寄回客户，寄到哪就取这里。下单时可直接选，不用每次手填。') +
      h5page('收货地址', body, '', '这一步在做什么',
        '签证业务全程要托管客户的护照原件，<b>最后一步是把原件安全寄回</b>。' +
        '地址错了就是丢件事故，所以这里做成独立档案而不是每次下单临时填；' +
        '正被在办订单引用的地址不允许删除。', true, null);

    $('[data-back]', m).onclick = function () { go('me'); };

    function form(a) {
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
    $('[data-add]', m).onclick = function () {
      ask('新增收货地址', form(), '保存')
        .then(function (f) { return api('/my/addr/save', f); })
        .then(function () { toast('已保存'); reload(); }).catch(fail);
    };
    $$('[data-ed]', m).forEach(function (b) {
      b.onclick = function () {
        var a = list.filter(function (x) { return x.id === +b.dataset.ed; })[0];
        ask('编辑收货地址', form(a), '保存')
          .then(function (f) { return api('/my/addr/save', Object.assign({ id: a.id }, f)); })
          .then(function () { toast('已保存'); reload(); }).catch(fail);
      };
    });
    $$('[data-df]', m).forEach(function (b) {
      b.onclick = function () {
        var a = list.filter(function (x) { return x.id === +b.dataset.df; })[0];
        api('/my/addr/save', { id: a.id, contact: a.contact, phone: a.phone,
          region: a.region, detail: a.detail, is_default: '1' })
          .then(function () { toast('已设为默认'); reload(); }).catch(fail);
      };
    });
    $$('[data-rm]', m).forEach(function (b) {
      b.onclick = function () {
        confirmBox('删除收货地址', '删除后不影响历史订单已记录的地址。', '确认删除')
          .then(function () { return api('/my/addr/del', { id: +b.dataset.rm }); })
          .then(function () { toast('已删除'); reload(); }).catch(fail);
      };
    });
    h5bind(m);
  });
};
