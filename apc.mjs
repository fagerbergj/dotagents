#!/usr/bin/env node
// apc - agent plugin compiler. The Agent Plugins package (plugin.json +
// skills/ + mcp.json) is the source of truth; this emits each harness's
// native manifest in place so one repo installs everywhere. Per-harness
// overrides live in plugin.json "extensions", keyed by reverse-domain
// namespace per APS 1.1.0 section 8.
//
//   node apc.mjs          build: write generated files, print report
//   node apc.mjs --check  CI: exit 1 if any generated file drifts
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const APS = "1.1.0";
const CHECK = process.argv.includes("--check");

const fail = (msg) => {
  console.error(`apc: error: ${msg}`);
  process.exit(1);
};

// ---------- load + validate the source package ----------

function readJson(rel) {
  let text;
  try {
    text = readFileSync(join(ROOT, rel), "utf8");
  } catch (e) {
    fail(`${rel}: ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    fail(`${rel}: invalid JSON: ${e.message}`);
  }
}

const MANIFEST_FIELDS = new Set([
  "$schema", "name", "version", "description", "author",
  "homepage", "repository", "license", "keywords", "extensions",
]);

const src = readJson("plugin.json");
if (src.$schema !== `https://agent-plugins.org/schemas/${APS}/plugin.schema.json`)
  fail(`plugin.json: $schema must target APS ${APS}`);
if (!/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(src.name ?? "") || src.name.length > 64)
  fail(`plugin.json: invalid name ${JSON.stringify(src.name)}`);
for (const key of Object.keys(src))
  if (!MANIFEST_FIELDS.has(key)) fail(`plugin.json: unknown field "${key}"`);
const ext = src.extensions ?? {};

// Frontmatter subset parser: top-level scalars and |/> block scalars between
// --- fences. Indented lines under a plain key (nested maps like metadata:)
// are skipped. Anything needed but unparseable becomes a hard error upstream.
function frontmatter(text, file) {
  const lines = text.split("\n");
  if (lines[0] !== "---") fail(`${file}: no frontmatter`);
  const fm = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === "---") return fm;
    if (/^\s/.test(line) || line === "") continue; // nested/blank: not ours
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (!m) fail(`${file}: unparseable frontmatter line: ${line}`);
    let [, key, value] = m;
    if (value === "|" || value === ">" || value === "") {
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1] === "")) {
        block.push(lines[++i].trim());
      }
      fm[key] = block.join(value === "|" ? "\n" : " ").trim();
    } else {
      fm[key] = value.replace(/^(["'])(.*)\1$/, "$2").trim();
    }
  }
  fail(`${file}: unterminated frontmatter`);
}

const skills = [];
for (const entry of readdirSync(join(ROOT, "skills"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const rel = `skills/${entry.name}/SKILL.md`;
  if (!existsSync(join(ROOT, rel))) fail(`skills/${entry.name}: missing SKILL.md`);
  const fm = frontmatter(readFileSync(join(ROOT, rel), "utf8"), rel);
  if (fm.name && fm.name !== entry.name)
    fail(`${rel}: frontmatter name "${fm.name}" != directory name`);
  if (!fm.description) fail(`${rel}: frontmatter needs a non-empty description`);
  skills.push(entry.name);
}
if (!skills.length) fail("skills/: no skills found");

// mcp.json is gitignored (it carries credentials), so a fresh clone - CI
// included - legitimately has none: skip MCP emission rather than fail.
const mcp = existsSync(join(ROOT, "mcp.json")) ? readJson("mcp.json") : null;
if (mcp) {
  if (mcp.$schema !== `https://agent-plugins.org/schemas/${APS}/mcp.schema.json`)
    fail(`mcp.json: $schema version must match plugin.json (APS ${APS})`);
  for (const [name, server] of Object.entries(mcp.mcpServers ?? {})) {
    const ok =
      (server.type === "stdio" && typeof server.command === "string") ||
      ((server.type === "streamable-http" || server.type === "sse") && typeof server.url === "string");
    if (!ok) fail(`mcp.json: server "${name}" is not a valid ${server.type ?? "?"} entry`);
  }
}

// ---------- emitters: source -> harness-native files ----------

const out = {}; // rel path -> generated content
const emit = (rel, obj) => {
  out[rel] = JSON.stringify(obj, null, 2) + "\n";
};
const report = [];

// Claude Code: .claude-plugin/{plugin,marketplace}.json + .mcp.json.
{
  const cc = ext["com.anthropic.claude-code"] ?? {};
  emit(".claude-plugin/plugin.json", {
    name: src.name,
    version: src.version,
    description: cc.description ?? src.description,
    author: src.author,
    homepage: src.homepage,
    repository: src.repository,
    keywords: cc.keywords ?? src.keywords,
    metadata: { generatedBy: "apc.mjs" },
  });
  // Marketplace: one plugin per group in cc.plugins, each rooted at "./" with
  // an explicit skills subset (marketplace-root plugins replace default skill
  // discovery, so subsets work without moving files). Groups must partition
  // skills/ exactly - a skill in no group or two groups is an error.
  // ponytail: every group also auto-loads root .mcp.json, so installing more
  // than one duplicates the langfuse server; revisit if that ever matters.
  const groups = cc.plugins ?? { [src.name]: { description: cc.description ?? src.description, skills } };
  const seen = new Map();
  for (const [group, g] of Object.entries(groups))
    for (const s of g.skills ?? []) {
      if (!skills.includes(s)) fail(`plugin.json: group "${group}" names unknown skill "${s}"`);
      if (seen.has(s)) fail(`plugin.json: skill "${s}" is in both "${seen.get(s)}" and "${group}"`);
      seen.set(s, group);
    }
  for (const s of skills)
    if (!seen.has(s) && cc.plugins) fail(`plugin.json: skill "${s}" is in no group`);
  const mp = cc.marketplace ?? {};
  emit(".claude-plugin/marketplace.json", {
    $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
    name: src.name,
    description: mp.description ?? src.description,
    owner: { name: src.author?.name, url: src.author?.url },
    plugins: Object.entries(groups).map(([group, g]) => ({
      name: group,
      version: src.version,
      description: g.description,
      source: "./",
      category: mp.category,
      skills: g.skills.map((s) => `./skills/${s}`),
    })),
  });
  // Translate spec transports to Claude Code's: streamable-http -> http,
  // ${PLUGIN_ROOT}/${PLUGIN_DATA} -> ${CLAUDE_PLUGIN_ROOT}/${CLAUDE_PLUGIN_DATA}.
  // Like its source, generated .mcp.json is gitignored - credentials inside.
  if (mcp) {
    const servers = {};
    for (const [name, s] of Object.entries(mcp.mcpServers ?? {})) {
      const mapped = JSON.parse(
        JSON.stringify(s).replaceAll("${PLUGIN_", "${CLAUDE_PLUGIN_"),
      );
      if (mapped.type === "streamable-http") mapped.type = "http";
      delete mapped.$schema;
      servers[name] = mapped;
    }
    emit(".mcp.json", { mcpServers: servers });
  }
  report.push(`claude-code  ${skills.length} skills, ${mcp ? Object.keys(mcp.mcpServers).length : 0} mcp server(s) -> .claude-plugin/${mcp ? " + .mcp.json" : ""}`);
}

// pi: package.json with the "pi" key; skills plus any declared extensions.
{
  const pi = ext["dev.pi.coding-agent"] ?? {};
  emit("package.json", {
    "//": "generated by apc.mjs from plugin.json - edit those, then run: node apc.mjs",
    name: src.name,
    version: src.version,
    description: pi.description ?? src.description,
    keywords: [...(src.keywords ?? []), "pi-package"],
    repository: src.repository,
    author: src.author,
    pi: {
      skills: ["./skills"],
      ...(pi.extensions ? { extensions: pi.extensions } : {}),
    },
  });
  for (const e of pi.extensions ?? [])
    if (!existsSync(join(ROOT, e))) fail(`pi extensions: ${e} not found`);
  report.push(`pi           ${skills.length} skills, ${(pi.extensions ?? []).length} extension(s) -> package.json (mcp: pi reads mcp.json natively)`);
}

// opencode: nothing to emit - it discovers ~/.agents/skills natively; the
// frontmatter validation above is the export check (it requires description).
report.push(`opencode     ${skills.length} skills -> native discovery of skills/, nothing emitted`);

// ---------- write or check ----------

let drift = 0;
for (const [rel, content] of Object.entries(out)) {
  const abs = join(ROOT, rel);
  const current = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  if (current === content) continue;
  if (CHECK) {
    console.error(`apc: drift: ${rel} ${current === null ? "(missing)" : "differs from generated content"}`);
    drift++;
  } else {
    // A stale symlink here (the old committed .mcp.json -> mcp.json) must be
    // replaced by a real file, not written through.
    if (existsSync(abs) && lstatSync(abs).isSymbolicLink()) rmSync(abs);
    writeFileSync(abs, content);
    console.log(`apc: wrote ${rel}`);
  }
}
if (CHECK && drift) fail(`${drift} generated file(s) out of date - run: node apc.mjs`);
console.log(CHECK ? "apc: check ok" : "apc: build ok");
for (const line of report) console.log(`  ${line}`);
