#!/usr/bin/env python3
"""Rewrites the official A2A JSON Schema bundle into a self-contained, ajv-loadable
schema. Run once by hand when the upstream bundle changes; the output is committed.

Source: https://a2a-protocol.org/v1.0.1/spec/a2a.json (fetched 2026-08-27), which is
declared non-normative build output of specification/a2a.proto (the normative
source) per specification/json/README.md in https://github.com/a2aproject/A2A at
tag v1.0.1. The bundling script (scripts/proto_to_json_schema.sh) merges each
message's schema under its proto "title" but never rewrites the $ref values, which
still name sibling files ("lf.a2a.v1.SecurityRequirement.jsonschema.json") that do
not exist in the bundle. This script resolves that: each ref is mapped back to the
def it names and rewritten to "#/definitions/<PascalName>" (definitions are also
renamed, since ajv's JSON-Pointer resolution of a fragment containing bare spaces
is unspecified and the upstream keys are "Agent Card", "O Auth Flows", etc).
"""
import json
import re
import urllib.request

SOURCE = "https://a2a-protocol.org/v1.0.1/spec/a2a.json"

# The bundler names types from the proto package ("lf.a2a.v1.<Name>"); the title it
# assigns is a generator-inserted space-split of <Name> that a plain camel-case
# splitter cannot reproduce for well-known types or the *OAuthFlow family
# (verified against the actual `definitions` keys in the fetched bundle: e.g.
# "lf.a2a.v1.ClientCredentialsOAuthFlow..." titles as "Client CredentialsO Auth Flow").
OVERRIDE_TITLES = {
    "google.protobuf.Struct": "Struct",
    "google.protobuf.Timestamp": "Timestamp",
    "google.protobuf.Value": "Value",
    "AuthorizationCodeOAuthFlow": "Authorization CodeO Auth Flow",
    "ClientCredentialsOAuthFlow": "Client CredentialsO Auth Flow",
    "DeviceCodeOAuthFlow": "Device CodeO Auth Flow",
    "ImplicitOAuthFlow": "ImplicitO Auth Flow",
    "PasswordOAuthFlow": "PasswordO Auth Flow",
}


def title_from_ref(ref):
    m = re.match(r"^(?:lf\.a2a\.v1\.)?(.+)\.jsonschema\.json$", ref)
    name = m.group(1)
    if name in OVERRIDE_TITLES:
        return OVERRIDE_TITLES[name]
    spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name)
    spaced = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", spaced)
    return spaced


def pascal_key(title):
    return title.replace(" ", "")


# The generated bundle carries no "required" keyword anywhere (verified: the
# fetched bundle contains exactly zero JSON-Schema `required` arrays), because
# protoc-gen-jsonschema does not read the proto's `google.api.field_behavior`
# annotations. Those annotations are how a2a.proto marks a field mandatory
# (specification.md s5.7: "Fields marked with [(google.api.field_behavior) =
# REQUIRED] indicate that the field MUST be present... Implementations SHOULD
# validate these requirements and reject messages with missing required
# fields"). This restores them by hand from specification/a2a.proto (v1.0.1),
# for the message types an AgentCard can actually contain.
REQUIRED_FIELDS = {
    # a2a.proto lines 364-393
    "AgentCard": ["name", "description", "supportedInterfaces", "version", "capabilities", "defaultInputModes", "defaultOutputModes", "skills"],
    "AgentInterface": ["url", "protocolBinding", "protocolVersion"],  # lines 339,343,354
    "AgentProvider": ["url", "organization"],  # lines 404,407
    "AgentSkill": ["id", "name", "description", "tags"],  # lines 437-443
    "AgentCardSignature": ["protected", "signature"],  # lines 461,463
    "APIKeySecurityScheme": ["location", "name"],  # lines 523,525
    "HTTPAuthSecurityScheme": ["scheme"],  # line 535
    "OAuth2SecurityScheme": ["flows"],  # line 546
    "OpenIdConnectSecurityScheme": ["openIdConnectUrl"],  # line 557
    # OAuthFlows' oneof members each carry their own REQUIRED fields, missed in
    # the first pass - proven live: case A's brief is oauth2 client-credentials,
    # and {oauth2SecurityScheme: {flows: {clientCredentials: {}}}} validated
    # true with no tokenUrl/scopes required. ImplicitOAuthFlow and
    # PasswordOAuthFlow are deprecated oneof members with no REQUIRED
    # annotation at all (a2a.proto lines 608-634) - correctly absent here.
    "AuthorizationCodeOAuthFlow": ["authorizationUrl", "tokenUrl", "scopes"],  # lines 585,587,591
    "ClientCredentialsOAuthFlow": ["tokenUrl", "scopes"],  # lines 600,604
    "DeviceCodeOAuthFlow": ["deviceAuthorizationUrl", "tokenUrl", "scopes"],  # lines 638,640,644
}

