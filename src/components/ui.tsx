/**
 * 共享 UI 原语：导航链接、语义状态色徽章、卡片、键值行、选项组、错误提示、理由弹窗、下拉选择。
 *
 * 可读性约定（各页面共用，不要在页面里另写一套）：
 *  - 卡片标题 = 主标题一行 + 灰色说明一行（SectionCard 的 title / description），步骤号用 step；
 *  - 键值信息用 InfoGrid + InfoRow：标签小灰字在上、值在下，长值（订单号、打印机位置）不会挤成一团；
 *  - 互斥选项用 OptionGroup 的胶囊按钮：点击区域大、长标签（"双面（长边翻页）"）也不会被压成两行。
 *
 * 语义状态色（待处理中性 / 进行中主色 / 完成成功 / 失败危险 / 退款警告）
 * 在列表、详情、通知三处必须一致，统一从这里取，不允许各页面自己写。
 */

import { Component, For, Show, createSignal, type JSX } from 'solid-js'
import { A } from '@solidjs/router'
import {
  Badge,
  Box,
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SelectContent,
  SelectIcon,
  SelectListbox,
  SelectOption,
  SelectOptionText,
  SelectPlaceholder,
  SelectTrigger,
  SelectValue,
  Text,
  Textarea,
  VStack,
} from '@hope-ui/solid'

import type { Tone } from '../lib/types'
import { FadeIn } from './motion'
import { t } from '../app/i18n'

/**
 * 后端 Tone → Hope UI colorScheme。
 *
 * 注意：Hope UI 只认内置调色板名（info / success / danger / warning / neutral），
 * 传自定义 token（如 "primary"）不会报错但**不生效**（按钮会变成淡底淡字不可读）。
 * 我们的主色落在内置 `info`（蓝色系，与 OpenList 一致）。
 */
export function toneScheme(tone: Tone | string): 'info' | 'success' | 'danger' | 'warning' | 'neutral' {
  switch (tone) {
    case 'primary':
      return 'info'
    case 'success':
      return 'success'
    case 'danger':
      return 'danger'
    case 'warning':
      return 'warning'
    default:
      return 'neutral'
  }
}

export const StatusBadge: Component<{ tone: Tone | string; text: string }> = (props) => (
  <Badge colorScheme={toneScheme(props.tone)} variant="subtle">
    {props.text}
  </Badge>
)

/**
 * 导航链接列表：顶栏（row）与管理端侧栏（column）共用。
 *
 * 高亮由 `<A>` 的 activeClass / end 决定（单一来源，判定语义与路由一致），激活态样式
 * 在 styles.css 的 `.active` 里 —— 照 OpenList 侧栏的做法：底色画在项自己身上
 * （淡蓝底 info4 + 深蓝字 info11），不做整块滑动的背景。
 */
export interface NavItem {
  href: string
  label: string
  /** true = 仅精确匹配（路径前缀恒真的入口，如 "/"，必须带上）。 */
  end?: boolean
  onNavigate?: () => void
}

export const NavLinks: Component<{
  items: NavItem[]
  /** 每个导航项的 class（nav-link / side-link），样式在 styles.css 里。 */
  itemClass: string
  /** row = 顶栏横向；column = 侧栏纵向。 */
  direction?: 'row' | 'column'
  /** 项间距，顶栏 16px、侧栏 4px、窄屏菜单 8px。 */
  gap?: string
}> = (props) => (
  <div
    class="pp-nav"
    classList={{ 'pp-nav-col': props.direction === 'column' }}
    style={{ gap: props.gap ?? '16px' }}
  >
    <For each={props.items}>
      {(item) => (
        <A
          href={item.href}
          class={props.itemClass}
          activeClass="active"
          end={item.end}
          onClick={() => item.onNavigate?.()}
        >
          {t(item.label)}
        </A>
      )}
    </For>
  </div>
)

