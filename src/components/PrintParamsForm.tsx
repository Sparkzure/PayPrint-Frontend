/**
 * 打印参数表单。
 *
 * 可读性设计（原来 9 个控件平铺成一长列，看不出主次）：
 *  - 分两组：**常用**（份数 / 色彩 / 单双面 / 纸张）与**高级**（页范围 / 拼版 / 方向 / 质量 / 缩放）；
 *  - 每个字段都带一行说明（限制、口径、可选性），不靠用户猜；
 *  - 互斥选项用 OptionGroup 胶囊按钮（长标签"双面（长边翻页）"不再挤成两行）；
 *  - 高级组默认收起，一旦有非默认值就自动展开并标"已自定义"，避免"改过却看不到"。
 *
 * 参数含义与可选范围一律以打印机能力（supports_duplex / supports_color / paper_sizes）
 * 与服务端下发的 meta 为准；金额永远由服务端算。
 */

import { Component, Show, createMemo, createSignal } from 'solid-js'
import { Box, Button, Checkbox, HStack, Input, Text, VStack } from '@hope-ui/solid'
import { FiChevronRight } from 'solid-icons/fi'

import type { MetaResponse, PrintParams, PrinterView } from '../lib/types'
import { paperLabel } from '../lib/format'
import { t } from '../app/i18n'
import { Field, Hint, OptionGroup, SelectField } from './ui'
import { FadeIn } from './motion'

const paramsMeta = () => ({
  duplex: [
    { value: 'one_sided', label: t('params.duplex_one_sided') },
    { value: 'long_edge', label: t('params.duplex_long_edge') },
    { value: 'short_edge', label: t('params.duplex_short_edge') },
  ],
  color: [
    { value: 'monochrome', label: t('params.color_mono') },
    { value: 'color', label: t('params.color_color') },
  ],
  orientation: [
    { value: 'portrait', label: t('params.orientation_portrait') },
    { value: 'landscape', label: t('params.orientation_landscape') },
  ],
  quality: [
    { value: 'draft', label: t('params.quality_draft') },
    { value: 'normal', label: t('params.quality_normal') },
    { value: 'high', label: t('params.quality_high') },
  ],
})

