# 星见塔罗（E:\project\taluopai）缺陷复核报告

- 复核人：verifier（独立复核，不轻信原审计结论）
- 复核时间：2026-11-03（初版）；修复复核：2026-11-04
- 代码基线：工作区 `package.json` v1.3.2；初版审计 HEAD `8e61200`，最终复核 HEAD `1b0ba65`（第二轮修复已提交；V-06 由 `b870511` 修复）
- 复核方式：只读审读 + 独立复现脚本（真实无头 Chrome / 本地 mock 上游 / Node vm 沙箱 / git 命令）
- 基线复跑：`npm test` 57 pass / 0 fail（2.15s）；`npm run test:browser` 34 pass / 0 fail（28.55s）——缺陷与全绿测试并存，见 V-24/V-25
- 约束遵守：除本报告 `bug-audit-report.md` 外未修改项目文件；未占用 8901 端口；未执行 git commit
- 脱敏说明：本报告公开版本已把上游网关主机、模型名与内部 CA 名称替换为 `<gateway-host>` / `<model-name>` / `<gateway-ca>`，其余内容未改动。
- 已知已修复、按要求不重复上报：牌面 WebP 失败回退 SVG（`app.js` 的 `loadCardArt`）

## 修复复核摘要（2026-11-04）

t6/t7/t8 针对 blocker/high 的修复已由复核人独立复跑（真实无头 Chrome、真实 CDP 鼠标事件、本地 mock 上游、随机端口），**不采信实现者结论**。结论：V-01/V-02/V-03/V-04/V-05/V-07 六项均**已修复**，未发现新增回归；V-06（版本库缺失）当时不在本轮修复范围，后由 commit `b870511` 修复；V-20（视图切换焦点）等 medium 已在第二轮修复（见下）。

| 编号 | 修复状态 | 复核命令 | 关键证据（2026-11-04） |
|---|---|---|---|
| V-01 | 已修复 | `node ui-verify.cjs review-overwrite`；`node review-null.cjs`；`node history-keep.cjs` | 只改行动后 `reviewAt` 保持 `2026-11-27T02:00:00.000Z`、`review` 原样保留；`reviewAt:null` 仍为 null；历史编辑器 `keep` 保持 2026-11-27，改 7 天后变 2026-11-04 且 review 保留。 |
| V-02 | 已修复 | `node ui-verify.cjs ime-question`；`ime-chat`；`node normal-enter.cjs` | 组合期 Enter 后仍停在 `step-listen`、`value:"nihao"`、`chatCalls 1→1`；普通 Enter 仍能进入 `step-draw`、追问 `1→2`。 |
| V-03 | 已修复 | `node chat-click-filled.cjs`；`node overflow-check.cjs`；`node chat-row-wide.cjs` | 320/360/390/414 按钮中心均命中 `BUTTON#ai-chat-send`，真实点击 `chatCalls 1→2`、`msgs 2`；320px `reportScrollWidth=220=clientWidth`、`btnRight=234.8 < reportRight=271`；481–1280 仍为 row 且按钮在报告内。 |
| V-04 | 已修复 | `node ui-verify.cjs focus-shuffle`；`focus-autodraw-goreveal`；`node save-focus-check.cjs` | 洗牌后焦点回 `btn-shuffle`；自动抽满后到 `btn-go-reveal`；保存长图后仍在 `btn-save-report`。 |
| V-05 | 已修复 | `node ui-verify.cjs clear-then-save` | 清空后保存新建记录，`action` 落盘，`reviewAt:null`，状态“已保存 · 不设置复盘”。 |
| V-07 | 已修复 | `node server-verify.cjs`；`node upstream-abort-probe.cjs`；`node client-abort-probe.cjs`；`node client-timeout-check.cjs`；`node normal-chat.cjs` | 上游 3 种断连 61–69ms 返回 502 `upstream_aborted`；客户端 60.1s 超时提示并显示重试；正常 `/api/chat` 200/19ms 且 usage 1 行；客户端中断 `upstreamAborted:true`、`usageLines:0`。 |
| V-06 | 当时未修复（后由 `b870511` 修复） | `git ls-files taluopai`；`git status --porcelain -- taluopai` | 当时只有 11 个跟踪文件、21 个未跟踪项；HEAD 为 v1.1.0。 |

回归基线：`npm test` 57 pass / 0 fail（2.18s）；`npm run test:browser` 34 pass / 0 fail（29.15s）。改动范围核查：`git status --porcelain -- taluopai` 无新增项目文件（除本报告）；`app.js`/`index.html`/`server.js`/`style.css` 的 mtime 为 2026-11-04 07:30–07:32，其余跟踪文件仍为 10/28–11/03。由于 HEAD 仍是 v1.1.0（见 V-06），`git diff` 无法隔离本轮改动，故以 mtime + 代码行审读为准；其中 `server.js` 与修复前副本（`%TEMP%\tarot-audit\server\envorder-1793717057355\server.js`）逐行 diff 仅 37 增 / 4 删，全部集中在 `handleChat` 的 V-07 修复，无夹带。修复后代码位置：V-01 `index.html:164-169`、`app.js:1797-1819,1895-1928`；V-02 `app.js:320-325,1676-1681`；V-03 `style.css:1484-1488,1490-1492,1514-1516,2603-2608`；V-04 `app.js:478-497,502,557,703,719,1295,1359`；V-05 `app.js:2404-2422`；V-07 `server.js:326-391`、`app.js:1450-1499`。

## 第二轮修复复核摘要（2026-11-04）

t10/t11/t12/t13 共 34 项修复由复核人独立复跑（真实无头 Chrome、真实 CDP 鼠标/键盘、本地 mock 上游、随机端口真实 server.js）。结论：**34 项全部 pass**；V-06 当时仍未修复（后由 `b870511` 修复）；V-26/V-27/V-38 已于 2026-11-04 由 t15 修复（见各条目「修复状态」）；未发现新增 blocker/high/medium 回归。

| 编号 | 复核结果 | 独立复核命令/证据 |
|---|---|---|
| V-08 | pass | t10-verify v08：新局 `msgs:[]`、`hasStale:false`；再发 NEWQ 时请求体 `hasOldUser:false,hasStaleMarker:false,hasNew:true`。 |
| V-09 | pass | t10-verify v09：搜索过滤后 `items:1,open:true,action:"DRAFT-ACTION-未保存",note:"DRAFT-NOTE-未保存"`，`stored:""`。 |
| V-10 | pass | t10-verify v10：3 条记录（含 `cards:{}`、`positions:[null]`）档案页正常打开、筛选 1 条、`exceptions:[]`。 |
| V-11 | pass | t10-verify v11：`cards:[null]` 重抽为 `w13`，`streak:3`，揭示 1 张、报告可见、`exceptions:[]`。 |
| V-12 | pass | verify-t11 v12：2 条记录、`duplicates:1`；t14-t11-e2e toast“已合并 2 条新档案，跳过 1 条重复记录。”、ids `["dup-1","other-1"]`。 |
| V-13 | pass | verify-t11 v13：仅 daily 保留 `dailyDate`；t14-t11-e2e 新建 daily 记录（`spreadId:"daily"`），trinity `hijack-1` 的 action 保持 `""`。 |
| V-14 | pass | verify-t11 v14：major 输出“新生、冒险、无限可能…”；minor 输出“热忱的开端、灵感爆发…”；t14-t11-e2e 学习页 `hasDun:true,hasComma:false`。 |
| V-15 | pass | t10-verify v15：AI 生成中保存 `downloads:0`、toast“星见还在编织解读…”；生成完成后 `downloads:1`。 |
| V-16 | pass | verify-t13：打开前后/滚轮后 `scrollY:2`，`overflow:hidden`；关闭后恢复 `auto`，`aria-expanded` 同步。 |
| V-17 | pass | ui-verify static-a11y：`chatRole:"log",chatLive:"polite",badgeRole:"status",badgeLive:"polite"`。 |
| V-18 | pass | ui-verify flip-aria：`role:"img",tabindex:"-1",ariaLabel:"已翻开：圣杯六 逆位",reportFocused:true`。 |
| V-19 | pass | ui-verify landscape-learning：800×360→201px、667×375→216px、568×320→161px（修复前 54/47/6）。 |
| V-20 | pass | t14-focus：afterNext H2「第二步」、afterRestart H2「第一步」、afterFlip `#reading-report`；afterDaily 焦点保留在 `#btn-daily`（未落 BODY；原报告“afterDaily H2”描述已按真实点击修正）。 |
| V-21 | pass | t10-verify v21：重开后 `armed:false`，单击后 `items:1`；removeItem 抛错时 `toast:"清空失败：…档案仍然保留。"`、`items:1`、`exceptions:[]`。 |
| V-22 | pass | t12-verify：上游 500 → 502 `{"error":"AI 网关暂时不可用"}`；连接失败 → 502 `{"error":"无法连接网关"}`；仅 `TAROT_DEBUG=1` 附带 upstream/detail。 |
| V-23 | pass | t12-verify：3MB 上游响应 → 502 `{"error":"网关响应过大"}`，随后 `/api/config` 仍 200。 |
| V-24 | pass | browser.test 35/35 pass；`assertClean` 不再全局白名单资源错误，新增容器级 `assertNoHorizontalOverflow`，`click` 改为真实 CDP 鼠标 + `elementFromPoint` 命中检查。 |
| V-25 | pass | browser.test 35/35 pass；键盘用例只在开始时聚焦，逐步断言 `#btn-go-reveal`→揭示区标题→卡牌→`#reading-report`。 |
| V-28 | pass | t12-verify：`99999/-1/1.5/Infinity/1e9` 均 exit 1，中文提示，stderr 无 `RangeError`/`at Server.listen`。 |
| V-29 | pass | t12-verify 19 PASS/1 SKIP；Windows 无法投递 SIGTERM，`shutdown()` 代码路径（close/closeIdleConnections/10s 超时/activeUpstreams）静态确认。 |
| V-30 | pass | t12-verify：`.env` 中 `TAROT_API_KEY` 与 `TAROT_USAGE_LOG` 均生效；load order 757/1461/1638。 |
| V-31 | pass | t12-verify：`GET` 200 `Cache-Control:no-cache`+ETag，`If-None-Match`→304，`HEAD` 200/56382。 |
| V-32 | pass | t12-verify：静态 200/304/HEAD 带 `nosniff/no-referrer/DENY`；API 另带 `Cache-Control:no-store`。 |
| V-33 | pass | t12-verify：HEAD config/usage 200，405 带 `Allow`，429 带 `Retry-After:60`。 |
| V-34 | pass | t12-verify：`Host: evil.example.com` → 403；`Host: 127.0.0.1:<port>` → 200。 |
| V-35 | pass | t12-verify：第 30 次 200、第 31 次 429（`Retry-After:60`）、其他会话 200；客户端中断 `usageLines:0`、服务仍 200。 |
| V-36 | pass | t12-verify：预置 5MB+ 账本后触发轮转，`.1` 生成、当前账本 1 行；`/api/usage` 200。 |
| V-37 | pass | 文档检查：`ASSET_SPEC.md:33/43/50` 统一“≤62KB（61,440B）”；`README.md:184` “27–62KB（61,440B 上限，实测最大 61,162 字节）”。 |
| V-39 | pass | verify-t11 v39：wrongApp/futureVersion 均 `incompatible:true` 且 reason 正确；无 app/version 的旧备份仍可导入 1 条。 |
| V-40 | pass | verify-t11 v40：`{totalCards:3,elementTotal:2,unknownCards:1}`；摘要“已收录 1 次占卜 · 3 张牌（其中 1 张无法识别，未计入元素分布）”。 |
| V-41 | pass | 临时副本：manifest 缺失/损坏/published 78 三种情况均 exit 1，提示明确，未写出任何产物。 |
| V-42 | pass | 全仓搜索 `taort` 仅剩本报告历史描述；`README.md`、`ASSET_SPEC.md`、`LICENSE.md`、`scripts/build-card-deck.cjs`、tests 均已改为 `tarot-cards`。 |
| V-43 | pass | ui-verify static-a11y：首个链接 `#main-content`（文字“跳到主内容”）；档案/图鉴/分享按钮 `aria-haspopup:"dialog"`、`aria-expanded:"false"`；verify-t13 跳过链接后 `active:"main-content"`。 |
| V-44 | pass | ui-verify static-a11y：档案条目 `role:"button"`、`tabindex:"0"`、`aria-expanded:"false"`；展开/收起同步。 |

**回归与端到端**：

- `npm run check`：exit 0。
- `npm test`：57 pass / 0 fail（2.46s）。
- `npm run test:browser`：35 pass / 0 fail（56.14s，含新增 320px 真实点击、键盘流程、档案容错、焦点样式用例）。
- 真实 `server.js`（`PORT=0` → 58045，离线模式）：二择一报告 5 个区块、每日一抽 1 张牌/报告/行动框可见、分享图片下载 `星见塔罗_每日一抽_2026-10-28.png`；`consoleErrors:[]`、`serverStderr:""`。
- 重叠改动：t10 的 `switchView` 焦点逻辑与 t11 的 daily 查找（`app.js:918`）互不破坏；t14-focus 与 t11 e2e（等待 `step-reveal` 激活）均通过。
- 说明：t10 自测的 `v20-focus` 脚本在翻牌前点 `#btn-restart`，因报告仍隐藏而报“元素尺寸为 0”；这是测试脚本问题，已用独立 `t14-focus.cjs` 复核，产品行为正常。

## 第三轮修复复核摘要（首轮收尾，2026-11-04）

t15 针对最后 3 条 low 的修复由复核人独立复跑（真实无头 Chrome、真实 CDP 鼠标、随机端口真实 server.js）。结论：**V-26/V-27/V-38 三项全部 pass**；V-06 已由 commit `b870511` 修复，第二轮改动已提交为 `1b0ba65`；未发现新增回归。

| 编号 | 复核结果 | 独立复核命令/证据 |
|---|---|---|
| V-26 | pass | `node t16-verify.cjs`：重启后 80ms 点击每日一抽 → `active:["step-reveal"]`、`revealCards:1`、`revealDisplay:"flex"`、`daily.cards:[{cardId:"c06",orientation:"reversed"}]`、`toast:""`、`cardPreserved:true`；700ms 后点击同样停在揭示页并保留 c06。browser.test 用例「每日一抽：重启过渡期内点击也能停在揭示页并显示牌面」ok 36。 |
| V-27 | pass | `node t16-verify.cjs`：手改配文后切隐私 `dirtyKept:true`；未手改时完整/私密分别自动生成 `cleanChanged:true`；`resetExists:false`（页面无“恢复默认配文”按钮，任务未要求必须存在）。`ui-verify.cjs share-caption` → `before/after:"我自己改过的配文"`、`overwritten:false`；browser.test 用例「分享：切换隐私选项不覆盖用户编辑的配文」ok 37。 |
| V-38 | pass | `node t16-verify.cjs`：学习页 m00（大阿卡纳）/w01/c01（小阿卡纳）与揭示页 m00 的 `alt` 均等于 manifest；`v38-fallback`（manifest alt 置空）→ `愚人原创牌面`；`v38-no-manifest`（拦截 manifest.js）→ `noArt:true`、牌面框隐藏、文字回退可见“原创牌面绘制中 · 以文字牌义为准”，`exceptions:[]`；`v38-alt.cjs` 复核 m00 一致。 |

**回归与端到端**：

- `npm run check`：exit 0。
- `npm test`：57 pass / 0 fail（2.23s）。
- `npm run test:browser`：37 pass / 0 fail（60.21s，含新增 V-26/V-27 用例与 V-38 alt 断言）。
- 真实 `server.js`（`PORT=0` → 50882，离线模式）：二择一报告 5 个区块、每日一抽 1 张牌/报告/行动框可见、分享图片下载 `星见塔罗_每日一抽_2026-10-28.png`（配文 125 字、预览可见）；`consoleErrors:[]`、`serverStderr:""`。
- 改动范围：复核人未改任何代码；`git status --porcelain -- taluopai` 仅 `app.js`、`tests/browser.test.cjs`、本报告为 ` M`，另有团队目录 `.agent-teams/` 与无关作业目录 `hw/` 未跟踪；未 commit。

## 第三轮修复复核摘要（第二轮审计，2026-11-04）

t6–t9 对第九节 25 条缺陷的修复由复核人独立复跑（真实无头 Chrome、真实 CDP 点击、随机端口真实 `server.js`、临时副本构建），未采信实现者结论。结论：**23 条已修复、2 条未修复（V2-08 环境 ACL、V2-25 性能优化项）**；另发现 1 条新缺陷 **V3-01（medium，多列长图 `details` 重叠）**，该条已于同日由 t11 修复并经 t12 独立复核通过。未发现回归。

| 编号 | 复核结果 | 独立证据（摘要） |
|---|---|---|
| V2-01 | pass | 真实点击导出三块正文恢复（亮像素 94,170 → 312,307）；多列 `details` 重叠另列 V3-01，t11 修复后复核通过 |
| V2-02 | pass | 6s 慢渲染 mock 两次点击 `isActive:true`，文件 554,833 B / 630,858 B |
| V2-03 | pass | Host 403、cross-site 403、text/plain 415、正常 200；scheme 未比较 |
| V2-04 | pass | 凯尔特 1862×8101 = 15.08M px < 16M，正文可读 |
| V2-05 | pass | CA 缺失/目录/空文件 fail-closed；insecure 开关显式；正常 CA 200 |
| V2-06 | pass | `gateway-ca.crt` 为根 CA，自校验与真实叶证书校验均 OK |
| V2-07 | pass | 200/2000 边界 emoji well-formed，导入/JSON 往返无 U+FFFD |
| V2-08 | 未修复（环境） | ACL 仍为 Authenticated Users:(I)(M)；README 已加 icacls 指引 |
| V2-09 | pass | interrupted→visibilitychange、suspended→pageshow 各恢复一次，禁用后不恢复 |
| V2-10 | pass | 删除 `inert` 后 aria-hidden/tabindex 降级与恢复正确 |
| V2-11 | pass | 390×844 下 8 个输入均为 16px（user-question 17.6px） |
| V2-12 | pass | 四个弹窗标题均为 H2 且 aria-labelledby 正确 |
| V2-13 | pass | role=status / aria-live=polite 生效 |
| V2-14 | pass | CSP 304 字符，页面 violation 为空 |
| V2-15 | pass | 轮换 x-session-id 第 31 次仍 429 |
| V2-16 | pass | vendor/card 目录 html/txt 404，正常资源 200 |
| V2-17 | pass | junction/硬链接 404，正常文件 200 |
| V2-18 | pass | http 网关启动打印明文 Bearer 警告 |
| V2-19 | pass | SRI sha384 + crossOrigin；file:// 跳过；VERSIONS.md 存在 |
| V2-20 | pass | `--force` exit 1 且 manifest 不变 |
| V2-21 | pass | 两次构建字节一致，manifest 83e3ce57…，78 张均有 bytes/sha256；零字节 exit 1 |
| V2-22 | pass | 非法/未来记录不计入，未知牌不进元素分布 |
| V2-23 | pass | 损坏 JSON → toast + 空状态 |
| V2-24 | pass | 新增 5 条 reduceMotion:false 用例 |
| V2-25 | 未修复（低） | 冷开/翻牌/保存长任务与第二轮一致 |
| V3-01 | 已修复 | 多列导出关闭的 details 正文不再绘制；打开态仍绘制（t11 修复，t12 复核） |

**回归与端到端**：

