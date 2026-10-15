# 贡献指南

感谢愿意花时间改进 PayPrint 前端。本文档说明怎么把环境跑起来、改动要满足什么要求，
以及提交 PR 前必须自己过一遍哪些检查。

- 参与本项目即表示你同意 [行为准则](CODE_OF_CONDUCT.md)。
- 本项目以 [AGPL-3.0](LICENSE) 发布。提交贡献即表示你有权以同一许可证提供这些代码。
- **发现安全问题不要开 issue**，请按 [SECURITY.md](SECURITY.md) 私下报告。

## 开始之前

PayPrint 前端是独立仓库（SolidJS SPA），构建产物由后端仓
[Sparkzure/PayPrint](https://github.com/Sparkzure/PayPrint) 在构建时嵌入单二进制。
服务端的行为约束与安全红线见后端仓的 `docs/DEVELOPMENT.md`；本仓库只负责页面与交互。

## 环境准备

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | 24+ | 开发与构建 |
| npm | 随 Node | 安装依赖 |
| Git | 任意近期版本 | — |

技术栈：SolidJS 1.9 + Hope UI（OpenListTeam fork 0.6.8）+ Vite +
`@solidjs/router` + `@solid-primitives/i18n` + TanStack Query for Solid。

> **可选：项目内隔离的工具链。** 开发者本机若不想让 npm 缓存写进用户目录，
> 可以自建一个 `.tools/` 目录放独立工具链并激活它（工作区旁或上一级都行）。
> 这是个人环境偏好，不是本仓库的构建前提。

## 常用命令

```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc --noEmit + vite build（产物在 dist/，不进仓库）
npm run typecheck  # 只跑类型检查
npm run smoke      # 端到端冒烟（需 PayPrint 后端检出，见 scripts/smoke.mjs）
```

## 代码约定

- **文案**：用户可见文字一律走 `t('模块.键')`（`src/app/i18n.ts`），zh 与 en 的
  `src/lang/` 字典同步补键，`en` 常驻兜底；**模块级常量里不要调用 `t()`**
  （会在加载时把文案定死，切换语言后不刷新）。
- **颜色**：只取 Hope UI 主题令牌（`src/app/theme.ts` 的 light/dark `colors`），
  组件里不写十六进制色值；两套主题都要验证。
- **风格与动效以 OpenList 前端为基准**；共享组件复用 `src/components/ui.tsx` 与
  `motion.tsx`，不在页面里散写同类逻辑。
- `src/lib/` 是框架无关层，`sign.ts` 的路径与导出被冒烟脚本直接 import，不要随手改名。
- 页数、金额等来自服务端的字段一律以服务端口径为准，客户端不做二次计价。

## 提交与 PR

PR 与提交标题用 Conventional Commits：`type(scope): 摘要`。允许的 type：`feat` `fix`
`refactor` `perf` `docs` `style` `test` `build` `ci` `chore` `revert`；scope 必填（如
`web` / `i18n` / `ci`）；破坏性变更在 type 后加 `!`。校验工作流会对不合规的标题留言并标红，
改对后提醒会自动收掉。

提交信息用祈使句、说清「改了什么」，必要时在正文写「为什么」。PR 按模板写，描述请包含：

1. **改了什么**，涉及用户可见行为时，说明前后的差异
2. **为什么**，关联的 issue 或背景
3. **怎么验证的**，跑了 `npm run typecheck` / `npm run build` / `npm run smoke` 的哪些
4. **有哪些取舍**，特别是涉及签名、令牌存储等安全相关的地方，别让评审去猜
