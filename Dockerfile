# Multi-stage build: Node builds the static site, nginx serves it.
#   docker build -t grassland-assistant .
#   docker run --rm -p 8080:80 grassland-assistant   →  http://localhost:8080
# Serve under a sub-path with: docker build --build-arg BASE_PATH=/grassland/ ...
# Use the AI assistant with:    docker build --build-arg VITE_ASSISTANT_API_URL=https://api.example ...
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG BASE_PATH=/
ENV BASE_PATH=$BASE_PATH
# URL of the RAG backend (backend/); leave empty for keyword search only
ARG VITE_ASSISTANT_API_URL=
ENV VITE_ASSISTANT_API_URL=$VITE_ASSISTANT_API_URL
RUN npm test && npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
