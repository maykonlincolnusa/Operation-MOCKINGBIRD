FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY libs/database libs/database
COPY services/auth-service services/auth-service
WORKDIR /app/services/auth-service
RUN npm install
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/services/auth-service/node_modules node_modules
COPY --from=build /app/services/auth-service/dist dist
EXPOSE 4000
CMD ["node", "dist/main.js"]

