# Claude Code Portatile + OmniRoute

> **Claude Code ufficiale su chiavetta USB, connesso a OmniRoute per usare 290+ provider AI — gratis.**
>
> 🪟 Windows 10/11 • 🐧 Linux • 🍎 macOS

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Cosa contiene questo pacchetto

```
ClaudeCode-Portable/
├── LEGGIMI.md                  ← Questa guida
├── START.bat                   ← Avvio Windows (doppio click)
├── start.sh                    ← Avvio Linux/macOS (./start.sh)
├── .gitignore
├── LICENSE
├── data/                       ← Dati, chiavi, cronologia (creato al primo avvio)
├── engine/                     ← Node.js + Claude Code (scaricate al primo avvio)
├── dashboard/
│   ├── server.mjs              ← Server dashboard web
│   └── index.html              ← Interfaccia chat
└── tools/
    ├── Change_Model.bat         ← Cambio modello rapido (Windows)
    ├── Open_Dashboard.bat       ← Avvia dashboard (Windows)
    └── install-engine.ps1       ← Script installazione
```

---

## Cosa ti serve

- **Windows 10/11**, **Linux** o **macOS**
- **Chiavetta USB** da 4 GB o più (USB 3.x consigliato)
- **Connessione internet** — solo al primo avvio per scaricare Node.js e Claude Code
- **OmniRoute** installato sul PC (vedi Passo 1)

---

## GUIDA PASSO PASSO

### Passo 1 — Installa OmniRoute sul PC

Apri un terminale (PowerShell) e digita:

```powershell
# Verifica se è già installato
omniroute --version

# Se non è installato:
npm install -g omniroute
```

> ⚠️ Se `npm` non è riconosciuto, installa prima Node.js da https://nodejs.org (versione 22 LTS o 24 LTS)

---

### Passo 2 — Avvia OmniRoute

In un terminale separato (tienilo aperto):

```powershell
omniroute
```

- Si apre il browser su **http://localhost:20128**
- Password iniziale: **CHANGEME** (cambiala subito dopo il login)

---

### Passo 3 — Crea una API Key

Nella dashboard OmniRoute (`http://localhost:20128`):

1. Menu a sinistra → **API Keys**
2. Clicca **"+ Create Your First Key"**
3. Nome: `claude-code`
4. Lascia tutto come default
5. Clicca **Create**
6. **Copia la chiave** — ti servirà dopo

---

### Passo 4 — Estrai il pacchetto sulla chiavetta

1. Scarica lo ZIP del progetto
2. Estrailo sulla chiavetta USB

---

### Passo 5 — Primo avvio

1. Assicurati che **OmniRoute sia in esecuzione** (Passo 2)

**Windows:**
- Doppio click su `START.bat`

**Linux/macOS:**
```bash
chmod +x start.sh
./start.sh
```

Al primo avvio il launcher scarica automaticamente:

| Download | Dimensione | Tempo (USB 3.0) | Tempo (USB 2.0) |
|---|---|---|---|
| Node.js portatile | ~25 MB | 1-2 min | 3-5 min |
| Claude Code | ~280 MB | 3-5 min | 8-15 min |

Vedrai una barra di avanzamento con puntini che scorrono mentre installa.

---

### Passo 6 — Configura il backend

Dopo l'installazione appare il menu di selezione:

```
=========================================================
  AI BACKEND SELECTION
=========================================================

  1) OmniRoute Gateway  - 290+ providers [CONSIGLIATO]
  2) Anthropic API      - Claude diretto (a pagamento)
  3) Custom Endpoint    - Qualsiasi endpoint Anthropic

  Select backend (1-3):
```

Scegli **1** (OmniRoute Gateway).

Ti verrà chiesto:

- **URL OmniRoute**: premi Invio (default `http://localhost:20128`)
- **API Key**: incolla la chiave copiata al Passo 3
- **Modello**: scegli dalla lista:

```
  Combo automatici:
  1) auto/best-coding       - Migliore per programmare
  2) auto/best-fast          - Risposte veloci
  3) auto/best-reasoning     - Ragionamenti complessi
  4) auto/best-chat          - Chat generale
  5) Scrivi un modello a mano

  Scegli (1-5) [Enter=1]:
```

Premi **1** (o Invio) per `auto/best-coding`.

---

### Passo 7 — Usa Claude Code

Dal menu principale:

```
  Select Action:
  1) Launch AI         - Normal Mode
  2) Limitless Mode    - Auto-esegue tutto
  ─────────────────────────────────────
  3) Change Model      - Cambia modello rapidamente
  4) Open Dashboard    - Interfaccia web
  5) Reconfigure       - Cambia backend o API key
```

Scegli **1** per avviare Claude Code.

---

## COMANDI UTILI DENTRO CLAUDE CODE

| Comando | Cosa fa |
|---|---|
| `/status` | Mostra backend, modello e configurazione |
| `/model` | Cambia modello al volo |
| `/help` | Lista di tutti i comandi |
| `TAB` | Auto-approva invece di premere Invio |

---

## CAMBIARE MODELLO

### Modo 1 — Dal menu (il più facile)

Scegli opzione **3) Change Model** e seleziona il modello dalla lista. Un click e sei a posto.

### Modo 2 — Da dentro Claude Code

Digita `/model` e scegli dalla lista.

### Modo 3 — Modifica diretta

Apri `data/openclaude/settings.json` e cambia la riga `"model"`.

---

## PROVIDER GRATUITI DISPONIBILI

I combo `auto/best-*` usano automaticamente i provider che hai connesso in OmniRoute. I migliori gratuiti:

| Provider | Modelli | Auth | Quota |
|---|---|---|---|
| OpenCode Zen | GPT-4o, Claude, DeepSeek V4 | Nessuna | Illimitata |
| Qoder | Kimi-K2, DeepSeek-R1 | Nessuna | Illimitata |
| Pollinations | GPT-5, Claude, Gemini | Nessuna | Illimitata |
| Kiro AI | Claude Sonnet 4.5 | Nessuna | 50 crediti/mese |

Per connetterli: dashboard OmniRoute → **Providers** → cerca il provider → clicca **Connect**.

---

## RISOLUZIONE PROBLEMI

| Problema | Soluzione |
|---|---|
| `Node.js non trovato` | START.bat lo scarica da solo. Se fallisce, installalo da nodejs.org |
| `Claude Code install failed` | Controlla `data/engine-install.log`. Su USB 2.0 può servire pazienza |
| `OmniRoute non risponde` | Avvia `omniroute` in un terminale separato |
| `Stream ended before producing...` | Errore momentaneo di OmniRoute. Riprova |
| `Invalid API key` | La chiave non è corretta. Rilancia Reconfigure (opzione 5) |
| La finestra si chiude da sola | Riapri START.bat, seleziona la stessa opzione |

---

## STRUTTURA DEL FILE settings.json

```json
{
  "model": "auto/best-coding",
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20128",
    "ANTHROPIC_AUTH_TOKEN": "sk-la-tua-chiave",
    "ANTHROPIC_MODEL": "auto/best-coding",
    "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY": "1"
  },
  "permissions": {
    "allow": ["Bash(npm)", "Bash(git)", "Bash(node)", "Read", "Write", "Edit", "Glob", "Grep"]
  }
}
```

- `ANTHROPIC_BASE_URL` — punta a OmniRoute (senza `/v1` finale)
- `ANTHROPIC_AUTH_TOKEN` — la API key creata nella dashboard
- `model` — cambiabile al volo con opzione 3 del menu

---

## CREDITS

- Claude Code — [Anthropic](https://anthropic.com)
- OmniRoute — [github.com/diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute)
- Licenza — MIT
