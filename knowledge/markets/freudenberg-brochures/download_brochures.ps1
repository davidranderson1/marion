# Freudenberg Brochure Downloader
# Run from this folder (freudenberg-brochures). Downloads all PDFs listed in _manifest.json.
# Usage: right-click > Run with PowerShell, OR in a PowerShell window:
#   cd "C:\Users\d.anderson\OneDrive - Sealing Solutions Group\ClaudeAgent\Marion\marion\knowledge\markets\freudenberg-brochures"
#   powershell -ExecutionPolicy Bypass -File .\download_brochures.ps1

$ErrorActionPreference = "Continue"
$base = "https://www.fst.com"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$manifestPath = Join-Path $scriptDir "_manifest.json"

if (-not (Test-Path $manifestPath)) {
    Write-Host "ERROR: _manifest.json not found next to this script." -ForegroundColor Red
    exit 1
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$total = $manifest.brochures.Count
$ok = 0
$fail = 0
$i = 0

# Browser-like UA so the CDN doesn't reject the request
$headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" }

Write-Host "Downloading $total brochures into $scriptDir`n" -ForegroundColor Cyan

foreach ($b in $manifest.brochures) {
    $i++
    $url = $base + $b.url
    # Derive a safe filename from the URL's last segment
    $leaf = ($b.url -split "/")[-1]
    $dest = Join-Path $scriptDir $leaf

    if (Test-Path $dest) {
        Write-Host ("[{0}/{1}] SKIP (exists): {2}" -f $i, $total, $leaf) -ForegroundColor DarkGray
        $ok++
        continue
    }

    try {
        Invoke-WebRequest -Uri $url -OutFile $dest -Headers $headers -TimeoutSec 60
        $size = [math]::Round((Get-Item $dest).Length / 1KB, 0)
        Write-Host ("[{0}/{1}] OK  {2} KB  {3}" -f $i, $total, $size, $leaf) -ForegroundColor Green
        $ok++
    }
    catch {
        Write-Host ("[{0}/{1}] FAIL {2}  ->  {3}" -f $i, $total, $leaf, $_.Exception.Message) -ForegroundColor Red
        if (Test-Path $dest) { Remove-Item $dest -Force }  # clean up partial/zero-byte file
        $fail++
    }
    Start-Sleep -Milliseconds 400  # be polite to the server
}

Write-Host ("`nDone. {0} succeeded, {1} failed, out of {2}." -f $ok, $fail, $total) -ForegroundColor Cyan
if ($fail -gt 0) {
    Write-Host "Re-run the script to retry only the failed ones (existing files are skipped)." -ForegroundColor Yellow
}
