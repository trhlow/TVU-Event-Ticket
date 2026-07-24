# TVU Event & Ticket — Frontend

React + TypeScript + Vite workspace for the TVU Event & Ticketing Platform. Talks to the backend at a single
base URL (`VITE_API_BASE_URL`), using an HttpOnly JWT cookie + double-submit CSRF cookie. The backend is
one modular-monolith application — the API gateway it used to sit behind was removed in the 2026-07
migration, and no URL the frontend calls changed. See the repo root [README.md](../README.md) and
[BACKEND_STATUS_FOR_FRONTEND.md](../backend/docs/BACKEND_STATUS_FOR_FRONTEND.md) for the backend contract, and
[backend/docs/BACKEND_SECURITY_REQUIREMENTS.md](../backend/docs/BACKEND_SECURITY_REQUIREMENTS.md) /
[docs/FRONTEND_IMPLEMENTATION_STATUS.md](../docs/FRONTEND_IMPLEMENTATION_STATUS.md) for what is
still incomplete and why.

## Running locally

```bash
npm install
cp .env.example .env   # then edit values as needed
npm run dev
```

## Environment variables

| Variable | Purpose | Notes |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Base URL of the backend API (must include `/api`) | Never point production at `localhost` |
| `VITE_APP_ENV` | `development` \| `production` | Defaults to Vite's own build mode if unset. When `production`, the app refuses to start if `VITE_AUTH_PROVIDER=devstub` |
| `VITE_AUTH_PROVIDER` | `microsoft` \| `devstub` | `devstub` maps to the backend's dev-only, password-less identity stub. The DevStub login panel only exists in non-production builds (`import.meta.env.DEV`) — it is dead-code-eliminated from `npm run build` output regardless of this variable |
| `VITE_USE_DEMO_DATA` | `true` \| `false` | When `true`, service layers serve fixture data instead of calling the real API — used for offline UI demos only |
| `VITE_ENABLE_MOCK_FALLBACK` | `true` \| `false` | Legacy flag; no longer changes runtime behavior beyond `VITE_USE_DEMO_DATA` (see below). Kept only so a production deployment that sets it is still flagged by the startup warning banner |
| `VITE_MICROSOFT_CLIENT_ID` / `VITE_MICROSOFT_TENANT_ID` / `VITE_MICROSOFT_REDIRECT_URI` | MSAL config for the Microsoft login button | Required when `VITE_AUTH_PROVIDER=microsoft` |

App startup validates this configuration (`src/lib/env.ts`) and refuses to render at all if the
combination is unsafe (e.g. `devstub` + production) rather than silently falling back to
something insecure. Never put real secrets in a `VITE_*` variable — everything with that prefix
is bundled into the client-side JS and is publicly readable.

## Auth model

- Students log in via Microsoft OAuth/OIDC (`VITE_AUTH_PROVIDER=microsoft`). Role, `clubId`, and
  profile data always come from the backend session (`GET /auth/me`) — the frontend never lets a
  user pick their own role.
- The session cache (`src/state/authSession.ts`) is an in-memory mirror of the authenticated
  profile, not the JWT itself. The JWT lives only in an HttpOnly cookie the frontend cannot read;
  nothing auth-related is ever written to `localStorage`/`sessionStorage`.
- **Organizer and Super Admin accounts have no password mechanism on the backend today.** The
  "Admin / Ban tổ chức" section of the login page is permanently disabled with an explanation —
  it does not send fake credentials anywhere. See
  [backend/docs/BACKEND_SECURITY_REQUIREMENTS.md](../backend/docs/BACKEND_SECURITY_REQUIREMENTS.md) item 1.

## Demo mode

Setting `VITE_USE_DEMO_DATA=true` makes every service layer serve fixture data from `src/data/`
instead of calling the real API — useful for offline UI walkthroughs. Pages that show demo data
render a visible "Dữ liệu demo" badge so it's never mistaken for production data. **Never enable
this in a production deployment** — the app will show a persistent warning banner if it detects
`VITE_APP_ENV=production` with demo data or mock fallback turned on.

## Production safety

- `npm run build` with the default `.env.example` values produces a bundle with no DevStub UI, no
  demo data, and no mock fallback — verified in CI (see below).
- Setting `VITE_AUTH_PROVIDER=devstub` together with `VITE_APP_ENV=production` (or building with
  Vite's own production mode) makes the app refuse to render at all, showing a configuration-error
  screen instead.

## Testing

```bash
npm run test        # vitest run (CI mode, single pass)
npm run test:watch  # vitest in watch mode
```

Test stack: Vitest + React Testing Library + jsdom. Coverage focuses on auth/route-guard behavior,
the API client's CSRF/credentials handling, the "no silent mock fallback on API error" contract,
and the Super Admin pages that are honest about missing backend APIs.

## Design system & motion

Design tokens live as CSS custom properties in `src/index.css` (`@theme` block): brand/secondary/accent
colors, semantic status tokens (`--color-success-*`, `--color-warning-*`, `--color-danger-*`, `--color-info-*`),
surface/border/text tokens, and motion tokens (`--ease-premium`, `--motion-fast/base/slow`). Components consume
these tokens (e.g. `bg-success-50`, `text-danger-600`) instead of hard-coding raw palette colours.

Shared building blocks:
- `PageHeader` — breadcrumb + title + description + actions, used across Student/Organizer/Super Admin routes.
- `Breadcrumb`, `EmptyState`, `BackendPendingNotice`, `DemoDataBadge`, `StatisticCard`, `EventCard`, `TicketCard`,
  `QRDisplayCard` — all theme-token driven.

Motion primitives (`src/hooks/`):
- `useCardTilt` — pointer-driven 3D tilt + spotlight written to CSS variables (no per-pixel React re-render);
  auto-disabled on touch devices and under `prefers-reduced-motion`.
- `useCountUp` — KPI count-up on scroll-into-view via IntersectionObserver + rAF; snaps to final value under
  reduced motion.

Per-route page transitions come from keying the layout content by `location.pathname` so the `.page-enter`
animation re-triggers on navigation. All non-essential animation is disabled under
`@media (prefers-reduced-motion: reduce)`.

## Build & lint

```bash
npm run lint       # oxlint
npm run typecheck  # tsc -b --pretty false
npm run build       # tsc -b && vite build
```

CI (`.github/workflows/ci.yml`, job `frontend`) runs `npm ci`, lint, test, build, a non-blocking
`npm audit`, and two guard checks: no real `.env` file committed, and no DevStub/demo-account
strings in the production bundle.

## Known backend limitations

The following are **not frontend bugs** — the frontend is deliberately showing an honest "waiting
on backend" state instead of fabricating data. Full detail in
[backend/docs/BACKEND_SECURITY_REQUIREMENTS.md](../backend/docs/BACKEND_SECURITY_REQUIREMENTS.md):

- Organizer/Super Admin accounts have no password or invite mechanism — the create-organizer form and the
  internal login form are disabled by design.
- Backend analytics and audit-log APIs now exist, but some frontend administration/report pages still need a
  dedicated integration pass before they can replace their pending/demo states.
- `EventResponse`/`ReservationResponse` don't include a club display name or a student display
  name — those fields render as a neutral placeholder rather than a fabricated value.
- No endpoint exists for a student to re-fetch a lost ticket QR, or for a signed ticket QR to be
  rendered as an actual scannable image on the frontend (the raw signed payload is shown as text
  when the backend does provide one, since no QR-rendering library is wired up).
