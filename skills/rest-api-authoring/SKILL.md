---
name: rest-api-authoring
description: >
  The disciplined way to design and author REST APIs using OpenAPI — from resource model
  through versioning, deprecation, evolution analysis, security alignment, and validation
  tooling. Load whenever you are designing a new API, authoring or reviewing an OpenAPI spec,
  evaluating breaking changes, or deciding on a versioning strategy — before you start
  writing endpoints.
metadata:
  author: fagerbergj
  author_url: https://github.com/fagerbergj
  repository: https://github.com/fagerbergj/dotagents
---

# REST API Design & OpenAPI Authoring

Most API problems come from skipping the early decisions — wrong maturity level, inconsistent HTTP method usage, or a versioning strategy that breaks caches. This workflow front-loads those choices before any YAML is written.

The order matters: do not draft endpoints in step 2 before validating the resource model and security requirements in step 1.

## The workflow

### 1. Understand the domain — what are we exposing?

Do not start from a list of endpoints. Start from the problem space.

- What resources does the API expose? (nouns, not verbs)
- Who are the clients? (web app, mobile SDK, third-party integrator, internal service)
- What security model applies? (JWT bearer, OAuth2 scopes, API keys, mTLS)
- What Richardson maturity level is required? (Level 2 minimum; Level 3 only if hypermedia-driven navigation is a requirement)

Read `references/richardson-model.md` to understand the maturity levels and Fielding's REST constraints before deciding.

### 2. Design the resource surface — paths, methods, responses

Draft the resource model before writing OpenAPI YAML:

- **Map resources to URI paths**: one path per concept (`/users/{id}` not `/getUser`). Collection endpoints at known parent-relative paths (`/users/{userId}/posts`) are fine.
- **Assign HTTP methods**: use the method semantics from `references/http-methods.md`. PUT replaces; PATCH partials; POST creates or triggers processing.
- **Define response codes**: each operation should have at least one success and one error response. Use RFC 7807/9457 Problem Details for error bodies.

### 3. Author the OpenAPI spec — structure, schemas, security

Now translate the model into OpenAPI. Follow this checklist:

- **Use `components/schemas`**: never inline complex object definitions
- **Define `securitySchemes` in components**: reference at operation or global level; never declare inline
- **Use `$ref` for reuse**: every shared model should be referenced, not duplicated
- **Place `requestBody` separate from `parameters`**: body data goes in `requestBody`; path/query/header/cookie inputs go in `parameters`
- **Write `summary` (≤50 chars) and `description`** for every operation

Read `references/openapi-authoring.md` for composition patterns (`allOf`, `oneOf`, discriminator), `$ref` resolution pitfalls, examples structure, and common errors. Read `references/migrating-to-openapi-3.1.md` if migrating an existing OAS 3.0 spec.

### 4. Decide versioning and deprecation strategy

Every API needs a plan for how consumers discover current versions and migrate away from old ones.

- **Versioning**: choose URI path, Accept header, or query param. Read `references/api-versioning.md` for trade-offs — URI path is the pragmatic default for most teams because it works with every CDN cache key out of the box.
- **Deprecation**: use RFC 9745 `Deprecation` + RFC 8594 `Sunset` response headers, and/or spec-level deprecation metadata. Read `references/api-deprecation.md`.
- **Schema evolution**: classify planned changes as backward-compatible or breaking before publishing a new spec version. Read `references/schema-evolution.md`.

### 5. Validate with tooling — lint, diff, test

Before any consumer touches the spec:

- **Lint**: run `spectral` against your OpenAPI file using the built-in `spectral:oas` ruleset.
- **Diff**: when publishing a new version, run `oasdiff diff --breaking-only old.yaml new.yaml` in CI to gate on accidental breaking changes.
- **Contract test**: run `schemathesis run <spec-url>` against the deployed API (or mock server) before marking the spec "stable".

Read `references/tooling.md` for Spectral, oasdiff, openapi-lint, and Schemathesis setup details.

### 6. Security review — OWASP alignment

Before publishing:

- Check every endpoint against the [OWASP API Security Top 10 (2023)](https://owasp.org/www-project-api-security/).
- Verify authentication and authorization are declared in the OpenAPI spec.
- Ensure rate limiting, input validation, and error exposure align with recommendations.

Read `references/security.md` for the full OWASP Top 10 list and what to look for at each endpoint type.

## When NOT to use

This skill is for designing APIs from scratch or substantially rewriting existing ones. A one-off endpoint fix, a minor field rename, or updating error message text does not need the full loop — jump straight to the relevant reference file.
