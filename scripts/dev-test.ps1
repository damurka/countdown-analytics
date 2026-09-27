<#
.SYNOPSIS
  Rapid local testing of the Countdown apps and AI in the DataSuite dev build -- no r-universe, no registry.

.DESCRIPTION
  Brings everything up to date from the local folders, rebuilding only what changed since the last run, then starts
  DataSuite with this extension loaded from source:

    1. R packages, in dependency order: datasuite.ui, cd2030.core, cd2030.rmncah, cd2030.vaxx, cd2030.pooled --
       each installed into your R library (devtools::install, quick, no dependencies: its Remotes would otherwise
       reinstall datasuite.ui / cd2030.core from GitHub over the local copies). The dev build loads packages from
       there (its own library, %APPDATA%\datasuite-dev\R\library, stays empty).
    2. countdown-analytics: npm run compile.
    3. The DataSuite assistant (datasuite/extensions/datasuite-assistant): npm run compile.
    4. DataSuite itself (datasuite/src): npm run transpile-client.
    5. Launch: datasuite/scripts/code.bat --extensionDevelopmentPath=<this extension> (VSCODE_SKIP_PRELAUNCH=1).

  "Changed" = the folder's git HEAD plus its uncommitted changes differ from the last successful run (stamps in
  %TEMP%\datasuite-dev-test). Use -Force to redo everything.

  Close the Shiny app tabs before installing: Windows won't replace a loaded package.

.EXAMPLE
  .\scripts\dev-test.ps1                      # rebuild what changed, launch with your usual dev profile
.EXAMPLE
  .\scripts\dev-test.ps1 -Fresh               # launch with an empty profile (a first install; you sign in again)
.EXAMPLE
  .\scripts\dev-test.ps1 -Only core,rmncah -NoLaunch -Test   # just reinstall those two and run their tests
.EXAMPLE
  .\scripts\dev-test.ps1 -Open C:\data\Tanzania_CAM2026.rds   # open a data file (or folder) on launch
#>
[CmdletBinding()]
param(
	# Limit the R packages to these (ui, core, rmncah, vaxx, pooled). Default: all, as far as they changed.
	[ValidateSet('ui', 'core', 'rmncah', 'vaxx', 'pooled')]
	[string[]] $Only,
	# Redo every step, changed or not.
	[switch] $Force,
	# Run each reinstalled package's testthat tests.
	[switch] $Test,
	[switch] $SkipR,
	[switch] $SkipBuild,
	[switch] $NoLaunch,
	# A fresh, empty DataSuite profile (user data and extensions) for this launch.
	[switch] $Fresh,
	# A file or folder to open in DataSuite.
	[string] $Open
)

$ErrorActionPreference = 'Stop'
$extension = Split-Path $PSScriptRoot -Parent                    # extensions/countdown-analytics
$root = Split-Path (Split-Path $extension -Parent) -Parent       # datasuite-infrastructure
$datasuite = Join-Path $root 'datasuite'
$assistant = Join-Path $datasuite 'extensions/datasuite-assistant'
$stamps = Join-Path $env:TEMP 'datasuite-dev-test'
New-Item -ItemType Directory -Force $stamps | Out-Null

$packages = [ordered]@{
	ui = 'datasuite.ui'; core = 'cd2030.core'; rmncah = 'cd2030.rmncah'; vaxx = 'cd2030.vaxx'; pooled = 'cd2030.pooled'
}

function Write-Step([string] $text) { Write-Host "`n== $text" -ForegroundColor Cyan }

# What a folder is now: its commit plus a hash of its uncommitted changes (tracked diffs and untracked file contents).
function Get-FolderState([string] $dir, [string[]] $paths = @('.')) {
	Push-Location $dir
	try {
		$head = git rev-parse HEAD 2>$null
		$diff = (git diff HEAD -- @paths 2>$null) -join "`n"
		$untracked = git ls-files --others --exclude-standard -- @paths 2>$null
		$extra = ($untracked | ForEach-Object { if (Test-Path $_ -PathType Leaf) { "$_ $((Get-FileHash $_ -Algorithm SHA1).Hash)" } }) -join "`n"
		$bytes = [Text.Encoding]::UTF8.GetBytes("$head`n$diff`n$extra")
		return [BitConverter]::ToString([Security.Cryptography.SHA1]::Create().ComputeHash($bytes)).Replace('-', '')
	} finally { Pop-Location }
}

