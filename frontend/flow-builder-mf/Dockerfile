FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY frontend/flow-builder-mf frontend/flow-builder-mf
WORKDIR /app/frontend/flow-builder-mf
RUN npm install
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/frontend/flow-builder-mf/dist /usr/share/nginx/html

