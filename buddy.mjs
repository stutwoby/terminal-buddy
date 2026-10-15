#!/usr/bin/env node
import {
  existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { hostname, userInfo } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const STATS = ["DEBUGGING", "PATIENCE", "CHAOS", "WISDOM", "SNARK"];
export const PERSONALITIES = {
  curious: {
    idle: ["What if the bug has a tiny bug of its own?", "Do caches dream of electric hits?", "I wonder what's behind that TODO."],
    busy: ["Ooh. Let me peek under that stack trace.", "Collecting clues. And suspicious semicolons.", "Hypothesis first. Dramatic reveal later."],
    happy: ["A discovery! Put it in the good notebook.", "The evidence says: excellent work.", "One mystery solved. Three more discovered!"],
    worried: ["Interesting. In the ominous sense.", "Unexpected result. Fascinating specimen.", "Let's reproduce it before naming it."],
    pet: ["Scientific conclusion: head pats are good.", "Recording a measurable rise in happiness.", "Further head-pat research is required."],
    reward: ["Cookie acquired. Investigating the crumbs.", "Hypothesis: chocolate improves debugging.", "A delicious experiment. Needs replication."],
  },
  sleepy: {
    idle: ["Wake me when the tests turn green.", "Not asleep. Just buffering.", "This terminal is an excellent pillow."],
    busy: ["One eye open. Supervising.", "Working hard, at a restful pace.", "Please compile quietly. I'm concentrating."],
    happy: ["We did it. Scheduled nap unlocked.", "Green tests. Sweet dreams.", "Excellent. I'll celebrate horizontally."],
    worried: ["I was having a perfectly good dream.", "That error was louder than necessary.", "Let's sleep on it. After the fix."],
    pet: ["Five more minutes of this, please.", "You found the snooze button.", "Purring on minimum power."],
    reward: ["A bedtime cookie? Don't mind if I do.", "Saving half for after my nap. Maybe.", "Crunching quietly. Very quietly."],
  },
  sassy: {
    idle: ["Not judging your variable names. Yet.", "I saw that TODO. It saw me too.", "My monocle costs more than this bug."],
    busy: ["Stand back. I have opinions.", "Making it work. Looking fabulous.", "Another abstraction? How adventurous."],
    happy: ["Flawless. I will accept partial credit.", "You're welcome. For the moral support.", "I'd applaud, but I have no hands."],
    worried: ["A plot twist. How very on-brand.", "Bold strategy. The compiler disagrees.", "It's not broken. It's being dramatic."],
    pet: ["Fine. You may keep being my developer.", "Acceptable service. Four stars.", "Careful with the hat. It's bespoke."],
    reward: ["Finally. My consulting fee.", "A cookie? Your taste is improving.", "I'll allow it. And perhaps another."],
  },
  brave: {
    idle: ["Tiny blob. Unreasonably large ambitions.", "Standing guard over the main branch.", "Every great quest starts with a prompt."],
    busy: ["Into the code dungeon we go!", "Shield up. Stack trace ahead!", "No bug too big. No blob too small."],
    happy: ["Another goblin defeated. Onward!", "Victory! Raise the green banners.", "The build stands. So do we."],
    worried: ["A worthy foe. We regroup, not retreat.", "A setback, not the end of the quest.", "Hold the line. Check the logs."],
    pet: ["Morale restored. Shield at the ready!", "A blessing before the next adventure.", "Courage increased. Hat secured."],
    reward: ["Quest provisions! For the next dungeon.", "A victory biscuit. Well earned!", "Cookie secured. Party morale is soaring."],
  },
};
const RARITIES = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];
const CLASSES = ["Bug Mage", "Stack Knight", "Cache Druid", "Chaos Rogue"];
const MOODS = ["idle", "busy", "happy", "worried", "pet", "reward"];
export const TRAITS = {
  hat: ["top", "crown", "wizard", "beanie", "none"],
  eyes: ["round", "dots", "wide", "sleepy"],
  nose: ["dot", "triangle", "button", "none"],
  mouth: ["smile", "grin", "flat", "cat"],
  accessory: ["monocle", "scar", "freckles", "none"],
};
const LEGACY_APPEARANCE = {
  hat: "top", eyes: "round", nose: "none", mouth: "smile", accessory: "monocle",
};
export const COLORS = {
  blue: 94, cyan: 96, green: 92, magenta: 95, yellow: 93, red: 91,
};

