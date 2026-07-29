FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build

WORKDIR /app

# Only per-environment values are build arguments. VITE_APP_ENV and VITE_AUTH_PROVIDER
# live in frontend/.env.production so this image, CI and a manual build cannot disagree
# about what "production" means.
ARG VITE_API_BASE_URL
ARG VITE_MICROSOFT_CLIENT_ID
ARG VITE_MICROSOFT_TENANT_ID
ARG VITE_MICROSOFT_REDIRECT_URI

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_MICROSOFT_CLIENT_ID=${VITE_MICROSOFT_CLIENT_ID}
ENV VITE_MICROSOFT_TENANT_ID=${VITE_MICROSOFT_TENANT_ID}
ENV VITE_MICROSOFT_REDIRECT_URI=${VITE_MICROSOFT_REDIRECT_URI}

COPY package*.json ./
RUN npm ci

COPY . .
# build:production fails the image build if any fixture data reached the bundle.
RUN npm run build:production

# Unprivileged variant: the stock nginx image runs its master process as root, which Trivy flags
# High. This one runs as uid 101 and writes its pid and caches under /tmp, so no root is needed at
# any point. Consequence: it can only bind an unprivileged port, hence 8080 everywhere below.
FROM nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6 AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
