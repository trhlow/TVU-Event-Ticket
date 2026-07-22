# syntax=docker/dockerfile:1.7
FROM maven:3.9.16-eclipse-temurin-25 AS build
WORKDIR /workspace
COPY . .
RUN --mount=type=cache,target=/root/.m2 mvn -B -pl monolith -am -Dmaven.test.skip=true package

FROM eclipse-temurin:25-jre
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
