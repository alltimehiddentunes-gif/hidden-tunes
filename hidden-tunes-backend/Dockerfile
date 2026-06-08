FROM node:20-bookworm-slim

# ffmpeg + ffprobe for ultraLight/standard tier generation
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY routes ./routes
COPY services ./services
COPY scripts/check-audio-version-capabilities.mjs ./scripts/check-audio-version-capabilities.mjs

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node scripts/check-audio-version-capabilities.mjs --probe-only || exit 1

CMD ["npm", "start"]
