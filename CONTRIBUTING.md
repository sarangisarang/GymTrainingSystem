# Mitwirken / Code Quality

Dieses Projekt nutzt eine Reihe von Code-Quality-Tools (Issue #31). Alle sind so
eingerichtet, dass sie den bestehenden Code nicht umschreiben und niemandem den
Workflow aufzwingen. Die Adoption ist freiwillig (pre-commit) bzw. läuft in CI.

## Backend (Python)

```bash
cd backend
pip install -r requirements.txt   # enthält jetzt ruff + pytest-cov

# Linten
ruff check .            # meldet Probleme
ruff check . --fix      # behebt die sicher autofixbaren

# Tests mit Coverage
python -m pytest --cov --cov-report=term-missing
```

Konfiguration steht in `backend/pyproject.toml` (`[tool.ruff]`, `[tool.coverage.*]`).
Die Regeln sind bewusst schlank gehalten (pycodestyle + Pyflakes, kein
Auto-Formatter, kein Import-Reorder), damit Lint-Läufe keine Massen-Diffs in
aktiv bearbeiteten Dateien erzeugen.

## Frontend (Next.js / TypeScript)

```bash
cd frontend
npm install        # installiert jetzt eslint + eslint-config-next

npm run lint       # ESLint (Flat-Config, next/core-web-vitals + next/typescript)
npm run typecheck  # tsc --noEmit, jetzt im strict mode
```

`no-explicit-any` und `no-unused-vars` stehen aktuell auf `warn` (nicht `error`),
damit der bestehende Code nicht erst komplett umgetypt werden muss. Sie können
hochgezogen werden, sobald die Altlasten abgebaut sind.

## Pre-commit Hooks (optional, empfohlen)

Die Hooks laufen erst, nachdem du sie einmal pro Klon aktivierst. Vorher
verhalten sich Commits unverändert.

```bash
pip install pre-commit
pre-commit install            # aktiviert die Hooks lokal

# Einmalig über alle Dateien laufen lassen:
pre-commit run --all-files
```

Konfiguration: `.pre-commit-config.yaml` (Whitespace-/EOF-Hygiene, Ruff für
backend/, ESLint für frontend/). Die Hooks sind nach Ordner gescoped, sodass
Python-Tools nie das Frontend anfassen und umgekehrt.

## CI

`.github/workflows/ci.yml` führt zusätzlich aus: `ruff check` (Backend),
`npm run lint` (Frontend) und `pytest --cov` mit einer Mindestschwelle. Die
Schwelle startet knapp unter dem aktuellen Stand und kann schrittweise
angehoben werden, während die Testabdeckung wächst.
