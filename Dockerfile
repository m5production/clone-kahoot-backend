FROM node:26-alpine AS base

FROM base AS deps
WORKDIR /app
# node:26 ships neither yarn nor corepack
RUN npm install -g yarn@1.22.22
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=false

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
RUN npm install -g yarn@1.22.22
COPY package.json yarn.lock tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
RUN yarn prisma generate && yarn build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY package.json ./
USER app
EXPOSE 3000

CMD ["node", "dist/main.js"]
