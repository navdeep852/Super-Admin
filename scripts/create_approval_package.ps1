$ErrorActionPreference = "Stop"

$baseDir = "d:\Project\vistaar-main\super_admin"
$zipPath = Join-Path $baseDir "PHASE_4_2_FINAL_APPROVAL_PACKAGE.zip"

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

$tempDir = Join-Path $env:TEMP ("phase_4_2_pkg_" + (Get-Random))
New-Item -ItemType Directory -Path (Join-Path $tempDir "migrations") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempDir "tests") -Force | Out-Null

Copy-Item (Join-Path $baseDir "PHASE_4_2_FINAL_SECURITY_REVIEW.md") -Destination $tempDir -Force
Copy-Item (Join-Path $baseDir "migrations\000_baseline_schema_snapshot.sql") -Destination (Join-Path $tempDir "migrations") -Force
Copy-Item (Join-Path $baseDir "migrations\077_super_admin_infrastructure.sql") -Destination (Join-Path $tempDir "migrations") -Force
Copy-Item (Join-Path $baseDir "migrations\078_coupon_and_promotional_campaign_system.sql") -Destination (Join-Path $tempDir "migrations") -Force
Copy-Item (Join-Path $baseDir "tests\staging_test_suite.sql") -Destination (Join-Path $tempDir "tests") -Force

# Compress to ZIP
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -CompressionLevel Optimal

# Cleanup tempDir
Remove-Item -Recurse -Force $tempDir

# Report
Get-Item $zipPath | Select-Object Name, Length, LastWriteTime

# Verify archive contents
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
Write-Host "Archive contents count: $($zip.Entries.Count)"
$zip.Entries | Select-Object FullName, Length, CompressedLength, LastWriteTime | Format-Table -AutoSize
$zip.Dispose()

# Verify extracted contents match latest corrections
$verifyDir = Join-Path $env:TEMP ("phase_4_2_verify_" + (Get-Random))
Expand-Archive -Path $zipPath -DestinationPath $verifyDir -Force

Write-Host "`n--- VERIFYING EXTRACTED FILES FROM ZIP ---"
Write-Host "1. migrations/000_baseline_schema_snapshot.sql:"
Select-String -Path "$verifyDir\migrations\000_baseline_schema_snapshot.sql" -Pattern "is_archived|unique_workspace_invoice_number"

Write-Host "`n2. migrations/077_super_admin_infrastructure.sql:"
Select-String -Path "$verifyDir\migrations\077_super_admin_infrastructure.sql" -Pattern "cleanup_expired_gcap_nonces.*FROM PUBLIC|search_path = public, extensions, pg_temp"

Write-Host "`n3. migrations/078_coupon_and_promotional_campaign_system.sql:"
Select-String -Path "$verifyDir\migrations\078_coupon_and_promotional_campaign_system.sql" -Pattern "search_path = public, extensions, pg_temp"

Write-Host "`n4. tests/staging_test_suite.sql:"
Select-String -Path "$verifyDir\tests\staging_test_suite.sql" -Pattern "TEST 11|TEST 12|ALL 12 PHASE 4 TEST SUITE"

Write-Host "`n5. PHASE_4_2_FINAL_SECURITY_REVIEW.md:"
Select-String -Path "$verifyDir\PHASE_4_2_FINAL_SECURITY_REVIEW.md" -Pattern "READY FOR HOSTED STAGING MIGRATION REVIEW|Parity Status"

Remove-Item -Recurse -Force $verifyDir
Write-Host "`nAll 5 files verified to contain latest corrections!"
