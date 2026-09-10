# 附录 A · 页面路由清单

全部 138 个前端页面，由 `tools/prd_extract.py` 从 `web/js/v-*.js` 的 `VIEWS['…']` 注册处直接抽取，与运行中的系统一致。

路由写法：`#<端>:<页面>`，带记录 id 的页面在末尾追加 `/<id>`，例如 `#ops:review/12` 表示平台管理员打开 12 号产品的审核页。

## A.1 UOM · 平台管理员

*材料标准 · 产品审核 · 全平台* · 共 33 个页面

| 路由 | 菜单 / 页面名 | 实现文件 |
|---|---|---|
| `#ops:advance` | 垫付与缴费 | `web/js/v-uom.js` |
| `#ops:bill` | 供应商账单 | `web/js/v-settle3.js` |
| `#ops:board` | 国家签证办理中心 | `web/js/v-uom.js` |
| `#ops:countrycfg` | 国家展示配置 | `web/js/v-countrycfg.js` |
| `#ops:dash` | — | `web/js/v-ubk-ops.js` |
| `#ops:edit` | — | `web/js/v-ubkpkg.js` |
| `#ops:formfill` | — | `web/js/v-custform.js` |
| `#ops:forms` | 国家签证表模板 | `web/js/v-form.js` |
| `#ops:fullvers` | 国家送签材料库 | `web/js/core.js` |
| `#ops:fullvers` | 国家送签材料库 | `web/js/v-ubk-ops.js` |
| `#ops:hold` | — | `web/js/v-lead-fin.js` |
| `#ops:homecfg` | C 端首页配置 | `web/js/v-homecfg.js` |
| `#ops:load` | — | `web/js/v-lead-fin.js` |
| `#ops:mats` | — | `web/js/v-cust2.js` |
| `#ops:odetail` | — | `web/js/v-orddetail.js` |
| `#ops:orders` | 我的订单 | `web/js/v-lead-fin.js` |
| `#ops:payable` | 供应商结算 | `web/js/v-lead-fin.js` |
| `#ops:pkgs` | — | `web/js/v-ubkpkg.js` |
| `#ops:policies` | 签证政策内容 | `web/js/v-uom.js` |
| `#ops:prepay` | 供应商预付款 | `web/js/v-settle3.js` |
| `#ops:prod` | — | `web/js/v-ubk-ops.js` |
| `#ops:prodb` | — | `web/js/v-ubk-ops.js` |
| `#ops:prodc` | 签证产品管理（C端） | `web/js/v-ubk-ops.js` |
| `#ops:prods` | 签证产品管理（B端） | `web/js/v-ubk-ops.js` |
| `#ops:recv` | 收款查询 | `web/js/v-lead-fin.js` |
| `#ops:recvdetail` | — | `web/js/v-recvdetail.js` |
| `#ops:refund` | 退款查询 | `web/js/v-lead-fin.js` |
| `#ops:refunddetail` | — | `web/js/v-refunddetail.js` |
| `#ops:review` | — | `web/js/v-prodreview.js` |
| `#ops:samples` | 材料样例库 | `web/js/v-ubk-ops.js` |
| `#ops:srefund` | 供应商退款 | `web/js/v-settle3.js` |
| `#ops:wo` | — | `web/js/v-wodetail.js` |
| `#ops:xxx` | — | `web/js/core.js` |

## A.2 UOM · 签证操作专员

*工单履约* · 共 11 个页面

| 路由 | 菜单 / 页面名 | 实现文件 |
|---|---|---|
| `#uom:advance` | 垫付与缴费 | `web/js/v-uom.js` |
| `#uom:batch` | — | `web/js/v-uom.js` |
| `#uom:board` | 国家签证办理中心 | `web/js/v-uom.js` |
| `#uom:ceac` | — | `web/js/v-ceac.js` |
| `#uom:deliver` | — | `web/js/v-uom.js` |
| `#uom:formfill` | — | `web/js/v-custform.js` |
| `#uom:mats` | — | `web/js/v-cust2.js` |
| `#uom:odetail` | — | `web/js/v-orddetail.js` |
| `#uom:tasks` | DS-160 填表任务 | `web/js/v-task.js` |
| `#uom:tasks` | DS-160 填表任务 | `web/js/v-task.js` |
| `#uom:wo` | — | `web/js/v-wodetail.js` |