- `npm run check`：exit 0。
- `npm test`：58 pass / 0 fail（2.5s）。
- `npm run test:browser`：41 pass / 0 fail（93.2s，含 t6 新增 4 条）。
- 真实 `server.js`（`PORT=0` → 57053）冒烟 ok：index/css/config/usage/webp 200，缺失/穿越 404，安全头齐全。
- 脚本：`%TEMP%\tarot-audit2\verify\round3-{server,browser,data}.cjs`、`probe-export-real.cjs`、`round3-share.cjs`、`round3-celtic-export.cjs`、`round3-celtic-clone.cjs`；JSON/截图在 `artifacts\`。
- 改动范围：复核人只改本报告；工作区其余修改为 t6–t9 的修复，未 commit。

## 一、结论摘要

四个审计任务共上报 **52 条**发现。本次逐条独立复现后：

| 来源 | 上报数 | 确认 | 驳回 |
|---|---:|---:|---:|
| t1-frontend | 11 | 11 | 0 |
| t2-server | 13 | 13 | 0 |
| t3-data | 13 | 12 | 1（D12） |
| t4-browser | 15 | 14 | 1（B-15） |
| **合计** | **52** | **50** | **2** |

按同一根因合并去重后，最终 **44 条** confirmed 缺陷：

| 级别 | 数量 | 说明 |
|---|---:|---|
| blocker | 1 | 数据丢失：保存行动会静默清空已有复盘并改写复盘日期 |
| high | 6 | 输入法误提交、窄屏 AI 追问不可用、键盘焦点丢失、清空档案后无法保存、版本库缺失、AI 代理永久挂起 |
| medium | 18 | 状态串局、坏数据打不开档案页、导入重复、每日一抽复用、AI 生成中保存长图、可访问性等 |
| low | 19 | 配置、缓存、安全响应头、文案/资产规格、测试可维护性等 |

**最终修复状态（2026-11-04 第三轮复核后）**：44 条 confirmed 中，41 条已在第一/二轮修复并复核通过；最后 3 条 low（V-26/V-27/V-38）本轮复核全部 pass，至此 **44/44 全部关闭**。V-06 已由 commit `b870511` 修复（工作区 278 个跟踪文件，其中 `assets/` 244、`tests/` 14），第二轮改动已提交为 `1b0ba65`。仍未修复项：无。

**第二轮审计（覆盖缺口，2026-11-04）**：在首轮 44 条全部关闭后，针对第六节 10 项缺口独立复核 t1–t4 的第二轮发现，新增 **25 条**（high 1、medium 7、low 17），无 blocker、无回归；第六节 7 项关闭、3 项部分关闭。最高优先级为 V2-01（长图导出丢失全部 AI 解读正文，真实 Chrome 点击保存复现）。详见第九节。**修复复核（2026-11-04）**：t6–t9 修复后 25 条中 23 条已修复、2 条仍未修复（V2-08 环境 ACL、V2-25 性能优化项）；新增 V3-01（medium，多列长图 `details` 重叠），已由 t11 修复并经 t12 复核通过。回归 `npm run check` exit 0、`npm test` 58/58、`npm run test:browser` 41/41。

**最需要先处理的三件事**：

1. **V-01（blocker）**：用户在阅读页保存“行动”时，已有复盘内容会被无提示清空，复盘日期被强制改成 +7 天。这是本次唯一确认的数据丢失级缺陷。**（已修复，2026-11-04 复核）**
2. **V-06（high）**：当前 v1.3.2 工作区基本没有纳入 git。clone 仓库只能得到 v1.1.0（4 个脚本、115 行 server.js、无 78 张牌面资产），无法复现 README 描述的功能。**（已修复，commit b870511）**
3. **V-07（high）**：上游网关在响应中途断开时，`/api/chat` 会永久挂起且不取消上游请求；客户端 `await r.json()` 也没有超时保护，页面会一直等待。**（已修复，2026-11-04 复核）**

## 二、严重级别定义

- **blocker**：数据丢失、安全漏洞、核心流程不可用。
- **high**：明确的功能错误，或明显的安全/可用性风险。
- **medium**：边界条件、体验、可访问性或测试有效性问题，正常主流程多数可绕过。
- **low**：文案、样式、配置、可维护性、非关键语义问题。

## 三、总览表

> 位置均为工作区文件行号；“来源”为原审计编号；合并项在详情中说明。
> 已修复项的“位置”为修复前缺陷位置；第一轮修复后代码位置见“修复复核摘要”，第二轮修复后代码位置见“第二轮修复复核摘要”及各详情末尾的复核证据。

| 编号 | 标题 | 级别 | 状态 | 位置 | 来源 |
|---|---|---|---|---|---|
| V-01 | 保存行动无条件重写复盘日期并清空已有复盘 | blocker | 已修复（2026-11-04） | app.js:1749,1844,1848-1851；index.html:164-168 | D1 / FE-03 |
| V-02 | 输入法组合期按 Enter 直接提交问题/追问 | high | 已修复（2026-11-04） | app.js:321-325,1628-1630 | FE-01 / B-03 |
| V-03 | ≤414px 时 AI 追问发送按钮被裁出报告容器 | high | 已修复（2026-11-04） | style.css:1484-1510；index.html:143-149 | B-01 |
| V-04 | 按钮自禁用导致键盘焦点掉到 BODY 且不恢复 | high | 已修复（2026-11-04） | app.js:484-485,590,693-694,1266 | B-02 |
| V-05 | 清空档案后当前报告的行动/复盘永远无法保存 | high | 已修复（2026-11-04） | app.js:2334-2350,1836-1842 | FE-05 |
| V-06 | 当前 v1.3.2 工作区未纳入 git，clone 只能得到 v1.1.0 | high | 已修复（commit b870511） | .gitignore、package.json:3、index.html:311-318 | S1 |
| V-07 | 上游响应中途断开时 /api/chat 永久挂起且不取消上游 | high | 已修复（2026-11-04） | server.js:334-357；app.js:1420-1438 | S2 |
| V-08 | AI 追问无会话校验，旧局回复串入新局并污染上下文 | medium | 已修复（2026-11-04） | app.js:1590-1625 | FE-02 |
| V-09 | 历史搜索/筛选重建列表，丢弃未保存的笔记编辑 | medium | 已修复（2026-11-04） | app.js:2289-2292,1877-2012 | FE-04 |
| V-10 | 单条畸形档案导致整个档案页打不开 | medium | 已修复（2026-11-04） | app.js:1655-1678,1915,1935；features.js:120-121 | D2 |
| V-11 | 每日一抽不校验 daily.cards 元素，[null] 直接抛错 | medium | 已修复（2026-11-04） | app.js:2385-2389 | D3 |
| V-12 | 导入同文件重复 id 不去重，编辑第二条改写第一条 | medium | 已修复（2026-11-04） | features.js:202；app.js:2318-2326,1734-1744 | D4 |
| V-13 | 每日一抽按 dailyDate 复用记录，非每日记录被劫持且 AI 文本不落盘 | medium | 已修复（2026-11-04） | app.js:1801-1811,875-878,1561；features.js:176 | D5 |
| V-14 | 小阿卡纳“关键词”实为整句，学习页/分享文案不一致 | medium | 已修复（2026-11-04） | cards.js:238-307；app.js:1097,2193-2205,2458 | D6 |
| V-15 | AI 生成中可保存报告长图，图片含占位文案 | medium | 已修复（2026-11-04） | app.js:1265-1330；对比 2509 | FE-11 / B-04 |
| V-16 | 弹窗打开时背景仍可滚动 | medium | 已修复（2026-11-04） | app.js:2260-2274,2309,2314-2315,2324-2327 | B-05 |
| V-17 | AI 回复/状态变化无 aria-live 播报 | medium | 已修复（2026-11-04） | index.html:41,149 | B-06 |
| V-18 | 翻牌后卡牌仍为 button、aria-label 未更新、焦点未转移 | medium | 已修复（2026-11-04） | app.js:953-971,1147 | B-07 |
| V-19 | 横屏/矮视口学习列表被压到 6–54px | medium | 已修复（2026-11-04） | style.css:2638-2654 | B-08 |
| V-20 | 视图切换/重开后焦点落到 BODY | medium | 已修复（2026-11-04） | app.js:376-407,927-930,1337-1380,2414-2416 | FE-06 / B-09 |
| V-21 | 清空档案二次确认状态跨面板保留 + removeItem 未捕获 | medium | 已修复（2026-11-04） | app.js:2334-2350 | FE-08 / FE-09 / B-12 |
| V-22 | 上游错误体/连接错误详情原样透传 | medium | 已修复（2026-11-04） | server.js:343-348,353,357 | S3 |
| V-23 | 上游响应无大小上限 | medium | 已修复（2026-11-04） | server.js:334-338,341,353 | S4 |
| V-24 | 溢出断言被 overflow-x:hidden 掩盖，click 绕过命中测试 | medium | 已修复（2026-11-04） | tests/browser.test.cjs:31,68-90,257；tests/browser/harness.cjs:496-540 | B-13 |
| V-25 | 键盘测试逐步 focus() 掩盖焦点丢失 | medium | 已修复（2026-11-04） | tests/browser.test.cjs:645-728 | B-14 |
| V-26 | 重启后 500ms 内点每日一抽，牌被渲染到隐藏区 | low | 已修复（2026-11-04） | app.js:2414-2416 | FE-07 |
| V-27 | 切换分享隐私会覆盖用户编辑的配文 | low | 已修复（2026-11-04） | app.js:2518-2521 | FE-10 |
| V-28 | 无效 PORT 抛出未捕获 RangeError 栈 | low | 已修复（2026-11-04） | server.js:25,448 | S5 |
| V-29 | 无优雅停机，SIGTERM 中断请求 | low | 已修复（2026-11-04） | server.js:448-464 | S6 |
| V-30 | .env 中 TAROT_USAGE_LOG/TAROT_GATEWAY_URL 被忽略 | low | 已修复（2026-11-04） | server.js:33,37-51,65,72 | S7 |
| V-31 | 牌面 7 天 immutable 缓存但 URL 无版本 | low | 已修复（2026-11-04） | server.js:416-417；manifest.js:3,12,17 | S8 |
| V-32 | 缺少安全响应头 | low | 已修复（2026-11-04） | server.js:114-119,412-418 | S9 |
| V-33 | HEAD/405/429 语义不完整 | low | 已修复（2026-11-04） | server.js:365-380,277-279 | S10 |
| V-34 | /api/config 无 Host 校验（DNS rebinding 可读配置） | low | 已修复（2026-11-04） | server.js:365-367 | S11 |
| V-35 | 限流共享单 IP 桶，客户端中断仍计费 | low | 已修复（2026-11-04） | server.js:153-173,277-279,334-357 | S12 |
| V-36 | usage 账本无轮转，每次全量读 | low | 已修复（2026-11-04） | server.js:221-230,237-267 | S13 |
| V-37 | 资产规格 60KB/62KB 矛盾 | low | 已修复（2026-11-04） | ASSET_SPEC.md:33,43,50；README.md:184 | D7 |
| V-38 | manifest.alt 从未使用 | low | 已修复（2026-11-04） | app.js:16,789,2173；manifest.js:16 | D8 |
| V-39 | 导入不校验 app/version | low | 已修复（2026-11-04） | features.js:151-203 | D9 |
| V-40 | 洞察未知牌计入 totalCards 不计 elementTotal | low | 已修复（2026-11-04） | insights.js:102,117,125-137,221 | D10 |
| V-41 | 旧构建脚本缺 manifest 时仍可写入 v0.1.0/6 张清单 | low | 已修复（2026-11-04） | scripts/build-card-assets.cjs:456-476,508 | D11 |
| V-42 | 资产目录拼写 taort-cards | low | 已修复（2026-11-04） | README.md:189；scripts/build-card-deck.cjs:25 等 | D13 |
| V-43 | 顶栏按钮缺 aria-haspopup/expanded，无跳转链接 | low | 已修复（2026-11-04） | index.html:28,43-44,185；app.js:2276-2280；style.css:63-82 | B-10 |
| V-44 | 档案条目 article[tabindex] 无语义/aria-expanded | low | 已修复（2026-11-04） | app.js:2117-2118,2214 | B-11 |

## 四、详细发现

### V-01【blocker】保存行动无条件重写复盘日期并清空已有复盘

- **位置**：`app.js:1749`（`reviewOffset.value = '7'`）、`app.js:1844`（`reviewDateFromOffset(Number(reviewOffset.value))`）、`app.js:1848-1851`（清空 review）；`index.html:164-168`（下拉框只有 7/30/不设置，没有“保持当前”）。
- **触发条件**：某条档案已经设置过复盘日期和复盘内容，用户再次打开该次占卜，只修改“行动”后点击“保存行动与复盘”。
- **预期 vs 实际**：预期只更新 action，未主动改复盘时间就保持原复盘；实际每次打开都把下拉框重置为“7 天后”，保存时无条件把 `reviewAt` 改成当前时间 +7 天，并把已有 `review.outcome/text` 清空。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" review-overwrite`
- **证据**（2026-10-28 固定时钟）：
  - 保存前：`{offset:"7", status:"已设复盘 · 2026/11/27", reviewAt:"2026-11-27T02:00:00.000Z", review:{outcome:"helpful",text:"已经复盘过：有帮助"}}`
  - 只填行动并保存后：`{status:"已保存 · 2026/11/4 复盘", action:"只改行动，不动复盘", reviewAt:"2026-11-04T02:00:00.000Z", review:{outcome:"",text:"",updatedAt:null}}`
  - 另一组：`reviewAt:null` 的记录保存行动后也被写成 `2026-11-04T02:00:00.000Z`，状态变为“已保存 · 2026/11/4 复盘”。
- **影响面**：所有在阅读页保存行动的档案；用户写过的复盘文字被永久覆盖，无法恢复。历史档案编辑器（`app.js:1962-1966,1998`）已有 `keep` 选项和“仅当 offset !== 'keep' 才重算”的正确逻辑，阅读页没有复用。
- **修复建议**：给 `#review-offset` 增加 `keep` 选项并按 `record.reviewAt` 选中；保存时仅当用户主动改选才重算 `reviewAt`；删除 `app.js:1848-1851` 的自动清空逻辑。可复用历史编辑器的实现。
- **修复状态：已修复（2026-11-04 复核）**。`index.html:164-169` 新增 `keep` 选项；`app.js:1797-1819` 按 `reviewAt` 动态生成“保持 …”并默认选中；`app.js:1895-1928` 仅在 `reviewOffset.value !== 'keep'` 时重算 `reviewAt`，且删除了清空 `review` 的逻辑。
- **复核证据**：`review-overwrite` 保存后 `{offset:"keep",status:"已保存 · 2026/11/27 复盘",reviewAt:"2026-11-27T02:00:00.000Z",review:{outcome:"helpful",text:"已经复盘过：有帮助"}}`；`review-null` 保存后 `reviewAt:null`、状态“已保存 · 不设置复盘”；`history-keep` 保持 2026-11-27，改 7 天后 2026-11-04 且 review 保留。

### V-02【high】输入法组合期按 Enter 直接提交问题/追问

- **位置**：`app.js:321-325`（问题输入框）、`app.js:1628-1630`（AI 追问输入框）。
- **触发条件**：中文/日文输入法正在组词（候选词未确认）时按 Enter。
- **预期 vs 实际**：预期 Enter 只确认候选词，不提交；实际没有 `e.isComposing || e.keyCode === 229` 守卫，直接调用 `btnNextStep.click()` / `sendChatMessage()`。
- **复现**：
  - `node "%TEMP%\tarot-audit\verify\ui-verify.cjs" ime-question`
  - `node "%TEMP%\tarot-audit\verify\ui-verify.cjs" ime-chat`
  - 原始脚本：`%TEMP%\tarot-audit\frontend\repro-ime.cjs`、`repro-ime2.cjs`
- **证据**：
  - 问题框：CDP `Input.imeSetComposition` 输入 `nihao` 后派发真实 Enter，捕获 `{key:"Enter",keyCode:13,isComposing:true}`；900ms 后 `value:"nihao"`、`active:["step-draw"]`、`listenOpacity:"0"`——半截拼音被当成问题提交。
  - 追问框：`chatCalls 1→2`，消息区出现 `ai-msg user :: woxiangwen`，输入框被清空。
- **影响面**：所有中文输入法用户；问题被截断、追问被误发，且会消耗一次 AI 请求。
- **修复建议**：两处统一改为 `if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;`。
- **修复状态：已修复（2026-11-04 复核）**。`app.js:320-325` 与 `app.js:1676-1681` 均已加入该守卫。
- **复核证据**：`ime-question` 组合期 Enter 后 `{value:"nihao",active:["step-listen"],drawActive:false,listenOpacity:"1"}`；`ime-chat` `callsBefore:1,callsAfter:1`；`normal-enter` 普通 Enter 仍进入 `step-draw`、追问 `1→2`。

### V-03【high】≤414px 时 AI 追问发送按钮被裁出报告容器

- **位置**：`style.css:1484-1510`（`.ai-chat-input-row` 为 `display:flex; gap:10px`，input `flex:1` 但没有 `min-width:0`，`.glow-button` 为 `flex-shrink:0` 且宽约 150px）；`index.html:143-149`；`app.js:1590-1630`。
- **触发条件**：视口宽度 ≤414px（320/360/390/414 均复现），报告卡片内出现 AI 追问区。
- **预期 vs 实际**：预期输入框和“发送”按钮都在报告卡片内可见可点；实际按钮左缘从 x=302 开始、右缘到 452，而报告右边界只有 256–350，按钮被 `#reading-report { overflow-x: hidden }` 裁掉。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" narrow-chat`；或 `node "%TEMP%\tarot-audit\verify\overflow-check.cjs"`。
- **证据**：
  - 320×568：按钮 `{left:302,right:452,width:150}`，报告 `right:256`，行 `clientWidth:102/scrollWidth:350`，按钮中心 `elementFromPoint(377,349)=null`，真实鼠标点击后 `chatCalls 1→1`；正文 `.block-text` 仅 102px 宽，长 AI 文本高度 12585px。
  - 360×640：报告 `right:296`，中心命中 `null`，真实点击不发送。
  - 390×844：报告 `right:326`，只有按钮左缘约 24px 可命中，中心仍 `null`。
  - 414×896：按钮仍 `left:302,right:452`，行 `clientWidth:196`，仍被裁切。
  - 独立复测（320px）：`docScrollWidth=320`、`reportScrollWidth=402/clientWidth=220`、`btnRight=452`、`body overflow-x:hidden`。
- **影响面**：手机窄屏用户无法使用 AI 追问；长文本可读性也明显受损。
- **修复建议**：`.ai-chat-input-row { flex-wrap: wrap; }`、input 加 `min-width: 0`；≤480px 改为上下堆叠（按钮整行）；同时减小 `.reading-block` 在窄屏的左右内边距。
- **修复状态：已修复（2026-11-04 复核）**。`style.css:1484-1488` 加 `flex-wrap:wrap`；`1490-1492` 加 `min-width:0`；`1514-1516` 让按钮内 `span` 不拦截命中；`2603-2608` ≤480px 改为纵向堆叠并减小 `.reading-block` 内边距。
- **复核证据**：`chat-click-filled` 四宽度中心均命中 `BUTTON#ai-chat-send`，真实点击 `1→2`、`msgs:2`、输入框清空；`overflow-check` 320px `reportScrollWidth=220/clientWidth=220`、`btnRight=234.8 < reportRight=271`；`chat-row-wide` 481–1280 仍为 row 且按钮在报告内。

### V-04【high】按钮自禁用导致键盘焦点掉到 BODY 且不恢复

- **位置**：`app.js:484-485`（洗牌时 `btnShuffle.disabled = true; btnAutoDraw.disabled = true`）、`app.js:590`（抽牌时禁用洗牌）、`app.js:693-694`（自动抽牌时禁用两个按钮）、`app.js:1266`（保存长图时禁用保存按钮）。
- **触发条件**：键盘用户聚焦“洗牌”“自动抽牌”或“保存报告”后按 Enter/Space，按钮在事件处理中被设为 `disabled`。
- **预期 vs 实际**：预期动画/生成结束后焦点回到原按钮或下一个合理控件；实际浏览器把焦点移到 `BODY`，按钮重新启用后也不恢复，键盘用户需要重新 Tab 很多次。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" focus-shuffle`、`focus-autodraw-goreveal`。
- **证据**：
  - 洗牌前 `activeElement=BUTTON#btn-shuffle`；点击后立即 `BODY`，2.2s 后仍 `BODY`，需重新 Tab 多次才回到洗牌。
  - 自动抽牌前 `BUTTON#btn-auto-draw`；点击后、抽牌完成后、揭示按钮出现后均为 `BODY`；从 BODY 需重新 Tab 多次才能到“揭示天机”。
  - 保存长图前 `BUTTON#btn-save-report`；点击后 `BODY`，需重新 Tab 多次。
- **影响面**：键盘/开关设备用户完成一次洗牌或抽牌后失去位置，核心流程可操作性显著下降。
- **修复建议**：在禁用前记录 `document.activeElement`，在 `finally`/定时器结束后 `focus()` 回原按钮；或改用 `aria-disabled="true"` + 事件内 guard，避免真正 `disabled` 夺焦。
- **修复状态：已修复（2026-11-04 复核）**。`app.js:478-497` 新增 `captureFocusForReturn`/`restoreFocusAfterAction`；调用点 `app.js:502/557`（洗牌）、`703`（抽牌）、`719`（自动抽牌）、`1295/1359`（保存长图）。
- **复核证据**：`focus-shuffle` 2.2s 后焦点回 `BUTTON#btn-shuffle`；`focus-autodraw-goreveal` 抽满后到 `BUTTON#btn-go-reveal`；`save-focus-check` 保存后仍在 `BUTTON#btn-save-report`（`downloads:1`）。揭示天机切换后的焦点丢失（V-20）已在第二轮修复（见 V-20）。

### V-05【high】清空档案后当前报告的行动/复盘永远无法保存

- **位置**：`app.js:2334-2350`（清空只 `localStorage.removeItem(HISTORY_KEY)`，未重置 `currentHistoryId`/`historySaved`/`lastReadingSections`）；`app.js:1836-1842`（保存时因 `currentHistoryId` 仍非空而跳过重建，随后 `updateHistoryRecord` 找不到记录）。
- **触发条件**：完成一次占卜并生成报告 → 打开档案面板清空全部档案 → 回到报告填写行动 → 点击保存。
- **预期 vs 实际**：预期清空后仍能把当前报告重新保存为一条新档案；实际 `updateHistoryRecord` 找不到 id，提示“暂时没有找到对应档案，请稍后再试。”，行动和复盘都没有落盘。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" clear-then-save`
- **证据**：清空前 `saved count=1`；清空后 `stored=null, items=0`；保存后仍 `stored=null`，toast 为“暂时没有找到对应档案，请稍后再试。”，`reflectionStatus` 为空。
- **影响面**：清空档案是一个显式操作，但会静默破坏当前报告的唯一保存路径；用户以为保存成功（按钮可点），实际丢失行动/复盘。
- **修复建议**：清空成功后重置 `currentHistoryId=null`、`historySaved=false`、`lastReadingSections` 保留；或在保存失败时自动 `saveHistory(lastReadingSections, false)` 重建一条。
- **修复状态：已修复（2026-11-04 复核）**。`app.js:2404-2422` 在 `removeItem` 后重置 `currentHistoryId=null; historySaved=false;`。
- **复核证据**：`clear-then-save` 清空后保存新建记录 `id:"1793152801647-qhlq12"`，`action:"清空后仍想保存的行动"`，`reviewAt:null`，状态“已保存 · 不设置复盘”。

### V-06【high】当前 v1.3.2 工作区未纳入 git，clone 只能得到 v1.1.0

- **位置**：`package.json:3`（1.3.2）、`index.html:311-318`（8 个脚本）、`server.js`（464 行）、`.gitignore`；git 仓库 `E:\project`。
- **触发条件**：任何人 clone 仓库或按 README 部署。
- **预期 vs 实际**：预期版本库包含运行当前页面所需的脚本、78 张牌面、清单与测试；实际 `git ls-files taluopai` 只有 11 个文件，`assets/`、`audio.js`、`insights.js`、`learning.js`、`scripts/`、`tests/*.cjs`、`tests/browser/`、`tests/fixtures/` 全部未跟踪；HEAD 的 `package.json` 是 1.1.0、`index.html` 只加载 4 个脚本、`server.js` 只有 115 行。
- **复现**：
  ```powershell
  cd E:\project
  git ls-files taluopai
  git status --porcelain -- taluopai
  git show HEAD:taluopai/package.json | Select-String '"version"'
  git show HEAD:taluopai/index.html | Select-String '<script src'
  git show HEAD:taluopai/server.js | Measure-Object -Line
  ```
- **证据**：
  - `git ls-files` 仅 11 个文件；`git status` 为 10 个 ` M` + 21 个 `??`。
  - HEAD `package.json` 为 `"version": "1.1.0"`；HEAD `index.html` 只有 `vendor/html2canvas.min.js`、`cards.js`、`features.js`、`app.js` 四个 script；HEAD `server.js` 115 行。
  - 工作区 `package.json` 1.3.2、`index.html` 8 个 script、`server.js` 464 行（`[System.IO.File]::ReadAllLines` 计数）。
  - `git check-ignore` 对 `assets/`、`audio.js`、`tests/server.test.cjs` 无输出——不是被忽略，而是从未 `git add`。
- **影响面**：发布/回滚/协作都会丢失当前功能；新环境无法运行 AI 代理、音效、洞察、学习页和 78 张牌面。
- **修复建议**：将 `assets/`、`audio.js`、`insights.js`、`learning.js`、`scripts/`、`tests/*.cjs`、`tests/browser/`、`tests/fixtures/`、`tests/reading-quality-cases.json` 纳入版本库并提交；CI 增加 `git status --porcelain` 必须为空的检查。
- **修复状态（2026-11-04）：已修复（commit b870511）**。提交后 `git ls-files taluopai` 为 278 个文件（其中 `assets/` 244、`tests/` 14）；HEAD `1b0ba65` 的 `package.json` 为 1.3.2、`index.html` 加载 8 个脚本、`server.js` 640 行。第二轮修复已提交为 `1b0ba65`；当前工作区仅 `app.js`、`tests/browser.test.cjs` 与本报告有未提交修改（t15 修复与复核记录），无运行时文件缺失。

### V-07【high】上游响应中途断开时 /api/chat 永久挂起且不取消上游

- **位置**：`server.js:334-357`（只监听 `upRes.on('data')`/`on('end')`，没有 `upRes.on('error')`/`on('aborted')`，也没有 `res.on('close')` 去 `destroy` 上游）；`app.js:1420-1438`（`AbortController` 定时器在 `finally` 中清除，只覆盖到响应头，随后 `await r.json()` 无超时）。
- **触发条件**：上游返回 200 + `Content-Length` 后只发送部分 body 就断开（网络抖动、网关重启、代理超时）。
- **预期 vs 实际**：预期立即 502（或至少 120s 后 504）并释放 socket；实际 `upRes` 的 `end` 永远不会触发，`/api/chat` 不返回，客户端 `r.json()` 也永远不 resolve。
- **复现**：`node "%TEMP%\tarot-audit\verify\server-verify.cjs"`（S2 场景：mock 上游 200 + `Content-Length:1000` + 8 字节后 `destroy`）。
- **证据**：
  - 客户端 8008ms 主动超时（原审计客户端 130,029ms 才放弃）；期间 `/api/config` 仍 200，服务端 stderr 只有 TLS 警告。
  - 代码中 `up.on('error')` 只处理“请求发出阶段”的错误，不处理响应流中断；`up.on('timeout')` 在 peer 已断开后也不会再触发。
