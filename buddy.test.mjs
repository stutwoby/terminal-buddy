import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  ROOT, STATS, PERSONALITIES, generateBuddy, validateBuddy, loadBuddy, saveBuddy,
  readMood, setMood, sprite, renderBuddy, parseStatusInput, isBuddyWorkspace,
  identitySeed, userSeed, TRAITS, interact, COLORS, buddyColor, saying,
} from "./buddy.mjs";

const run = promisify(execFile);
function directory(t) {
  const path = mkdtempSync(join(tmpdir(), "cli-buddy-test-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

test("user hashes deterministically derive character, appearance, and stats", () => {
  const seed = identitySeed("test-user");
  assert.match(seed, /^[a-f0-9]{64}$/);
  assert.notEqual(seed, identitySeed("other-user"));
  assert.equal(userSeed(), userSeed());
  assert.deepEqual(generateBuddy(), generateBuddy(userSeed()));
  assert.deepEqual(generateBuddy(seed), generateBuddy(seed));
  assert.notDeepEqual(generateBuddy(seed), generateBuddy(identitySeed("other-user")));
  assert.throws(() => generateBuddy("not-a-hash"), /seed/);
  assert.throws(() => identitySeed(""), /identity/);
});

test("a known identity keeps its exact generated character across releases", () => {
  const buddy = generateBuddy(identitySeed("fixture-user"));
  assert.equal(buddy.name, "Pipkin");
  assert.equal(buddy.rarity, "RARE");
  assert.equal(buddy.class, "Chaos Rogue");
  assert.equal(buddy.personality, "brave");
  assert.deepEqual(buddy.stats, { DEBUGGING: 28, PATIENCE: 87, CHAOS: 73, WISDOM: 39, SNARK: 50 });
  assert.deepEqual(buddy.appearance, {
    hat: "crown", eyes: "round", nose: "none", mouth: "grin", accessory: "freckles",
  });
});

test("different user hashes cover all traits with valid bounded stats", () => {
  const names = new Set();
  const personalities = new Set();
  const traits = Object.fromEntries(Object.keys(TRAITS).map((part) => [part, new Set()]));
  for (let i = 0; i < 500; i++) {
    const buddy = validateBuddy(generateBuddy(identitySeed(`user-${i}`)));
    assert.deepEqual(Object.keys(buddy.stats), STATS);
    names.add(buddy.name);
    personalities.add(buddy.personality);
    for (const part of Object.keys(TRAITS)) traits[part].add(buddy.appearance[part]);
  }
  assert.ok(names.size > 1);
  assert.equal(personalities.size, Object.keys(PERSONALITIES).length);
  for (const [part, values] of Object.entries(TRAITS)) assert.equal(traits[part].size, values.length);
});

test("hatching persists the same character and supports motion preferences", (t) => {
  const dir = directory(t);
  const buddy = loadBuddy(dir);
  assert.deepEqual(loadBuddy(dir), buddy);
  buddy.motion = false;
  saveBuddy(buddy, dir);
  assert.deepEqual(loadBuddy(dir), buddy);
  assert.equal(readFileSync(join(dir, "character.json"), "utf8").endsWith("\n"), true);
});

test("parallel first starts agree on one complete save", async (t) => {
  const dir = directory(t);
  const source = `import {loadBuddy} from ${JSON.stringify(new URL("./buddy.mjs", import.meta.url).href)};
    process.stdout.write(JSON.stringify(loadBuddy(process.argv[1])));`;
  const results = await Promise.all(Array.from({ length: 8 }, () =>
    run(process.execPath, ["--input-type=module", "-e", source, dir])));
  const buddy = loadBuddy(dir);
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), buddy);
});

test("invalid saves fail visibly without replacement", (t) => {
  const dir = directory(t);
  writeFileSync(join(dir, "character.json"), "{broken");
  assert.throws(() => loadBuddy(dir), SyntaxError);
  assert.equal(readFileSync(join(dir, "character.json"), "utf8"), "{broken");
});

test("legacy saves migrate with original character and a restorable backup", (t) => {
  const dir = directory(t);
  const { seed, cookies, appearance, ...legacy } = generateBuddy(identitySeed("legacy"));
  legacy.version = 1;
  legacy.name = "Bopbit";
  writeFileSync(join(dir, "character.json"), JSON.stringify(legacy));
  const upgraded = loadBuddy(dir);
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.seed, null);
  assert.equal(upgraded.name, "Bopbit");
  assert.deepEqual(upgraded.stats, legacy.stats);
  assert.equal(upgraded.appearance.hat, "top");
  assert.equal(upgraded.appearance.accessory, "monocle");
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "character.json.v1-backup"), "utf8")), legacy);
  assert.deepEqual(loadBuddy(dir), upgraded);
});

