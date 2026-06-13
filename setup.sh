#!/bin/bash
# Credit Limit Manager - Setup Script
# Run this script from the project root: bash setup.sh

set -e

echo "====================================="
echo "  Credit Limit Manager - Setup"
echo "====================================="
echo ""

# Check Node version
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
  echo "ERROR: Node.js 18+ is required. Current version: $(node -v 2>/dev/null || 'not installed')"
  exit 1
fi

echo "✓ Node.js $(node -v)"

# Install root dependencies
echo ""
echo "Installing root dependencies..."
npm install --legacy-peer-deps

# Generate Prisma client
echo ""
echo "Generating Prisma client..."
npx prisma generate

# Run database migrations
echo ""
echo "Running database migrations..."
npx prisma migrate deploy

echo ""
echo "====================================="
echo "  Setup Complete!"
echo "====================================="
echo ""
echo "To start the development server, run:"
echo "  shopify app dev"
echo ""
echo "Or with npm:"
echo "  npm run dev"
echo ""
echo "Make sure you have the Shopify CLI installed:"
echo "  npm install -g @shopify/cli"
echo ""
