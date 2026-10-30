FROM node:24.16.0-alpine3.24

WORKDIR /app

COPY api/package*.json ./
COPY api/tsconfig*.json ./
COPY api/jest.config.js ./
COPY api/prisma ./prisma
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm ci --no-audit --no-fund

COPY api/src ./src
RUN chown -R node:node /app

USER node

EXPOSE 43001

CMD ["sh", "-c", "npx prisma generate && npm run db:seed && npm run dev"]
