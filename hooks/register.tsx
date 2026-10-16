import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Note } from '../types'

const note = atom({ plugin: 'session-note', key: 'note' } as const, null)
// When the last prompt was submitted. Kept in memory only: it is refreshed by the
// next prompt, so it is not worth persisting.
const lastCmd = atom({ plugin: 'session-note', key: 'lastCmd' } as const, null)

const SERVER = 'ccd_session_mgmt'
const MARK = ' · 📝 '
const EMPTY: Note = { text: '', color: null, baseTitle: null, noteAt: null, showTime: false }

// Short names mapped to clear, saturated shades; textOn picks black or white
// text for each so the band stays readable.
const NAMED: Record<string, string> = {
  red: '#e5484d', orange: '#f76b15', yellow: '#ffd60a', green: '#30a46c',
  blue: '#0090ff', purple: '#8e4ec6', pink: '#e93d82', teal: '#12a594',
  gray: '#8b8d98', grey: '#8b8d98',
}

// Other common CSS color names, kept as given but resolved to hex for the
// text contrast and the square emoji.
const CSS: Record<string, string> = {
  black: '#000000', white: '#ffffff', silver: '#c0c0c0', maroon: '#800000',
  navy: '#000080', olive: '#808000', lime: '#00ff00', aqua: '#00ffff',
  cyan: '#00ffff', fuchsia: '#ff00ff', magenta: '#ff00ff', brown: '#a52a2a',
  wheat: '#f5deb3', tan: '#d2b48c', beige: '#f5f5dc', ivory: '#fffff0',
  khaki: '#f0e68c', gold: '#ffd700', goldenrod: '#daa520', coral: '#ff7f50',
  salmon: '#fa8072', tomato: '#ff6347', crimson: '#dc143c', orchid: '#da70d6',
  violet: '#ee82ee', plum: '#dda0dd', lavender: '#e6e6fa', indigo: '#4b0082',
  turquoise: '#40e0d0', skyblue: '#87ceeb', steelblue: '#4682b4',
  royalblue: '#4169e1', slategray: '#708090', chocolate: '#d2691e',
  sienna: '#a0522d', peru: '#cd853f', mint: '#98ff98', mintcream: '#f5fffa',
  forestgreen: '#228b22', seagreen: '#2e8b57', darkgreen: '#006400',
  hotpink: '#ff69b4', lightpink: '#ffb6c1', peachpuff: '#ffdab9',
}

const toColor = (raw: string): string => NAMED[raw.toLowerCase()] ?? raw

const toHex = (color: string): string | null => {
  const named = CSS[color.toLowerCase()]
  if (named) return named
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(color)
  if (!m || !m[1]) return null
  const h = m[1]
  return '#' + (h.length === 3 ? h.split('').map(c => c + c).join('') : h)
}

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}

