# API Explorer Platform Research

Evaluation of modern alternatives to basic Swagger UI for the NovaSafe developer platform.

## Decision: **Scalar** (`@scalar/express-api-reference`)

| Tool | Modern UI | Dark mode | OpenAPI | Self-hosted | Playground | Extensibility | Verdict |
|------|-----------|-----------|---------|-------------|------------|-----------------|---------|
| **Scalar** | Excellent | Yes | 3.x | Yes | Built-in Try It | High (themes, auth) | **Selected** |
| RapiDoc | Good | Yes | Yes | Yes | Limited | Medium | Strong alt |
| Redocly | Enterprise | Yes | Yes | Paid/CE mix | Via Redoc | High | Commercial focus |
| Stoplight Elements | Good | Yes | Yes | Yes | Yes | High | Heavier bundle |
| Huma | Go-centric | — | OpenAPI gen | N/A for Node | — | — | Wrong stack |
| Bruno | Desktop/Git | — | Import | Desktop | Full client | Low web fit | Not a portal |
| Hoppscotch | Excellent | Yes | Yes | Yes | Full | Medium | Separate product |
| Yaak / Insomnia | Desktop | Yes | Yes | Desktop | Full | — | Not embeddable |

### Why Scalar

- Beautiful, maintained API reference with **Try It** client
- First-class **OpenAPI 3.1**, authentication, and dark mode
- Official **Express middleware** — no Express internals coupling
- Self-hosted; no dependency on public Scalar cloud for docs hosting
- Playground proxy rewrites `servers` to same-origin `/api/playground/proxy` (no CORS)

### Architecture notes

- **Core** publishes modular OpenAPI at `/api/v1/openapi.json`
- **Playground** fetches, rewrites servers, serves Scalar at `/docs`
- **Proxy** injects platform headers (`x-client-source`, etc.) and auth vault tokens
- **Bruno/Hoppscotch** remain valid for offline collections; playground exports curl/fetch

### Future

- WebSocket panel (`src/websocket/`)
- GraphQL explorer hook
- API analytics (`src/analytics/`)
