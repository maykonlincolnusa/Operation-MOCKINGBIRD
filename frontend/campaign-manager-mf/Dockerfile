FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY frontend/campaign-manager-mf frontend/campaign-manager-mf
WORKDIR /app/frontend/campaign-manager-mf
RUN npm install
RUN npm run build
FROM nginx:1.27-alpine
COPY --from=build /app/frontend/campaign-manager-mf/dist /usr/share/nginx/html

