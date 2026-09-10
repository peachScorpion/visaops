# 附录 C · 数据字典

全部 36 张表，由 `tools/prd_extract.py` 直接读 `server/visaops.db` 的表结构生成。「行数」为演示环境当前数据量，供估算数据分布用。

## C.1 组织与账号

### `org` — 组织：门店 / 供应商 / 平台本部，账号挂在组织下决定数据边界

当前 5 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `kind` | TEXT | 非空 |
| `name` | TEXT | 非空 |
| `short` | TEXT | — |
| `license` | TEXT | — |
| `contract_no` | TEXT | — |
| `bank_acct` | TEXT | — |
| `status` | TEXT | 默认 `'active'` |
| `created_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |

### `user` — 账号：role 决定身份，org_id 决定可见范围

当前 13 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `login` | TEXT | 非空 |
| `pwd` | TEXT | 非空 |
| `name` | TEXT | 非空 |
| `phone` | TEXT | — |
| `email` | TEXT | — |
| `role` | TEXT | 非空 |
| `org_id` | INTEGER | — |
| `created_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |
| `owner_user` | INTEGER | — |

### `supp` — 供应商档案与资质

当前 131 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `no` | TEXT | 非空 |
| `applicant_id` | INTEGER | 非空 |
| `mat_ids` | TEXT | 默认 `'[]'` |
| `reason` | TEXT | — |
| `round` | INTEGER | 默认 `1` |
| `due_at` | TEXT | — |
| `status` | TEXT | 默认 `'open'` |
| `closed_at` | TEXT | — |
| `created_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |

## C.2 材料标准

### `formver` — 国家签证表模板（底层字典，只有启用/禁用）

当前 5 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `ver_no` | TEXT | 非空 |
| `country` | TEXT | 非空 |
| `visa_type` | TEXT | — |
| `form_code` | TEXT | — |
| `name` | TEXT | 非空 |
| `official_url` | TEXT | — |
| `status` | TEXT | 默认 `'draft'` |
| `effective_at` | TEXT | — |
| `active` | INTEGER | 默认 `0` |
| `created_at` | TEXT | — |
| `updated_at` | TEXT | — |

### `form_field` — 表模板下的题目定义

当前 181 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `formver_id` | INTEGER | 非空 |
| `section` | TEXT | 非空 |
| `name` | TEXT | 非空 |
| `fill_note` | TEXT | — |
| `help_text` | TEXT | — |
| `notice` | TEXT | — |
| `src` | TEXT | 非空 |
| `src_from` | TEXT | — |
| `required` | INTEGER | 默认 `1` |
| `covered` | TEXT | — |
| `risk` | INTEGER | 默认 `0` |
| `sort` | INTEGER | 默认 `0` |
| `dft_no` | INTEGER | 默认 `0` |
| `ftype` | TEXT | — |
| `options` | TEXT | — |
| `dft_val` | TEXT | — |
| `need_en` | INTEGER | 默认 `0` |
| `en_rule` | TEXT | — |

### `fullver` — 国家送签材料库清单版本，引用一份启用中的表模板

当前 9 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `ver_no` | TEXT | 非空 |
| `country` | TEXT | 非空 |
| `visa_type` | TEXT | — |
| `name` | TEXT | 非空 |
| `owner_org` | INTEGER | 默认 `0` |
| `from_id` | INTEGER | — |
| `status` | TEXT | 默认 `'draft'` |
| `effective_at` | TEXT | — |
| `active` | INTEGER | 默认 `0` |
| `created_at` | TEXT | — |
| `updated_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `formver_id` | INTEGER | — |

### `fullver_item` — 清单版本下的逐项材料（分人群、提供方式、必要性）

