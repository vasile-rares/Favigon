# Build stage
FROM node:22-alpine AS build
WORKDIR /app
ARG USE_PRODUCTION_ENV_FILE=false
COPY package*.json ./
RUN npm ci
COPY . .

# For containerized production builds, optionally replace environment.ts.
RUN if [ "$USE_PRODUCTION_ENV_FILE" = "true" ] && [ -f src/environments/environment.production.ts ]; then \
			cp src/environments/environment.production.ts src/environments/environment.ts; \
		fi

RUN npm run build

# Runtime stage — serve static files via Nginx
FROM nginx:alpine AS final
COPY --from=build /app/dist/Frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