function seededNumber(seed, label, size) {
  const bytes = createHash("sha256").update(`terminal-buddy:traits:v2:${seed}:${label}`).digest();
  return Number(bytes.readBigUInt64BE() * BigInt(size) / (1n << 64n));
}

export function buddyColor(buddy) {
  return buddy.seed ? Object.keys(COLORS)[seededNumber(buddy.seed, "color", Object.keys(COLORS).length)] : "blue";
}

export function saying(buddy, mood = "idle", tick = 0) {
  const lines = PERSONALITIES[buddy.personality]?.[mood];
  if (!lines) throw new Error("Unknown Buddy personality or mood.");
  const offset = seededNumber(buddy.seed ?? buddy.name, `dialogue:${mood}`, lines.length);
  const phase = Math.floor(tick / 30);
  return lines[((offset + phase) % lines.length + lines.length) % lines.length];
}

export function identitySeed(identity) {
  if (typeof identity !== "string" || !identity) throw new Error("Buddy identity must be non-empty text.");
  return createHash("sha256").update("terminal-buddy:v2\0" + identity).digest("hex");
}

export function userSeed() {
  const user = userInfo();
  return identitySeed(JSON.stringify([hostname(), user.username, user.homedir, user.uid]));
}

export function generateBuddy(seed = userSeed()) {
  if (typeof seed !== "string" || !/^[a-f0-9]{64}$/.test(seed)) {
    throw new Error("Buddy seed must be a SHA-256 hex digest.");
  }
  const number = (label, size) => seededNumber(seed, label, size);
  const pick = (label, items) => items[number(label, items.length)];
  const roll = number("rarity", 100);
  return {
    version: 2,
    seed,
    name: pick("name:first", ["Pip", "Moss", "Nib", "Wob", "Fizz", "Bram", "Zig", "Bop"])
      + pick("name:last", ["ble", "kin", "wick", "let", "bit", "lo", "bun", "nix"]),
    rarity: RARITIES[roll < 50 ? 0 : roll < 78 ? 1 : roll < 93 ? 2 : roll < 99 ? 3 : 4],
    class: pick("class", CLASSES),
    personality: pick("personality", Object.keys(PERSONALITIES)),
    stats: Object.fromEntries(STATS.map((stat) => [stat, number(`stat:${stat}`, 100) + 1])),
    appearance: Object.fromEntries(Object.entries(TRAITS).map(([part, values]) =>
      [part, pick(`appearance:${part}`, values)])),
    cookies: 0,
    motion: true,
  };
}

export function validateBuddy(buddy) {
  if (!buddy || ![1, 2].includes(buddy.version)
    || typeof buddy.name !== "string" || !/^[A-Za-z]{2,24}$/.test(buddy.name)
    || !RARITIES.includes(buddy.rarity) || !CLASSES.includes(buddy.class)
    || !Object.hasOwn(PERSONALITIES, buddy.personality)
    || typeof buddy.motion !== "boolean"
    || !STATS.every((stat) => Number.isInteger(buddy.stats?.[stat])
      && buddy.stats[stat] >= 1 && buddy.stats[stat] <= 100)) {
    throw new Error("Invalid Buddy save. Restore .buddy/character.json or move it aside to hatch a new buddy.");
  }
  if (buddy.version === 2 && (
    (buddy.seed !== null && (typeof buddy.seed !== "string" || !/^[a-f0-9]{64}$/.test(buddy.seed)))
    || !Number.isSafeInteger(buddy.cookies) || buddy.cookies < 0
    || !Object.entries(TRAITS).every(([part, values]) => values.includes(buddy.appearance?.[part]))
  )) throw new Error("Invalid Buddy appearance, seed, or cookie count.");
  return buddy;
}

