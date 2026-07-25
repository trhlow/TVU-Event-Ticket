# Admin login by email OTP

Date: 2026-07-24
Status: approved, not yet implemented

## Problem

Every account signs in through Microsoft Entra today. That works for students, who all
hold a `@tvu.edu.vn` Entra account, but it does not work for the people who run clubs.

Clubs are not issued university accounts. A club nominates an address its chair and
vice-chair share — often one they create for the club itself — and sends it to the super
admin, who grants it organizer rights. Entra cannot authenticate an address it does not
own, so those accounts need a second way in.

The super admin has the same problem in reverse: the account that can create every other
account is currently reachable by anyone who controls one Entra mailbox, with no second
factor at all.

## Decisions

### Role decides the login method

`users` gains an `auth_method` column, and the pairing is enforced in the service layer
rather than the UI:

| Role | `auth_method` | Endpoints |
|---|---|---|
| `SINH_VIEN` | `MICROSOFT` | `POST /auth/login` |
| `ORGANIZER` | `EMAIL_OTP` | `POST /auth/otp/request`, `POST /auth/otp/verify` |
| `SUPER_ADMIN` | `EMAIL_OTP` | `POST /auth/otp/request`, `POST /auth/otp/verify` |

`POST /auth/session/refresh` is available to both `EMAIL_OTP` roles and to no one else.

Each flow only ever sees accounts matching its own method. An account that does not match
is treated as absent — not as a distinguishable error — so neither flow can be used to
discover which addresses belong to admins.

The user may see two login boxes; the server does not trust which one they used.

### No password

Admins sign in with an address and a code sent to it. There is no password to store, to
rotate, to leak, or to hand over when a committee changes.

This follows from the accounts being shared. A password shared between a chair and a
vice-chair, written down and passed on each year, is a liability that a mailbox is not:
control of the mailbox is already the real credential, so making it the only credential
removes a secret without removing a check.

### One person can hold two accounts

Someone who is both a student and a club chair has a student account (Entra, for
registering) and a club account (email OTP, for managing). They are separate rows and do
not merge. The club account belongs to the club, not to whoever currently runs it, which
is what makes handover possible at all.

### Trusted devices last 30 days

Verifying a code on every sign-in is too much friction for daily use. A verified browser
is remembered for 30 days; after that it verifies once more.

Because there is no password, that cookie is the sole credential for its lifetime — anyone
who can open that browser profile can act as the club. This was weighed and accepted: the
holders are a chair and vice-chair on personal machines, not a shared kiosk. Reducing the
window or dropping the feature are the levers if that assumption stops holding.

## What this removes

The design deletes more than it adds, and the deletions are the security win:

- **`PENDING_SUBJECT_PREFIX` and the claim-by-email branch in `resolveUser`.** Organizer
  accounts no longer wait to be claimed by a first Entra login, so no account is ever
  matched by address. The takeover surface that `H6` hardened is removed rather than
  guarded.
- **`isBootstrapAdmin` inside `createUser` and `refreshIdentity`.** Today any Entra login
  presenting the configured bootstrap address is promoted to `SUPER_ADMIN`. Left in place
  alongside admin MFA, it would be a back door into the highest-privileged role that skips
  MFA entirely, making the rest of this design decorative.
- **`resetOrganizer`.** Resetting a placeholder subject means nothing once placeholders are
  gone. It is replaced by revoking every trusted device, which is what is actually wanted
  when someone leaves a club.
- **Commit `bb2a3da`** (promoting a signed-in student to organizer) and its two tests. It
  solved a problem that only existed because organizers logged in through Entra.

`resolveUser` reduces to: find by subject, refresh it, or create a student.

## Mechanism

### Requesting a code

`POST /auth/otp/request {email}` always answers `202` with the same body.

Internally it looks for a user matching the address **and** `auth_method = EMAIL_OTP`
**and** `status = ACTIVE`. On a hit it generates a six-digit code, stores it in Redis under
`otp:{userId}` with a 10-minute TTL, and sends it. On a miss it does nothing. The caller
cannot tell the two apart.

### Verifying

`POST /auth/otp/verify {email, code, rememberDevice}` mints the session JWT and sets the
session cookie exactly as the Entra flow does. With `rememberDevice`, it also issues a
30-day device cookie.

Codes are single-use. Five wrong attempts destroy the code and force a new request; the
attempt counter shares the Redis key so it expires with the code.

### Trusted devices

A `trusted_devices` table holds `user_id`, `token_hash`, `expires_at`, `last_used_at` and
`revoked_at`. Only the hash is stored. The cookie is `HttpOnly`, `Secure`, `SameSite=Lax`.

The token rotates on every use. A rotated-away token presented again means the cookie was
copied, so that event revokes every device on the account.

### Refreshing the session

There is no refresh mechanism in the application today: the session JWT lives 15 minutes
and `apiClient` answers a `401` by telling the user to sign in again. Students absorb that
because re-entering through Entra is usually a silent SSO round trip. An admin on OTP
would have to read an emailed code every 15 minutes, which no one would use, so the device
cookie is not a convenience here — without it the design does not function.

`POST /auth/session/refresh` therefore reads the device cookie, rotates it, and mints a new
JWT. It is the only consumer of that cookie, and it is where rotation and replay detection
happen. It serves `EMAIL_OTP` accounts only.

The 15-minute logout that students already live with is a real usability problem, but it
predates this work and has its own trade-offs. It is recorded here and deliberately left
out of scope.

### Revocation

