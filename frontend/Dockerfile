FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build

WORKDIR /app

# No VITE_* build argument, deliberately. Every value comes from frontend/.env.production, which is
# tracked in Git and copied in with the source below, so this commit and this bundle correspond one
# to one. A build argument here would be a way for the same commit to produce a different bundle
# depending on who ran the build -- the thing H10 exists to prevent. Development builds use
# Dockerfile.dev, which has its own arguments and never reads .env.production.

COPY package*.json ./
RUN npm ci

COPY . .
# build:production fails the image build if test or mock code reached the bundle.
RUN npm run build:production

# Unprivileged variant: the stock nginx image runs its master process as root, which Trivy flags
# High. This one runs as uid 101 and writes its pid and caches under /tmp, so no root is needed at
# any point. Consequence: it can only bind an unprivileged port, hence 8080 everywhere below.
FROM nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6 AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
