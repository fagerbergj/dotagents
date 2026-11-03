# Payloads, Collections and Asynchronous Work

Rule numbers are from the [Zalando RESTful API Guidelines](https://github.com/zalando/restful-api-guidelines/blob/main/chapters). Where Zalando and Azure differ, follow the house standard first; the choice that matters most is applying one rule consistently and linting it.

## JSON payloads

- Return a JSON object at the top level, never a bare array, so fields can be added later.
- Pick one property-name case and enforce it with a linter rule. Zalando requires snake_case (rule 118); Azure requires camelCase. Never mix them within one API.
- Give `null` and an absent property the same meaning (rule 123). Don't use `null` for booleans (rule 122) or for empty arrays (rule 124). Omitting the property satisfies both Zalando and Azure.
- Use one schema for reading and writing a resource, marking server-set fields `readOnly` and client-only fields `writeOnly` (rule 252).
- Treat response objects as open for extension, and have clients ignore unknown fields (rules 111 and 108). Closing **request** schemas with `additionalProperties: false` is a legitimate choice for stricter validation, but decide it per API and document it.

## Enums

Removing an enum value always breaks clients. Adding one breaks clients that switch exhaustively over the values, unless the enum was declared open from the start. Declare response enums that may grow as extensible: Zalando uses `x-extensible-enum` or `examples` (rule 112); Azure uses `x-ms-enum` with `modelAsString`. Document that clients must handle unknown values.

## Lists and pagination

- Paginate any list that can grow beyond a few hundred items (rule 159). Adding paging to a list that returned everything is a breaking change ([Azure](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md)), so decide up front.
- Prefer cursor-based pagination: offset pages skip or repeat items when data changes underneath (rule 160). Use offsets only when clients need to jump to a page.
- Return a page object with the items and a link to the next page (rule 248). Omit the next link on the last page.
- Avoid total counts by default; they are expensive and often wrong under concurrent writes (rule 254).
- Document whether a client may see an item twice, or miss one, while paging.

## Long-running work

When an operation can't finish within a request:

- Return `202 Accepted` with a status resource the client polls. Azure puts the status monitor's absolute URL in an `Operation-Location` header and keeps it for at least 24 hours ([Azure](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md)); send `Retry-After` on non-final polls.
- Or model the work as a job resource: `POST /report-jobs` returns 201 with the job, the client polls `GET /report-jobs/{id}`, then fetches the result (rule 253).
- A status resource has a terminal state for success, failure (with a problem body) and cancellation, so clients know when to stop polling.
