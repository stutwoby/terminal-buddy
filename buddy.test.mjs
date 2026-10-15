import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  ROOT, STATS, PERSONALITIES, generateBuddy, validateBuddy, loadBuddy, saveBuddy,
  readMood, setMood, sprite, renderBuddy, parseStatusInput, isBuddyWorkspace,
} from "./buddy.mjs";

const run = promisify(execFile);
function directory(t) {
  const path = mkdtempSync(join(tmpdir(), "cli-buddy-test-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

test("generated buddies have valid bounded stats, personality, and random names", () => {
  const names = new Set();
  const personalities = new Set();
  for (let i = 0; i < 500; i++) {
    const buddy = validateBuddy(generateBuddy());
    assert.deepEqual(Object.keys(buddy.stats), STATS);
    names.add(buddy.name);
    personalities.add(buddy.personality);
  }
  assert.ok(names.size > 1);
  assert.equal(personalities.size, Object.keys(PERSONALITIES).length);
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

test("validation rejects malformed fields, injected control codes, and invalid stats", () => {
  const buddy = generateBuddy();
  for (const changed of [
    { name: "\x1b[2J" }, { name: 42 }, { personality: "__proto__" },
    { rarity: "mythic" }, { motion: "yes" }, { stats: {} }, { version: 2 },
    { stats: { ...buddy.stats, CHAOS: 101 } },
    { stats: { ...buddy.stats, CHAOS: 0 } },
    { stats: { ...buddy.stats, CHAOS: 2.5 } },
  ]) assert.throws(() => validateBuddy({ ...buddy, ...changed }), /Invalid Buddy save/);
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
  for (const mood of ["idle", "busy", "happy", "worried", "pet"]) {
    for (let tick = 0; tick < 8; tick++) {
      const lines = sprite(mood, tick);
      assert.equal(lines.length, 6);
      assert.ok(lines.every((line) => line.length === 11));
      assert.ok(lines.every((line) => /^[\x20-\x7e]*$/.test(line)));
      const hat = lines.findIndex((line) => line.includes("|###|"));
      assert.ok(hat >= 0);
      assert.ok(lines[hat + 1].includes("_|___|_"));
      assert.match(lines[hat + 2], /[o^-]\([oO^-]\)/);
      assert.ok(lines[hat + 3].includes("|:"));
    }
  }
  assert.notDeepEqual(sprite("idle", 0), sprite("idle", 2));
  assert.notDeepEqual(sprite("idle", 0), sprite("idle", 5));
  assert.notDeepEqual(sprite("idle", 0), sprite("worried", 0));
});

test("footer contains every stat and personality with bounded ASCII-only lines", () => {
  const buddy = generateBuddy();
  const footer = renderBuddy(buddy);
  const lines = footer.split("\n");
  assert.equal(lines.length, 7);
  assert.ok(lines.every((line) => line.length < 70 && /^[\x20-\x7e]*$/.test(line)));
  for (const stat of STATS) assert.ok(footer.includes(stat));
  assert.ok(footer.includes(buddy.name));
  assert.ok(footer.includes(PERSONALITIES[buddy.personality].idle));
  const card = renderBuddy(buddy, { card: true }).split("\n");
  assert.ok(card.every((line) => line.length === card[0].length));
});

test("reduced motion freezes frames across time", () => {
  const buddy = { ...generateBuddy(), motion: false };
  assert.equal(renderBuddy(buddy, { tick: 0 }), renderBuddy(buddy, { tick: 5 }));
});

test("blue styling colors only the sprite and preserves card alignment", () => {
  const buddy = generateBuddy();
  for (const card of [false, true]) {
    const plain = renderBuddy(buddy, { card });
    const blue = renderBuddy(buddy, { card, color: true });
    assert.ok(blue.includes("\x1b[94m"));
    assert.equal(blue.replace(/\x1b\[[0-9;]*m/g, ""), plain);
    assert.match(blue, /\x1b\[39m .*DEBUGGING/);
  }
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

test("extension hooks drive moods, preserve pet reactions, and settle idle turns", () => {
  const source = `
    import {registerHooks} from "node:module";
    import assert from "node:assert/strict";
    import {unlinkSync} from "node:fs";
    import {createHash} from "node:crypto";
    import {join} from "node:path";
    import {ROOT, readMood, setMood} from ${JSON.stringify(new URL("./buddy.mjs", import.meta.url).href)};
    const sessionId = "test-hooks-" + process.pid;
    const sdk = 'export async function joinSession(options) { globalThis.options = options; return {'
      + 'sessionId: ' + JSON.stringify(sessionId) + ','
      + 'on(event, callback) { globalThis.onIdle = callback; },'
      + 'async log(message) { throw new Error(message); } }; }';
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
      assert.ok((await tool.handler({action: "show"}, invocation)).includes("DEBUGGING"));
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
      await assert.rejects(tool.handler({action: "invalid"}, invocation), /Unknown Buddy action/);
    } finally {
      unlinkSync(join(ROOT, ".buddy", "sessions",
        createHash("sha256").update(sessionId).digest("hex") + ".json"));
    }
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
  });
});
