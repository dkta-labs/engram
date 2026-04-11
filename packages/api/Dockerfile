FROM node:22-slim AS builder

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
RUN npm run build

FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY public ./public

# Run as non-root
RUN addgroup --system --gid 1001 engram && \
    adduser --system --uid 1001 --ingroup engram engram && \
    chown -R engram:engram /app

USER engram

EXPOSE 3000

CMD ["node", "dist/index.js"]
