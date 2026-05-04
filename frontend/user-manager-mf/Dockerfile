FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY frontend/user-manager-mf frontend/user-manager-mf
WORKDIR /app/frontend/user-manager-mf
RUN npm install
RUN npm run build
FROM nginx:1.27-alpine
COPY --from=build /app/frontend/user-manager-mf/dist /usr/share/nginx/html

