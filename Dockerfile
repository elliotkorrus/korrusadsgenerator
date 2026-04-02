FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Build the Vite frontend
RUN npm run build

# Create uploads dir (Railway volumes mount over this)
RUN mkdir -p /app/uploads

EXPOSE 3002

# Push DB schema, seed data, then start server
CMD ["sh", "-c", "npm run db:push && npm run db:seed && npm run start"]
