FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY frontend/analytics-dashboard-mf frontend/analytics-dashboard-mf
WORKDIR /app/frontend/analytics-dashboard-mf
RUN npm install
RUN npm run build
FROM nginx:1.27-alpine
COPY --from=build /app/frontend/analytics-dashboard-mf/dist /usr/share/nginx/html

