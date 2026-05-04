FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY libs libs
COPY services/flow-service services/flow-service
WORKDIR /app/services/flow-service
RUN npm install
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/services/flow-service/node_modules node_modules
COPY --from=build /app/services/flow-service/dist dist
EXPOSE 4002
CMD ["node", "dist/main.js"]