// Picks readable text for the band's background.
const textOn = (bg: string): string => {
  const hex = toHex(bg)
  if (!hex) return 'white'
  const [r, g, b] = rgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? 'black' : 'white'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (v: number): string => String(v).padStart(2, '0')

// Local time as HH:MM, with the date in front when it is not today.
const fmtTime = (ms: number, now: number): string => {
  const d = new Date(ms)
  const t = new Date(now)
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const today = d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
  return today ? clock : `${MONTHS[d.getMonth()]} ${d.getDate()} ${clock}`
}

// "note 14:02 · last cmd 14:35". A comment set before the time line existed has
// no recorded time, so its part is left out rather than shown as unknown.
export const timeLine = (n: Note, lastCmdAt: number | null, now: number): string => {
  const parts: string[] = []
  if (n.text && n.noteAt) parts.push(`note ${fmtTime(n.noteAt, now)}`)
  parts.push(`last cmd ${lastCmdAt ? fmtTime(lastCmdAt, now) : 'none yet'}`)
  return parts.join(' · ')
}

const SQUARES = ['🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫', '⬛', '⬜']

// The square emoji nearest the color, by hue, for the sidebar title.
export const squareFor = (color: string | null): string | null => {
  const hex = color ? toHex(color) : null
  if (!hex) return null
  const [r, g, b] = rgb(hex).map(v => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (s < 0.15 || d < 0.06) return l < 0.6 ? '⬛' : '⬜'
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  if (h >= 10 && h < 45 && l < 0.35) return '🟫'
  if (h < 10 || h >= 330) return '🟥'
  if (h < 45) return '🟧'
  if (h < 70) return '🟨'
  if (h < 170) return '🟩'
  if (h < 260) return '🟦'
  return '🟪'
}

const stripDecor = (title: string): string => {
  let base = title.split(MARK)[0] ?? title
  for (const sq of SQUARES) {
    if (base.startsWith(sq + ' ')) base = base.slice(sq.length + 1)
  }
  return base
}

// Prompts that did not come from the person: they don't count as "last cmd".
const AUTOMATED = new Set(['task-notification', 'scheduled-trigger', 'peer', 'plugin'])

export const countsAsCommand = (kind: unknown): boolean => !AUTOMATED.has(String(kind ?? ''))

// "/note - time", "/note -time" and "/note --time" all toggle the time line.
export const isTimeToggle = (arg: string): boolean => /^-{1,2}\s*time$/i.test(arg.trim())

// "/note -color teal" (also "- color", "--color", "-colour"): the color subcommand.
// Returns the argument after it ('' when bare), or null when arg is not one.
export const colorArg = (arg: string): string | null => {
  const m = /^-{1,2}\s*colou?r(?:\s+(.*))?$/i.exec(arg.trim())
  return m ? (m[1] ?? '').trim() : null
}

const lastKey = async ($: EngineInterface) => `last:${await $.session.id()}`

const storeKey = async ($: EngineInterface) => `note:${await $.session.id()}`

const save = async ($: EngineInterface, next: Note) => {
  const value = next.text || next.color || next.showTime ? next : null
  await update($, note, () => value)
  if (value) await $.store.set(await storeKey($), value)
  else await $.store.delete(await storeKey($))
}

const currentTitle = async ($: EngineInterface): Promise<string | null> => {
  try {
    const res = await $.mcp.call(SERVER, 'get_session', { session_id: 'self' })
    if (res.isError) return null
    const block = res.content.find(b => b.type === 'text')
    const data = JSON.parse(block && 'text' in block ? String(block.text) : '{}')
    return typeof data.title === 'string' ? data.title : null
  } catch {
    return null
  }
}

// Writes "<square> <base title> · 📝 <comment>" to the sidebar, or restores the base.
const syncTitle = async ($: EngineInterface, n: Note): Promise<string> => {
  const square = squareFor(n.color)
  const isDecorated = Boolean(n.text || square)
  const fromApp = n.baseTitle ? null : await currentTitle($)
  const base = n.baseTitle ?? (fromApp === null ? null : stripDecor(fromApp))
  if (!base) return 'Sidebar title not updated: the app session server is not reachable.'
  const title = `${square ? square + ' ' : ''}${base}${n.text ? MARK + n.text : ''}`
  try {
    const res = await $.mcp.call(SERVER, 'set_session_title', { session_id: 'self', title })
    if (res.isError) return 'Sidebar title not updated: the app declined the rename.'
  } catch {
    return 'Sidebar title not updated: the app session server is not reachable.'
  }
  const keep = isDecorated ? base : null
  if (n.baseTitle !== keep) await save($, { ...n, baseTitle: keep })
  return isDecorated ? 'Sidebar title updated.' : 'Sidebar title restored.'
}

const setColor = async ($: EngineInterface, cur: Note, arg: string): Promise<{ text: string }> => {
  if (!arg) {
    return { text: cur.color ? `Color: ${cur.color}` : 'No color set. Use /note -color <name or #hex>.' }
  }
  const color = arg.toLowerCase() === 'clear' ? null : toColor(arg)
  const n = { ...cur, color }
  await save($, n)
  const titled = await syncTitle($, n)
  const square = squareFor(color)

  return {
    text: color
      ? `Session color set to ${color}${square ? ` ${square}` : ''}. ${titled}`
      : `Session color cleared. ${titled}`,
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'note',
      description: 'Set this session\'s context comment (no text shows it, "clear" removes it, "-time" toggles a time line, "-color <name|#hex|clear>" colors it)',
      argumentHint: '[text | clear | -time | -color <color>]',
      immediate: true,
    })
    const saved = (await $.store.get(await storeKey($))) as Note | undefined
    if (saved) await update($, note, () => saved)
    const last = (await $.store.get(await lastKey($))) as number | undefined
    if (typeof last === 'number') await update($, lastCmd, () => last)

    return next(e)
  })

  // Remembers when the user last submitted a prompt, for the time line. The
  // desktop app's prompts arrive as 'sdk', so count every origin but the
  // automated ones.
  on('prompt.submit', async ($, e, next) => {
    const ran = await next(e)
    if (countsAsCommand(e.origin?.kind)) {
      try {
        const at = Date.now()
        await update($, lastCmd, () => at)
        await $.store.set(await lastKey($), at)
      } catch {
        // the time line is a convenience; never fail the prompt over it
      }
    }
    return ran
  })

  on('command.run', { command: 'note' }, async ($, e) => {
    const arg = e.args.trim()
    const cur = (await read($, note)) ?? EMPTY
    if (!arg) {
      return { text: cur.text ? `Comment: ${cur.text}` : 'No comment set. Use /note <text> (or /note -time for a time line, /note -color <color> for a color).' }
    }
    const colorRaw = colorArg(arg)
    if (colorRaw !== null) return setColor($, cur, colorRaw)
    if (isTimeToggle(arg)) {
      const showTime = !cur.showTime
      await save($, { ...cur, showTime })
      return { text: showTime ? 'Time line on.' : 'Time line off.' }
    }
    const text = arg.toLowerCase() === 'clear' ? '' : arg
    const n = { ...cur, text, noteAt: text ? Date.now() : null }
    await save($, n)
    const titled = await syncTitle($, n)

    return { text: `${text ? 'Comment set.' : 'Comment cleared.'} ${titled}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const n = await read($, note)
    if (e.props.hasSurvey || !n || (!n.text && !n.color && !n.showTime)) return next(e)
    const last = await read($, lastCmd)

    const { Box, Text } = $.ui.resolve(e)
    const bg = n.color ?? undefined
    const fg = bg ? textOn(bg) : undefined

    return (
      <Box backgroundColor={bg} paddingX={1} width={e.props.bodyColumns} flexDirection="column">
        <Text color={fg} bold wrap="truncate-end">
          📝 {n.text || '(no comment: /note <text>)'}
        </Text>
        {n.showTime && (
          <Text color={fg} wrap="truncate-end">
            🕐 {timeLine(n, last, Date.now())}
          </Text>
        )}
      </Box>
    )
  })
}
