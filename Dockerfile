FROM node:20-slim

# better-sqlite3 needs build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Build the Vite frontend
RUN npm run build

# Create data & uploads dirs (Railway volumes mount over these)
RUN mkdir -p /app/data /app/uploads

EXPOSE 3002

# Push DB schema, seed data, then start server
CMD ["sh", "-c", "npm run db:push && npm run db:seed && npm run start"]
