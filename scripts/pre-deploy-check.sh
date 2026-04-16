#!/bin/bash
set -euo pipefail

echo "🚀 Pre-deployment checks for youtube-pipeline..."

# ── Run tests ────────────────────────────────────────────────────────────────
echo ""
echo "📋 Running test suite..."
if npm test; then
  echo "✅ Tests passed"
else
  echo "❌ Tests failed — deployment blocked."
  exit 1
fi

# ── Check required files ─────────────────────────────────────────────────────
echo ""
echo "📁 Checking required files..."

FILES=(
  "index.html"
  "app.js"
  "styles.css"
  "render.js"
  "highlight.js"
  "thumbnail.js"
  ".env.example"
  "components/topics.js"
  "components/script.js"
  "components/clean-script.js"
  "components/heygen.js"
  "components/youtube.js"
  "components/distribute.js"
  "components/marketing.js"
  "components/history.js"
  "components/settings.js"
  "components/usage.js"
  "components/sheets.js"
  "components/email.js"
)

ALL_OK=true
for FILE in "${FILES[@]}"; do
  if [ -f "$FILE" ]; then
    echo "  ✅ $FILE"
  else
    echo "  ❌ Missing: $FILE"
    ALL_OK=false
  fi
done

if [ "$ALL_OK" = false ]; then
  echo ""
  echo "❌ One or more required files are missing. Fix before deploying."
  exit 1
fi

# ── Check .env ───────────────────────────────────────────────────────────────
echo ""
if [ ! -f ".env" ]; then
  echo "⚠️  Warning: .env file not found."
  echo "   Copy .env.example to .env and add your API keys before running locally."
else
  echo "✅ .env exists"
fi

# ── Check node_modules ───────────────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "⚠️  Warning: node_modules not found. Run 'npm install' before rendering."
else
  echo "✅ node_modules installed"
fi

echo ""
echo "✅ All pre-deployment checks passed!"
echo "   Safe to deploy 🚀"
