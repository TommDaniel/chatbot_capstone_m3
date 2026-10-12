FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && mkdir -p .cache/models && chown -R node:node /app
USER node
EXPOSE 3001
CMD ["sh", "-c", "npm run db:setup && npm run index && npm start"]
