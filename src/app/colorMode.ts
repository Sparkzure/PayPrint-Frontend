/**
 * 配色模式：把"用户选的那一档"和"当前生效的明暗"分成两件事。
 *
 * 起因是这个 fork 的 Hope UI 处理 "system" 的方式不可用（`@hope-ui/solid` 的
 * color-mode 实现）：
 *
 *   const isDarkMode = () => colorMode() === "dark"      // 'system' → false
 *   const setColorMode = (v) => { rawSetColorMode(v); save(v) }
 *
 * 于是 `setColorMode('system')` 会把 'system' 原样存进 `colorMode`，而判明暗只认
 * `=== 'dark'` —— 'system' 一律走浅色分支；而且它全程不监听 `prefers-color-scheme`，
 * 系统换主题也不会跟。表现就是：在账号页选了"跟随系统"，颜色卡在浅色不动。
 *
 * 这里把两件事拆开：
 *   - 用户意图存在 `payprint.color-mode`（light / dark / system），只有它认得 'system'；
 *   - 送给 Hope UI 的永远只有 light / dark（它自己的 `hope-ui-color-mode` 因此也只会有
 *     这两个值，index.html 的首屏脚本不用改判断逻辑）。
 * 系统配色变化时由 ThemeSync 监听，重新解析一次意图。
 */

import { createSignal } from 'solid-js'

export type ColorPreference = 'light' | 'dark' | 'system'

const PREFERENCE_KEY = 'payprint.color-mode'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** 系统当前是不是深色。 */
export function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

/** 读取用户意图；没存过或存坏了都按"跟随系统"。 */
export function readPreference(): ColorPreference {
  try {
    const raw = localStorage.getItem(PREFERENCE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* 隐私模式下读不到，按跟随系统 */
  }
  return 'system'
}

export function writePreference(value: ColorPreference): void {
  try {
    localStorage.setItem(PREFERENCE_KEY, value)
  } catch {
    /* 读不到就算了，本次会话内由调用方通过 setColorMode 生效 */
  }
}

/** 把用户意图解析成 Hope UI 认得的那一档（只有 light / dark）。 */
export function resolvePreference(value: ColorPreference): 'light' | 'dark' {
  if (value === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return value
}

/**
 * 当前用户意图（响应式）。界面只负责改它，落到 Hope UI 由 ThemeSync 统一做，
 * 免得每个入口都自己解析一遍、还要各自记得同步根元素。
 */
const [preference, setPreference] = createSignal<ColorPreference>(readPreference())

export const colorPreference = preference

export function setColorPreference(value: ColorPreference): void {
  writePreference(value)
  setPreference(value)
}

/** 明暗互换，并把结果写成显式意图（点了切换就不再"跟随系统"）。 */
export function toggleColorPreference(): void {
  setColorPreference(resolvePreference(preference()) === 'dark' ? 'light' : 'dark')
}

/** 订阅系统配色变化，返回退订函数。 */
export function onSystemColorModeChange(listener: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}