当前 148 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `fullver_id` | INTEGER | 非空 |
| `mat_name` | TEXT | 非空 |
| `attr` | TEXT | 非空 |
| `provide_way` | TEXT | 非空 |
| `copies` | INTEGER | 默认 `1` |
| `necessity` | TEXT | 非空 |
| `require_text` | TEXT | — |
| `sample_tpl_id` | INTEGER | — |
| `files` | TEXT | 默认 `'[]'` |
| `crowds` | TEXT | 非空 |
| `sort` | INTEGER | 默认 `0` |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `created_at` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |
| `by_us` | INTEGER | 默认 `0` |

### `sample_tpl` — 跨国复用的材料样例图

当前 5 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `code` | TEXT | — |
| `name` | TEXT | 非空 |
| `mat_name` | TEXT | 非空 |
| `files` | TEXT | 默认 `'[]'` |
| `created_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |
| `countries` | TEXT | 默认 `'[]'` |
| `visa_types` | TEXT | 默认 `'[]'` |

## C.3 产品与报价

### `product` — 平台产品目录，供应商上品时自动登记

当前 12 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `code` | TEXT | — |
| `country` | TEXT | 非空 |
| `visa_type` | TEXT | 非空 |
| `submit_city` | TEXT | 非空 |
| `name` | TEXT | 非空 |
| `accept_provinces` | TEXT | 默认 `'[]'` |
| `accept_note` | TEXT | — |
| `valid_type` | TEXT | — |
| `valid_num` | INTEGER | — |
| `entries` | TEXT | — |
| `stay_days` | INTEGER | — |
| `need_interview` | INTEGER | 默认 `0` |
| `need_fingerprint` | INTEGER | 默认 `0` |
| `fullver_id` | INTEGER | — |
| `status` | TEXT | 默认 `'draft'` |
| `updated_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `created_at` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `visa_cat` | TEXT | — |
| `stay_min` | INTEGER | — |
| `stay_max` | INTEGER | — |
| `stay_unit` | TEXT | 默认 `'day'` |

### `sup_product` — 供应商在售产品，挂 B/C 两端审核状态与上架开关