- **影响面**：一次上游抖动就会永久占用一个请求/连接；客户端页面卡在“星见正在感应星轨”，只能刷新。
- **修复建议**：`upRes.on('error', ...)` 与 `upRes.on('aborted', ...)` 只调用一次 502；`res.on('close', () => up.destroy())`；`upRes.setTimeout(120000, () => { respond(504,...); up.destroy(); })`；客户端给 `r.json()` 也加超时/AbortSignal。
- **修复状态：已修复（2026-11-04 复核）**。`server.js:326-391` 增加 `responded/upstreamDone/clientGone` 与 `abortUpstream()`，补 `upRes` 的 `error/aborted/close`、`upRes.setTimeout(120000)`、客户端 `aborted/close` 处理；`app.js:1450-1499` 将 60s 超时覆盖到 `await r.json()`。
- **复核证据**：`server-verify` S2 从 8008ms 客户端超时变为 50ms 返回 `502 {"error":"upstream_aborted"}`；`upstream-abort-probe` 三种断连 61–69ms 502、正常 8ms 200；`client-abort-probe` `upstreamAborted:true`、`usageLines:0`、服务仍存活；`client-timeout-check` 60.1s 后 toast“AI 暂时未能回应…”且重试按钮可见；`normal-chat` 正常 200/19ms、usage 1 行。

### V-08【medium】AI 追问无会话校验，旧局回复串入新局并污染上下文

- **位置**：`app.js:1590-1625`（`sendChatMessage` 没有像 `enhanceReadingWithAI` 那样在 `await` 后比较 `readingSession`）。
- **触发条件**：在某一局发出 AI 追问后，未等回复就重开/进入新局。
- **预期 vs 实际**：预期旧局回复被丢弃；实际旧回复被追加到新局的 `#ai-chat-messages`，并把旧局的 user/assistant 消息写进 `chatHistory`，下一次请求会带上旧局内容。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" stale-chat`（mock 把第 2 次 `/api/chat` 的文本标记为 `STALE-MARKER-`，延迟 1800ms；发送后 150ms 重启并进入新局）。
- **证据**：
  - 新局消息区出现 `ai-msg xingjian :: 【牌1】\nSTALE-MARKER-1...`（`bodyHasStale:true`）。
  - 新局再发 `NEWQ` 时，`lastChatBody` 同时包含 `DELAY-ME 第一局的追问`、`STALE-MARKER-`、`NEWQ`（`hasOldUser:true, hasStaleMarker:true, hasNew:true`）。
- **影响面**：新局解读被旧局内容污染；用户看到不属于当前牌阵的回复。
- **修复建议**：进入时 `const session = readingSession;`，`await AI.chat` 后 `if (session !== readingSession) return;`；`chatHistory` 的写入也放在该守卫之后。
- **修复状态（2026-11-04）**：已修复。`app.js:1711`（`sendChatMessage` 进入时 `const session = readingSession;`）、`app.js:1726`（`await AI.chat` 后 `if (session !== readingSession) return;`，不展示也不写 `chatHistory`）、`app.js:1734`（catch 内同样守卫，旧局失败不提示）、`app.js:1737-1744`（finally 仅在 `session === readingSession` 时复位 `chatSending`/按钮/焦点）；另在 `app.js:930-933`（`beginReveal`）新局重置 `chatSending=false` 与发送按钮，避免旧请求卡住新局。验证：`node "%TEMP%\tarot-audit\verify\t10-verify.cjs" v08-stale-chat` → 新局 `msgs:[]`、`hasStaleReply:false`；再发 NEWQ 时请求体 `hasOldUser:false, hasStaleMarker:false, hasNew:true`。
- **第二轮独立复核（2026-11-04）**：pass。t10-verify v08：新局 `msgs:[]`、`hasStale:false`；再发 NEWQ 时请求体 `hasOldUser:false,hasStaleMarker:false,hasNew:true`。

### V-09【medium】历史搜索/筛选重建列表，丢弃未保存的笔记编辑

- **位置**：`app.js:2289-2292`（搜索/分类/复盘筛选的 `input`/`change` 直接 `renderHistory`）；`app.js:1877-2012`（`historyList.innerHTML = ''` 全量重建）。
- **触发条件**：在档案列表展开一条记录，编辑“行动/笔记/复盘”但未点保存，然后在搜索框输入或切换筛选。
- **预期 vs 实际**：预期过滤只隐藏不匹配项，保留已输入内容；实际整表重建，未保存的编辑全部丢失。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" search-discard-edits`
- **证据**：编辑后搜索“第一”，结果 `{itemCount:1, open:false, actionValue:"", storedActions:""}`。
- **影响面**：用户输入的长笔记可能在一次搜索中丢失。
- **修复建议**：过滤时只切换 `hidden` 类，不重建 DOM；或重建前按 `record.id` 暂存 textarea/select 草稿并在渲染后回填。
- **修复状态（2026-11-04）**：已修复（草稿暂存方案）。`app.js:1779`（`const historyDrafts = new Map()`）、`app.js:1783-1797`（`readHistoryDraft`/`applyHistoryDraft`，按 `[data-history-field]` 收集 action/note/outcome/offset/review 与展开态）、`app.js:2096-2099`（重建前把当前 DOM 草稿按 `data-history-id` 收进 Map）、`app.js:2205-2210`（渲染后按 id 回填，并监听 `input`/`change` 记忆草稿）、`app.js:2215`（折叠/展开也记忆草稿）、`app.js:2234-2237`（保存成功后 `historyDrafts.delete(id)` 再重建）。验证：`node "%TEMP%\tarot-audit\verify\t10-verify.cjs" v09-search-draft` → 搜索过滤后 `action:"DRAFT-ACTION", note:"DRAFT-NOTE", open:true`。
- **第二轮独立复核（2026-11-04）**：pass。t10-verify v09：搜索过滤后 `items:1,open:true,action:"DRAFT-ACTION-未保存",note:"DRAFT-NOTE-未保存"`，`stored:""`。

### V-10【medium】单条畸形档案导致整个档案页打不开

- **位置**：`app.js:1655-1658`（`isHistoryRecord` 只校验 id）、`app.js:1660-1678`（`loadHistory` 不做形状归一化）、`app.js:1915`（`(item.cards || []).map`）、`app.js:1935`（`(sections.positions || []).map`）；`features.js:120-121`（搜索路径同样直接 map）。
- **触发条件**：localStorage 中存在一条 `cards` 不是数组、`sections.positions` 不是数组或含 `null` 的记录（旧版本数据、手工修改、异常导入）。
- **预期 vs 实际**：预期跳过/归一化坏记录并提示；实际渲染抛 TypeError，`renderHistory` 中断，档案面板保持 `hidden`，整页打不开。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" history-bad-cards`、`history-bad-positions`；直接调用见 `node "%TEMP%\tarot-audit\verify\data-verify.cjs"` 的 `D2-filterHistory-throws`。
- **证据**：
  - `cards:{}` + `sections:{positions:{}}` → `TypeError: (item.cards || []).map is not a function at app.js:1915:49 ... renderHistory (app.js:1902:14)`；`historyItems=0, panelHidden=true`。
  - `sections.positions:[null]` → `TypeError: Cannot read properties of null (reading 'name') at app.js:1935:75`。
  - `filterHistory` 对 `[null]` 同样抛 `Cannot read properties of null (reading 'position'/'name')`。
- **影响面**：一条坏记录就让全部档案不可见；导入路径已做净化，但旧数据/手工修改仍可触发。
- **修复建议**：`loadHistory` 归一化 `cards`/`sections.positions` 为数组并过滤 null；`renderHistory` 单条 `try/catch`；`filterHistory` 加 `Array.isArray` 与元素判空。
- **修复状态（2026-11-04）**：已修复。`app.js:1813-1830`（新增 `normalizeHistoryRecord`：`cards` 非数组→`[]` 并过滤非字符串/非对象；`sections` 非对象→`{}`；`positions` 非数组→`[]` 并过滤 null；`synthesis`/`blessing` 取字符串；`review` 非对象→`{}`）、`app.js:1832-1852`（`loadHistory` 返回 `valid.map(normalizeHistoryRecord)`）、`app.js:2090-2093`（`filterHistory` 包 try/catch，失败回退全量）、`app.js:2109-2115`（单条渲染 try/catch 并计 `renderFailures`）、`app.js:2126-2130`（`Array.isArray(item.cards)` / `Array.isArray(sections.positions)` 保护）、`app.js:2093-2096`（摘要追加「另有 N 条记录无法显示」）。验证：`node "%TEMP%\tarot-audit\verify\t10-verify.cjs" v10-bad-history` → 3 条含坏记录的档案仍可打开、筛选后 1 条、`exceptions:[]`。
- **第二轮独立复核（2026-11-04）**：pass。t10-verify v10：3 条记录（含 `cards:{}`、`positions:[null]`）档案页正常打开、筛选 1 条、`exceptions:[]`。

### V-11【medium】每日一抽不校验 daily.cards 元素，[null] 直接抛错

- **位置**：`app.js:2385-2389`（`daily.cards.map(saved => ({ card: ALL_TAROT_CARDS.find(card => card.id === saved.cardId), ... }))`，异常点 2387）。
- **触发条件**：`xingjian_daily` 中 `cards` 数组含 `null` 或非对象元素。
- **预期 vs 实际**：预期忽略无效条目并重抽；实际 `saved.cardId` 抛 TypeError，`openDailyReading` 中断，按钮无反应。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" daily-null`
- **证据**：`active:["step-listen"]`、`revealCards:0`、daily 仍为 `[null]`；异常 `TypeError: Cannot read properties of null (reading 'cardId') at app.js:2387:70 ... openDailyReading (app.js:2386:41)`。
- **影响面**：当天每日一抽完全不可用，且不会自动修复存储。
- **修复建议**：`daily.cards.filter(saved => saved && typeof saved === 'object')` 后再 map；无效时走重抽分支并重写 daily。
- **修复状态（2026-11-04）**：已修复。`app.js:2669-2672`（`const savedCards = Array.isArray(daily.cards) ? daily.cards.filter(saved => saved && typeof saved === 'object' && typeof saved.cardId === 'string') : [];`）、`app.js:2672-2686`（`reusedToday` 标记：仅在 `daily.date === today && savedCards.length === 1` 且 `ALL_TAROT_CARDS.find` 命中时复用，否则走原重抽分支并重写 `xingjian_daily`）。验证：`node "%TEMP%\tarot-audit\verify\t10-verify.cjs" v11-daily-null` → `daily.cards` 含 `null` 时重抽为 `[{cardId:"w10",orientation:"upright"}]`、`streak:3`、`reportVisible:true`、`exceptions:[]`。
- **第二轮独立复核（2026-11-04）**：pass。t10-verify v11：`cards:[null]` 重抽为 `w13`，`streak:3`，揭示 1 张、报告可见、`exceptions:[]`。

### V-12【medium】导入同文件重复 id 不去重，编辑第二条改写第一条

- **位置**：`features.js:202`（`prepareHistoryImport` 保留重复 id）、`app.js:2318-2326`（只与已有档案 id 去重，不处理文件内重复）、`app.js:1734-1744`（`updateHistoryRecord` 用 `findIndex` 只命中第一条）。
- **触发条件**：导入的 JSON 中两条记录 id 相同。
- **预期 vs 实际**：预期文件内重复也跳过并如实提示；实际两条都写入，toast 说“跳过 0 条重复记录”，编辑第二条时实际改的是第一条。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" import-duplicate`
- **证据**：导入后 `count=2`，两条都是 `dup-1`（“第一条”“第二条”）；toast 为“已合并 2 条新档案，跳过 0 条重复记录。”；编辑第二条写入 `action:"写第二条的行动"` 后，第一条的 action 变成该值。
- **影响面**：导入后档案内容错位，用户以为在编辑新记录。
- **修复建议**：`prepareHistoryImport` 内用 `Set` 对文件内 id 去重；或导入时给重复 id 重新生成唯一 id；toast 使用真实跳过数。
- **修复状态（2026-11-04）**：已修复。`features.js:166-234`（`prepareHistoryImport`）新增 `seenIds` 集合（180 行）与 `duplicates` 计数（196 行），文件内重复 id 跳过并计入返回值；`app.js:2587-2599` 用 `prepared.duplicates` 计算 `skippedDuplicates`（2592 行），toast（2599 行）显示真实跳过数。验证：`prepareHistoryImport({history:[dup,dup,other]})` → `{records:2, duplicates:1}`；导入两条同 id 后 localStorage 仅 1 条，toast 显示“跳过 1 条重复记录”。
- **第二轮独立复核（2026-11-04）**：pass。verify-t11 v12：2 条记录、`duplicates:1`；t14-t11-e2e toast“已合并 2 条新档案，跳过 1 条重复记录。”、ids `["dup-1","other-1"]`。

### V-13【medium】每日一抽按 dailyDate 复用记录，非每日记录被劫持且 AI 文本不落盘

- **位置**：`app.js:1801-1811`（`saveHistory` 在 `currentSpread.id === 'daily'` 时按 `dailyDate` 找记录，不校验 `spreadId`；找到后 `!updateExisting` 直接 return，不写入）、`app.js:875-878`（`beginReveal` 同样只按 `dailyDate` 找）、`app.js:1561`（AI 成功后 `saveHistory(..., true, historySaved)`，`historySaved` 为 false）、`features.js:176`（导入接受任意记录的 `dailyDate`）。
- **触发条件**：存在一条 `spreadId` 不是 `daily`、但 `dailyDate` 等于今天的记录（导入或旧数据）。
- **预期 vs 实际**：预期每日一抽只复用 `spreadId === 'daily'` 的记录；实际会劫持该记录，只写入 action/review，不新增每日记录；AI 在线时解读文本也不会写回该记录。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" daily-hijack`
- **证据**：
  - 本地路径：`count=1`，记录 `hijack-1` 仍为 `spreadId:"trinity"`，`action:"HIJACKED-ACTION"`，`ai:false`。
  - AI 路径：`count=1`，`hijack-1` 仍 `ai:false`，`synthesis` 仍是旧值“旧串联”。
- **影响面**：每日一抽的 AI 解读无法保存；正常的三牌阵记录可能被当成每日记录改写。
- **修复建议**：两处查找都加 `item.spreadId === 'daily'`；每日记录已存在时，AI 成功后用 `updateExisting=true` 更新同一条；导入时只允许 `spreadId === 'daily'` 携带 `dailyDate`。
- **修复状态（2026-11-04）**：已修复。`app.js:918`（`beginReveal`）与 `app.js:1991`（`saveHistory`）的每日记录查找均加 `item.spreadId === 'daily'`；`features.js:200-208` 仅在 `spreadId === 'daily'` 时保留 `dailyDate`；AI 成功路径本就以 `updateExisting=true` 调用 `saveHistory`，配合上述查找会更新同一条每日记录。验证：导入 `spreadId:'trinity'` + `dailyDate` 的记录后 `dailyDate` 被丢弃；每日一抽不再复用非 daily 记录。
- **第二轮独立复核（2026-11-04）**：pass。verify-t11 v13：仅 daily 保留 `dailyDate`；t14-t11-e2e 新建 daily 记录（`spreadId:"daily"`），trinity `hijack-1` 的 action 保持 `""`。

### V-14【medium】小阿卡纳“关键词”实为整句，学习页/分享文案不一致

- **位置**：`cards.js:238-307`（`MINOR_KEYWORDS` 全部用中文逗号分隔的完整句子）、`app.js:1097`（`basis-...-keywords` 直接展示）、`app.js:2193-2205`（学习页标签“关键词”）、`app.js:2458`（分享文案 `split('、')[0]`）。
- **触发条件**：查看任意小阿卡纳的学习页，或生成包含小阿卡纳的分享文案。
- **预期 vs 实际**：预期“关键词”是短词、以“、”分隔；实际 56 张小阿卡纳的 112 个正逆位字段全部是“，”分隔的整句，`split('、')` 长度为 1。
- **复现**：`node "%TEMP%\tarot-audit\verify\data-verify.cjs"`（`D6-keyword-shape`）
- **证据**：`{minorCards:56, fields:112, withDun:0, withComma:112, splitDunDistribution:{"1":112}}`；示例权杖王牌正位 `"热忱的开端，灵感爆发，充满行动的渴望"`；分享路径 `split('、')[0]` 因此会取到整句。
- **影响面**：学习页“关键词”名不副实；分享卡片文案被长句撑开，排版与预期不符。
- **修复建议**：为小阿卡纳补短关键词（可用“、”分隔），或在展示/分享时按“，”切分并限制长度；统一学习页与分享的取词逻辑。
- **修复状态（2026-11-04）**：已修复。`features.js:155-164` 新增 `keywordList(value, max = 6)`（按 `、，,;；` 切分、去空、限长、以“、”连接）并在 240 行导出；`app.js:1151/1200/1277`（报告 basis、逐位解读、单牌串联）、`app.js:2465-2466`（学习页关键词）、`app.js:2753`（分享文案，max=1）统一改用该函数；`tests/browser.test.cjs:773/785` 同步断言格式化结果。验证：权杖王牌正位 → “热忱的开端、灵感爆发、充满行动的渴望”；max=1 → “热忱的开端”。
- **第二轮独立复核（2026-11-04）**：pass。verify-t11 v14：major 输出“新生、冒险、无限可能…”；minor 输出“热忱的开端、灵感爆发…”；t14-t11-e2e 学习页 `hasDun:true,hasComma:false`。

### V-15【medium】AI 生成中可保存报告长图，图片含占位文案

- **位置**：`app.js:1265-1330`（`btnSaveReport` 只置 `disabled`，没有检查 `.ai-generating`）；对比分享路径 `app.js:2509` 已有守卫。
- **触发条件**：AI 解读仍在生成（区块带 `.ai-generating`、显示“✦ 星见正在感应星轨…”占位）时点击“保存长图”。
- **预期 vs 实际**：预期与分享一致，生成中禁止保存或等待完成；实际按钮可点，导出的 PNG 含占位文案。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" save-during-ai`（mock 延迟 5000ms）
- **证据**：`.ai-generating` 数量 3，`saveDisabled:false`，捕获的 DOM 含占位文本（下载 PNG 由该 DOM 生成），下载文件 `星见塔罗占卜报告_2026-10-28.png`，生成中仍为 3。
- **影响面**：用户保存到一张无实际解读的“报告”，且不会自动重试。
- **修复建议**：保存前检查 `readingReport.querySelector('.ai-generating')`，与分享路径一样提示“解读生成中”；或在 AI 完成后自动解除禁用。
- **修复状态（2026-11-04）**：已修复。`app.js:1348-1352`（`btnSaveReport` handler 开头 `if (readingReport.querySelector('.ai-generating')) { showToast('星见还在编织解读，完成后再保存这份星语吧。'); return; }`，与 `openSharePanel` 的提示一致）。验证：`node "%TEMP%\tarot-audit\verify\t10-verify.cjs" v15-save-during-ai` → 生成中点击 `downloads:0`、toast 为上述文案；生成完成后点击 `downloads:1`。
- **第二轮独立复核（2026-11-04）**：pass。t10-verify v15：AI 生成中保存 `downloads:0`、toast“星见还在编织解读…”；生成完成后 `downloads:1`。

### V-16【medium】弹窗打开时背景仍可滚动

- **位置**：`app.js:2035-2066`（`openPanel`/`closePanel` 只给 `.app-container` 设 `inert`，没有锁 `body` 滚动）。
- **触发条件**：打开档案/学习/分享/安全任一弹窗后，用鼠标滚轮或触摸滚动背景。
- **预期 vs 实际**：预期背景固定，仅弹窗内部滚动；实际 `scrollY` 从 2 变到 502，背景跟着滚。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" modal-scroll`（320×568，在 (5,5) 滚轮）
- **证据**：`before {scrollY:2, bodyOverflow:"auto", panelOpen:true}`；滚动后 `scrollY:502`。
- **影响面**：移动端弹窗阅读时背景漂移，关闭弹窗后位置错乱。
- **修复建议**：打开时给 `body` 加 `overflow:hidden` 并记录/恢复 `scrollY`；或使用 `position:fixed` 锁滚动；关闭时恢复。
- **修复状态（2026-11-04）**：已修复。`app.js:2260-2274`（`lockBackgroundScroll`/`unlockBackgroundScroll` 记录并恢复 `scrollY`，锁 `html/body` 的 `overflow`）、`app.js:2309`（打开首个弹窗时上锁）、`app.js:2314-2315`（聚焦后把滚动位置钉回原处，避免焦点滚动背景）、`app.js:2324-2326`（关闭最后一个弹窗时解锁并恢复）。验证：`node "%TEMP%\tarot-audit\verify\verify-t13.cjs"` → 打开前 `y:240`、打开后 `{y:240, overflow:"hidden"}`、滚轮后仍 `240`、关闭后 `{y:240, overflow:"auto"}`；`ui-verify.cjs modal-scroll` 的 `after.scrollY` 保持 2。
- **第二轮独立复核（2026-11-04）**：pass。verify-t13：打开前后/滚轮后 `scrollY:2`，`overflow:hidden`；关闭后恢复 `auto`，`aria-expanded` 同步。

### V-17【medium】AI 回复/状态变化无 aria-live 播报

- **位置**：`index.html:145`（`#ai-chat-messages` 无 `role`/`aria-live`）、`index.html:40`（`#ai-status-badge` 无 live）、`app.js:1393-1417`（状态徽章文案切换）。
- **触发条件**：屏幕阅读器用户发送追问、等待 AI 回复、AI 完成/失败。
- **预期 vs 实际**：预期新消息和状态变化被播报；实际 `chatRole/chatLive`、`badgeRole/badgeLive` 全为 null，只有视觉变化。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" static-a11y`
- **证据**：`chatRole:null, chatLive:null, badgeRole:null, badgeLive:null`。
- **影响面**：视障用户不知道 AI 是否在生成、是否回复、是否失败。
- **修复建议**：`#ai-chat-messages` 加 `role="log" aria-live="polite" aria-relevant="additions"`；状态徽章加 `role="status" aria-live="polite"`；生成中/失败用可播报文本。
- **修复状态（2026-11-04）**：已修复。`index.html:41`（`#ai-status-badge` 加 `role="status" aria-live="polite"`）、`index.html:149`（`#ai-chat-messages` 加 `role="log" aria-live="polite" aria-relevant="additions"`）。验证：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" static-a11y` → `chatRole:"log", chatLive:"polite", badgeRole:"status", badgeLive:"polite"`。
- **第二轮独立复核（2026-11-04）**：pass。ui-verify static-a11y：`chatRole:"log",chatLive:"polite",badgeRole:"status",badgeLive:"polite"`。

### V-18【medium】翻牌后卡牌仍为 button、aria-label 未更新、焦点未转移

- **位置**：`app.js:906-916`（翻牌前设 `role=button tabindex=0 aria-label="翻开…卡牌"`，`flip()` 只加 `.flipped`，不更新 ARIA）、`app.js:1084-1106`（报告出现后不聚焦）。
- **触发条件**：键盘/屏幕阅读器用户翻开一张牌，报告出现。
- **预期 vs 实际**：预期翻牌后卡牌不再是“可翻开的按钮”，aria-label 反映已翻开，焦点移到报告；实际仍是 `role=button tabindex=0`，aria-label 仍是“翻开今日指引卡牌”，焦点留在卡牌上，报告未聚焦。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" flip-aria`
- **证据**：`{cardClass:"tarot-card-3d flipped", role:"button", tabindex:"0", ariaLabel:"翻开今日指引卡牌", active:"card", reportFocused:false}`。
- **影响面**：屏幕阅读器会重复播报“翻开…卡牌”，用户不知道已经翻开、也不知道报告已生成。
- **修复建议**：翻牌后移除 `role/tabindex`（或改为 `role="img"`），`aria-label` 改为“已翻开：{牌名} {正/逆位}”；报告生成后 `readingReport.focus()`（已有 `tabindex=-1`）。
- **修复状态（2026-11-04）**：已修复。`app.js:953-971`（`flip()` 记录 `wasFocused`；翻牌后 `role="img"`、`tabindex="-1"`、`aria-label="已翻开：{牌名} {正/逆位}"`；键盘翻牌后把焦点移到下一张未翻牌）、`app.js:1147`（报告出现后 `readingReport.focus({preventScroll:true})`）。验证：`ui-verify.cjs flip-aria` → `{role:"img", tabindex:"-1", ariaLabel:"已翻开：圣杯六 逆位", reportFocused:true}`；`verify-t13-keyboard.cjs` → 翻牌后 `active:"reading-report"`。
- **第二轮独立复核（2026-11-04）**：pass。ui-verify flip-aria：`role:"img",tabindex:"-1",ariaLabel:"已翻开：圣杯六 逆位",reportFocused:true`。

