# /security — Avvia l'agente Security Auditor
Esegue un audit di sicurezza completo del codice.

## Cosa fa
Carica l'agente `security` per:
- Verificare vulnerabilità OWASP Top 10
- Trovare chiavi hardcoded e dati esposti
- Controllare dipendenze vulnerabili
- Verificare configurazioni di sicurezza

## Esempi
/security Audita tutto il progetto per vulnerabilità
/security Controlla il sistema di autenticazione
/security Verifica che non ci siano chiavi API nel codice
