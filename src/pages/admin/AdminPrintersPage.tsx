/**
 * 打印机管理：列表 + 实时探测、新建/编辑（覆盖更新）、启用/停用、级联硬删除。
 *
 * 注意：POST /api/v1/admin/printers 是覆盖更新——请求里省略 online_windows /
 * paper_sizes 会清空它们，编辑表单因此总是带着完整字段提交。
 */

import { Component, For, Show, createSignal } from 'solid-js'
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  Textarea,
  VStack,
} from '@hope-ui/solid'

import { useAdminPrinters, useSavePrinter, useSetPrinterStatus, useDeletePrinter, useProbePrinter } from '../../hooks/adminQueries'
import { PageTitle, SectionCard, StatusBadge, EmptyText, ErrorText } from '../../components/ui'
import type { PrinterView, PrinterLiveView } from '../../lib/types'
import { t } from '../../app/i18n'

interface PrinterForm {
  code: string
  name: string
  cups_uri: string
  location: string
  price_single_bw_fen: number
  price_single_color_fen: number
  price_duplex_bw_fen: number
  price_duplex_color_fen: number
  supports_color: boolean
  supports_duplex: boolean
  paper_sizes: string
  max_copies: number
  online_windows: string
}

const emptyForm = (): PrinterForm => ({
  code: '',
  name: '',
  cups_uri: 'ipp://',
  location: '',
  price_single_bw_fen: 10,
  price_single_color_fen: 30,
  price_duplex_bw_fen: 20,
  price_duplex_color_fen: 60,
  supports_color: true,
  supports_duplex: true,
  paper_sizes: 'A4',
  max_copies: 10,
  online_windows: '',
})

const toForm = (p: PrinterView): PrinterForm => ({
  code: p.code,
  name: p.name,
  cups_uri: p.cups_uri ?? '',
  location: p.location,
  price_single_bw_fen: p.price_single_bw_fen,
  price_single_color_fen: p.price_single_color_fen,
  price_duplex_bw_fen: p.price_duplex_bw_fen,
  price_duplex_color_fen: p.price_duplex_color_fen,
  supports_color: p.supports_color,
  supports_duplex: p.supports_duplex,
  paper_sizes: (p.paper_sizes ?? []).join(','),
  max_copies: p.max_copies,
  online_windows: JSON.stringify(p.online_windows ?? [], null, 0),
})