/** 一步的小圆序号（配合 SectionCard 的 step 用）。 */
const StepDot: Component<{ n: number }> = (props) => (
  <Box
    w="22px"
    h="22px"
    flexShrink="0"
    rounded="$full"
    bg="$primarySoft"
    color="$primary"
    display="flex"
    alignItems="center"
    justifyContent="center"
    fontSize="$xs"
    fontWeight="bold"
  >
    {props.n}
  </Box>
)

/**
 * 区块卡片：标题（可带步骤号） + 说明 + 分隔线 + 内容。
 * 说明那行是关键 —— 参数/操作的含义写在这里，别让用户猜。
 *
 * 卡片自带入场动画（与"新建打印"那三张卡同一套）：同页多张卡把 delay 按出现顺序
 * 递增（0 / 0.05 / 0.1 …）就形成错峰。不要再在外面套一层 FadeIn，两层会叠加。
 */
export const SectionCard: Component<{
  title?: string
  description?: string
  step?: number
  extra?: JSX.Element
  /**
   * 入场延迟（秒），同页按卡片顺序递增。
   * 传 `false` 表示这张卡自己就是列表项、由外层 MotionItem 负责入场，卡片不再自己动，
   * 否则两层动效叠在一起（外层的缩放还没结束，内层的淡入就先到了）。
   */
  delay?: number | false
  children: JSX.Element
}> = (props) => {
  const body = () => (
    <Box bg="$surface1" borderWidth="1px" borderColor="$border" rounded="$lg" p="$5">
      <Show when={props.title}>
        <VStack alignItems="stretch" spacing="4px">
          <HStack spacing="$2" alignItems="center" justifyContent="space-between">
            <HStack spacing="$2" alignItems="center">
              <Show when={props.step}>{(n) => <StepDot n={n()} />}</Show>
              <Text fontWeight="bold" fontSize="$md">
                {props.title}
              </Text>
            </HStack>
            {props.extra}
          </HStack>
          <Show when={props.description}>
            <Text fontSize="$sm" color="$subtleText" class="pp-help">
              {props.description}
            </Text>
          </Show>
          <Box h="1px" bg="$border" mt="$2" />
        </VStack>
      </Show>
      {props.children}
    </Box>
  )

  return (
    <Show
      when={props.delay === false}
      fallback={
        <FadeIn delay={typeof props.delay === 'number' ? props.delay : undefined}>{body()}</FadeIn>
      }
    >
      {body()}
    </Show>
  )
}

export const ErrorText: Component<{ children: JSX.Element }> = (props) => (
  <Show when={props.children}>
    <Text color="$danger" fontSize="$sm" role="alert">
      {props.children}
    </Text>
  </Show>
)

export const EmptyText: Component<{ children: JSX.Element }> = (props) => (
  <Text color="$subtleText" fontSize="$sm">
    {props.children}
  </Text>
)

/** 一行小灰字说明（表单字段、参数含义、口径提示统一用它）。 */
export const Hint: Component<{ children: JSX.Element }> = (props) => (
  <Text fontSize="$xs" color="$subtleText" class="pp-help">
    {props.children}
  </Text>
)

export const PageTitle: Component<{ description?: string; children: JSX.Element }> = (props) => (
  <VStack alignItems="stretch" spacing="4px">
    <Text fontSize="$2xl" fontWeight="bold">
      {props.children}
    </Text>
    <Show when={props.description}>
      <Text fontSize="$sm" color="$subtleText" class="pp-help">
        {props.description}
      </Text>
    </Show>
  </VStack>
)

/** 键值信息网格：窄屏一列、宽屏两列，值长也不会把标签挤没。 */
export const InfoGrid: Component<{ children: JSX.Element }> = (props) => (
  <Box class="pp-grid pp-grid-2">{props.children}</Box>
)

