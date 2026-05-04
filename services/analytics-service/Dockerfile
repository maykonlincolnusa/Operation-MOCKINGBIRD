FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY libs libs
COPY services/analytics-service services/analytics-service
WORKDIR /app/services/analytics-service
RUN npm install
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/services/analytics-service/node_modules node_modules
COPY --from=build /app/services/analytics-service/dist dist
EXPOSE 4005
CMD ["node", "dist/main.js"]

