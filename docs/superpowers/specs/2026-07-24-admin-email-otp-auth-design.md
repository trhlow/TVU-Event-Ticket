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

## Demo super admin — development only

`sadminevt@tvu.edu.vn` signs in with a fixed code `123456`, for local work until deploy
preparation begins.

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

1. Remove the demo account and its fixed code.
2. Point `tvu.auth.bootstrap.email` at a real mailbox and **confirm mail arrives before
   running V10** — a wrong address locks the super admin out permanently, and no other
   account can restore it.
3. Warn existing organizers that Entra sign-in stops working.
