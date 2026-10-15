# PayPrint-Frontend

PayPrint（局域网自助打印）的前端单页应用，**SolidJS + Hope UI**（与 OpenList 前端同栈同组件库），
界面布局也向 OpenList 看齐：顶栏（品牌 + 导航 + 配色/语言切换）、管理端侧栏菜单、集中路由 +
全量懒加载 + 守卫。构建产物（`dist/`）以 tar.gz 挂在本仓库的 GitHub Release 上，由后端仓库
[PayPrint](https://github.com/Sparkzure/PayPrint) 的构建脚本下载后用 `//go:embed` 打进单二进制
——运行时没有独立的静态资源目录。

项目主页：[官网](https://sparkzure.xyz) · [文档站](https://sparkzure.github.io/PayPrint-Docs/)

技术栈：SolidJS 1.9 + `@hope-ui/solid`（OpenList fork）+ `@solidjs/router` +
`@solid-primitives/i18n`（zh/en，OpenList 同款 lang/<locale> 分模块字典）+
`@tanstack/solid-query`。

## 本地开发

```bash
npm ci
npm run dev     # http://localhost:5173，/api 代理到 127.0.0.1:8080
```

先把后端跑起来（后端仓库 `make run`，默认监听 `127.0.0.1:8080`），再开这个 dev server。
代理目标可用 `VITE_API_TARGET` 环境变量改。普通用户的注册与登录需要 WebCrypto，
浏览器里要用 `http://localhost`（安全上下文）访问。

想把自己构建的前端打进后端二进制：

```bash
npm run build
# 然后在后端仓库：
sh scripts/build.sh --web-dist ../PayPrint-Frontend/dist
```

## 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发模式（vite + /api 代理） |
| `npm run build` | 类型检查 + 生产构建到 `dist/` |
| `npm run typecheck` | 只做类型检查 |
| `npm run smoke` | 跨语言签名端到端冒烟（对着 `SMOKE_BASE` 指向的后端跑完整打印链路） |

`npm run smoke` 是前后端签名协议的**跨语言一致性检查**：它用 Node 的 WebCrypto 生成
设备密钥，直接 `import` `src/lib/sign.ts`（前端真实的签名实现），起一台假 IPP 打印机，
把「注册 → 上传 → 下单 → 支付 → 确认打印 → 出纸」整条链路真跑一遍。后端仓库的 CI
会检出本仓库来跑它。

## 结构（仿 OpenList）

```
src/
  app/       i18n.ts（zh/en 字典加载与切换）、theme.ts（Hope UI 双主题令牌）、guards、路由
  shell/     Header（顶栏）、AppShell（用户端）、AdminShell（管理端侧栏）、Switch* 组件
  pages/     登录/注册/新建打印/订单/详情/设备/账户 + admin/*（9 个管理页）
  components/共享 UI 原语（状态徽章、卡片、理由弹窗、组合式 Select 封装）
  hooks/     TanStack Query 的查询/变更封装（用户端 + 管理端）
  lib/       sign/device/quote/api/adminApi/types/format（框架无关，直接复用）
  lang/      zh/ en/ 分模块 json（OpenList 同款）+ entry 汇总
```

## i18n

- 字典按模块拆 json（`lang/<locale>/{global,auth,user,admin}.json`），flatten 成点号键
- `en` 常驻兜底；选择持久化在 `localStorage`（`payprint.lang`），默认跟随浏览器语言
- **新增用户可见文案一律走 `t('模块.键')`**，zh/en 两个 json 同步补

## 发布

推 tag 并发布 Release 后，`release.yml` 会构建 dist 并把
`payprint-web-<tag>.tar.gz`（附 `.sha256`）上传到该 Release；后端构建时
按「最新 Release」或指定 tag 下载。**后端构建依赖这里已发布过至少一个 Release。**

## License

与后端一致，以 [GNU Affero 通用公共许可证 3.0](LICENSE)（AGPL-3.0）发布。
