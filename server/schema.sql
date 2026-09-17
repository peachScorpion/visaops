-- VisaOps 数据库结构
-- 设计原则：材料模板三层（样例库→完整版→产品）、产品带套餐层、履约全链路留痕

PRAGMA journal_mode=WAL;

-- ========== 组织与用户 ==========
CREATE TABLE IF NOT EXISTS org (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,              -- platform 平台 / supplier 供应商 / store 门店 / agency 同业
  name TEXT NOT NULL,
  short TEXT,
  license TEXT,                    -- 资质编号
  contract_no TEXT,
  bank_acct TEXT,
  status TEXT DEFAULT 'active',    -- pending 待审 / active / frozen
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  pwd TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT NOT NULL,              -- customer / csp / uom / lead / fin / ubk / ops
  org_id INTEGER,
  created_at TEXT
);

-- 地址：供应商收料地址 + 客户收货地址共用
CREATE TABLE IF NOT EXISTS addr (
  id INTEGER PRIMARY KEY,
  owner_kind TEXT NOT NULL,        -- org / user
  owner_id INTEGER NOT NULL,
  region TEXT NOT NULL,            -- 省/市/区县
  detail TEXT NOT NULL,
  contact TEXT NOT NULL,
  phone TEXT NOT NULL,
  is_default INTEGER DEFAULT 0
);

-- ========== 材料模板三层 ==========
-- 第一层：样例/模版库（跨国家复用的示意图，如"护照通用样例"）
CREATE TABLE IF NOT EXISTS sample_tpl (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,              -- 样例模版名称
  mat_name TEXT NOT NULL,          -- 资料名称（字典）
  files TEXT DEFAULT '[]',         -- [{name,url}]
  created_at TEXT
);