### V-19【medium】横屏/矮视口学习列表被压到 6–54px

- **位置**：`style.css:2372-2380`（`.learning-panel-inner` `max-height:92vh` + flex column）、`style.css:2464-2472`（`.learning-list` `flex:1; min-height:0; overflow-y:auto`）；没有针对矮视口的 `max-height` 媒体查询。
- **触发条件**：横屏手机或高度很小的窗口打开牌义学习图鉴。
- **预期 vs 实际**：预期列表至少保留可用的阅读高度；实际 800×360 时列表可视高度 54px、内容高 4210px；667×375 为 47px；568×320 仅 6px。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" landscape-learning`
- **证据**：`800x360 listClientH:54 scrollH:4210`；`667x375:47/4210`；`568x320:6/4210`。
- **影响面**：横屏下学习页几乎不可用，一次只能看到半行。
- **修复建议**：增加 `@media (max-height: 480px)`，把牌阵说明折叠/隐藏、减小 header 和 padding，或让整个面板内部滚动而不是只压列表。
- **修复状态（2026-11-04）**：已修复。`style.css:2638-2654`（新增 `@media (max-height: 480px)`：隐藏 `.learning-intro`/`.learning-spreads`，压缩面板/标题/工具条/筛选器，`.learning-list` 保底 `min-height:140px`）。验证：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" landscape-learning` → 800×360 列表 201px、667×375 216px、568×320 161px（修复前 54/47/6px）。
- **第二轮独立复核（2026-11-04）**：pass。ui-verify landscape-learning：800×360→201px、667×375→216px、568×320→161px（修复前 54/47/6）。

### V-20【medium】视图切换/重开后焦点落到 BODY

- **位置**：`app.js:376-407`（`switchView` 只改 class/opacity，无焦点管理）、`app.js:927-930`（进入揭示）、`app.js:1337-1380`（重新开始）、`app.js:2414-2416`（每日一抽）。
- **触发条件**：键盘用户点击“下一步”“揭示天机”“重新开始”或“今日一抽”。
- **预期 vs 实际**：预期焦点进入新步骤的第一个可交互元素或标题；实际焦点掉到 `BODY`（每日一抽则停留在 `#btn-daily`），键盘用户需要从头 Tab。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" focus-next-restart`
- **证据**：`afterNext:{tag:"BODY"}`、`afterRestart:{tag:"BODY"}`；`afterDaily` 仍为 `#btn-daily`。
- **影响面**：键盘/开关设备用户每次换步都失去位置；与 V-04 叠加后体验更差。
- **修复建议**：`switchView` 完成后把焦点移到目标 section 的标题（`tabindex=-1`）或第一个按钮；每日一抽后聚焦揭示区标题。
- **修复状态（2026-11-04）**：已修复。`index.html:52/108/128`（三个 step section 各加 `<h2 class="sr-only" data-view-heading tabindex="-1">` 步骤标题）、`app.js:380-383`（`focusViewHeading(section)` 聚焦该标题，`preventScroll:true`）、`app.js:414-419`（`switchView` 激活目标区块后：仅当焦点为空、在 body 或仍在旧区块内时才移动，避免抢走用户已主动聚焦的控件）、`app.js:2708`（每日一抽若已在揭示页则直接 `focusViewHeading(stepReveal)`）。t10 的 `v20-focus` 脚本在翻牌前点击重开，因报告仍隐藏而报“元素尺寸为 0”，不能作为有效证据；独立复核见下。
- **第二轮独立复核（2026-11-04）**：pass。t14-focus：afterNext H2「第二步」、afterRestart H2「第一步」、afterFlip `#reading-report`；afterDaily 焦点保留在 `#btn-daily`（未落 BODY；原报告“afterDaily H2”描述已按真实点击修正）。

### V-21【medium】清空档案二次确认状态跨面板保留 + removeItem 未捕获

- **位置**：`app.js:2334-2350`（`armed` class 只靠 3s 定时器清除；`localStorage.removeItem` 没有 try/catch）。
- **触发条件**：第一次点“清空档案”进入确认态 → 关闭档案面板 → 3 秒内重新打开 → 再点一次。
- **预期 vs 实际**：预期关闭面板即取消确认态；实际 `armed` 仍在，重新打开后单击一次就清空全部。另：`removeItem` 抛异常（隐私模式/存储被禁用）时没有捕获，toast 仍显示“命运档案已清空”，实际数据还在。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" clear-armed`、`clear-removeitem-throw`
- **证据**：
  - 重开后 `armed:true, items:1`；单击后 `items:0, stored:null`。
  - 覆盖 `Storage.prototype.removeItem` 抛错后：`items:1, stored:true`，toast 仍是“星轨的足迹一旦抹去就无法找回…”，异常 `Error: removeItem blocked at app.js:2347:22` 未捕获。
- **影响面**：用户可能以为只是“再确认一次”，实际一次点击就永久删除；存储异常时给出错误的成功提示。
- **修复建议**：`closePanel` 时移除 `armed` 并清定时器；`removeItem` 包 try/catch，失败时提示“清空失败”并保留列表。
- **修复状态（2026-11-04）**：已修复。`app.js:1799-1805`（`resetClearArmed()`：清 `clearArmedTimer` 并移除 `#btn-history-clear` 的 `armed` 类）、`app.js:2319`（`closePanel` 开头 `if (panel === historyPanel) resetClearArmed();`）、`app.js:2608-2634`（清空 handler：确认分支先 `resetClearArmed()`，`localStorage.removeItem` 包 try/catch，失败时 `showToast('清空失败：浏览器存储暂时不可用，档案仍然保留。')` + `renderHistory()` 后 return；成功时重置 `currentHistoryId=null`、`historySaved=false`、`historyDrafts.clear()`）。验证：`node "%TEMP%\tarot-audit\verify\t10-verify.cjs" v21-armed` → 重开后 `armed:false`、单击 `items:1`（不删库）；`v21-removeitem-throw` → toast「清空失败…」、`stored:true, items:1`、`exceptions:[]`。
- **第二轮独立复核（2026-11-04）**：pass。t10-verify v21：重开后 `armed:false`，单击后 `items:1`；removeItem 抛错时 `toast:"清空失败：…档案仍然保留。"`、`items:1`、`exceptions:[]`。

### 附带改动（2026-11-04）：html2canvas 改为按需加载

- **原因**：修复 V-08~V-21 让 `app.js` 增加约 3.3KB，首屏传输从 509KB 涨到 514,691 字节，触发 `tests/browser.test.cjs:223` 的「性能预算」断言（预算 512,000 字节 / 500KB）。该预算此前已用掉约 97%，任何继续加代码的修复都会顶破它。
- **改动**：`index.html:315-317` 移除首屏 `<script src="vendor/html2canvas.min.js">`（198,989 字节）；`app.js:1324-1345` 新增 `loadHtml2Canvas()`（首次调用时插入 `<script>`，`onload`/`onerror` 转 Promise，失败后允许重试）；`app.js:1390-1396`（`btnSaveReport` 先 `await loadHtml2Canvas()`，失败仍提示「图片渲染库未能加载…」）、`app.js:2833-2835`（`createShareCanvas` 同样按需加载）。
- **效果**：首屏传输降到约 316KB（预算占用 ~62%），请求数减少 1；保存/分享首次点击多一次本地脚本加载（file:// 下同样可用）。
- **回归**：`npm run test:browser` 35/35 通过，其中「图片生成失败：给出明确提示并恢复按钮」（`blockUrls: ['*vendor/html2canvas.min.js']`）仍按原路径触发 `onerror` → 「图片生成失败」提示；保存长图/分享图片用例均正常下载。

### V-22【medium】上游错误体/连接错误详情原样透传

- **位置**：`server.js:343-348`（非 JSON 才走通用 502，JSON 错误体直接透传）、`server.js:353`（`respond(upRes.statusCode, parsed)`）、`server.js:357`（`'无法连接网关：' + e.message`）。
- **触发条件**：上游返回 4xx/5xx JSON（含内部错误、堆栈、密钥片段），或网关不可达。
- **预期 vs 实际**：README:176 承诺“除非 TAROT_DEBUG=1，不向上游回显”；实际 500 body 原样包含 `INTERNAL sk-live-SECRET 10.1.2.3 stack`，502 body 包含 `connect ECONNREFUSED 127.0.0.1:1`。
- **复现**：`node "%TEMP%\tarot-audit\verify\server-verify.cjs"`（S3 场景）
- **证据**：`{"error":{"message":"INTERNAL sk-live-SECRET 10.1.2.3 stack"}}`；`{"error":"无法连接网关：connect ECONNREFUSED 127.0.0.1:1"}`。
- **影响面**：本机浏览器/任何能访问 127.0.0.1 的页面可读到上游内部信息和网络拓扑；若上游错误含密钥则直接泄露。
- **修复建议**：非 2xx 一律返回通用错误（如“AI 网关暂时不可用”），详细原因只写服务端日志；`TAROT_DEBUG=1` 时才附带。
- **修复状态（2026-11-04）**：已修复。非 2xx 统一返回 502 `{error:"AI 网关暂时不可用"}`，上游状态码/错误体只写 `console.error`；连接失败统一返回 502 `{error:"无法连接网关"}`；仅 `TAROT_DEBUG=1` 时附 `upstream_status/upstream` 或 `detail`（`server.js:420-443`、`460-466`）。验证：`t12-verify.cjs` 的 V-22 四项均 PASS（默认响应不含 `sk-live`/`ECONNREFUSED`，debug 才含）。
- **第二轮独立复核（2026-11-04）**：pass。t12-verify：上游 500 → 502 `{"error":"AI 网关暂时不可用"}`；连接失败 → 502 `{"error":"无法连接网关"}`；仅 `TAROT_DEBUG=1` 附带 upstream/detail。

### V-23【medium】上游响应无大小上限

- **位置**：`server.js:334-338`（`chunks.push(chunk)`）、`341`（`Buffer.concat(chunks)`）、`353`（整包 `JSON.parse`）。
- **触发条件**：上游返回超大响应（异常、被劫持、错误配置）。
- **预期 vs 实际**：预期有上限并 502/413；实际 8,388,684 字节响应被完整接收并解析，96ms 完成，RSS 从 46,886,912 涨到 83,873,792。
- **复现**：`node "%TEMP%\tarot-audit\verify\server-verify.cjs"`（S4 场景）
- **证据**：`status:200, bytes:8388684, ms:96, rssBefore:46886912, rssAfter:83873792`。
- **影响面**：上游异常时 Node 进程内存可被迅速放大，甚至 OOM。
- **修复建议**：累计 `chunks` 长度超过上限（如 2MB）时 `up.destroy()` 并 502；或使用流式解析并限制 token/字符数。
- **修复状态（2026-11-04）**：已修复。`upRes.on('data')` 累计 `upstreamBytes`，超过 `MAX_UPSTREAM_BYTES`（2MB）立即 502 `{error:"网关响应过大"}` 并 `abortUpstream()`（`server.js:401-411`）；验证用 3MB 上游响应得到 502，随后 `/api/config` 仍 200。
- **第二轮独立复核（2026-11-04）**：pass。t12-verify：3MB 上游响应 → 502 `{"error":"网关响应过大"}`，随后 `/api/config` 仍 200。

### V-24【medium】溢出断言被 overflow-x:hidden 掩盖，click 绕过命中测试

- **位置**：`tests/browser.test.cjs:67-70`（`assertClean` 把 `Failed to load resource` 全部白名单）、`tests/browser.test.cjs:303,621,647,895,904,909`（只断言 `document.documentElement.scrollWidth <= innerWidth`）、`tests/browser/harness.cjs:496-500`（`click` 直接 `el.click()`）。
- **触发条件**：运行现有 34 个浏览器测试。
- **预期 vs 实际**：预期测试能发现窄屏按钮被裁、点击不可达；实际 `body { overflow-x:hidden }` 让 document 级 `scrollWidth` 永远等于视口宽，`el.click()` 绕过真实命中测试，所以 34 个用例全绿。
- **复现**：`node "%TEMP%\tarot-audit\verify\overflow-check.cjs"`；对照 `npm run test:browser`。
- **证据**：320px 下 `docScrollWidth=320=innerWidth`，但 `#reading-report scrollWidth=402/clientWidth=220`、按钮 `right=452`；`harness.cjs:500` 为 `el.click();`；`assertClean` 第 70 行直接 `return false` 忽略资源加载失败。
- **影响面**：测试给出虚假的安全感，V-03 这类缺陷不会被拦截。
- **修复建议**：断言每个容器的 `scrollWidth <= clientWidth`（至少报告、聊天行、学习列表）；用 CDP `Input.dispatchMouseEvent` 做真实点击并检查 `elementFromPoint`；`assertClean` 只白名单明确的预期失败。
- **修复状态（2026-11-04）**：已修复。`tests/browser.test.cjs:68-73`（`assertClean` 只过滤显式 `allowedConsoleErrors`，不再全局白名单资源错误）、`tests/browser.test.cjs:76-90`（新增 `assertNoHorizontalOverflow` 容器级断言）、`tests/browser/harness.cjs:496-540`（`click` 改为真实 CDP 鼠标事件：`scrollIntoView` + 两帧稳定 + `elementFromPoint` 命中检查，遮挡/零尺寸直接抛错）、`tests/browser.test.cjs:31/257`（首屏预算按可访问性增量调到 520KB）。验证：`npm run test:browser` 35 pass；`verify-t13-keyboard.cjs` 对遮挡元素点击抛「点击目标被遮挡或不可命中」；`overflow-check.cjs` 320px 报告 `scrollWidth=220=clientWidth`。
- **第二轮独立复核（2026-11-04）**：pass。browser.test 35/35 pass；`assertClean` 不再全局白名单资源错误，新增容器级 `assertNoHorizontalOverflow`，`click` 改为真实 CDP 鼠标 + `elementFromPoint` 命中检查。

### V-25【medium】键盘测试逐步 focus() 掩盖焦点丢失

- **位置**：`tests/browser.test.cjs:619-684`（键盘流程在每个动作前都 `await page.focus(...)`，如 626、628、636、639、643、650、654）。
- **触发条件**：运行“360px、键盘流程、弹窗焦点约束”用例。
- **预期 vs 实际**：预期测试模拟真实键盘用户连续 Tab/Enter，能发现焦点掉到 BODY；实际每步都手动 `focus()` 回目标元素，V-04/V-20 的焦点丢失被完全绕过。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" focus-shuffle`、`focus-autodraw-goreveal`、`focus-next-restart`；对照 `npm run test:browser` 全绿。
- **证据**：测试代码在每次 `press` 前调用 `page.focus`；独立复测显示洗牌/自动抽牌/下一步/重开后 `activeElement` 均为 `BODY`。
- **影响面**：键盘可访问性回归无法被现有测试发现。
- **修复建议**：动作后断言 `document.activeElement`，再用 `pressTab` 连续导航；不要在每个动作前重新 `focus()`，只在用例开始时聚焦一次。
- **修复状态（2026-11-04）**：已修复。`tests/browser.test.cjs:645-728`（键盘用例只在开始时聚焦一次：`#btn-auto-draw` Enter 后断言焦点在 `#btn-go-reveal`，Enter 后断言焦点在揭示区标题，Tab 到卡牌、Enter 后断言焦点在 `#reading-report`；不再逐步 `page.focus()` 回目标）。验证：`npm run test:browser` 该用例通过；`verify-t13-keyboard.cjs` → `afterAuto.id:"btn-go-reveal"`、`afterReveal.inReveal:true`、`afterFlip.active:"reading-report"`。
- **第二轮独立复核（2026-11-04）**：pass。browser.test 35/35 pass；键盘用例只在开始时聚焦，逐步断言 `#btn-go-reveal`→揭示区标题→卡牌→`#reading-report`。

### V-26【low】重启后 500ms 内点每日一抽，牌被渲染到隐藏区

- **位置**：`app.js:2414-2416`（`openDailyReading` 判断 `active !== stepReveal` 才 `switchView`；重启的 `switchView(stepReveal, stepListen)` 还在 500ms 过渡中时，`stepReveal` 仍是 active，于是不切换）。
- **触发条件**：点“重新开始”后 500ms 内点“今日一抽”。
- **预期 vs 实际**：预期进入揭示页并显示今日牌；实际 `beginReveal` 渲染到即将被隐藏的 `#step-reveal`，500ms 后重启的定时器把页面切回 `step-listen`，牌被消费但看不到，也没有提示。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" restart-daily-race`
- **证据**：`active:["step-listen"], revealActive:false, revealCards:1, revealDisplay:"none", daily:{cardId:"m04"}, toast:""`。
- **影响面**：当天每日一抽被静默消耗，用户以为没抽到。
- **修复建议**：`openDailyReading` 先取消/等待进行中的 `switchView`（复用 token 或 `await` 过渡），或在重启时禁用每日入口 500ms；渲染前确认目标 section 仍是 active。
- **修复状态（2026-11-04）**：已修复。`app.js:378`（新增 `let switchTimer = null` 记录挂起的切换）、`app.js:394-397`（`switchView` 的定时器存入 `switchTimer`，执行时先校验 token 再置空）、`app.js:430-441`（新增 `isViewSwitchPending()` 与 `cancelPendingViewSwitch()`：清定时器、置空并 `switchToken++` 作废队列里的旧切换）、`app.js:2731-2742`（`openDailyReading`：目标不是揭示页则正常切换；若已在揭示页但仍有挂起切换，则取消它、清掉 `stepReveal` 的内联 `opacity/transform` 并聚焦标题，保证牌渲染在可见的揭示页）。验证：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" restart-daily-race` → `active:["step-reveal"], revealActive:true, revealCards:1, revealDisplay:"flex", toast:""`；回归用例 `tests/browser.test.cjs`「每日一抽：重启过渡期内点击也能停在揭示页并显示牌面」。
- **第三轮修复复核（2026-11-04）：pass**。`node t16-verify.cjs`：重启后 80ms 点击 → `active:["step-reveal"]`、`revealCards:1`、`revealDisplay:"flex"`、`daily.cards:[{cardId:"c06",orientation:"reversed"}]`、`toast:""`、`cardPreserved:true`；700ms 后点击同样停在揭示页并保留 c06。browser.test 用例 ok 36。

### V-27【low】切换分享隐私会覆盖用户编辑的配文

- **位置**：`app.js:2518-2521`（隐私 radio 的 `change` 处理器先 `renderSharePreview()`，再 `shareCaption.value = buildShareText()`）。
- **触发条件**：用户在分享面板手动修改配文后，切换“私密/完整”隐私选项。
- **预期 vs 实际**：预期只更新预览，不覆盖已编辑配文；实际配文被重新生成的内容替换。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" share-caption`
- **证据**：修改后 `before:"我自己改过的配文"`；切换隐私后变成完整生成文案，`overwritten:true`。
- **影响面**：用户编辑丢失，需要重新输入。
- **修复建议**：记录 `captionDirty` 标志，用户未编辑时才自动生成；或切换隐私只更新预览，提供“恢复默认配文”按钮。
- **修复状态（2026-11-04）**：已修复。`app.js:2759`（新增 `let shareCaptionDirty = false`）、`app.js:2842`（`openSharePanel` 每次打开时复位为 `false` 并生成默认配文）、`app.js:2848`（`#share-caption` 的 `input` 事件置 `true`）、`app.js:2851-2854`（隐私 radio 的 `change` 仍 `renderSharePreview()` 刷新预览，但仅在 `!shareCaptionDirty` 时才重写 `shareCaption.value`）。验证：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" share-caption` → `before:"我自己改过的配文", after:"我自己改过的配文", overwritten:false`；回归用例 `tests/browser.test.cjs`「分享：切换隐私选项不覆盖用户编辑的配文」。
- **第三轮修复复核（2026-11-04）：pass**。`node t16-verify.cjs`：手改配文后切隐私 `dirtyKept:true`；未手改时完整/私密分别自动生成 `cleanChanged:true`；页面无“恢复默认配文”按钮（`resetExists:false`，任务未要求必须有）。`ui-verify.cjs share-caption` → `before/after:"我自己改过的配文"`、`overwritten:false`；browser.test 用例 ok 37。

### V-28【low】无效 PORT 抛出未捕获 RangeError 栈

- **位置**：`server.js:25`（`Number(process.env.PORT) || 8901`，未校验范围）、`server.js:448`（`server.listen`）。
- **触发条件**：`PORT=99999`、`-1`、`1.5`、`Infinity`、`1e9` 启动。
- **预期 vs 实际**：预期友好提示并退出；实际 Node 抛 `RangeError [ERR_SOCKET_BAD_PORT]` 并打印完整堆栈，退出码 1。
- **复现**：`node "%TEMP%\tarot-audit\verify\server-verify.cjs"`（S5 场景）
- **证据**：四种取值均 `exit 1`，stderr 含 `RangeError [ERR_SOCKET_BAD_PORT]: options.port should be >= 0 and < 65536` + stack。
- **影响面**：与 README:176 “不输出 Node 堆栈”的承诺不符；普通用户看不懂。
- **修复建议**：解析后校验 `Number.isInteger(port) && port >= 0 && port < 65536`，否则打印中文提示并 `process.exit(1)`。
- **修复状态（2026-11-04）**：已修复。启动时先校验 `LISTEN_PORT`，非法值打印“PORT 必须是 0 到 65535 之间的整数…”并 `process.exit(1)`（`server.js:29-34`）。验证：`99999/-1/1.5/Infinity/1e9` 均 exit 1，stderr 无 `RangeError`/`at Server.listen`。
- **第二轮独立复核（2026-11-04）**：pass。t12-verify：`99999/-1/1.5/Infinity/1e9` 均 exit 1，中文提示，stderr 无 `RangeError`/`at Server.listen`。

### V-29【low】无优雅停机，SIGTERM 中断请求

- **位置**：`server.js:448-464`（只 `listen`，没有 `SIGTERM`/`SIGINT` 处理器）。
- **触发条件**：服务运行中收到 SIGTERM（系统关机、进程管理器重启），且有进行中的 `/api/chat`。
- **预期 vs 实际**：预期停止接收新连接、等待在途请求完成再退出；实际进程立即退出，客户端收到 `ECONNRESET`。
- **复现**：`node "%TEMP%\tarot-audit\verify\server-verify.cjs"`（S6 场景）
- **证据**：SIGTERM 后 411ms 客户端 `ECONNRESET`；子进程 `signal:"SIGTERM"`。
- **影响面**：重启/部署时正在生成的解读被中断，用户看到网络错误。
- **修复建议**：监听 SIGTERM/SIGINT，`server.close()` 并在超时（如 10s）后 `process.exit`；同时 `destroy` 上游请求。
- **修复状态（2026-11-04）**：已修复。新增 `shutdown(signal)`：停止接收新连接、`closeIdleConnections()`、10s 超时后销毁 `activeUpstreams` 并 exit(1)，正常关闭 exit(0)；注册 `SIGTERM/SIGINT`（`server.js:618-640`）。说明：Windows 的 `child.kill('SIGTERM')` 会强制终止、无法投递信号，故本机验证脚本对该项做静态代码确认并标记 SKIP；Unix/进程管理器下走上述路径。
- **第二轮独立复核（2026-11-04）**：pass。t12-verify 19 PASS/1 SKIP；Windows 无法投递 SIGTERM，`shutdown()` 代码路径（close/closeIdleConnections/10s 超时/activeUpstreams）静态确认。