当前 12 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `product_id` | INTEGER | 非空 |
| `org_id` | INTEGER | 非空 |
| `name_suffix` | TEXT | — |
| `name` | TEXT | — |
| `feature` | TEXT | — |
| `addr_id` | INTEGER | — |
| `fullver_id` | INTEGER | — |
| `to_b` | INTEGER | 默认 `1` |
| `to_c` | INTEGER | 默认 `0` |
| `status` | TEXT | 默认 `'draft'` |
| `review` | TEXT | 默认 `'none'` |
| `review_note` | TEXT | — |
| `review_by` | TEXT | — |
| `review_at` | TEXT | — |
| `submit_at` | TEXT | — |
| `updated_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `created_at` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `svc_tags` | TEXT | — |
| `review_b` | TEXT | 默认 `'none'` |
| `review_b_note` | TEXT | — |
| `review_b_by` | TEXT | — |
| `review_b_at` | TEXT | — |
| `review_c` | TEXT | 默认 `'none'` |
| `review_c_note` | TEXT | — |
| `review_c_by` | TEXT | — |
| `review_c_at` | TEXT | — |
| `code` | TEXT | — |
| `vendor_code` | TEXT | — |
| `flow` | TEXT | — |
| `hero_img` | TEXT | 默认 `''` |
| `mat_custom` | TEXT | — |
| `subtitle` | TEXT | — |
| `share_text` | TEXT | — |
| `off_sale` | INTEGER | 默认 `0` |

### `pkg` — 套餐：同产品下的办理档位，各自有价与时长

当前 18 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `sup_product_id` | INTEGER | 非空 |
| `name` | TEXT | 非空 |
| `sup_code` | TEXT | — |
| `visa_fee` | REAL | 默认 `0` |
| `service_fee` | REAL | 默认 `0` |
| `settle_price` | REAL | 默认 `0` |
| `suggest_retail` | REAL | 默认 `0` |
| `lead_days` | INTEGER | 默认 `0` |
| `book_notice` | TEXT | — |
| `refund_insured` | INTEGER | 默认 `0` |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `created_at` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |
| `pkg_desc` | TEXT | — |
| `status` | TEXT | 默认 `'on'` |

### `addr` — 供应商收料地址

当前 9 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `owner_kind` | TEXT | 非空 |
| `owner_id` | INTEGER | 非空 |
| `region` | TEXT | 非空 |
| `detail` | TEXT | 非空 |
| `contact` | TEXT | 非空 |
| `phone` | TEXT | 非空 |
| `is_default` | INTEGER | 默认 `0` |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `created_at` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |

### `country_cfg` — 国家展示配置（C 端）

当前 7 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `country` | TEXT | 非空 · 默认 `''` |
| `hero_img` | TEXT | 默认 `''` |
| `card_img` | TEXT | 默认 `''` |
| `flag_img` | TEXT | 默认 `''` |
| `intro` | TEXT | 默认 `''` |
| `flow` | TEXT | 默认 `''` |
| `active` | INTEGER | 默认 `1` |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `created_at` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |

### `home_cfg` — C 端首页配置

当前 25 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `kind` | TEXT | 非空 |
| `title` | TEXT | — |
| `subtitle` | TEXT | — |
| `img` | TEXT | — |
| `link_kind` | TEXT | 默认 `'none'` |
| `link_val` | TEXT | — |
| `grp` | TEXT | — |
| `sort` | INTEGER | 默认 `0` |
| `active` | INTEGER | 默认 `1` |
| `created_by_name` | TEXT | — |
| `created_at` | TEXT | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |

### `visa_policy` — 签证政策内容

当前 10 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `country` | TEXT | 非空 |
| `kind` | TEXT | 非空 |
| `title` | TEXT | 非空 |
| `summary` | TEXT | — |
| `body` | TEXT | — |
| `stay` | TEXT | — |
| `effect_at` | TEXT | — |
| `source` | TEXT | — |
| `source_url` | TEXT | — |
| `scope` | TEXT | 默认 `'all'` |
| `status` | TEXT | 默认 `'draft'` |
| `pin` | INTEGER | 默认 `0` |
| `created_at` | TEXT | — |
| `updated_at` | TEXT | — |
| `updated_by` | TEXT | — |

### `chan_group` — 渠道组

当前 2 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `org_id` | INTEGER | 非空 |
| `name` | TEXT | 非空 |
| `members` | TEXT | 默认 `'[]'` |
| `updated_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `created_at` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |

### `chan_rule` — 加价策略

当前 2 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `group_id` | INTEGER | 非空 |
| `countries` | TEXT | 默认 `'[]'` |
| `base` | TEXT | 默认 `'settle'` |
| `mode` | TEXT | 默认 `'origin'` |
| `val` | REAL | 默认 `0` |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `created_at` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |

### `chan_pub` — 渠道投放

当前 6 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `group_id` | INTEGER | 非空 |
| `pkg_id` | INTEGER | 非空 |
| `on_shelf` | INTEGER | 默认 `0` |
| `settle_price` | REAL | — |
| `suggest_price` | REAL | — |
| `retail_price` | REAL | — |
| `agented` | INTEGER | 默认 `0` |
| `warn` | INTEGER | 默认 `0` |
| `updated_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `created_at` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |

## C.4 交易

### `ord` — 订单（VS-），gate 为收款放行开关

当前 336 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `no` | TEXT | 非空 |
| `channel` | TEXT | 非空 |
| `org_id` | INTEGER | — |
| `buyer_user` | INTEGER | — |
| `agent_user` | INTEGER | — |
| `product_id` | INTEGER | — |
| `sup_product_id` | INTEGER | — |
| `pkg_id` | INTEGER | — |
| `pax` | INTEGER | 默认 `1` |
| `amount` | REAL | 默认 `0` |
| `settle_amount` | REAL | 默认 `0` |
| `status` | TEXT | 默认 `'created'` |
| `gate` | INTEGER | 默认 `0` |
| `depart_date` | TEXT | — |
| `contact_name` | TEXT | — |
| `contact_phone` | TEXT | — |
| `contact_email` | TEXT | — |
| `recv_addr_id` | INTEGER | — |
| `settle_entity` | TEXT | — |
| `invoice_entity` | TEXT | — |
| `created_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |
| `info_deadline` | TEXT | 默认 `''` |
| `info_done_at` | TEXT | 默认 `''` |
| `product_name` | TEXT | — |

