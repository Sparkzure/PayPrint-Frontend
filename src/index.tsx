/**
 * 入口：Provider 树 + 路由表。
 *
 * @solidjs/router 0.9 的结构要求（踩过坑）：
 *   `<Router>` 只提供 history/context，**不解析路由**；路由必须写在 `<Routes>` 里，
 *   否则 `<Route>` 元素会被当成普通 JSX 直接渲染成文本 "[object Object]"（整页空白
 *   且不报任何错）。这里用扁平路由 + 外壳包裹函数，避免依赖嵌套匹配行为。
 */

import { lazy, type Component } from 'solid-js'
import { render } from 'solid-js/web'
import { HopeProvider } from '@hope-ui/solid'
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import { Navigate, Route, Router, Routes } from '@solidjs/router'

import { theme } from './app/theme'
import { ThemeSync } from './app/ThemeSync'
import { PublicOnly, AdminPublicOnly } from './app/guards'
import { AppShell } from './shell/AppShell'
import { AdminShell } from './shell/AdminShell'
import { RouteProgress } from './components/motion'

import './app/styles.css'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const NewPrintPage = lazy(() => import('./pages/NewPrintPage'))
const OrdersPage = lazy(() => import('./pages/OrdersPage'))
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage'))
const DevicesPage = lazy(() => import('./pages/DevicesPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))

const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'))
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage'))
const AdminOrdersPage = lazy(() => import('./pages/admin/AdminOrdersPage'))
const AdminAuditPage = lazy(() => import('./pages/admin/AdminAuditPage'))
const AdminDevicesPage = lazy(() => import('./pages/admin/AdminDevicesPage'))
const AdminPrintersPage = lazy(() => import('./pages/admin/AdminPrintersPage'))
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'))
const AdminCollectorsPage = lazy(() => import('./pages/admin/AdminCollectorsPage'))
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'))
const AdminBackupPage = lazy(() => import('./pages/admin/AdminBackupPage'))

/** 用户端页面统一套上 AppShell（它负责登录守卫与整体布局）。 */
const inShell = (Page: Component): Component => () => (
  <AppShell>
    <Page />
  </AppShell>
)

/** 管理面板页面统一套上 AdminShell（另一套令牌、另一个守卫、另一套导航）。 */
const inAdmin = (Page: Component): Component => () => (
  <AdminShell>
    <Page />
  </AdminShell>
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 401/403 由各页面自己决定怎么处理（跳登录 or 提示），全局重试只会拖慢反馈。
      retry: (failureCount, error) => {
        const status = (error as { status?: number } | undefined)?.status ?? 0
        if (status >= 400 && status < 500) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: false,
      staleTime: 10 * 1000,
    },
    mutations: {
      retry: false,
    },
  },
})

const container = document.getElementById('root')
if (!container) {
  throw new Error('找不到 #root 挂载点')
}

render(
  () => (
    <HopeProvider config={theme}>
      {/* 把当前模式同步回 <html>：首屏脚本只写过一次，运行时切换只改 <body>（见 ThemeSync） */}
      <ThemeSync />
      <QueryClientProvider client={queryClient}>
        <Router>
          {/* 懒加载页面在切路由时先出进度条，避免"点了没反应" */}
          <RouteProgress />
          <Routes>
            {/* 公开页 */}
            <Route
              path="/login"
              component={() => (
                <PublicOnly>
                  <LoginPage />
                </PublicOnly>
              )}
            />
            <Route
              path="/register"
              component={() => (
                <PublicOnly>
                  <RegisterPage />
                </PublicOnly>
              )}
            />

            {/* 用户端 */}
            <Route path="/" component={inShell(NewPrintPage)} />
            <Route path="/orders" component={inShell(OrdersPage)} />
            <Route path="/orders/:orderId" component={inShell(OrderDetailPage)} />
            <Route path="/devices" component={inShell(DevicesPage)} />
            <Route path="/account" component={inShell(AccountPage)} />

            {/* 管理面板 */}
            <Route
              path="/admin/login"
              component={() => (
                <AdminPublicOnly>
                  <AdminLoginPage />
                </AdminPublicOnly>
              )}
            />
            <Route path="/admin" component={inAdmin(AdminOverviewPage)} />
            <Route path="/admin/orders" component={inAdmin(AdminOrdersPage)} />
            <Route path="/admin/audits" component={inAdmin(AdminAuditPage)} />
            <Route path="/admin/devices" component={inAdmin(AdminDevicesPage)} />
            <Route path="/admin/printers" component={inAdmin(AdminPrintersPage)} />
            <Route path="/admin/users" component={inAdmin(AdminUsersPage)} />
            <Route path="/admin/collectors" component={inAdmin(AdminCollectorsPage)} />
            <Route path="/admin/settings" component={inAdmin(AdminSettingsPage)} />
            <Route path="/admin/backup" component={inAdmin(AdminBackupPage)} />

            <Route path="*" component={() => <Navigate href="/" />} />
          </Routes>
        </Router>
      </QueryClientProvider>
    </HopeProvider>
  ),
  container,
)
