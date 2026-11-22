@echo off
chcp 65001 >nul
cd /d "%~dp0"
title KuisKilat Online 2.0 - Pengujian Lokal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang.
  echo Unduh Node.js versi 20+ di https://nodejs.org
  pause
  exit /b 1
)
echo.
echo ==============================================
echo  KUISKILAT ONLINE 2.0 - UJI LOKAL
 echo ==============================================
echo.
echo Buka http://localhost:3000 di browser komputer.
echo Untuk akses melalui internet, baca PANDUAN-PASANG-ONLINE.md
echo.
node server.js
echo Server berhenti.
pause
