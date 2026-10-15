# Terminal Buddy

A tiny, original ASCII blob that lives in **Copilot CLI's custom status line**.
It is blue and wears a top hat and monocle, complete with a dangling chain.
It hatches with a random name, rarity, class, personality, and five RPG stats.
Its character survives restarts; moods react to Copilot tool activity. No packages,
network requests, or extra model calls.

## Use

Requires Node.js 22+ and a Copilot CLI version supporting `statusLine.command`,
`statusLine.refreshInterval`, and project extensions. No dependency installation
is necessary.

Copilot only permits executable status lines in **user settings**, not repository
settings. The command is also protected from `copilot config` writes. Edit
`~/.copilot/settings.json` (or `$COPILOT_HOME/settings.json`) and merge these keys
into the existing object, using your absolute script path:

```json
{
  "statusLine": {
    "command": "node \"/absolute/path/to/cli-buddy/buddy.mjs\" status",
    "refreshInterval": 1,
    "padding": 0
  },
  "footer": {
    "showCustom": true
  }
}
```

If you already have a custom status-line command, save it first: this replaces
that one custom slot. Buddy's command emits nothing outside this project and its
subdirectories, so the pet remains project-scoped.

In a **new** session, approve the `project:buddy` extension's request to register
activity hooks. Declining leaves the animated pet working but disables tool
reactions and the Buddy tool. If hidden, run `/statusline` and enable the
**custom** item. Ask Copilot to **"show my buddy"**, **"pet my buddy"**, or
**"turn buddy motion off"** to use the extension.

You can also use:

```sh
node buddy.mjs show
node buddy.mjs pet
node buddy.mjs motion off
node buddy.mjs motion on
node buddy.mjs reroll
npm test
```

`reroll` explicitly replaces your character. Saves live in `.buddy/character.json`
(ignored by Git). Activity files under `.buddy/sessions/` are isolated per Copilot
session and expire into idle visually. Invalid saves report an error rather than
silently replacing your buddy.

The status command expects Copilot's JSON on stdin:

```sh
printf '{"session_id":"demo"}' | node buddy.mjs status
```

## Small implementation plan

1. Generate and atomically save one character, with independent 1-100 stats and
   weighted rarities (common 50%, uncommon 28%, rare 15%, epic 6%, legendary 1%).
2. Render fixed-size plain ASCII frames beside stats. Blink and bounce once per
   second using Copilot's own repaint loop; never move the cursor ourselves.
3. Use extension hooks for working, success, and failure reactions, and a tool for
   showing/petting the character or switching motion off.

## What the article taught us

[GitHub's banner engineering article](https://github.blog/engineering/from-pixels-to-characters-the-engineering-behind-github-copilot-clis-animated-ascii-banner/)
explains why terminal animation is more than printing frames: there is no canvas,
repaints can flicker, colors depend on terminal themes, and rapid updates can
overwhelm screen readers. Its useful pattern is to separate frame content, timing,
and presentation, and leave rendering ownership with the host.

Buddy uses that pattern without copying GitHub's mascot or 6,000-line animation
pipeline. Its ASCII sprite uses theme-adjustable ANSI bright blue; stats retain
the host's text color. Set `NO_COLOR=1` or `TERM=dumb` for monochrome output.
Redirected standalone cards stay monochrome. Copilot handles drawing: no cursor
hiding, full-screen clearing, React, or timer process is necessary.

**Limits:** This is a seven-line footer pet, not a replacement for Copilot's
built-in mascot or a native `/buddy` command. The supported refresh interval is a
whole second, so motion is intentionally gentle rather than fluid. The setup
stores an absolute script path in user settings; rerun setup if you move this
folder. Native custom slash commands are not registered by this extension; ask
in natural language instead.

Animation is enabled by the explicit status-line setup above.
For reduced motion, run `node buddy.mjs motion off`. For screen readers, also
disable the custom footer item with `/statusline`: motion-off freezes frames but
does not remove decorative ASCII or changing mood text.

To uninstall the footer, remove `statusLine.command` from user settings (or restore
your previous command and refresh interval). Delete this project's
`.github/extensions/buddy/` directory to remove the extension.
