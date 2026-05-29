FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json requirements.txt ./
RUN npm install --omit=dev \
  && pip3 install --break-system-packages --no-cache-dir -r requirements.txt

COPY . .

ENV NODE_ENV=production
ENV PORT=4173
ENV PYTHON_PATH=python3

EXPOSE 4173

CMD ["npm", "start"]
