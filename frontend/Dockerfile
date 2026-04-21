# DEPLOY_MODE=compose → proxy /api vers le service Docker « api ».
# DEPLOY_MODE=standalone → SPA uniquement ; définir VITE_API_BASE vers l’URL publique de l’API.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
ARG VITE_API_BASE=
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

FROM nginx:1.27-alpine
ARG DEPLOY_MODE=compose
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx-${DEPLOY_MODE}.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
