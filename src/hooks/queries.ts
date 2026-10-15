/**
 * 用户端数据层（TanStack Query for Solid）。
 * 查询键统一在这里定义，页面只消费 hook。
 */

import { createQuery, createMutation, useQueryClient } from '@tanstack/solid-query'
import { api, newEventId } from '../lib/api'
import type { PrintParams } from '../lib/types'

const keys = {
  meta: ['meta'] as const,
  me: ['me'] as const,
  ledger: ['ledger'] as const,
  devices: ['devices'] as const,
  printers: (live: boolean) => ['printers', { live }] as const,
  files: ['files'] as const,
  orders: (limit: number) => ['orders', { limit }] as const,
  order: (id: string) => ['order', id] as const,
}

export const useMeta = () =>
  createQuery(() => ({ queryKey: keys.meta, queryFn: api.meta }))

export const useMe = () => createQuery(() => ({ queryKey: keys.me, queryFn: api.me }))

export const useLedger = () => createQuery(() => ({ queryKey: keys.ledger, queryFn: () => api.ledger(50) }))

export const useDevices = () => createQuery(() => ({ queryKey: keys.devices, queryFn: api.devices }))

export const usePrinters = (live = false) =>
  createQuery(() => ({ queryKey: keys.printers(live), queryFn: () => api.printers(live) }))

export const useRecentFiles = () => createQuery(() => ({ queryKey: keys.files, queryFn: () => api.files(20) }))

export const useOrders = (limit = 20) =>
  createQuery(() => ({ queryKey: keys.orders(limit), queryFn: () => api.orders(limit) }))

export const useOrder = (orderId: string) =>
  createQuery(() => ({ queryKey: keys.order(orderId), queryFn: () => api.order(orderId), refetchInterval: 3000 }))

export function useInvalidateUser() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['orders'] })
    void qc.invalidateQueries({ queryKey: ['order'] })
    void qc.invalidateQueries({ queryKey: ['me'] })
    void qc.invalidateQueries({ queryKey: ['ledger'] })
    void qc.invalidateQueries({ queryKey: ['files'] })
  }
}

export const useUploadFile = () => {
  const invalidate = useInvalidateUser()
  return createMutation(() => ({
    mutationFn: (input: { file: File; pageCountHint?: number }) =>
      api.uploadFile(input.file, input.pageCountHint),
    onSuccess: () => invalidate(),
  }))
}

export const useCreateOrder = () => {
  const invalidate = useInvalidateUser()
  return createMutation(() => ({
    mutationFn: (input: { fileId: string; printerId: string; title?: string; params: PrintParams }) =>
      api.createOrder({ file_id: input.fileId, printer_id: input.printerId, title: input.title, params: input.params }),
    onSuccess: () => invalidate(),
  }))
}

export const useCancelOrder = () => {
  const invalidate = useInvalidateUser()
  return createMutation(() => ({
    mutationFn: (orderId: string) => api.cancelOrder(orderId),
    onSuccess: () => invalidate(),
  }))
}

export const useReleaseOrder = () => {
  const invalidate = useInvalidateUser()
  return createMutation(() => ({
    mutationFn: (orderId: string) => api.releaseOrder(orderId),
    onSuccess: () => invalidate(),
  }))
}

/** 联调/验收用的会话内支付上报（正式链路由现场收款设备调用）。 */
export const useReportPayment = () => {
  const invalidate = useInvalidateUser()
  return createMutation(() => ({
    mutationFn: (input: { orderNo: string; amountFen: number }) =>
      api.reportPayment({ eventId: newEventId(), orderNo: input.orderNo, amountFen: input.amountFen }),
    onSuccess: () => invalidate(),
  }))
}
