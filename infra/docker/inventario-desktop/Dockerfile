FROM node:24.16.0-alpine3.24 AS build

WORKDIR /app

COPY desktop/package*.json ./
RUN npm ci

COPY desktop/index.html ./
COPY desktop/tsconfig.json ./
COPY desktop/vite.config.ts ./
COPY desktop/src ./src

RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY desktop/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