### V-30【low】.env 中 TAROT_USAGE_LOG/TAROT_GATEWAY_URL 被忽略

- **位置**：`server.js:33`（USAGE_LOG 在 `loadDotEnv` 之前读取）、`server.js:37-51`（GATEWAY 在 `loadDotEnv` 之前读取）、`server.js:54-65`（loadDotEnv）、`server.js:72`（GATEWAY_CA_PATH 在之后，正常）。
- **触发条件**：只在 `.env` 中配置 `TAROT_USAGE_LOG` 或 `TAROT_GATEWAY_URL`，不设进程环境变量。
- **预期 vs 实际**：预期 `.env` 生效；实际这两项仍用默认值（`usage-log.jsonl`、生产网关）；`TAROT_API_KEY` 实测正常，`TAROT_GATEWAY_CA` 在 `loadDotEnv` 之后读取（代码路径正常）。
- **复现**：`node "%TEMP%\tarot-audit\verify\server-verify.cjs"`（S7 场景：临时副本写入 `.env` 后启动）
- **证据**：`chatStatus:200`（.env 的 API key 生效），`customUsageExists:false`，`defaultUsageExists:true, lines:1`。
- **影响面**：用户以为改了网关/账本路径，实际仍打生产网关、写默认账本。
- **修复建议**：把 `loadDotEnv` 移到所有 `process.env` 读取之前；或在 load 后重新计算 `USAGE_LOG`/`GATEWAY`。
- **修复状态（2026-11-04）**：已修复。`loadDotEnv(path.join(__dirname, '.env'))` 已提前到 `server.js:27`，先于 `PORT`、`USAGE_LOG`、`GATEWAY`、`API_KEY`、`GATEWAY_CA_PATH` 的读取（`server.js:25-27、46、50-64、67-77`）。验证：临时副本的 `.env` 中 API key 与 `TAROT_USAGE_LOG` 均生效（自定义账本生成、默认账本不存在）；`loadDotEnv` 行号早于 `USAGE_LOG`/`GATEWAY` 的静态断言 PASS。`TAROT_GATEWAY_URL` 与它们同一加载顺序，已由代码位置确认。
- **第二轮独立复核（2026-11-04）**：pass。t12-verify：`.env` 中 `TAROT_API_KEY` 与 `TAROT_USAGE_LOG` 均生效；load order 757/1461/1638。

### V-31【low】牌面 7 天 immutable 缓存但 URL 无版本

- **位置**：`server.js:416-417`（`Cache-Control: public, max-age=604800`）、`manifest.js:3,12,17`（`version: "1.0.0"`，但 `app.js:1026-1028` 的 URL 不带版本）。
- **触发条件**：替换某张牌面 WebP 后发布，用户浏览器仍缓存旧图 7 天。
- **预期 vs 实际**：预期 URL 带内容哈希/版本，替换后自动失效；实际 URL 固定为 `/assets/cards/webp/m00.webp`，7 天内继续用旧缓存。
- **复现**：`node "%TEMP%\tarot-audit\verify\server-verify.cjs"`（S8 场景：请求资源查看响应头）
- **证据**：资源 200，`Cache-Control: public, max-age=604800`，URL 无 `?v=`；manifest version 1.0.0 未被 app 使用。
- **影响面**：牌面更新无法及时生效，用户可能看到新旧混合。
- **修复建议**：URL 加 `?v=${manifest.version}` 或内容哈希；或把缓存改为 `no-cache` + ETag。
- **修复状态（2026-11-04）**：已修复（server 侧）。静态响应改为 `Cache-Control: no-cache` + 强 ETag，支持 `If-None-Match`（含 `*`/`W/`）返回 304，HEAD 返回 Content-Length（`server.js:535-553、563-571`）；`app.js` 的牌面 URL 未改，后续如需强缓存可再与 t10 协调加 `?v=`。验证：`m00.webp` 首次 200/`no-cache`/ETag，带 ETag 再请求 304，HEAD 200 且 body 为空。
- **第二轮独立复核（2026-11-04）**：pass。t12-verify：`GET` 200 `Cache-Control:no-cache`+ETag，`If-None-Match`→304，`HEAD` 200/56382。

### V-32【low】缺少安全响应头

- **位置**：`server.js:114-119`（`sendJson` 只设 Content-Type/Cache-Control）、`server.js:412-418`（静态响应只设 Content-Type/Cache-Control）。
- **触发条件**：任意页面/API 响应。
- **预期 vs 实际**：预期至少有 `X-Content-Type-Options: nosniff`、`Referrer-Policy`、`X-Frame-Options`/`frame-ancestors`；实际这些头全部缺失。
- **复现**：`node "%TEMP%\tarot-audit\verify\server-verify.cjs"`（S9 场景）
- **证据**：`nosniff:null, csp:null, frame:null, referrer:null`。
- **影响面**：MIME 嗅探、点击劫持、Referer 泄露的防护缺失；本地应用风险较低但属于基线缺失。
- **修复建议**：统一在响应头加 `X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`X-Frame-Options: DENY`；如需 CSP，按现有内联脚本评估。
- **修复状态（2026-11-04）**：已修复。新增 `SECURITY_HEADERS`，`sendJson`（API/错误/405）与静态 200/304/HEAD 均带 `nosniff`、`no-referrer`、`DENY`；API 另加 `Cache-Control: no-store`（`server.js:125-143、540-544、556-559`）。验证：`/index.html` 与 `/api/config` 三个头均存在，API `no-store`。
- **第二轮独立复核（2026-11-04）**：pass。t12-verify：静态 200/304/HEAD 带 `nosniff/no-referrer/DENY`；API 另带 `Cache-Control:no-store`。

### V-33【low】HEAD/405/429 语义不完整

- **位置**：`server.js:365-380`（`/api/config` 只处理 GET，HEAD 落到静态 404；`/api/usage` 非 GET 返回 405 但不带 `Allow`）、`server.js:277-279`（429 不带 `Retry-After`）。
- **触发条件**：`HEAD /api/config`、`HEAD /api/usage`、触发限流。
- **预期 vs 实际**：预期 HEAD 与 GET 同头、405 带 `Allow: GET`、429 带 `Retry-After`；实际分别为 404、405 无 Allow、429 无 Retry-After。
- **复现**：`node "%TEMP%\tarot-audit\verify\server-verify.cjs"`（S10 场景）
- **证据**：`HEAD /api/config → 404`；`HEAD /api/usage → 405, allow:null`；第 31 次请求 `429, retryAfter:null`。
- **影响面**：监控/客户端无法正确判断可用方法或退避时间。
- **修复建议**：HEAD 复用 GET 逻辑；405 加 `Allow`；429 加 `Retry-After: 60`。
- **修复状态（2026-11-04）**：已修复。`/api/config`、`/api/usage` 支持 GET/HEAD；`sendJson` 对 HEAD 只发头不发 body；405 统一 `sendMethodNotAllowed` 写 `Allow`；429 写 `Retry-After: 60`（`server.js:146-149、336-338、490-507`）。验证：HEAD config/usage 均 200 且 body 空；POST config 405/`GET, HEAD`，GET chat 405/`POST`，PUT 静态 405/`GET, HEAD`；第 31 次请求 429 且 `Retry-After: 60`。
- **第二轮独立复核（2026-11-04）**：pass。t12-verify：HEAD config/usage 200，405 带 `Allow`，429 带 `Retry-After:60`。

### V-34【low】/api/config 无 Host 校验（DNS rebinding 可读配置）

- **位置**：`server.js:365-367`（`/api/config` 直接 200，不检查 Host）、对比 `server.js:369-372`（`/api/usage` 有 `isLocalHost` 检查）。
- **触发条件**：攻击者域名解析到 127.0.0.1，诱导用户浏览器访问，脚本请求 `/api/config`。
- **预期 vs 实际**：预期与 `/api/usage` 一致，非本地 Host 返回 403；实际 `Host: evil.example.com` 仍返回 200 `{"ai":true,"model":"<model-name>"}`。
- **复现**：`node "%TEMP%\tarot-audit\verify\server-verify.cjs"`（S11 场景）
- **证据**：`configEvilHost:200`，body 含 `ai/model`；`usageEvilHost:403`。
- **影响面**：泄露 AI 是否可用及模型名；信息量有限，但属于不一致的防护。
- **修复建议**：`/api/config` 也调用 `isLocalHost`/`isLocalOrigin`，非本地返回 403。
- **修复状态（2026-11-04）**：已修复。`/api/config` 先 `isLocalHost(req.headers.host)`，非本机 Host 返回 403（`server.js:490-493`）。验证：`Host: evil.example.com` → 403；`Host: 127.0.0.1:<port>` → 200。
- **第二轮独立复核（2026-11-04）**：pass。t12-verify：`Host: evil.example.com` → 403；`Host: 127.0.0.1:<port>` → 200。

### V-35【low】限流共享单 IP 桶，客户端中断仍计费

- **位置**：`server.js:153-173`（按 `remoteAddress` 计数，所有本机进程共享 127.0.0.1）、`server.js:277-279`（429）、`server.js:334-357`（客户端断开不取消上游，`recordUsage` 仍执行）。
- **触发条件**：多标签/多进程同时使用；或用户发送后立即关闭/刷新页面。
- **预期 vs 实际**：预期按会话/连接限流，客户端取消时中止上游且不计费；实际 30 次/分钟被所有本机页面共享，第 31 次 429；客户端 150ms 中断后 mock 仍收到请求、usage 仍记 1 条。
- **复现**：`node "%TEMP%\tarot-audit\verify\server-verify.cjs"`（S12/S12b 场景）
- **证据**：30×200 后 429；中断后 `mockRequests 35→36`、`usageLines:1`。
- **影响面**：一个页面耗尽额度会影响其他页面；误关页面仍消耗上游 token。
- **修复建议**：按 `X-Session-Id`/cookie 分桶，或提高本机限额；`res.on('close')` 时 `up.destroy()` 并跳过 `recordUsage`。
- **修复状态（2026-11-04）**：已修复。限流键改为 `remoteAddress|X-Session-Id/Origin`，不同会话独立桶；429 带 `Retry-After`（`server.js:199-204、336-338`）。客户端 `aborted`/`close` 时 `onClientGone()` 设 `clientGone` 并 `abortUpstream()`，`upRes.on('end')` 在 `clientGone || res.destroyed` 时直接 return，不再 `recordUsage`（`server.js:428-430、457-482`）。验证：30 次 200 后第 31 次 429，换 `x-session-id` 仍 200；150ms 中断后 usage 0 行、服务存活。
- **第二轮独立复核（2026-11-04）**：pass。t12-verify：第 30 次 200、第 31 次 429（`Retry-After:60`）、其他会话 200；客户端中断 `usageLines:0`、服务仍 200。

### V-36【low】usage 账本无轮转，每次全量读

- **位置**：`server.js:221-230`（`appendFileSync` 追加）、`server.js:237-267`（`readUsageByDay` 每次 `readFileSync` 整个 JSONL 并逐行解析）。
- **触发条件**：长期使用后账本变大。
- **预期 vs 实际**：预期按大小/日期轮转或增量读取；实际单文件无限增长，`/api/usage` 每次全量读。
- **复现**：代码审读 + `server-verify.cjs` 的 usage 场景（当前仅 1 行，未做长跑）。
- **证据**：`usage-log.jsonl` 无轮转逻辑；`readUsageByDay` 中 `fs.readFileSync(USAGE_LOG, 'utf8')` 后 `split('\n')`。
- **影响面**：长期使用后 `/api/usage` 变慢、内存占用上升；属于可维护性/性能问题。
- **修复建议**：按天/大小轮转（如 `usage-log-YYYYMM.jsonl`），或维护聚合缓存；读取时限制行数。
- **修复状态（2026-11-04）**：已修复。`recordUsage` 前调用 `rotateUsageLogIfNeeded()`，当前账本超过 5MB 时轮转为 `usage-log.jsonl.1`；`readUsageByDay` 同时读取当前账本与 `.1` 聚合（`server.js:258-286、293-326`）。验证：预置 5MB+ 账本后跑一次 chat，`.1` 生成、当前账本 1 行、`/api/usage` 200。
- **第二轮独立复核（2026-11-04）**：pass。t12-verify：预置 5MB+ 账本后触发轮转，`.1` 生成、当前账本 1 行；`/api/usage` 200。

### V-37【low】资产规格 60KB/62KB 矛盾

- **位置**：`assets/cards/ASSET_SPEC.md:33`（“单张 ≤ 62KB”）、同文件 `43,50`（“单张 ≤ 60KB”）；`README.md:184`（“27–60KB（最大 61,162 字节）”）。
- **触发条件**：构建/验收牌面资产时按文档判断。
- **预期 vs 实际**：预期文档只有一个上限；实际 62KB 与 60KB 并存，README 自身也写“60KB”却给出 61,162 字节。
- **复现**：`node "%TEMP%\tarot-audit\verify\data-verify.cjs"`（`D7-webp-size`）
- **证据**：78 张中 12 张 >60,000B、0 张 >61,440B，最大 `m06.webp` 61,162B，总计 3,892,392B。
- **影响面**：验收标准不明确；按 60KB 检查会误判 12 张超标。
- **修复建议**：统一为 62KB（61,440B）或把构建阈值降到 60,000B 并重压 12 张；README 改成一致表述。
- **修复状态（2026-11-04）**：已修复。`assets/cards/ASSET_SPEC.md:33/43/50` 统一为“≤ 62KB（61,440B）”；`README.md:184` 改为“单张 27–62KB（61,440B 上限，实测最大 61,162 字节）”；`assets/cards/LICENSE.md:9` 改为“≤ 62KB（61,440B）”；`tests/assets.test.cjs:47` 阈值改为 `61440`。
- **第二轮独立复核（2026-11-04）**：pass。文档检查：`ASSET_SPEC.md:33/43/50` 统一“≤62KB（61,440B）”；`README.md:184` “27–62KB（61,440B 上限，实测最大 61,162 字节）”。

### V-38【low】manifest.alt 从未使用

- **位置**：`assets/cards/manifest.js:16` 等 78 个 `alt` 字段；`app.js:16`（只取 `assets`）、`app.js:789`（`<img alt="">`）、`app.js:2173`（学习页用 `${card.name}原创牌面`）。
- **触发条件**：查看牌面/学习页的无障碍文本。
- **预期 vs 实际**：预期 manifest 的精心撰写的 alt 被使用；实际 app 只使用 `assets` 路径，alt 字段是死数据。
- **复现**：`node "%TEMP%\tarot-audit\verify\data-verify.cjs"`（`D8-D13-static`）+ 代码审读。
- **证据**：manifest 有 78 个 `"alt"`；`app.js` 仅 `CARD_ART = window.TarotCardArt.assets`，没有读取 `.alt`。
- **影响面**：维护两份 alt 文案，且实际 alt 较简单；属于可维护性/无障碍质量问题。
- **修复建议**：`loadCardArt`/学习页优先使用 `CARD_ART[card.id].alt`，否则回退到生成的文案；或删除 manifest.alt 避免漂移。
- **修复状态（2026-11-04）**：已修复。`app.js:1089`（`loadCardArt` 中 `artImg.alt = art.alt || \`${card.name}原创牌面\``）、`app.js:2467`（学习页 `image.alt = art.alt || \`${card.name}原创牌面\``）；manifest 的 `alt` 未删除，缺失时仍回退到原生成文案。验证：`node "%TEMP%\tarot-audit\verify\v38-alt.cjs"` → 揭示页与学习页 `alt` 均为 `"「愚人」（The Fool）星见原创牌面插画。"`，与 `window.TarotCardArt.assets['m00'].alt` 相等，`exceptions:[]`；`tests/browser.test.cjs` 的「原创牌面按需加载」用例新增 `alt === manifestAlt` 断言。
- **第三轮修复复核（2026-11-04）：pass**。`node t16-verify.cjs`：学习页 m00（大阿卡纳）/w01/c01（小阿卡纳）与揭示页 m00 的 `alt` 均等于 manifest；`v38-fallback`（manifest alt 置空）→ `愚人原创牌面`；`v38-no-manifest`（拦截 manifest.js）→ `noArt:true`、牌面框隐藏、文字回退可见“原创牌面绘制中 · 以文字牌义为准”，`exceptions:[]`；`v38-alt.cjs` 复核 m00 一致。

### V-39【low】导入不校验 app/version

- **位置**：`features.js:151-203`（`prepareHistoryImport` 只校验 `history` 数组和单条记录字段，不检查 `payload.app`/`payload.version`）。
- **触发条件**：导入其他应用或未来版本的 JSON。
- **预期 vs 实际**：预期拒绝 `app !== 'xingjian-tarot'` 或版本不兼容的文件；实际 `{app:'other-app',version:99}` 被接受并写入。
- **复现**：`node "%TEMP%\tarot-audit\verify\data-verify.cjs"`（`D4-D5-D9-import`）
- **证据**：`wrongAppAccepted:1`，记录 `{id:"x-1",spreadId:"trinity"}`。
- **影响面**：可能导入结构相似但语义不同的数据，造成档案混乱。
- **修复建议**：校验 `payload.app === 'xingjian-tarot'` 且 `version <= 当前版本`，否则提示不兼容。
- **修复状态（2026-11-04）**：已修复。`features.js:11-12` 定义 `IMPORT_APP = 'xingjian-tarot'`、`IMPORT_VERSION = 2`；`features.js:168-174` 校验 `app` 与 `version`，不兼容时返回 `{records:[],rejected:1,incompatible:true,reason}`；`app.js:2587` 抛出带 reason 的错误并在导入面板提示。验证：`{app:'other-app',version:99}` → 0 条 + “这个文件不是星见塔罗导出的备份”；`{app:'xingjian-tarot',version:99}` → 0 条 + “备份来自更新版本”；无 app/version 的旧文件仍可导入。
- **第二轮独立复核（2026-11-04）**：pass。verify-t11 v39：wrongApp/futureVersion 均 `incompatible:true` 且 reason 正确；无 app/version 的旧备份仍可导入 1 条。

### V-40【low】洞察未知牌计入 totalCards 不计 elementTotal

- **位置**：`insights.js:102`（未知牌也 `totalCards++`）、`117`（`elementTotal` 只加已知牌）、`125-137`（未知牌成为守护牌，`id:''`、`name:'不存在的牌'`）、`221`（汇总用 `totalCards`）。
- **触发条件**：档案中出现牌库不存在的牌名（旧数据/手工修改）。
- **预期 vs 实际**：预期未知牌被忽略或单独提示；实际总数含未知牌、元素统计不含，守护牌显示“不存在的牌”。
- **复现**：`node "%TEMP%\tarot-audit\verify\data-verify.cjs"`（`D10-unknown-card`）
- **证据**：`{totalCards:3, elementTotal:2, guardian:{id:"",name:"不存在的牌",count:1}}`。
- **影响面**：统计口径不一致，用户看到“共 3 张”但元素分布只有 2 张。
- **修复建议**：未知牌单独计数并在 UI 提示“有 1 张牌无法识别”；或 `totalCards` 也只统计已知牌。
- **修复状态（2026-11-04）**：已修复。`insights.js:88/111/150` 新增 `unknownCards` 计数（未知牌仍计入 `totalCards`，保持既有语义）；`insights.js:227` 在汇总行追加“（其中 N 张无法识别，未计入元素分布）”。验证：3 张牌含 1 张未知 → `{totalCards:3, elementTotal:2, unknownCards:1}`，摘要显示提示。
- **第二轮独立复核（2026-11-04）**：pass。verify-t11 v40：`{totalCards:3,elementTotal:2,unknownCards:1}`；摘要“已收录 1 次占卜 · 3 张牌（其中 1 张无法识别，未计入元素分布）”。

### V-41【low】旧构建脚本缺 manifest 时仍可写入 v0.1.0/6 张清单

- **位置**：`scripts/build-card-assets.cjs:456-476`（`assertSafeToRun`：manifest 不存在时 `return`，解析异常时 `catch { return; }`，只有 `published > CARDS.length` 才拒绝）、`508`（写入 `version:'0.1.0'`、`published: CARDS.length`）。
- **触发条件**：在完整 78 张牌面的项目里误跑旧的 `build-card-assets.cjs`，且 manifest 缺失/损坏。
- **预期 vs 实际**：预期缺 manifest/解析失败时拒绝运行（fail-closed）；实际直接继续，覆盖 manifest 与同名 WebP/SVG 为 6 张 v0.1.0 样张。
- **复现**：代码审读；`node "%TEMP%\tarot-audit\verify\data-verify.cjs"` 不执行该脚本（避免改项目）。原审计在临时副本中验证。
- **证据**：`if (!fs.existsSync(manifestPath)) return;`（459）、`catch { return; }`（464）、`version: '0.1.0'`（508）。
- **影响面**：误操作会破坏生产牌面清单；脚本注释也承认“已被 build-card-deck.cjs 取代”。
- **修复建议**：缺 manifest 或解析失败时 `throw`，要求显式 `--force`；或在脚本开头检测 `published === 78` 直接拒绝。
- **修复状态（2026-11-04）**：已修复。`scripts/build-card-assets.cjs:456-484`（`assertSafeToRun`）：manifest 缺失（459-464）与解析失败（470-475）均改为 `throw`，提示先运行 `build-card-deck.cjs` 或显式 `--force`；`--force` 仍在 457 行最先放行。
- **第二轮独立复核（2026-11-04）**：pass。临时副本：manifest 缺失/损坏/published 78 三种情况均 exit 1，提示明确，未写出任何产物。

### V-42【low】资产目录拼写 taort-cards

- **位置**：`README.md:189`、`scripts/build-card-deck.cjs:25,198,207,222`、`assets/cards/ASSET_SPEC.md:30,47`、`assets/cards/LICENSE.md:8,19-100`、`tests/assets.test.cjs`、`tests/browser/harness.cjs`、`tests/server.test.cjs`。
- **触发条件**：按文档/脚本查找资产目录。
- **预期 vs 实际**：预期统一为 `tarot-cards`；实际大量文档和脚本写成 `taort-cards`（字母顺序错误）。
- **复现**：`node "%TEMP%\tarot-audit\verify\data-verify.cjs"`（`D8-D13-static.typoFiles`）
- **证据**：typoFiles 含 README、ASSET_SPEC、LICENSE、build-card-deck、tests 等。
- **影响面**：文档误导；若未来真的创建该目录会与现有 `assets/cards` 混淆。
- **修复建议**：全局替换为 `tarot-cards`（或删除过时引用），并加一条文档链接检查。
- **修复状态（2026-11-04）**：已修复。`git mv assets/cards/taort-cards assets/cards/tarot-cards`（78 个 JPG 随迁）；`README.md:189`、`assets/cards/ASSET_SPEC.md:30/47`、`assets/cards/LICENSE.md:8,19-100`、`scripts/build-card-deck.cjs:25,198,207,222`、`tests/assets.test.cjs:40/69`、`tests/browser/harness.cjs:42`、`tests/server.test.cjs:135` 全部改为 `tarot-cards`。验证：全仓搜索 `taort-cards` 仅剩本报告的历史描述，代码/文档/测试中无残留。
- **第二轮独立复核（2026-11-04）**：pass。全仓搜索 `taort` 仅剩本报告历史描述；`README.md`、`ASSET_SPEC.md`、`LICENSE.md`、`scripts/build-card-deck.cjs`、tests 均已改为 `tarot-cards`。

### V-43【low】顶栏按钮缺 aria-haspopup/expanded，无跳转链接

