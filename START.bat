@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title TechTonic Forge - Starting...

:: Define ANSI Colors
for /F %%a in ('powershell -NoProfile -Command "[char]27"') do set "ESC=%%a"
set "CYAN=!ESC![36m"
set "GREEN=!ESC![32m"
set "YELLOW=!ESC![33m"
set "RED=!ESC![31m"
set "DIM=!ESC![90m"
set "RESET=!ESC![0m"
set "BOLD=!ESC![1m"

set "USB_ROOT=%~dp0"
set "ENGINE_DIR=%USB_ROOT%engine"
set "DATA_DIR=%USB_ROOT%data"
set "ENV_FILE=%DATA_DIR%\ai_settings.env"
set "NPM_CACHE_DIR=%DATA_DIR%\npm-cache"
set "NPM_INSTALL_LOG=%ENGINE_DIR%\engine-install.log"
set "NODE_VERSION=22.23.2"
set "NODE_DIR_NAME=node-win-x64"
set "NODE_DIR=%ENGINE_DIR%\%NODE_DIR_NAME%"
set "NODE_ARCHIVE=%ENGINE_DIR%\node.zip"
set "NODE_DOWNLOAD_LOG=%ENGINE_DIR%\node-download.log"
set "NODE_PRIMARY_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip"
set "NODE_FALLBACK_URL=https://r2.nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip"
set "GIT_VERSION=2.54.0"
set "GIT_DIR_NAME=git-win-x64"
set "GIT_DIR=%ENGINE_DIR%\%GIT_DIR_NAME%"
set "GIT_BASH=%GIT_DIR%\bin\bash.exe"
set "GIT_EXE=%GIT_DIR%\bin\git.exe"
set "CLAUDE_CODE_DIR=%ENGINE_DIR%\node_modules\@anthropic-ai\claude-code"
set "OMNIROUTE_DIR=%ENGINE_DIR%\node_modules\omniroute"
set "CC_CLI=%CLAUDE_CODE_DIR%\cli-wrapper.cjs"
set "OMNI_CLI=%OMNIROUTE_DIR%\dist\cli.js"

:: 1. Force the portable AI to save logs/memory strictly to the USB
set "CLAUDE_CONFIG_DIR=%DATA_DIR%\openclaude"
set "PORTABLE_HOME=%DATA_DIR%\home"
set "XDG_CONFIG_HOME=%DATA_DIR%\config"
set "XDG_DATA_HOME=%DATA_DIR%\app_data"
set "XDG_CACHE_HOME=%DATA_DIR%\cache"
set "APPDATA=%DATA_DIR%\app_data"
set "LOCALAPPDATA=%DATA_DIR%\local_app_data"
set "HOME=%PORTABLE_HOME%"
set "USERPROFILE=%PORTABLE_HOME%"
set "SETTINGS_FILE=%CLAUDE_CONFIG_DIR%\settings.json"

if not exist "%CLAUDE_CONFIG_DIR%" mkdir "%CLAUDE_CONFIG_DIR%"
if not exist "%PORTABLE_HOME%" mkdir "%PORTABLE_HOME%"
if not exist "%XDG_CONFIG_HOME%" mkdir "%XDG_CONFIG_HOME%"
if not exist "%XDG_DATA_HOME%" mkdir "%XDG_DATA_HOME%"
if not exist "%XDG_CACHE_HOME%" mkdir "%XDG_CACHE_HOME%"
if not exist "%APPDATA%" mkdir "%APPDATA%"
if not exist "%LOCALAPPDATA%" mkdir "%LOCALAPPDATA%"

