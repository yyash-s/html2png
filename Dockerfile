FROM node:20-bullseye-slim

# Install required packages for headless Chromium
RUN apt-get update && apt-get install -y \
  ca-certificates fonts-liberation libasound2 libatk1.0-0 libatk-bridge2.0-0 \
  libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
  libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 \
  libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 \
  libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package.json

# Use npm install with modern flag and allow legacy peer deps to be safe during build
RUN npm install --omit=dev --legacy-peer-deps

COPY . .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]