/** 单个键值：标签（小灰字）在上、值在下。金额/编号加 mono 让数字对齐。 */
export const InfoRow: Component<{ label: string; value: JSX.Element; mono?: boolean }> = (props) => (
  <VStack alignItems="stretch" spacing="2px">
    <Text fontSize="$xs" color="$subtleText">
      {props.label}
    </Text>
    <Text fontSize="$sm" fontWeight="medium" class={props.mono ? 'pp-num' : undefined} css={{ wordBreak: 'break-word' }}>
      {props.value}
    </Text>
  </VStack>
)

/**
 * 互斥选项组（胶囊按钮）：替代原生 radio。
 * 长标签不换行、点击区域大、选中态一眼可见；打开 disabled 时降透明度且不可点。
 */
export const OptionGroup = <T extends string>(props: {
  value: T
  options: { value: T; label: string; disabled?: boolean }[]
  onChange: (value: T) => void
}) => (
  <HStack gap="6px" flexWrap="wrap">
    <For each={props.options}>
      {(opt) => (
        <Box
          as="button"
          type="button"
          class="pp-opt"
          classList={{ active: props.value === opt.value, 'pp-opt-off': !!opt.disabled }}
          disabled={opt.disabled}
          aria-pressed={props.value === opt.value}
          onClick={() => {
            if (!opt.disabled) props.onChange(opt.value)
          }}
        >
          {opt.label}
        </Box>
      )}
    </For>
  </HStack>
)

/** 表单字段：标签 + 控件 + 可选说明，间距统一。 */
export const Field: Component<{ label: string; hint?: string; children: JSX.Element }> = (props) => (
  <VStack alignItems="stretch" spacing="6px">
    <Text fontSize="$sm" fontWeight="semibold">
      {props.label}
    </Text>
    {props.children}
    <Show when={props.hint}>
      <Hint>{props.hint}</Hint>
    </Show>
  </VStack>
)

/** 组合式 Select 的薄封装：页面传 value/onChange/options 即可。 */
export const SelectField: Component<{
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  size?: 'sm' | 'md'
  maxW?: string
  disabled?: boolean
}> = (props) => (
  <Select
    size={props.size ?? 'md'}
    value={props.value}
    onChange={(v) => props.onChange(String(v))}
    disabled={props.disabled}
  >
    <SelectTrigger maxW={props.maxW}>
      <Show when={props.placeholder}>
        <SelectPlaceholder>{props.placeholder}</SelectPlaceholder>
      </Show>
      <SelectValue />
      <SelectIcon />
    </SelectTrigger>
    <SelectContent>
      <SelectListbox>
        <For each={props.options}>
          {(opt) => (
            <SelectOption value={opt.value}>
              <SelectOptionText>{opt.label}</SelectOptionText>
            </SelectOption>
          )}
        </For>
      </SelectListbox>
    </SelectContent>
  </Select>
)

export interface ReasonModalProps {
  open: boolean
  title: string
  placeholder?: string
  confirmText?: string
  danger?: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}

/** 需要填写理由的确认弹窗（管理员操作统一用它：理由必填，留空给默认文案）。 */
export const ReasonModal: Component<ReasonModalProps> = (props) => {
  const [reason, setReason] = createSignal('')
  const submit = () => {
    props.onConfirm(reason().trim())
    setReason('')
    props.onClose()
  }
  return (
    <Modal opened={props.open} onClose={() => props.onClose()}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{props.title}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Textarea
            value={reason()}
            onInput={(e) => setReason(e.currentTarget.value)}
            placeholder={props.placeholder ?? t('global.reason_placeholder')}
            rows={3}
          />
        </ModalBody>
        <ModalFooter display="flex" gap="$2">
          <Button variant="ghost" colorScheme="neutral" onClick={() => props.onClose()}>
            {t('global.cancel')}
          </Button>
          <Button colorScheme={props.danger ? 'danger' : 'info'} onClick={submit}>
            {props.confirmText ?? t('global.confirm')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
