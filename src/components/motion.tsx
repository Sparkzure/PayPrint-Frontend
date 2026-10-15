/**
 * 动画原语：与 OpenList 同一套做法（solid-motionone 的 Motion / Presence）。
 *
 * OpenList 的动效不靠 CSS 工具类，来源只有三处：
 *   1. 列表项入场：`initial {opacity:0, scale:.9}` → `animate {opacity:1, scale:1}`，0.2s；
 *   2. 交互反馈：`_hover` / `_active` 的 transform + `transition`（按钮按下缩放已在 theme.ts 全局配好）；
 *   3. 路由切换：顶部不确定进度条（`useIsRouting`）。
 *
 * 这里把 1、3 封成组件，2 由 theme.ts + styles.css 承担。
 * 入场动效一律 ≤0.25s；全部尊重 `prefers-reduced-motion`（见 app/styles.css 底部的媒体查询）。
 *
 * 导航高亮不在这个文件里：OpenList 的激活态是"底色画在项自己身上"（不做整块滑动的背景），
 * 见 components/ui.tsx 的 NavLinks。
 */

import { Component, Show, type JSX } from 'solid-js'
import { Motion } from 'solid-motionone'
import { useIsRouting } from '@solidjs/router'

/** 单个元素入场：淡入 + 轻微缩放（OpenList 列表项的原式写法）。 */
export const MotionItem: Component<{ index?: number; class?: string; children: JSX.Element }> = (props) => (
  <Motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.2, delay: Math.min(props.index ?? 0, 12) * 0.02 }}
    class={props.class}
  >
    {props.children}
  </Motion.div>
)

/** 区块入场：淡入 + 上移 6px，比列表项稍慢一点，让层次感出来。 */
export const FadeIn: Component<{ delay?: number; class?: string; children: JSX.Element }> = (props) => (
  <Motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.22, delay: props.delay ?? 0 }}
    class={props.class}
  >
    {props.children}
  </Motion.div>
)

/**
 * 表格行的逐项入场，用法是展开到 `<Tr>` 上：`<Tr {...rowEnter(i())}>`。
 *
 * 表格行不能走 MotionItem：那是 div，而 div 不许待在 `<tbody>` 里（浏览器会把它
 * 提到表格外面，整张表当场散掉）。所以改走 CSS 动画 + 内联延迟，并且只做淡入不做
 * 位移 —— 表格行一移动，整张表的行高都在抖。
 *
 * `prefers-reduced-motion` 下由 styles.css 的媒体查询关掉，与其它动效一致。
 */
export function rowEnter(index: number): { class: string; style: JSX.CSSProperties } {
  return {
    class: 'pp-row-enter',
    style: { 'animation-delay': `${Math.min(index, 12) * 0.02}s` },
  }
}

/**
 * 路由切换进度条：OpenList 用 `useIsRouting()` 驱动顶部的 indeterminate 进度条。
 * 放在 `<Routes>` 旁边，懒加载页面切换时立刻有反馈（否则点导航要等分包下载完才变）。
 */
export const RouteProgress: Component = () => {
  const isRouting = useIsRouting()
  return (
    <Show when={isRouting()}>
      <div class="pp-progress">
        <div class="pp-progress-bar" />
      </div>
    </Show>
  )
}
