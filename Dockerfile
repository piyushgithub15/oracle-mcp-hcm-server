# ──────────── Builder Stage ────────────
FROM node:22.12-alpine AS builder
WORKDIR /app

# 1) Copy package manifest and tsconfig
COPY package*.json tsconfig.json ./

# 2) Install all deps without running lifecycle scripts
RUN npm ci --ignore-scripts

# 3) Copy the rest of your source files
COPY . .

# 4) Compile TypeScript into dist/
RUN npx tsc

# 5) Mark compiled JS as executable
RUN chmod +x dist/*.js

# 6) Remove devDependencies, leaving only production deps
RUN npm prune --production

# ──────────── Release Stage ────────────
FROM node:22-alpine AS release
WORKDIR /app

# 1) Copy production dependencies
COPY --from=builder /app/node_modules ./node_modules

# 2) Copy compiled output
COPY --from=builder /app/dist ./dist

# 3) Copy package metadata (optional)
COPY --from=builder /app/package*.json ./

ENV NODE_ENV=production
EXPOSE 3001

# 4) Start the server
CMD ["node", "dist/index.js"]