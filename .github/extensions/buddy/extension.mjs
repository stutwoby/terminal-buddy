import { joinSession } from "@github/copilot-sdk/extension";
import { interact, readMood, renderBuddy, setMood } from "../../../buddy.mjs";

function characterCard(buddy, mood) {
  return "```text\n" + renderBuddy(buddy, { mood, card: true }) + "\n```";
}

function moodHook(mood) {
  return async (_input, invocation) => {
    setMood(invocation.sessionId, mood);
  };
}

const session = await joinSession({
  commands: [{
    name: "buddy",
    description: "Your RPG buddy: show, pet, reward (cookie), reseed, motion on/off",
    handler: async ({ args, sessionId }) => {
      const action = (args.trim() || "show").replace(/^motion\s+(on|off)$/, "motion-$1");
      try {
        const { buddy, mood } = interact(action, undefined, sessionId);
        await session.log(characterCard(buddy, mood));
      } catch (error) {
        await session.log(`Buddy: ${error.message}`, { level: "error" });
      }
    },
  }],
  tools: [{
    name: "terminal_buddy",
    description: "Show, pet, or reward the user's saved ASCII RPG buddy with a cookie, reseed it, or toggle motion. No external services.",
    parameters: {
      type: "object",
      properties: { action: { type: "string", enum: ["show", "pet", "reward", "reseed", "motion-on", "motion-off"] } },
      required: ["action"],
      additionalProperties: false,
    },
    handler: async ({ action }, invocation) => {
      const { buddy, mood } = interact(action, undefined, invocation.sessionId);
      return characterCard(buddy, mood);
    },
  }],
  hooks: {
    onUserPromptSubmitted: moodHook("busy"),
    onPreToolUse: moodHook("busy"),
    onPostToolUse: async (input, invocation) => {
      if (input.toolName !== "terminal_buddy") setMood(invocation.sessionId, "happy");
    },
    onPostToolUseFailure: moodHook("worried"),
    onErrorOccurred: moodHook("worried"),
  },
});

session.on("session.idle", async () => {
  try {
    if (readMood(session.sessionId) === "busy") setMood(session.sessionId, "happy");
  } catch (error) {
    await session.log(`Buddy: ${error.message}`, { level: "error" });
  }
});
