#!/usr/bin/env node
import {
  existsSync, linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const STATS = ["DEBUGGING", "PATIENCE", "CHAOS", "WISDOM", "SNARK"];
export const PERSONALITIES = {
  curious: {
    idle: "What if the bug has a tiny bug of its own?",
    busy: "Ooh. Let me peek under that stack trace.",
    happy: "A discovery! Put it in the good notebook.",
    worried: "Interesting. In the ominous sense.",
    pet: "Scientific conclusion: head pats are good.",
  },
  sleepy: {
    idle: "Wake me when the tests turn green.",
    busy: "One eye open. Supervising.",
    happy: "We did it. Scheduled nap unlocked.",
    worried: "I was having a perfectly good dream.",
    pet: "Five more minutes of this, please.",
  },
  sassy: {
    idle: "Not judging your variable names. Yet.",
    busy: "Stand back. I have opinions.",
    happy: "Flawless. I will accept partial credit.",
    worried: "A plot twist. How very on-brand.",
    pet: "Fine. You may keep being my developer.",
  },
  brave: {
    idle: "Tiny blob. Unreasonably large ambitions.",
    busy: "Into the code dungeon we go!",
    happy: "Another goblin defeated. Onward!",
    worried: "A worthy foe. We regroup, not retreat.",
    pet: "Morale restored. Shield at the ready!",
  },
};
const RARITIES = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];
const CLASSES = ["Bug Mage", "Stack Knight", "Cache Druid", "Chaos Rogue"];
const MOODS = ["idle", "busy", "happy", "worried", "pet"];
const pick = (items) => items[randomInt(items.length)];

export function generateBuddy() {
  const roll = randomInt(100);
  return {
    version: 1,
    name: pick(["Pip", "Moss", "Nib", "Wob", "Fizz", "Bram", "Zig", "Bop"])
      + pick(["ble", "kin", "wick", "let", "bit", "lo", "bun", "nix"]),
    rarity: RARITIES[roll < 50 ? 0 : roll < 78 ? 1 : roll < 93 ? 2 : roll < 99 ? 3 : 4],
    class: pick(CLASSES),
    personality: pick(Object.keys(PERSONALITIES)),
    stats: Object.fromEntries(STATS.map((stat) => [stat, randomInt(1, 101)])),
    motion: true,
  };
}

export function validateBuddy(buddy) {
  if (!buddy || buddy.version !== 1
    || typeof buddy.name !== "string" || !/^[A-Za-z]{2,24}$/.test(buddy.name)
    || !RARITIES.includes(buddy.rarity) || !CLASSES.includes(buddy.class)
    || !Object.hasOwn(PERSONALITIES, buddy.personality)
    || typeof buddy.motion !== "boolean"
    || !STATS.every((stat) => Number.isInteger(buddy.stats?.[stat])
      && buddy.stats[stat] >= 1 && buddy.stats[stat] <= 100)) {
    throw new Error("Invalid Buddy save. Restore .buddy/character.json or move it aside to hatch a new buddy.");
  }
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
    return validateBuddy(JSON.parse(readFileSync(path, "utf8")));
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

export function sprite(mood = "idle", tick = 0) {
  if (!MOODS.includes(mood)) throw new Error(`Unknown Buddy mood: ${mood}`);
  const phase = ((tick % 8) + 8) % 8;
  const eyes = mood === "happy" || mood === "pet" ? "^(^)"
    : mood === "worried" ? "o(O)" : phase === 5 ? "-(-)" : "o(o)";
  const mouth = mood === "worried" ? "~" : mood === "busy" ? "." : "v";
  const bounce = phase === 2 || phase === 3;
  const body = [
    "  |###|",
    " _|___|_",
    ` / ${eyes} \\`,
    `|   ${mouth}  |:`,
    " \\_____/",
  ];
  return (bounce ? [...body, ""] : ["", ...body]).map((line) => line.padEnd(11));
}

export function renderBuddy(buddy, { mood = "idle", tick = 0, card = false, color = false } = {}) {
  validateBuddy(buddy);
  const art = sprite(mood, buddy.motion ? tick : 0);
  const lines = [
    `${buddy.name} | ${buddy.rarity} ${buddy.class}`,
    ...STATS.map((stat) => {
      const value = buddy.stats[stat];
      const filled = Math.round(value / 10);
      return `${stat.padEnd(9)} [${"#".repeat(filled)}${".".repeat(10 - filled)}] ${String(value).padStart(3)}`;
    }),
  ].map((line, index) => {
    const figure = color ? `\x1b[94m${art[index]}\x1b[39m` : art[index];
    return figure + " " + line;
  });
  lines.push(` ${PERSONALITIES[buddy.personality][mood]}`);
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

async function main() {
  const [command = "show", ...args] = process.argv.slice(2);
  if (command === "help" || command === "--help") {
    process.stdout.write("Buddy: show | status | pet | reroll | motion on|off\n");
    return;
  }
  if (!["show", "status", "pet", "reroll", "motion"].includes(command)
    || (command === "motion" ? args.length !== 1 || !["on", "off"].includes(args[0]) : args.length > 0)) {
    throw new Error("Usage: node buddy.mjs [show|status|pet|reroll|motion on|motion off]");
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
  let buddy = loadBuddy();
  if (command === "reroll") {
    buddy = generateBuddy();
    saveBuddy(buddy);
  }
  if (command === "motion") {
    buddy.motion = args[0] === "on";
    saveBuddy(buddy);
  }
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
