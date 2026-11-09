# ==============================================================================
# VISTAAR Super Admin — Gateway BFF Production Container
# Target: Hardened, production-ready containerized service
# Base: Node.js 20 Alpine Linux (Minimal Attack Surface)
# ==============================================================================

FROM node:20-alpine AS base

# Install security updates and dumb-init for proper signal forwarding
RUN apk update && apk upgrade && apk add --no-cache dumb-init wget && rm -rf /var/cache/apk/*

WORKDIR /app

# Set production environment flags
ENV NODE_ENV=production
ENV PORT=3002

# Copy package manifests
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# Copy gateway service source code
COPY server/ ./server/

# Enforce least privilege: Run as unprivileged node user
USER node

# Expose Gateway BFF HTTP port
EXPOSE 3002

# Health check probe against public health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT:-3002}/health || exit 1

# Launch Gateway BFF under PID 1 init wrapper for graceful SIGTERM/SIGINT handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server/gateway.mjs"]

