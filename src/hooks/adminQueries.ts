/**
 * 管理面板数据层（TanStack Query for Solid）。
 * 全部 adminApi 调用的查询/变更封装；变更成功后统一失效对应查询。
 */

import { createQuery, createMutation, useQueryClient } from '@tanstack/solid-query'
import { adminApi, downloadBackup, downloadAuditCSV, restoreBackup, type StagedRestoreInfo } from '../lib/adminApi'

export const useAdminStats = () => createQuery(() => ({ queryKey: ['admin-stats'], queryFn: adminApi.stats }))

export const useAdminOrders = (limit = 50) =>
  createQuery(() => ({ queryKey: ['admin-orders', { limit }], queryFn: () => adminApi.orders(limit) }))

export const useAudits = (limit = 100, offset = 0) =>
  createQuery(() => ({ queryKey: ['admin-audits', { limit, offset }], queryFn: () => adminApi.audits(limit, offset) }))

export const useAdminDevices = (limit = 100) =>
  createQuery(() => ({ queryKey: ['admin-devices', { limit }], queryFn: () => adminApi.devices(limit) }))

export const useAdminUsers = () =>
  createQuery(() => ({ queryKey: ['admin-users'], queryFn: () => adminApi.users(200) }))

export const useAdminPrinters = () =>
  createQuery(() => ({ queryKey: ['admin-printers'], queryFn: () => adminApi.printers() }))

export const useAdminCollectors = () =>
  createQuery(() => ({ queryKey: ['admin-collectors'], queryFn: () => adminApi.collectors(100) }))

export const useAdminSettings = () =>
  createQuery(() => ({ queryKey: ['admin-settings'], queryFn: adminApi.settings }))

export const useStagedRestore = () =>
  createQuery(() => ({ queryKey: ['admin-restore-pending'], queryFn: adminApi.stagedRestore }))

export function useInvalidateAdmin(...keys: string[]) {
  const qc = useQueryClient()
  return () => {
    for (const key of keys) void qc.invalidateQueries({ queryKey: [key] })
  }
}

export const useAdminMe = () => createQuery(() => ({ queryKey: ['admin-me'], queryFn: adminApi.me }))

// ---- 变更 ----

export const useRefundOrder = () =>
  useInvalidateOn(['admin-orders', 'admin-stats'], (input: { orderId: string; reason: string }) =>
    adminApi.refund(input.orderId, input.reason),
  )

export const useRetryOrder = () =>
  useInvalidateOn(['admin-orders', 'admin-stats'], (orderId: string) => adminApi.retry(orderId))

export const useReleaseDevice = () =>
  useInvalidateOn(['admin-devices'], (input: { deviceId: string; reason: string }) =>
    adminApi.releaseDevice(input.deviceId, input.reason),
  )

export const useBlockDevice = () =>
  useInvalidateOn(['admin-devices'], (input: { deviceId: string; reason: string }) =>
    adminApi.blockDevice(input.deviceId, input.reason),
  )

export const useRestoreDevice = () =>
  useInvalidateOn(['admin-devices'], (input: { deviceId: string; reason: string }) =>
    adminApi.restoreDevice(input.deviceId, input.reason),
  )

export const useCreateUser = () =>
  useInvalidateOn(['admin-users'], (input: { username: string; password: string; role?: string }) =>
    adminApi.createUser(input),
  )

export const useBanUser = () =>
  useInvalidateOn(['admin-users'], (input: { userId: string; reason: string }) =>
    adminApi.banUser(input.userId, input.reason),
  )

export const useUnbanUser = () =>
  useInvalidateOn(['admin-users'], (input: { userId: string; reason: string }) =>
    adminApi.unbanUser(input.userId, input.reason),
  )

export const useSetFreePrint = () =>
  useInvalidateOn(['admin-users'], (input: { userId: string; enabled: boolean; reason: string }) =>
    adminApi.setUserFreePrint(input.userId, input.enabled, input.reason),
  )

export const useSavePrinter = () =>
  useInvalidateOn(['admin-printers'], (input: Parameters<typeof adminApi.createPrinter>[0]) =>
    adminApi.createPrinter(input),
  )

export const useSetPrinterStatus = () =>
  useInvalidateOn(['admin-printers'], (input: { printerId: string; status: string }) =>
    adminApi.setPrinterStatus(input.printerId, input.status),
  )

export const useDeletePrinter = () =>
  useInvalidateOn(['admin-printers'], (input: { printerId: string; reason: string }) =>
    adminApi.deletePrinter(input.printerId, input.reason),
  )

export const useProbePrinter = () =>
  createMutation(() => ({ mutationFn: (input: { cups_uri?: string; printer_id?: string }) => adminApi.probePrinter(input) }))

export const useIssueCollector = () =>
  useInvalidateOn(['admin-collectors'], (input: { printerCode: string; label: string }) =>
    adminApi.issueCollector(input.printerCode, input.label),
  )

export const useRevokeCollector = () =>
  useInvalidateOn(['admin-collectors'], (input: { collectorId: string; reason: string }) =>
    adminApi.revokeCollector(input.collectorId, input.reason),
  )

export const usePurgeCollector = () =>
  useInvalidateOn(['admin-collectors'], (input: { collectorId: string; reason: string }) =>
    adminApi.purgeCollector(input.collectorId, input.reason),
  )

export const useUpdateSettings = () =>
  useInvalidateOn(['admin-settings', 'admin-stats'], (input: { set: Record<string, string>; reset: string[] }) =>
    adminApi.updateSettings(input.set, input.reset),
  )

export const useDownloadBackup = () => createMutation(() => ({ mutationFn: downloadBackup }))

export const useDownloadAuditCSV = () => createMutation(() => ({ mutationFn: downloadAuditCSV }))

export const useRestoreBackup = () =>
  createMutation(() => ({ mutationFn: (file: File): Promise<StagedRestoreInfo & { hint?: string }> => restoreBackup(file) }))

export const useCancelRestore = () =>
  useInvalidateOn(['admin-restore-pending'], () => adminApi.cancelRestore())

// 小工具：包一层"成功后失效若干查询"的 mutation 工厂
function useInvalidateOn<TInput, TResult>(
  keys: string[],
  fn: (input: TInput) => Promise<TResult>,
) {
  const qc = useQueryClient()
  const invalidate = () => {
    for (const key of keys) void qc.invalidateQueries({ queryKey: [key] })
  }
  const mutation = createMutation(() => ({
    mutationFn: fn,
    onSuccess: () => invalidate(),
  }))
  return mutation
}
