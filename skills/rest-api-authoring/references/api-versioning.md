# API Versioning Strategies

Versioning is a contract and deployment decision, not a REST compliance test. First follow an existing public API convention. For a new API, choose the strategy that your consumers, gateway, cache, documentation, and retirement process can support.

## Selection criteria

Check these before choosing a syntax:

- Can consumers identify the version easily in requests, logs, examples, and support tickets?
- Can the gateway route the version and can the CDN include the relevant request part in its cache key?
- If representations vary by `Accept`, is `Vary: Accept` sent and honored by every intermediary?
- Can generated SDKs and interactive documentation express the strategy cleanly?
- How will consumers discover versions, receive deprecation notices, and migrate?

## Common strategies

| Strategy | Strengths | Costs and checks |
|----------|-----------|------------------|
| **URI path** (`/v1/users`) | Visible in URLs, logs, and `curl`; straightforward routing and usually easy cache separation. | Treats versions as distinct route spaces. Confirm route policy and whether a versioned path matches existing API conventions. |
| **Media type / Accept header** (`Accept: application/vnd.example.v1+json`) | Keeps the resource URI stable and selects a representation through content negotiation. | Configure `Vary: Accept`, edge cache keys, routing, observability, and tooling. Version discovery is less obvious in copied URLs. |
| **Query parameter** (`?version=1`) | Easy to add during a migration and visible in a request. | Confirm the CDN/proxy cache key includes the query parameter and that it does not conflict with application query semantics. |
| **Date-based version** (`2026-04-22`) | Makes the selected contract explicit and can support per-account upgrade behavior. | Requires clear release documentation, client defaults, and a durable compatibility policy. |

## Default: Google's major-version model

Without a house convention, follow [AIP-185](https://google.aip.dev/185):

- Expose only a **major** version, as the first segment of the URI path: `/v1/users`. Never expose minor or patch numbers (`v1.2`).
- Ship compatible changes **in place** within the major version. Clients get new fields and endpoints without migrating. What counts as compatible is in `schema-evolution.md` ([AIP-180](https://google.aip.dev/180)).
- Create a new major version only for a breaking change. It must not depend on the previous one, and both must run side by side for a well-communicated deprecation period before the old one shuts down.
- For pre-release surfaces, use stability channels: `v1alpha` and `v1beta` receive in-place updates, the stable channel is plain `v1`, and each channel is a superset of the more stable one. Deprecated functionality must not graduate from alpha to beta or beta to stable. AIP-185 recommends 180 days of deprecation before removing beta functionality.

Other guides choose differently. Azure requires an `api-version` date query parameter, and Zalando forbids URL versioning in favor of media-type versioning (rules 114 and 115). Follow them only when the house convention or a platform you integrate with requires it. A correctly configured cache can key on query parameters or `Accept`, while a poorly configured path cache can still serve the wrong response.

Sources: [REST API versioning strategies](https://www.application-architect.com/posts/rest-api-versioning-url-header-and-query-parameter-strategies/), [Vercel API versioning strategies](https://vercel.com/i/api-versioning-strategies), [RFC 9111 caching](https://www.rfc-editor.org/rfc/rfc9111.html).
