FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build


FROM nginx:alpine

RUN apk add --no-cache curl

# nginx's official image auto-substitutes ${VAR} placeholders from files in
# /etc/nginx/templates/*.template into /etc/nginx/conf.d/*.conf at container
# START (not build time), using envsubst -- this is what lets API_KEY be
# injected per-deployment instead of baked into the image.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD curl -f http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
