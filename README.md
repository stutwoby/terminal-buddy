# Terminal Buddy

An ASCII RPG companion in **Copilot CLI's custom status line**, with seeded color, blinking,
bouncing, personality, cookies, and reactions to tool activity. No dependencies,
network requests, or model calls for character generation or interactions.

## Use

Requires Node.js 22+ and a Copilot CLI version supporting custom status lines and
SDK extension slash commands (developed against 1.0.98).

Copilot only permits executable status lines in **user settings**, not repository
settings. The command is also protected from `copilot config` writes. Merge these
keys into `~/.copilot/settings.json` (or `$COPILOT_HOME/settings.json`), using your
absolute script path:

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

This replaces Copilot's one custom status-line slot; preserve any previous command.
Buddy emits nothing outside this project and its subdirectories.

Start `copilot` here and approve the `project:buddy` extension's request to
register activity hooks. Declining leaves the footer animation working but
disables commands and activity reactions. Enable **custom** in `/statusline` if
hidden. Restart after installing or updating the extension if commands are absent.

| Command | Effect |
| --- | --- |
| `/buddy` or `/buddy show` | Show the character card |
| `/buddy pet` | Head pats and a happy expression |
| `/buddy reward` | Give one cookie, save the count, and show a chewing reaction |
| `/buddy motion off` / `/buddy motion on` | Freeze/resume blinking and bouncing |
| `/buddy reseed` | Replace character traits and stats with your hash-derived character |

The same actions work without Copilot:

```sh
node buddy.mjs show
node buddy.mjs reward
node buddy.mjs pet
node buddy.mjs motion off
node buddy.mjs reseed
npm test
```

Natural-language requests such as "give my buddy a cookie" use the same local
actions through the `terminal_buddy` tool. Slash commands and standalone commands
run locally without an LLM turn. `reroll` remains an alias for `reseed`; it now
returns the same hash-derived character, not a fresh random roll.

## Your identity, your character

New characters are derived from a SHA-256 hash of a namespaced local identity:
hostname, OS username, home directory, and user ID. This identifies a local
user account, **not** a verified person or portable GitHub identity. The same
account on the same machine produces the same character across project copies.
Renaming the account/machine or moving its home changes future seed derivation;
existing saves stay unchanged.

Raw identity fields are never saved, logged, or sent anywhere. Only the hash is
stored. It is a pseudonymous seed, not a secret or authentication credential.
Copying it reproduces the generated character. Labelled SHA-256 derivations
independently determine name, class, personality, stats, rarity, and appearance;
time, model output, and cookies do not affect those traits.
Color uses its own derivation from that same saved seed, selecting blue, cyan,
green, magenta, yellow, or red without changing any other generated traits.
Older unseeded characters retain blue.

Each personality has 18 authored lines across idle, working, success, worry,
petting, and cookie reactions (72 lines total). Curious buddies investigate;
sleepy buddies conserve energy; sassy buddies offer opinions; brave buddies
treat debugging as an adventure. The footer rotates within the current
personality/mood every 30 seconds, with a seed-derived starting line. Reduced
motion freezes dialogue rotation too. No generated text or model calls are used.

Five stats range from 1 to 100. Rarity weights are common 50%, uncommon 28%,
rare 15%, epic 6%, legendary 1%. Appearance offers **1,280 combinations**:

| Part | Variants |
| --- | --- |
| Hat | Top hat, crown, wizard hat, beanie, bare head |
| Eyes | Round, dots, wide, sleepy |
| Nose | Dot, triangle, button, none |
| Mouth | Smile, grin, flat, cat |
| Extra | Monocle and chain, facial scar, freckles, none |

Your existing version-1 buddy is automatically upgraded **without changing its
name, stats, personality, top hat, or monocle**. The original is backed up as
`.buddy/character.json.v1-backup`. Its seed is `null` because those old random
stats cannot honestly be attributed to a hash. Use `/buddy reseed` to opt into
the new deterministic character. Reseeding preserves cookies and motion settings.

## Persistence and rendering

Saves live in ignored `.buddy/character.json`. Invalid saves fail visibly rather
than silently replacing your character. Atomic writes avoid partial saves.
Mutating interactions use a lock so concurrent sessions cannot silently overwrite
each other's cookies or preferences; a conflicting command reports "busy" and
should be retried. If a process crashes mid-interaction, remove the empty
`.buddy/interaction.lock` directory after confirming no interaction is running.

Activity files in `.buddy/sessions/` isolate moods per session. Busy expires after
two minutes, other reactions after eight seconds; idle events settle working
expressions. Cookie counts are permanent until you edit/delete the save; they
do not boost generated stats. New characters start with **zero** cookies; only
an explicit reward action increments the count. Showing, petting, animation,
and dialogue never grant cookies.

The sprite is **16 columns by 6 rows**, beside the stats, with one line of
personality/cookie text. Wider than the original, but the same seven-line footer
height. The extra columns make the nose and accessories readable without losing
the blink and bounce.

**Per-buddy font size is not available.** Terminals use a shared character grid;
ANSI colors do not change font size for one region. Zooming a pane changes
everything in that pane. More ASCII detail requires more cells. Graphics or
Unicode half-blocks could increase apparent resolution, but would no longer be
this portable ASCII-only renderer.

Seeded colors use the terminal's theme-adjustable ANSI palette; stats retain the
host's text color. Set `NO_COLOR=1` or `TERM=dumb` for monochrome. Redirected
standalone cards stay monochrome. Extension cards are plain text.
Timeline cards use fenced `text` blocks so Markdown does not interpret facial
features, backslashes, or underscores as emphasis, escapes, or other formatting.

Animation advances at Copilot's supported one-second refresh interval, not video
frame rates. For reduced motion use `/buddy motion off`. For screen readers,
also disable the custom item in `/statusline`: freezing frames does not remove
decorative ASCII or mood updates.

## Article digest and implementation

[GitHub's ASCII-banner article](https://github.blog/engineering/from-pixels-to-characters-the-engineering-behind-github-copilot-clis-animated-ascii-banner/)
highlights the lack of a terminal canvas, inconsistent repainting and colors, and
the need for accessibility controls. Its reusable idea is to separate frame
content, timing, and presentation, leaving drawing to the host.

Buddy follows that pattern with a small local implementation: derive and save a
character, compose fixed-size trait sprites, let Copilot repaint them, and wire
commands/tool hooks to shared interaction logic. No React, cursor movement,
screen clearing, animation service, or reproduction of GitHub's mascot.

To uninstall, remove `statusLine.command` from user settings (or restore your
previous configuration) and remove `.github/extensions/buddy/`. If you move this
folder, update the absolute script path in user settings.
