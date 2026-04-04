FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy source
COPY src/ ./src/
COPY .env* ./

# Create directories
RUN mkdir -p data logs auth_info

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:9090/health || exit 1

# Expose ports (health, whatsapp webhook, teams)
EXPOSE 9090 3000 3978

CMD ["node", "src/index.js"]
