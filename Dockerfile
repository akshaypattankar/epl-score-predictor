# ==========================================
# Stage 1: Build stage
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package metadata and install dependencies
COPY package*.json ./
RUN npm install

# Copy full application code and build
COPY . .
RUN npm run build

# ==========================================
# Stage 2: Production Nginx stage (Default)
# ==========================================
FROM nginx:alpine AS production

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled assets from build stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# ==========================================
# Stage 3: Development stage (Vite dev server)
# ==========================================
FROM node:20-alpine AS development

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Ensure dependencies are installed on volume mount before launching Vite
CMD ["sh", "-c", "npm install && npm run dev -- --host 0.0.0.0"]