### `applicant` — 办签人，progress 为六步办理进展

当前 468 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `ord_id` | INTEGER | 非空 |
| `name_cn` | TEXT | 非空 |
| `name_en` | TEXT | — |
| `sex` | TEXT | — |
| `birth` | TEXT | — |
| `id_type` | TEXT | 默认 `'护照'` |
| `id_no` | TEXT | — |
| `id_expiry` | TEXT | — |
| `id_place` | TEXT | — |
| `nation` | TEXT | 默认 `'中国'` |
| `phone` | TEXT | — |
| `crowd` | TEXT | 默认 `'job'` |
| `state` | TEXT | 默认 `'normal'` |
| `progress` | TEXT | 默认 `'P1'` |
| `consulate_region` | TEXT | — |
| `appt_no` | TEXT | — |
| `appt_at` | TEXT | — |
| `appt_place` | TEXT | — |
| `appt_change` | INTEGER | 默认 `0` |
| `app_id` | TEXT | — |
| `barcode` | TEXT | — |
| `cgi_receipt` | TEXT | — |
| `fee_amount` | REAL | 默认 `0` |
| `batch_id` | INTEGER | — |
| `visa_result` | TEXT | — |
| `visa_no` | TEXT | — |
| `visa_valid_to` | TEXT | — |
| `visa_stay` | INTEGER | — |
| `reject_reason` | TEXT | — |
| `reject_cate` | TEXT | — |
| `liability` | TEXT | 默认 `'none'` |
| `ap_due` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `created_at` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |
| `info_done` | INTEGER | 默认 `0` |
| `info_at` | TEXT | 默认 `''` |

### `traveler` — 客户档案里的常用出行人

当前 50 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `owner_user` | INTEGER | 非空 |
| `name_cn` | TEXT | 非空 |
| `name_en` | TEXT | — |
| `sex` | TEXT | — |
| `birth` | TEXT | — |
| `id_type` | TEXT | 默认 `'护照'` |
| `id_no` | TEXT | — |
| `id_expiry` | TEXT | — |
| `id_place` | TEXT | — |
| `nation` | TEXT | 默认 `'中国'` |
| `phone` | TEXT | — |
| `crowd` | TEXT | 默认 `'job'` |
| `is_self` | INTEGER | 默认 `0` |
| `created_at` | TEXT | — |
| `updated_at` | TEXT | — |

## C.5 履约

### `wo` — 工单（VW-），一个办签人一张

当前 423 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `no` | TEXT | 非空 |
| `ord_id` | INTEGER | 非空 |
| `applicant_id` | INTEGER | 非空 |
| `owner_user` | INTEGER | — |
| `sup_org` | INTEGER | — |
| `sla_due` | TEXT | — |
| `status` | TEXT | 默认 `'open'` |
| `hold_reason` | TEXT | — |
| `created_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |
| `sup_owner` | INTEGER | — |

### `mat` — 工单下的材料项，逐项审核

当前 9998 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `applicant_id` | INTEGER | 非空 |
| `item_id` | INTEGER | — |
| `mat_name` | TEXT | 非空 |
| `attr` | TEXT | — |
| `provide_way` | TEXT | — |
| `copies` | INTEGER | 默认 `1` |
| `necessity` | TEXT | — |
| `require_text` | TEXT | — |
| `sample_url` | TEXT | — |
| `status` | TEXT | 默认 `'wait'` |
| `file_name` | TEXT | — |
| `file_url` | TEXT | — |
| `ai_msg` | TEXT | — |
| `reject_reason` | TEXT | — |
| `round` | INTEGER | 默认 `0` |
| `updated_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `created_at` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `by_us` | INTEGER | 默认 `0` |

