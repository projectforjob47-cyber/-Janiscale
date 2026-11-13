@echo off
title SMART DC Server & Cloudflare Tunnel
echo ===================================================
echo   SMART DC - Digital Weight Sampling System
echo ===================================================
echo Starting Vite Server on Port 3000...
set PATH=C:\Users\Beam\AppData\Local\Programs\nodejs;%PATH%
cd /d "c:\Users\Beam\Downloads\receiving fresh\smart-dc"

start "Vite Dev Server" cmd /k "node.exe ./node_modules/vite/bin/vite.js --host 0.0.0.0 --port 3000"
timeout /t 3 /nobreak >nul

echo Starting Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /k "cloudflared.exe tunnel --url http://127.0.0.1:3000"

echo.
echo ===================================================
echo [1] Local Wi-Fi URL:  http://172.17.185.127:3000
echo [2] Check the 'Cloudflare Tunnel' window for HTTPS URL
echo ===================================================
pause
