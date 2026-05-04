FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY frontend/shell-app frontend/shell-app
WORKDIR /app/frontend/shell-app
RUN npm install
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/frontend/shell-app/dist /usr/share/nginx/html

