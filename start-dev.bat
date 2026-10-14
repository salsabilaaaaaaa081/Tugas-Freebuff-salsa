@echo off
rem GanttPro - jalankan server lokal (server.js bawaan Node, tanpa unduhan paket)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

echo Menjalankan server GanttPro pada port 8080...
start "GanttPro server" cmd /k "node server.js"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8080"
echo.
echo Buka manual bila browser tidak muncul:  http://127.0.0.1:8080
echo (alternatif: http://localhost:8080)
echo Uji unit:                               http://127.0.0.1:8080/tests/tests.html
echo Jendela "GanttPro server" harus tetap TERBUKA (tutup = server berhenti).
timeout /t 6 >nul
goto end

:nonode
echo Node.js tidak ditemukan di PATH.
echo.
echo Pilih salah satu:
echo   1. Pasang Node.js dari https://nodejs.org  lalu jalankan file ini lagi, atau
echo   2. Tanpa server: double-click index.html langsung di browser.
echo.
pause
goto end

:end
