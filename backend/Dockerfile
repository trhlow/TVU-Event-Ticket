# syntax=docker/dockerfile:1.7
FROM maven:3.9.16-eclipse-temurin-25@sha256:7e461cec477077c1d9e50b13df8aef9018764410f4c4cd7c34803f10c4c99e4c AS build
WORKDIR /workspace
COPY . .
# -Pprod keeps application-dev.yml (default bootstrap admin, demo-otp block) out of the
# packaged jar. Local `mvn package` without the profile still gets it, so dev is unaffected.
RUN --mount=type=cache,target=/root/.m2 mvn -B -Pprod -pl monolith -am -Dmaven.test.skip=true package

# Digest bumped 2026-08-15 to the digest the 25-jre tag currently points at. Bumping alone no longer
# clears the scan: /usr/bin/pebble is back with 2 HIGH-with-fix Go stdlib CVEs (CVE-2026-39821,
# CVE-2026-46600, stdlib v1.26.5 -> 1.26.6), and the current tag carries exactly the same two. Waiting
# for Canonical to rebuild pebble is not a plan, so the binary is removed below instead. Nothing in
# this repository's own code or dependencies is involved in either finding.
FROM eclipse-temurin:25-jre@sha256:a214efa3200af4b657e41935799aa12d7aee3336fdb42eb505a0948f6ecdd983
ENV JAVA_TOOL_OPTIONS="-XX:+UseSerialGC -Xss512k -XX:MaxRAMPercentage=70.0"
# SPRING_MAIN_LAZY_INITIALIZATION is deliberately NOT set. It defers bean creation to first use, which
# also defers every startup guard -- the production secret and Microsoft tenant checks would no longer
# fail the deploy, they would fail the first user's login while the healthcheck reported UP.
WORKDIR /app
COPY --from=build /workspace/monolith/target/monolith-0.0.1-SNAPSHOT.jar app.jar
# Run unprivileged: the container sits on the internal network with credentialed reach to Postgres,
# Redis and RabbitMQ, so a dependency-level RCE should not also start as uid 0.
# pebble is Canonical's service manager, dropped into the Ubuntu 26.04 base as a standalone binary
# (no dpkg package owns it). This image's ENTRYPOINT is java directly, so it is never executed --
# deleting it removes the vulnerable code itself rather than suppressing the finding, which is why
# this is a fix and not an entry in vulnerability-ignore.yaml. Verified on this exact base digest
# before committing: `trivy image --severity HIGH,CRITICAL --ignore-unfixed` reports 0 with the
# binary gone against 2 with it present, and `java -version` still runs.
RUN rm -f /usr/bin/pebble \
    && useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app \
    && chown app:app /app/app.jar
USER 10001
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
