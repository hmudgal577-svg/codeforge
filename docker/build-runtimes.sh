#!/bin/bash
# ============================================
# CodeForge — Build All Runtime Docker Images
# ============================================
# Usage: ./docker/build-runtimes.sh
# Builds all language runtime images for production.

set -e

RUNTIMES_DIR="$(cd "$(dirname "$0")/runtimes" && pwd)"
PREFIX="codeforge-runtime"

echo "🔨 Building CodeForge Runtime Images..."
echo "========================================="

LANGUAGES=(
  "python"
  "node"
  "cpp"
  "java"
  "go"
  "rust"
  "ruby"
  "php"
  "perl"
  "r"
  "dart"
  "kotlin"
  "swift"
  "scala"
  "csharp"
  "lua"
  "bash"
  "powershell"
)

FAILED=()
SUCCESS=()

for lang in "${LANGUAGES[@]}"; do
  dir="$RUNTIMES_DIR/$lang"
  if [ -d "$dir" ] && [ -f "$dir/Dockerfile" ]; then
    echo ""
    echo "📦 Building ${PREFIX}-${lang}..."
    if docker build -t "${PREFIX}-${lang}" "$dir" --quiet; then
      echo "   ✅ ${PREFIX}-${lang} built successfully"
      SUCCESS+=("$lang")
    else
      echo "   ❌ ${PREFIX}-${lang} FAILED"
      FAILED+=("$lang")
    fi
  else
    echo "⚠️  Skipping $lang — no Dockerfile found at $dir"
  fi
done

echo ""
echo "========================================="
echo "✅ Success: ${#SUCCESS[@]} images"
for s in "${SUCCESS[@]}"; do echo "   • $s"; done

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "❌ Failed: ${#FAILED[@]} images"
  for f in "${FAILED[@]}"; do echo "   • $f"; done
  exit 1
fi

echo ""
echo "🚀 All runtime images built! Ready for production."
echo "   Run: docker images | grep codeforge-runtime"
