import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
// Model metadata lives in models.json, shared with install-opencode.mjs so
// both harnesses read one catalog.
import catalog from "./models.json";

type Meta = { context?: number; vision?: boolean; reasoning?: boolean };
const MODELS = catalog.models as Record<string, Meta>;

export default async function (pi: ExtensionAPI) {
  // Off the home LAN the server is unreachable: register nothing instead of
  // failing pi startup.
  let payload: { data: Array<{ id: string }> };
  try {
    const response = await fetch(`${catalog.baseUrl}/models`, { signal: AbortSignal.timeout(3000) });
    payload = (await response.json()) as { data: Array<{ id: string }> };
  } catch {
    return;
  }

  pi.registerProvider("llm-swap", {
    baseUrl: catalog.baseUrl,
    api: "openai-completions",
    // llm-swap doesn't authenticate, but pi hides providers with no apiKey.
    apiKey: "noauth",
    models: payload.data
      .filter((m) => m.id !== "qwen3-embed") // embedding-only, can't chat
      .map((m) => ({
        id: m.id,
        name: m.id,
        reasoning: MODELS[m.id]?.reasoning ?? false,
        input: MODELS[m.id]?.vision ? ["text", "image"] : ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: MODELS[m.id]?.context ?? catalog.defaultContext,
        maxTokens: catalog.maxTokens,
      })),
  });
}