test("validation rejects malformed fields, injected control codes, and invalid stats", () => {
  const buddy = generateBuddy();
  for (const changed of [
    { name: "\x1b[2J" }, { name: 42 }, { personality: "__proto__" },
    { rarity: "mythic" }, { motion: "yes" }, { stats: {} }, { version: 99 },
    { stats: { ...buddy.stats, CHAOS: 101 } },
    { stats: { ...buddy.stats, CHAOS: 0 } },
    { stats: { ...buddy.stats, CHAOS: 2.5 } },
  ]) assert.throws(() => validateBuddy({ ...buddy, ...changed }), /Invalid Buddy save/);
  for (const changed of [
    { appearance: {} }, { seed: "private username" }, { cookies: -1 }, { cookies: 0.5 },
    { cookies: Number.MAX_SAFE_INTEGER + 1 },
    { appearance: { ...buddy.appearance, hat: "__proto__" } },
  ]) assert.throws(() => validateBuddy({ ...buddy, ...changed }), /Invalid Buddy appearance/);
});

test("moods are isolated per session, expire, and tolerate absent activity", (t) => {
  const dir = directory(t);
  assert.equal(readMood(undefined, dir, 1000), "idle");
  assert.equal(readMood("new", dir, 1000), "idle");
  setMood("a", "busy", dir, 1000);
  setMood("b", "worried", dir, 1000);
  assert.equal(readMood("a", dir, 9000), "busy");
  assert.equal(readMood("b", dir, 8999), "worried");
  assert.equal(readMood("b", dir, 9000), "idle");
  assert.equal(readMood("a", dir, 121000), "idle");
  assert.throws(() => setMood("a", "broken", dir), /Unknown Buddy mood/);
});

test("session IDs are hashed and cannot escape the activity directory", (t) => {
  const dir = directory(t);
  setMood("../../outside", "pet", dir, 1000);
  assert.equal(readMood("../../outside", dir, 1001), "pet");
  assert.throws(() => setMood("", "pet", dir), /session ID/);
});

test("all sprites have a fixed footprint, blink, bounce, and express reactions", () => {
  for (const mood of ["idle", "busy", "happy", "worried", "pet", "reward"]) {
    for (let tick = 0; tick < 8; tick++) {
      const lines = sprite(mood, tick);
      assert.equal(lines.length, 6);
      assert.ok(lines.every((line) => line.length === 16));
      assert.ok(lines.every((line) => /^[\x20-\x7e]*$/.test(line)));
      const hat = lines.findIndex((line) => line.includes("|###|"));
      assert.ok(hat >= 0);
      assert.ok(lines[hat + 1].includes("_|___|_"));
      assert.match(lines[hat + 2], /\([oO^-]\)/);
      assert.ok(lines[hat + 3].includes("|:"));
    }
  }
  assert.notDeepEqual(sprite("idle", 0), sprite("idle", 2));
  assert.notDeepEqual(sprite("idle", 0), sprite("idle", 5));
  assert.notDeepEqual(sprite("idle", 0), sprite("worried", 0));
});

test("every trait combination fits the same six by sixteen ASCII canvas", () => {
  for (const hat of TRAITS.hat)
    for (const eyes of TRAITS.eyes)
      for (const nose of TRAITS.nose)
        for (const mouth of TRAITS.mouth)
          for (const accessory of TRAITS.accessory)
            for (const mood of ["idle", "busy", "happy", "worried", "pet", "reward"])
              for (const tick of [0, 2, 5]) {
                const lines = sprite(mood, tick, { hat, eyes, nose, mouth, accessory });
                assert.equal(lines.length, 6);
                assert.ok(lines.every((line) => line.length === 16 && /^[\x20-\x7e]*$/.test(line)));
              }
});

