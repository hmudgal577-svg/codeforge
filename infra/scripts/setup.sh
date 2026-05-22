#!/bin/bash
# ============================================
# CodeForge — Setup Script
# ============================================
# Run: chmod +x scripts/setup.sh && ./scripts/setup.sh

set -e

echo "🚀 Setting up CodeForge..."

# Copy env file
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created .env from .env.example"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Start infrastructure
echo "🐳 Starting Docker services (PostgreSQL, Redis, RabbitMQ)..."
docker compose up -d

# Wait for services
echo "⏳ Waiting for services to be ready..."
sleep 5

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npm run db:generate

# Run migrations
echo "📊 Running database migrations..."
npm run db:push

# Build runtime images
echo "🏗️ Building sandbox runtime images..."
docker build -t codeforge-runtime-python ./docker/runtimes/python
docker build -t codeforge-runtime-node ./docker/runtimes/node
docker build -t codeforge-runtime-cpp ./docker/runtimes/cpp
docker build -t codeforge-runtime-java ./docker/runtimes/java

echo ""
echo "✅ CodeForge setup complete!"
echo ""
echo "Run the following to start development:"
echo "  npm run dev         # Start all services"
echo "  # or individually:"
echo "  cd apps/api-gateway && npm run dev"
echo "  cd apps/web && npm run dev"
echo ""
echo "📚 API docs: http://localhost:4000/api/docs"
echo "🌐 Frontend: http://localhost:3000"
echo "🐰 RabbitMQ: http://localhost:15672 (codeforge/codeforge_secret)"
