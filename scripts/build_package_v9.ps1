$ErrorActionPreference = "Stop"

$zipName = "PHASE_4_2_FINAL_APPROVAL_PACKAGE_V9.zip"
$tempDir = Join-Path $PSScriptRoot "..\temp_package_v9"

if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}
New-Item -ItemType Directory -Path $tempDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempDir "migrations") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempDir "server") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempDir "scripts") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempDir "tests") | Out-Null

$baseDir = Resolve-Path (Join-Path $PSScriptRoot "..")

# Copy Documentation
Copy-Item (Join-Path $baseDir "PHASE_4_2_FINAL_SECURITY_REVIEW_V9.md") $tempDir
Copy-Item (Join-Path $baseDir "ADMIN_INVITATION_SYSTEM_DESIGN.md") $tempDir
Copy-Item (Join-Path $baseDir "SERVICE_ROLE_PRIVILEGE_MATRIX.md") $tempDir
Copy-Item (Join-Path $baseDir "BASELINE_PARITY_EVIDENCE.md") $tempDir
Copy-Item (Join-Path $baseDir "PHASE_4_2_REMEDIATION_CHANGELOG.md") $tempDir

# Copy Migrations
Copy-Item (Join-Path $baseDir "migrations\000_baseline_schema_snapshot.sql") (Join-Path $tempDir "migrations")
Copy-Item (Join-Path $baseDir "migrations\077_super_admin_infrastructure.sql") (Join-Path $tempDir "migrations")
Copy-Item (Join-Path $baseDir "migrations\078_coupon_and_promotional_campaign_system.sql") (Join-Path $tempDir "migrations")

# Copy Gateway BFF & Scripts
Copy-Item (Join-Path $baseDir "server\gateway.mjs") (Join-Path $tempDir "server")
Copy-Item (Join-Path $baseDir "scripts\bootstrap_super_admin.mjs") (Join-Path $tempDir "scripts")

# Copy Test Suites
Copy-Item (Join-Path $baseDir "tests\staging_test_suite.sql") (Join-Path $tempDir "tests")
Copy-Item (Join-Path $baseDir "tests\gateway_provisioning.test.mjs") (Join-Path $tempDir "tests")

$zipPath = Join-Path $baseDir $zipName
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)

Remove-Item -Recurse -Force $tempDir

Write-Host "Created $zipPath successfully."

