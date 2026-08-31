// llm-swap - OpenCode plugin, v2 only (needs the v2 plugin API's `config`
// hook; no fallback for older opencode). The hook runs at startup and may
// mutate config in place, so this discovers live models from the server and
// injects provider["llm-swap"], mirroring the pi extension. Registered in
// global opencode.json's "plugin" array by install.mjs.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const catalog = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "models.json"), "utf8"),
);

export default async () => ({
  config: async (config) => {
    let ids;
    try {
      const res = await fetch(`${catalog.baseUrl}/models`, { signal: AbortSignal.timeout(3000) });
      ids = (await res.json()).data
        .map((m) => m.id)
        .filter((id) => id !== "qwen3-embed"); // embedding-only, can't chat
    } catch {
      return; // off the home LAN: register nothing instead of a dead provider
    }
    config.provider = {
      ...config.provider,
      "llm-swap": {
        npm: "@ai-sdk/openai-compatible",
        name: "llm-swap",
        options: { baseURL: catalog.baseUrl },
        models: Object.fromEntries(
          ids.map((id) => [
            id,
            {
              name: id,
              limit: {
                context: catalog.models[id]?.context ?? catalog.defaultContext,
                output: catalog.maxTokens,
              },
            },
          ]),
        ),
      },
    };
  },
});
