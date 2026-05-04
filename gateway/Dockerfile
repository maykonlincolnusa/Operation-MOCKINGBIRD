FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY gateway gateway
WORKDIR /app/gateway
RUN npm install
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/gateway/node_modules node_modules
COPY --from=build /app/gateway/dist dist
EXPOSE 8080
CMD ["node", "dist/index.js"]
