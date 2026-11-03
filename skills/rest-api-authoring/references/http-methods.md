# HTTP Method Semantics & Status Codes

## HTTP Methods

The primary specification is **RFC 9110** (*HTTP Semantics*), published in 2022 and obsoleting RFC 7231 [datatracker.ietf.org/rfc9110](https://datatracker.ietf.org/doc/html/rfc9110). Method definitions remain at Sections 9.3.1–9.3.5 with the same semantics.

| Method | Safe? | Idempotent? | Description |
|--------|-------|-------------|-------------|
| **GET** | ✅ Yes | ✅ Yes | Transfer a current representation of the target resource [RFC 9110 §9.3.1](https://datatracker.ietf.org/doc/html/rfc9110#name-get). |
| **POST** | ❌ No | ❌ No | Perform resource-specific processing on the request payload (e.g., creating a subordinate resource) [RFC 9110 §9.3.3](https://datatracker.ietf.org/doc/html/rfc9110#name-post). |
| **PUT** | ❌ No | ✅ Yes | Replace all current representations with the request payload [RFC 9110 §9.3.4](https://datatracker.ietf.org/doc/html/rfc9110#name-put). |
| **DELETE** | ❌ No | ✅ Yes | Remove all current representations of the target resource [RFC 9110 §9.3.5](https://datatracker.ietf.org/doc/html/rfc9110#name-delete). |
| **PATCH** | ❌ No | Not guaranteed | Applies partial modifications; not idempotent because the same patch applied twice may produce different results depending on intervening changes [RFC 5789](https://datatracker.ietf.org/doc/html/rfc5789). |

## Method details

- **GET** has no request body. When a query is too large for the URL, use a documented `POST` that only reads, and say so in the spec.
- **PUT** replaces the whole resource; a later GET returns what was sent plus server-set fields. Prefer **POST** for creation when the server assigns the identifier; the client never sends it in the body.
- **PATCH** accepts one patch format per endpoint. Prefer JSON Merge Patch (`application/merge-patch+json`, [RFC 7396](https://datatracker.ietf.org/doc/html/rfc7396)), then JSON Patch, else a documented POST.
- After a successful **DELETE**, GET on the resource returns 404 or 410.

## Idempotency and concurrency

Retries happen: a client times out and sends again. Make POST and PATCH safe to retry with one of three patterns ([Zalando rule 229](https://github.com/zalando/restful-api-guidelines/blob/main/chapters/http-requests.adoc)):

- **Conditional key:** the client sends `If-Match` with the ETag it read; a stale write fails with 412.
- **Secondary key:** a unique business property (an order number the client supplies); a duplicate create fails with 409.
- **`Idempotency-Key` header:** the server stores the first response for that key and replays it for retries.

Prefer the first two; they also prevent lost updates between different clients. Use `If-Match` with ETags for optimistic locking on PUT and PATCH, answer 412 when the precondition fails, and 428 when a required precondition is missing.

## Status Code Families

Defined in RFC 9110 Section 15 (obsoletes RFC 7231 Section 6), with additions from RFC 6585 [datatracker.ietf.org/rfc9110](https://datatracker.ietf.org/doc/html/rfc9110) → [datatracker.ietf.org/rfc6585](https://datatracker.ietf.org/doc/html/rfc6585).

| Range | Category | Examples |
|-------|----------|----------|
| **1xx** | Informational | 100 Continue, 101 Switching Protocols |
| **2xx** | Success | 200 OK, 201 Created, 202 Accepted, 204 No Content |
| **3xx** | Redirection | 301 Moved Permanently, 302 Found, 303 See Other |
| **4xx** | Client Error | 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 405 Method Not Allowed, 409 Conflict, 415 Unsupported Media Type, 422 Unprocessable Content, 428 Precondition Required, 429 Too Many Requests, 431 Request Header Fields Too Large |
| **5xx** | Server Error | 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout, 511 Network Authentication Required |

## Problem Details (RFC 7807 / RFC 9457)

RFC 7807 defines a standard machine-readable format for error details in HTTP responses, avoiding per-API error format definition [datatracker.ietf.org/rfc7807](https://datatracker.ietf.org/doc/html/rfc7807). The `ProblemDetails` JSON object supports `type` (URI reference), `title`, `status` (HTTP status code), `detail`, and `instance`.

RFC 9457 obsoletes RFC 7807 (July 2023). It permits problem-type definitions to add extension members directly to the object; there is no `extensionsMap` field. Clients must ignore extensions they do not recognize [RFC 9457 §3.2](https://datatracker.ietf.org/doc/html/rfc9457#section-3.2). Use this format for API error responses to give clients predictable error structures across endpoints ([Zalando rule 176](https://github.com/zalando/restful-api-guidelines/blob/main/chapters/http-status-codes-and-errors.adoc)). Azure services instead use an `{"error": {"code", "message", ...}}` envelope with the code repeated in an `x-ms-error-code` header; follow it only for Azure SDK compatibility. Whatever the envelope, the machine-readable error codes clients act on are part of the contract: document them, and treat removing or renaming one as breaking.

## Status codes worth specifying

- Declare every success response and every endpoint-specific error in the spec; a `default` response can cover generic 401, 403, 404, 500 and 503.
- Rate limits return **429** with `Retry-After` or rate-limit headers (Zalando rule 153).
- Batch and bulk requests return **207** with a result per item (Zalando rule 152).
- Avoid redirects in machine APIs; deprecate and add the new endpoint instead (Zalando rule 251).
- Zalando prefers 400 over 422 for validation errors. RFC 9110 defines 422, so either is correct; pick one per API and keep it.