export const PrintParamsForm: Component<{
  params: PrintParams
  onChange: (next: PrintParams) => void
  printer: PrinterView
  meta?: MetaResponse
  pageTotal: number
  costHint?: string
}> = (props) => {
  const [advancedOpen, setAdvancedOpen] = createSignal(false)

  const meta = () => props.meta
  const copiesMax = () => props.printer.max_copies ?? meta()?.max_copies ?? 10
  const paperOptions = createMemo(() => {
    const sizes = props.printer.paper_sizes ?? meta()?.supported_paper_sizes ?? ['A4']
    return sizes.map((s) => ({ value: s, label: paperLabel(s) }))
  })

  /** 高级组里是否有偏离默认值的项（有就自动展开，否则"改过却看不到"）。 */
  const advancedTouched = createMemo(() => {
    const p = props.params
    return (
      !!p.page_range ||
      p.n_up > 1 ||
      p.orientation !== 'portrait' ||
      p.quality !== 'normal' ||
      p.fit_to_page
    )
  })
  const expanded = () => advancedOpen() || advancedTouched()

  const set = (patch: Partial<PrintParams>) => props.onChange({ ...props.params, ...patch })

  return (
    <VStack alignItems="stretch" spacing="$5">
      {/* 常用参数 */}
      <Box class="pp-grid pp-grid-2">
        <Field label={t('params.copies')} hint={t('params.copies_help', { max: copiesMax() })}>
          <HStack gap="$2" alignItems="center">
            <Button
              size="sm"
              variant="outline"
              aria-label={t('params.copies_minus')}
              onClick={() => set({ copies: Math.max(1, props.params.copies - 1) })}
            >
              −
            </Button>
            <Input
              type="number"
              min="1"
              max={String(copiesMax())}
              width="84px"
              textAlign="center"
              class="pp-num"
              value={String(props.params.copies)}
              onChange={(e) => {
                const v = Number(e.currentTarget.value)
                if (v >= 1) set({ copies: Math.min(copiesMax(), Math.floor(v)) })
              }}
            />
            <Button
              size="sm"
              variant="outline"
              aria-label={t('params.copies_plus')}
              onClick={() => set({ copies: Math.min(copiesMax(), props.params.copies + 1) })}
            >
              +
            </Button>
          </HStack>
        </Field>

        <Field
          label={t('params.color_mode')}
          hint={props.printer.supports_color ? undefined : t('params.color_unsupported')}
        >
          <OptionGroup
            value={props.params.color_mode}
            onChange={(v) => set({ color_mode: v as PrintParams['color_mode'] })}
            options={paramsMeta().color.map((o) => ({
              ...o,
              disabled: o.value === 'color' && !props.printer.supports_color,
            }))}
          />
        </Field>

        <Field
          label={t('params.duplex')}
          hint={props.printer.supports_duplex ? undefined : t('params.duplex_unsupported')}
        >
          <OptionGroup
            value={props.params.duplex}
            onChange={(v) => set({ duplex: v as PrintParams['duplex'] })}
            options={paramsMeta().duplex.map((o) => ({
              ...o,
              disabled: o.value !== 'one_sided' && !props.printer.supports_duplex,
            }))}
          />
        </Field>

        <Field label={t('params.paper_size')} hint={t('params.paper_help')}>
          <SelectField
            value={props.params.paper_size}
            onChange={(v) => set({ paper_size: v as PrintParams['paper_size'] })}
            options={paperOptions()}
            maxW="240px"
          />
        </Field>
      </Box>

      {/* 高级参数：折叠 */}
      <Box borderTopWidth="1px" borderTopColor="$border" pt="$4">
        <Box
          as="button"
          type="button"
          class="pp-adv-toggle"
          aria-expanded={expanded()}
          onClick={() => setAdvancedOpen(!expanded())}
        >
          <Box
            class="pp-caret"
            classList={{ 'pp-caret-open': expanded() }}
            display="flex"
            alignItems="center"
          >
            <FiChevronRight size={16} />
          </Box>
          <Text fontSize="$sm" fontWeight="semibold">
            {t('params.advanced')}
          </Text>
          <Show when={advancedTouched()}>
            <Text fontSize="$xs" color="$primary" fontWeight="semibold">
              {t('params.advanced_custom')}
            </Text>
          </Show>
        </Box>

        <Show when={expanded()}>
          <FadeIn>
            <VStack alignItems="stretch" spacing="$5" mt="$4">
              <Box class="pp-grid pp-grid-2">
                <Field
                  label={t('params.page_range')}
                  hint={t('params.page_range_help', { total: props.pageTotal || 0 })}
                >
                  <Input
                    value={props.params.page_range}
                    onChange={(e) => set({ page_range: e.currentTarget.value })}
                    placeholder={t('params.page_range_hint', { total: props.pageTotal || 0 })}
                  />
                </Field>

                <Field label={t('params.n_up')} hint={t('params.n_up_help')}>
                  <SelectField
                    value={String(props.params.n_up)}
                    onChange={(v) => set({ n_up: Number(v) })}
                    options={(meta()?.supported_n_up ?? [1, 2, 4]).map((n) => ({
                      value: String(n),
                      label: n === 1 ? t('params.n_up_single') : t('params.n_up_multi', { n }),
                    }))}
                    maxW="240px"
                  />
                </Field>

                <Field label={t('params.orientation')}>
                  <OptionGroup
                    value={props.params.orientation}
                    onChange={(v) => set({ orientation: v as PrintParams['orientation'] })}
                    options={paramsMeta().orientation}
                  />
                </Field>

                <Field label={t('params.quality')}>
                  <OptionGroup
                    value={props.params.quality}
                    onChange={(v) => set({ quality: v as PrintParams['quality'] })}
                    options={paramsMeta().quality}
                  />
                </Field>
              </Box>

              <Checkbox
                checked={props.params.fit_to_page}
                onChange={(e) => set({ fit_to_page: e.currentTarget.checked })}
              >
                {t('params.fit_to_page')}
              </Checkbox>
            </VStack>
          </FadeIn>
        </Show>
        <Show when={!expanded()}>
          <Hint>
            <Text as="span" display="block" mt="$2">
              {t('params.advanced_hint')}
            </Text>
          </Hint>
        </Show>
      </Box>

      <Show when={props.costHint}>
        <Hint>{props.costHint}</Hint>
      </Show>
    </VStack>
  )
}
