import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { colorArg, countsAsCommand, isTimeToggle, squareFor, timeLine } from '../hooks/register'

const stubSessionServer = (on: On, titles: string[]) => {
  on('session.id', async () => ({ value: 'sess-1' }))
  mock.store(on)
  on('mcp.call', async ($, e) => {
    if (e.tool === 'get_session') {
      const title = titles.at(-1) ?? 'Fix login bug'
      return { value: { content: [{ type: 'text', text: JSON.stringify({ title }) }], isError: false } }
    }
    titles.push(String(e.args.title))
    return { value: { content: [{ type: 'text', text: 'ok' }], isError: false } }
  })
}

const run = ($: { command: { run: (i: never) => Promise<{ text?: string }> } }, command: string, args: string) =>
  $.command.run({ command, args } as never)

describe('session-note', () => {
  test('a comment renames the session and shows above the prompt', async ($, on) => {
    const titles: string[] = []
    stubSessionServer(on, titles)

    const set = await run($, 'note', 'waiting on QA sign-off')
    expect(set.text).toContain('Comment set.')
    expect(titles).toEqual(['Fix login bug · 📝 waiting on QA sign-off'])

    const colored = await run($, 'note', '-color teal')
    expect(colored.text).toContain('🟦')
    expect(titles.at(-1)).toBe('🟦 Fix login bug · 📝 waiting on QA sign-off')

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'session-note', surface, component: 'AbovePrompt',
        props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80,
          scroll: { offset: 0, bodyRows: 9 }, view: {} } as never,
      })
      expect(await ui.find({ type: 'Text', text: /waiting on QA/ })).toBeDefined()
      expect(await ui.drawn()).toMatchObject({ type: 'Box', props: { backgroundColor: '#12a594' } })
    }

    await run($, 'note', 'clear')
    expect(titles.at(-1)).toBe('🟦 Fix login bug')

    await run($, 'note', '-color clear')
    expect(titles.at(-1)).toBe('Fix login bug')
  })

  test('light named colors get black text', async ($, on) => {
    stubSessionServer(on, [])
    await run($, 'note', 'tan band')
    await run($, 'note', '- color wheat')
    const ui = await $.ui.mount({
      plugin: 'session-note', surface: 'desktop', component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80,
        scroll: { offset: 0, bodyRows: 9 }, view: {} } as never,
    })
    expect(await ui.find({ type: 'Text', text: /tan band/ })).toMatchObject({ props: { color: 'black' } })
  })

  test('named colors are clear shades with the matching square and readable text', async ($, on) => {
    stubSessionServer(on, [])
    await run($, 'note', 'check')
    const expected: Record<string, [string, string]> = {
      red: ['🟥', 'white'], orange: ['🟧', 'white'], yellow: ['🟨', 'black'],
      green: ['🟩', 'white'], blue: ['🟦', 'white'], purple: ['🟪', 'white'],
      teal: ['🟦', 'white'], gray: ['⬛', 'white'],
    }
    for (const [name, [square, text]] of Object.entries(expected)) {
      const out = await run($, 'note', `--color ${name}`)
      expect(out.text).toContain(square)
      const ui = await $.ui.mount({
        plugin: 'session-note', surface: 'desktop', component: 'AbovePrompt',
        props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80,
          scroll: { offset: 0, bodyRows: 9 }, view: {} } as never,
      })
      expect(await ui.find({ type: 'Text', text: /check/ })).toMatchObject({ props: { color: text } })
    }
  })

  test('colors map to the nearest square', () => {
    expect(squareFor('#FFBB33')).toBe('🟧')
    expect(squareFor('#FD6C41')).toBe('🟧')
    expect(squareFor('tomato')).toBe('🟥')
    expect(squareFor('#FDEC41')).toBe('🟨')
    expect(squareFor('wheat')).toBe('🟧')
    expect(squareFor('#5c1f1f')).toBe('🟥')
    expect(squareFor('#1f4a2a')).toBe('🟩')
    expect(squareFor('#5a4a12')).toBe('🟨')
    expect(squareFor('#3d2459')).toBe('🟪')
    expect(squareFor('#8b4513')).toBe('🟫')
    expect(squareFor('#3a3a3a')).toBe('⬛')
    expect(squareFor('white')).toBe('⬜')
    expect(squareFor('notacolor')).toBeNull()
  })

  test('/note - time toggles a time line and is never stored as the comment', async ($, on) => {
    const titles: string[] = []
    stubSessionServer(on, titles)
    on('prompt.submit', async (_, e) => ({ text: e.text }))
    const mount = () => $.ui.mount({
      plugin: 'session-note', surface: 'desktop', component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80,
        scroll: { offset: 0, bodyRows: 9 }, view: {} } as never,
    })

    await run($, 'note', 'waiting on QA')
    expect((await run($, 'note', '- time')).text).toBe('Time line on.')
    expect((await run($, 'note', '')).text).toBe('Comment: waiting on QA')
    expect(titles).toEqual(['Fix login bug · 📝 waiting on QA'])

    const ui = await mount()
    expect(await ui.find({ type: 'Text', text: /note \d\d:\d\d · last cmd none yet/ })).toBeDefined()

    // A submitted prompt fills in "last cmd".
    await $.prompt.submit({ text: 'run the tests', origin: { kind: 'composer' } } as never)
    expect(await (await mount()).find({ type: 'Text', text: /last cmd \d\d:\d\d/ })).toBeDefined()

    expect((await run($, 'note', '- time')).text).toBe('Time line off.')
    expect(await (await mount()).find({ type: 'Text', text: /last cmd/ })).toBeUndefined()
  })

  test('time line format', () => {
    const now = new Date(2026, 9, 12, 15, 0).getTime()
    const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime()
    const n = { text: 'x', color: null, baseTitle: null, noteAt: at(12, 14, 2), showTime: true }
    expect(timeLine(n, at(12, 14, 35), now)).toBe('note 14:02 · last cmd 14:35')
    expect(timeLine({ ...n, noteAt: at(11, 9, 5) }, at(12, 14, 35), now)).toBe('note Oct 11 09:05 · last cmd 14:35')
    // State saved before the timestamp existed.
    const { noteAt: _, ...old } = n
    expect(timeLine(old, null, now)).toBe('last cmd none yet')
    expect(timeLine({ ...n, text: '' }, at(12, 14, 35), now)).toBe('last cmd 14:35')
  })
  test('every spelling of the time toggle works', () => {
    for (const arg of ['- time', '-time', '--time', ' - TIME ']) expect(isTimeToggle(arg)).toBe(true)
    for (const arg of ['time', 'time for lunch', '- times']) expect(isTimeToggle(arg)).toBe(false)
  })

  test('every spelling of the color subcommand works; plain text stays a comment', () => {
    expect(colorArg('-color teal')).toBe('teal')
    expect(colorArg('- color #2b4a6f')).toBe('#2b4a6f')
    expect(colorArg('--COLOUR clear')).toBe('clear')
    expect(colorArg('-color')).toBe('')
    for (const arg of ['color me surprised', 'teal', '-colors red', '-time']) expect(colorArg(arg)).toBeNull()
  })

  test('/note -color with no value shows the color and does not touch the comment', async ($, on) => {
    stubSessionServer(on, [])
    await run($, 'note', 'keep me')
    expect((await run($, 'note', '-color')).text).toBe('No color set. Use /note -color <name or #hex>.')
    await run($, 'note', '-color red')
    expect((await run($, 'note', '-color')).text).toBe('Color: #e5484d')
    expect((await run($, 'note', '')).text).toBe('Comment: keep me')
  })

  test('prompts from any surface count as the last command; automated ones do not', () => {
    for (const kind of ['composer', 'bridge', 'sdk', 'unclassified']) expect(countsAsCommand(kind)).toBe(true)
    for (const kind of ['task-notification', 'scheduled-trigger', 'peer', 'plugin']) expect(countsAsCommand(kind)).toBe(false)
  })
})
