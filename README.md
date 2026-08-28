# Claude Code USB · Multi-Agent

> **Claude Code ufficiale portatile (su chiavetta USB) + dashboard web multi-agente, collegata a OmniRoute per usare centinaia di modelli AI.**
>
> 🪟 Windows 10/11 · 🐧 Linux · 🍎 macOS

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Un launcher che porta **Claude Code** (il tool da terminale di Anthropic) su una chiavetta USB, insieme a una **dashboard web** con un **team di agenti AI** (Developer, Project Manager, Code Reviewer, Architect, Security, …) che collaborano tra loro in stile chat. Il tutto è instradato attraverso **OmniRoute**, un gateway che espone 290+ provider AI — molti dei quali gratuiti.

---

## Cosa fa questo progetto

| Componente | Descrizione |
|---|---|
| **Launcher portatile** | `START.bat` / `start.sh` scarica Node.js e Claude Code al primo avvio, poi li esegue direttamente dalla chiavetta. |
| **Dashboard web** | Interfaccia in `dashboard/` (porta **3000**) per chattare, gestire agenti, creare team e workflow. |
| **Multi-agent** | Un orchestratore che fa collaborare più agenti su un obiettivo comune (piano → sviluppo → review). |
| **OmniRoute** | Gateway AI per usare modelli gratuiti e a pagamento da 290+ provider. |

---

## Requisiti

- **Windows 10/11**, **Linux** o **macOS**
- **Chiavetta USB** da 4 GB o più (USB 3.x consigliato)
- **Connessione internet** — solo al primo avvio (per scaricare Node.js e Claude Code)
- **OmniRoute** installato sul PC (per il backend AI)

---

## Avvio rapido

### 1. Installa e avvia OmniRoute

```powershell
npm install -g omniroute
omniroute
```

Si apre il browser su **http://localhost:20128** (password iniziale: `CHANGEME`).

### 2. Crea una API key

Nella dashboard OmniRoute → **API Keys** → **Create Key** → copia la chiave.

### 3. Estrai il progetto sulla chiavetta

Scarica lo ZIP e scompattalo sulla chiavetta USB.

### 4. Primo avvio

- **Windows**: doppio click su `START.bat`
- **Linux/macOS**: `chmod +x start.sh && ./start.sh`

Al primo avvio il launcher scarica automaticamente Node.js portatile e Claude Code. Poi scegli il backend **OmniRoute Gateway** e incolla la API key.

---

## Dashboard web

Dopo l'avvio, apri **http://localhost:3000** (oppure usa `tools/Open_Dashboard.bat`).

| Tab | Cosa fa |
|---|---|
| **💬 Chat** | Conversazione con un singolo modello, con ricerca web in tempo reale e scelta del modello. |
| **🤖 Agents** | Gestisci gli agenti built-in e quelli personalizzati. |
| **🕸️ Agent Chat** | Team chat: più agenti collaborano su un obiettivo (stile WhatsApp). |
| **⚙️ Setup** | Configura il provider AI (OmniRoute, Anthropic, OpenAI, Gemini, DeepSeek, Ollama, LM Studio, …). |
| **🖥️ System** | Stato e informazioni di sistema. |
| **🔄 Updates** | Aggiornamenti e novità. |

### Agenti built-in

`Developer` · `Project Manager` · `Code Reviewer` · `QA Tester` · `Architect` · `Security` · `Documentation` · `Support`

### Provider supportati

`OmniRoute` · `Anthropic` · `OpenAI` · `OpenRouter` · `Gemini` · `DeepSeek` · `Ollama` · `NVIDIA NIM` · `LM Studio` · `Custom (OpenAI-compatibile)` · `Uncensored`

---

## Struttura del progetto

```
Claude-Code-Usb-Multiagent/
├── README.md                  ← questa guida
├── START.bat                  ← avvio Windows (doppio click)
├── start.sh                   ← avvio Linux/macOS
├── LICENSE                    ← MIT
├── .gitignore
├── .gitattributes
├── dashboard/                 ← dashboard web
│   ├── server.mjs             ← server Node.js (porta 3000)
│   ├── index.html             ← interfaccia (chat, agenti, team)
│   └── theme.css              ← tema
├── tools/
│   ├── Change_Model.bat       ← cambia modello rapidamente
│   ├── Open_Dashboard.bat     ← avvia la dashboard
│   └── Open_Agents.bat        ← avvia la dashboard sul tab Agents
├── .claude/
│   ├── agents/                ← definizioni degli agenti (Developer, PM, …)
│   └── commands/              ← comandi slash (/dev, /review, /team, …)
├── data/                      ← dati, chiavi, cronologia (creato al primo avvio)
├── engine/                    ← Node.js + Claude Code (scaricati al primo avvio)
└── projects/                  ← progetti generati dagli agenti
```

> `data/`, `engine/` e `projects/` sono ignorati da git: vengono creati/scaricati al primo avvio.

---

## Cambiare modello

- **Dal menu**: opzione **3) Change Model**.
- **Da dentro Claude Code**: comando `/model`.
- **Da file**: modifica `data/openclaude/settings.json` alla riga `"model"`.

---

## Risoluzione problemi

| Problema | Soluzione |
|---|---|
| `Node.js non trovato` | `START.bat` lo scarica da solo. In alternativa installalo da nodejs.org |
| `Claude Code install failed` | Controlla `engine/engine-install.log` |
| `OmniRoute non risponde` | Avvia `omniroute` in un terminale separato |
| `Invalid API key` | Rilancia **Reconfigure** e incolla la chiave corretta |
| Porta 3000 occupata | `tools/Open_Dashboard.bat` lo rileva e ti chiede cosa fare |

---

## Credits

- **Claude Code** — [Anthropic](https://anthropic.com)
- **OmniRoute** — [github.com/diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute)
- **TechTonic** — [YouTube](https://www.youtube.com/@TechTonic-t9b)

Licenza: [MIT](LICENSE)
