## Summary

<!-- What changed and why -->

## Type

- [ ] Bug fix (Personal / production)
- [ ] Personal product improvement
- [ ] Feature flag platform (NS-55)
- [ ] Parked product work (Teams / Enterprise / Passkeys — behind flags)

## Feature flags (required for parked product work)

| Question | Answer |
|----------|--------|
| Flag key used | <!-- e.g. teams, enterprise, passkeys — or N/A --> |
| Default in production | <!-- must be false for new product flags --> |
| Surfaces affected | <!-- web / mobile / extension / admin --> |

## Safety checklist

- [ ] Additive DB migrations only (no DROP on production paths)
- [ ] No breaking changes to existing `/api/v1` Personal endpoints
- [ ] New product APIs use new paths (not modifying existing contracts)
- [ ] Unreleased UI is behind a feature flag or not registered in router

## Docs

- [ ] Notion updated (NS-55 epic / story page) if behavior or process changed
- [ ] No new repo `docs/*.md` unless explicitly requested

## Test plan

<!-- How you verified -->
