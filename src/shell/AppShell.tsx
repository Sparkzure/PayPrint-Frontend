/**
 * 用户端外壳：登录守卫 + 顶栏导航 + 内容容器。
 * 访问时没有用户令牌就回登录页（组件级守卫，等价 OpenList 的 MustUser）。
 */

import { Component, Show, type ParentProps } from 'solid-js'
import { Navigate, useNavigate } from '@solidjs/router'
import { Box, Container } from '@hope-ui/solid'

import { getToken, api, setToken } from '../lib/api'
import { type NavItem } from '../components/ui'
import { Header } from './Header'

// 中文案存 i18n 键：模块级调用 t() 会把文案固定在加载时的语言上，
// 切换语言后顶栏不会跟着变（踩过的坑）。
// end 只在必要时用：`/` 必须精确匹配（否则任何路径都算命中），
// 而 `/orders` 要前缀匹配 —— 打开订单详情时"我的订单"应保持高亮。
const nav: NavItem[] = [
  { href: '/', label: 'nav.print', end: true },
  { href: '/orders', label: 'nav.orders' },
  { href: '/devices', label: 'nav.devices' },
  { href: '/account', label: 'nav.account' },
]

export const AppShell: Component<ParentProps> = (props) => {
  const navigate = useNavigate()

  return (
    <Show when={!!getToken()} fallback={<Navigate href="/login" />}>
      <Box minH="100vh" bg="$background">
        <Header
          nav={nav}
          onLogout={async () => {
            try {
              await api.logout()
            } catch {
              /* 就算登出接口失败也照样清令牌：登录态以本地为准 */
            }
            setToken(null)
            navigate('/login', { replace: true })
          }}
        />
        <Container maxW="$containerLg" px="$4" py="$6" class="pp-page">
          {props.children}
        </Container>
      </Box>
    </Show>
  )
}
