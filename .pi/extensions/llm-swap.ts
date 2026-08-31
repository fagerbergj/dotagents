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

// Same llama-swap two ways in: Traefik's public route checks a bearer token,
// the tailnet host is reachable only from the trusted network and checks nothing.
const PUBLIC = { baseUrl: "https://api.jasonfagerberg.duckdns.org/openai/v1", apiKey: "$LLM_API_KEY" };
// llm-swap doesn't authenticate, but pi hides providers with no apiKey.
const PRIVATE = { baseUrl: "http://jason-server:11436/v1", apiKey: "noauth" };

async function listModels(baseUrl: string, token: string) {
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${token}` },
    // Runs at pi startup, so a host that is down must not stall the launch.
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`GET ${baseUrl}/models -> ${response.status}`);
  return ((await response.json()) as { data: Array<{ id: string }> }).data;
}

export default async function (pi: ExtensionAPI) {
  const key = process.env.LLM_API_KEY;
  let endpoint = key ? PUBLIC : PRIVATE;
  let token = key || "noauth";

  let models: Array<{ id: string }>;
  try {
    models = await listModels(endpoint.baseUrl, token);
  } catch (err) {
    if (endpoint === PRIVATE) throw err;
    // A stale key costs nothing on the tailnet, and off it this retry fails loudly anyway.
    [endpoint, token] = [PRIVATE, "noauth"];
    models = await listModels(endpoint.baseUrl, token);
  }

  pi.registerProvider("llm-swap", {
    ...endpoint,
    api: "openai-completions",
    models: models
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