function atomicWrite(path, value, exclusive = false) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  try {
    if (exclusive) linkSync(temp, path);
    else renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

export function loadBuddy(directory = join(ROOT, ".buddy")) {
  const path = join(directory, "character.json");
  try {
    const buddy = validateBuddy(JSON.parse(readFileSync(path, "utf8")));
    if (buddy.version === 1) {
      try {
        atomicWrite(path + ".v1-backup", buddy, true);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
      const upgraded = { ...buddy, version: 2, seed: null, cookies: 0, appearance: { ...LEGACY_APPEARANCE } };
      saveBuddy(upgraded, directory);
      return upgraded;
    }
    return buddy;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const buddy = generateBuddy();
  try {
    atomicWrite(path, buddy, true);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return validateBuddy(JSON.parse(readFileSync(path, "utf8")));
  }
  return buddy;
}

export function saveBuddy(buddy, directory = join(ROOT, ".buddy")) {
  atomicWrite(join(directory, "character.json"), validateBuddy(buddy));
}

function activityPath(sessionId, directory) {
  if (typeof sessionId !== "string" || !sessionId) throw new Error("Buddy needs a non-empty session ID.");
  return join(directory, "sessions", createHash("sha256").update(sessionId).digest("hex") + ".json");
}

export function setMood(sessionId, mood, directory = join(ROOT, ".buddy"), now = Date.now()) {
  if (!MOODS.includes(mood)) throw new Error(`Unknown Buddy mood: ${mood}`);
  atomicWrite(activityPath(sessionId, directory), { mood, at: now });
}

export function readMood(sessionId, directory = join(ROOT, ".buddy"), now = Date.now()) {
  if (!sessionId) return "idle";
  let state;
  try {
    state = JSON.parse(readFileSync(activityPath(sessionId, directory), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return "idle";
    throw error;
  }
  if (!MOODS.includes(state?.mood) || !Number.isFinite(state.at)) {
    throw new Error("Invalid Buddy activity file.");
  }
  const lifetime = state.mood === "busy" ? 120_000 : 8_000;
  return now - state.at >= lifetime ? "idle" : state.mood;
}

export function sprite(mood = "idle", tick = 0, appearance = LEGACY_APPEARANCE) {
  if (!MOODS.includes(mood)) throw new Error(`Unknown Buddy mood: ${mood}`);
  if (!Object.entries(TRAITS).every(([part, values]) => values.includes(appearance?.[part]))) {
    throw new Error("Invalid Buddy appearance.");
  }
  const phase = ((tick % 8) + 8) % 8;
  const eye = mood === "happy" || mood === "pet" || mood === "reward" ? "^"
    : mood === "worried" ? "O" : phase === 5 ? "-"
      : { round: "o", dots: ".", wide: "O", sleepy: "-" }[appearance.eyes];
  const rightEye = appearance.accessory === "monocle" ? `(${eye})` : ` ${eye} `;
  const nose = { dot: ".", triangle: "^", button: "o", none: " " }[appearance.nose];
  const mouth = mood === "worried" ? " ~ " : mood === "busy" ? " . "
    : mood === "reward" ? "www" : { smile: " v ", grin: "\\_/", flat: "---", cat: " w " }[appearance.mouth];
  const hats = {
    top: ["     |###|", "    _|___|_"],
    crown: ["    /\\/\\/\\", "    |____|"],
    wizard: ["       /\\", "    __/.*\\__"],
    beanie: ["      _o_", "    /=====\\ "],
    none: ["", "     .---."],
  };
  const cheek = appearance.accessory === "scar" ? "/" : appearance.accessory === "freckles" ? ":" : " ";
  const chain = appearance.accessory === "monocle" ? ":" : " ";
  const bounce = phase === 2 || phase === 3;
  const body = [
    ...hats[appearance.hat],
    `  / ${eye} ${nose} ${rightEye} \\`,
    ` |${cheek}   ${mouth}    |${chain}`,
    mood === "reward" ? "  \\_________/(*)" : "  \\_________/",
  ];
  return (bounce ? [...body, ""] : ["", ...body]).map((line) => line.padEnd(16));
}

export function renderBuddy(buddy, { mood = "idle", tick = 0, card = false, color = false } = {}) {
  validateBuddy(buddy);
  const art = sprite(mood, buddy.motion ? tick : 0, buddy.appearance ?? LEGACY_APPEARANCE);
  const lines = [
    `${buddy.name} | ${buddy.rarity} ${buddy.class}`,
    ...STATS.map((stat) => {
      const value = buddy.stats[stat];
      const filled = Math.round(value / 10);
      return `${stat.padEnd(9)} [${"#".repeat(filled)}${".".repeat(10 - filled)}] ${String(value).padStart(3)}`;
    }),
  ].map((line, index) => {
    const figure = color ? `\x1b[${COLORS[buddyColor(buddy)]}m${art[index]}\x1b[39m` : art[index];
    return figure + " " + line;
  });
  lines.push(` ${saying(buddy, mood, buddy.motion ? tick : 0)} | Cookies: ${buddy.cookies ?? 0}`);
  if (!card) return lines.join("\n");
  const visibleLength = (line) => line.replace(/\x1b\[[0-9;]*m/g, "").length;
  const width = Math.max(...lines.map(visibleLength));
  const border = "+" + "-".repeat(width + 2) + "+";
  return [border, ...lines.map((line) => `| ${line}${" ".repeat(width - visibleLength(line))} |`), border].join("\n");
}

export function parseStatusInput(text) {
  const data = text.trim() ? JSON.parse(text) : {};
  if (!data || typeof data !== "object" || Array.isArray(data)
    || (data.session_id != null && typeof data.session_id !== "string")
    || (data.cwd != null && (typeof data.cwd !== "string" || !isAbsolute(data.cwd)))) {
    throw new Error("Expected a Copilot status-line JSON object.");
  }
  return data;
}

export function isBuddyWorkspace(cwd) {
  if (!cwd) return true;
  const path = relative(ROOT, cwd);
  return path === "" || (path !== ".." && !path.startsWith("../")
    && !path.startsWith("..\\") && !isAbsolute(path));
}

export function interact(action, directory = join(ROOT, ".buddy"), sessionId) {
  if (!["show", "pet", "reward", "reseed", "reroll", "motion-on", "motion-off"].includes(action)) {
    throw new Error("Usage: /buddy [show|pet|reward|reseed|motion on|motion off]");
  }
  const mutating = !["show", "pet"].includes(action);
  const lock = join(directory, "interaction.lock");
  if (mutating) {
    mkdirSync(directory, { recursive: true });
    try {
      mkdirSync(lock);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      throw new Error("Buddy is busy; try again. After a crashed process, remove .buddy/interaction.lock.");
    }
  }
  try {
    let buddy = loadBuddy(directory);
    if (action === "reseed" || action === "reroll") {
      const generated = generateBuddy();
      buddy = { ...generated, motion: buddy.motion, cookies: buddy.cookies };
      saveBuddy(buddy, directory);
    }
    if (action === "reward") {
      if (buddy.cookies === Number.MAX_SAFE_INTEGER) throw new Error("Buddy's cookie jar is full.");
      buddy.cookies++;
      saveBuddy(buddy, directory);
    }
    if (action.startsWith("motion-")) {
      buddy.motion = action === "motion-on";
      saveBuddy(buddy, directory);
    }
    const mood = action === "pet" || action === "reward" ? action : "idle";
    if (sessionId && mood !== "idle") setMood(sessionId, mood, directory);
    return { buddy, mood };
  } finally {
    if (mutating) rmdirSync(lock);
  }
}

async function main() {
  const [command = "show", ...args] = process.argv.slice(2);
  if (command === "help" || command === "--help") {
    process.stdout.write("Buddy: show | status | pet | reward | reseed | motion on|off\n");
    return;
  }
  if (!["show", "status", "pet", "reward", "reseed", "reroll", "motion"].includes(command)
    || (command === "motion" ? args.length !== 1 || !["on", "off"].includes(args[0]) : args.length > 0)) {
    throw new Error("Usage: node buddy.mjs [show|status|pet|reward|reseed|motion on|motion off]");
  }
  let mood = command === "pet" ? "pet" : "idle";
  if (command === "status") {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 1_048_576) throw new Error("Buddy status input exceeds 1 MiB.");
    }
    const status = parseStatusInput(input);
    if (!isBuddyWorkspace(status.cwd)) return;
    mood = readMood(status.session_id);
  }
  const result = command === "status" ? { buddy: loadBuddy(), mood }
    : interact(command === "motion" ? `motion-${args[0]}` : command);
  const buddy = result.buddy;
  mood = result.mood;
  process.stdout.write(renderBuddy(buddy, {
    mood, tick: Math.floor(Date.now() / 1000), card: command !== "status",
    color: !Object.hasOwn(process.env, "NO_COLOR") && process.env.TERM !== "dumb"
      && (command === "status" || Boolean(process.stdout.isTTY)),
  }) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Buddy: ${error.message}\n`);
    process.exitCode = 1;
  });
}