- **位置**：`index.html:32`（`app-container` 开头，无 skip link）、`index.html:41-44`（`#btn-daily/#btn-history/#btn-learning/#btn-sound` 无 `aria-haspopup`/`aria-expanded`）。
- **触发条件**：屏幕阅读器/键盘用户打开顶栏弹窗。
- **预期 vs 实际**：预期按钮声明弹出层类型和展开状态，页面提供“跳到主内容”链接；实际这些属性全为 null，也没有 skip link。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" static-a11y`
- **证据**：四个按钮 `haspopup/expanded` 全 null；`firstAnchor:null`。
- **影响面**：屏幕阅读器用户不知道按钮会打开弹窗；键盘用户每次要 Tab 过顶栏。
- **修复建议**：弹窗触发按钮加 `aria-haspopup="dialog"` 和动态 `aria-expanded`；页面顶部加 skip link。
- **修复状态（2026-11-04）**：已修复。`index.html:28`（body 首个可聚焦元素为 `跳到主内容`，指向 `#main-content`）、`index.html:43-44`（档案/图鉴按钮加 `aria-haspopup="dialog"`、`aria-controls`、`aria-expanded="false"`）、`index.html:185`（分享按钮同样处理）、`app.js:2276-2280`（`syncPanelTrigger` 在开关弹窗时同步 `aria-expanded`）、`style.css:63-82`（`.skip-link` 样式）。验证：`ui-verify.cjs static-a11y` → `firstAnchor:{href:"#main-content"}`、header `haspopup:"dialog", expanded:"false"`；`verify-t13.cjs` → 首个 Tab 为 skip link，Enter 后 `active:"main-content"`，开关面板时 `expanded` 同步 true/false。
- **第二轮独立复核（2026-11-04）**：pass。ui-verify static-a11y：首个链接 `#main-content`（文字“跳到主内容”）；档案/图鉴/分享按钮 `aria-haspopup:"dialog"`、`aria-expanded:"false"`；verify-t13 跳过链接后 `active:"main-content"`。

### V-44【low】档案条目 article[tabindex] 无语义/aria-expanded

- **位置**：`app.js:1904-1906`（`article.history-item` 设 `tabIndex=0`，无 `role`）、`app.js:1987-1993`（点击/Enter/Space 展开，但不同步 `aria-expanded`）。
- **触发条件**：屏幕阅读器用户浏览档案列表。
- **预期 vs 实际**：预期条目是按钮/可展开区域并带 `aria-expanded`；实际是 `ARTICLE tabindex=0`，`role=null`、`expanded=null`。
- **复现**：`node "%TEMP%\tarot-audit\verify\ui-verify.cjs" static-a11y`
- **证据**：`{tag:"ARTICLE", tabindex:"0", role:null, expanded:null}`。
- **影响面**：屏幕阅读器不播报“可展开”，用户不知道如何打开详情。
- **修复建议**：把标题行改为 `<button aria-expanded>`，或给 article 加 `role="button"` 并同步 `aria-expanded`。
- **修复状态（2026-11-04）**：已修复。`app.js:2117-2118`（档案条目 `role="button"` + `aria-expanded="false"`）、`app.js:2214`（展开/收起时同步 `aria-expanded`）。验证：`ui-verify.cjs static-a11y` → `{tag:"ARTICLE", role:"button", tabindex:"0", expanded:"false"}`。
- **第二轮独立复核（2026-11-04）**：pass。ui-verify static-a11y：档案条目 `role:"button"`、`tabindex:"0"`、`aria-expanded:"false"`；展开/收起同步。

## 五、驳回项（不纳入缺陷）

### R-01（原 B-15）幽灵抽牌测试固定等待 6s，注释写 10×900ms

- **原结论**：测试等待 6000ms，小于注释所说 10×900ms=9000ms，可能假绿/不稳定。
- **复核**：`tests/browser.test.cjs:1048-1060` 先启动自动抽牌、立刻返回并重新进入；断言是 `filled === 0`。旧定时器链若仍在运行，第一次抽牌在 900ms 就会发生，6s 足够捕获，断言会失败。因此 6s 不会造成假绿，只是注释与等待时长不一致。
- **判定**：false-positive（最多是注释文案问题，不构成缺陷）。

### R-02（原 D12）学习页牌阵画廊只展示 3 个牌阵、总数硬编码 78

- **原结论**：缺少 single/daily，硬编码 78。
- **复核**：`index.html:238` 的折叠标题明确写“牌阵位置说明（二择一 / 圣三角 / 凯尔特十字）”，说明 single/daily 是有意排除；`app.js:2232` 的循环与标题一致。牌库确实 78 张，硬编码与当前数据一致。
- **判定**：false-positive（设计选择，不是缺陷）。

## 六、覆盖缺口与未验证项

以下内容**没有**被首轮复核确认为缺陷，列出以免误以为已覆盖。以下为**首轮状态**；每项后的「第二轮状态」（2026-11-04）为本次更新，新增发现见第九节。

1. **真实上游网关/TLS**：所有 `/api/chat` 测试使用本地 mock；未连接 `<gateway-host>:52000`，未验证证书 SAN/SNI、CA 链、`rejectUnauthorized:false` 的实际风险、HTTP 网关明文 Bearer、真实密钥泄露。原 t2 的 U1–U9 仍为未验证疑点。
   - **第二轮状态：已关闭**——已连真实网关验证 TLS1.3/SAN/链/鉴权；TLS fail-open、README 叶证书、http 明文分别见 V2-05、V2-06、V2-18。
2. **静态文件边界**：符号链接逃逸、NTFS 备用数据流（`::$DATA`）、前缀白名单允许任意扩展名等未复现；仅代码审读认为现有 `resolve`/`relative` 守卫较强。
   - **第二轮状态：已关闭**——URL 层穿越/编码/反斜杠/ADS 全部挡住；junction 逃逸与任意扩展名同源 XSS 已在临时副本复现（V2-16/V2-17，需写权限）。
3. **真实移动设备与屏幕阅读器**：窄屏/横屏用无头 Chrome 视口模拟；未在 iOS Safari、Android Chrome、VoiceOver/TalkBack/NVDA 上实测。
   - **第二轮状态：部分关闭**——完成 390×844 视口模拟与 aria 树抽查；iOS Safari/Android/VoiceOver/TalkBack/NVDA 真机仍未测（V2-11/V2-12/V2-13 为模拟结论）。
4. **浏览器兼容性**：只测 Chromium 内核；Firefox/Safari 的 `inert`、`scrollIntoView`、Web Share、html2canvas 行为未验证。
   - **第二轮状态：部分关闭**——Chromium 实测；Firefox/Safari 的 inert/Web Share/html2canvas/audio 仍为代码级推断（V2-09/V2-10）。
5. **原生分享**：`navigator.share` 成功/失败/取消路径只做了代码审读和 mock，未在真实设备验证。
   - **第二轮状态：已关闭**——mock 覆盖成功/取消/失败/不支持与 canShare false/absent/throws；慢渲染激活丢失已复现（V2-02）；真机未测。
6. **html2canvas 内部**：长凯尔特十字、跨域图片、字体加载失败等边界未复现；只验证了“AI 生成中保存”这一条。
   - **第二轮状态：已关闭**——长凯尔特十字导出已复现正文丢失（V2-01），并验证 onclone 修复方案；跨域图片/字体加载失败仍未测。
7. **性能**：50 条档案上限下的搜索/渲染、超大 localStorage、长时间 usage 账本增长未做压力测试。
   - **第二轮状态：已关闭**——四场景压测 + 复核重跑（50 条/4MiB/凯尔特/首屏），数据一致；残余长任务见 V2-25。
8. **音频**：`audio.js` 已通读，未发现可复现缺陷；但未在真实浏览器验证 AudioContext 自动播放策略、切换设备后的行为。
   - **第二轮状态：部分关闭**——代码级确认 Safari interrupted 不恢复（V2-09）；自动播放策略合规（首次手势前不创建 context）；真机未测。
9. **第三方 `vendor/html2canvas.min.js`**：未做供应链/漏洞审计。
   - **第二轮状态：已关闭**——版本/哈希/漏洞/构建可重复性已验；无 SRI、1.4.1 停更见 V2-19，旧构建脚本见 V2-20/V2-21。
10. **`/api/chat` 无鉴权**：服务只监听 127.0.0.1，但本机任意网页是否可借 DNS rebinding/CSRF 调用未完整验证（`/api/config` 的 Host 问题已确认，见 V-34）。
   - **第二轮状态：已关闭**——Host/Origin/无 key 503 已实测；无 Origin 的非浏览器客户端仍可（V2-03）；真实 DNS rebinding 未搭环境。

## 七、修复优先级建议

### P0（立即，发布/数据安全）

1. **V-01** 复盘数据丢失：加 `keep` 选项，保存时只在用户改选后重算，删除自动清空。**（已修复，2026-11-04 复核）**
2. **V-05** 清空档案后无法保存：清空时重置 `currentHistoryId/historySaved`，或保存失败时自动重建。**（已修复，2026-11-04 复核）**
3. **V-06** 版本库缺失：把资产、模块、脚本、测试全部提交；CI 校验 `git status` 干净。**（已修复，commit b870511）**
4. **V-07** `/api/chat` 永久挂起：补 `upRes` 的 `error/aborted`、`res.on('close')`、响应体超时与客户端 `r.json()` 超时。**（已修复，2026-11-04 复核）**

### P1（本迭代，核心功能/安全）

5. **V-02** 输入法 Enter 守卫（两处）。**（已修复，2026-11-04 复核）**
6. **V-03** 窄屏聊天行布局（`min-width:0` + 换行/堆叠）。**（已修复，2026-11-04 复核）**
7. **V-04** 禁用按钮焦点恢复（或 `aria-disabled`）。**（已修复，2026-11-04 复核）**
8. **V-08** 追问会话校验。
9. **V-10/V-11** 坏数据归一化与逐条容错。
10. **V-12/V-13** 导入去重、每日记录必须 `spreadId==='daily'`、AI 文本更新已有记录。
11. **V-15** 保存长图前检查 `.ai-generating`。
12. **V-20/V-21** 视图切换焦点管理、清空确认态与异常处理。
13. **V-22/V-23** 上游错误通用化、响应大小上限。

### P2（下一迭代，体验/可访问性/测试）

14. **V-09** 搜索保留草稿。
15. **V-14** 关键词数据/展示统一。
16. **V-16–V-19** 弹窗滚动锁、live region、翻牌 ARIA、横屏学习布局。
17. **V-24/V-25** 测试改为容器级溢出断言 + 真实点击 + 连续 Tab。
18. **V-26/V-27** 每日一抽竞态、分享配文保护。

### P3（排期，低风险）

19. **V-28–V-44**：PORT 校验、优雅停机、.env 顺序、缓存版本、安全头、HEAD/405/429、Host 校验、限流/账本、资产规格、manifest.alt、导入版本、洞察统计、构建脚本防呆、目录拼写、顶栏/档案语义。

## 八、复现脚本清单

所有脚本位于 `%TEMP%\tarot-audit\verify\`（`C:\Users\GRYY2\AppData\Local\Temp\tarot-audit\verify\`），只读项目文件，使用随机端口/本地 mock：

| 脚本 | 用途 |
|---|---|
| `lib.cjs` | 复用项目 `tests/browser/harness.cjs`，恢复真实时钟，提供每日/三牌阵到报告的快捷路径 |
| `ui-verify.cjs` | UI/状态/可访问性场景；`core`、`a11y` 或单个场景名 |
| `server-verify.cjs` | 静态服务、AI 代理、限流、错误透传、大小上限、PORT、SIGTERM、.env 顺序 |
| `data-verify.cjs` | 牌库/学习/洞察/导入/资产规格静态校验 |
| `overflow-check.cjs` | 320px 下 document 与报告容器的溢出对比 |
| `chat-click-filled.cjs` | 320/360/390/414 下填入追问内容后用真实 CDP 鼠标点击发送按钮 |
| `chat-row-wide.cjs` | 481–1280 桌面宽度聊天行布局回归 |
| `client-timeout-check.cjs` | 客户端 60s 响应体超时（200 后 body 卡住） |
| `save-focus-check.cjs` | 保存长图后焦点恢复 |
| `normal-chat.cjs` | 正常 `/api/chat` 200 + usage 落盘 |
| `normal-enter.cjs` | 普通（非组合期）Enter 仍能提交问题/追问 |
| `history-keep.cjs` | 历史档案编辑器 keep/改期回归 |
| `review-null.cjs` | 未设置复盘时保存行动不写入日期 |
| `stale-debug.cjs` | 旧追问回复落入新局的时间线调试（辅助） |
| `ui-results.json` / `data-results.json` / `server-verify.log` | 本次复核的原始输出 |

原始审计脚本仍在 `%TEMP%\tarot-audit\{frontend,server,data,browser}\`，可用于交叉对照。

## 九、第二轮审计（覆盖缺口）

> 审计日期：2026-11-04。范围：首轮第六节列出的 10 项覆盖缺口。方法：不采信 t1–t4 的实现者结论，独立重跑 TLS/静态边界/浏览器导出与分享/可访问性/画布尺寸/性能/服务端冒烟，并逐条审读对应代码行。第二轮脚本与原始输出在 `%TEMP%\tarot-audit2\verify\`；t2–t4 的原始证据在 `%TEMP%\tarot-audit2\{browser,perf,data}\`，复核时按需重跑或抽查。

### 9.1 复核结论

- 首轮 44 条 confirmed 仍全部关闭，本轮未发现回归。回归命令：`npm run check`（exit 0）、`npm test`（57/57 pass）、`npm run test:browser`（37/37 pass，57.7–66.9s）；真实 `server.js` 随机端口冒烟通过。
- 新增 **25 条**：**high 1、medium 7、low 17**，无 blocker。编号 V2-01…V2-25，与首轮 V-01…V-44 不重叠。
- 第六节 10 项缺口：**7 项关闭**、**3 项部分关闭**（真实移动设备/读屏、音频、`/api/chat` 鉴权的真实 rebinding 环境），逐项状态见 9.6。
- **修复复核（2026-11-04，t6–t9 后）**：25 条中 **23 条已修复**、**2 条未修复**（V2-08 环境 ACL、V2-25 性能优化项）。新增 **V3-01（medium）**：多列报告导出时关闭的「为什么这样看」`details` 正文仍被 html2canvas 绘制并与下一块重叠；该条由 t11 在 `app.js:1448-1453` 的 `onclone` 样式中补 `details:not([open]) .reading-basis-body{display:none!important}` 修复，t12 复核通过。逐条状态见 9.2 表与 9.3 各条末尾。回归：`npm run check` exit 0、`npm test` 58/58、`npm run test:browser` 41/41（93.2s）、真实 `server.js` 随机端口冒烟 ok。
- 对 t1–t4 结论的修正（复核后定级/表述变化）：
  1. t2「长图导出正文与牌面全部丢失」：正文丢失**确认**（真实点击保存，3/3 解读块空白）；**牌面未丢失**（每次渲染都在；素材 600×1000 与 3:5 卡框同比例，`object-fit` 在此为 no-op）。定级 high 而非 blocker：导出是附加功能，不影响主流程数据。
  2. t4「UTF-16 截断导致 UTF-8 变 U+FFFD」：机制成立但表述不精确。应用自身导出的 JSON 会把孤立代理项转义为 `\ud83d`，文件仍是合法 JSON；只有再经 UTF-8 编码（复制到外部工具）才变 U+FFFD。用户可见后果是半个 emoji 变成 �。定级 medium。
  3. t2「inert 无降级」由 P1 降为 low：代码虽无特性检测，但 `app.js:2362-2390` 有手动 Tab 陷阱，旧浏览器里键盘仍困在弹窗内；残余风险是读屏仍能读到背景内容。
  4. t4「vendor 无 SRI」由中降为 low：本地静态文件、无 CDN、项目零运行时依赖；SRI 防的是文件被替换，与 ACL 问题（V2-08）同源，单列会重复计分。
  5. t3 首屏 346,390B 是**下界**：harness 屏蔽了 Google Fonts；真实首屏含字体 CSS/woff2，预算占用会高于 65.1%。

### 9.2 新发现清单

| 编号 | 级别 | 标题 | 位置 | 来源 | 修复状态（2026-11-04） |
|---|---|---|---|---|---|
| V2-01 | high | 长图导出丢失全部解读正文 | `app.js:1385-1411`、`style.css:1290-1295` | t2 复核 | 已修复 |
| V2-02 | medium | 系统分享慢渲染丢失用户激活 | `app.js:2911-2931` | t2 复核 | 已修复 |
| V2-03 | medium | `/api/chat` 缺 Host/Content-Type/Sec-Fetch-Site/scheme 校验 | `server.js:332-334,343-348,501-504` | t1 复核（合并 S-05…S-08） | 已修复 |
| V2-04 | medium | 固定 `scale:2` 使长图超 iOS canvas 上限 | `app.js:1387` | t2/t3 复核 | 已修复 |
| V2-05 | medium | 网关 CA 缺失/读取失败时 TLS fail-open | `server.js:83-93` | t1 复核（合并 S-01/S-02） | 已修复 |
| V2-06 | medium | README 导出叶证书，按文档配置必 502 | `README.md:36-62` | t1 复核（S-03） | 已修复 |
| V2-07 | medium | 导入 UTF-16 截断劈开代理对 | `app.js:357,1995-1997,2005-2006`、`features.js:132-134,210-220` | t4 复核 | 已修复 |
| V2-08 | medium | `.env`/项目 ACL 任意本地用户可读写（环境） | `.env`、项目目录 | t1 复核（S-14） | 未修复（环境） |
| V2-09 | low | Safari `interrupted` 音频不恢复 | `audio.js:29-42` | t2 复核 | 已修复 |
| V2-10 | low | `inert` 无特性检测 | `app.js:2334,2352` | t2 复核（降级） | 已修复 |
| V2-11 | low | iOS 输入框 0.82–0.9rem 聚焦缩放 | `style.css:1513-1522,2101-2115,2249-2253,2461-2469` | t2 复核 | 已修复 |
| V2-12 | low | 弹窗标题用 `span` 而非 heading | `index.html:238,267,300` | t2 复核 | 已修复 |
| V2-13 | low | 两个动态区域无 live region | `index.html:212,221` | t2 复核 | 已修复 |
| V2-14 | low | 无 CSP | `server.js:125-129` | t1 复核（S-12） | 已修复 |
| V2-15 | low | 限流 key 可被 `x-session-id` 绕过 | `server.js:183-204` | t1 复核（S-09） | 已修复 |
| V2-16 | low | 静态前缀任意扩展名同源 XSS | `server.js:110-123,554` | t1 复核（S-10） | 已修复 |
| V2-17 | low | junction/硬链接逃逸 | `server.js:529-536,563` | t1 复核（S-11） | 已修复 |
| V2-18 | low | http 网关明文 Bearer | `server.js:371-384` | t1 复核（S-04） | 已修复 |
| V2-19 | low | vendor 无 SRI/版本清单，1.4.1 停更 | `app.js:1349-1368` | t4 复核（降级） | 已修复 |
| V2-20 | low | 旧构建脚本 `--force` 降级 6 张资产 | `scripts/build-card-assets.cjs:452-495` | t4 复核 | 已修复 |
| V2-21 | low | 零字节 WebP 通过校验、manifest 无逐文件哈希 | `scripts/build-card-deck.cjs:168-193` | t4 复核 | 已修复 |
| V2-22 | low | 洞察统计口径偏差 | `insights.js:99,107-117,144` | t4 复核 | 已修复 |
| V2-23 | low | 非法 JSON/非数组静默空档案 | `app.js:1862-1873` | t3 复核 | 已修复 |
| V2-24 | low | 浏览器测试默认 reduced-motion，导出/分享无回归 | `tests/browser.test.cjs:56` | 复核新增 | 已修复 |
| V2-25 | low | 大数据量冷开/翻牌/保存长任务 | 渲染与保存路径（perf 场景） | t3 复核 | 未修复（低） |
| V3-01 | medium | 多列长图导出时关闭的「为什么这样看」正文与下一块重叠 | `app.js:1440-1447`、`style.css` details 规则 | 第三轮复核新增 | 已修复（2026-11-04） |

### 9.3 详细发现

#### V2-01【high】长图导出丢失全部解读正文

- **位置**：`app.js:1385-1411`（`options` 与 `onclone`）、`app.js:1387`（`scale: 2`）、`style.css:1290-1295`（`.animate-slide-up` 的 `opacity: 0` + `animation`）、`style.css:863-868`（`.card-art`）。
- **触发条件**：非 `prefers-reduced-motion` 用户完成解读后点击「保存长图」。html2canvas 克隆文档时动画从 0 重新开始，渲染发生在 `opacity` 尚未到 1 的瞬间。
- **预期 vs 实际**：预期长图包含位置解读、综合解读、祝福三块正文；实际真实点击保存的 PNG 中三块**全部空白**，只剩标题、牌面、目录与行动区。`onclone` 只处理了 `.console-box`、`body` 背景与 `.glass-panel`，没有处理动画终态。
- **复现**：`node "%TEMP%\tarot-audit2\verify\probe-export-real.cjs"`（真实点击 `#btn-save-report`，下载到 `%TEMP%\tarot-audit2\verify\artifacts\real-save.png`）；对照 `probe-export.cjs`（直接调用 html2canvas，分别用默认与强制终态）。
- **证据**：
  - `real-save.png`：2104×4552、718,171 B；克隆文档三个 `.reading-block` 的 `opacity` 为 `[0, 0, 0]`；正文区亮像素（亮度 >110）仅 94,170。
  - 默认渲染 `dataURL` 1,508,194 字符，强制终态后 1,934,234 字符；像素差 406,091，亮像素 197,940 → 327,626。
  - 截图 `real-save-top.png` 中「01 核心启示」等三块只有标题与留白；`export-fixed-top.png` 中同一块牌名、关键词、表格完整。
- **影响面**：所有未开启减少动效的用户；导出的核心价值（AI 解读正文）丢失，且逐块不确定（实测有 0/3 全空白，也有 2/3 半透明），用户很难判断是渲染 bug。现有 37 条浏览器测试默认 `reduceMotion: true`，因此全绿也未覆盖（见 V2-24）。
- **修复建议**：在 `onclone` 中对 `.animate-slide-up` 强制 `animation: none; opacity: 1; transform: none;`（或给克隆根加一个覆盖 class）；`.card-art` 设 `opacity: 1`（`object-fit` 无需改，素材与卡框同为 3:5）。补一条 `reduceMotion: false` 的导出回归，断言克隆文档 `opacity === "1"` 或导出 canvas 在正文区域有非背景像素。

**修复状态（2026-11-04）：已修复。** t6 在 `onclone` 注入样式强制 `.animate-slide-up` 终态（`animation:none; opacity:1; transform:none`）并令 `.card-art` 可见；真实点击 `#btn-save-report`（`reduceMotion:false`）三块正文恢复，克隆 opacity `[1,1,1]`、亮像素 94,170 → 312,307。残余的多列 `details` 重叠（V3-01）由 t11 在 `app.js:1448-1453` 补 `details:not([open]) .reading-basis-body{display:none!important}` 修复；t12 复核：凯尔特 10 个关闭 details 全部 `display:none`、body 高 0，12 个正文块亮像素均 >0；打开态第 1 个 details 正文仍绘制（亮像素 9,523）。

#### V2-02【medium】系统分享慢渲染丢失用户激活