test("each visual trait changes the visible idle sprite", () => {
  const base = { hat: "top", eyes: "round", nose: "dot", mouth: "smile", accessory: "none" };
  for (const [part, values] of Object.entries(TRAITS)) {
    const frames = values.map((value) => sprite("idle", 0, { ...base, [part]: value }).join("\n"));
    assert.equal(new Set(frames).size, values.length, part);
  }
});

test("cookies persist without changing seeded traits or stats; reseed is repeatable", (t) => {
  const dir = directory(t);
  const before = loadBuddy(dir);
  const { buddy, mood } = interact("reward", dir, "cookie-session");
  assert.equal(mood, "reward");
  assert.deepEqual(buddy, { ...before, cookies: 1 });
  assert.equal(readMood("cookie-session", dir), "reward");
  assert.match(renderBuddy(buddy, { mood }), /Cookies: 1/);
  assert.ok(renderBuddy(buddy, { mood }).includes(saying(buddy, "reward")));
  assert.match(renderBuddy(buddy, { mood }), /\(\*\)/);
  assert.equal(interact("reward", dir).buddy.cookies, 2);
  interact("motion-off", dir);
  const reseeded = interact("reseed", dir).buddy;
  assert.deepEqual(reseeded.stats, generateBuddy().stats);
  assert.equal(reseeded.cookies, 2);
  assert.equal(reseeded.motion, false);
  assert.deepEqual(interact("reseed", dir).buddy, reseeded);
  assert.deepEqual(interact("reroll", dir).buddy, reseeded);
  assert.throws(() => interact("bad", dir), /Usage/);
});

test("conflicting interactions report busy instead of losing an acknowledged cookie", (t) => {
  const dir = directory(t);
  loadBuddy(dir);
  mkdirSync(join(dir, "interaction.lock"));
  assert.throws(() => interact("reward", dir), /Buddy is busy/);
  assert.equal(loadBuddy(dir).cookies, 0);
  rmdirSync(join(dir, "interaction.lock"));
  assert.equal(interact("reward", dir).buddy.cookies, 1);
});

test("failed interactions release the lock and never overflow cookie counts", (t) => {
  const dir = directory(t);
  const buddy = loadBuddy(dir);
  buddy.cookies = Number.MAX_SAFE_INTEGER;
  saveBuddy(buddy, dir);
  assert.throws(() => interact("reward", dir), /cookie jar is full/);
  assert.doesNotThrow(() => interact("motion-off", dir));
  assert.equal(loadBuddy(dir).cookies, Number.MAX_SAFE_INTEGER);
});

test("footer contains every stat and personality with bounded ASCII-only lines", () => {
  const buddy = generateBuddy();
  const footer = renderBuddy(buddy);
  const lines = footer.split("\n");
  assert.equal(lines.length, 7);
  assert.ok(lines.every((line) => line.length < 70 && /^[\x20-\x7e]*$/.test(line)));
  for (const stat of STATS) assert.ok(footer.includes(stat));
  assert.ok(footer.includes(buddy.name));
  assert.ok(footer.includes(saying(buddy)));
  const card = renderBuddy(buddy, { card: true }).split("\n");
  assert.ok(card.every((line) => line.length === card[0].length));
});

test("reduced motion freezes frames across time", () => {
  const buddy = { ...generateBuddy(), motion: false };
  assert.equal(renderBuddy(buddy, { tick: 0 }), renderBuddy(buddy, { tick: 5 }));
});

