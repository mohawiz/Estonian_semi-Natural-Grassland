# Multi-stage build: Node builds the static site, nginx serves it.
#   docker build -t grassland-assistant .
#   docker run --rm -p 8080:80 grassland-assistant   →  http://localhost:8080
# Serve under a sub-path with: docker build --build-arg BASE_PATH=/grassland/ ...
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG BASE_PATH=/
ENV BASE_PATH=$BASE_PATH
RUN npm test && npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
