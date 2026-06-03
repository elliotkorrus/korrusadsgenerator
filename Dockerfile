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

# Push DB schema (best-effort, with timeout so a stalled drizzle-kit can't
# wedge the deploy), seed data, then start server. db:seed is idempotent;
# if a column truly is missing the seed/server will surface the error
# rather than the container silently never starting.
CMD ["sh", "-c", "timeout 90 npm run db:push || echo 'db:push timed out or failed — continuing'; npm run db:seed && npm run start"]
