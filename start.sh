#!/bin/bash
# =================================================================
#  Claude Code Portable + OmniRoute USB — Linux/macOS
# =================================================================
set -e

CYAN='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'
DIM='\033[90m'; BOLD='\033[1m'; RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"
ENGINE_DIR="$ROOT_DIR/engine"
DATA_DIR="$ROOT_DIR/data"
SETTINGS_FILE="$DATA_DIR/openclaude/settings.json"
NPM_CACHE_DIR="$DATA_DIR/npm-cache"
NODE_VERSION="22.23.2"
NODE_DOWNLOAD_LOG="$ENGINE_DIR/node-download.log"

# Detect OS and arch
OS_NAME=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
if [ "$OS_NAME" = "darwin" ]; then PLATFORM="darwin"; NODE_ARCHIVE_EXT="tar.gz"
elif [ "$OS_NAME" = "linux" ]; then PLATFORM="linux"; NODE_ARCHIVE_EXT="tar.xz"
else echo -e "${RED}[ERROR] Sistema non supportato: $OS_NAME${RESET}"; exit 1; fi

if [ "$ARCH" = "x86_64" ] || [ "$ARCH" = "amd64" ]; then NODE_ARCH="x64"
elif [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then NODE_ARCH="arm64"
else echo -e "${RED}[ERROR] Architettura non supportata: $ARCH${RESET}"; exit 1; fi

NODE_DIR_NAME="node-$PLATFORM-$NODE_ARCH"
NODE_DIR="$ENGINE_DIR/$NODE_DIR_NAME"
NODE_BIN="$NODE_DIR/bin/node"
NPM_BIN="$NODE_DIR/bin/npm"
CLAUDE_CODE_DIR="$ENGINE_DIR/node_modules/@anthropic-ai/claude-code"
CC_CLI="$CLAUDE_CODE_DIR/cli-wrapper.cjs"

# Portable environment
export CLAUDE_CONFIG_DIR="$DATA_DIR/openclaude"
export HOME="$DATA_DIR/home"
export USERPROFILE="$HOME"
export XDG_CONFIG_HOME="$DATA_DIR/config"
export XDG_DATA_HOME="$DATA_DIR/app_data"
export XDG_CACHE_HOME="$DATA_DIR/cache"
mkdir -p "$CLAUDE_CONFIG_DIR" "$HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$DATA_DIR" "$ENGINE_DIR"

# ─── Banner ────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}    ____            __        __    __        ___    ____${RESET}"
echo -e "${CYAN}   / __ \\____  ____/ /_____ _/ /_  / /__     /   |  /  _/${RESET}"
echo -e "${CYAN}  / /_/ / __ \\/ __/ __/ __ \`/ __ \\/ / _ \\   / /| |  / /  ${RESET}"
echo -e "${CYAN} / ____/ /_/ / / / /_/ /_/ / /_/ / /  __/  / ___ |_/ /   ${RESET}"
echo -e "${CYAN}/_/    \\____/_/  \\__/\\__,_/_.___/_/\\___/  /_/  |_/___/   ${RESET}"
echo ""
echo -e "${CYAN}=========================================================${RESET}"
echo -e "  ${BOLD}TechTonic Forge - AI Dashboard${RESET}"
echo -e "${CYAN}=========================================================${RESET}"
echo ""

# ─── 1. Download Node.js if needed ─────────────────────────────────
if [ ! -f "$NODE_BIN" ]; then
    echo -e "${YELLOW}[~] Node.js non trovato. Scarico v${NODE_VERSION} per ${PLATFORM}-${NODE_ARCH}...${RESET}"
    NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${PLATFORM}-${NODE_ARCH}.${NODE_ARCHIVE_EXT}"
    TEMP_TAR="$ENGINE_DIR/node.${NODE_ARCHIVE_EXT}"
    curl --fail --location --retry 3 --connect-timeout 20 "$NODE_URL" -o "$TEMP_TAR" || {
        echo -e "${RED}[ERROR] Download Node.js fallito.${RESET}"
        echo "Scarica Node.js da https://nodejs.org e riprova."
        exit 1
    }
    echo -e "${YELLOW}[~] Estrazione Node.js...${RESET}"
    rm -rf "$NODE_DIR"
    mkdir -p "$NODE_DIR"
    tar -xf "$TEMP_TAR" -C "$NODE_DIR" --strip-components=1
    rm "$TEMP_TAR"
    echo -e "${GREEN}[OK] Node.js installato.${RESET}"
fi
export PATH="$NODE_DIR/bin:$PATH"

# ─── 2. Install Claude Code if needed ──────────────────────────────
if [ ! -f "$CC_CLI" ]; then
    echo -e "${YELLOW}[~] Installazione Claude Code...${RESET}"
    echo -e "${DIM}    Ci vogliono 3-8 minuti. Log: $ENGINE_DIR/engine-install.log${RESET}"
    mkdir -p "$NPM_CACHE_DIR"
    cd "$ENGINE_DIR"
    "$NPM_BIN" install @anthropic-ai/claude-code@latest --ignore-scripts --no-audit --no-fund --loglevel=warn --cache "$NPM_CACHE_DIR" >> "$ENGINE_DIR/engine-install.log" 2>&1 &
    NPM_PID=$!
    ELAPSED=0
    while kill -0 "$NPM_PID" 2>/dev/null; do
        sleep 5; ELAPSED=$((ELAPSED + 5))
        echo -ne "\r  ${DIM}[${ELAPSED}s] Installazione in corso...${RESET}"
    done
    wait "$NPM_PID" || {
        echo -e "\n${RED}[ERROR] Installazione Claude Code fallita.${RESET}"
        echo "Controlla il log: $ENGINE_DIR/engine-install.log"
        exit 1
    }
    echo -e "\n${GREEN}[OK] Claude Code installato.${RESET}"
    cd "$ROOT_DIR"
fi

# ─── 3. Setup or Load config ───────────────────────────────────────
if [ -f "$SETTINGS_FILE" ] && grep -q "ANTHROPIC_BASE_URL\|ANTHROPIC_API_KEY" "$SETTINGS_FILE" 2>/dev/null; then
    # Config exists, load it
    MODEL=$(grep -o '"model"[[:space:]]*:[[:space:]]*"[^"]*"' "$SETTINGS_FILE" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
    [ -z "$MODEL" ] && MODEL="auto"

    if grep -q "localhost:20128" "$SETTINGS_FILE" 2>/dev/null; then
        PROVIDER="OmniRoute Gateway"
    elif grep -q "ANTHROPIC_BASE_URL" "$SETTINGS_FILE" 2>/dev/null; then
        PROVIDER="Custom Endpoint"
    else
        PROVIDER="Anthropic Claude"
    fi
else
    # First run: setup
    echo -e "${CYAN}=========================================================${RESET}"
    echo -e "  ${BOLD}AI BACKEND SELECTION${RESET}"
    echo -e "${CYAN}=========================================================${RESET}"
    echo ""
    echo -e "  ${CYAN}1)${RESET} ${BOLD}OmniRoute Gateway${RESET}  ${DIM}- 290+ providers (LOCAL)${RESET}  ${GREEN}[CONSIGLIATO]${RESET}"
    echo -e "  ${CYAN}2)${RESET} ${BOLD}Anthropic API${RESET}       ${DIM}- Claude diretto${RESET}"
    echo -e "  ${CYAN}3)${RESET} ${BOLD}Custom Endpoint${RESET}     ${DIM}- Endpoint Anthropic-compatibile${RESET}"
    echo ""
    read -p "  Scegli (1-3): " SETUP_SEL

    case "$SETUP_SEL" in
        1)
            echo ""
            echo -e "${CYAN}--- OMNIROUTE GATEWAY SETUP ---${RESET}"
            echo ""
            # Check if omniroute is installed
            if ! command -v omniroute &>/dev/null; then
                echo -e "${RED}[X] OmniRoute NON e' installato!${RESET}"
                echo "  Installa con: npm install -g omniroute"
                read -p "  Continuare comunque? (s/N): " CONT
                [[ ! "$CONT" =~ ^[Ss]$ ]] && exit 1
            else
                echo -e "${GREEN}[OK] OmniRoute CLI trovato.${RESET}"
            fi
            echo ""
            read -p "  URL OmniRoute [http://localhost:20128]: " OMNI_URL
            [ -z "$OMNI_URL" ] && OMNI_URL="http://localhost:20128"
            OMNI_URL="${OMNI_URL%/}"
            read -p "  API Key: " OMNI_KEY
            [ -z "$OMNI_KEY" ] && OMNI_KEY="not-needed"

            echo ""
            echo -e "${CYAN}Scegli il modello:${RESET}"
            echo "  1) auto/best-coding       - Programmazione"
            echo "  2) auto/best-fast          - Risposte veloci"
            echo "  3) auto/best-reasoning     - Ragionamenti complessi"
            echo "  4) auto/best-chat          - Chat generale"
            echo "  5) Scrivi a mano"
            read -p "  Scegli (1-5) [1]: " MODEL_PICK
            [ -z "$MODEL_PICK" ] && MODEL_PICK="1"
            case "$MODEL_PICK" in
                1) MODEL="auto/best-coding";;
                2) MODEL="auto/best-fast";;
                3) MODEL="auto/best-reasoning";;
                4) MODEL="auto/best-chat";;
                5) read -p "  Modello: " MODEL; [ -z "$MODEL" ] && MODEL="auto/best-coding";;
                *) MODEL="auto/best-coding";;
            esac

            mkdir -p "$(dirname "$SETTINGS_FILE")"
            cat > "$SETTINGS_FILE" << EOF
{
  "model": "$MODEL",
  "env": {
    "ANTHROPIC_BASE_URL": "$OMNI_URL",
    "ANTHROPIC_AUTH_TOKEN": "$OMNI_KEY",
    "ANTHROPIC_MODEL": "$MODEL",
    "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY": "1"
  }
}
EOF
            PROVIDER="OmniRoute Gateway"
            ;;
        2)
            echo ""
            read -p "  Anthropic API Key (sk-ant-...): " ANTH_KEY
            read -p "  Modello [claude-sonnet-4-20250514]: " ANTH_MODEL
            [ -z "$ANTH_MODEL" ] && ANTH_MODEL="claude-sonnet-4-20250514"
            MODEL="$ANTH_MODEL"
            mkdir -p "$(dirname "$SETTINGS_FILE")"
            cat > "$SETTINGS_FILE" << EOF
{
  "model": "$ANTH_MODEL",
  "env": {
    "ANTHROPIC_API_KEY": "$ANTH_KEY"
  }
}
EOF
            PROVIDER="Anthropic Claude"
            ;;
        3)
            echo ""
            read -p "  Base URL (senza /v1): " CUSTOM_URL
            read -p "  API Key / Auth Token: " CUSTOM_KEY
            read -p "  Modello: " CUSTOM_MODEL
            [ -z "$CUSTOM_MODEL" ] && CUSTOM_MODEL="auto"
            MODEL="$CUSTOM_MODEL"
            mkdir -p "$(dirname "$SETTINGS_FILE")"
            cat > "$SETTINGS_FILE" << EOF
{
  "model": "$CUSTOM_MODEL",
  "env": {
    "ANTHROPIC_BASE_URL": "$CUSTOM_URL",
    "ANTHROPIC_AUTH_TOKEN": "$CUSTOM_KEY",
    "ANTHROPIC_MODEL": "$CUSTOM_MODEL"
  }
}
EOF
            PROVIDER="Custom Endpoint"
            ;;
        *) echo -e "${RED}Scelta non valida.${RESET}"; exit 1;;
    esac
    echo ""
    echo -e "${GREEN}[OK] Configurazione salvata in settings.json${RESET}"
