@echo off
setlocal enabledelayedexpansion
title TechTonic Forge - Agents & Team

:: ANSI Colors
for /F %%a in ('powershell -NoProfile -Command "[char]27"') do set "ESC=%%a"
set "CYAN=%ESC%[36m"
set "GREEN=%ESC%[32m"
set "YELLOW=%ESC%[33m"
set "RED=%ESC%[31m"
set "DIM=%ESC%[90m"
set "R=%ESC%[0m"
set "BOLD=%ESC%[1m"

set "USB_ROOT=%~dp0..\"
set "ENGINE_DIR=%USB_ROOT%engine"
set "NODE=%ENGINE_DIR%\node-win-x64\node.exe"
set "DASHBOARD=%USB_ROOT%dashboard\server.mjs"
set "DATA_DIR=%USB_ROOT%data"

:: Portable data
set "CLAUDE_CONFIG_DIR=%DATA_DIR%\openclaude"
set "XDG_CONFIG_HOME=%DATA_DIR%\config"
set "XDG_DATA_HOME=%DATA_DIR%\app_data"
if not exist "%CLAUDE_CONFIG_DIR%" mkdir "%CLAUDE_CONFIG_DIR%"
if not exist "%XDG_CONFIG_HOME%" mkdir "%XDG_CONFIG_HOME%"
if not exist "%XDG_DATA_HOME%" mkdir "%XDG_DATA_HOME%"

cls
echo.
echo %CYAN%=========================================================%R%
echo   %BOLD%🤖 TechTonic Forge — Agents & Team Orchestrator%R%
echo %CYAN%=========================================================%R%
echo.
echo   %DIM%Agenti disponibili:%R%
echo   %GREEN%💻 Developer%R%      %DIM%- Scrive codice, risolve bug%R%
echo   %GREEN%📋 Project Manager%R% %DIM%- Pianifica e scompone task%R%
echo   %GREEN%🔍 Code Reviewer%R%   %DIM%- Revisiona e trova bug%R%
echo   %GREEN%🧪 QA Tester%R%       %DIM%- Testa e verifica%R%
echo   %GREEN%🏗️ Architect%R%       %DIM%- Progetta architetture%R%
echo   %GREEN%🔒 Security%R%        %DIM%- Audit di sicurezza%R%
echo   %GREEN%📚 Documentation%R%   %DIM%- Scrive documentazione%R%
echo   %GREEN%🎧 Support%R%         %DIM%- Aiuta a risolvere problemi%R%
echo.
echo %CYAN%=========================================================%R%
echo.

:: Check Node.js
if not exist "%NODE%" (
    echo   %RED%[ERROR] Node.js non trovato.%R%
    echo   %YELLOW%Avvia prima START.bat per installare l'engine.%R%
    pause
    goto :eof
)

:: Check dashboard
if not exist "%DASHBOARD%" (
    echo   %RED%[ERROR] Dashboard non trovata.%R%
    pause
    goto :eof
)

:: Check port
netstat -ano 2>nul | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo   %YELLOW%[INFO] Dashboard gia' in esecuzione su http://localhost:3000%R%
    echo   %CYAN%[~] Apro il tab Agents...%R%
    start "" "http://localhost:3000"
    goto :eof
)

echo   %CYAN%[~] Avvio server dashboard + agents...%R%
echo   %DIM%  Dashboard: %BOLD%http://localhost:3000%R%
echo.

:: Open browser directly on the agents tab
start "" "http://localhost:3000"

echo   %GREEN%[OK] Browser aperto!%R%
echo   %DIM%  Vai sul tab 🤖 Agents per usare gli agenti.%R%
echo   %DIM%  Premi Ctrl+C per fermare il server.%R%
echo.

"%NODE%" "%DASHBOARD%"
pause
goto :eof
