FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY libs libs
COPY services/campaign-service services/campaign-service
WORKDIR /app/services/campaign-service
RUN npm install
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/services/campaign-service/node_modules node_modules
COPY --from=build /app/services/campaign-service/dist dist
EXPOSE 4004
CMD ["node", "dist/main.js"]

