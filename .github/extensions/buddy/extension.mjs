import { joinSession } from "@github/copilot-sdk/extension";
import { loadBuddy, readMood, renderBuddy, saveBuddy, setMood } from "../../../buddy.mjs";

function moodHook(mood) {
  return async (_input, invocation) => {
    setMood(invocation.sessionId, mood);
  };
}

const session = await joinSession({
  tools: [{
    name: "terminal_buddy",
    description: "Show or pet the user's saved ASCII RPG buddy, or turn its status-line motion on/off. No AI calls or external services.",
    parameters: {
      type: "object",
      properties: { action: { type: "string", enum: ["show", "pet", "motion-on", "motion-off"] } },
      required: ["action"],
      additionalProperties: false,
    },
    handler: async ({ action }, invocation) => {
      if (!["show", "pet", "motion-on", "motion-off"].includes(action)) {
        throw new Error("Unknown Buddy action.");
      }
      const buddy = loadBuddy();
      if (action.startsWith("motion-")) {
        buddy.motion = action === "motion-on";
        saveBuddy(buddy);
      }
      if (action === "pet") setMood(invocation.sessionId, "pet");
      return renderBuddy(buddy, { mood: action === "pet" ? "pet" : "idle", card: true });
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
