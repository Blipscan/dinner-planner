FROM node:18-alpine

WORKDIR /app/apps/api

COPY apps/api/package*.json ./
RUN npm install --omit=dev

COPY apps/api ./
COPY apps/web/public ../web/public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
