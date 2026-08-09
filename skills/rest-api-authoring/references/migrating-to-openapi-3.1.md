# Migrating from OpenAPI 3.0 to 3.1 — Change Catalog

Source: [OpenAPI.org Blog: Migrating from OpenAPI 3.0 to 3.1.0](https://www.openapis.org/blog/2021/02/16/migrating-from-openapi-3-0-to-3-1-0) (Phil Sturgeon, Stoplight), [What's New in OpenAPI 3.1](https://lornajane.net/posts/2020/whats-new-in-openapi-3-1), [learn.openapis.org/upgrading/v3.0-to-v3.1](https://learn.openapis.org/upgrading/v3.0-to-v3.1.html).

OpenAPI 3.1 (released February 2021) aligns the Schema Object with **JSON Schema Draft 2020-12**. Breaking changes are limited to the Schema Object only [swagger.io/specification](https://swagger.io/specification/).

## Step 1 — Bump the version number

Change `openapi: 3.0.3` (or `3.0.0`, `3.0.1`, `3.0.2`) to `openapi: 3.1.0` or higher.

If you see `swagger: 2.0`, you need **oas-kit/swagger2openapi** first — upgrade to OAS 3.0 before attempting a 3.1 migration [github.com/Mermade/oas-kit](https://github.com/Mermade/oas-kit/blob/master/packages/swagger2openapi/README.md).

## Step 2 — Swap `nullable` for type arrays

In OAS 3.0, `nullable: true` was a separate keyword. In JSON Schema (and OAS 3.1), nullable is expressed by including `"null"` in the type array. This makes `nullable` redundant and it was removed entirely (not deprecated).

**OAS 3.0:**
```yaml
type: string
nullable: true
```

**OAS 3.1:**
```yaml
type:
  - "string"
  - "null"
```

Find-and-replace will handle this quickly. This is the most common migration issue — tools silently ignore `nullable: true` in OAS 3.1, producing schemas that accept non-null values where nullable was intended [specway.com/blog/openapi-3-1-vs-3-0](https://specway.com/blog/openapi-3-1-vs-3-0).

## Step 3 — Tweak `exclusiveMinimum` and `exclusiveMaximum`

In OAS 3.0 these were boolean modifiers that changed the meaning of `minimum`/`maximum`. In OAS 3.1 they are distinct numeric values.

**OAS 3.0:**
```yaml
minimum: 7
exclusiveMinimum: true
```

**OAS 3.1:**
```yaml
exclusiveMinimum: 7
```

Many specs do not use these keywords at all. The boolean form generates the highest error count across 7,000+ analyzed specs migrated to 3.1 [apinotes.io/blog/common-openapi-spec-errors](https://apinotes.io/blog/common-openapi-spec-errors-and-how-to-fix-them).

## Step 4 — Replace `example` (singular) with `examples` (array) in schemas

In OAS 3.0 the Schema Object could have a singular `example` keyword. JSON Schema has `examples:` (array), so OAS 3.1 removed the singular form entirely.

**OAS 3.0:**
```yaml
type: string
example: fedora
```

**OAS 3.1:**
```yaml
type: string
examples:
  - fedora
```

This is more verbose for single examples but makes adding multiple examples trivial — in OAS 3.0 you had to switch from a property example to a media type example, which felt like overkill.

## Step 5 — Use `contentEncoding` / `contentMediaType` for file uploads

OAS 3.0 used `type: string` with `format: binary`, `format: byte`, or `format: base64`. JSON Schema uses `contentEncoding` and `contentMediaType` which are designed for this purpose.

**Binary upload (no schema needed in 3.1):**
```yaml
# OAS 3.0
requestBody:
  content:
    application/octet-stream:
      schema:
        type: string
        format: binary

# OAS 3.1
requestBody:
  content:
    application/octet-stream: {}
```

**Base64 image:**
```yaml
# OAS 3.0
requestBody:
  content:
    image/png:
      schema:
        type: string
        format: base64

# OAS 3.1
requestBody:
  content:
    image/png:
      schema:
        type: string
        contentEncoding: base64
```

**Multipart with a binary field:**
```yaml
# OAS 3.0
requestBody:
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          orderId: { type: integer }
          fileName: { type: string, format: binary }

# OAS 3.1
requestBody:
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          orderId: { type: integer }
          fileName: { type: string, contentMediaType: application/octet-stream }
```

`contentEncoding` supports all encodings from [RFC 4648](https://tools.ietf.org/html/rfc4648) (base64, base64url) and "quoted-printable" from [RFC 2045](https://tools.ietf.org/html/rfc2045#section-6.7).

## Step 6 — Declare `$schema` dialects (optional but recommended)

OAS 3.1 supports the `$schema` keyword to declare exactly which JSON Schema dialect a model uses. The default for all OAS 3.1 schemas is:

```
$schema: "https://spec.openapis.org/oas/3.1/dialect/base"
```

If you split schemas into separate JSON/YAML files and reference them, each file can declare its own `$schema` dialect. This protects against tooling confusion when a schema is referenced from both OAS 2.0 and OAS 3.0 contexts [www.openapis.org/blog/2021/02/16/migrating-from-openapi-3-0-to-3-1-0](https://www.openapis.org/blog/2021/02/16/migrating-from-openapi-3-0-to-3-1-0).

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

This prevents impossible situations where a single schema is referenced by OAS 2.0 and OAS 3.0 simultaneously — if an OAS3-specific keyword was added, it would silently break OAS2 usage. Now tools fail immediately when encountering an unfamiliar dialect, rather than breaking after months of working usage.

## New capabilities in 3.1 (no migration needed)

Beyond the breaking changes above, OAS 3.1 adds:

- **Tuple validation** with `items` as an array [json-schema.org/understanding-json-schema/reference/array.html#tuple-validation](https://json-schema.org/understanding-json-schema/reference/array.html#tuple-validation)
- **if/then/else** conditional schemas — alternative to awkward nested allOf → oneOf chains
- **prefixItems**, **dependentRequired**, **$dynamicRef** (full JSON Schema 2020-12 support)
- **`$defs`** for local reusable sub-components within a schema [specway.com/blog/openapi-3-1-vs-3-0](https://specway.com/blog/openapi-3-1-vs-3-0)

## Migration checklist

- [ ] Bump `openapi: 3.x.0` → `openapi: 3.1.0`
- [ ] Replace all `nullable: true` with type arrays including `"null"`
- [ ] Replace `exclusiveMinimum: true` / `exclusiveMaximum: true` with numeric values
- [ ] Replace `example:` (singular in schemas) with `examples:` (array)
- [ ] Replace `format: binary|byte|base64` with `contentEncoding`/`contentMediaType` for file uploads
- [ ] (Optional) Add `$schema` to schemas referenced across multiple OAS versions
- [ ] Run `spectral lint` and fix any new 3.1 validation errors
- [ ] Run `oasdiff diff --breaking-only` between old spec and migrated spec to verify no unintended changes
