FROM node:16-bullseye

RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice unoconv fonts-dejavu \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "app.js"]
