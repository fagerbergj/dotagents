# API Versioning Strategies

Three dominant strategies exist, each with distinct trade-offs in visibility, caching, debugging, and REST compliance [application-architect.com](https://www.application-architect.com/posts/rest-api-versioning-url-header-and-query-parameter-strategies/) → [vercel.com/i/api-versioning-strategies](https://vercel.com/i/api-versioning-strategies) → [cadence.withremote.ai/blog/api-versioning-2026](https://cadence.withremote.ai/blog/api-versioning-2026).

| Strategy | Pros | Cons |
|----------|------|------|
| **URI Path Versioning** (`/v1/users`) | Best visibility — version obvious from a single `curl` line. Excellent edge-cacheability since CDNs treat the URL path as the primary cache key. Works with every existing tool out of the box. | Breaks REST purity (the path semantically identifies a resource, not a version). |
| **Custom Accept Header** (`Accept: application/vnd.company.v1+json`) | Keeps URLs clean, aligns with REST principles (URI identifies resource, header selects representation). | Fragments edge caches due to `Vary: Accept` header, causing CDN cache key explosion. More sophisticated tooling required for testing/debugging. Harder for consumers to discover which versions exist. |
| **Query Parameter Versioning** (`?version=1`) | Simple, zero URL rewrites needed. Works as a quick migration path. | Poor edge-cacheability — many CDNs ignore query-string versions or treat `?version=1` and `?version=2` identically. Harder to spot which version you're hitting. Can interfere with parameter parsing if the API also uses `?v=` for other purposes. |

**Date-based versioning** (Stripe's model: `2026-04-22.dahlia`) is increasingly regarded as the gold standard at scale, embedding a date into the URI or Accept header so the contract carries its own temporal provenance — but it demands more engineering effort and documentation complexity.

> **Verdict:** URI path versioning is the right answer for most teams because it is debuggable from a single `curl` line and works well with CDN caches [cadence.withremote.ai/blog/api-versioning-2026](https://cadence.withremote.ai/blog/api-versioning-2026).
