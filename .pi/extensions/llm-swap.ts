import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// llama-swap's /v1/models reports ids only, so context sizes live here.
// Values from home-server/llm/llm-swap.yaml's -c flags; default is conservative.
const CTX: Record<string, number> = {
  "qwen3-coder-next": 262144,
  "qwen3.6-35b": 262144,
  "gpt-oss-120b": 131072,
  "qwen3.6-27b": 131072,
  "gemma4-26b-a4b": 131072,
  "gemma4-12b": 16384,
};
const VISION = new Set(["qwen3-vl-32b", "qwen3-omni-30b"]);

export default async function (pi: ExtensionAPI) {
  const response = await fetch("http://jason-server:11436/v1/models");
  const payload = (await response.json()) as { data: Array<{ id: string }> };

  pi.registerProvider("llm-swap", {
    baseUrl: "http://jason-server:11436/v1",
    api: "openai-completions",
    // llm-swap doesn't authenticate, but pi hides providers with no apiKey.
    apiKey: "noauth",
    models: payload.data
      .filter((m) => m.id !== "qwen3-embed") // embedding-only, can't chat
      .map((m) => ({
        id: m.id,
        name: m.id,
        reasoning: m.id === "gpt-oss-120b",
        input: VISION.has(m.id) ? ["text", "image"] : ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: CTX[m.id] ?? 32768,
        maxTokens: 16384,
      })),
  });
}
