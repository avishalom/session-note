# session-note

A Claude Code mod that pins a context comment and a color to a session, so you
can tell your sessions apart at a glance.

Screenshot: the band above the prompt, in orange.

![The session-note band above the prompt, in orange](https://raw.githubusercontent.com/avishalom/session-note/main/docs/band.png)

- The comment shows in a band above the prompt, all the time.
- The band takes the session's color, and a matching square emoji (🟥 🟧 🟨 🟩 🟦 🟪 🟫 ⬛ ⬜) starts the session's sidebar title.
- In the desktop Code tab, the comment is also appended to the session's sidebar title, so it shows when you hover the session in the sidebar.

Screenshot: a session in the sidebar with its red square and comment.

![A session in the sidebar with its red square and comment](https://raw.githubusercontent.com/avishalom/session-note/main/docs/sidebar.png)

## Commands

- `/note <text>` — Set the comment
- `/note` — Show the current comment
- `/note clear` — Remove the comment and restore the sidebar title
- `/note -time` (or `/note - time`) — Toggle a time line in the band, such as `note 14:02 · last cmd 14:35`: when the comment was set and when you last submitted a prompt (the date is added when it is not today)
- `/note -color <color>` — Color the band and add a matching square to the sidebar title: `red`, `green`, `blue`, `yellow`, `orange`, `purple`, `pink`, `teal`, `gray`, common CSS names like `wheat`, or a hex value like `#2b4a6f`
- `/note -color clear` — Remove the color
- `/note -color` — Show the current color

Comments, colors and the time line setting are saved per session and come back when you reopen it.

## Install

Run these two commands in a terminal. They install the mod for every Claude
Code session, in the terminal and in the desktop app's Code tab:

```bash
claude plugin marketplace add avishalom/session-note
claude plugin install session-note@session-note --scope user
```

Restart Claude Code, then try `/note hello` and `/note -color teal`.

To update later:

```bash
claude plugin update session-note@session-note
```

## Limits

- The sidebar rename works only in the desktop Code tab. The terminal has no sidebar.
- If you named the session yourself, the app asks before renaming it.
- Mods can't recolor the whole transcript or add to the sidebar's hover card or right-click menu, so the color applies to the band and the title's square emoji only.
- Needs a Claude Code build with hot-reloading mod support (2.1.293 or later).
