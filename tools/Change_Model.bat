@echo off
setlocal enabledelayedexpansion
title Claude Code - Quick Model Change

for /F %%a in ('powershell -NoProfile -Command "[char]27"') do set "ESC=%%a"
set "C=!ESC![36m"& set "G=!ESC![32m"& set "Y=!ESC![33m"& set "R=!ESC![31m"& set "D=!ESC![90m"& set "X=!ESC![0m"& set "B=!ESC![1m"

set "DATA_DIR=%~dp0..\data"
set "SETTINGS_FILE=%DATA_DIR%\openclaude\settings.json"

if not exist "%SETTINGS_FILE%" (
    echo %R%[ERROR] No settings.json found. Run START.bat first.%X%
    pause
    exit /b 1
)

:: Get current model
for /f "delims=" %%M in ('powershell -NoProfile -Command "try { $s = Get-Content '%SETTINGS_FILE%' -Raw | ConvertFrom-Json; Write-Output $s.model } catch { }"') do set "CURRENT_MODEL=%%M"

cls
echo.
echo %C%=========================================================%X%
echo   %B%Quick Model Change%X%
echo %C%=========================================================%X%
echo.
echo   Current model: %G%!CURRENT_MODEL!%X%
echo.
echo   Tips:
echo   - 'auto' = OmniRoute auto-routing (best free model)
echo   - 'claude-sonnet-4-20250514' = Claude diretto
echo   - 'glm/glm-5.2' = GLM via OmniRoute
echo   - 'deepseek/deepseek-v4-pro' = DeepSeek via OmniRoute
echo.

set /p "NEW_MODEL=  New model name (Enter to keep current): "
if "!NEW_MODEL!"=="" (
    echo   %D%No changes made.%X%
    timeout /t 2 >nul
    exit /b 0
)
set "NEW_MODEL=!NEW_MODEL: =!"

:: Update model in settings.json
powershell -NoProfile -Command "$s = Get-Content '%SETTINGS_FILE%' -Raw | ConvertFrom-Json; $s.model = '!NEW_MODEL!'; $s.env.ANTHROPIC_MODEL = '!NEW_MODEL!'; $s | ConvertTo-Json -Depth 5 | Set-Content '%SETTINGS_FILE%' -Encoding UTF8"

echo.
echo   %G%[OK] Model changed to: !NEW_MODEL!%X%
echo   %D%Restart Claude Code to use the new model.%X%
timeout /t 3 >nul