export default function AdminPrintersPage() {
  const query = useAdminPrinters()
  const save = useSavePrinter()
  const setStatus = useSetPrinterStatus()
  const del = useDeletePrinter()
  const probe = useProbePrinter()

  const [editing, setEditing] = createSignal<PrinterForm | null>(null)
  const [isEdit, setIsEdit] = createSignal(false)
  const [formError, setFormError] = createSignal('')
  const [deleteTarget, setDeleteTarget] = createSignal<PrinterView | null>(null)
  const [deleteCode, setDeleteCode] = createSignal('')
  const [deleteError, setDeleteError] = createSignal('')
  const [error, setError] = createSignal('')

  const openCreate = () => {
    setIsEdit(false)
    setFormError('')
    setEditing(emptyForm())
  }

  const openEdit = (p: PrinterView) => {
    setIsEdit(true)
    setFormError('')
    setEditing(toForm(p))
  }

  const doSave = async (e: Event) => {
    e.preventDefault()
    const form = editing()
    if (!form) return
    setFormError('')

    let windows: unknown = []
    if (form.online_windows.trim()) {
      try {
        windows = JSON.parse(form.online_windows)
      } catch {
        setFormError(t('admin.printers.windows_bad_json'))
        return
      }
    }
    try {
      await save.mutateAsync({
        code: form.code.trim(),
        name: form.name.trim(),
        cups_uri: form.cups_uri.trim(),
        location: form.location.trim() || undefined,
        price_single_bw_fen: form.price_single_bw_fen,
        price_single_color_fen: form.price_single_color_fen,
        price_duplex_bw_fen: form.price_duplex_bw_fen,
        price_duplex_color_fen: form.price_duplex_color_fen,
        supports_color: form.supports_color,
        supports_duplex: form.supports_duplex,
        paper_sizes: form.paper_sizes.split(',').map((s) => s.trim()).filter(Boolean),
        max_copies: form.max_copies,
        online_windows: windows as never,
      })
      setEditing(null)
    } catch (err) {
      const code = (err as { code?: string }).code
      setFormError(
        code === 'code_taken'
          ? t('admin.printers.code_taken')
          : code === 'invalid_printer_uri'
            ? t('admin.printers.bad_uri')
            : t('admin.printers.save_failed'),
      )
    }
  }

  const doStatus = async (p: PrinterView, status: string) => {
    setError('')
    try {
      await setStatus.mutateAsync({ printerId: p.id, status })
    } catch {
      setError(t('admin.printers.status_failed'))
    }
  }

  const doDelete = async () => {
    const target = deleteTarget()
    if (!target) return
    if (deleteCode().trim() !== target.code) {
      setDeleteError(t('admin.printers.delete_code_mismatch', { code: target.code }))
      return
    }
    try {
      const result = await del.mutateAsync({ printerId: target.id, reason: t('admin.printers.default_delete_reason') })
      setDeleteTarget(null)
      setDeleteCode('')
      setError(
        t('admin.printers.deleted_summary', {
          orders: result.deleted_orders,
          jobs: result.deleted_print_jobs,
          ledger: result.deleted_ledger_entries,
          events: result.deleted_payment_events,
          collectors: result.deleted_collector_credentials,
        }),
      )
    } catch {
      setDeleteError(t('admin.printers.delete_failed'))
    }
  }

  const doProbe = async (p: PrinterView) => {
    setError('')
    try {
      await probe.mutateAsync({ printer_id: p.id })
    } catch {
      setError(t('admin.printers.probe_failed'))
    }
  }

  return (
    <VStack spacing="$4" alignItems="stretch">
      <HStack justifyContent="space-between" flexWrap="wrap">
        <PageTitle description={t('admin.printers.subtitle')}>{t('admin.printers.title')}</PageTitle>
        <Button size="sm" onClick={openCreate}>
          {t('admin.printers.create')}
        </Button>
      </HStack>
      <ErrorText>{error()}</ErrorText>
      <ErrorText>{query.isError ? t('global.load_failed') : ''}</ErrorText>
      <Show when={query.data && query.data.data.length === 0}>
        <EmptyText>{t('admin.printers.empty')}</EmptyText>
      </Show>

      <For each={query.data?.data ?? []}>
        {(printer, i) => (
          <SectionCard delay={Math.min(i(), 6) * 0.05}>
            <VStack alignItems="stretch" spacing="$2">
              <HStack justifyContent="space-between" flexWrap="wrap">
                <HStack spacing="$2" flexWrap="wrap">
                  <Text fontWeight="bold">{printer.name}</Text>
                  <StatusBadge tone={printer.tone} text={printer.status_text} />
                  <Show when={!printer.within_schedule}>
                    <StatusBadge tone="warning" text={t('admin.printers.out_of_window')} />
                  </Show>
                </HStack>
                <HStack spacing="$1">
                  <Button size="xs" variant="outline" loading={probe.isPending} onClick={() => doProbe(printer)}>
                    {t('admin.printers.probe')}
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => openEdit(printer)}>
                    {t('global.edit')}
                  </Button>
                  <Show when={printer.status === 'active'} fallback={
                    <Button size="xs" onClick={() => doStatus(printer, 'active')}>
                      {t('admin.printers.enable')}
                    </Button>
                  }>
                    <Button size="xs" variant="outline" colorScheme="warning" onClick={() => doStatus(printer, 'disabled')}>
                      {t('admin.printers.disable')}
                    </Button>
                  </Show>
                  <Button size="xs" variant="outline" colorScheme="danger" onClick={() => setDeleteTarget(printer)}>
                    {t('global.delete')}
                  </Button>
                </HStack>
              </HStack>
              <Text fontSize="$sm" color="$subtleText">
                {printer.code} · {printer.location || '—'} · {printer.online_windows_text}
              </Text>
              <Text fontSize="$sm" color="$subtleText">
                {t('admin.printers.prices')}: {printer.price_single_bw_text} / {printer.price_single_color_text} / {printer.price_duplex_bw_text} / {printer.price_duplex_color_text}
                {' · '}
                {t('params.paper_size')}: {(printer.paper_sizes ?? []).join(', ') || '—'}
              </Text>
              <Show when={probe.data && !probe.isPending}>
                <LiveProbeBox live={probe.data!} />
              </Show>
            </VStack>
          </SectionCard>
        )}
      </For>

      {/* 新建 / 编辑 */}
      <Modal opened={editing() !== null} onClose={() => setEditing(null)} size="lg" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent as="form" onSubmit={doSave}>
          <ModalHeader>{isEdit() ? t('admin.printers.edit_title') : t('admin.printers.create_title')}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Show when={editing()}>
              <VStack spacing="$3" alignItems="stretch">
                <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap="$3">
                  <FormControl>
                    <FormLabel for="p-code">{t('admin.printers.code')}</FormLabel>
                    <Input id="p-code" value={editing()!.code} onInput={(e) => setEditing({ ...editing()!, code: e.currentTarget.value })} disabled={isEdit()} />
                  </FormControl>
                  <FormControl>
                    <FormLabel for="p-name">{t('admin.printers.name')}</FormLabel>
                    <Input id="p-name" value={editing()!.name} onInput={(e) => setEditing({ ...editing()!, name: e.currentTarget.value })} />
                  </FormControl>
                </Box>
                <FormControl>
                  <FormLabel for="p-uri">{t('admin.printers.uri')}</FormLabel>
                  <Input id="p-uri" value={editing()!.cups_uri} onInput={(e) => setEditing({ ...editing()!, cups_uri: e.currentTarget.value })} />
                  <Text fontSize="$xs" color="$subtleText" mt="$1">
                    {t('admin.printers.uri_help')}
                  </Text>
                </FormControl>
                <FormControl>
                  <FormLabel for="p-location">{t('admin.printers.location')}</FormLabel>
                  <Input id="p-location" value={editing()!.location} onInput={(e) => setEditing({ ...editing()!, location: e.currentTarget.value })} />
                </FormControl>
                <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap="$3">
                  <FormControl>
                    <FormLabel for="p-price-sbw">{t('admin.printers.price_single_bw')}</FormLabel>
                    <Input id="p-price-sbw" type="number" min="0" value={String(editing()!.price_single_bw_fen)} onInput={(e) => setEditing({ ...editing()!, price_single_bw_fen: Number(e.currentTarget.value) })} />
                  </FormControl>
                  <FormControl>
                    <FormLabel for="p-price-scolor">{t('admin.printers.price_single_color')}</FormLabel>
                    <Input id="p-price-scolor" type="number" min="0" value={String(editing()!.price_single_color_fen)} onInput={(e) => setEditing({ ...editing()!, price_single_color_fen: Number(e.currentTarget.value) })} />
                  </FormControl>
                  <FormControl>
                    <FormLabel for="p-price-dbw">{t('admin.printers.price_duplex_bw')}</FormLabel>
                    <Input id="p-price-dbw" type="number" min="0" value={String(editing()!.price_duplex_bw_fen)} onInput={(e) => setEditing({ ...editing()!, price_duplex_bw_fen: Number(e.currentTarget.value) })} />
                  </FormControl>
                  <FormControl>
                    <FormLabel for="p-price-dcolor">{t('admin.printers.price_duplex_color')}</FormLabel>
                    <Input id="p-price-dcolor" type="number" min="0" value={String(editing()!.price_duplex_color_fen)} onInput={(e) => setEditing({ ...editing()!, price_duplex_color_fen: Number(e.currentTarget.value) })} />
                  </FormControl>
                </Box>
                <Text fontSize="$xs" color="$subtleText">
                  {t('admin.printers.price_unit_note')}
                </Text>
                <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap="$3">
                  <FormControl>
                    <FormLabel for="p-paper">{t('params.paper_size')}</FormLabel>
                    <Input id="p-paper" value={editing()!.paper_sizes} onInput={(e) => setEditing({ ...editing()!, paper_sizes: e.currentTarget.value })} />
                    <Text fontSize="$xs" color="$subtleText" mt="$1">
                      {t('admin.printers.paper_help')}
                    </Text>
                  </FormControl>
                  <FormControl>
                    <FormLabel for="p-copies">{t('params.copies')}</FormLabel>
                    <Input id="p-copies" type="number" min="1" value={String(editing()!.max_copies)} onInput={(e) => setEditing({ ...editing()!, max_copies: Number(e.currentTarget.value) })} />
                  </FormControl>
                </Box>
                <FormControl>
                  <FormLabel for="p-windows">{t('admin.printers.windows')}</FormLabel>
                  <Textarea
                    id="p-windows"
                    rows={3}
                    value={editing()!.online_windows}
                    onInput={(e) => setEditing({ ...editing()!, online_windows: e.currentTarget.value })}
                    placeholder='[{"days":[1,2,3,4,5],"start":"08:00","end":"22:00"}]'
                  />
                  <Text fontSize="$xs" color="$subtleText" mt="$1">
                    {t('admin.printers.windows_help')}
                  </Text>
                </FormControl>
                <ErrorText>{formError()}</ErrorText>
              </VStack>
            </Show>
          </ModalBody>
          <ModalFooter display="flex" gap="$2">
            <Button variant="ghost" colorScheme="neutral" onClick={() => setEditing(null)}>
              {t('global.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('global.save')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 级联删除二次确认 */}
      <Modal opened={deleteTarget() !== null} onClose={() => setDeleteTarget(null)}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t('admin.printers.delete_title')}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack alignItems="stretch" spacing="$2">
              <Text fontSize="$sm" color="$danger">
                {t('admin.printers.delete_warning')}
              </Text>
              <Text fontSize="$sm">
                {t('admin.printers.delete_confirm', { code: deleteTarget()?.code ?? '' })}
              </Text>
              <Input value={deleteCode()} onInput={(e) => setDeleteCode(e.currentTarget.value)} placeholder={deleteTarget()?.code ?? ''} />
              <ErrorText>{deleteError()}</ErrorText>
            </VStack>
          </ModalBody>
          <ModalFooter display="flex" gap="$2">
            <Button variant="ghost" colorScheme="neutral" onClick={() => setDeleteTarget(null)}>
              {t('global.cancel')}
            </Button>
            <Button colorScheme="danger" loading={del.isPending} onClick={doDelete}>
              {t('global.delete')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  )
}

const LiveProbeBox: Component<{ live: PrinterLiveView }> = (props) => (
  <Box px="$3" py="$2" rounded="$md" bg="$surface3">
    <Show
      when={props.live.reachable}
      fallback={<Text fontSize="$sm" color="$danger">{t('admin.printers.probe_unreachable')}: {props.live.error ?? '—'}</Text>}
    >
      <Text fontSize="$sm">
        {props.live.make_and_model || '—'} · {props.live.state_message}
        {' · '}
        {t('admin.printers.accepting')}: {props.live.accepting_jobs ? t('global.yes') : t('global.no')}
      </Text>
    </Show>
  </Box>
)