function Test-Changed([string] $name, [string] $state) {
	if ($Force) { return $true }
	$file = Join-Path $stamps "$name.txt"
	return -not ((Test-Path $file) -and ((Get-Content $file -Raw).Trim() -eq $state))
}

function Save-State([string] $name, [string] $state) { Set-Content -Path (Join-Path $stamps "$name.txt") -Value $state }

function Invoke-Checked([string] $what, [scriptblock] $block) {
	& $block
	if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)." }
}

# ---- 1. R packages ----------------------------------------------------------------------------------------------
if (-not $SkipR) {
	if (-not (Get-Command Rscript -ErrorAction SilentlyContinue)) { throw 'Rscript is not on the PATH.' }
	$keys = if ($Only) { $packages.Keys | Where-Object { $Only -contains $_ } } else { $packages.Keys }
	foreach ($key in $keys) {
		$name = $packages[$key]
		$dir = Join-Path $root "extensions/$name"
		if (-not (Test-Path $dir)) { Write-Warning "$dir not found; skipped."; continue }
		$state = Get-FolderState $dir
		if (-not (Test-Changed $name $state)) { Write-Host "$name unchanged" -ForegroundColor DarkGray; continue }
		Write-Step "Installing $name"
		$rdir = $dir.Replace('\', '/')
		Invoke-Checked "Installing $name (close the Shiny app tabs if a package is locked)" {
			Rscript -e "devtools::install('$rdir', quick = TRUE, upgrade = FALSE, dependencies = FALSE, quiet = TRUE); cat('$name', as.character(packageVersion('$name')), 'installed\n')"
		}
		if ($Test) {
			Write-Step "Testing $name"
			Invoke-Checked "Tests of $name" {
				Rscript -e "res <- as.data.frame(devtools::test('$rdir', reporter = 'summary', stop_on_failure = FALSE)); f <- sum(res`$failed) + sum(res`$error); cat('\nfailures:', f, '\n'); quit(status = as.integer(f > 0))"
			}
		}
		Save-State $name $state
	}
}

# ---- 2-4. Builds ------------------------------------------------------------------------------------------------
if (-not $SkipBuild) {
	$builds = @(
		@{ name = 'countdown-analytics'; dir = $extension; state = { Get-FolderState $extension @('src', 'package.json', 'tsconfig.json') }; run = { npm run compile } },
		@{ name = 'datasuite-assistant'; dir = $assistant; state = { Get-FolderState $datasuite @('extensions/datasuite-assistant/src', 'extensions/datasuite-assistant/package.json', 'extensions/datasuite-assistant/assets') }; run = { npm run compile } },
		@{ name = 'datasuite-client'; dir = $datasuite; state = { Get-FolderState $datasuite @('src') }; run = { npm run transpile-client } }
	)
	foreach ($b in $builds) {
		$state = & $b.state
		if (-not (Test-Changed $b.name $state)) { Write-Host "$($b.name) unchanged" -ForegroundColor DarkGray; continue }
		Write-Step "Building $($b.name)"
		Push-Location $b.dir
		try { Invoke-Checked "Building $($b.name)" $b.run } finally { Pop-Location }
		Save-State $b.name $state
	}
}

# ---- 5. Launch --------------------------------------------------------------------------------------------------
if ($NoLaunch) { Write-Host "`nReady (not launched)." -ForegroundColor Green; return }

$builtIn = Join-Path $datasuite '.build/builtInExtensions/datasuite.countdown-analytics'
if (Test-Path $builtIn) {
	Write-Host "Note: a built-in countdown-analytics is in $builtIn; the source copy overrides it. If you see old behaviour, delete that folder." -ForegroundColor Yellow
}

$arguments = @("--extensionDevelopmentPath=$extension")
if ($Fresh) {
	$profileDir = Join-Path $stamps ("profile-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
	$arguments += "--user-data-dir=$profileDir\data", "--extensions-dir=$profileDir\extensions"
	Write-Host "Fresh profile: $profileDir (you will need to sign in to DataSuite)." -ForegroundColor Yellow
}
if ($Open) { $arguments += (Resolve-Path $Open).Path }

Write-Step 'Launching DataSuite'
$env:VSCODE_SKIP_PRELAUNCH = '1'
Push-Location $datasuite
try { & (Join-Path $datasuite 'scripts/code.bat') @arguments } finally { Pop-Location }
