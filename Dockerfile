FROM node:26-alpine AS base
# node:26 ships neither yarn nor corepack
RUN npm install -g yarn@1.22.22

FROM base AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=false

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json yarn.lock tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
RUN DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder yarn prisma generate && yarn build

FROM base AS prod-deps
WORKDIR /app
COPY package.json yarn.lock ./
# scripts are skipped on purpose: the only dependency that needs a
# postinstall is @prisma/client, and its generated output is copied
# from the builder stage below
RUN yarn install --frozen-lockfile --production --ignore-scripts

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY package.json ./
USER app
EXPOSE 3000

CMD ["node", "dist/main.js"]
