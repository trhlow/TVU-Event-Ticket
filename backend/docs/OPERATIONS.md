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

## Backup and restore

1. Run `infra/production/scripts/backup-postgres.sh` from the production host and store the encrypted output outside the host.
2. Test restore in an isolated database using `restore-postgres.sh` at least quarterly.
3. Record the restore time and data age; treat an untested backup as unavailable.

## Incident checklist

1. Check readiness, error rate, database pool saturation, Redis availability, RabbitMQ consumers, and DLQ depth.
2. Preserve logs and correlation data before restart.
3. Use graceful shutdown; do not kill an instance while an outbox relay or notification consumer is processing without first checking retry/DLQ state.

## Restoring a locked-out super admin

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
