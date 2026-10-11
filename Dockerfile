FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV DB_PATH=/data/data.db PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["npm", "start"]