## A.3 UOM · 签证主管

*派单 · 审批* · 共 18 个页面

| 路由 | 菜单 / 页面名 | 实现文件 |
|---|---|---|
| `#lead:approve` | 退款审批 | `web/js/v-lead-fin.js` |
| `#lead:board` | 国家签证办理中心 | `web/js/v-uom.js` |
| `#lead:countrycfg` | 国家展示配置 | `web/js/v-countrycfg.js` |
| `#lead:formfill` | — | `web/js/v-custform.js` |
| `#lead:hold` | — | `web/js/v-lead-fin.js` |
| `#lead:homecfg` | C 端首页配置 | `web/js/v-homecfg.js` |
| `#lead:load` | — | `web/js/v-lead-fin.js` |
| `#lead:mats` | — | `web/js/v-cust2.js` |
| `#lead:odetail` | — | `web/js/v-orddetail.js` |
| `#lead:orders` | 我的订单 | `web/js/v-lead-fin.js` |
| `#lead:payable` | 供应商结算 | `web/js/v-lead-fin.js` |
| `#lead:recv` | 收款查询 | `web/js/v-lead-fin.js` |
| `#lead:recvdetail` | — | `web/js/v-recvdetail.js` |
| `#lead:refund` | 退款查询 | `web/js/v-lead-fin.js` |
| `#lead:refunddetail` | — | `web/js/v-refunddetail.js` |
| `#lead:reject` | — | `web/js/v-lead-fin.js` |
| `#lead:tasks` | DS-160 填表任务 | `web/js/v-task.js` |
| `#lead:wo` | — | `web/js/v-wodetail.js` |

## A.4 UOM · 财务

*收款 · 结算 · 退款* · 共 12 个页面

| 路由 | 菜单 / 页面名 | 实现文件 |
|---|---|---|
| `#fin:advance` | 垫付与缴费 | `web/js/core.js` |
| `#fin:advance` | 垫付与缴费 | `web/js/v-uom.js` |
| `#fin:bill` | 供应商账单 | `web/js/v-settle3.js` |
| `#fin:odetail` | — | `web/js/v-orddetail.js` |
| `#fin:orders` | 我的订单 | `web/js/v-lead-fin.js` |
| `#fin:payable` | 供应商结算 | `web/js/v-lead-fin.js` |
| `#fin:prepay` | 供应商预付款 | `web/js/v-settle3.js` |
| `#fin:recv` | 收款查询 | `web/js/v-lead-fin.js` |
| `#fin:recvdetail` | — | `web/js/v-recvdetail.js` |
| `#fin:refund` | 退款查询 | `web/js/v-lead-fin.js` |
| `#fin:refunddetail` | — | `web/js/v-refunddetail.js` |
| `#fin:srefund` | 供应商退款 | `web/js/v-settle3.js` |

## A.5 UBK 供应商门户

*签证资源方* · 共 16 个页面

| 路由 | 菜单 / 页面名 | 实现文件 |
|---|---|---|
| `#ubk:bill` | 供应商账单 | `web/js/v-settle3.js` |
| `#ubk:board` | 国家签证办理中心 | `web/js/v-ubkwo.js` |
| `#ubk:create` | — | `web/js/v-ubk-ops.js` |
| `#ubk:edit` | — | `web/js/v-ubkpkg.js` |
| `#ubk:formfill` | — | `web/js/v-custform.js` |
| `#ubk:fullvers` | 国家送签材料库 | `web/js/v-ubk-ops.js` |
| `#ubk:home` | 首页工作台 | `web/js/v-ubk-ops.js` |
| `#ubk:mats` | — | `web/js/v-cust2.js` |
| `#ubk:odetail` | — | `web/js/v-orddetail.js` |
| `#ubk:orders` | 我的订单 | `web/js/v-ubk-ops.js` |
| `#ubk:pkgs` | — | `web/js/v-ubkpkg.js` |
| `#ubk:product` | — | `web/js/v-ubk-ops.js` |
| `#ubk:products` | 签证产品管理 | `web/js/v-ubk-ops.js` |
| `#ubk:settle` | 预付款管理 | `web/js/v-settle3.js` |
| `#ubk:srefund` | 供应商退款 | `web/js/v-settle3.js` |
| `#ubk:wo` | — | `web/js/v-wodetail.js` |

