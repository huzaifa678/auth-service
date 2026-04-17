FROM node:22 AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile
FROM node:22 AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm exec prisma generate
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/index.js ./index.js
COPY --from=build /app/logger.js ./logger.js
COPY --from=build /app/tracing.js ./tracing.js
COPY --from=build /app/package.json ./package.json

USER appuser

EXPOSE 8080
EXPOSE 4001

CMD ["node", "index.js"]
