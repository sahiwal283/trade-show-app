# Authentik SSO Integration — Design Spec

**Date:** 2026-08-19
**Status:** Approved design, pending implementation plan
**Target version:** 2.16.0

## Goal

Add Authentik OIDC single sign-on to the trade show app as an additional
login method. Password login keeps working exactly as it does today. Existing
users get linked to their Authentik identities (via an operator-supplied merge
list plus automatic email matching); unknown Authentik users are
auto-provisioned with the `pending` role. All setup on both sides (Authentik
provider/application, app config) is scripted — no manual UI steps.

## Decisions (settled during brainstorming)

| Question | Decision |
|---|---|
| Unknown SSO user (no app account) | Auto-provision with role `pending` (admin assigns a real role later, same as self-registration today) |
| "SSO is primary" for merged users | Login page leads with the Authentik button; password login remains a working fallback for everyone |
| Role source | App-managed only. Authentik authenticates identity; roles never sync from Authentik groups |
| Authentik email matches an unlinked app account | Auto-link by exact (case-insensitive) email match and sign in |
| Client implementation | Backend-driven Authorization Code + PKCE using the certified `openid-client` library |
| Environments | Sandbox (CT 2600) first, verified end-to-end, then production (CT 2220/2120) |

## Environment facts

- **Authentik:** LXC 111 on Proxmox host `192.168.1.190`, source install at
  `/opt/authentik`, version 2026.2.2, listening on `192.168.1.164:9000`
  (HTTP) / `:9443` (HTTPS), public URL `https://auth.booute.duckdns.org`.
- **Existing OIDC clients** (pattern to copy): payroll (CT 120), luma
  (CT 122), nexus-resolve (CT 119), all using issuer
  `https://auth.booute.duckdns.org/application/o/<slug>/`.
- **Trade show app:** frontend LXC 2120, backend LXC 2220
  (`/opt/trade-show-app`), prod DB LXC 2320, sandbox LXC 2600. Public URL
  `https://expapp.duckdns.org` (also served under
  `https://booute.duckdns.org/apps/trade-show`). Sandbox (CT 2600) is served
  at `http://192.168.1.144` (LAN-only, per its `CORS_ORIGIN`), so the sandbox
  redirect URI is `http://192.168.1.144/api/auth/oidc/callback`.
- **Existing auth:** local JWT (HS256, 12h, claims `id`/`username`/`role`)
  issued at `backend/src/routes/auth.ts`; middleware
  `backend/src/middleware/auth.ts`; session rows in `user_sessions`. A
  dormant-but-configured platform-JWT cookie SSO
  (`PLATFORM_JWT_SECRET`, `/api/auth/platform/session`) exists and is
  **untouched by this design**.
- **Users table:** `username` and `email` both UNIQUE NOT NULL, `password`
  NOT NULL (bcrypt cost 10), `role` VARCHAR constrained by CHECK
  (authoritative list in migration 031). No external-identity column today.
  Highest migration: 035.

## 1. Authentik provisioning (scripted, no UI clicks)

All performed via Authentik's REST API on LXC 111, using an API token
bootstrapped through `manage.py shell` as `akadmin`:

1. **OAuth2 Provider** "Trade Show App":
   - Confidential client, authorization-code flow.
   - Scopes: `openid profile email`.
   - **`sub_mode = user_uuid`** — stable and precomputable via the Authentik
     API, which is what lets the merge script link accounts before a user's
     first SSO login.
   - Signing key and authorization flow copied from the existing
     payroll/luma providers for consistent behavior.
   - Redirect URIs: `https://expapp.duckdns.org/api/auth/oidc/callback` and
     the sandbox equivalent.
2. **Application**: slug `trade-show`, bound to the provider. Issuer becomes
   `https://auth.booute.duckdns.org/application/o/trade-show/`. Launch URL
   `https://expapp.duckdns.org`.
3. Generated `client_id`/`client_secret` are written directly into the
   backend `.env` on CT 2600 (sandbox) and CT 2220 (prod). Secrets never
   enter the git repo. Services restarted after write.

## 2. Backend changes

### Migration `036_add_authentik_sso.sql` (additive, nullable)

```sql
ALTER TABLE users
  ADD COLUMN authentik_sub VARCHAR(255) UNIQUE,
  ADD COLUMN sso_linked_at TIMESTAMPTZ,
  ADD COLUMN last_sso_login TIMESTAMPTZ;
```

No separate identities table — single IdP, YAGNI.

### New dependency

`openid-client` (backend only). Handles discovery, JWKS, ID-token
signature/aud/nonce validation, PKCE.

### New files

- **`backend/src/routes/oidc.ts`** mounted at `/api/auth/oidc`
  (unauthenticated, like `/api/auth`):
  - `GET /login` — 302 to Authentik authorize endpoint with `state`,
    `nonce`, and PKCE challenge. The verifier/state/nonce ride in a
    10-minute HttpOnly `SameSite=Lax` cookie.
  - `GET /callback` — exchanges the code, validates the ID token, resolves
    the user (below), then either issues the standard 12h app JWT +
    `createSession()` and redirects to the frontend with
    `/#sso_token=<jwt>` (URL fragment: never sent to servers or logs), or
    redirects with `/#sso_error=<code>`.
