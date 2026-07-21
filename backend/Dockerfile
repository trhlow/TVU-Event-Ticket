# syntax=docker/dockerfile:1.7
FROM maven:3.9.16-eclipse-temurin-25 AS build
WORKDIR /workspace
COPY . .
RUN --mount=type=cache,target=/root/.m2 mvn -B -pl monolith -am -Dmaven.test.skip=true package

FROM eclipse-temurin:25-jre
ENV JAVA_TOOL_OPTIONS="-XX:+UseSerialGC -Xss512k -XX:MaxRAMPercentage=70.0"
ENV SPRING_MAIN_LAZY_INITIALIZATION=true
WORKDIR /app
COPY --from=build /workspace/monolith/target/monolith-0.0.1-SNAPSHOT.jar app.jar
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
