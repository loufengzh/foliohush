import { useEffect, useLayoutEffect, useState } from 'react'

export const THEME_STORAGE_KEY = 'foliohush.theme.v1'
export const THEMES = [
  {
    id: 'botanical',
    name: 'Botanical',
    mode: 'light',
    description: 'A sunlit garden. Soft sage, warm paper.',
    tokens: {
      paper: '#fbfaf7',
      sidebar: '#edf0e7',
      surface: '#e2e9d9',
      raised: '#ffffff',
      ink: '#293c32',
      muted: '#5c6857',
      accent: '#3d624b',
      'on-accent': '#ffffff',
      line: '#c7d0bd',
      focus: '#426e4d',
      selection: '#d5e6c9',
      highlight: '#e7edaa',
      'on-highlight': '#344022',
      error: '#914321',
      'error-bg': '#fff0de',
    },
  },
  {
    id: 'parchment',
    name: 'Parchment',
    mode: 'light',
    description: 'An old bookshop. Honey, linen, sepia.',
    tokens: {
      paper: '#f8efdd',
      sidebar: '#ebddc3',
      surface: '#e7d5b6',
      raised: '#fff8ea',
      ink: '#463422',
      muted: '#68563f',
      accent: '#805028',
      'on-accent': '#ffffff',
      line: '#cdbb9b',
      focus: '#89521f',
      selection: '#ead1a5',
      highlight: '#efd99c',
      'on-highlight': '#463422',
      error: '#923824',
      'error-bg': '#ffebdc',
    },
  },
  {
    id: 'porcelain',
    name: 'Porcelain',
    mode: 'light',
    description: 'Clear lines. Cobalt on cool white.',
    tokens: {
      paper: '#ffffff',
      sidebar: '#eff3f9',
      surface: '#e3ebf7',
      raised: '#f8faff',
      ink: '#1c2c45',
      muted: '#526580',
      accent: '#2556a8',
      'on-accent': '#ffffff',
      line: '#c2cee0',
      focus: '#245bd0',
      selection: '#d6e5ff',
      highlight: '#dce8ff',
      'on-highlight': '#203c68',
      error: '#a33435',
      'error-bg': '#fff0f0',
    },
  },
  {
    id: 'rosewater',
    name: 'Rosewater',
    mode: 'light',
    description: 'A softer afternoon. Clay and dusty rose.',
    tokens: {
      paper: '#fff8f6',
      sidebar: '#f2e5e5',
      surface: '#ead7dc',
      raised: '#fffdfb',
      ink: '#4b303a',
      muted: '#795663',
      accent: '#914258',
      'on-accent': '#ffffff',
      line: '#d8bdc7',
      focus: '#a03a60',
      selection: '#f0d3df',
      highlight: '#f5d9ac',
      'on-highlight': '#53352a',
      error: '#a23236',
      'error-bg': '#ffebe9',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    mode: 'dark',
    description: 'After hours. Inky blue, distant stars.',
    tokens: {
      paper: '#171e30',
      sidebar: '#101727',
      surface: '#263149',
      raised: '#202a40',
      ink: '#e6ebf7',
      muted: '#abb9d4',
      accent: '#aac6ff',
      'on-accent': '#172645',
      line: '#435372',
      focus: '#accaff',
      selection: '#344d76',
      highlight: '#51492d',
      'on-highlight': '#ffedab',
      error: '#ffb4a9',
      'error-bg': '#492830',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    mode: 'dark',
    description: 'A woodland cabin. Moss and deep pine.',
    tokens: {
      paper: '#172923',
      sidebar: '#10201a',
      surface: '#293e32',
      raised: '#20352b',
      ink: '#e6efe2',
      muted: '#b1c5ac',
      accent: '#b7cf96',
      'on-accent': '#203318',
      line: '#4b6754',
      focus: '#c0df9d',
      selection: '#3d5c43',
      highlight: '#505832',
      'on-highlight': '#edf5b6',
      error: '#ffbb9f',
      'error-bg': '#482f25',
    },
  },
  {
    id: 'ink',
    name: 'Ink',
    mode: 'dark',
    description: 'Less noise. Graphite, silver, pure focus.',
    tokens: {
      paper: '#1b1b1d',
      sidebar: '#111113',
      surface: '#303033',
      raised: '#242427',
      ink: '#efeff0',
      muted: '#b9b9c1',
      accent: '#e3e3e8',
      'on-accent': '#242426',
      line: '#57575f',
      focus: '#eeeeff',
      selection: '#46464f',
      highlight: '#555137',
      'on-highlight': '#f5efb8',
      error: '#ffb9b9',
      'error-bg': '#492b2e',
    },
  },
  {
    id: 'espresso',
    name: 'Espresso',
    mode: 'dark',
    description: 'Late-night notes. Cocoa and warm copper.',
    tokens: {
      paper: '#2a201e',
      sidebar: '#201816',
      surface: '#40302a',
      raised: '#342823',
      ink: '#f4e8df',
      muted: '#cbb4a7',
      accent: '#eabb8f',
      'on-accent': '#382418',
      line: '#71554a',
      focus: '#f6c796',
      selection: '#694739',
      highlight: '#62502d',
      'on-highlight': '#ffe5a7',
      error: '#ffb5a1',
      'error-bg': '#512d27',
    },
  },
] as const
export type ThemeId = (typeof THEMES)[number]['id']
export type ThemePreference = ThemeId | 'system'
export function parseTheme(value: string | null): ThemePreference {
  return value === 'system' || THEMES.some((theme) => theme.id === value)
    ? (value as ThemePreference)
    : 'botanical'
}
export function readTheme(): ThemePreference {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'botanical'
  }
}
export function applyTheme(preference: ThemePreference) {
  const id =
    preference === 'system'
      ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'midnight'
        : 'botanical'
      : preference
  const theme = THEMES.find((item) => item.id === id)!
  document.documentElement.dataset.theme = theme.id
  document.documentElement.style.colorScheme = theme.mode
  for (const [key, value] of Object.entries(theme.tokens))
    document.documentElement.style.setProperty(`--${key}`, value)
  return theme
}
export function useTheme() {
  const [preference, setPreference] = useState(readTheme)
  const [storageError, setStorageError] = useState(false)
  useLayoutEffect(() => {
    applyTheme(preference)
  }, [preference])
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const updateSystem = () => {
      if (preference === 'system') applyTheme(preference)
    }
    const updateStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        setPreference(parseTheme(event.newValue))
        setStorageError(false)
      }
    }
    media?.addEventListener('change', updateSystem)
    window.addEventListener('storage', updateStorage)
    return () => {
      media?.removeEventListener('change', updateSystem)
      window.removeEventListener('storage', updateStorage)
    }
  }, [preference])
  function chooseTheme(next: ThemePreference) {
    setPreference(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }
  return { preference, chooseTheme, storageError }
}
