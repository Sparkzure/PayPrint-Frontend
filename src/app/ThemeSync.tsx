/**
 * 配色的三件收尾工作，全站只挂一次（放在 HopeProvider 内、路由之外）。
 *
 * 1. 把用户意图落到 Hope UI
 *    Hope UI 只认 light / dark（见 colorMode.ts 的说明），所以意图一变、以及"跟随系统"
 *    时系统配色一变，都要重新解析再送给它 —— 它自己不会监听 `prefers-color-scheme`。
 *
 * 2. 把当前模式同步回根元素 `<html>`
 *    首屏脚本（index.html）只在**加载那一刻**往 `<html>` 上写过 hope-ui-light/dark 与
 *    `color-scheme`，之后运行时切换只改 `<body>` 的 class（Hope UI 的做法）。根元素于是
 *    停在加载时那一档，出现"body 一套、html 另一套"的混合态：
 *      - `color-scheme` 不过去 —— 原生控件、滚动条、浏览器默认文本色仍按旧档绘制；
 *      - 根作用域的 `--hope-colors-*` 是旧值 —— 只在 `<html>` 上取色的规则跟不上。
 *    这正是"背景跟着变了、另一些东西没变"的来源。
 *
 * 3. 色板标签（`<meta name="theme-color">`）跟随当前模式
 *    它原本按 `prefers-color-scheme` 匹配，只跟系统、不跟应用内的切换。
 */

import { createEffect, onCleanup, onMount, type Component } from 'solid-js'
import { useColorMode } from '@hope-ui/solid'

import {
  colorPreference,
  onSystemColorModeChange,
  resolvePreference,
} from './colorMode'

/**
 * 首屏脚本用的背景色，与 theme.ts 的 `background`（light `#F4F7FB` / dark `#070B14`）一致。
 * 它只影响浏览器 UI 的着色，取不到主题变量，所以这里留一份字面值 —— 改 theme.ts 的
 * background 时要顺手改这里和 index.html 的两条 meta。
 */
const THEME_COLOR = { light: '#F4F7FB', dark: '#070B14' } as const

export const ThemeSync: Component = () => {
  const { colorMode, setColorMode } = useColorMode()

  createEffect(() => {
    setColorMode(resolvePreference(colorPreference()))
  })

  onMount(() => {
    // 意图是"跟随系统"时，系统换主题要跟着换；显式选了 light/dark 就不动。
    const unsubscribe = onSystemColorModeChange(() => {
      if (colorPreference() === 'system') {
        setColorMode(resolvePreference('system'))
      }
    })
    onCleanup(unsubscribe)
  })

  createEffect(() => {
    const dark = colorMode() === 'dark'
    const root = document.documentElement

    // 与 Hope UI 打在 <body> 上的那一份同名同值，两边不会打架。
    root.classList.toggle('hope-ui-dark', dark)
    root.classList.toggle('hope-ui-light', !dark)
    root.style.colorScheme = dark ? 'dark' : 'light'

    const label = dark ? THEME_COLOR.dark : THEME_COLOR.light
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute('content', label)
    }
  })

  return null
}