-- 第二层：完整版（某国某签证的完整材料清单，带版本与生效日期）
CREATE TABLE IF NOT EXISTS fullver (
  id INTEGER PRIMARY KEY,
  ver_no TEXT NOT NULL,            -- 6 位随机版本号
  country TEXT NOT NULL,
  visa_type TEXT,                  -- 适用签证类型，同一国家不同签证类型材料不同
  name TEXT NOT NULL,              -- 如：美国个人旅游签证资料
  formver_id INTEGER,              -- 关联的国家签证表模板：表里标成证件识别的字段，其来源载体就是这里要收的件
  owner_org INTEGER DEFAULT 0,     -- 0=平台版，>0=供应商自有版
  from_id INTEGER,                 -- 由哪个平台完整版复制而来
  status TEXT DEFAULT 'draft',     -- draft 待发布 / published 已发布 / withdrawn 已撤回
  effective_at TEXT,               -- 生效时间
  active INTEGER DEFAULT 0,        -- 是否生效（当前时间 >= 生效时间）
  created_at TEXT,                 -- 列表默认按此倒序
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS fullver_item (
  id INTEGER PRIMARY KEY,
  fullver_id INTEGER NOT NULL,
  mat_name TEXT NOT NULL,          -- 资料名称
  attr TEXT NOT NULL,              -- origin 原件 / copy 复印件
  provide_way TEXT NOT NULL,       -- JSON 数组：mail 邮寄自送 / upload 电子上传 / carry 面试携带
  copies INTEGER DEFAULT 1,        -- 份数
  necessity TEXT NOT NULL,         -- must 必须材料 / suggest 建议材料
  require_text TEXT,               -- 资料提交要求
  sample_tpl_id INTEGER,           -- 关联样例模版
  files TEXT DEFAULT '[]',         -- 本地上传的样例
  crowds TEXT NOT NULL,            -- JSON：job 在职 / free 自由职业 / student 在校学生 / retire 退休 / child 学龄前儿童
  sort INTEGER DEFAULT 0
);

-- ========== 产品：平台产品 → 供应商产品 → 套餐 ==========
CREATE TABLE IF NOT EXISTS product (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE,
  country TEXT NOT NULL,
  visa_type TEXT NOT NULL,         -- 个人旅游签证 / 商务签证 …
  submit_city TEXT NOT NULL,       -- 送签地：北京送签
  name TEXT NOT NULL,              -- 送签地+国家+签证类型
  accept_provinces TEXT DEFAULT '[]',
  accept_note TEXT,
  valid_type TEXT,                 -- day / year
  valid_num INTEGER,
  entries TEXT,                    -- single / double / multi
  stay_days INTEGER,
  need_interview INTEGER DEFAULT 0,
  need_fingerprint INTEGER DEFAULT 0,
  fullver_id INTEGER,              -- 关联的平台完整版
  status TEXT DEFAULT 'draft',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS sup_product (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  org_id INTEGER NOT NULL,         -- 供应商
  name_suffix TEXT,                -- 自定义名称后缀
  name TEXT,                       -- 平台产品名 + 后缀
  feature TEXT,                    -- 产品特色描述
  svc_tags TEXT,                   -- 服务保障：供应商从平台预置清单里勾选的项（JSON 数组）
  addr_id INTEGER,                 -- 收料地址
  fullver_id INTEGER,              -- 使用的完整版（平台版或自有版）
  to_b INTEGER DEFAULT 1,          -- 上架到 B 端（CSP 门店/同业产品预订中心），默认上架
  to_c INTEGER DEFAULT 0,          -- 上架到 C 端（客户小程序），默认不上架
  status TEXT DEFAULT 'draft',     -- draft 草稿 / published 供应商已提交上架
  -- B 端与 C 端由两拨运营分别审：B 端看渠道口径与结算价，C 端看面向消费者的文案与合规。
  -- 一条状态表达不了「B 端已上架、C 端还在改」，所以两端各存一套结论。
  -- 取值：none 未提交 / pending 待审核 / approved 已通过 / rejected 已驳回
  review_b TEXT DEFAULT 'none',    -- B 端（CSP 门店/同业）审核结论，通过并上架后在 CSP 展示
  review_b_note TEXT,
  review_b_imgs TEXT,              -- 驳回截图，JSON 数组，最多 5 张。「主图不合规」这类
                                   -- 问题光靠文字说不清是哪张图哪个角
  review_b_by TEXT,
  review_b_at TEXT,
  review_c TEXT DEFAULT 'none',    -- C 端（客户小程序）审核结论，通过并上架后在小程序展示
  review_c_note TEXT,
  review_c_imgs TEXT,              -- 同上，C 端那份
  review_c_by TEXT,
  review_c_at TEXT,
  review TEXT DEFAULT 'none',      -- 兼容列，已不参与判断，读写一律走 review_b / review_c
  review_note TEXT,
  review_by TEXT,
  review_at TEXT,
  submit_at TEXT,                  -- 供应商提交送审时间
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS pkg (
  id INTEGER PRIMARY KEY,
  sup_product_id INTEGER NOT NULL,
  name TEXT NOT NULL,              -- 套餐自定义名：普通办理 / 加急 / 拒签退款
  sup_code TEXT,
  visa_fee REAL DEFAULT 0,         -- 套餐签证费
  service_fee REAL DEFAULT 0,      -- 套餐商家服务费
  settle_price REAL DEFAULT 0,     -- 基础结算价 = 签证费 + 服务费
  suggest_retail REAL DEFAULT 0,   -- 零售参考价
  lead_days INTEGER DEFAULT 0,     -- 办理时长（工作日）
  book_notice TEXT,                -- 预订须知：下单前要知道的约束（不可退改、需本人到场等）
  pkg_desc TEXT,                   -- 套餐说明：这个套餐包了什么、跟隔壁套餐差在哪（与预订须知是两件事）
  refund_insured INTEGER DEFAULT 0 -- 是否含拒签退款
);

-- ========== 渠道组与投放（B2B 供货定价，本期不含分销分润） ==========
CREATE TABLE IF NOT EXISTS chan_group (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL,         -- 供应商
  name TEXT NOT NULL,
  members TEXT DEFAULT '[]',       -- 渠道 org_id 列表
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS chan_rule (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,
  countries TEXT DEFAULT '[]',     -- 空数组=全部国家
  base TEXT DEFAULT 'settle',      -- settle 基础结算价 / service 服务费
  mode TEXT DEFAULT 'origin',      -- origin 使用产品库基础结算价 / percent / fixed
  val REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chan_pub (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,
  pkg_id INTEGER NOT NULL,
  on_shelf INTEGER DEFAULT 0,
  settle_price REAL,               -- 按策略算出的渠道结算价
  suggest_price REAL,              -- 渠道建议零售价
  retail_price REAL,               -- 渠道实际零售价（运营端定）
  agented INTEGER DEFAULT 0,       -- 是否已代理
  warn INTEGER DEFAULT 0,          -- 报价预警：结算价 > 零售价
  updated_at TEXT
);

-- ========== 订单与办签人 ==========
CREATE TABLE IF NOT EXISTS ord (
  id INTEGER PRIMARY KEY,
  no TEXT UNIQUE NOT NULL,         -- VS-xxxx
  channel TEXT NOT NULL,           -- C 直客 / B 同业 / CSP 门店
  org_id INTEGER,                  -- 下单渠道组织
  buyer_user INTEGER,              -- 下单人
  agent_user INTEGER,              -- 代客下单的销售
  product_id INTEGER,
  sup_product_id INTEGER,
  pkg_id INTEGER,
  pax INTEGER DEFAULT 1,
  amount REAL DEFAULT 0,           -- 客户应付
  settle_amount REAL DEFAULT 0,    -- 应付供应商
  status TEXT DEFAULT 'created',   -- created 待付款 / paid 已付款 / processing 办理中 / done 已完成 / cancelled / refunded
  gate INTEGER DEFAULT 0,          -- 财务放行标记，0 时供应商与工单台不可见
  depart_date TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  recv_addr_id INTEGER,            -- 客户收货地址（资料返还）
  settle_entity TEXT,
  invoice_entity TEXT,
  note TEXT,                        -- 订单备注：下单时（C 端 / 有米 / CSP）随订单一并提交
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS applicant (
  id INTEGER PRIMARY KEY,
  ord_id INTEGER NOT NULL,
  name_cn TEXT NOT NULL,
  name_en TEXT,
  sex TEXT,
  birth TEXT,
  id_type TEXT DEFAULT '护照',
  id_no TEXT,
  id_expiry TEXT,
  id_place TEXT,
  nation TEXT DEFAULT '中国',
  phone TEXT,
  crowd TEXT DEFAULT 'job',        -- 适用人群 5 类
  state TEXT DEFAULT 'normal',     -- normal / refunded
  progress TEXT DEFAULT 'P1',      -- P1..P10
  consulate_region TEXT,           -- 领区
  appt_no TEXT,                    -- 预约号
  appt_at TEXT,
  appt_place TEXT,
  appt_change INTEGER DEFAULT 0,   -- 改期次数
  app_id TEXT,                     -- DS-160 Application ID
  barcode TEXT,
  cgi_receipt TEXT,                -- CGI 缴费收据号
  fee_amount REAL DEFAULT 0,
  batch_id INTEGER,                -- 送签批次
  visa_result TEXT,                -- pass 出签 / reject 拒签 / withdraw 撤签 / ap 行政审查
  visa_no TEXT,
  visa_valid_to TEXT,
  visa_stay INTEGER,
  reject_reason TEXT,
  reject_cate TEXT,                -- 拒签归因
  liability TEXT DEFAULT 'none',   -- company 我司 / customer 客户 / official 使领馆第三方 / none 未判定
  ap_due TEXT                      -- 行政审查到期提醒（15 天）
);

-- ========== 材料与补料 ==========
CREATE TABLE IF NOT EXISTS mat (
  id INTEGER PRIMARY KEY,
  applicant_id INTEGER NOT NULL,
  item_id INTEGER,                 -- 来源 fullver_item
  mat_name TEXT NOT NULL,
  attr TEXT,
  provide_way TEXT,
  copies INTEGER DEFAULT 1,
  necessity TEXT,
  require_text TEXT,
  sample_url TEXT,
  status TEXT DEFAULT 'wait',      -- wait 待提交 / review 待审核 / pass / reject
  file_name TEXT,
  file_url TEXT,               -- 真实上传落盘后的可访问地址
  ai_msg TEXT,                     -- AI 预审提示
  reject_reason TEXT,
  round INTEGER DEFAULT 0,         -- 第几轮补料
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS supp (
  id INTEGER PRIMARY KEY,
  no TEXT UNIQUE NOT NULL,         -- BL-xxxx
  applicant_id INTEGER NOT NULL,
  mat_ids TEXT DEFAULT '[]',
  reason TEXT,
  round INTEGER DEFAULT 1,         -- 上限 3 次
  due_at TEXT,                     -- 7 天倒计时
  status TEXT DEFAULT 'open',      -- open / done / expired
  closed_at TEXT,
  created_at TEXT
);

-- ========== 工单 / 送签 / 返还 ==========
CREATE TABLE IF NOT EXISTS wo (
  id INTEGER PRIMARY KEY,
  no TEXT UNIQUE NOT NULL,         -- VW-xxxx
  ord_id INTEGER NOT NULL,
  applicant_id INTEGER NOT NULL,
  owner_user INTEGER,              -- 签证操作专员
  sup_org INTEGER,                 -- 派给供应商
  sla_due TEXT,
  status TEXT DEFAULT 'open',      -- open / hold 挂起 / done
  hold_reason TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS batch (
  id INTEGER PRIMARY KEY,
  no TEXT UNIQUE NOT NULL,         -- ST-xxxx
  submit_city TEXT,
  submit_date TEXT,
  courier TEXT,
  status TEXT DEFAULT 'open',      -- open / sent 已递交 / back 已回收
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS deliver (
  id INTEGER PRIMARY KEY,
  no TEXT UNIQUE NOT NULL,         -- CL-xxxx
  ord_id INTEGER NOT NULL,
  addr_id INTEGER,
  express TEXT,
  express_no TEXT,
  sign_name TEXT,                  -- 电子签名
  signed_at TEXT,
  status TEXT DEFAULT 'open',      -- open / sent / signed
  created_at TEXT
);

-- ========== 资金 ==========
CREATE TABLE IF NOT EXISTS pay (
  id INTEGER PRIMARY KEY,
  ord_id INTEGER NOT NULL,
  kind TEXT DEFAULT 'in',          -- in 收款 / out 退款
  amount REAL,
  method TEXT,
  trade_no TEXT,
  fin_confirmed INTEGER DEFAULT 0,
  fin_user INTEGER,
  fin_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS refund (
  id INTEGER PRIMARY KEY,
  no TEXT UNIQUE NOT NULL,         -- RF-xxxx
  ord_id INTEGER NOT NULL,
  applicant_ids TEXT DEFAULT '[]',
  reason TEXT,
  reason_cate TEXT,
  amount REAL DEFAULT 0,
  liability TEXT DEFAULT 'none',
  status TEXT DEFAULT 'applying',  -- applying 待审 / l1 主管已批 / done 已出账 / reject 驳回
  l1_user INTEGER, l1_at TEXT,
  fin_user INTEGER, fin_at TEXT,
  note TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS payable (
  id INTEGER PRIMARY KEY,
  ord_id INTEGER NOT NULL,
  sup_org INTEGER NOT NULL,
  amount REAL DEFAULT 0,
  status TEXT DEFAULT 'open',      -- open 挂账 / paid 已付
  paid_at TEXT,
  created_at TEXT
);

-- 垫付台账（签证费、加急费等由我司先垫）
CREATE TABLE IF NOT EXISTS advance (
  id INTEGER PRIMARY KEY,
  applicant_id INTEGER NOT NULL,
  item TEXT,                       -- CGI 签证费 / 加急费 / 快递费
  amount REAL DEFAULT 0,
  receipt_no TEXT,
  op_user INTEGER,
  created_at TEXT
);

-- ========== 事件流水 ==========
CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY,
  scope TEXT,                      -- ord / applicant / wo / refund
  ref_id INTEGER,
  ord_id INTEGER,
  actor INTEGER,
  actor_name TEXT,
  action TEXT,
  detail TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS seq (k TEXT PRIMARY KEY, v INTEGER DEFAULT 0);

-- ========== 表单字段库（官方申请表要填哪些格） ==========
-- 和材料库是并列的两层，不能混在一起：
-- 材料库回答「客户要交哪些件」（护照、照片、在职证明，十几项），
-- 字段库回答「官方表格上要填哪些格」（DS-160 有 72 格）。
-- 混成一张清单，客户端的材料清单会从 15 项炸成 87 项，直接不能用。
-- 两层靠 form_field.src（字段来源）挂钩：护照 OCR 能带出哪些格，一目了然。
CREATE TABLE IF NOT EXISTS formver (
  id INTEGER PRIMARY KEY,
  ver_no TEXT NOT NULL,            -- 6 位随机版本号
  country TEXT NOT NULL,
  visa_type TEXT,
  form_code TEXT,                  -- 官方表单代号，如 DS-160
  name TEXT NOT NULL,
  official_url TEXT,               -- 官方填表入口
  status TEXT DEFAULT 'draft',     -- draft 待发布 / published 已发布 / withdrawn 已撤回
  effective_at TEXT,
  active INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS form_field (
  id INTEGER PRIMARY KEY,
  formver_id INTEGER NOT NULL,
  section TEXT NOT NULL,           -- 官方表单的信息板块，如「1. 个人 1」
  name TEXT NOT NULL,              -- 字段名称（中英对照，原样保留官方措辞）
  fill_note TEXT,                  -- 填报说明及要求
  help_text TEXT,                  -- 官方 Help 原文
  notice TEXT,                     -- 官方重要提醒（AI 校验规则从这里长出来）
  src TEXT NOT NULL,               -- ocr 证件识别可得 / sys 系统带出 / ask 客户必答 / agent 专员操作
  src_from TEXT,                   -- 来源载体：护照资料页 / 身份证 / 在职证明 / 订单信息 …
  required INTEGER DEFAULT 1,      -- 是否必填
  covered TEXT,                    -- 现有采集表覆盖情况：full 已覆盖 / part 部分 / none 未覆盖
  risk INTEGER DEFAULT 0,          -- 高风险字段：填错会导致拒签或虚假陈述
  -- 是否由系统默认填「否」、不向客人提起（业务口径：唐美芳 2026-08-26）。
  -- 不等于 risk：拒签史、犯罪、兵役这类现行流程本来就不问客人，默认否；
  -- 但「是否去过美国」「是否持有过美国签证」常见答案就是「是」，答「是」还是加分项，
  -- 默认否等于把客人的加分项抹掉，所以这两题 risk=1 但 dft_no=0，照常让客人或销售填。
  dft_no INTEGER DEFAULT 0,
  -- 填写类型：决定客户端问卷渲染成什么控件。只标「文本」等于把渲染难题甩给前端。
  -- text 文本 / date 日期 / select 单选 / multi 多选 / bool 是否题
  -- / country 国家地区（走标准字典，不逐个列选项）/ file 文件上传
  -- / group 组合信息（父母信息、配偶全名及生日这类要展开成一组子项）
  -- / action 操作动作（审查、打印确认页——专员在官网做的事，不是输入框）
  ftype TEXT DEFAULT 'text',
  options TEXT,                    -- 单选 / 多选的选项值，JSON 数组
  sort INTEGER DEFAULT 0
);

-- ========== 填表任务：一个申请人一张待填的官方表 ==========
-- 业务口径（唐美芳）：DS-160 的字段模板由签证专员在 UOM 后台定义好，
-- 下单后客人可以自己填，也可以销售帮客人填，还可以生成链接分享给客人填。
-- 三个入口填的是同一张表，所以「表」必须是一条独立记录，不能挂在某个端的会话里。
--
-- 为什么要快照 formver_id：
--   官方表单会改版（新增社交媒体、新增网站/应用信息这类格子），运营在字段库里发新版本后，
--   已经下单、甚至已经填了一半的客人不能被改版波及——那等于让他重填。
--   所以下单时把当时生效的表单版本号钉在任务上，之后官网改版只影响新单。
--
-- 为什么要记 filled_by：
--   出了错（尤其 15 个高风险字段，填错按虚假陈述处理）要分得清责任是客户自填还是我司代填。
--   逐格的填写人记在 form_answer."by"，任务级的 filled_by 记最后一次实际动手的角色，
--   列表上一眼能看出「这单是客人自己填的还是销售替填的」。
--
-- 为什么状态要分 submitted / confirmed / official 三档：
--   官方签证网站（CEAC/ustraveldocs）没有公开 API，也不授权抓取，
--   系统只能做到「专员确认 → 人工到官网录入 → 回填 Application ID」。
--   submitted 是客户交卷、confirmed 是专员复核通过（此时才允许拿去官网录），
--   official 是官网确实录进去了并拿到了 Application ID。少一档就说不清卡在谁手上。
CREATE TABLE IF NOT EXISTS form_task (
  id INTEGER PRIMARY KEY,
  applicant_id INTEGER NOT NULL,   -- 一个申请人一张表
  formver_id INTEGER NOT NULL,     -- 下单时快照的表单版本，之后官网改版不影响已下单的人
  status TEXT DEFAULT 'wait',      -- wait 待填 / filling 填写中 / submitted 客户已提交待复核
                                   -- / confirmed 专员已确认 / official 已在官网录入
  filled_by TEXT,                  -- self 客人自己 / sales 销售代填 / agent 专员代填
  share_token TEXT,                -- 分享链接的随机串，免登录按它读写这张表
  share_expire TEXT,               -- 链接过期时间：分享出去的表单不能永久有效
  prefill_at TEXT,                 -- 最近一次 AI 预填时间
  submit_at TEXT,
  confirm_at TEXT,
  confirm_by TEXT,                 -- 复核的专员姓名，责任落到人
  official_app_id TEXT,            -- 专员在官网录完后回填的 DS-160 Application ID
  created_at TEXT,
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_form_task_applicant ON form_task(applicant_id);
CREATE INDEX IF NOT EXISTS ix_form_task_token ON form_task(share_token);

-- 一格一条。不用「一张表存成一个 JSON 大字段」，原因有三：
--   1) 要按格记来源（系统预填还是人工填）和填写人，JSON 里塞不下还查不动；
--   2) 官方表单改版后字段会增删，逐格存能按 field_id 对齐，JSON 得整体迁移；
--   3) 客户端是分板块分次保存的，逐格 upsert 不会互相覆盖。
CREATE TABLE IF NOT EXISTS form_answer (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL,
  field_id INTEGER NOT NULL,       -- 指向 form_field
  value TEXT,
  src TEXT DEFAULT 'manual',       -- auto 系统/证件信息预填 / manual 人工填
  "by" TEXT,                       -- 谁填的：客户 / 销售姓名 / 专员姓名 / 系统预填
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_form_answer ON form_answer(task_id, field_id);

-- 签证政策内容。产品回答「这条产品怎么卖」，政策回答「这个国家现在什么规矩」——
-- 后者跟供应商和报价无关，变动频率也高得多（免签开关、材料要求调整、领区变更），
-- 所以不挂在 product / sup_product 下，单独一张表由总部运营维护。
-- B 端和 C 端读同一份（唐美芳 2026-08-27：不止 C 端要看，B 端也要看），
-- 差别只在 scope 控制某条是否对客可见——有些口径只给门店销售看，不适合直接给消费者。
CREATE TABLE IF NOT EXISTS visa_policy (
  id INTEGER PRIMARY KEY,
  country TEXT NOT NULL,           -- 目的地；'*' 表示通用政策，不限国家
  kind TEXT NOT NULL,              -- free 免签 / landing 落地签 / evisa 电子签 / change 政策变动 / notice 办理提醒
  title TEXT NOT NULL,
  summary TEXT,                    -- 一句话摘要，列表与卡片上显示
  body TEXT,                       -- 正文，详情里展开
  stay TEXT,                       -- 免签/落地签的停留期，如「30 天」；其他类型留空
  effect_at TEXT,                  -- 生效日期
  source TEXT,                     -- 来源：使领馆公告 / 移民局官网 / 供应商通知，写清楚才敢对外发
  source_url TEXT,
  scope TEXT DEFAULT 'all',        -- all 两端都看 / b 仅门店销售可见
  status TEXT DEFAULT 'draft',     -- draft 草稿 / published 已发布
  pin INTEGER DEFAULT 0,           -- 置顶，重大变动用
  created_at TEXT,
  updated_at TEXT,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_policy_country ON visa_policy(country, status);

-- ============ 高频外键索引（2026-09-10 补）============
-- 这些列都是列表接口的过滤条件。缺了它们，工单台要为每位办签人全表扫一遍 mat
-- （9998 行 × 300 次），`/sup/orders` 单次 1.7–3.2 秒，高负载时页面直接渲染不出来。
-- 补完 0.5 秒。写入频率远低于列表读取频率，索引维护成本可以忽略。
CREATE INDEX IF NOT EXISTS ix_mat_applicant      ON mat(applicant_id);
CREATE INDEX IF NOT EXISTS ix_supp_applicant     ON supp(applicant_id, status);
CREATE INDEX IF NOT EXISTS ix_wo_suporg          ON wo(sup_org);
CREATE INDEX IF NOT EXISTS ix_wo_applicant       ON wo(applicant_id);
CREATE INDEX IF NOT EXISTS ix_wo_ord             ON wo(ord_id);
CREATE INDEX IF NOT EXISTS ix_wo_owner           ON wo(owner_user);
CREATE INDEX IF NOT EXISTS ix_applicant_ord      ON applicant(ord_id);
CREATE INDEX IF NOT EXISTS ix_pay_ord            ON pay(ord_id);
CREATE INDEX IF NOT EXISTS ix_payable_ord        ON payable(ord_id);
CREATE INDEX IF NOT EXISTS ix_refund_ord         ON refund(ord_id);
CREATE INDEX IF NOT EXISTS ix_event_obj          ON event(scope, ref_id);
CREATE INDEX IF NOT EXISTS ix_event_ord          ON event(ord_id);
CREATE INDEX IF NOT EXISTS ix_fullver_item_ver   ON fullver_item(fullver_id);
CREATE INDEX IF NOT EXISTS ix_form_field_ver     ON form_field(formver_id);
CREATE INDEX IF NOT EXISTS ix_pkg_sup_product    ON pkg(sup_product_id);
CREATE INDEX IF NOT EXISTS ix_sup_product_org    ON sup_product(org_id);
