/* ============================================================
   UOM · C 端产品审核页（2026-09-09 新建，2026-09-10 收窄为 C 端专用）

   唐美芳给了众信现有「产品运营 · 审核」页的截图，要求照这个结构做：
     上半「供应商产品基础信息」—— 供应商报上来的，只读；右上角有 C 端页面预览
     下半「审核信息」          —— 运营可编辑的对客文案（名称 / 副标题 / 标签 /
                                  主图 / 分享推广语）
     底部                      —— 取消 · 审核驳回 · 审核通过

   ⚠️ **这一页只给 C 端用**（唐美芳 2026-09-10：「我之前说的 B 端产品审核进入的是
   产品详情页，底部是审核驳回、通过按钮。C 端审核的页面才需要二次编辑，
   你现在把 2 个端的审核页面都变成一样了」）。
   两端审的东西本来就不同：
     · B 端渠道运营审的是「这条产品能不能给门店卖」——结算价成不成立、材料清单绑没绑对、
       受理范围写没写清。这些全是供应商的口径，运营不该在审核时顺手改，
       所以 B 端走**只读的产品详情页 + 底部审核按钮**（见 v-ubk-ops.js 的 ops:prod）。
     · C 端内容运营审的是「这条产品能不能给客户看」——名称、副标题、卖点、主图这些
       对客文案，供应商报上来的常带内部口径，必须在审核时就改成对客说法，
       所以只有这一页带编辑区。

   为什么审核动作要放在这一页、而不是列表上：列表上直接点「通过」，等于没看产品
   就签字。这一页把该核的东西摆齐了（价格区间、材料清单版本、受理范围、收料地址），
   看完再下结论。

   ⚠️ 可编辑的只有对客文案那几样。价格、材料清单、受理范围是供应商的口径，
   运营要改得回「编辑产品 / 编辑套餐」——那两处会触发自动下架与重新送审，
   在审核页里顺手改掉会让「审过的版本」和「在售的版本」对不上。
   ============================================================ */

