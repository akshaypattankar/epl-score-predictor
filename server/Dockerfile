FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-dejavu-core \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

ENV NODE_OPTIONS=--dns-result-order=ipv4first

CMD ["node", "server.js"]
