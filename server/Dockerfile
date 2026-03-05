FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src/ src/
COPY scripts/ scripts/
COPY knexfile.js ./
EXPOSE 3001
CMD ["node", "src/index.js"]
