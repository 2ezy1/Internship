#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Retrieves device_key from the server and optionally updates ESP32 config.h

.DESCRIPTION
    This script fetches the device_key from your Ubuntu server for a specific device ID
    and can automatically update the ESP32 master config.h file.

.PARAMETER DeviceId
    The device ID to query (default: 1)

.PARAMETER ServerIp
    The server IP address (default: 172.20.10.4)

.PARAMETER ServerPort
    The server port (default: 8000)

.PARAMETER UpdateConfig
    If specified, automatically updates the config.h file with the retrieved key

.EXAMPLE
    .\get_device_key.ps1
    Retrieves device key for device ID 1

.EXAMPLE
    .\get_device_key.ps1 -DeviceId 1 -UpdateConfig
    Retrieves device key and updates config.h automatically

.EXAMPLE
    .\get_device_key.ps1 -DeviceId 2 -ServerIp 192.168.1.100
    Retrieves device key from a different server
#>

param(
    [int]$DeviceId = 1,
    [string]$ServerIp = "172.20.10.4",
    [int]$ServerPort = 8000,
    [switch]$UpdateConfig
)

$ErrorActionPreference = "Stop"

$configPath = Join-Path $PSScriptRoot "master\src\config.h"
$apiUrl = "http://${ServerIp}:${ServerPort}/devices/${DeviceId}"

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          ESP32 Device Key Retrieval Tool                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Write-Host "📡 Server: " -NoNewline -ForegroundColor Yellow
Write-Host "${ServerIp}:${ServerPort}" -ForegroundColor White

Write-Host "🔢 Device ID: " -NoNewline -ForegroundColor Yellow
Write-Host "$DeviceId" -ForegroundColor White

Write-Host ""
Write-Host "🔍 Fetching device information from server..." -ForegroundColor Cyan

