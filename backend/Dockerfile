# syntax=docker/dockerfile:1.7
ARG MODULE

FROM maven:3.9.16-eclipse-temurin-25 AS build
ARG MODULE
WORKDIR /workspace
COPY . .
RUN --mount=type=cache,target=/root/.m2 mvn -B -pl ${MODULE} -am -Dmaven.test.skip=true package

FROM eclipse-temurin:25-jre
ARG MODULE
ENV JAVA_TOOL_OPTIONS="-XX:+UseSerialGC -Xss512k -XX:MaxRAMPercentage=70.0"
ENV SPRING_MAIN_LAZY_INITIALIZATION=true
WORKDIR /app
COPY --from=build /workspace/${MODULE}/target/${MODULE}-0.0.1-SNAPSHOT.jar app.jar
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
