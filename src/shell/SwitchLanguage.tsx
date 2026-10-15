/* 语言切换（OpenList 同款 Menu 结构）：选择持久化到 localStorage。 */

import { For, Show } from 'solid-js'
import { Button, Menu, MenuContent, MenuItem, MenuTrigger } from '@hope-ui/solid'
import { FiGlobe } from 'solid-icons/fi'

import { locales, currentLocale, setLocale } from '../app/i18n'

export const SwitchLanguage = () => {
  return (
    <Menu>
      {/* 用 Hope 的 ghost 按钮：原生 button 会带上浏览器默认灰底，深浅模式下都很突兀。 */}
      <MenuTrigger as={Button} variant="ghost" colorScheme="neutral" size="sm">
        {/* keyed Show：语言变化时整块重建，保证按钮上的语言名立刻跟着变
            （不能只依赖组件库对 children 的求值时机）。 */}
        <Show when={currentLocale()} keyed>
          {(code) => (
            <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '4px' }}>
              <FiGlobe size={14} />
              {locales.find((l) => l.code === code)?.name ?? '简体中文'}
            </span>
          )}
        </Show>
      </MenuTrigger>
      <MenuContent>
        <For each={locales}>
          {(lang) => <MenuItem onSelect={() => setLocale(lang.code)}>{lang.name}</MenuItem>}
        </For>
      </MenuContent>
    </Menu>
  )
}
