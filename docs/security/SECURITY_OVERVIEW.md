# NovaSafe — Security overview (minimal)

One-page context for the [fix checklist](./SECURITY_FIX_CHECKLIST.md). Not for the public website.

---

## What we protect

- **Master password** — never sent to server (zero-knowledge)
- **Vault passwords & notes** — encrypted client-side; server stores ciphertext + serves decrypted JSON to authenticated sessions
- **Sessions & tokens** — JWT in cookie (web) or extension storage
- **Billing entitlements** — who gets Pro features

---

## #1 production note

```text
Clients → mobile-api.novasafe.io → nginx → novasafe-mobile-vault:3124
                                              ↑ Docker image = services/core (C-01 done)
```

Legacy `services/mobile_vault` is **removed**. Port 3124 vs 3125 is env only — prod and local dev run the same **core** code.

Deploy / rollback: [C01_CUTOVER_RUNBOOK.md](./C01_CUTOVER_RUNBOOK.md)

---

## Surfaces to secure

| Surface | Repo |
|---------|------|
| API | `novasafe-backend/services/core` (+ cutover from `mobile_vault`) |
| Auth / checkout | `novasafe-auth-v2` |
| Vault web | `novasafe-app-v2` |
| Extension | `novasafe-extension` |
| Deploy / nginx | `novasafe-deployment` |

---

## Highest-risk flows (what attackers target)

1. **Signup without email proof** — C-03, C-05, H-12  
2. **Brute-force login / 2FA** — C-04, H-03  
3. **Steal session → read vault** — C-06, H-06, H-09  
4. **Bypass Pro limits** — C-02, C-10  
5. **Extension: credentials after lock** — C-07, C-08  
6. **Wrong-site autofill** — H-19  

---

## Done = checklist complete

No RACI, no formal threat-model sign-off. **SEC-01.1** is satisfied when:

- This overview exists (context)
- [SECURITY_FIX_CHECKLIST.md](./SECURITY_FIX_CHECKLIST.md) is the working tracker
- P0 items are fixed or explicitly accepted before launch

Deep findings: [PRODUCTION_READINESS_AUDIT.md](../PRODUCTION_READINESS_AUDIT.md).
