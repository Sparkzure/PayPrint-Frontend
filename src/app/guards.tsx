/* 路由守卫：与 OpenList 的 MustUser/PublicOnly 同一思路。 */

import { Show, type ParentComponent } from 'solid-js'
import { Navigate } from '@solidjs/router'

import { getToken } from '../lib/api'
import { getAdminToken } from '../lib/adminApi'

/** 已登录用户访问登录页时直接回到首页，避免"登录页闪一下"。 */
export const PublicOnly: ParentComponent = (props) => {
  return (
    <Show when={!getToken()} fallback={<Navigate href="/" />}>
      {props.children}
    </Show>
  )
}

/** 管理面板登录页同理，用管理令牌判断，与用户端互不相干。 */
export const AdminPublicOnly: ParentComponent = (props) => {
  return (
    <Show when={!getAdminToken()} fallback={<Navigate href="/admin" />}>
      {props.children}
    </Show>
  )
}
