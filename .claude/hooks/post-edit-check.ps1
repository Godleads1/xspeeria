$ErrorActionPreference = "Continue"
if (Test-Path package.json) {
  if (Test-Path node_modules/.bin/eslint.cmd) { & .\node_modules\.bin\eslint.cmd . --max-warnings=0 }
  if (Test-Path node_modules/.bin\tsc.cmd) { & .\node_modules\.bin\tsc.cmd --noEmit }
}
