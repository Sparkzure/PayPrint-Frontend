<!--
PR 标题：
- 用 Conventional Commits：`type(scope): 摘要`
- 允许的 type：feat / fix / refactor / perf / docs / style / test / build / ci / chore / revert
- scope 必填（校验工作流会检查），用主要模块名（src / smoke / docs / ci / deps），跨多个模块用主要的那个并在正文枚举
- 破坏性变更在 type 后加 `!`，例如 `feat(src)!: 调整签名协议`
-->

## 摘要

<!--
改了什么，为什么需要改。
涉及用户可见行为时，说明前后的差异。
-->

## 影响面

- [ ] 此 PR 包含破坏性变更
- [ ] 此 PR 需要后端同步（签名协议、API 契约、发布新 Release 供后端下载）
- [ ] 此 PR 需要同步文档（README）

## 关联 Issue

<!--
用 `Closes #123`、`Fixes #123` 或 `Relates to #123`。
没有关联 issue 就删掉本节。
-->

## 验证

<!--
写实际执行过的命令、浏览器与手工验证步骤。
如果未执行，请说明原因。不要声称没做过的验证。
-->

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] 浅色 / 深色两套主题都看过
- [ ] `npm run smoke`（对着本地后端；改了 `src/lib/sign.ts` 时必跑，且可能需要后端同步改）
- [ ] 手工验证：

## 检查清单

- [ ] 相关文档已同步更新
- [ ] 组件里没有散写十六进制色值（颜色只能取 CSS 变量）

## AI 使用声明

<!--
使用了实质性 AI 辅助请勾选并写明工具与范围。
拼写修正、自动补全、格式建议、文字润色这类轻微辅助无需披露。
不适用就删掉本节。故意隐瞒可能被视为信任与合规问题。
-->

- [ ] 此 PR 包含 AI 辅助内容

使用的工具与范围：