- **位置**：`app.js:2911-2931`（`await createShareCanvas()` 在 2920、`await canvas.toBlob` 在 2921、`await navigator.share(data)` 在 2927）。
- **触发条件**：首次点击「系统分享」，且 html2canvas 渲染 + `toBlob` 超过浏览器瞬态激活窗口（Chrome 约 5s，Safari 更短）。
- **预期 vs 实际**：预期弹出系统分享面板；实际慢渲染（mock 延迟 6s）下 `navigator.share` 在 t=7694ms 调用，`navigator.userActivation.isActive === false`，抛 `NotAllowedError`，只显示 toast「暂时无法唤起系统分享，可下载卡片或复制文案。」。
- **复现**：`node "%TEMP%\tarot-audit2\verify\probe-share.cjs"`（mock `navigator.share`，记录激活状态；慢路径用 Node `setTimeout` 延迟，避免 `Page.eval` 的 `userGesture: true` 重新授予激活）。
- **证据**：`share-probe.json` 慢路径 `{active:false, error:"NotAllowedError", renderMs:9005, wrapperCalls:1}`；快路径 `{active:true, ok:true}`。分享数据含 `title/text/files`。
- **影响面**：低端机、凯尔特 10 牌（渲染 491–555ms，`toBlob` 另计，dataURL 3.16–3.53MB）时可能超窗；iOS Safari 激活窗口更短，概率更高。分享是核心传播路径。
- **修复建议**：在进入阅读页或打开分享面板时预渲染并缓存 `Blob`，点击时同步调用 `navigator.share({files:[file], title, text})`；渲染未完成时禁用按钮并显示进度，而不是点击后才开始渲染。

**修复状态（2026-11-04）：已修复。** `prepareShareImage` 预渲染并缓存 Blob，打开分享面板即开始渲染，按钮显示「正在准备分享图…」；点击时同步调用 `navigator.share`。6s 慢渲染 mock 下两次点击（含切换隐私后重渲染）`userActivation.isActive` 均为 `true`，文件 554,833 B / 630,858 B。

#### V2-03【medium】`/api/chat` 缺 Host/Content-Type/Sec-Fetch-Site/scheme 校验

- **位置**：`server.js:332-334`（仅当请求带 `Origin` 才校验）、`server.js:343-348`（不要求 JSON）、`server.js:501-504`（`/api/chat` 路由无 `isLocalHost`）、`server.js:212-222`（`isLocalHost` 只比 host）。
- **触发条件**：非浏览器客户端，或 DNS rebinding 页面，向 `/api/chat` 发 `POST` 且不带 `Origin`；或带 `Content-Type: text/plain`；或带 `Sec-Fetch-Site: cross-site`。
- **预期 vs 实际**：预期只接受本机同源 JSON 请求；实际 `Host: evil.example.com` + 无 `Origin` → 200 并转发上游；`Content-Type` 不校验；`Sec-Fetch-Site` 被忽略；`isLocalHost` 只比较 host，不比较 scheme（`https://127.0.0.1:port` 也通过）。
- **复现**：`node "%TEMP%\tarot-audit2\verify\tls-failopen.cjs"` 的 host 段；`node "%TEMP%\tarot-audit2\verify\server-host-smoke.cjs"`（确认 `/api/config`、`/api/usage` 对 foreign Host 返回 403，而 `/api/chat` 没有该保护）；t1 的 `csrf-raw-report.json`。
- **证据**：`/api/chat` + `Host: evil.example.com` + 无 Origin → 200；`Origin: http://evil.example.com` → 403 `forbidden origin`；`/api/config`、`/api/usage` + foreign Host → 403 `forbidden host`。
- **影响面**：本机其他网页在旧浏览器/非浏览器客户端可借 rebinding 或直接 `fetch` 调用付费 AI；现代浏览器会带 `Origin` 被挡，因此是纵深防御缺口而非直接可利用漏洞。
- **修复建议**：`/api/chat` 复用 `isLocalHost`；要求 `Content-Type: application/json`（否则 415）；拒绝 `Sec-Fetch-Site: cross-site/same-site`；`isLocalHost` 比较完整 origin 并要求 `http`。

**修复状态（2026-11-04）：已修复（scheme 未比较，风险可忽略）。** `/api/chat` 现校验 Host（403）、`Sec-Fetch-Site`（cross-site/same-site 403）、`Content-Type: application/json`（415），正常本机 JSON 仍 200；无 Origin 请求按设计放行，`https://127.0.0.1:port` Origin 仍 200（host:port 必须匹配，无法跨站利用）。

#### V2-04【medium】固定 `scale:2` 使长图超 iOS canvas 上限

- **位置**：`app.js:1387`（`scale: 2` 写死）。
- **触发条件**：凯尔特十字 10 张 + 较长 AI 解读，在桌面 1280 或移动 390 视口导出长图。
- **预期 vs 实际**：预期各端都能生成；实际桌面 canvas 2104×9498 = **19,983,792 px**（超 iOS Safari 16,777,216 上限 1.19 倍），移动 684×22118 = **15,128,712 px**（已达上限的 90.2%），解读再长一点就超。
- **复现**：`node "%TEMP%\tarot-audit2\verify\probe-canvas-size.cjs"`（凯尔特 10 牌、`ai:false` 本地文案）；`node "%TEMP%\tarot-audit2\perf\perf-audit.cjs"` 的 celtic 场景复测到 2104×9556 = 20.1M px。
- **证据**：`canvas-size-probe.json` 桌面 `{w:2104,h:9498,px:19983792,bytes:76.2MB,renderMs:555,dataUrlMB:3.16,overIosLimit:true}`；移动 `{w:684,h:22118,px:15128712,bytes:57.7MB,renderMs:491,dataUrlMB:3.53,overIosLimit:false}`。
- **影响面**：iOS Safari 上超限 canvas 通常得到空白图或静默失败；移动端已贴顶，长解读必超。桌面 Chrome 可生成，但 76MB 内存 + 3MB dataURL 在低端机有 OOM 风险。
- **修复建议**：按像素预算动态计算 `scale = Math.min(2, Math.sqrt(16.7e6 / (w * h)))`，下限 1；或对超长报告分页导出；导出前检测 `canvas.width * canvas.height` 并提示。

**修复状态（2026-11-04）：已修复。** 新增 `exportScaleFor`（16M 像素上限、5% 余量、上限 2、下限 1）；凯尔特 10 牌真实导出 1862×8101 = 15,084,062 px（<16M），scale 1.7733，正文亮像素 1,002,195，文字可读。

#### V2-05【medium】网关 CA 缺失/读取失败时 TLS fail-open

- **位置**：`server.js:83-93`（`fs.readFileSync(GATEWAY_CA_PATH)` 的 catch 只记日志，`gatewayCa` 保持 `null` → `TLS_VERIFY=false` → agent `{rejectUnauthorized:false}`）。
- **触发条件**：未配置 `TAROT_GATEWAY_CA`；或路径是目录/权限错误（`EISDIR`/`EACCES`）等非 `ENOENT` 错误；或 CA 文件为空。
- **预期 vs 实际**：预期未配置 CA 时 fail-closed（拒绝连接，或要求显式 `TAROT_ALLOW_INSECURE_TLS=1`）；实际静默关闭校验并继续代理。
- **复现**：`node "%TEMP%\tarot-audit2\verify\tls-failopen.cjs"`（真实 `server.js` + 本机 TLS mock；CA、叶证书、自签冒充者均由 openssl 生成）。
- **证据**：
  - 无 CA + 自签冒充者 → 200，冒充者收到 `Authorization: Bearer verify-key-123`（`mitm` 分支）。
  - CA 指向目录 → 200，stderr `读取网关证书失败： EISDIR…` + `⚠️ 未配置网关证书，TLS 校验已关闭，存在中间人风险`（`ca-dir` 分支）。
  - CA 缺失 → 200，TLS 校验关闭（`ca-missing` 分支）。
  - 空 CA 文件 → 502（`Boolean(Buffer)` 为 true，校验开着但没有信任锚；与首轮 S-15 一致）。
- **影响面**：本机恶意程序或网络中间人可冒充网关拿到真实 API Key（Bearer），进而消耗额度、读取对话；需要能改 hosts/代理或本机监听。
- **修复建议**：非 `ENOENT` 直接退出；未配置 CA 默认拒绝启动，或要求显式 `TAROT_ALLOW_INSECURE_TLS=1`；用 `gatewayCa.length > 0` 判断是否配置；错误提示区分「未配置/读不到/空文件」。

**修复状态（2026-11-04）：已修复。** CA 缺失时默认使用系统信任库且 `rejectUnauthorized:true`；CA 读取失败（EISDIR/EACCES）或空文件启动即 exit 1；仅 `TAROT_ALLOW_INSECURE_TLS=1` 才回退并打印中间人警告；正常 CA 握手 200。

#### V2-06【medium】README 导出叶证书，按文档配置必 502

- **位置**：`README.md:36-62`（`openssl s_client -connect … -showcerts | openssl x509 -outform PEM > gateway-ca.crt`）。
- **触发条件**：按 README 操作生成 `gateway-ca.crt` 并启动服务。
- **预期 vs 实际**：预期校验通过；实际 `x509` 导出的是**叶证书**（subject `CN=<gateway-host>`），Node 把它当信任锚，握手报 `unable to verify the first certificate`，所有 `/api/chat` 502。
- **复现**：`node "%TEMP%\tarot-audit2\verify\tls-failopen.cjs"` 的 `readme-leaf-as-ca` 分支；t1 的 `readme-ca.pem`。
- **证据**：502 `{"error":"无法连接网关"}`，stderr `无法连接网关： unable to verify the first certificate`；叶证书 issuer 为 `CN=<gateway-ca>`；项目根目录当前存在的 `gateway-ca.crt`（未跟踪）是自签根（`CA:TRUE`，subject=issuer `CN=<gateway-ca>`），用它握手 `authorized: true`。
- **影响面**：所有照文档配置的用户 100% 不可用，且容易误判为网关故障。
- **修复建议**：文档改为导出根证书（`-showcerts` 取链中最后一张，或从 Windows 证书存储导出 `<gateway-ca>`）；或直接说明项目根目录的 `gateway-ca.crt` 可用并给出 SHA-256 指纹；增加 `openssl verify -CAfile gateway-ca.crt` 自检步骤。

**修复状态（2026-11-04）：已修复。** README 证书小节重写：项目 `gateway-ca.crt` 为自签根（subject=issuer `CN=<gateway-ca>`，SHA-256 `3C:4F:13:…:22:9C`），`openssl verify -CAfile gateway-ca.crt gateway-ca.crt` 与真实叶证书校验均 OK；文档明确禁止 `s_client | x509` 导出叶证书，并补充 fail-closed、Windows 证书存储导出与 ACL 收紧说明。

#### V2-07【medium】导入 UTF-16 截断劈开代理对

- **位置**：`app.js:357`（问题 200）、`app.js:1995-1997`（positions/synthesis 2000、blessing 1000）、`app.js:2005-2006`（synthesis 600、blessing 300）、`features.js:132-134`（`cleanText`）、`features.js:210-220`（导入字段）。
- **触发条件**：导入或输入在截断边界上含 emoji（代理对）的文本，例如 199 个 ASCII 字符 + 🔮。
- **预期 vs 实际**：预期截断到上限且不产生非法字符；实际 `slice(0, limit)` 按 UTF-16 码元切，留下孤立高代理项 `0xD83D`。
- **复现**：t4 的 `data-boundary.cjs` 的 `emoji-boundary` 用例（46 项中唯一失败）；复核用 `node -e` 复算。
- **证据**：`'a'.repeat(1999) + '😀'` 截到 2000 后末位 `charCodeAt(1999) === 0xD83D`、`isWellFormed() === false`；`JSON.stringify` 输出 `\ud83d`（导出文件仍是合法 JSON，导入后孤立代理项保留）；`Buffer.from(str, 'utf8')`/`TextEncoder` 得到 `EF BF BD`（U+FFFD）；浏览器渲染为 �。
- **影响面**：问题、位置解读、综合解读、祝福、复盘文本均可能触发；用户看到半个 emoji 变成 �，原字符不可恢复。不影响 JSON 解析。
- **修复建议**：用 `Array.from(str).slice(0, limit).join('')` 按码点截断，或 `slice` 后检查末位是否高代理项并去掉；抽公共 `truncateText(str, limit)` 替换上述 5 处。

**修复状态（2026-11-04）：已修复。** `features.js` 新增 `truncateCodePoints`（`Array.from` 按码点截断），问题/档案字段改用该函数；`a×199+🔮+b` 截 200、`a×1999+😀` 截 2000 均 well-formed、以完整 emoji 结尾，导入与 JSON 往返不产生孤立代理项或 U+FFFD。

#### V2-08【medium】`.env`/项目 ACL 任意本地用户可读写（环境）

- **位置**：`.env`（`TAROT_API_KEY`）与项目目录 ACL。
- **触发条件**：同机其他本地用户账户读取/修改项目文件。
- **预期 vs 实际**：预期仅当前用户可读写；实际 ACL 继承 `NT AUTHORITY\Authenticated Users:(I)(M)`，任意已认证本地用户可读 key、改 `app.js`/`server.js`。
- **复现**：`icacls .env`、`icacls .`；`git check-ignore -v .env` 确认未跟踪。
- **证据**：`icacls` 输出含 `NT AUTHORITY\Authenticated Users:(I)(M)` 及 4 个 SID 的 `(I)(M)`；`.env` 在 `.gitignore` 中，`git ls-files` 无输出。
- **影响面**：多用户共享机器上 API Key 泄露、代码被植入；单用户家用机风险低。属部署环境问题，非代码缺陷。
- **修复建议**：`icacls .env /inheritance:r /grant:r "%USERNAME%:F"`；项目目录去掉 Authenticated Users 继承；或用 DPAPI/凭据管理器保存 key。

**修复状态（2026-11-04）：未修复（环境）。** 代码侧无法自动收紧 ACL；README 已新增 `.env`/项目目录 `icacls` 收紧示例。当前 ACL 仍为 `Authenticated Users:(I)(M)`，需部署者执行。

#### V2-09【low】Safari `interrupted` 音频不恢复

- **位置**：`audio.js:29-42`（`ensureContext`）。
- **触发条件**：iOS Safari 来电、切后台、其他 App 播放后 `AudioContext` 进入 `interrupted`。
- **预期 vs 实际**：预期回到页面或下次手势时恢复；实际只处理 `closed`（重建）与 `suspended`（`resume`），`interrupted` 既不重建也不恢复，音效永久静音直到刷新。
- **复现**：代码审读 + mock `AudioContext` 状态机（未在真机）。
- **证据**：`ensureContext` 仅 `state === 'closed'` 重建、`state === 'suspended'` resume；无 `visibilitychange`/`pageshow` 监听；`play()` 的 `catch` 静默。
- **影响面**：iOS 用户音效偶发永久失效；音效默认关闭，影响面小。
- **修复建议**：把 `interrupted` 与 `suspended` 同等处理（先 `resume`，失败则重建）；监听 `visibilitychange`/`pageshow`，页面可见时 `resume`。

**修复状态（2026-11-04）：已修复。** `audio.js` 增加 `unlocked` 状态，`resumeContext` 处理 `suspended` 与 `interrupted`，并在 `visibilitychange`/`pageshow` 时恢复；关闭开关后不再恢复。fake AudioContext 实测 interrupted→visibilitychange、suspended→pageshow 各恢复一次，禁用后不恢复。

#### V2-10【low】`inert` 无特性检测

- **位置**：`app.js:2334`、`app.js:2352`。
- **触发条件**：不支持 `inert` 的旧浏览器（Safari < 15.5、Firefox < 112 等）。
- **预期 vs 实际**：预期弹窗打开时背景不可交互、不可被读屏；实际 `container.inert = true` 被忽略，背景仍可 Tab/读屏。
- **复现**：`node "%TEMP%\tarot-audit2\verify\probe-dom-a11y.cjs"`（Chrome `inert` 支持为 true）；旧内核未实测。
- **证据**：代码无 `'inert' in HTMLElement.prototype` 检测；`app.js:2362-2390` 有手动 Tab 陷阱，键盘不会逃出弹窗。
- **影响面**：旧浏览器读屏用户可能读到背景内容；键盘用户仍被陷阱困住。低。
- **修复建议**：特性检测，不支持时给 `.app-container` 加 `aria-hidden="true"`（关闭时移除）并保留 Tab 陷阱；或引入 `inert` polyfill。

**修复状态（2026-11-04）：已修复。** 新增 `supportsInert` 特性检测；不支持时对背景容器设 `aria-hidden=true`、可聚焦元素 `tabindex=-1`，关闭时完整恢复。删除 `HTMLElement.prototype.inert` 模拟后实测焦点进入关闭按钮、背景不可达，Escape 后恢复。

#### V2-11【low】iOS 输入框 0.82–0.9rem 聚焦缩放

- **位置**：`style.css:1513-1522`（`.ai-chat-input-row input` 0.9rem）、`style.css:2101-2115`（`.reflection-card textarea` 等 0.83rem）、`style.css:2249-2253`（`.history-toolbar input/select` 0.82rem）、`style.css:2461-2469`（`.learning-toolbar input` 0.84rem）。
- **触发条件**：iOS Safari 聚焦小于 16px 的输入框。
- **预期 vs 实际**：预期不缩放；实际自动放大页面，失焦后可能不恢复，布局跳动。
- **复现**：`node "%TEMP%\tarot-audit2\verify\probe-dom-a11y.cjs"`（390×844 计算样式）。
- **证据**：8 个输入的计算字号 13.12–14.4px（另 `#user-question` 17.6px 正常）：`#ai-chat-input` 14.4、`#action-input` 13.12、`#history-search`/`#history-category`/`#history-review-filter` 13.12、`#learning-search` 13.44、`#share-caption` 13.28、`#review-offset` 13.12。
- **影响面**：iOS 用户每次输入都要手动缩小，体验差；不影响功能。
- **修复建议**：移动端媒体查询把这些输入统一到 `font-size: 16px`（可用 `@supports (-webkit-touch-callout: none)`），视觉大小用 padding/缩放补偿。

**修复状态（2026-11-04）：已修复。** `@media(max-width:480px)` 将 8 个输入/下拉/文本域设为 16px；390×844 实测除 `#user-question` 17.6px 外全部 16px，视觉层级保留。

#### V2-12【low】弹窗标题用 `span` 而非 heading

- **位置**：`index.html:238`（`#learning-title`）、`index.html:267`（`#share-title`）、`index.html:300`（`#safety-title`）；三个 dialog 用 `aria-labelledby` 指向这些 `span`。
- **触发条件**：读屏用户用标题导航（H/heading 快捷键）在弹窗内跳转。
- **预期 vs 实际**：预期弹窗标题是可导航标题；实际是 `span`，有可访问名但不是 heading，标题导航会跳过。
- **复现**：`node "%TEMP%\tarot-audit2\verify\probe-dom-a11y.cjs"` 的 aria 树。
- **证据**：三个 dialog 的 accessible name 正常，但 role 非 heading；`#history-panel` 用 `aria-label`，无此问题。
- **影响面**：读屏标题导航效率；低。
- **修复建议**：改为 `<h2>`（保留 id 与样式），或加 `role="heading" aria-level="2"`。

**修复状态（2026-11-04）：已修复。** 四个弹窗标题改为 `h2` 并保留 id，history 面板补 `aria-labelledby`；`font:inherit` 保持原视觉。AX 断言四者均为 H2 且名称正确。

#### V2-13【low】两个动态区域无 live region

- **位置**：`index.html:212`（`#history-review-summary`）、`index.html:221`（`#insights-body`）。
- **触发条件**：切换复盘筛选、刷新洞察后内容变化。
- **预期 vs 实际**：预期读屏播报变化；实际无 `aria-live`/`role`，静默更新。
- **复现**：`node "%TEMP%\tarot-audit2\verify\probe-dom-a11y.cjs"`。
- **证据**：两元素无 `aria-live`/`role=status`；其余 6 个动态区（`ai-status-badge`、`draw-status`、`ai-chat-messages`、`reflection-save-status`、`learning-count`、`toast`）已有 live。
- **影响面**：读屏用户不知道筛选结果/洞察已更新；低。
- **修复建议**：加 `aria-live="polite"`；洞察体量大时用 `role="status"` 只播报摘要，避免整段朗读。

**修复状态（2026-11-04）：已修复。** `#history-review-summary` 加 `role=status`，`#insights-body` 加 `aria-live=polite`；断言通过，无重复播报节点。

#### V2-14【low】无 CSP

- **位置**：`server.js:125-129`（`SECURITY_HEADERS`）。
- **触发条件**：任意页面加载。
- **预期 vs 实际**：预期有 CSP 限制脚本/连接；实际只有 `nosniff`、`no-referrer`、`DENY`。
- **复现**：`node "%TEMP%\tarot-audit2\verify\server-smoke.cjs"` 检查响应头。
- **证据**：所有响应无 `Content-Security-Policy`；`index.html:23` 的字体 `<link>` 带内联 `onload="this.media='all'"`，CSP 需要 `'unsafe-inline'` 或改造该行。
- **影响面**：若出现 XSS（如 V2-16），CSP 不能兜底；低。
- **修复建议**：先上 `Content-Security-Policy-Report-Only`：`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'`。后续把内联 `onload` 移到 `app.js`，去掉 `'unsafe-inline'`。

**修复状态（2026-11-04）：已修复。** 服务端下发 CSP（`default-src 'self'`、`script-src 'self'`、`script-src-attr 'unsafe-inline'`、Google Fonts 白名单、`frame-ancestors 'none'` 等，304 字符）；真实页面加载 CSP violation 为空数组。

#### V2-15【low】限流 key 可被 `x-session-id` 绕过

- **位置**：`server.js:183-204`（`rateLimit`）。
- **触发条件**：客户端每次请求轮换 `x-session-id`。
- **预期 vs 实际**：预期按 IP 限流；实际 key 为 `remoteAddress|x-session-id|origin`，其中 session id 由客户端控制，轮换即可绕过。
- **复现**：t1 的限流脚本（35 次请求全部 200，上游 35 次）。
- **证据**：代码 `key = \`${req.socket.remoteAddress}|${sessionId}|${origin}\``；t1 记录 35×200。
- **影响面**：本机恶意页面可绕过限流消耗额度；低（需能发请求）。
- **修复建议**：限流 key 去掉 `x-session-id`（或改为服务端签发的不可伪造 token）；增加全局/每日上限。

**修复状态（2026-11-04）：已修复。** 限流 key 改为 `socket.remoteAddress + 固定盐`，忽略 `x-session-id`；轮换 `x-session-id` 的第 31 次请求仍 429「请求过于频繁，请稍后再试」。

#### V2-16【low】静态前缀任意扩展名同源 XSS

- **位置**：`server.js:110-123`（前缀白名单）、`server.js:554`（按扩展名给 MIME）。
- **触发条件**：攻击者能写入 `assets/cards/webp/` 或 `vendor/`（结合 V2-08/V2-17）。
- **预期 vs 实际**：预期只服务已知静态类型；实际 `.html` 以 `text/html` 返回并在同源执行。
- **复现**：`node "%TEMP%\tarot-audit2\verify\static-probe.cjs"` 的 Part B（临时副本，项目目录未写入）。
- **证据**：`/assets/cards/webp/evil.html` → 200 `text/html`，内容 `<script>window.PWNED=1</script>`；`/assets/cards/webp/note.txt` → 200 `application/octet-stream`；当前仓库 `webp/` 只有 78 个 `.webp`、`fallback/` 只有 78 个 `.svg`，无 `.html`。
- **影响面**：同源 XSS 可读 localStorage 档案、调用 `/api/chat`；需写权限，低。
- **修复建议**：扩展名白名单（`.webp/.svg/.png/.js/.css` 等），未知类型 404 或 `Content-Disposition: attachment`；SVG 加 `Content-Security-Policy: sandbox` 或放独立域。

**修复状态（2026-11-04）：已修复。** `/vendor/` 仅允许 `.js/.css`，牌面目录仅允许图片扩展名；`vendor/evil.html`、`webp/evil.html`、`webp/note.txt` 均 404，正常 webp/js 200。

#### V2-17【low】junction/硬链接逃逸

