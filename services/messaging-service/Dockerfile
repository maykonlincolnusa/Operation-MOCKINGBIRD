FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY libs libs
COPY services/messaging-service services/messaging-service
WORKDIR /app/services/messaging-service
RUN npm install
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/services/messaging-service/node_modules node_modules
COPY --from=build /app/services/messaging-service/dist dist
EXPOSE 4003
CMD ["node", "dist/main.js"]

