#!/bin/bash
# Exit immediately if any command exits with a non-zero status
set -e

echo "========================================="
echo "🔍 Running pre-push verification checks..."
echo "========================================="

echo "Step 1: Running TypeScript verification..."
npx tsc --noEmit

echo "Step 2: Running Next.js build verification..."
npm run build

echo "========================================="
echo "✅ All checks passed successfully! Safe to push."
echo "========================================="
