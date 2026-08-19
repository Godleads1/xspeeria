Write-Host "XSPEERIA STOP GATE: verify tests, security review, documentation, and unresolved blockers before declaring completion." -ForegroundColor Cyan
if (Test-Path .env) { Write-Host "WARNING: verify .env is gitignored and never committed." -ForegroundColor Yellow }
