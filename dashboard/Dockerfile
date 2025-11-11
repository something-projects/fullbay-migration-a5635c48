# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

WORKDIR /app/dashboard

# Use npm install (not ci) to correctly resolve platform-specific optional deps like rollup
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .

# Use Vite dev server so that vite.config.ts middleware (/api/*) is available
ENV NODE_ENV=development \
    TRANSFORMER_BASE_URL=http://transformer:3001

# Shared output for reading generated files
VOLUME ["/app/output"]

EXPOSE 3002

CMD ["npm","run","dev","--","--host","0.0.0.0","--port","3002","--strictPort"]
