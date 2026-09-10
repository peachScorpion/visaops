# VisaOps — 众信旅游签证业务系统

线上演示：https://opc.uuxlink.com/visaops/
需求规格说明书：`prd/index.html`（用浏览器直接打开，带侧栏目录、全文搜索与可勾选的验收清单）

---

## 一、跑起来（两步）

只依赖 Python 3.8+，**不需要装任何第三方包**（数据库是随包带的 SQLite）。

```bash
cd server
python3 app.py
```

打开 http://127.0.0.1:8820/visaops/

想换端口或访问前缀，改 `server/app.py` 顶部的 `PORT` / `PREFIX` 两行即可。

Linux 上重启用 `server/restart.sh`——它按「谁占着 8820 端口」来杀旧进程，
比 pgrep / pid 文件那套可靠（脚本注释里记了踩过的三个坑）。

**换到新机器、或数据库是从旧版本带过来的**，先补一次索引：

```bash
cd server && python3 mig_index.py
```

## 二、演示账号

密码统一 `888888`。

| 登录名 | 姓名 | 身份 | 进哪个端 |
|---|---|---|---|
| `c1` / `c2` | 张思远 / 李佳宁 | 客户 | 客户端 H5 |
| `sales` / `agent` | 王磊 / 周敏 | 门店销售 / 同业 | CSP 工作台 · 有米小程序 |
| `op1` / `op2` | 陈曦 / 赵岩 | 签证操作专员 | UOM 运营平台 |
| `lead` | 孙涛 | 签证主管 | UOM 运营平台 |
| `fin` | 刘颖 | 财务 | UOM 运营平台 |
| `ops` | 管理员 | 平台管理员（UOM 内超级管理员） | UOM 运营平台 |
| `sup` / `sup2` | 郑海 / 何静 | 供应商 | UBK 供应商门户 |
| `sup_a` / `sup_b` | 何书桓 / 林小满 | 供应商经办人 | UBK 供应商门户 |

## 三、目录

```
server/          后端（Python 标准库 + SQLite，无框架）
  app.py           全部 API，146 个接口都在这一个文件里，按角色操作链路分节
  form_task.py     官方申请表：预填引擎、进度与校验（逻辑重，单独拆出来）
  en_trans.py      中译英（官网填报用）
  form_import.py   官方字段表批量导入（xlsx / docx）
  schema.sql       建表语句（含索引）
  seed.py          初始化演示数据
  mig_*.py         历次结构迁移脚本，按时间顺序命名，跑过一次就不用再跑
  mig_index.py     补高频外键索引，换库或迁移后跑一次
  e2e.py           全链路端到端验收（13 个场景）
  visaops.db       SQLite 数据库（含演示数据，36 张表）
  restart.sh       重启脚本

web/             前端（原生 JS，无构建步骤，改完刷新即可）
  index.html       单页入口；`?v=NNN` 是缓存版本号，改了 js/css 就 +1
  js/core.js       公共库：菜单、角色、表格、弹窗、分页、筛选、图片上传
  js/v-*.js        按视图分文件，命名对应路由（v-ubkwo.js = UBK 签证办理中心）
  css/             样式
  uploads/         上传的材料文件

tools/
  scan.py          全站页面回归扫描：逐个路由渲染，抓 JS 报错 / 空白页 / 横向溢出
  prd_extract.py   从 app.py + visaops.db 抽 PRD 事实底稿
  prd_appendix.py  生成 PRD 附录 A/B/C
  prd_apidoc.py    146 条接口的一句话说明（手写，与代码分开维护）
  prd_build.py     Markdown → PRD 阅读器 HTML

prd/             需求规格说明书
  index.html       成品
  src/*.md         源文，改这里再跑 tools/prd_build.py 重新生成

docs/            参考资料（凯撒原型、H5 设计稿）
DESIGN.md        设计原则与凯撒 PRD 对比结论
```

## 四、改代码的两条规矩

**① 改完前端要把版本号 +1**，否则浏览器读的是缓存里的旧文件：

```bash
# web/index.html 里所有 ?v=478 改成 ?v=479
sed -i 's/?v=478/?v=479/g' web/index.html
```

**② 提交前跑两个验证**（都需要服务在跑）：

```bash
cd server && python3 e2e.py      # 全链路 API 验收，13 个场景
cd tools  && python3 scan.py     # 111 个路由逐个渲染，抓 JS 报错与空白页
                                  # 需要 playwright：pip install playwright && playwright install chromium
```

`e2e.py` 抓的是后端逻辑，`scan.py` 抓的是前端渲染，两个都过了再算改完。

**改接口返回值之前**，先 `grep -n 'if path == "…"' server/app.py` 确认自己改的那几行
确实属于目标接口——路由是一长串 `if path == …` 顺序匹配，相邻接口的返回字段长得很像，
改错行不会报错，只是字段没下发。

## 五、系统怎么理解

看 `prd/index.html` 第 0 册的这三节，够了：

- **0.3 五套端 · 八种身份**——谁在用、各自能看到什么
- **0.4 核心对象与引用链**——「产品 → 送签材料库 → 表模板」和「订单 → 办签人 → 工单」两条链，
  大部分"为什么这里查不到数据"看完就能自己回答
- **0.5 状态机总表**——全部状态码集中在这一节，页面上出现的状态文字都必须来自这里

第 3 册是签证办理中心（履约核心），末尾有 36 条验收清单，可以直接当回归测试用例。

## 六、已知约束

各国官方签证系统（CEAC / VFS / TLScontact / ustraveldocs）**均无公开 API、不授权抓取**，
以下五项永久保留人工，系统只做辅助（预填、提醒、留痕）：
**官方申请表提交 · 签证费缴纳 · 面签号抢占 · 材料递交 · 生物信息采集**。

对外不得承诺这五项的自动化。