### `form_task` — 官方申请表填报任务

当前 455 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `applicant_id` | INTEGER | 非空 |
| `formver_id` | INTEGER | 非空 |
| `status` | TEXT | 默认 `'wait'` |
| `filled_by` | TEXT | — |
| `share_token` | TEXT | — |
| `share_expire` | TEXT | — |
| `prefill_at` | TEXT | — |
| `submit_at` | TEXT | — |
| `confirm_at` | TEXT | — |
| `confirm_by` | TEXT | — |
| `official_app_id` | TEXT | — |
| `created_at` | TEXT | — |
| `updated_at` | TEXT | — |

### `form_answer` — 填报答案

当前 16926 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `task_id` | INTEGER | 非空 |
| `field_id` | INTEGER | 非空 |
| `value` | TEXT | — |
| `src` | TEXT | 默认 `'manual'` |
| `by` | TEXT | — |
| `updated_at` | TEXT | — |
| `value_en` | TEXT | — |

### `batch` — 送签批次

当前 145 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `no` | TEXT | 非空 |
| `submit_city` | TEXT | — |
| `submit_date` | TEXT | — |
| `courier` | TEXT | — |
| `status` | TEXT | 默认 `'open'` |
| `created_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |
| `deliver_way` | TEXT | 默认 `'courier'` |
| `express` | TEXT | — |

### `deliver` — 递交 / 交付记录

当前 130 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `no` | TEXT | 非空 |
| `ord_id` | INTEGER | 非空 |
| `addr_id` | INTEGER | — |
| `express` | TEXT | — |
| `express_no` | TEXT | — |
| `sign_name` | TEXT | — |
| `signed_at` | TEXT | — |
| `status` | TEXT | 默认 `'open'` |
| `created_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |

## C.6 资金

### `pay` — 收款单

当前 439 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `ord_id` | INTEGER | 非空 |
| `kind` | TEXT | 默认 `'in'` |
| `amount` | REAL | — |
| `method` | TEXT | — |
| `trade_no` | TEXT | — |
| `fin_confirmed` | INTEGER | 默认 `0` |
| `fin_user` | INTEGER | — |
| `fin_at` | TEXT | — |
| `created_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |
| `no` | TEXT | — |
| `cate` | TEXT | 默认 `'银行'` |
| `channel_name` | TEXT | — |
| `cust_type` | TEXT | 默认 `'个人客户'` |
| `item` | TEXT | 默认 `'团款'` |
| `arrive_amount` | REAL | — |
| `fee` | REAL | 默认 `0` |
| `payer_name` | TEXT | — |
| `pay_date` | TEXT | — |
| `arrive_date` | TEXT | — |
| `audit_status` | TEXT | 默认 `'wait'` |
| `voucher_no` | TEXT | — |
| `sale_note` | TEXT | — |
| `fin_note` | TEXT | — |
| `receipt_img` | TEXT | — |
| `acct_type` | TEXT | 默认 `'个人'` |
| `acct_no` | TEXT | — |

### `payable` — 应付供应商

当前 171 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `ord_id` | INTEGER | 非空 |
| `sup_org` | INTEGER | 非空 |
| `amount` | REAL | 默认 `0` |
| `status` | TEXT | 默认 `'open'` |
| `paid_at` | TEXT | — |
| `created_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |

### `prepay` — 供应商预付款

当前 8 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `no` | TEXT | 非空 |
| `sup_org` | INTEGER | 非空 |
| `pay_company` | TEXT | — |
| `ord_count` | INTEGER | 默认 `1` |
| `amount` | REAL | 默认 `0` |
| `apply_status` | TEXT | 默认 `'pending'` |
| `apply_at` | TEXT | — |
| `apply_by` | TEXT | — |
| `reject_by` | TEXT | — |
| `reject_at` | TEXT | — |
| `invoice_status` | TEXT | 默认 `'pending'` |
| `invoice_at` | TEXT | — |
| `pay_status` | TEXT | 默认 `'unpaid'` |
| `pay_at` | TEXT | — |
| `receipt_img` | TEXT | — |
| `created_at` | TEXT | — |