fi

# ─── 4. Welcome screen ─────────────────────────────────────────────
echo ""
echo -e "${CYAN}=========================================================${RESET}"
echo -e "  ${BOLD}TechTonic Forge${RESET}"
echo -e "${CYAN}=========================================================${RESET}"
echo ""
echo -e "  ${BOLD}Backend${RESET} : ${GREEN}${PROVIDER}${RESET}"
echo -e "  ${BOLD}Modello${RESET} : ${GREEN}${MODEL}${RESET}"
echo -e "  ${BOLD}Config${RESET}  : ${DIM}${SETTINGS_FILE}${RESET}"
echo ""

# ─── 5. Quick OmniRoute check ──────────────────────────────────────
if echo "$SETTINGS_FILE" | grep -q "localhost:20128" 2>/dev/null || grep -q "localhost:20128" "$SETTINGS_FILE" 2>/dev/null; then
    if curl -sf -m 3 "http://localhost:20128/v1/models" > /dev/null 2>&1; then
        echo -e "  ${GREEN}[OK] OmniRoute raggiungibile.${RESET}"
    else
        echo -e "  ${YELLOW}[WARN] OmniRoute non risponde. Avvia con: omniroute${RESET}"
    fi
    echo ""
fi

# ─── 6. Launch menu ────────────────────────────────────────────────
while true; do
    echo -e "  ${BOLD}Select Action:${RESET}"
    echo -e "  🚀 ${CYAN}1)${RESET} ${GREEN}Launch AI${RESET}         ${DIM}- Normal Mode${RESET}"
    echo -e "  ⚡ ${CYAN}2)${RESET} ${RED}Limitless Mode${RESET}    ${DIM}- Auto-executes${RESET}"
    echo "  ─────────────────────────────────────────────"
    echo -e "  📊 ${CYAN}3)${RESET} ${BOLD}Open Dashboard${RESET}    ${DIM}- Web UI${RESET}"
    echo -e "  ⚙️  ${CYAN}4)${RESET} ${BOLD}Reconfigure${RESET}      ${DIM}- Cambia backend${RESET}"
    echo ""

    read -p "  Scegli (1-4) [1]: " LAUNCH_MODE
    [ -z "$LAUNCH_MODE" ] && LAUNCH_MODE="1"

    case "$LAUNCH_MODE" in
        1) CMD_ARGS=""; break;;
        2) CMD_ARGS="--dangerously-skip-permissions"; break;;
        3)
            echo "Avvio dashboard su http://localhost:3000 ..."
            "$NODE_BIN" "$ROOT_DIR/dashboard/server.mjs" &
            sleep 1
            ;;
        4)
            rm -f "$SETTINGS_FILE"
            exec "$0"
            ;;
        *) echo -e "${RED}Scelta non valida.${RESET}";;
    esac
done

# ─── 7. Launch ──────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[~] Avvio Claude Code...${RESET}"
echo ""
cd "$ENGINE_DIR"
exec "$NODE_BIN" "$CC_CLI" $CMD_ARGS
