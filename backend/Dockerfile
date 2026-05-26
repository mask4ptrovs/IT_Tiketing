# ─────────────────────────────
# Build stage
# ─────────────────────────────
FROM node:20-slim AS builder

# Install OpenSSL (required by Prisma)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

# ─────────────────────────────
# Production stage
# ─────────────────────────────
FROM node:20-slim AS production

# Install OpenSSL
RUN apt-get update -y && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN mkdir -p uploads logs

EXPOSE 5000

# Push schema to DB then start server
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/server.js"]