### `advance` — 垫付与缴费台账

当前 152 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `applicant_id` | INTEGER | 非空 |
| `item` | TEXT | — |
| `amount` | REAL | 默认 `0` |
| `receipt_no` | TEXT | — |
| `op_user` | INTEGER | — |
| `created_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |

### `refund` — 客户退款单

当前 136 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `no` | TEXT | 非空 |
| `ord_id` | INTEGER | 非空 |
| `applicant_ids` | TEXT | 默认 `'[]'` |
| `reason` | TEXT | — |
| `reason_cate` | TEXT | — |
| `amount` | REAL | 默认 `0` |
| `liability` | TEXT | 默认 `'none'` |
| `status` | TEXT | 默认 `'applying'` |
| `l1_user` | INTEGER | — |
| `l1_at` | TEXT | — |
| `fin_user` | INTEGER | — |
| `fin_at` | TEXT | — |
| `note` | TEXT | — |
| `created_at` | TEXT | — |
| `created_by` | INTEGER | — |
| `created_by_name` | TEXT | — |
| `updated_by` | INTEGER | — |
| `updated_by_name` | TEXT | — |
| `updated_at` | TEXT | — |

### `sup_refund` — 供应商退款

当前 3 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `no` | TEXT | 非空 |
| `ord_id` | INTEGER | 非空 |
| `sup_org` | INTEGER | 非空 |
| `refund_id` | INTEGER | — |
| `payable_id` | INTEGER | — |
| `settle_amount` | REAL | 默认 `0` |
| `amount` | REAL | 默认 `0` |
| `keep_amount` | REAL | 默认 `0` |
| `progress` | TEXT | — |
| `reason` | TEXT | — |
| `status` | TEXT | 默认 `'pending'` |
| `note` | TEXT | — |
| `confirm_at` | TEXT | — |
| `done_at` | TEXT | — |
| `created_at` | TEXT | — |
| `biz_pay_no` | TEXT | — |
| `recv_company` | TEXT | — |
| `invoice_exchange` | INTEGER | 默认 `0` |
| `invoice_status` | TEXT | — |
| `apply_status` | TEXT | 默认 `'pending'` |
| `apply_by` | TEXT | — |
| `ord_count` | INTEGER | 默认 `1` |

### `bill` — 供应商月度账单

当前 8 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `no` | TEXT | 非空 |
| `sup_org` | INTEGER | 非空 |
| `pay_company` | TEXT | — |
| `ord_count` | INTEGER | 默认 `1` |
| `total_amount` | REAL | 默认 `0` |
| `received_amount` | REAL | 默认 `0` |
| `claim_amount` | REAL | 默认 `0` |
| `apply_status` | TEXT | 默认 `'pending'` |
| `apply_at` | TEXT | — |
| `apply_by` | TEXT | — |
| `reject_by` | TEXT | — |
| `invoice_status` | TEXT | 默认 `'none'` |
| `invoice_at` | TEXT | — |
| `invoice_reject_by` | TEXT | — |
| `payable_amount` | REAL | 默认 `0` |
| `paid_amount` | REAL | 默认 `0` |
| `pay_status` | TEXT | 默认 `'unpaid'` |
| `pay_at` | TEXT | — |
| `created_at` | TEXT | — |

## C.7 系统

### `event` — 全量操作日志（谁在什么时候把什么改成了什么）

当前 13469 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `scope` | TEXT | — |
| `ref_id` | INTEGER | — |
| `ord_id` | INTEGER | — |
| `actor` | INTEGER | — |
| `actor_name` | TEXT | — |
| `action` | TEXT | — |
| `detail` | TEXT | — |
| `created_at` | TEXT | — |

### `seq` — 各类单号的自增序列

当前 7 行

| 字段 | 类型 | 约束 |
|---|---|---|
| `k` | TEXT | 主键 |
| `v` | INTEGER | 默认 `0` |
