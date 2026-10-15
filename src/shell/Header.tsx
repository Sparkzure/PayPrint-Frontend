/**
 * 顶栏（仿 OpenList 的 Header）：品牌、主导航、语言与配色切换。
 * 用户端与管理面板共用这一个组件，导航项由调用方传入。
 *
 * 高亮**交给 `<A>` 自己的 activeClass / end**，不要再自己算一遍：
 * `<A href="/">` 的默认匹配规则是 `pathname.startsWith(href)`，而任何路径都以 "/"
 * 开头 —— 于是"新建打印"在任何页面都亮；自己再拼一次 class 只会叠加同一个 bug。
 * 约定：`end: true` = 仅精确匹配（"/" 这类前缀恒真的路径必须带上）。
 *
 * 导航项的渲染与激活态样式都在共享的 NavLinks（components/ui.tsx）与 styles.css 里，
 * 这里只负责品牌、菜单项与右侧开关。
 */

import { Component, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { Box, HStack, Text } from '@hope-ui/solid'
import { FiPrinter } from 'solid-icons/fi'

import { t } from '../app/i18n'
import { NavLinks, type NavItem } from '../components/ui'
import { SwitchColorMode } from './SwitchColorMode'
import { SwitchLanguage } from './SwitchLanguage'

export const Header: Component<{ nav?: NavItem[]; onLogout?: () => void }> = (props) => {
  return (
    <HStack
      as="header"
      class="pp-header"
      justifyContent="space-between"
      px="$4"
      py="$2"
      borderBottomWidth="1px"
      borderBottomColor="$border"
      position="sticky"
      top="0"
      zIndex="10"
      gap="$2"
      flexWrap="wrap"
    >
      <HStack gap="$4" flexWrap="wrap" alignItems="center">
        <A href="/" class="brand">
          <FiPrinter size={20} color="var(--hope-colors-primary)" />
          <Text fontWeight="bold" fontSize="$lg" color="$primary">
            PayPrint
          </Text>
        </A>
        <Show when={(props.nav?.length ?? 0) > 0}>
          <NavLinks items={props.nav!} itemClass="nav-link" direction="row" />
        </Show>
      </HStack>
      <HStack gap="$1" alignItems="center">
        <SwitchColorMode />
        <SwitchLanguage />
        <Show when={props.onLogout}>
          <Box
            as="button"
            px="$2"
            py="$1"
            fontSize="$sm"
            color="$subtleText"
            rounded="$md"
            transition="all .2s"
            _hover={{ color: '$danger' }}
            _active={{ transform: 'scale(.95)' }}
            onClick={() => props.onLogout?.()}
          >
            {t('nav.logout')}
          </Box>
        </Show>
      </HStack>
    </HStack>
  )
}
