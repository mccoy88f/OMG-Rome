FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    python3 \
    python3-pip \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --no-cache-dir yt-dlp --break-system-packages

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3100

CMD ["npm", "start"]