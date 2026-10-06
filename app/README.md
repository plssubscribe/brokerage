# Brokerage CRM

Open `app/index.html` in a browser. No build or server needed; data lives in your browser (localStorage).
Use **Backup** regularly (downloads JSON) and **Restore** to move to another machine.

- **Today**: partner answer clocks, next actions due, Tier 1 leads going quiet, exclusivity warnings
- **Board**: drag leads between stages
- **Priority matrix**: data value vs. deal readiness
- **Paste a DM**: copies a prompt for Claude; paste the JSON reply back to create/update a lead
- **Import inventory .xlsx**: reads a completed `Blank_Data_Inventory.xlsx` into a lead
- **Scoring**: adjust weights; Partners tab holds each partner's rules (min employees, answer SLA, exclusivity)

## Running locally (Mac)
Double-click `Open Brokerage CRM.command`. It starts a small server on 127.0.0.1:8765 (this computer only) and opens the app.
Your data is saved to `data/brokerage.json` in this folder (git-ignored, so it never gets pushed). `brokerage.json.prev` keeps the previous save.
`Stop Brokerage CRM.command` shuts the server down. Needs Python 3 (Homebrew, or Xcode command line tools: `xcode-select --install`); without it the launcher falls back to opening `app/index.html` directly (browser-only storage).
Or run it by hand: `python3 app/server.py` then open http://127.0.0.1:8765
