FROM node:24-alpine AS build

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

FROM nginx:1.29-alpine AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
