/**
 * 主题与全局样式（风格与动画对齐 OpenList）。
 *
 * 三个部分：
 *  1. colors：白蓝 / 黑蓝两套语义色，Hope UI 会按 light/dark 作用域生成 CSS 变量，
 *     切换配色模式时所有引用这些 token 的样式自动跟随；
 *  2. components：组件级默认样式 —— 圆角、输入框填充态、按钮按下的缩放动效
 *     （OpenList 的手感基本来自这几条）；
 *  3. globalStyles：已经搬到 app/styles.css（globalCss 不生成 at-rule，详见那里的说明）。
 */

import type { HopeThemeConfig } from '@hope-ui/solid'

export const theme: HopeThemeConfig = {
  initialColorMode: 'system',

  lightTheme: {
    colors: {
      primary: '#1F6FEB',
      primaryHover: '#1A5FCC',
      primarySoft: '#E8F1FE',
      background: '#F4F7FB',
      surface1: '#FFFFFF',
      surface2: '#FFFFFF',
      surface3: '#F1F5FB',
      surface4: '#E8F1FE',
      text: '#0F1B2D',
      subtleText: '#55637A',
      border: '#DFE7F1',
      success: '#16A34A',
      warning: '#D97706',
      danger: '#DC2626',
    },
    radii: { sm: '6px', md: '8px', lg: '12px', xl: '16px' },
  },

  darkTheme: {
    colors: {
      primary: '#3B82F6',
      primaryHover: '#60A5FA',
      primarySoft: '#12213D',
      background: '#070B14',
      surface1: '#0F1626',
      surface2: '#16203A',
      surface3: '#12213D',
      surface4: '#12213D',
      text: '#E6EDF7',
      subtleText: '#93A4BF',
      border: '#1E2A42',
      success: '#22C55E',
      warning: '#F59E0B',
      danger: '#F87171',
    },
    radii: { sm: '6px', md: '8px', lg: '12px', xl: '16px' },
  },

  components: {
    Button: {
      baseStyle: {
        root: {
          rounded: '$lg',
          transition: '0.2s',
          _active: { transform: 'scale(.95)' },
          _focus: { boxShadow: 'unset' },
        },
      },
      defaultProps: {
        // Hope UI 的 colorScheme 只认内置调色板（info/success/danger/warning/neutral）；
        // 主色用 info（蓝），与 OpenList 一致。
        root: { colorScheme: 'info', variant: 'subtle' },
      },
    },
    IconButton: {
      baseStyle: {
        root: { rounded: '$lg', transition: '0.2s', _active: { transform: 'scale(.9)' } },
      },
      defaultProps: { colorScheme: 'neutral', variant: 'ghost' },
    },
    Input: {
      baseStyle: {
        input: {
          rounded: '$lg',
          _focus: { boxShadow: 'unset', borderColor: '$primary' },
        },
      },
      defaultProps: { input: { variant: 'outline', size: 'md' } },
    },
    Textarea: {
      baseStyle: {
        rounded: '$lg',
        _focus: { boxShadow: 'unset', borderColor: '$primary' },
        resize: 'vertical',
      },
      defaultProps: { variant: 'outline' },
    },
    Select: {
      baseStyle: {
        trigger: {
          rounded: '$lg',
          _focus: { boxShadow: 'unset', borderColor: '$primary' },
        },
        content: { border: 'none', rounded: '$lg' },
      },
    },
    Menu: {
      baseStyle: {
        content: { rounded: '$md', minW: 'unset' },
        item: { rounded: '$md', py: '$1' },
      },
    },
    Modal: {
      baseStyle: { content: { rounded: '$lg' } },
    },
    Alert: {
      baseStyle: { root: { rounded: '$lg' } },
    },
    Badge: {
      baseStyle: { root: { rounded: '$full', px: '$2' } },
    },
    Checkbox: {
      defaultProps: { root: { colorScheme: 'info' } },
    },
    Table: {
      baseStyle: {
        th: { fontWeight: 'semibold' },
      },
    },
  },
}

/*
 * 全局样式（reset、字体、页面淡入、滚动条、reduce-motion）都在 app/styles.css，
 * 不走 Hope UI 的 globalCss —— 它不生成 at-rule，注入顺序还会被 CSSReset 压过，
 * 导致 `@keyframes ppFadeIn` 与 body 的文本色双双失效。那份文件顶部有完整说明。
 */