# specification.md s5.7 also says "Arrays marked as required MUST contain at
# least one element" - required alone lets "skills": [] validate. Every
# REQUIRED_FIELDS entry above that is proto `repeated` (a JSON array) gets
# minItems: 1 too.
REQUIRED_ARRAY_FIELDS = {
    "AgentCard": ["supportedInterfaces", "defaultInputModes", "defaultOutputModes", "skills"],
    "AgentSkill": ["tags"],
}


# promptfoo's config loader runs the *entire* YAML config (prompts, providers,
# every test file it pulls in via file://) through
# @apidevtools/json-schema-ref-parser's $RefParser.dereference() before
# `validate config` or `eval` ever starts (src/main.js: `$RefParser.dereference
# (rawConfig)`). That walks the whole merged document as one tree and resolves
# every "$ref" it finds as a JSON Pointer from *that* root - not from the root
# of the standalone schema file the ref came from. A schema shipped as
# {$ref: "#/definitions/AgentCard", definitions: {...}} broke as soon as it
# was embedded inside the suite's config: "#/definitions/AgentCard" no longer
# pointed at this file's own "definitions" key, it pointed at the promptfoo
# config's (nonexistent) top-level one, and `validate config` failed with
# "Missing $ref pointer '#/definitions/AgentCard'. Token 'definitions' does
# not exist." This is why the schema below is fully inlined instead: every
# $ref is expanded in place (there are no cycles in the AgentCard closure -
# verified) so the shipped file has zero "$ref" keys left for either
# $RefParser or ajv to resolve.
def inline(node, defs, key_map, seen=()):
    if isinstance(node, dict):
        if "$ref" in node and isinstance(node["$ref"], str) and node["$ref"] not in ("#", ""):
            title = title_from_ref(node["$ref"])
            name = key_map[title]
            if name in seen:
                raise ValueError(f"cycle inlining {name}: {seen}")
            target = inline(defs[name], defs, key_map, seen + (name,))
            # A $ref sibling (e.g. a per-field "description" override) wins
            # over the target's own, matching normal JSON Schema $ref merge.
            merged = {**target, **{k: v for k, v in node.items() if k != "$ref"}}
            return merged
        # Every one of the 47 sub-schemas carries its own top-level "$schema"
        # (an artifact of each being a standalone protoc-gen-jsonschema output
        # before bundling); dropped as a non-root schema keyword ajv would
        # otherwise try to resolve as its own meta-schema reference.
        return {k: inline(v, defs, key_map, seen) for k, v in node.items() if k != "$schema"}
    if isinstance(node, list):
        return [inline(v, defs, key_map, seen) for v in node]
    return node


def main():
    with urllib.request.urlopen(SOURCE) as resp:
        bundle = json.load(resp)

    defs = bundle["definitions"]
    key_map = {title: pascal_key(title) for title in defs}
    renamed = {key_map[title]: body for title, body in defs.items()}
    for name, fields in REQUIRED_FIELDS.items():
        renamed[name]["required"] = fields
    for name, fields in REQUIRED_ARRAY_FIELDS.items():
        for field in fields:
            renamed[name]["properties"][field]["minItems"] = 1

    schema = inline(renamed["AgentCard"], renamed, key_map, seen=("AgentCard",))
    schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "A2A AgentCard (normalized and fully inlined from v1.0.1 proto-generated bundle)",
        **schema,
    }
    with open("agent-card.schema.json", "w") as f:
        json.dump(schema, f, indent=2)
        f.write("\n")

    print("wrote agent-card.schema.json, fully inlined (no $ref)")


if __name__ == "__main__":
    main()
