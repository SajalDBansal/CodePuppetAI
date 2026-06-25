FROM oven/bun:1.3.14-slim AS prepare

WORKDIR /app
RUN bun add --global turbo@2.9.18
COPY . .
RUN turbo prune api --docker

FROM oven/bun:1.3.14-slim AS builder

WORKDIR /app
COPY --from=prepare /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=prepare /app/out/full/ .
RUN bun turbo build

FROM oven/bun:1.3.14-slim AS runtime

RUN groupadd --system --gid 1001 codeai && useradd --system --uid 1001 --gid codeai codeai
WORKDIR /app
COPY --chown=codeai:codeai --from=builder /app /app
USER codeai

ENV NODE_ENV=production
EXPOSE 3001

CMD ["sh", "-c", "cd packages/database && bunx --bun prisma migrate deploy && bun run db:seed && cd /app && bun apps/api/src/index.ts"]