VIEWS['ops:review'] = function (m, id) {
  if (!id) return go('prodc');
  /* B 端不再走这一页。老书签、老链接进来就转到产品详情页去审，不给一个「B 端也能
     在这儿改对客文案」的入口——那正是两端被混成一样的起点。 */
  if (S.cache.upReview === 'b') {
    S.cache.upTab = 'info';
    return go('prod', id);
  }
  var tk = 'c';
  var T = TRK[tk], RK = 'review_' + tk;
  var back = S.cache.upBack || 'prodc';

  return api('/ops/product?id=' + id).then(function (d) {
    var p = d.product;
    var pend = d[RK] === 'pending';
    var svcAll = (d.svc_opts && d.svc_opts.length) ? d.svc_opts : SVC_OPTS_FALLBACK;
    var picked = d.svc_tags || [];

    m.innerHTML = pageH('C 端产品审核 · 对客信息', '',
      '<div class="btns">' +
      '<button class="btn" data-prev>C 端页面预览</button>' +
      '<button class="btn" data-more>查看更多详情</button>' +
      '<button class="btn" data-back>返回' + T.name + '</button>' +
      '</div>') +

      /* ── 上半：供应商报上来的，只读 ── */
      card('供应商产品基础信息 <span>由供应商在 UBK 提交，此处只读；如需改价或改材料清单，' +
        '请用「编辑产品 / 编辑套餐」，那两处会触发自动下架与重新送审</span>',
        '<div class="pad"><div class="wd-kv">' + [
          ['产品编号', '<span class="mono">' + esc(d.sup_code || d.code || '—') + '</span>' +
            (d.vendor_code ? '<i class="hint"> · 供应商编码 ' + esc(d.vendor_code) + '</i>' : '')],
          ['产品名称', esc(d.name)],
          ['供应商', esc(d.supplier_full || d.supplier || '—')],
          ['供应商计调', esc(d.sup_owner_name || d.created_by_name || '—')],
          ['目的地国家', flag(p.country) + ' ' + esc(p.country || '')],
          ['送签地', esc(p.submit_city || '—')],
          ['签证类型', esc(p.visa_cat || '—') +
            (p.visa_type ? '<i class="hint"> · ' + esc(p.visa_type) + '</i>' : '')],
          ['有效期 / 停留', esc(d.valid || '—') + ' · ' + esc(d.stay_text || '—')],
          ['入境次数', esc((typeof ENTRIES !== 'undefined' && ENTRIES[d.entries || p.entries]) ||
            d.entries || p.entries || '—')],
          ['面签 / 指纹', (p.need_interview ? '需本人面签' : '免面签') +
            ' · ' + (p.need_fingerprint ? '需采集指纹' : '不需指纹')],
          ['套餐数量', (d.packages || []).length + ' 个'],
          ['结算价', priceRange(d.packages, 'settle_price')],
          ['零售价', priceRange(d.packages, 'suggest_retail')],
          ['材料清单', d.fullver_ver
            ? esc(d.fullver_name || d.fullver_ver) +
              '<i class="hint"> · ' + esc(d.fullver_ver) + '</i>'
            : '<span class="tag bad">未绑定</span>'],
          ['收料地址', esc(d.mail_addr || '未设置')],
          ['最后更新', d16(d.updated_at) +
            (d.updated_by_name ? '<i class="hint"> · ' + esc(d.updated_by_name) + '</i>' : '')]
        ].map(function (x) {
          return '<div><s>' + x[0] + '</s><b>' + x[1] + '</b></div>';
        }).join('') + '</div></div>') +

      /* ── 下半：运营可编辑的对客文案 ── */
      /* ⚠️ 字段名一律沿用**供应商在 UBK 填写时看到的名字**
         （唐美芳 2026-09-10：「字段名称最好和供应商保持一致」）。
         供应商填的是「产品头图 / 产品特色 / 服务保障」，运营审的时候却叫
         「产品主图 / 产品卖点 / 产品标签」，两边对着同一个格子说三个名字，
         驳回意见写「主图不合规」，供应商在自己页面上找不到叫「主图」的东西。 */
      card('审核信息 <span>下列字段由运营维护，直接影响客户端与门店端看到的内容。' +
        '字段名与供应商在 UBK 填写时看到的一致</span>',
        '<div class="pad pr-form">' +
        fRow('产品名称', true,
          '<input data-k="name" value="' + esc(d.name || '') + '" maxlength="100">',
          '客户端与门店端展示的名称。供应商报的名字常带内部口径，这里统一成对客说法。') +
        fRow('产品副标题', false,
          '<input data-k="subtitle" value="' + esc(d.subtitle || '') + '" maxlength="100" ' +
          'placeholder="一句话卖点，如：3 个工作日出签 · 全程电子材料">',
          '展示在产品名下方。') +
        fRow('产品头图', false,
          imgField('pr-hero', d.hero_img || '',
            '客户端产品详情页顶部的大图，建议 1200×675（16:9）以内、5MB 以下。' +
            '未上传时展示该国家的默认图片。'),
          '与供应商「编辑产品 › 产品头图」是同一个字段，直接换图，不必填地址。') +
        fRow('产品特色', false,
          '<textarea data-k="feature" rows="3" maxlength="300">' +
          esc(d.feature || '') + '</textarea>',
          '产品详情页顶部的一段描述。不得出现「保证出签」这类无法兑现的承诺。') +
        fRow('服务保障', false,
          '<div class="chks" data-k="svc_tags" data-multi="1">' + svcAll.map(function (t) {
            return '<label><input type="checkbox" value="' + esc(t) + '"' +
              (picked.indexOf(t) >= 0 ? ' checked' : '') + '><span>' + esc(t) + '</span></label>';
          }).join('') + '</div>',
          '勾中的项会显示在客户端产品详情页顶部的保障栏与门店端列表上。' +
          '「免面签」由系统按签证属性自动带出，平台通用能力无需在此勾选。') +
        fRow('分享推广语', false,
          '<textarea data-k="share_text" rows="3" maxlength="300" ' +
          'placeholder="销售分享给客人时带的文案">' + esc(d.share_text || '') + '</textarea>',
          '门店销售把产品分享给客人时，随链接一起带出去的话术。') +
        '</div>') +

      /* ── 底部动作条 ── */
      '<div class="pr-foot">' +
      '<button class="btn" data-cancel>取消</button>' +
      (pend
        ? '<button class="btn bad" data-rj>审核驳回</button>' +
          '<button class="btn p" data-ap>审核通过</button>'
        : '<button class="btn p" data-save>保存对客信息</button>' +
          '<span class="hint">本产品' + T.t + '当前为「' + rvText(d[RK]) +
          '」，不在待审队列中；如需变更结论请回列表操作。</span>') +
      '</div>';

    /* ---------- 绑定 ---------- */
    imgBind(m);        /* 产品头图：上传控件，不是填地址 */

    function readForm() {
      var out = {};
      $$('[data-k]', m).forEach(function (el) {
        out[el.dataset.k] = el.dataset.multi
          ? $$('input:checked', el).map(function (i) { return i.value; })
          : (el.value || '').trim();
      });
      out.hero_img = imgRead(m, 'pr-hero');
      return out;
    }
    function saveMarket() {
      var f = readForm();
      if (!f.name) { toast('产品名称不能为空', true); return Promise.reject(new Error('x')); }
      return api('/ops/product/market', {
        id: +id, name: f.name, subtitle: f.subtitle, feature: f.feature,
        svc_tags: f.svc_tags, hero_img: f.hero_img, share_text: f.share_text
      });
    }

    $('[data-back]', m).onclick = function () { S.cache.upReview = null; go(back); };
    $('[data-cancel]', m).onclick = function () { S.cache.upReview = null; go(back); };
    $('[data-prev]', m).onclick = function () {
      window.open(location.pathname + '#customer/shop/p-' + id, '_blank');
    };
    $('[data-more]', m).onclick = function () {
      S.cache.upBack = back; S.cache.upTab = 'info'; go('prod', id);
    };
    var sv = $('[data-save]', m);
    if (sv) sv.onclick = function () {
      saveMarket().then(function () { toast('已保存'); reload(); }).catch(function () { });
    };
    var ap = $('[data-ap]', m);
    if (ap) ap.onclick = function () {
      confirmBox('审核通过',
        '通过后本产品即在<b>' + T.ch + '</b>展示并可被下单。<br>' +
        '页面上修改过的对客信息会<b>一并保存</b>。<br>' +
        '请确认结算价与零售价区间、材料清单版本、受理范围均已核对无误。', '确认通过')
        .then(saveMarket)
        .then(function () {
          return api('/ops/product/review', { id: +id, track: tk, action: 'approve' });
        })
        .then(function () {
          toast('已通过，该产品现在在' + T.ch + '可售');
          S.cache.upReview = null; go(back);
        })
        .catch(function () { });
    };
    var rj = $('[data-rj]', m);
    if (rj) rj.onclick = function () {
      rejectModal(function (payload) {
        return api('/ops/product/review',
          { id: +id, track: tk, action: 'reject',
            note: payload.note, note_imgs: payload.imgs });
      }, tk).then(function () {
        toast('已驳回，供应商会收到原因');
        S.cache.upReview = null; go(back);
      }).catch(function () { });
    };
  });
};