test("seeded styling colors only the sprite and preserves card alignment", () => {
  const buddy = generateBuddy();
  for (const card of [false, true]) {
    const plain = renderBuddy(buddy, { card });
    const blue = renderBuddy(buddy, { card, color: true });
    assert.ok(blue.includes(`\x1b[${COLORS[buddyColor(buddy)]}m`));
    assert.equal(blue.replace(/\x1b\[[0-9;]*m/g, ""), plain);
    assert.match(blue, /\x1b\[39m .*DEBUGGING/);
  }
});

test("color is deterministic, varies by seed, and does not change existing generated traits", () => {
  const colors = new Set();
  for (let i = 0; i < 100; i++) {
    const buddy = generateBuddy(identitySeed(`color-user-${i}`));
    const before = structuredClone(buddy);
    const color = buddyColor(buddy);
    assert.equal(buddyColor(generateBuddy(buddy.seed)), color);
    assert.ok(Object.hasOwn(COLORS, color));
    assert.deepEqual(buddy, before);
    colors.add(color);
  }
  assert.equal(colors.size, Object.keys(COLORS).length);
  assert.equal(buddyColor({ seed: null }), "blue");
});

test("each personality has distinct dialogue for every mood including rewards", () => {
  const all = [];
  for (const [personality, moods] of Object.entries(PERSONALITIES)) {
    assert.deepEqual(Object.keys(moods).sort(), ["busy", "happy", "idle", "pet", "reward", "worried"]);
    const buddy = { ...generateBuddy(identitySeed("dialogue-user")), personality };
    for (const [mood, lines] of Object.entries(moods)) {
      assert.ok(lines.length >= 3);
      const rotated = new Set([0, 30, 60].map((tick) => saying(buddy, mood, tick)));
      assert.equal(rotated.size, lines.length);
      assert.ok(lines.every((line) => /^[\x20-\x7e]+$/.test(line) && line.length <= 45));
      assert.equal(saying(buddy, mood, 0), saying(buddy, mood, 29));
      all.push(...lines);
    }
  }
  assert.equal(new Set(all).size, all.length);
});

test("dialogue never grants cookies and reduced motion freezes dialogue too", (t) => {
  const dir = directory(t);
  const buddy = loadBuddy(dir);
  assert.equal(buddy.cookies, 0);
  for (let tick = 0; tick < 120; tick++) renderBuddy(buddy, { tick });
  assert.equal(interact("show", dir).buddy.cookies, 0);
  assert.equal(interact("pet", dir).buddy.cookies, 0);
  buddy.motion = false;
  assert.equal(renderBuddy(buddy, { tick: 0 }), renderBuddy(buddy, { tick: 60 }));
});

test("status input accepts host fields and rejects invalid boundaries", () => {
  assert.deepEqual(parseStatusInput(""), {});
  assert.deepEqual(parseStatusInput('{"session_id":null,"model":{}}'), { session_id: null, model: {} });
  for (const text of ["null", "[]", "42", "{", '{"session_id":12}', '{"cwd":42}', '{"cwd":"relative"}']) {
    assert.throws(() => parseStatusInput(text));
  }
});

test("the user-level status command only renders within this workspace", () => {
  assert.equal(isBuddyWorkspace(ROOT), true);
  assert.equal(isBuddyWorkspace(join(ROOT, "src")), true);
  assert.equal(isBuddyWorkspace(ROOT + "-other"), false);
  assert.equal(isBuddyWorkspace(dirname(ROOT)), false);
  assert.equal(execFileSync(process.execPath, ["buddy.mjs", "status"], {
    cwd: ROOT, input: JSON.stringify({ cwd: tmpdir() }), encoding: "utf8",
  }), "");
});

test("CLI status emits plain ASCII and malformed input fails on stderr", () => {
  const output = execFileSync(process.execPath, ["buddy.mjs", "status"], {
    cwd: ROOT, input: '{"session_id":"test-cli"}', encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  assert.equal(output.trimEnd().split("\n").length, 7);
  assert.doesNotMatch(output, /\x1b/);
  assert.throws(() => execFileSync(process.execPath, ["buddy.mjs", "status"], {
    cwd: ROOT, input: "[]", encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }), (error) => error.status === 1 && /Buddy: Expected/.test(error.stderr));
});

test("slash command dispatches reward and motion arguments directly without a model turn", () => {
  const source = `
    import {registerHooks} from "node:module";
    import assert from "node:assert/strict";
    const sdk = 'export async function joinSession(options) { globalThis.options = options; return {'
      + 'on() {}, async log(message, options) { globalThis.lastLog = {message, options}; } }; }';
    const buddy = 'export function interact(action, directory, sessionId) {'
      + 'globalThis.lastAction = {action, sessionId}; return {buddy: action, mood: action}; }'
      + 'export function renderBuddy(buddy) { return buddy; }'
      + 'export function readMood() { return "idle"; } export function setMood() {}';
    registerHooks({resolve(specifier, context, next) {
      if (specifier === "@github/copilot-sdk/extension")
        return {url: "data:text/javascript," + encodeURIComponent(sdk), shortCircuit: true};
      if (specifier === "../../../buddy.mjs")
        return {url: "data:text/javascript," + encodeURIComponent(buddy), shortCircuit: true};
      return next(specifier, context);
    }});
    await import(${JSON.stringify(new URL("./.github/extensions/buddy/extension.mjs", import.meta.url).href)});
    const command = globalThis.options.commands[0];
    for (const [args, expected] of [["reward", "reward"], ["pet", "pet"], ["", "show"],
      ["motion off", "motion-off"], ["motion on", "motion-on"], ["reseed", "reseed"]]) {
      await command.handler({args, sessionId: "command-session"});
      assert.deepEqual(globalThis.lastAction, {action: expected, sessionId: "command-session"});
      assert.equal(globalThis.lastLog.message, "\`\`\`text\\n" + expected + "\\n\`\`\`");
    }
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
  });
});

test("extension hooks drive moods, preserve pet reactions, and settle idle turns", () => {
  const source = `
    import {registerHooks} from "node:module";
    import assert from "node:assert/strict";
    import {unlinkSync} from "node:fs";
    import {createHash} from "node:crypto";
    import {join} from "node:path";
    import {ROOT, loadBuddy, renderBuddy, readMood, setMood} from ${JSON.stringify(new URL("./buddy.mjs", import.meta.url).href)};
    const sessionId = "test-hooks-" + process.pid;
    const sdk = 'export async function joinSession(options) { globalThis.options = options; return {'
      + 'sessionId: ' + JSON.stringify(sessionId) + ','
      + 'on(event, callback) { globalThis.onIdle = callback; },'
      + 'async log(message, options) { (globalThis.logs ??= []).push({message, options}); } }; }';
    registerHooks({resolve(specifier, context, next) {
      if (specifier === "@github/copilot-sdk/extension")
        return {url: "data:text/javascript," + encodeURIComponent(sdk), shortCircuit: true};
      return next(specifier, context);
    }});
    await import(${JSON.stringify(new URL("./.github/extensions/buddy/extension.mjs", import.meta.url).href)});
    const invocation = {sessionId};
    const hooks = globalThis.options.hooks;
    try {
      await hooks.onUserPromptSubmitted({}, invocation);
      assert.equal(readMood(sessionId), "busy");
      await globalThis.onIdle();
      assert.equal(readMood(sessionId), "happy");
      await hooks.onPreToolUse({}, invocation);
      assert.equal(readMood(sessionId), "busy");
      const tool = globalThis.options.tools[0];
      const rawCard = renderBuddy(loadBuddy(), {card: true});
      const fencedCard = "\`\`\`text\\n" + rawCard + "\\n\`\`\`";
      assert.equal(await tool.handler({action: "show"}, invocation), fencedCard);
      await tool.handler({action: "pet"}, invocation);
      await hooks.onPostToolUse({toolName: "terminal_buddy"}, invocation);
      assert.equal(readMood(sessionId), "pet");
      await hooks.onPostToolUse({toolName: "bash"}, invocation);
      assert.equal(readMood(sessionId), "happy");
      await hooks.onPostToolUseFailure({}, invocation);
      assert.equal(readMood(sessionId), "worried");
      await globalThis.onIdle();
      assert.equal(readMood(sessionId), "worried");
      await hooks.onErrorOccurred({}, invocation);
      assert.equal(readMood(sessionId), "worried");
      await assert.rejects(tool.handler({action: "invalid"}, invocation), /Usage/);
      const command = globalThis.options.commands[0];
      assert.equal(command.name, "buddy");
      await command.handler({args: "show", sessionId});
      assert.equal(globalThis.logs.at(-1).message, fencedCard);
      await command.handler({args: "pet", sessionId});
      assert.equal(readMood(sessionId), "pet");
      await command.handler({args: "not-a-command", sessionId});
      assert.equal(globalThis.logs.at(-1).options.level, "error");
      assert.match(globalThis.logs.at(-1).message, /Usage: \\/buddy/);
    } finally {
      unlinkSync(join(ROOT, ".buddy", "sessions",
        createHash("sha256").update(sessionId).digest("hex") + ".json"));
    }
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
  });
});