:: Display Banner
echo.
echo !CYAN!    ____            __        __    __        ___    ____!RESET!
echo !CYAN!   / __ \____  ____/ /_____ _/ /_  / /__     /   ^|  /  _/!RESET!
echo !CYAN!  / /_/ / __ \/ __/ __/ __ `/ __ \/ / _ \   / /^| ^|  / /  !RESET!
echo !CYAN! / ____/ /_/ / / / /_/ /_/ / /_/ / /  __/  / ___ ^|_/ /   !RESET!
echo !CYAN!/_/    \____/_/  \__/\__,_/_.___/_/\___/  /_/  ^|_/___/   !RESET!
echo.
echo !CYAN!=========================================================!RESET!
echo   !BOLD!TechTonic Forge - AI Dashboard!RESET!
echo !CYAN!=========================================================!RESET!
echo.

if not exist "%ENGINE_DIR%" mkdir "%ENGINE_DIR%"

goto after_install_engine_func
:install_engine
set "INSTALL_ACTION=%~1"
if "%INSTALL_ACTION%"=="" set "INSTALL_ACTION=Installing"
echo   !YELLOW![~] !INSTALL_ACTION! Claude Code Engine...!RESET!
echo   !DIM!    Package: @anthropic-ai/claude-code!RESET!
echo   !DIM!    Log: %NPM_INSTALL_LOG%!RESET!
if not exist "%NPM_CACHE_DIR%" mkdir "%NPM_CACHE_DIR%"

:: Clean old packages that can conflict with new install
if exist "%ENGINE_DIR%\node_modules\@gitlawb" (
    echo   !DIM![~] Removing old OpenClaude engine...!RESET!
    rmdir /s /q "%ENGINE_DIR%\node_modules\@gitlawb" >nul 2>&1
)
if exist "%ENGINE_DIR%\node_modules\@anthropic-ai\claude-code" (
    echo   !DIM![~] Removing previous Claude Code install...!RESET!
    rmdir /s /q "%ENGINE_DIR%\node_modules\@anthropic-ai\claude-code" >nul 2>&1
)

:: Clean up any previous done flag
if exist "%ENGINE_DIR%\_npm_done.tmp" del "%ENGINE_DIR%\_npm_done.tmp"

:: Start npm install in background
pushd "%ENGINE_DIR%"
start "NPM-Install" /B /MIN cmd /c ""%NODE_DIR%\npm.cmd" install @anthropic-ai/claude-code@latest --ignore-scripts --no-audit --no-fund --loglevel=warn --cache "%NPM_CACHE_DIR%" >> "%NPM_INSTALL_LOG%" 2>&1 && "%NODE_DIR%\npm.cmd" install @anthropic-ai/claude-code-win32-x64@latest --no-audit --no-fund --loglevel=warn --cache "%NPM_CACHE_DIR%" >> "%NPM_INSTALL_LOG%" 2>&1 && echo OK > "%ENGINE_DIR%\_npm_done.tmp" || echo FAIL > "%ENGINE_DIR%\_npm_done.tmp""
popd

:: Show progress while npm runs (background)
set "NPM_ELAPSED=0"
set "NPM_DOTS="
echo.
:wait_npm_loop
if exist "%ENGINE_DIR%\_npm_done.tmp" goto npm_finished

set /a "NPM_ELAPSED+=3"
set "NPM_DOTS=!NPM_DOTS!."

:: Update status every 15 seconds, otherwise just show a dot
if "!NPM_DOTS!"=="....." (
    <nul set /p "=  !DIM![!NPM_ELAPSED!s] Installing @anthropic-ai/claude-code...!RESET!!"
    echo.
    set "NPM_DOTS="
) else (
    <nul set /p "=!DIM!.!RESET!"
)
%SystemRoot%\System32\timeout.exe /t 3 >nul
goto wait_npm_loop

:npm_finished
echo.
set /p "NPM_RESULT="<"%ENGINE_DIR%\_npm_done.tmp"
del "%ENGINE_DIR%\_npm_done.tmp" >nul 2>&1

if "!NPM_RESULT!"=="FAIL" (
    echo   !RED![ERROR] Claude Code install failed.!RESET!
    echo   !DIM!        Check log: %NPM_INSTALL_LOG%!RESET!
    pause
    exit /b 1
)

if not exist "%CC_CLI%" goto incomplete_engine
echo   !GREEN![OK] Claude Code installed successfully!!RESET!
exit /b 0

:incomplete_engine
echo   !RED![ERROR] Claude Code install is incomplete.!RESET!
echo   !DIM!        Missing %CC_CLI%!RESET!
pause
exit /b 1
:after_install_engine_func

:: 2. Check Node.js
if not exist "%NODE_DIR%\node.exe" (
    echo   !YELLOW![~] Node.js not found for Windows-x64. Downloading...!RESET!
    echo   !DIM!    Version: v%NODE_VERSION%!RESET!
    echo   !DIM!    Download log: %NODE_DOWNLOAD_LOG%!RESET!
    if exist "%NODE_ARCHIVE%" del "%NODE_ARCHIVE%" >nul 2>&1
    if exist "%NODE_DOWNLOAD_LOG%" del "%NODE_DOWNLOAD_LOG%" >nul 2>&1
    call :download_node "%NODE_PRIMARY_URL%" "official Node.js CDN"
    if errorlevel 1 (
        echo   !YELLOW![WARN] Official Node.js download failed. Trying fallback mirror...!RESET!
        call :download_node "%NODE_FALLBACK_URL%" "fallback Node.js mirror"
    )
    if errorlevel 1 goto node_download_failed
    echo   !YELLOW![~] Extracting Node.js...!RESET!
    echo   !DIM!    This can be silent for a few minutes on external drives.!RESET!
    if exist "%NODE_DIR%" rmdir /s /q "%NODE_DIR%"
    powershell -NoProfile -Command "Expand-Archive -Path '%NODE_ARCHIVE%' -DestinationPath '%ENGINE_DIR%' -Force"
    if errorlevel 1 (
        echo   !RED![ERROR] Failed to extract Node.js!!RESET!
        del "%NODE_ARCHIVE%" >nul 2>&1
        pause
        exit /b 1
    )
    ren "%ENGINE_DIR%\node-v%NODE_VERSION%-win-x64" "%NODE_DIR_NAME%"
    del "%NODE_ARCHIVE%"
    echo   !GREEN![OK] Node.js installed to %NODE_DIR%!RESET!
)

set "PATH=%NODE_DIR%;%PATH%"

set "CC_NATIVE_DIR=%ENGINE_DIR%\node_modules\@anthropic-ai\claude-code-win32-x64"

if not exist "%CC_CLI%" goto repair_engine
if not exist "%CC_NATIVE_DIR%" goto repair_native
goto engine_ready
:repair_native
echo   !YELLOW![~] Native binary missing. Reinstalling engine...!RESET!
rmdir /s /q "%CLAUDE_CODE_DIR%" >nul 2>&1
if exist "%CC_NATIVE_DIR%" rmdir /s /q "%CC_NATIVE_DIR%" >nul 2>&1
call :install_engine "Installing"
if errorlevel 1 exit /b 1
goto engine_ready
:repair_engine
if exist "%CLAUDE_CODE_DIR%" (
    echo   !YELLOW![~] Incomplete Claude Code Engine detected. Reinstalling...!RESET!
    rmdir /s /q "%CLAUDE_CODE_DIR%"
)
if exist "%CC_NATIVE_DIR%" (
    echo   !YELLOW![~] Removing stale native binary...!RESET!
    rmdir /s /q "%CC_NATIVE_DIR%"
)
call :install_engine "Installing"
if errorlevel 1 exit /b 1
:engine_ready

goto after_node_download_helpers

:download_node
set "NODE_URL=%~1"
set "NODE_SOURCE=%~2"
echo   !YELLOW![~] Downloading Node.js from !NODE_SOURCE!...!RESET!
echo [%DATE% %TIME%] Trying !NODE_SOURCE!: !NODE_URL!>>"%NODE_DOWNLOAD_LOG%"
curl.exe --fail --location --retry 3 --retry-delay 3 --connect-timeout 20 "!NODE_URL!" --output "%NODE_ARCHIVE%" >>"%NODE_DOWNLOAD_LOG%" 2>&1
if errorlevel 1 (
    echo [%DATE% %TIME%] Failed: !NODE_SOURCE!>>"%NODE_DOWNLOAD_LOG%"
    if exist "%NODE_ARCHIVE%" del "%NODE_ARCHIVE%" >nul 2>&1
    exit /b 1
)
if not exist "%NODE_ARCHIVE%" (
    echo [%DATE% %TIME%] Download command finished but archive is missing.>>"%NODE_DOWNLOAD_LOG%"
    exit /b 1
)
for %%A in ("%NODE_ARCHIVE%") do set "NODE_ARCHIVE_SIZE=%%~zA"
if "!NODE_ARCHIVE_SIZE!"=="0" (
    echo [%DATE% %TIME%] Downloaded archive is empty.>>"%NODE_DOWNLOAD_LOG%"
    del "%NODE_ARCHIVE%" >nul 2>&1
    exit /b 1
)
echo [%DATE% %TIME%] Downloaded !NODE_ARCHIVE_SIZE! bytes from !NODE_SOURCE!.>>"%NODE_DOWNLOAD_LOG%"
exit /b 0

:node_download_failed
echo.
echo   !RED![ERROR] Automatic Node.js download failed.!RESET!
echo.
echo   Please install Node.js manually:
echo   !CYAN!https://nodejs.org/en/download!RESET!
echo.
echo   After installing Node.js, restart OpenClaude Portable.
echo   Download log: !NODE_DOWNLOAD_LOG!
echo.
echo   Common causes: temporary CDN/network failure, antivirus blocking curl,
echo   TLS/certificate issues, or a restricted corporate network.
pause
exit /b 1

:after_node_download_helpers

:: 2.1 Check GitPortable
if not exist "%GIT_BASH%" goto repair_git
if not exist "%GIT_EXE%" goto repair_git
goto git_ready
:repair_git
if exist "%GIT_DIR%" (
    echo   !YELLOW![~] Incomplete GitPortable detected. Reinstalling...!RESET!
    rmdir /s /q "%GIT_DIR%"
)
if not exist "%GIT_BASH%" (
    echo   !YELLOW![~] GitPortable not found for Windows-x64. Downloading...!RESET!
    curl.exe -L "https://github.com/git-for-windows/git/releases/download/v%GIT_VERSION%.windows.1/PortableGit-%GIT_VERSION%-64-bit.7z.exe" -o "%ENGINE_DIR%\GitPortable.exe"
    if errorlevel 1 (
        echo   !RED![ERROR] Failed to download GitPortable!!RESET!
        pause
        exit /b 1
    )
    echo   !YELLOW![~] Extracting GitPortable...!RESET!
    echo   !DIM!    This can be silent for a few minutes on external drives.!RESET!
    "%ENGINE_DIR%\GitPortable.exe" -o"%GIT_DIR%" -y
    if errorlevel 1 (
        echo   !RED![ERROR] Failed to extract GitPortable!!RESET!
        del "%ENGINE_DIR%\GitPortable.exe" >nul 2>&1
        pause
        exit /b 1
    )
    del "%ENGINE_DIR%\GitPortable.exe"
    if not exist "%GIT_BASH%" goto incomplete_git
    if not exist "%GIT_EXE%" goto incomplete_git
    echo   !GREEN![OK] GitPortable installed to %GIT_DIR%!RESET!
)

goto git_ready
:incomplete_git
echo   !RED![ERROR] GitPortable install is incomplete.!RESET!
echo   !DIM!        Missing expected files under %GIT_DIR%\bin!RESET!
pause
exit /b 1
:git_ready
set "CLAUDE_CODE_GIT_BASH_PATH=%GIT_BASH%"
set "GIT_BASH=%GIT_BASH%"
set "PATH=%GIT_DIR%\cmd;%GIT_DIR%\bin;%GIT_DIR%\usr\bin;%PATH%"

:: 3. Check for flags (--offline, --quick)
set "SKIP_UPDATE=0"
set "QUICK_MODE=0"
for %%A in (%*) do (
    if /I "%%A"=="--offline" set "SKIP_UPDATE=1"
    if /I "%%A"=="--quick" set "QUICK_MODE=1"
)

if !SKIP_UPDATE!==1 (
    echo   !DIM![~] Offline mode - skipping update check!RESET!
) else (
    :: Only check for updates once per day using a timestamp file
    set "UPDATE_STAMP=%DATA_DIR%\last_update_check.txt"
    set "TODAY_DATE="
    for /f "tokens=*" %%D in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"') do set "TODAY_DATE=%%D"

    set "LAST_CHECK="
    if exist "!UPDATE_STAMP!" (
        set /p "LAST_CHECK="<"!UPDATE_STAMP!"
    )

    if "!LAST_CHECK!"=="!TODAY_DATE!" (
        echo   !DIM![~] Update check already done today - skipping!RESET!
    ) else (
        echo   !YELLOW![~] Checking for engine updates...!RESET!
        pushd "%ENGINE_DIR%"
        call npm.cmd outdated @anthropic-ai/claude-code >nul 2>&1
        if errorlevel 1 (
            echo   !YELLOW![~] New version detected! Upgrading...!RESET!
            call :install_engine "Upgrading"
            if errorlevel 1 exit /b 1
            echo   !GREEN![OK] Engine upgraded to latest version!!RESET!
        ) else (
            echo   !GREEN![OK] Claude Code is up to date!!RESET!
        )
        popd
        echo !TODAY_DATE!>"!UPDATE_STAMP!"
    )
)
echo.

:: 4. Check for settings file
if exist "%SETTINGS_FILE%" goto load_settings

:: If old ai_settings.env exists, migrate it
if exist "%ENV_FILE%" (
    echo   !YELLOW![INFO] Migrating legacy config to settings.json...!RESET!
    del "%ENV_FILE%"
)

:: ---------------------------------------------------------
::   FIRST-RUN SETUP — Claude Code Configuration
:: ---------------------------------------------------------
:show_backend_menu
echo !CYAN!=========================================================!RESET!
echo   !BOLD!AI BACKEND SELECTION!RESET!
echo !CYAN!=========================================================!RESET!
echo.
echo   !CYAN!1)!RESET! !BOLD!OmniRoute Gateway!RESET!  !DIM!- 290+ providers, immagini, video (LOCAL)!RESET!  !GREEN![CONSIGLIATO]!RESET!
echo   !CYAN!2)!RESET! !BOLD!Anthropic API!RESET!       !DIM!- Claude diretto (API key Anthropic)!RESET!
echo   !CYAN!3)!RESET! !BOLD!Custom Endpoint!RESET!     !DIM!- Qualsiasi endpoint compatibile Anthropic!RESET!
echo.
:prompt_setup
set "SETUP_SEL="
set /p "SETUP_SEL=  Select backend !CYAN!(1-3)!RESET!: "

if "!SETUP_SEL!"=="1" goto setup_omniroute
if "!SETUP_SEL!"=="2" goto setup_anthropic
if "!SETUP_SEL!"=="3" goto setup_custom_anthropic
echo   !RED![ERROR] Invalid selection. Please choose 1-3.!RESET!
goto prompt_setup

:: ---------------------------------------------------------
::   SETUP 1 — OMNIROUTE GATEWAY
:: ---------------------------------------------------------
:setup_omniroute
cls
echo.
echo   !CYAN!=========================================================!RESET!
echo     !BOLD!OMNIROUTE GATEWAY - Setup!RESET!
echo   !CYAN!=========================================================!RESET!
echo.
echo   OmniRoute e' un gateway AI con 290+ provider gratuiti.
echo   Supporta chat, coding, immagini, video, TTS, embeddings.
echo.

:: Check if OmniRoute is already installed
echo   !YELLOW![~] Verifico se OmniRoute e' installato...!RESET!
where omniroute >nul 2>&1
if not errorlevel 1 goto omni_found

:: Not installed
echo   !RED![X] OmniRoute NON e' installato!!RESET!
echo.
echo   1 - Installalo ora ^(npm install -g omniroute^)
echo   2 - Torna indietro
echo   3 - Configuro lo stesso ^(lo installerai dopo^)
echo.
set "OMNI_NOT_FOUND="
set /p "OMNI_NOT_FOUND=  Scegli ^(1-3^): "
if "!OMNI_NOT_FOUND!"=="2" goto prompt_setup
if "!OMNI_NOT_FOUND!"=="3" goto omni_skip_check
echo.
echo   !YELLOW![~] Avvio installazione in un nuovo terminale...!RESET!
start "OmniRoute Install" cmd /k "npm install -g omniroute && echo. && echo FATTO! Chiudi questa finestra. && pause"
echo   !DIM!  Aspetta che finisca l'installazione, poi premi un tasto qui...!RESET!
pause
goto setup_omniroute

:omni_found
echo   !GREEN![OK] OmniRoute CLI trovato.!RESET!

:omni_skip_check
echo.
echo   !YELLOW!Prima di continuare assicurati di aver fatto:!RESET!
echo     1. Avviato OmniRoute in un terminale ^(omniroute^)
echo     2. Creato una API key dalla dashboard ^(http://localhost:20128^)
echo     3. Connesso provider gratuiti ^(OpenCode, Qoder, Pollinations, Kiro^)
echo.

set /p "OMNI_BASE_URL=  URL OmniRoute [http://localhost:20128]: "
if "!OMNI_BASE_URL!"=="" set "OMNI_BASE_URL=http://localhost:20128"
if "!OMNI_BASE_URL:~-1!"=="/" set "OMNI_BASE_URL=!OMNI_BASE_URL:~0,-1!"

set /p "OMNI_API_KEY=  API Key ^(dalla dashboard^): "
if "!OMNI_API_KEY!"=="" set "OMNI_API_KEY=not-needed"
set "OMNI_API_KEY=!OMNI_API_KEY: =!"

:: Show model list instead of typing
echo.
echo   !CYAN!Scegli il modello:!RESET!
echo   !DIM!  I combo auto usano i provider che hai connesso.!RESET!
echo   !DIM!  Se un provider si esaurisce, passa al successivo.!RESET!
echo.
echo   !GREEN!Combo automatici:!RESET!
echo   !CYAN!1)!RESET! auto/best-coding       !DIM!- Migliore per programmare!RESET!
echo   !CYAN!2)!RESET! auto/best-fast          !DIM!- Risposte veloci!RESET!
echo   !CYAN!3)!RESET! auto/best-reasoning     !DIM!- Ragionamenti complessi!RESET!
echo   !CYAN!4)!RESET! auto/best-chat          !DIM!- Chat generale!RESET!
echo   !CYAN!5)!RESET! Scrivi un modello a mano
echo.
set "MODEL_PICK="
set /p "MODEL_PICK=  Scegli ^(1-5^) [Enter=1]: "
if "!MODEL_PICK!"=="" set "MODEL_PICK=1"

if "!MODEL_PICK!"=="1" set "OMNI_MODEL=auto/best-coding"
if "!MODEL_PICK!"=="2" set "OMNI_MODEL=auto/best-fast"
if "!MODEL_PICK!"=="3" set "OMNI_MODEL=auto/best-reasoning"
if "!MODEL_PICK!"=="4" set "OMNI_MODEL=auto/best-chat"
if "!MODEL_PICK!"=="5" goto omni_custom_model

if "!OMNI_MODEL!"=="" set "OMNI_MODEL=auto/best-coding"
goto omni_model_done

:omni_custom_model
set /p "OMNI_MODEL=  Scrivi il nome del modello: "
if "!OMNI_MODEL!"=="" set "OMNI_MODEL=auto/best-coding"

:omni_model_done

:: Write settings.json for Claude Code
if not exist "%CLAUDE_CONFIG_DIR%" mkdir "%CLAUDE_CONFIG_DIR%"
(
    echo {
    echo   "model": "!OMNI_MODEL!",
    echo   "env": {
    echo     "ANTHROPIC_BASE_URL": "!OMNI_BASE_URL!",
    echo     "ANTHROPIC_AUTH_TOKEN": "!OMNI_API_KEY!",
    echo     "ANTHROPIC_MODEL": "!OMNI_MODEL!",
    echo     "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY": "1"
    echo   }
    echo }
) > "%SETTINGS_FILE%"

set "PROVIDER_NAME=OmniRoute"
set "AI_DISPLAY_MODEL=!OMNI_MODEL!"
echo.
echo   !GREEN![OK] Configurazione salvata in settings.json!RESET!
echo   !DIM!    Per generare profili automatici usa: omniroute setup-claude!RESET!
echo   !DIM!    Per lanciare con profilo: omniroute launch --profile ^<nome^>!RESET!
goto setup_done

:: ---------------------------------------------------------
::   SETUP 2 — ANTHROPIC DIRECT
:: ---------------------------------------------------------
:setup_anthropic
echo.
echo   !CYAN!--- ANTHROPIC DIRECT SETUP ---!RESET!
echo.

set /p "ANTHROPIC_KEY=  Anthropic API Key (sk-ant-...): "
if "!ANTHROPIC_KEY!"=="" (
    echo   !RED![ERROR] API Key cannot be empty!!RESET!
    goto setup_anthropic
)
set "ANTHROPIC_KEY=!ANTHROPIC_KEY: =!"
set "KEY_MASK=!ANTHROPIC_KEY:~0,12!****!ANTHROPIC_KEY:~-4!"
echo   !DIM!Key: !KEY_MASK!!RESET!

echo.
echo   !YELLOW![~] Verifying API Key...!RESET!
powershell -NoProfile -Command "$headers = @{ 'x-api-key' = '!ANTHROPIC_KEY!'; 'anthropic-version' = '2023-06-01' }; try { $response = Invoke-RestMethod -Uri 'https://api.anthropic.com/v1/models' -Headers $headers -ErrorAction Stop; exit 0 } catch { exit 1 }"
if errorlevel 1 (
    echo   !RED![ERROR] Invalid or expired Anthropic API Key!!RESET!
    goto setup_anthropic
)
echo   !GREEN![OK] Key Verified!!RESET!
echo.

set /p "ANTHROPIC_MODEL=  Model (Enter per claude-sonnet-4-20250514): "
if "!ANTHROPIC_MODEL!"=="" set "ANTHROPIC_MODEL=claude-sonnet-4-20250514"

if not exist "%CLAUDE_CONFIG_DIR%" mkdir "%CLAUDE_CONFIG_DIR%"
(
    echo {
    echo   "model": "!ANTHROPIC_MODEL!",
    echo   "env": {
    echo     "ANTHROPIC_API_KEY": "!ANTHROPIC_KEY!",
    echo     "ANTHROPIC_MODEL": "!ANTHROPIC_MODEL!"
    echo   }
    echo }
) > "%SETTINGS_FILE%"

set "PROVIDER_NAME=Anthropic Claude"
set "AI_DISPLAY_MODEL=!ANTHROPIC_MODEL!"
echo.
echo   !GREEN![OK] Configurazione salvata!!RESET!
goto setup_done

:: ---------------------------------------------------------
::   SETUP 3 — CUSTOM ANTHROPIC-COMPATIBLE ENDPOINT
:: ---------------------------------------------------------
:setup_custom_anthropic
echo.
echo   !CYAN!--- CUSTOM ANTHROPIC-COMPATIBLE SETUP ---!RESET!
echo.
echo   Per endpoint che accettano formato Anthropic Messages API.
echo   Esempi: OpenRouter, LiteLLM, qualsiasi gateway Anthropic-compatibile.
echo.

set /p "CUSTOM_BASE_URL=  Base URL (senza /v1, es. https://openrouter.ai/api): "
if "!CUSTOM_BASE_URL!"=="" (
    echo   !RED![ERROR] Base URL cannot be empty!!RESET!
    goto setup_custom_anthropic
)
if "!CUSTOM_BASE_URL:~-1!"=="/" set "CUSTOM_BASE_URL=!CUSTOM_BASE_URL:~0,-1!"

set /p "CUSTOM_API_KEY=  API Key / Auth Token: "
if "!CUSTOM_API_KEY!"=="" set "CUSTOM_API_KEY=not-needed"
set "CUSTOM_API_KEY=!CUSTOM_API_KEY: =!"

set /p "CUSTOM_MODEL=  Model name (es. openai/gpt-4o): "
if "!CUSTOM_MODEL!"=="" set "CUSTOM_MODEL=auto"

echo.
echo   !YELLOW![~] Testing connection...!RESET!
powershell -NoProfile -Command "$headers = @{ 'x-api-key' = '!CUSTOM_API_KEY!'; 'anthropic-version' = '2023-06-01' }; try { Invoke-RestMethod -Uri '!CUSTOM_BASE_URL!/v1/models' -Headers $headers -TimeoutSec 10 -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
    echo   !YELLOW![WARN] Could not verify endpoint. Saving anyway...!RESET!
)

if not exist "%CLAUDE_CONFIG_DIR%" mkdir "%CLAUDE_CONFIG_DIR%"
(
    echo {
    echo   "model": "!CUSTOM_MODEL!",
    echo   "env": {
    echo     "ANTHROPIC_BASE_URL": "!CUSTOM_BASE_URL!",
    echo     "ANTHROPIC_AUTH_TOKEN": "!CUSTOM_API_KEY!",
    echo     "ANTHROPIC_MODEL": "!CUSTOM_MODEL!"
    echo   }
    echo }
) > "%SETTINGS_FILE%"

set "PROVIDER_NAME=Custom Endpoint"
set "AI_DISPLAY_MODEL=!CUSTOM_MODEL!"
echo.
echo   !GREEN![OK] Configurazione salvata!!RESET!
goto setup_done

:: ---------------------------------------------------------
::   SETUP DONE — Common finish
:: ---------------------------------------------------------
:setup_done
echo.
echo   !GREEN!=========================================================!RESET!
echo   !GREEN!  Setup completato!!RESET!
echo   !GREEN!=========================================================!RESET!
echo.
echo   !DIM!  Per cambiare modello in futuro: modifica %SETTINGS_FILE%!RESET!
echo   !DIM!  Oppure usa /model dentro Claude Code.!RESET!
echo.
pause
goto load_settings

:finish_setup
echo.
echo   !GREEN![OK] Settings saved!!RESET!
echo.

:: ---------------------------------------------------------
::   LOAD SETTINGS + WELCOME BACK SCREEN
:: ---------------------------------------------------------
:load_settings
:: Load settings from settings.json (Claude Code format)
if not exist "%SETTINGS_FILE%" goto setup_needed

:: Check if settings.json has a backend config (not just Claude Code defaults)
findstr /C:"ANTHROPIC_BASE_URL" "%SETTINGS_FILE%" >nul 2>&1
if errorlevel 1 (
    findstr /C:"ANTHROPIC_API_KEY" "%SETTINGS_FILE%" >nul 2>&1
    if errorlevel 1 goto setup_needed
)

set "PROVIDER_NAME=Claude Code"
set "AI_DISPLAY_MODEL=auto"

:: Simple text-based detection (no PowerShell JSON parsing needed)
findstr /C:"localhost:20128" "%SETTINGS_FILE%" >nul 2>&1
if not errorlevel 1 set "PROVIDER_NAME=OmniRoute Gateway"

findstr /C:"ANTHROPIC_BASE_URL" "%SETTINGS_FILE%" >nul 2>&1
if not errorlevel 1 (
    findstr /C:"localhost:20128" "%SETTINGS_FILE%" >nul 2>&1
    if errorlevel 1 set "PROVIDER_NAME=Custom Endpoint"
)

findstr /C:"ANTHROPIC_API_KEY" "%SETTINGS_FILE%" >nul 2>&1
if not errorlevel 1 (
    findstr /C:"ANTHROPIC_BASE_URL" "%SETTINGS_FILE%" >nul 2>&1
    if errorlevel 1 set "PROVIDER_NAME=Anthropic Claude"
)

:: Extract model using findstr
for /f "tokens=2 delims=: " %%M in ('findstr /C:"\"model\":" "%SETTINGS_FILE%" 2^>nul') do (
    set "AI_DISPLAY_MODEL=%%~M"
    set "AI_DISPLAY_MODEL=!AI_DISPLAY_MODEL:"=!"
    set "AI_DISPLAY_MODEL=!AI_DISPLAY_MODEL:,=!"
)
if "!AI_DISPLAY_MODEL!"=="" set "AI_DISPLAY_MODEL=auto"

title TechTonic Forge - !PROVIDER_NAME! - !AI_DISPLAY_MODEL!

echo !CYAN!=========================================================!RESET!
echo   !BOLD!TechTonic Forge!RESET!
echo !CYAN!=========================================================!RESET!
echo.
echo   !BOLD!Backend!RESET! : !GREEN!!PROVIDER_NAME!!RESET!
echo   !BOLD!Model!RESET!   : !GREEN!!AI_DISPLAY_MODEL!!RESET!
echo   !BOLD!Config!RESET!  : !DIM!!SETTINGS_FILE!!RESET!
echo   !BOLD!Data!RESET!    : !DIM!Portable Mode (No PC Leaks)!RESET!
echo.
echo !CYAN!=========================================================!RESET!
echo.
goto prompt_launch_mode

:setup_needed
echo.
echo   !YELLOW![!] No settings.json found. Running first-time setup...!RESET!
echo.
goto prompt_setup

:prompt_launch_mode
:: Quick mode: skip menu, go straight to limitless
if !QUICK_MODE!==1 (
    echo   !RED!!BOLD!QUICK LAUNCH - Limitless Mode!RESET!
    goto launch_limitless
)
echo   !BOLD!Select Action:!RESET!
echo   🚀 !CYAN!1)!RESET! !GREEN!CLAUDE CODE!RESET!         !DIM!- Normal Mode (Auto-starts in 10s)!RESET!
echo   ⚡ !CYAN!2)!RESET! !RED!Limitless Mode!RESET!    !DIM!- Auto-executes everything (Advanced)!RESET!
echo   !DIM!─────────────────────────────────────────────────────────!RESET!
echo   🔄 !CYAN!3)!RESET! !BOLD!Change Model!RESET!     !DIM!- Scegli tra i modelli disponibili!RESET!
echo   📊 !CYAN!4)!RESET! !BOLD!Open Dashboard!RESET!    !DIM!- Chat Web UI + genera immagini!RESET!
echo   🤖 !CYAN!5)!RESET! !BOLD!Agents e Team!RESET!     !DIM!- Agenti AI specializzati + Team Orchestrator!RESET!
echo   ⚙️  !CYAN!6)!RESET! !BOLD!Reconfigure!RESET!      !DIM!- Cambia backend o API key!RESET!
echo.
echo   !DIM!  Auto-launching in 10 seconds... press a key to choose.!RESET!
echo.
set /p "=  Select action (1-6): " <nul
choice /c 123456 /n /t 10 /d 1
set "LAUNCH_MODE=!ERRORLEVEL!"
:menu_done
echo.

if "!LAUNCH_MODE!"=="1" goto launch_normal
if "!LAUNCH_MODE!"=="2" goto launch_limitless
if "!LAUNCH_MODE!"=="3" goto quick_model_change
if "!LAUNCH_MODE!"=="4" (
    echo.
    call "%USB_ROOT%tools\Open_Dashboard.bat"
    exit /b
)
if "!LAUNCH_MODE!"=="5" (
    echo.
    call "%USB_ROOT%tools\Open_Agents.bat"
    exit /b
)
if "!LAUNCH_MODE!"=="6" (
    echo.
    del "%SETTINGS_FILE%" >nul 2>&1
    goto show_backend_menu
)
echo   !RED![ERROR] Invalid selection.!RESET!
echo.
goto prompt_launch_mode

:quick_model_change
cls
echo.
echo   !CYAN!=========================================================!RESET!
echo     !BOLD!QUICK MODEL CHANGE!RESET!
echo   !CYAN!=========================================================!RESET!
echo.
echo   Scegli il modello per Claude Code:
echo.
echo   !GREEN!Combo automatici OmniRoute:!RESET!
echo   !CYAN!1)!RESET! auto/best-coding       !DIM!- Migliore per programmare!RESET!
echo   !CYAN!2)!RESET! auto/best-fast          !DIM!- Risposte veloci!RESET!
echo   !CYAN!3)!RESET! auto/best-reasoning     !DIM!- Ragionamenti complessi!RESET!
echo   !CYAN!4)!RESET! auto/best-chat          !DIM!- Chat generale!RESET!
echo   !CYAN!5)!RESET! auto/pro-coding         !DIM!- Programmazione avanzata!RESET!
echo.
echo   !YELLOW!Modelli specifici:!RESET!
echo   !CYAN!6)!RESET! claude-sonnet-4-20250514  !DIM!- Claude diretto (se disponibile)!RESET!
echo   !CYAN!7)!RESET! Scrivi un modello a mano
echo   !CYAN!8)!RESET! Torna al menu
echo.
set "MODEL_PICK="
set /p "MODEL_PICK=  Scegli (1-8): "

if "!MODEL_PICK!"=="1" set "NEW_MODEL=auto/best-coding"
if "!MODEL_PICK!"=="2" set "NEW_MODEL=auto/best-fast"
if "!MODEL_PICK!"=="3" set "NEW_MODEL=auto/best-reasoning"
if "!MODEL_PICK!"=="4" set "NEW_MODEL=auto/best-chat"
if "!MODEL_PICK!"=="5" set "NEW_MODEL=auto/pro-coding"
if "!MODEL_PICK!"=="6" set "NEW_MODEL=claude-sonnet-4-20250514"
if "!MODEL_PICK!"=="7" goto custom_model_input
if "!MODEL_PICK!"=="8" goto prompt_launch_mode

if "!NEW_MODEL!"=="" (
    echo   !RED!Scelta non valida.!RESET!
    pause
    goto quick_model_change
)

:: Update settings.json with the new model
powershell -NoProfile -Command "$s = Get-Content '%SETTINGS_FILE%' -Raw | ConvertFrom-Json; $s.model = '!NEW_MODEL!'; if ($s.env) { $s.env.ANTHROPIC_MODEL = '!NEW_MODEL!' }; $s | ConvertTo-Json -Depth 5 | Set-Content '%SETTINGS_FILE%' -Encoding UTF8"
echo.
echo   !GREEN![OK] Modello cambiato in: !NEW_MODEL!!RESET!
echo   !DIM!  Riavvia Claude Code per usarlo.!RESET!
pause
goto prompt_launch_mode

:custom_model_input
echo.
set /p "NEW_MODEL=  Scrivi il nome del modello: "
if "!NEW_MODEL!"=="" goto quick_model_change
powershell -NoProfile -Command "$s = Get-Content '%SETTINGS_FILE%' -Raw | ConvertFrom-Json; $s.model = '!NEW_MODEL!'; if ($s.env) { $s.env.ANTHROPIC_MODEL = '!NEW_MODEL!' }; $s | ConvertTo-Json -Depth 5 | Set-Content '%SETTINGS_FILE%' -Encoding UTF8"
echo.
echo   !GREEN![OK] Modello cambiato in: !NEW_MODEL!!RESET!
pause
goto prompt_launch_mode

:launch_limitless
echo.
echo   !RED!!BOLD![!] LIMITLESS MODE ACTIVATED!RESET!
set "CMD_ARGS=--dangerously-skip-permissions"
goto do_launch

:launch_normal
echo.
echo   !GREEN![OK] Normal mode selected.!RESET!
set "CMD_ARGS="
goto do_launch

:do_launch
:: Quick check: if OmniRoute backend, verify it's reachable
findstr /C:"localhost:20128" "%SETTINGS_FILE%" >nul 2>&1
if not errorlevel 1 (
    powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://localhost:20128/v1/models' -TimeoutSec 3 -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 (
        echo   !GREEN![OK] OmniRoute raggiungibile.!RESET!
    ) else (
        echo   !YELLOW![WARN] OmniRoute non risponde su localhost:20128!RESET!
        echo   !DIM!  Avvia OmniRoute in un altro terminale con: omniroute!RESET!
    )
    echo.
)

:launch_now
echo   !CYAN![~] Starting Claude Code...!RESET!
echo.

pushd "%ENGINE_DIR%"
if not exist "%CC_CLI%" (
    echo   !RED![ERROR] Claude Code not found. Restart START.bat to repair.!RESET!
    popd
    goto engine_done
)

:: Claude Code reads settings.json from CLAUDE_CONFIG_DIR automatically
call "%NODE_DIR%\node.exe" "%CC_CLI%" !CMD_ARGS!
:engine_done
popd

pause