/* 审核页的表单行：标签在左、控件在右、说明在下，跟她给的截图一个排法 */
function fRow(label, req, ctrl, tip) {
  return '<div class="pr-row"><label>' + (req ? '<i>*</i> ' : '') + esc(label) + '</label>' +
    '<div class="pr-c">' + ctrl +
    (tip ? '<div class="hint">' + esc(tip) + '</div>' : '') + '</div></div>';
}

/* 套餐价格区间：只有一个套餐时不重复写 */
function priceRange(pks, key) {
  var vs = (pks || []).map(function (k) { return k[key]; }).filter(function (v) { return v; });
  if (!vs.length) return '<span class="hint">未报价</span>';
  var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
  return '¥' + money(lo) + (hi > lo ? ' ~ ¥' + money(hi) : '');
}

/* 服务标签选项：接口没下发时的兜底，与后端 SVC_OPTS 保持一致 */
var SVC_OPTS_FALLBACK = ['材料预审', '顺丰包邮取送', '专人陪同面签', '加急代约号',
  '专属签证专员', '使馆直递', '拒签重申免服务费'];

/* ============================================================
   审核驳回弹窗（2026-09-10 照唐美芳给的众信现有弹窗截图重做）

   原来是一个空白文本框，写什么全凭审核人自己组织语言：同一类问题十个人
   十种写法，供应商收到「图片不合规」四个字，不知道是尺寸、水印还是拼图。
   改成**预置原因多选 + 补充说明 + 驳回截图**：
     · 预置项覆盖 C 端内容审核最常驳的七类，勾一下就是一句完整、可执行的话；
     · 截图最多 5 张——「主图不合规」这类问题，光靠文字说不清是哪张图哪个角。

   下面这七条按签证产品的实际口径写。截图里那份是旅游产品的
   （散拼收客、行程天数），签证没有这些概念，照抄过来供应商看不懂。
   ============================================================ */
