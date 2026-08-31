import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// llama-swap's /v1/models reports ids only, so windows and capabilities live here: the -c
// flags in home-server's llm-swap.yaml (jaison) and llm-swap-media.yaml (media).
const MODELS: Record<string, { ctx: number; vision?: boolean; reasoning?: boolean }> = {
  "qwen3.8-27b": { ctx: 262144, vision: true, reasoning: true }, // vLLM, so ctx is its MAXLEN env
  "qwen3.8-flash-next": { ctx: 131072, vision: true, reasoning: true },
  "muse-glimmer-30b": { ctx: 131072, vision: true, reasoning: true },
  "qwen3-omni-30b": { ctx: 32768, vision: true, reasoning: true },
  "qwen3.5-9b": { ctx: 65536 }, // the only one with thinking off in its chat template
};
const DEFAULT_CTX = 32768;

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
      .map((m) => {
        const known = MODELS[m.id];
        return {
          id: m.id,
          // A swapped-in model falls back to guesses. Say so in the picker rather than
          // silently serving a wrong window, which is how this table last went stale.
          name: known ? m.id : `${m.id} (unlisted: ctx ${DEFAULT_CTX}?)`,
          reasoning: known?.reasoning ?? false,
          input: known?.vision ? (["text", "image"] as const) : (["text"] as const),
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: known?.ctx ?? DEFAULT_CTX,
          maxTokens: 16384,
        };
      }),
  });
}
