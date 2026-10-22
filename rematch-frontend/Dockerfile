# Rematch frontend — static build served by nginx
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_MATCH_DATA_SOURCE=api
ARG VITE_API_BASE_URL=/api
ARG VITE_API_BEARER_TOKEN=
ENV VITE_MATCH_DATA_SOURCE=$VITE_MATCH_DATA_SOURCE \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_API_BEARER_TOKEN=$VITE_API_BEARER_TOKEN
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
