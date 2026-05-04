FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY libs libs
COPY services/user-service services/user-service
WORKDIR /app/services/user-service
RUN npm install
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/services/user-service/node_modules node_modules
COPY --from=build /app/services/user-service/dist dist
EXPOSE 4001
CMD ["node", "dist/main.js"]

