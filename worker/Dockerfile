FROM mcr.microsoft.com/playwright:v1.51.1-jammy

WORKDIR /app

ENV NODE_ENV=production
ENV HEADLESS=true
ENV POLL_MS=15000

COPY package.json ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src

CMD ["npx", "tsx", "src/index.ts"]