var RJ_REASONS_C = [
  ['产品头图', '需使用与目的地相符的整张风景图片（图片不得包含文字、价格、二维码、水印、Logo、边框、拼图等）'],
  ['产品名称', '名称带内部口径或与实际签证类型不符，请改为「送签地 + 国家 + 签证类型」的对客说法'],
  ['产品特色', '含「保证出签」「100% 通过」等无法兑现的承诺，或与实际服务不符，请重新描述'],
  ['服务保障', '勾选的服务保障与实际提供的不一致，请按实际能力勾选'],
  ['费用说明', '套餐包含与不包含的内容容易产生歧义，请完整填写'],
  ['时效承诺', '套餐标注的办理时长与实际出签时效不符'],
  ['材料清单', '未绑定送签材料清单版本，或所绑版本与本产品的国家 / 签证类型不匹配'],
  ['其他原因', '请在下方补充说明中写清具体问题与修改要求']
];

/* B 端（渠道运营）驳的是另一类东西：价格成不成立、材料清单绑没绑对、受理范围写没写清。
   跟 C 端共用弹窗，但清单必须各是各的——把「产品头图不合规」摆在渠道运营面前，
   他既不该管也改不了。 */
var RJ_REASONS_B = [
  ['结算价', '结算价高于建议零售价，报价倒挂，请重新报价'],
  ['套餐报价', '套餐缺少报价，或未填写办理时长，无法对客承诺时效'],
  ['材料清单', '未绑定送签材料清单版本，或所绑版本与本产品的国家 / 签证类型不匹配'],
  ['受理范围', '受理居住地范围或受理说明缺失，与实际受理领区不符'],
  ['收料地址', '未设置收料地址，纸质材料无处可寄'],
  ['产品名称', '未按「送签地 + 国家 + 签证类型」的命名规则填写'],
  ['签证属性', '有效期、停留期、入境次数或面签 / 指纹要求与官方口径不符'],
  ['其他原因', '请在下方补充说明中写清具体问题与修改要求']
];
function rjReasons(tk) { return tk === 'b' ? RJ_REASONS_B : RJ_REASONS_C; }

/* 返回 Promise：确认驳回后 resolve(submit 的结果)，取消则永不 resolve（沿用弹窗惯例）。
   tk = 'b' | 'c' 决定摆哪一套预置原因。 */
function rejectModal(submit, tk) {
  var LIST = rjReasons(tk);
  return new Promise(function (resolve, reject) {
    var html =
      '<div class="pr-row"><label><i>*</i> 驳回原因</label><div class="pr-c">' +
      '<div class="rjr">' + LIST.map(function (r, i) {
        return '<label><input type="checkbox" data-rjr="' + i + '">' +
          '<span><b>【' + esc(r[0]) + '】：</b>' + esc(r[1]) + '</span></label>';
      }).join('') + '</div></div></div>' +
      '<div class="pr-row"><label>补充说明</label><div class="pr-c">' +
      '<textarea data-rjnote rows="3" maxlength="300" ' +
      'placeholder="可补充具体位置与修改要求，例如：主图右下角有供应商 Logo，请换一张无水印的原图"></textarea>' +
      '<div class="hint">勾了「其他原因」时必须填写。此处内容与勾选的原因一并原样发给供应商。</div>' +
      '</div></div>' +
      '<div class="pr-row"><label>驳回截图</label><div class="pr-c">' +
      imgsField('rj-imgs', [], { max: 5, mb: 2 }) + '</div></div>';

    var mo = modal('审核驳回', html, [
      { t: '取消' },
      {
        t: '确定驳回', cls: 'bad solid', fn: function (mask) {
          var picked = $$('[data-rjr]', mask).filter(function (b) { return b.checked; })
            .map(function (b) { return LIST[+b.dataset.rjr]; });
          if (!picked.length) { toast('请至少勾选一条驳回原因', true); return false; }
          var extra = ($('[data-rjnote]', mask).value || '').trim();
          if (picked.some(function (r) { return r[0] === '其他原因'; }) && !extra) {
            toast('勾选「其他原因」时请填写补充说明', true); return false;
          }
          /* 拼成供应商直接能照着改的一段话：一条原因一行，补充说明另起一段 */
          var note = picked.map(function (r) {
            return '【' + r[0] + '】：' + r[1];
          }).join('\n') + (extra ? '\n补充说明：' + extra : '');
          var r = submit({ note: note, imgs: imgsRead(mask, 'rj-imgs') });
          return r.then(resolve);
        }
      }
    ], true);
    imgsBind(mo.mask);
  });
}
