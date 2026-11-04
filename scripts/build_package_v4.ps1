$zipName = "PHASE_4_2_FINAL_APPROVAL_PACKAGE_V4.zip"
if (Test-Path $zipName) { Remove-Item $zipName -Force }

$tempDir = Join-Path $env:TEMP ("pkg_v4_" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tempDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempDir "migrations") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempDir "tests") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempDir "references\production_migrations") | Out-Null

Copy-Item "PHASE_4_2_FINAL_SECURITY_REVIEW_V4.md" -Destination $tempDir
Copy-Item "BASELINE_PARITY_EVIDENCE.md" -Destination $tempDir
Copy-Item "PHASE_4_2_REMEDIATION_CHANGELOG.md" -Destination $tempDir
Copy-Item "migrations\000_baseline_schema_snapshot.sql" -Destination (Join-Path $tempDir "migrations")
Copy-Item "migrations\077_super_admin_infrastructure.sql" -Destination (Join-Path $tempDir "migrations")
Copy-Item "migrations\078_coupon_and_promotional_campaign_system.sql" -Destination (Join-Path $tempDir "migrations")
Copy-Item "tests\staging_test_suite.sql" -Destination (Join-Path $tempDir "tests")
Copy-Item "references\production_migrations\*.sql" -Destination (Join-Path $tempDir "references\production_migrations")

Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath (Join-Path (Get-Location) $zipName) -CompressionLevel Optimal
Remove-Item -Recurse -Force $tempDir

Get-Item $zipName | Format-List Name, Length, LastWriteTime

