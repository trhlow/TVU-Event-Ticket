# Production operations

## Health and readiness

- Use `/actuator/health/liveness` to determine whether the JVM should be restarted.
- Use `/actuator/health/readiness` before adding an instance to traffic. It requires PostgreSQL, Redis, and RabbitMQ.
- Prometheus is exposed at `/actuator/prometheus` only inside the application network. Do not route it through Caddy's public virtual host.

## Notification failures

1. Check the `notification.messages.dlq` metric and the RabbitMQ dead-letter queue.
2. Confirm the message uses the exact `reservation.approved` contract fields.
3. Correct the root cause before replaying a message. A replay with the same message ID is idempotent after a successful delivery.
4. For a transient SMTP issue, let the listener retry according to the configured backoff before replaying manually.

## Delivery semantics, stated exactly

Do not describe ticket email delivery as "at-least-once" without qualification, and never as
exactly-once. The two paths differ:

- **Failures proven to precede the message body** (compose error, authentication rejected, connect
  failure, recipient refused): **at-least-once**. These are retried and can produce a duplicate.
- **Ambiguous outcomes** (a timeout or reset once the body was already in flight, or a worker killed
  mid-send): **not retried at all**, so the email **may never have been delivered**. This is a
  deliberate trade: a duplicate ticket is worse than a delayed one, and only a person can tell the
  two apart.

That second case is a real gap, and it is only acceptable because someone is watching it.

### UNKNOWN reconciliation — who, how often, what to do

`notification_delivery_ledger` rows sitting at `UNKNOWN` are emails whose fate nobody knows. Nothing
automatic will ever resolve them.

- **Alerts.** `notification_ledger_unknown_current > 0` is the backlog gauge; it reads the database,
  so it survives a restart and clears itself once the rows are dealt with.
  `increase(notification_ledger_unknown_total[5m]) > 0` catches new ones arriving while an older
  backlog is still being worked through.
- **Who.** The operator on duty for the event. On a day with an event running, that must be a named
  person, not "whoever notices".
- **How often.** Within **1 hour** on an event day, and at least **once a day** otherwise. A ticket
  email that arrives after the event has started is no better than one that never arrived.
- **What to do**, per row:
  1. Take `message_id`, `started_at` and `last_error` from the ledger.
  2. Search the SMTP provider's log for a message to that student around `started_at`.
  3. **Found** → the email went out. Mark the row `DELIVERED` and note who checked and when.
  4. **Not found** → it did not. Mark the row `FAILED`; the message is then eligible to be sent
     again, and the student gets their ticket.
  5. **Provider logs unavailable or inconclusive** → contact the student directly. Do not guess:
     marking it `DELIVERED` on a hunch means someone silently never receives a ticket.
- **Always record the decision** — who, when, and on what evidence. This is the audit trail for a
  ticket that may or may not exist.

```sql
-- The working queue.
SELECT message_id, started_at, attempt_no, last_error
  FROM notification_delivery_ledger
 WHERE status = 'UNKNOWN'
 ORDER BY started_at;
```

## Backup and restore

1. Run `infra/production/scripts/backup-postgres.sh` from the production host and store the encrypted output outside the host.
2. Test restore in an isolated database using `restore-postgres-into-new-stack.sh` at least quarterly.
3. Record the restore time and data age; treat an untested backup as unavailable.

## Base image digests — who bumps them, and when

Every third-party image in `infra/production/compose.yaml` and both Dockerfiles is pinned by
digest, and every GitHub Action is pinned by commit SHA. Pinning is what makes a rollback land on
the bytes that were tested; it also means **nothing picks up a security patch on its own**. A pin
left alone is a CVE waiting to be inherited.

**Owner:** the repository maintainer. This is not shared or implicit — if no one holds it, the
digests rot.

**Cadence:** review digests and outstanding CVEs at least monthly, and again before every
production release. Critical or High severity advisories against a pinned image are assessed as
soon as they are known, not at the next monthly window.

**Procedure for a bump:**

1. Resolve the new digest for the intended tag (`docker manifest inspect <image>:<tag>`). Pin the
   multi-platform index digest, not a per-architecture one — production is `linux/amd64` but
   development machines are not always.
2. `docker pull` the new digest and run the service standalone; check it with the same command
   its Compose healthcheck uses.
3. Run the affected test suite, then let CI run in full.
4. Commit with both versions in the message — the old digest and the new one, plus the upstream
   version each resolves to. A digest alone is unreadable six months later.

## Incident checklist

1. Check readiness, error rate, database pool saturation, Redis availability, RabbitMQ consumers, and DLQ depth.
2. Preserve logs and correlation data before restart.
3. Use graceful shutdown; do not kill an instance while an outbox relay or notification consumer is processing without first checking retry/DLQ state.

## Restoring a locked-out super admin

**Scope: a wrong account or a wrong mailbox. Not an SMTP outage.** The procedure below ends
with "request a code for that address", so it only works while mail is being delivered. If the
SMTP provider itself is down, pointing the account at a different mailbox changes nothing —
nobody receives the code either way. That case needs the standby path in H14 (a second,
already-tested SMTP provider, or an out-of-band one-time recovery code); there is no other way
out, and this SQL is not it.

Admin sign-in is passwordless: a super admin proves who they are by receiving a code at their
configured address. If every bootstrap address in `BOOTSTRAP_ADMIN_EMAIL` is unreachable —
a typo, a mailbox that was closed — no one can sign in, and no other account has the rights to
fix it. The only requirement for recovery is an address that receives mail; there is no
password to reset.

Point an existing super admin at a mailbox you can read:

```sql
UPDATE users
   SET email = 'reachable@example.com', status = 'ACTIVE'
 WHERE role = 'SUPER_ADMIN';
```

Or create one from nothing:

```sql
INSERT INTO users (id, ext_subject, email, display_name, role, status, auth_method,
                   mssv_status, version, created_at, updated_at)
VALUES (gen_random_uuid(), NULL, 'reachable@example.com', 'Recovery Admin',
        'SUPER_ADMIN', 'ACTIVE', 'EMAIL_OTP', 'UNVERIFIED', 0, now(), now());
```

Then request a code for that address through the normal admin sign-in. Rehearse this against
the production database before the auth migration ships — a runbook nobody has executed is not
a recovery plan.

## SMTP outage — the case the SQL above cannot fix

If the mail provider is down, every admin is locked out and no database change helps: whatever
account you point at whatever mailbox, the code still has to travel through the provider that is
not working.

1. Confirm it really is the provider. `curl -fsS https://DOMAIN/actuator/health` reports mail
   status; the monolith logs show the actual SMTP error. A DNS failure or blocked egress from the
   VPS looks identical from the outside and is fixed differently.
2. Fail over to the standby provider:

   ```bash
   cd /srv/tvu-event-ticket/backend/infra/production
   bash scripts/failover-smtp.sh
   ```

3. Prove it: request an admin code, confirm the mail arrives, sign in. Health reporting `UP` only
   means a connection succeeded, not that anything was delivered.
4. When the primary recovers: `bash scripts/failover-smtp.sh --restore`.

⛔ **This only works if it was set up and rehearsed in advance.** The standby credentials are
commented out in `.env` by default. An untested standby is not a recovery path — SPF and DKIM are
configured per provider, so a standby whose sender address was never authorised will connect
successfully and have its mail silently dropped as spam, which looks like success from the server.

**Rehearsal, required before cutover:** switch to standby, receive a real code at a real bootstrap
mailbox, sign in, switch back. Record the date and who did it.
