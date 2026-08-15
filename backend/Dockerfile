# syntax=docker/dockerfile:1.7
FROM maven:3.9.16-eclipse-temurin-25@sha256:7e461cec477077c1d9e50b13df8aef9018764410f4c4cd7c34803f10c4c99e4c AS build
WORKDIR /workspace
COPY . .
# -Pprod keeps application-dev.yml (default bootstrap admin, demo-otp block) out of the
# packaged jar. Local `mvn package` without the profile still gets it, so dev is unaffected.
RUN --mount=type=cache,target=/root/.m2 mvn -B -Pprod -pl monolith -am -Dmaven.test.skip=true package

# Digest bumped 2026-08-12, same 25-jre tag. The previous digest carried a /usr/bin/pebble built
# against golang.org/x/net 0.40.0 and Go stdlib 1.26.4, which the publish pipeline's own trivy scan
# flagged as 5 HIGH-with-fix and correctly refused to publish on. Verified before committing:
# `trivy image --severity HIGH,CRITICAL` on this exact digest reports 0 findings with a fix
# available, against 5 on the old one. Nothing in this repository's own code or dependencies was
# involved -- the tag had moved, the digest had not.
FROM eclipse-temurin:25-jre@sha256:f19dbf0a22d0b3658fda48ce7d7181df05ad14bda151dd5ad12cc09d1451c70e
ENV JAVA_TOOL_OPTIONS="-XX:+UseSerialGC -Xss512k -XX:MaxRAMPercentage=70.0"
# SPRING_MAIN_LAZY_INITIALIZATION is deliberately NOT set. It defers bean creation to first use, which
# also defers every startup guard -- the production secret and Microsoft tenant checks would no longer
# fail the deploy, they would fail the first user's login while the healthcheck reported UP.
WORKDIR /app
COPY --from=build /workspace/monolith/target/monolith-0.0.1-SNAPSHOT.jar app.jar
# Run unprivileged: the container sits on the internal network with credentialed reach to Postgres,
# Redis and RabbitMQ, so a dependency-level RCE should not also start as uid 0.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app \
    && chown app:app /app/app.jar
USER 10001
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