`lockOrganizer` already revokes outstanding JWTs through Redis; it also revokes every
trusted device. The super admin gets an explicit "sign out of all devices" action in place
of the old reset.

## Errors

| Situation | Response |
|---|---|
| Unknown address, wrong method, or locked account | `202`, identical to success |
| Wrong code | `401`, no attempt count disclosed |
| Expired code | `401`, indistinguishable from wrong |
| Rate limited | `429` |
| Mail send failed | `202` to the caller, `ERROR` in the log |

`SensitiveFlowRateLimitFilter` already covers `/api/auth/login`; both new paths are added
to it.

## Cross-feature mail

Sending mail lives in `notification`; login lives in `auth`. `architecture.md` forbids one
feature reaching into another, so `auth` declares the interface it needs and `notification`
implements it. A RabbitMQ event would be the other option but is the wrong shape for a
synchronous request the user is waiting on.

## Migration (V10)

- `auth_method` added, backfilled: existing `ORGANIZER` and `SUPER_ADMIN` rows become
  `EMAIL_OTP` with `ext_subject` nulled; `SINH_VIEN` rows become `MICROSOFT` and keep theirs.
- `ext_subject` becomes nullable; its unique constraint becomes a partial index
  (`WHERE ext_subject IS NOT NULL`).

Existing organizers lose Entra sign-in at this point and must use their address instead.
That is a breaking change for live users and needs warning ahead of the deploy.

## Testing

Written test-first, per the repo's TDD rule.

| Layer | Covers |
|---|---|
| Unit | Code generation, expiry, single use, destruction after five failures, device token rotation |
| Service | Role ↔ method binding in both directions |
| Integration | Refresh honours the device cookie for 30 days, revocation, replay of a rotated token revoking everything, refresh refused for a `MICROSOFT` account |
| Security slice | Uniform `202`, rate limiting, no address disclosure |
| Migration | `V10` against existing rows |

The first test to write is that **an Entra login presenting a club account's address
fails**. It is the evidence the takeover path is closed, and it must be red before
`PENDING_SUBJECT_PREFIX` is deleted.

## Frontend

Two boxes on the login page. `VITE_AUTH_PROVIDER` currently selects the app's single
sign-in method; afterwards it governs only the student box (`microsoft` or `devstub`),
while the admin box is always OTP. Its comment and every read of it need updating, or
someone will read it as a switch that can disable admin login.

Both endpoints are documented in OpenAPI, which `AuthOpenApiIntegrationTest` enforces.

## The first super admin

`BootstrapSuperAdminRunner` answers the chicken-and-egg problem: the super admin creates
every other account, so the first one is created from configuration at startup. Today
`tvu.auth.bootstrap.email` holds a single address.

Once the password is gone, that address is the only way into the account, which makes a
typo in it unrecoverable through the application. Three independent layers guard against
that, at three different moments:

**At configuration time**, `tvu.auth.bootstrap.email` accepts a comma-separated list, and
the runner ensures a `SUPER_ADMIN` row for each. A deployment names both the institutional
address and a personal fallback, so one unreachable mailbox does not lock anyone out.

**These addresses are supplied at deploy time through the environment, never committed.**
This repository is public. An address baked into it is a published super-admin login, and
since sign-in is passwordless, the security of the whole system would reduce to the
security of that one mailbox — with attackers told exactly which one to target.
`application-prod.yml` therefore keeps `${BOOTSTRAP_ADMIN_EMAIL}` with no default.

**After a failure**, `backend/docs/OPERATIONS.md` carries a break-glass procedure: the SQL
to insert or repair a `SUPER_ADMIN` row directly. The operators control the host and the
database — the deployment scripts already reach Postgres — so a lockout is recoverable
without a code change or a redeploy. This layer needs no new code, only the runbook.

**Before migrating**, mail delivery to each address is confirmed. See deploy blockers.

## Demo super admin — development only

In `dev` and `test`, the bootstrap address is `sadminevt@tvu.edu.vn` and it signs in with a
fixed code `123456`. This is the same mechanism as above rather than a parallel one: the
runner creates the account because it is the configured bootstrap address, and only the
code issuance is special-cased.

It is built the way `DevStubIdentityProvider` already is, so that it cannot reach
production by accident:

- `FixedOtpCodeIssuer` is `@Profile({"dev","test"})` and returns the fixed code only for the
  configured address; every other address still gets a random emailed code.
  `RandomOtpCodeIssuer` is `@Profile("prod")`. Under `prod` the fixed issuer is not a
  disabled bean — it does not exist.
- The address lives in `application-dev.yml`, never in `application-prod.yml`, and is not a
  constant in code.
- `ProductionSecretsValidator` fails startup under `prod` if demo configuration is present,
  catching a copied YAML block before it can serve traffic.

CI already fails a production frontend bundle containing demo account strings; the backend
needs the equivalent check.

## Deploy blockers

1. Remove the demo account and its fixed code. Confirm `sadminevt@tvu.edu.vn` and `123456`
   appear nowhere outside `dev` and `test` configuration.
2. Set `BOOTSTRAP_ADMIN_EMAIL` from the deployment secret to at least two real mailboxes,
   one institutional and one personal fallback. Not in `application-prod.yml`, not in git.
3. **Send a test code to each address and confirm it arrives, before running V10.** A
   mailbox that does not receive mail is indistinguishable from a correct one until it is
   the only way in.
4. Verify the break-glass procedure in `backend/docs/OPERATIONS.md` against the production
   database — a runbook nobody has executed is not a recovery plan.
5. Warn existing organizers that Entra sign-in stops working.
