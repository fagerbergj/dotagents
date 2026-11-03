# API Deprecation Standards

Two IETF standards govern API deprecation signaling at the HTTP level:

## Sunset Header — RFC 8594 (Informational, May 2019)

Defines a `Sunset` response header indicating that a URI will likely become unresponsive at a specified future date/time [datatracker.ietf.org/rfc8594](https://datatracker.ietf.org/doc/rfc8594/). Also defines a `sunset` link relation type for linking to resources about migration or sunset policies.

**Status**: Informational (not Standards Track), authored by Erik Wilde for the IETF.

## Deprecation Header — RFC 9745 (Proposed Standard, March 2025)

Defines a `Deprecation` response header field used to signal to consumers of a URI that the resource will be or has been deprecated [datatracker.ietf.org/rfc9745](https://datatracker.ietf.org/doc/rfc9745/). Additionally defines a `deprecation` link relation type to point clients at migration documentation.

**Status**: **Standards Track**, authored by Sanjay Dalal and Erik Wilde, published by the httpapi WG. Deprecation does *not* change the resource's runtime behavior — it purely informs clients so they can migrate proactively.

## How They Interact

The two headers interact naturally: `Deprecation` says "we're deprecating this," `Sunset` says "and this will stop working on date X" [datatracker.ietf.org/rfc9745](https://datatracker.ietf.org/doc/rfc9745/) → [www.rfc-editor.org/info/rfc9745](https://www.rfc-editor.org/info/rfc9745).

Use both together for a complete deprecation lifecycle: `Deprecation` header with current timestamp, followed by `Sunset` with an expiration date. When several deprecations apply, send the earliest dates. Zalando discourages relying on the `deprecation` and `sunset` link relations; put migration guidance in the specification instead (rule 189).

## In the specification and with clients

The headers are only the runtime signal. The contract and the people who use it need more ([Zalando deprecation chapter](https://github.com/zalando/restful-api-guidelines/blob/main/chapters/deprecation.adoc)):

- Mark the operation, parameter or field `deprecated: true` in the OpenAPI document, and say in its `description` what replaces it and how to migrate (rule 187).
- Get every client's agreement on the sunset date before shutting anything down (rule 185). External partners agree to the post-deprecation lifespan before they start using the API (rule 186).
- Monitor usage of everything scheduled for sunset, and keep going until it reaches zero or the agreed date (rule 188).
- Clients must not start using a deprecated API (rule 191).