## A.6 CSP 门店工作台

*门店销售 / 同业 · PC* · 共 17 个页面

| 路由 | 菜单 / 页面名 | 实现文件 |
|---|---|---|
| `#csp:book` | 签证频道 | `web/js/v-csp.js` |
| `#csp:book` | 签证频道 | `web/js/v-csp.js` |
| `#csp:book` | 签证频道 | `web/js/v-csp.js` |
| `#csp:create` | — | `web/js/v-csp.js` |
| `#csp:formfill` | — | `web/js/v-custform.js` |
| `#csp:home` | 首页工作台 | `web/js/v-csp.js` |
| `#csp:mats` | — | `web/js/v-cust2.js` |
| `#csp:odetail` | — | `web/js/v-orddetail.js` |
| `#csp:orders` | 我的订单 | `web/js/v-cust2.js` |
| `#csp:ordinfo` | — | `web/js/v-ordinfo.js` |
| `#csp:pdetail` | — | `web/js/v-csp.js` |
| `#csp:recv` | 收款查询 | `web/js/v-lead-fin.js` |
| `#csp:recvdetail` | — | `web/js/v-recvdetail.js` |
| `#csp:refund` | 退款查询 | `web/js/v-cust2.js` |
| `#csp:refund` | 退款查询 | `web/js/v-lead-fin.js` |
| `#csp:refunddetail` | — | `web/js/v-refunddetail.js` |
| `#csp:tasks` | DS-160 填表任务 | `web/js/v-task.js` |

## A.7 有米小程序

*门店销售移动端* · 共 15 个页面

| 路由 | 菜单 / 页面名 | 实现文件 |
|---|---|---|
| `#youmi:acquire` | 收客首页 | `web/js/v-youmi.js` |
| `#youmi:agent` | AI 签证助手 | `web/js/v-ymagent.js` |
| `#youmi:book` | 签证频道 | `web/js/v-youmi.js` |
| `#youmi:create` | — | `web/js/v-youmi.js` |
| `#youmi:customers` | 客户档案 | `web/js/v-youmi.js` |
| `#youmi:formfill` | — | `web/js/v-custform.js` |
| `#youmi:home` | 首页工作台 | `web/js/v-youmi.js` |
| `#youmi:mats` | — | `web/js/v-youmi.js` |
| `#youmi:me` | 我的 | `web/js/v-youmi.js` |
| `#youmi:odetail` | — | `web/js/v-youmi.js` |
| `#youmi:orders` | 我的订单 | `web/js/v-youmi.js` |
| `#youmi:ordinfo` | — | `web/js/v-ordinfo.js` |
| `#youmi:recv` | 收款查询 | `web/js/v-youmi.js` |
| `#youmi:refund` | 退款查询 | `web/js/v-youmi.js` |
| `#youmi:tasks` | DS-160 填表任务 | `web/js/v-youmi.js` |

## A.8 客户端

*H5 / 小程序 · 直客* · 共 16 个页面

| 路由 | 菜单 / 页面名 | 实现文件 |
|---|---|---|
| `#customer:addrs` | — | `web/js/v-cust3.js` |
| `#customer:form` | — | `web/js/v-custform.js` |
| `#customer:form` | — | `web/js/v-custform.js` |
| `#customer:list` | 签证产品 | `web/js/v-cust.js` |
| `#customer:mats` | — | `web/js/v-cust2.js` |
| `#customer:me` | 我的 | `web/js/v-cust.js` |
| `#customer:odetail` | — | `web/js/v-cust2.js` |
| `#customer:orders` | 我的订单 | `web/js/v-cust.js` |
| `#customer:ordinfo` | — | `web/js/v-ordinfo.js` |
| `#customer:refund` | 退款查询 | `web/js/v-cust2.js` |
| `#customer:result` | — | `web/js/v-cust2.js` |
| `#customer:service` | 在线客服 | `web/js/v-cust.js` |
| `#customer:shop` | 首页 | `web/js/v-cust.js` |
| `#customer:supp` | — | `web/js/v-cust2.js` |
| `#customer:track` | — | `web/js/v-cust.js` |
| `#customer:travelers` | — | `web/js/v-cust3.js` |
