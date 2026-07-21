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
