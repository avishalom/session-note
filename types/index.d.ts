export type Note = {
  text: string
  color: string | null
  baseTitle: string | null
  // Epoch ms the comment was last set; absent in state saved before 0.2.7.
  noteAt?: number | null
  // Whether the band shows the time line (/note - time).
  showTime?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'session-note': { note: Note | null; lastCmd: number | null }
  }
}
