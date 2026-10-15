/**
 * 管理面板外壳（仿 OpenList 的 manage 布局）：登录守卫 + 左侧 SideMenu + 顶栏。
 * 窄屏时侧栏隐藏（.admin-sidebar 由 styles.css 的媒体查询控制），顶栏下方出现横向菜单。
 *
 * 侧栏与窄屏菜单都是共享的 NavLinks（components/ui.tsx），激活项的底色画在项自己身上
 * （OpenList 侧栏的做法，不滑动）。高亮判定交给 `<A>` 的 activeClass / end
 * （见 Header.tsx 的说明），只对 `/admin`（总览）标 end：其余项要前缀匹配，
 * 这样子页面里父项也保持高亮。
 */

import { Component, Show, createMemo, type ParentProps } from 'solid-js'
import { Navigate, useNavigate } from '@solidjs/router'
import { Box, Flex } from '@hope-ui/solid'

import { getAdminToken, adminApi, setAdminToken } from '../lib/adminApi'
import { NavLinks, type NavItem } from '../components/ui'
import { Header } from './Header'

const menu: NavItem[] = [
  { href: '/admin', label: 'admin.nav.overview', end: true },
  { href: '/admin/orders', label: 'admin.nav.orders' },
  { href: '/admin/audits', label: 'admin.nav.audits' },
  { href: '/admin/devices', label: 'admin.nav.devices' },
  { href: '/admin/printers', label: 'admin.nav.printers' },
  { href: '/admin/users', label: 'admin.nav.users' },
  { href: '/admin/collectors', label: 'admin.nav.collectors' },
  { href: '/admin/settings', label: 'admin.nav.settings' },
  { href: '/admin/backup', label: 'admin.nav.backup' },
]

const SideLinks: Component<{ onNavigate?: () => void }> = (p) => {
  const links = createMemo<NavItem[]>(() =>
    menu.map((item) => ({ ...item, onNavigate: () => p.onNavigate?.() })),
  )
  return <NavLinks items={links()} itemClass="side-link" direction="column" gap="4px" />
}

export const AdminShell: Component<ParentProps> = (props) => {
  const navigate = useNavigate()

  return (
    <Show when={!!getAdminToken()} fallback={<Navigate href="/admin/login" />}>
      <Box minH="100vh" bg="$background">
        <Header
          onLogout={async () => {
            try {
              await adminApi.logout()
            } catch {
              /* 登录态以本地为准 */
            }
            setAdminToken(null)
            navigate('/admin/login', { replace: true })
          }}
        />
        {/* 窄屏横向菜单（桌面端由媒体查询隐藏） */}
        <Box class="admin-mobile-nav" px="$3" py="$2">
          <NavLinks items={menu} itemClass="side-link" direction="row" gap="8px" />
        </Box>
        <Flex>
          <Box
            class="admin-sidebar"
            w="212px"
            flexShrink="0"
            borderRightWidth="1px"
            borderRightColor="$border"
            bg="$surface1"
            minH="calc(100vh - 52px)"
            p="$3"
          >
            <SideLinks />
          </Box>
          <Box flex="1" p="$5" minW="0" class="pp-page">
            {props.children}
          </Box>
        </Flex>
      </Box>
    </Show>
  )
}
