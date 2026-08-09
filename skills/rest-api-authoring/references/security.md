# OWASP API Security Top 10 (2023)

The authoritative source is **owasp.org/API-Security**, not api-security.tech [owasp.org/www-project-api-security](https://owasp.org/www-project-api-security/) → [github.com/OWASP/API-Security](https://github.com/OWASP/API-Security). The OWASP API Security Top 10 2023 is the current edition:

| # | Category |
|---|----------|
| API1:2023 | Broken Object Level Authorization |
| API2:2023 | Broken Authentication |
| API3:2023 | Broken Object Property Level Authorization |
| API4:2023 | Unrestricted Resource Consumption |
| API5:2023 | Broken Function Level Authorization |
| API6:2023 | Unrestricted Access to Sensitive Business Flows |
| API7:2023 | Server Side Request Forgery |
| API8:2023 | Security Misconfiguration |
| API9:2023 | Improper Inventory Management |
| API10:2023 | Unsafe Consumption of APIs |

Authorization vulnerabilities dominate — three of the top five relate to access control (API1, API3, API5). The project is maintained in the [OWASP/API-Security GitHub repo](https://github.com/OWASP/API-Security) with 2,300+ stars.

## What to Check at Each Endpoint Type

- **CRUD endpoints**: BOLA (API1), BFIA (API5) — verify object-level and function-level authorization on every read/write/delete.
- **Auth flows**: Broken Authentication (API2) — check token issuance, rotation, revocation, and refresh logic.
- **Property-write endpoints**: BOPALA (API3) — ensure mass assignment protection; client-provided properties must be validated against the expected schema.
- **Public search/list endpoints**: Unrestricted Resource Consumption (API4) — enforce pagination, rate limits, and query complexity limits.
- **Admin/internal endpoints**: Improper Inventory Management (API9) — undocumented or test endpoints are a common attack surface.
- **Outbound calls / webhooks**: SSRF (API7), Unsafe Consumption (API10) — validate upstream data before trusting it; verify signatures on callbacks.
