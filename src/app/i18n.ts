/**
 * i18n：仿 OpenList 的 lang/<locale>/ 分模块字典。
 *
 * - 字典按模块拆成 json（zh/en 同名文件），flatten 成点号键（如 `nav.print`）
 * - `en` 常驻兜底：缺键时回退英文，再缺就显示键本身（dev 能直接发现漏翻）
 * - 选择持久化在 localStorage（payprint.lang），默认跟随浏览器语言
 * - 两套语言静态打包（体量小，不做按语言懒加载；以后语言多了再切动态 import）
 */

import { createSignal } from 'solid-js'
import { flatten, resolveTemplate } from '@solid-primitives/i18n'

import zhDict from '../lang/zh/entry'
import enDict from '../lang/en/entry'

export type Locale = 'zh' | 'en'

export const locales: { code: Locale; name: string }[] = [
  { code: 'zh', name: '简体中文' },
  { code: 'en', name: 'English' },
]

const STORAGE_KEY = 'payprint.lang'

function readStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'zh' || raw === 'en') return raw
  } catch {
    /* 隐私模式读不到，按浏览器语言 */
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

const flattened: Record<Locale, ReturnType<typeof flatten>> = {
  zh: flatten(zhDict),
  en: flatten(enDict),
}

const [locale, setLocaleSignal] = createSignal<Locale>(readStoredLocale())

export function currentLocale(): Locale {
  return locale()
}

export function setLocale(next: Locale): void {
  setLocaleSignal(next)
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* 写不进去只影响持久化，本次会话仍然生效 */
  }
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
}

export type TFunc = (key: string, params?: Record<string, string | number>) => string

/** 翻译函数：当前语言 → 英文兜底 → 键本身。读取 locale 信号，切换语言即时生效。 */
export const t: TFunc = (key, params) => {
  const raw = flattened[locale()][key] ?? flattened.en[key] ?? key
  const text = typeof raw === 'string' ? raw : String(raw)
  return params ? resolveTemplate(text, params) : text
}
