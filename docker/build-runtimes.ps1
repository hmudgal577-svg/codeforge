# ============================================
# CodeForge — Build All Runtime Images (Windows)
# ============================================
# Usage: .\docker\build-runtimes.ps1

$ErrorActionPreference = "Continue"
$prefix = "codeforge-runtime"
$runtimesDir = Join-Path $PSScriptRoot "runtimes"

$languages = @(
    "python", "node", "cpp", "java", "go", "rust",
    "ruby", "php", "perl", "r", "dart", "kotlin",
    "swift", "scala", "csharp", "lua", "bash", "powershell"
)

Write-Host "`n🔨 Building CodeForge Runtime Images..." -ForegroundColor Cyan
Write-Host "=========================================`n"

$success = @()
$failed = @()

foreach ($lang in $languages) {
    $dir = Join-Path $runtimesDir $lang
    $dockerfile = Join-Path $dir "Dockerfile"

    if (Test-Path $dockerfile) {
        Write-Host "📦 Building ${prefix}-${lang}..." -ForegroundColor Yellow
        docker build -t "${prefix}-${lang}" "$dir" --quiet 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ ${prefix}-${lang} built successfully" -ForegroundColor Green
            $success += $lang
        } else {
            Write-Host "   ❌ ${prefix}-${lang} FAILED" -ForegroundColor Red
            $failed += $lang
        }
    } else {
        Write-Host "⚠️  Skipping $lang — no Dockerfile" -ForegroundColor DarkYellow
    }
}

Write-Host "`n========================================="
Write-Host "✅ Success: $($success.Count) images" -ForegroundColor Green
$success | ForEach-Object { Write-Host "   • $_" }

if ($failed.Count -gt 0) {
    Write-Host "❌ Failed: $($failed.Count) images" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "   • $_" }
}

Write-Host "`n🚀 Done! Run: docker images | Select-String codeforge-runtime"