try {
    # Test server connectivity first
    $tcpTest = Test-NetConnection -ComputerName $ServerIp -Port $ServerPort -WarningAction SilentlyContinue
    
    if (-not $tcpTest.TcpTestSucceeded) {
        Write-Host "❌ ERROR: Cannot reach server at ${ServerIp}:${ServerPort}" -ForegroundColor Red
        Write-Host "   Make sure:" -ForegroundColor Yellow
        Write-Host "   1. Server is running on Ubuntu" -ForegroundColor Yellow
        Write-Host "   2. You're connected to the same network (iPhone hotspot)" -ForegroundColor Yellow
        Write-Host "   3. Server IP is correct (check with: ip addr show)" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "✅ Server is reachable" -ForegroundColor Green
    Write-Host ""
    
    # Fetch device data from API
    $response = Invoke-RestMethod -Uri $apiUrl -Method GET -ContentType "application/json" -TimeoutSec 10
    
    if (-not $response) {
        Write-Host "❌ ERROR: No response from server" -ForegroundColor Red
        exit 1
    }
    
    # Extract device information
    $deviceName = $response.device_name
    $ipAddress = $response.ip_address
    $deviceType = $response.type
    $deviceKey = $response.device_key
    $isOnline = $response.is_online
    $lastHeartbeat = $response.last_heartbeat
    
    # Display device information
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║                    DEVICE INFORMATION                      ║" -ForegroundColor Green
    Write-Host "╠════════════════════════════════════════════════════════════╣" -ForegroundColor Green
    Write-Host "║ ID:            " -NoNewline -ForegroundColor Yellow
    Write-Host "$($response.id)".PadRight(44) -NoNewline -ForegroundColor White
    Write-Host "║" -ForegroundColor Green
    
    Write-Host "║ Name:          " -NoNewline -ForegroundColor Yellow
    Write-Host "$deviceName".PadRight(44) -NoNewline -ForegroundColor White
    Write-Host "║" -ForegroundColor Green
    
    Write-Host "║ IP Address:    " -NoNewline -ForegroundColor Yellow
    Write-Host "$ipAddress".PadRight(44) -NoNewline -ForegroundColor White
    Write-Host "║" -ForegroundColor Green
    
    Write-Host "║ Type:          " -NoNewline -ForegroundColor Yellow
    Write-Host "$deviceType".PadRight(44) -NoNewline -ForegroundColor White
    Write-Host "║" -ForegroundColor Green
    
    Write-Host "║ Status:        " -NoNewline -ForegroundColor Yellow
    if ($isOnline) {
        Write-Host "🟢 Online".PadRight(44) -NoNewline -ForegroundColor Green
    } else {
        Write-Host "🔴 Offline".PadRight(44) -NoNewline -ForegroundColor Red
    }
    Write-Host "║" -ForegroundColor Green
    
    if ($lastHeartbeat) {
        Write-Host "║ Last Heartbeat:" -NoNewline -ForegroundColor Yellow
        Write-Host " $lastHeartbeat".PadRight(44) -NoNewline -ForegroundColor White
        Write-Host "║" -ForegroundColor Green
    }
    
    Write-Host "╠════════════════════════════════════════════════════════════╣" -ForegroundColor Green
    Write-Host "║ 🔑 DEVICE KEY:                                             ║" -ForegroundColor Green
    Write-Host "║    " -NoNewline -ForegroundColor Green
    Write-Host "$deviceKey".PadRight(56) -NoNewline -ForegroundColor Cyan
    Write-Host "║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    
    if (-not $deviceKey) {
        Write-Host "⚠️  WARNING: This device does not have a device_key assigned!" -ForegroundColor Yellow
        Write-Host "   This might be because:" -ForegroundColor Yellow
        Write-Host "   - Device type is not 'ESP32_Master'" -ForegroundColor Yellow
        Write-Host "   - Device was created before key auto-generation was implemented" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "   You can regenerate a key using:" -ForegroundColor Cyan
        Write-Host "   POST http://${ServerIp}:${ServerPort}/devices/${DeviceId}/regenerate-key" -ForegroundColor Cyan
        exit 0
    }
    
    # Copy to clipboard if available
    try {
        Set-Clipboard -Value $deviceKey -ErrorAction Stop
        Write-Host "📋 Device key copied to clipboard!" -ForegroundColor Green
        Write-Host ""
    } catch {
        # Clipboard not available, continue anyway
    }
    
    # Update config.h if requested
    if ($UpdateConfig) {
        Write-Host "🔧 Updating config.h file..." -ForegroundColor Cyan
        
        if (-not (Test-Path $configPath)) {
            Write-Host "❌ ERROR: config.h not found at: $configPath" -ForegroundColor Red
            exit 1
        }
        
        # Read current config
        $configContent = Get-Content $configPath -Raw
        
        # Check if DEVICE_KEY line exists
        if ($configContent -match '#define\s+DEVICE_KEY\s+"[^"]*"') {
            # Replace existing DEVICE_KEY
            $pattern = '#define\s+DEVICE_KEY\s+"[^"]*"'
            $replacement = "#define DEVICE_KEY `"$deviceKey`""
            $configContent = $configContent -replace $pattern, $replacement
            
            # Write back to file
            $Utf8NoBomEncoding = New-Object System.Text.UTF8Encoding $False
            [System.IO.File]::WriteAllText($configPath, $configContent, $Utf8NoBomEncoding)
            
            Write-Host "✅ Successfully updated DEVICE_KEY in config.h" -ForegroundColor Green
            Write-Host ""
            Write-Host "📝 Next steps:" -ForegroundColor Yellow
            Write-Host "   1. cd ESP32\master" -ForegroundColor Cyan
            Write-Host "   2. pio run --target upload --target monitor" -ForegroundColor Cyan
            Write-Host ""
        } else {
            Write-Host "❌ ERROR: Could not find DEVICE_KEY definition in config.h" -ForegroundColor Red
            Write-Host "   Please manually add the following line:" -ForegroundColor Yellow
            Write-Host "   #define DEVICE_KEY `"$deviceKey`"" -ForegroundColor Cyan
        }
    } else {
        Write-Host "💡 To automatically update config.h, run:" -ForegroundColor Yellow
        Write-Host "   .\get_device_key.ps1 -UpdateConfig" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "📝 Or manually update ESP32/master/src/config.h line 50:" -ForegroundColor Yellow
        Write-Host "   #define DEVICE_KEY `"$deviceKey`"" -ForegroundColor Cyan
        Write-Host ""
    }
    
} catch {
    Write-Host "❌ ERROR: Failed to retrieve device information" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Message -match "404") {
        Write-Host ""
        Write-Host "   Device ID $DeviceId not found in database." -ForegroundColor Yellow
        Write-Host "   Please:" -ForegroundColor Yellow
        Write-Host "   1. Login to your frontend (http://172.20.10.4:5173)" -ForegroundColor Cyan
        Write-Host "   2. Go to 'Add Device'" -ForegroundColor Cyan
        Write-Host "   3. Create the device first, then run this script again" -ForegroundColor Cyan
    }
    
    exit 1
}
