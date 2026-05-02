# syntax=docker/dockerfile:1

FROM oven/bun:1 AS base

WORKDIR /app
EXPOSE 3000

FROM base AS deps

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS prod-deps

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM deps AS development

ENV NODE_ENV=development

COPY . .

CMD ["bun", "run", "dev"]

FROM base AS production

ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
COPY public ./public

RUN chown -R bun:bun /app

USER bun

CMD ["bun", "run", "start"]