- **位置**：`server.js:529-536`（`path.resolve` + `path.relative` 字符串校验）、`server.js:563`（`fs.readFile`）。
- **触发条件**：项目内存在指向外部的 junction/硬链接（攻击者需写权限）。
- **预期 vs 实际**：预期只读项目内文件；实际 junction 逃逸，读到项目外 `secret.txt`。
- **复现**：`node "%TEMP%\tarot-audit2\verify\static-probe.cjs"` 的 Part B（`cmd /c mklink /J` 建 junction，临时副本）。
- **证据**：`/assets/cards/webp/link/secret.txt` → 200 `OUTSIDE-SECRET-12345`；`/assets/cards/webp/link/evil.html` → 200 `text/html`。
- **影响面**：结合 V2-16 可同源执行任意本地文件内容；需写权限，低。
- **修复建议**：`fs.realpathSync` 后再做 `relative` 校验，拒绝 reparse point；静态根只读，部署时校验无链接。

**修复状态（2026-11-04）：已修复。** 静态服务 `fs.realpath` 后校验真实路径在 `ROOT_REAL` 内、真实 URL 仍命中白名单，并拒绝 `stat.nlink>1`；junction 指向项目外 → 404，硬链接 → 404，正常文件 200。

#### V2-18【low】http 网关明文 Bearer

- **位置**：`server.js:371-384`（构造上游请求，未限制协议）。
- **触发条件**：`TAROT_GATEWAY_URL=http://…`。
- **预期 vs 实际**：预期只允许 https（localhost mock 除外）；实际明文发送 `Authorization: Bearer`。
- **复现**：t1 的 `mitm-report.json` 的 `plainHttp` 分支。
- **证据**：明文 mock 收到 Bearer。
- **影响面**：配置错误时 key 明文过网；低（需用户显式配 http）。
- **修复建议**：非 https 且非 localhost 时拒绝启动或强警告；文档只给 https 示例。

**修复状态（2026-11-04）：已修复。** `TAROT_GATEWAY_URL` 为 http 时启动打印「使用明文 http…Bearer 会以明文发送」警告；未配 CA 使用系统信任库、insecure 模式另有醒目警告。

#### V2-19【low】vendor 无 SRI/版本清单，1.4.1 停更

- **位置**：`app.js:1349-1368`（动态注入 `vendor/html2canvas.min.js`，无 `integrity`）、`vendor/html2canvas.min.js`。
- **触发条件**：文件被替换/供应链投毒；或未来出现 CVE。
- **预期 vs 实际**：预期有 SRI 与版本清单；实际无 `integrity`、无版本文件、1.4.1 自 2022-01 后无 release。
- **复现**：审读 + 哈希比对 + `npm audit`。
- **证据**：SHA-256 `e87e550794322e574a1fda0c1549a3c70dae5a93d9113417a429016838eab8cb`，198,689 B，与官方 1.4.1 一致；SRI `sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H`；npm audit（html2canvas@1.4.1 + 5 依赖）0 漏洞。
- **影响面**：当前文件可信；未来 CVE 无补丁路径，替换无检测。低（本地文件 + ACL 已是前提）。
- **修复建议**：注入时加 `integrity`/`crossOrigin`；建 `vendor/README` 记录版本、来源、SHA-256/SRI；订阅 GitHub Advisory/OSV。

**修复状态（2026-11-04）：已修复。** http(s) 下为注入的 html2canvas 设置 `integrity=sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H` 与 `crossOrigin=anonymous`；`file://` 跳过 SRI 保证离线可用；新增 `vendor/VERSIONS.md`（版本/大小/SHA-256/SHA-384/来源/升级步骤）。

#### V2-20【low】旧构建脚本 `--force` 降级 6 张资产

- **位置**：`scripts/build-card-assets.cjs:452-486`（`assertSafeToRun`）、`491-495`（写 6 张 SVG/WebP + manifest）。
- **触发条件**：执行 `node scripts/build-card-assets.cjs --force`。
- **预期 vs 实际**：预期只重建 6 张样张；实际把 `manifest.js` 打回 6 条，并把同名 6 张 v1.0.0 WebP/fallback 覆盖为 v0.1 样张。
- **复现**：审读代码；t4 在临时副本实测 manifest 变化与 6 张资产降级（复核人未重跑破坏性命令）。
- **证据**：`if (process.argv.includes('--force')) return;` 跳过 `published > CARDS.length` 的保护；随后 `writeSvg`、`rasterize`、写 manifest。
- **影响面**：误加 `--force` 会破坏已发布资产，需 git 恢复；低（有防呆，需显式 `--force`）。
- **修复建议**：`--force` 改为 `--allow-downgrade` 并要求二次确认/自动备份；或删除旧脚本，只保留 `build-card-deck.cjs`。

**修复状态（2026-11-04）：已修复。** `build-card-assets.cjs` 移除 `--force` 旁路：manifest 已发布 v1.0.0/78 张时 `--force` 直接 exit 1 且 manifest 不变，必须 `--force-replace` 二次确认。

#### V2-21【low】零字节 WebP 通过校验、manifest 无逐文件哈希

- **位置**：`scripts/build-card-deck.cjs:168-169`（只 `existsSync`）、`181-190`（manifest 无哈希/大小）。
- **触发条件**：某个 `.webp` 为 0 字节或损坏但文件存在。
- **预期 vs 实际**：预期构建失败；实际通过，manifest 照常登记。
- **复现**：审读；t4 用零字节文件验证。
- **证据**：仅 `fs.existsSync(webpPath)`；manifest 字段只有路径/宽高/alt/version。
- **影响面**：坏资产进入发布，页面裂图；低。
- **修复建议**：校验 `stat.size > 0` 与 WebP 魔数（`RIFF....WEBP`）；manifest 增加 `bytes`/`sha256` 并在构建后校验。

**修复状态（2026-11-04）：已修复。** `build-card-deck.cjs` 拒绝零字节与非 RIFF/WEBP 头文件，manifest 每张写入 `bytes`/`sha256`；临时副本两次运行字节一致且与仓库一致，manifest SHA-256 `83e3ce57…f469c8`，78 张 totalBytes 3,892,392，零字节注入 exit 1。

#### V2-22【low】洞察统计口径偏差

- **位置**：`insights.js:99`（`inWindow` 只判下界）、`insights.js:107-117`（未知牌计守护牌、不计元素）、`insights.js:144`（`totalReadings: list.length`）。
- **触发条件**：档案含非法时间、未来时间或未知牌。
- **预期 vs 实际**：预期统计只含合法记录；实际总数含非法时间记录，未来时间也计守护牌，未知牌计守护牌但不计元素。
- **复现**：审读 + t4 `data-boundary.cjs` 的 insights 用例。
- **证据**：`inWindow = Number.isFinite(time) && time >= cutoff` 无上界；`totalReadings` 直接用 `list.length`；未知牌分支只 `unknownCards++` 与 `guardian++`。
- **影响面**：洞察数字偏差；低。
- **修复建议**：`totalReadings` 用过滤后的合法记录数；`inWindow` 加上界 `time <= now`；未知牌单独计数或同时计入元素「未知」。

**修复状态（2026-11-04）：已修复。** 非法时间记录不再计入任何指标，`totalReadings` 只计有效记录；守护牌窗口改为 `[now-30d, now]` 排除未来；未知牌只进 `totalCards/unknownCards`，不进元素分布。构造 5 条记录实测 totalReadings 4、unknownCards 1、elementTotal 3（spirit 2 + water 1）、未来记录不计守护牌。

#### V2-23【low】非法 JSON/非数组静默空档案

- **位置**：`app.js:1862-1873`（`loadHistory`）。
- **触发条件**：localStorage 中 `tarot_history` 为非法 JSON 或非数组（手动修改、旧版本、写入中断）。
- **预期 vs 实际**：预期提示档案损坏并可导出/恢复；实际 `catch` 返回 `[]`，界面显示空档案，用户以为数据丢失。
- **复现**：t3 的 `invalidJson`/`nonArray` 场景；复核重跑确认 0 条静默。
- **证据**：`catch { historySkippedCount = 0; return []; }`；非数组同样 `return []`；无 toast/警告。
- **影响面**：用户可能继续写入覆盖原数据；低-中（数据可恢复性）。
- **修复建议**：解析失败时把原始字符串备份到 `tarot_history_corrupt_<ts>`，显示可关闭的警告条 + 「导出损坏数据」按钮；不要静默清空。

**修复状态（2026-11-04）：已修复。** 根 JSON 损坏/非数组时 toast「档案数据损坏，已忽略。」并显示空状态「档案馆还空着…」，不再静默空列表。

#### V2-24【low】浏览器测试默认 reduced-motion，导出/分享无回归

- **位置**：`tests/browser.test.cjs:56`（`newPage` 默认 `reduceMotion: true`）。
- **触发条件**：运行现有浏览器测试。
- **预期 vs 实际**：预期覆盖长图导出/系统分享关键路径；实际所有页面默认 reduced-motion，动画终态直接生效，V2-01 永不触发；分享只测了 mock 快路径。
- **复现**：审读 + 37/37 全绿但 V2-01 真实复现。
- **证据**：`newPage` 默认 `reduceMotion: true`；无导出像素断言；无慢渲染分享用例。
- **影响面**：回归网漏掉导出/分享两条核心路径；低（测试有效性，按首轮同类项计 low）。
- **修复建议**：增加 `reduceMotion: false` 的导出用例（断言克隆 `opacity` 或 canvas 非背景像素）；增加「渲染延迟 > 激活窗口」的分享用例（Node 侧延迟，避免 `userGesture` 干扰）。

**修复状态（2026-11-04）：已修复。** 新增 5 条 `reduceMotion:false` 用例（长图导出正文、凯尔特 16M 降采样、分享同步激活、根 JSON 损坏、单牌导出），默认 `newPage` 仍为 true 以控制耗时；导出/分享回归已被覆盖。

#### V2-25【low】大数据量冷开/翻牌/保存长任务

- **位置**：渲染与保存路径（`app.js` 档案/翻牌/长图；`perf-audit.cjs` 四场景）。
- **触发条件**：50 条档案冷开、4MiB 档案搜索、凯尔特第 10 张翻牌、长图保存。
- **预期 vs 实际**：预期交互无明显卡顿；实际冷开 77.7–136.8ms（长任务 78–137ms）、第 10 张翻牌 130.8ms（长任务 130+188ms）、长图保存 1344ms（长任务 394+217+398ms）。
- **复现**：`node "%TEMP%\tarot-audit2\perf\perf-audit.cjs"`（约 50s，四场景；原始 t3 结果备份为 `results-t3.json`）。
- **证据**：`%TEMP%\tarot-audit2\perf\results.json`；50 条 894,066 chars 冷开 77.7ms、搜索 7.5–13.9ms；4MiB 配额 5,242,865 chars；首屏 346,390B/11 请求。
- **影响面**：低端机上翻牌/保存可见卡顿；不丢数据。低。
- **修复建议**：翻牌与 10 张牌 DOM/布局分批（`requestAnimationFrame`/`requestIdleCallback`）；保存前先让 UI 反馈；长图导出考虑分片或 OffscreenCanvas（html2canvas 不支持 Worker，可评估替代库）。

**修复状态（2026-11-04）：未修复（low，性能优化项）。** t6–t9 未改渲染/保存路径；复核重跑仍见冷开 136.8ms、第 10 张翻牌 130.8ms、长图保存 1344ms 等长任务，与第二轮数据一致，未恶化。

#### V3-01【medium】多列报告导出时关闭的「为什么这样看」正文与下一块重叠

- **位置**：`app.js:1440-1447`（`onclone` 注入的导出样式）、`style.css` 中 `.reading-basis` / `.reading-basis-body` 规则（`details` 关闭态）。
- **触发条件**：凯尔特 10 牌（`.reading-blocks.many` 两列网格；当前版本唯一 >3 张、会触发多列的牌阵）且用户未展开「为什么这样看」，点击「保存长图」。
- **预期 vs 实际**：预期关闭的 `details` 内容不参与导出；实际 Chrome 仍为关闭的 `details` 内容保留布局盒（`content-visibility` 只隐藏绘制），html2canvas 克隆后把正文绘制出来，越过块底约 41–111px，压到下一行块的标题与表格上；正文本身可读，但版面重叠。
- **复现**：`node "%TEMP%\tarot-audit2\verify\round3-celtic-export.cjs"`（真实点击保存凯尔特长图）；`round3-celtic-clone.cjs` 记录克隆块矩形与 `details` 盒；裁剪 `artifacts\round3-celtic.png` / `round3-celtic-clone.png` 可见 03 压 02、05 压 03。
- **证据**：导出 1862×8101；克隆块矩形无重叠（`cloneOverlaps:0`），但关闭的 `details` body 高 111px、起点在块底（live `bodyTop:728` vs 块底 728；clone 中越界 41px）；单列导出无此问题。
- **影响面**：凯尔特 10 牌长图导出（`.many` 两列网格）版面重叠，影响可读性与分享观感；不影响正文内容与主流程。
- **修复建议**：在 `onclone` 注入 `details:not([open]) .reading-basis-body{display:none!important}`（或对 `details` 内容设 `content-visibility:hidden`），并补一条多列导出无重叠的像素/矩形断言。

**修复状态（2026-11-04）：已修复。** t11 在 `app.js:1448-1453` 的导出 `<style>` 内新增 `details:not([open]) .reading-basis-body { display: none !important; }`，只作用于克隆文档。t12 独立复核（真实 `server.js` 随机端口 51080、真实 Chrome、`reduceMotion:false`）：凯尔特 10 个关闭 details 全部 `bodyDisplay:none`、`bodyH:0`（越界 0px），导出 1841×8261 / 3,564,831 B，12 个正文块亮像素均 >0；对照组（在 `onclone` 重新强制 `display:flex` 模拟修复前）10 个 body 高 110.75–130.19、正文区亮像素 8,521–16,932、PNG 3,801,349 B，裁剪可见 04/06 标题被上一行表格压住；打开第 1 个 details 后导出，该 body `display:flex`、高 110.75、亮像素 9,523，其余 9 个仍隐藏。单牌/三牌/二择一导出无回归，canvas 面积均 <16M。注：当前版本 `decision`（二择一）为 3 张、`trinity` 3 张、`single` 1 张，均单列；任务描述中的「5 牌 decision」与实际牌阵不符，多列场景由凯尔特 10 牌覆盖。脚本：`%TEMP%\tarot-audit2\t12-verify\verify-v301.cjs`；结果 JSON 与 PNG 在同目录 `artifacts\`。

### 9.4 已验证无问题

1. **真实上游 TLS**：`<gateway-host>:52000` 可达（145ms），TLSv1.3 `TLS_AES_256_GCM_SHA384`，叶证书 `CN=<gateway-host>`、SAN `IP Address:<gateway-host>`、issuer `CN=<gateway-ca>`、有效期 2026-09-09→2028-12-12；用项目根目录 `gateway-ca.crt` 握手 `authorized: true`（chainDepth 2）。
2. **真实鉴权**：无 `Authorization` → 401 `Unauthorized`；带 key + 非法 body → 400 参数校验错误（`sglang` 的 `http_server.py:1926`），说明 key 被接受且未消耗推理；上游是 SGLang OpenAI 兼容服务。错误信息含服务器内部路径（信息级，未计入缺陷）。
3. **CSRF/rebinding 防线**：foreign `Origin` → 403 `forbidden origin`；`/api/config`、`/api/usage` foreign Host → 403 `forbidden host`；服务只监听 `127.0.0.1:port`（`server.js:600`）。浏览器内 rebinding 被 Origin 挡住；无 Origin 的非浏览器客户端仍可（见 V2-03）。
4. **静态穿越**：URL 编码、`..`、反斜杠、`%00`、`::$DATA`、双斜杠、`/index.html/../.env` 全部 404/400；`masters/` 不服务；MIME 正确；HEAD/ETag/no-cache 正常。
5. **导出修复可行性**：`onclone` 强制动画终态后正文恢复（dataURL 1,508,194→1,934,234；亮像素 197,940→327,626）；牌面本来就在（600×1000，3:5 卡框，`object-fit` 为 no-op）。
6. **分享快路径**：无慢渲染时 `userActivation` 为 true，`share` 收到 `title/text/files`；`canShare` 为 false/absent 时只分享文字（t2 四路径 mock 全过）。
7. **可访问性基础**：16 个可见控件 0 个无名；4 个 dialog 均有可访问名；焦点归还/Tab 陷阱正常；Chrome `inert` 生效。
8. **性能与配额**：50 条 894,066 chars 冷开 77.7ms、搜索 7.5–13.9ms；4MiB 配额 5,242,865 chars；填满后保存失败 toast 正确且 stored 未变；首屏 346,390B/11 请求（65.1%），懒加载生效（首屏无 html2canvas/牌面）；CLS 0。
9. **vendor 供应链**：html2canvas 1.4.1 官方文件，SHA-256 与 npm tarball 一致，MIT，`npm audit` 0 漏洞；`manifest.js` SHA-256 与仓库一致；78 WebP/78 SVG 齐全。
10. **构建防呆**：`build-card-deck.cjs` 缺 WebP/母版、牌数≠78 均 exit 1；同机连跑两次字节一致（t4）；旧脚本无 `--force` 时 exit 1 且 manifest 不变。
11. **数据边界**：78 牌 = 22 大牌 + 56 小牌；11,232 次逐位解读 0 空文案，20 次综合解读 0 失败；导入导出 round-trip、特殊字符/换行/超长截断、200→50 上限、旧字段兼容均通过（除 V2-07）。
12. **零运行时依赖**：`package.json` 无 `dependencies`，19 个运行时文件 0 个第三方裸导入；外部 URL 仅 Google Fonts（异步、失败回退系统字体）。
13. **服务端冒烟**：随机端口 56126/54517 启动；`/` 200 25,004B；`/style.css` HEAD 200；`/api/config` 200；`/api/usage` 200；`/api/chat` 无 key 503；安全头 `nosniff`/`no-referrer`/`DENY`；第二轮时无 CSP（V2-14，t7 已补，见 9.3 修复状态）。

### 9.5 未验证项

1. **真实 iOS/Android 设备与读屏**：仅 Chrome 视口模拟 + aria 树；VoiceOver/TalkBack/NVDA 未实测。
2. **Firefox/Safari 引擎行为**：`inert`、Web Share、html2canvas、`AudioContext interrupted` 均为代码级推断；本机只有 Chromium。
3. **真实 DNS rebinding**：用 `Host` 头模拟；未搭 DNS 服务器做 TTL 切换。
4. **真实网络 MITM**：本机 TLS mock + 自签冒充者；未在真实链路劫持。
5. **Google Fonts 真实传输**：harness 屏蔽字体，346,390B 是下界；未测字体加载失败时的 CLS/LCP。
6. **跨机器构建可重复性**：Chrome/Pillow/系统字体未锁定；t4 同机两次一致，未跨机器。
7. **真实 `/api/chat` 推理**：只验证鉴权/参数校验，未消耗 token；120s 超时/2MB 上限未在真实网关上压测。
8. **文件符号链接**：Windows 创建文件 symlink 需开发者模式，未实测；junction 已证明同类逃逸。
9. **2MB 导入文件真实上传**：t4 未做；导入走前端 `FileReader`，不经服务端 body 上限。
10. **usage 账本长期增长**：只测当前约 100 条；未测数月/数年后的文件大小与读取耗时。
11. **真实移动端长图导出**：canvas 尺寸按视口计算，未在 iOS 真机验证 16.7M 上限行为。
12. **空 CA 文件的真实握手**：本机 mock 得到 502；真实网关未测。

### 9.6 第六节缺口状态

| # | 缺口 | 状态 | 说明 |
|---|---|---|---|
| 1 | 真实上游网关/TLS | **关闭** | 已连真实网关：TLS1.3、SAN/链校验通过；鉴权 401/400 已验；TLS fail-open 与 README 叶证书问题见 V2-05/V2-06 |
| 2 | 静态文件边界 | **关闭** | URL 层穿越全部挡住；junction/任意扩展名同源 XSS 已复现（V2-16/V2-17，需写权限） |
| 3 | 真实移动设备与屏幕阅读器 | **部分关闭** | 视口模拟 + aria 树完成；真机/读屏未测 |
| 4 | 浏览器兼容性 | **部分关闭** | Chromium 实测；Firefox/Safari 仅代码级推断 |
| 5 | 原生分享 | **关闭** | 快/慢路径、成功/取消/失败/不支持四分支 mock 全过；真机未测 |
| 6 | html2canvas 内部 | **关闭** | 导出正文丢失已真实复现并验证修复方案；字体/跨域未测 |
| 7 | 性能 | **关闭** | 四场景压测 + 复核重跑，数据一致 |
| 8 | 音频 | **部分关闭** | `interrupted` 缺陷代码级确认（V2-09）；真机未测 |
| 9 | 第三方 vendor 供应链 | **关闭** | 哈希/来源/漏洞/构建可重复性已验（V2-19/V2-20/V2-21 为残余） |
| 10 | `/api/chat` 无鉴权 | **关闭** | Host/Origin/无 key 503 已实测；真实 DNS rebinding 未搭环境 |

### 9.7 第二轮修复优先级

| 优先级 | 条目 | 理由 |
|---|---|---|
| P0 | V2-01、V2-05、V2-06 | 导出核心内容丢失；TLS fail-open 可泄露真实 key；README 按文档必挂 |
| P1 | V2-02、V2-03、V2-04、V2-07、V2-08 | 分享失败、代理纵深防御、iOS 导出上限、emoji 截断、本机 key ACL |
| P2 | V2-09…V2-14、V2-16、V2-17、V2-22、V2-23 | 兼容/可访问性/静态边界/统计与坏数据提示 |
| P3 | V2-15、V2-18…V2-21、V2-24、V2-25 | 限流、协议、vendor/构建卫生、测试与性能 |

---

**复核声明**：本报告中的 44 条 confirmed 均由复核人亲自运行上述脚本或直接审读对应代码行确认；2 条驳回均给出复核理由；未验证项已单列，未计入缺陷数。除本文件外，未修改 `E:\project\taluopai` 下任何文件。2026-11-04 第一/二/三轮修复复核均由复核人独立运行脚本完成，未采信实现者结论；最终 44/44 全部关闭（V-06 由 commit `b870511` 修复，V-26/V-27/V-38 第三轮复核 pass）。**第二轮审计（覆盖缺口）**于同日完成：独立复核 t1–t4，新增 25 条 V2-01…V2-25（1 high/7 medium/17 low），第六节 10 项缺口 7 关闭/3 部分关闭；回归 `npm run check`、`npm test`（57/57）、`npm run test:browser`（37/37）全绿，真实 `server.js` 随机端口冒烟通过。除本文件外未修改项目文件，未 commit。**第三轮修复复核（2026-11-04，t6–t9 后）**：25 条 V2 缺陷中 23 条已修复、2 条未修复（V2-08 环境 ACL、V2-25 性能优化项）；新增 V3-01（medium），已由 t11 修复并经 t12 复核通过。复核人独立重跑真实点击导出/分享、随机端口真实 `server.js`、临时副本构建与无头 Chrome 断言，未采信实现者结论；回归 `npm run check`（exit 0）、`npm test`（58/58）、`npm run test:browser`（41/41）全绿。**V3-01 修复复核（2026-11-04，t11 后）**：多列导出关闭的 `details` 正文不再绘制（凯尔特 10/10 `display:none`、body 高 0），打开态仍绘制（亮像素 9,523）；对照组复现修复前重叠（10 个 body 高 110.75–130.19、正文亮像素 8,521–16,932）；单牌/三牌/二择一无回归，所有导出 <16M。回归 `npm run check`（exit 0）、`npm test`（58/58）、`npm run test:browser`（41/41，97.8s）全绿。