$ErrorActionPreference = "Stop"
$dirs = @(".claude",".claude\skills",".claude\agents",".claude\hooks",".claude\workflows")
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
if (-not (Test-Path ".gitignore")) { New-Item -ItemType File ".gitignore" | Out-Null }
$entries = @(".env",".env.local",".env.*.local",".claude/settings.local.json")
$existing = Get-Content ".gitignore" -ErrorAction SilentlyContinue
foreach ($e in $entries) { if ($existing -notcontains $e) { Add-Content ".gitignore" $e } }
Write-Host "Xspeeria Claude Engineering System V1 installed." -ForegroundColor Green
Write-Host "Restart/reload Claude Code, then run /xspeeria-audit." -ForegroundColor Cyan