- **`backend/src/services/AuthentikOidcService.ts`** — discovery (cached),
  auth-URL construction, callback validation, and user resolution.

### User resolution order (callback)

1. `users.authentik_sub = token.sub` → sign in; update `last_sso_login`.
2. Case-insensitive email match on an unlinked account → set
   `authentik_sub` + `sso_linked_at`, sign in.
3. No match → create user: role `pending`, `username` from Authentik
   `preferred_username` (numeric suffix on collision), `name`/`email` from
   claims, `password` = bcrypt hash of a random unusable value (satisfies
   NOT NULL; not communicated to anyone).

Users whose resolved role is `pending` do **not** get a token — they are
redirected with `sso_error=pending`, mirroring the existing 403 on password
login for pending users.

### `GET /api/auth/me`

New authenticated endpoint returning `{id, username, name, email, role}` so
the frontend can hydrate its user object from a token alone.

### Configuration

New backend env vars: `AUTHENTIK_ISSUER`, `AUTHENTIK_CLIENT_ID`,
`AUTHENTIK_CLIENT_SECRET` (plus `env.example` entries with comments). If any
is unset, the OIDC routes respond "SSO not configured" and the app behaves
exactly as today. This is also the rollback mechanism.

## 3. Frontend changes

- **`LoginForm.tsx`**: "Sign in with Authentik" button in the primary
  position (full-page redirect to `${API_BASE}/auth/oidc/login`); existing
  username/password form stays below. `sso_error` codes in the URL hash map
  to error banners: `pending` → "account pending approval",
  `idp_unreachable` → "SSO unavailable, use your password", `retry` →
  "sign-in expired, try again".
- **`useAuth.ts` bootstrap**: before the existing platform-session check,
  detect `#sso_token` → `TokenManager.setToken()`, call `/auth/me`,
  populate `tradeshow_current_user`, scrub the hash. Downstream behavior
  (session manager, 10-min refresh, inactivity warning, offline sync) is
  unchanged because the token is a normal app JWT.

## 4. Account merging (operator-supplied list)

- **`scripts/link-authentik-users.ts`**, run on the backend container
  against its DB. Input: pairs of
  `app-username-or-email → authentik-username-or-email` (single identifier
  allowed when identical).
- For each entry: query the Authentik API for the user, take their UUID
  (identical to the token `sub` under `sub_mode=user_uuid`), write it to
  `users.authentik_sub` with `sso_linked_at = now()`.
- **Dry-run by default.** Prints planned links and flags problems (no
  Authentik match, ambiguous match, app account already linked to a
  different sub). Writes only with `--apply`.
- Users missed by the list still auto-link at first SSO login via email
  match. No per-user "SSO enforced" flag — password fallback stays for all.

## 5. Deployment & verification (no user intervention)

1. **Sandbox:** bump both `package.json`s to 2.16.0, `npm run
   build:sandbox`, deploy backend + frontend to CT 2600, migration 036
   auto-applies at startup, write Authentik creds to sandbox `.env`,
   restart.
2. **Scripted E2E proof:** create an ephemeral Authentik test user via API;
   drive the full login through Authentik's flow-executor JSON API (no
   browser): authorize → authenticate → callback. Assert: (a) a `pending`
   user is auto-provisioned and blocked with `sso_error=pending`; (b) after
   pre-linking the test user to a role-holding sandbox account, SSO login
   yields a JWT that works against `/api/auth/me`; (c) password login still
   works. Delete the test user afterward.
3. **Production:** DB backup first (as with Midas deploys), then the same
   deploy steps on CT 2220/2120, `npm run build:production`, NPMplus cache
   cleared (CT 104), same scripted verification with an ephemeral user.
4. **Rollback:** remove the three `AUTHENTIK_*` env vars and restart. SSO
   routes go dormant; password login untouched; migration is additive so no
   schema rollback.

## 6. Error handling, security, testing

### Failure modes

- Authentik down → password login unaffected; SSO redirect fails fast,
  lands back with `sso_error=idp_unreachable`.
- Bad/expired state or PKCE cookie → `sso_error=retry`.
- Username collision on provision → numeric suffix.
- Email collision on provision → impossible by construction (email match
  links instead of creating).
- Email matches an account already linked to a **different** `authentik_sub`
  → do not link, do not create (email UNIQUE would reject it); redirect with
  `sso_error=identity_conflict` ("this email is linked to a different SSO
  identity — contact an admin") and log the conflict for admin follow-up.

### Security

- `state` + `nonce` + PKCE on every flow; verifier in an HttpOnly cookie.
- Client secret only in backend `.env` files on the containers.
- ID-token signature/audience/nonce validation via `openid-client` against
  Authentik's JWKS.
- The app's own JWT contract is unchanged; no new token types downstream.

### Tests

- Backend (Vitest): user-resolution matrix (sub match / email link /
  provision / username collision / pending block), state-cookie validation,
  env-gating (routes disabled when unconfigured), link-script dry-run
  logic.
- Frontend: extend `useAuth.platform-session.test.tsx` patterns with the
  `#sso_token` bootstrap path.

## Out of scope

- Disabling password login per user (revisit later; would be one column).
- Authentik group → app role mapping.
- Changes to the platform-JWT cookie SSO.
- Front-channel/back-channel logout from Authentik (app logout stays local).
