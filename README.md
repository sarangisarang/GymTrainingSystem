# GymTrainingSystem 💪

[![CI](https://github.com/sarangisarang/GymTrainingSystem/actions/workflows/ci.yml/badge.svg)](https://github.com/sarangisarang/GymTrainingSystem/actions/workflows/ci.yml)

Ein vollständiges **Gym-Tracking-System** mit Workout-Analyse, automatischer Trainingsprogramm-Generierung und Progress-Tracking.

---

## Projektidee & Beschreibung

GymTrainingSystem ist eine Web-Applikation für Kraftsportler, die ihre Trainingsfortschritte digital festhalten, analysieren und planen möchten.

**Das System ermöglicht:**
- Workouts erstellen, speichern und verwalten
- Trainingsfortschritte verfolgen (Personal Records, Streak, Gesamtvolumen)
- Automatische Trainingsprogramme aus dem persönlichen 1-Rep-Max (1RM) generieren
- Workout-Analyse: geschätzte Dauer, Kalorien, Fettverbrennung, Tempo
- Benutzerauthentifizierung mit JWT (sicherer Login / Registrierung)

---

## Technologien

| Bereich | Technologie |
|---------|-------------|
| **Backend** | Python 3.12 · FastAPI · SQLAlchemy · SQLite · JWT |
| **Frontend** | TypeScript · Next.js 15 · Tailwind CSS |
| **Auth** | JWT Bearer Token · argon2-cffi Password Hashing |
| **CI/CD** | GitHub Actions |

---

## Features im Überblick

### Dashboard
- Trainings-Streak (aufeinanderfolgende Tage 🔥), wöchentliche Workouts
- Gesamtvolumen und beliebteste Muskelgruppe

### Exercises
- Übungsübersicht mit Bild, Muskelgruppe und Beschreibung
- Verlaufsansicht: alle bisherigen Einsätze mit Gewicht und Volumen
- **Personal Record** wird automatisch erkannt und hervorgehoben

### Workout Builder (Cart)
- Übungen in den „Cart" legen, Sets / Reps / Gewicht / Rest konfigurieren
- Workout mit Datum und Notizen speichern

### Workout-Analyse
- Erkanntes Trainingsziel (Kraft / Hypertrophie / Ausdauer) anhand der Daten
- Geschätzte Gesamtdauer, Kalorien und Fettverbrennung

### Programme
- 1RM eingeben → 4-Wochen-Programm generieren (Kraft / Hypertrophie / Ausdauer)
- Nächsten Zyklus mit Anpassung (SUCCESS / REPEAT / FAIL) automatisch berechnen

---

## 3-Wochen-Plan (Projektphase)

| Woche | Ziele |
|-------|-------|
| **Woche 1** | Projektstruktur finalisieren · Backend testen · Deployment aufsetzen (Render / Railway) |
| **Woche 2** | Frontend-Feinschliff · Mobile Responsiveness · Live Rest-Timer während Workout |
| **Woche 3** | Abschlusspräsentation vorbereiten · Dokumentation · Bugfixes · Code Review |

---

## Arbeitsaufteilung

| Person | Bereich |
|--------|---------|
| **Beka Toro** | Backend (FastAPI, Datenbanklogik, Berechnungen, Auth) · Frontend (Next.js, Komponenten, API-Client) |
| *(weitere Teammitglieder)* | *(Aufgabenbereiche eintragen)* |

---

## Lokale Ausführung

### Backend starten

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

API: `http://localhost:8000`  
Swagger Docs: `http://localhost:8000/docs`

### Frontend starten

```bash
cd frontend
npm install
npm run dev
```

`.env.local` anlegen:

```env
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

Frontend: `http://localhost:3000`

### Docker (gesamter Stack lokal)

```bash
cp .env.docker.example .env   # Werte ausfüllen (JWT_SECRET_KEY, GEMINI_API_KEY)
docker compose up --build
```

Backend, Frontend und PostgreSQL laufen dann gemeinsam. `docker compose down -v`
entfernt auch das DB-Volume.

---

## Deployment (Render / Railway)

Bei jedem Push auf `main` läuft die CI (`.github/workflows/ci.yml`); danach
triggert `.github/workflows/deploy.yml` automatisch ein Deployment auf die
konfigurierte Plattform. Ohne gesetzte Secrets passiert nichts (kein Fehler),
damit der Workflow vor dem Cloud-Setup gemergt werden kann.

### Option A: Render (empfohlen, Free Tier vorhanden)

1. Account auf [render.com](https://render.com) anlegen und GitHub-Repo
   verbinden.
2. **PostgreSQL-Datenbank** erstellen (New → PostgreSQL). Den
   **Internal Database URL** kopieren (Format `postgresql://user:pass@host/db`,
   für SQLAlchemy ggf. auf `postgresql+psycopg2://...` umstellen).
3. **Web Service** für das Backend erstellen (New → Web Service):
   - Root Directory: `backend`
   - Runtime: `Docker` (nutzt automatisch `backend/Dockerfile`)
   - Environment Variables setzen:
     - `DATABASE_URL` (aus Schritt 2)
     - `JWT_SECRET_KEY` (mindestens 32 zufällige Zeichen)
     - `GEMINI_API_KEY` (optional, sonst gibt `/ai/coach` HTTP 503 zurück)
     - `APP_TIMEZONE` (z. B. `Europe/Berlin`)
4. (Optional) Zweites **Web Service** für das Frontend (Root: `frontend`,
   Runtime: Docker). Build-Arg `NEXT_PUBLIC_API_BASE` auf die öffentliche
   Backend-URL setzen.
5. Im Backend-Service: **Settings → Deploy Hook → Copy URL**.
6. Im GitHub-Repo: **Settings → Secrets and variables → Actions → New**:
   - `RENDER_DEPLOY_HOOK_URL` (Backend-Hook)
   - `RENDER_FRONTEND_DEPLOY_HOOK_URL` (optional, Frontend-Hook)

Nächster Push auf `main` löst dann das Deployment aus; den Status sieht man
im **Actions**-Tab unter "Deploy".

### Option B: Railway

1. Account auf [railway.app](https://railway.app) anlegen, Projekt mit dem
   Repo verknüpfen.
2. PostgreSQL-Plugin hinzufügen; Railway injiziert `DATABASE_URL` automatisch.
3. Restliche Env-Vars (`JWT_SECRET_KEY`, `GEMINI_API_KEY`, `APP_TIMEZONE`)
   im Service-Tab setzen.
4. Projekt-Token erstellen: **Account Settings → Tokens → New Token**.
5. Im GitHub-Repo `RAILWAY_TOKEN` als Secret hinterlegen.

### Custom Domain (optional)

Beide Plattformen erlauben Custom Domains unter **Settings → Custom Domain**:
DNS-`CNAME` auf den von Render/Railway angezeigten Wert setzen, TLS wird
automatisch via Let's Encrypt ausgestellt.

---

## Projektstruktur

```
GymTrainingSystem/
├── backend/
│   ├── data_base_sql/
│   │   ├── models.py          # Datenbankmodelle
│   │   ├── crud.py            # Geschäftslogik + DB-Operationen
│   │   ├── calculations.py    # Formeln (1RM, Volumen, Kalorien)
│   │   └── schemas.py         # Pydantic-Schemas
│   ├── fastAPI_functions/
│   │   ├── auth.py            # Login / Register / JWT
│   │   ├── exercises.py       # Übungen + Bildupload
│   │   ├── workout.py         # Workouts + Analyse + Statistiken
│   │   ├── programs.py        # Programm-Generierung aus 1RM
│   │   └── users.py           # Benutzerprofil
│   └── main.py
├── frontend/
│   ├── app/
│   │   ├── dashboard/         # Statistiken, Streaks
│   │   ├── exercises/         # Übersicht + History + PR
│   │   ├── workouts/          # Liste + Detail + Analyse
│   │   ├── cart/              # Workout-Builder
│   │   ├── programs/          # Programm-Generator
│   │   └── profile/           # Profil + Passwort
│   ├── components/
│   │   ├── AuthProvider.tsx
│   │   └── Toast.tsx
│   └── lib/
│       └── api.ts             # Typisierter API-Client
└── .github/workflows/         # CI/CD Pipeline
```

---

## Sicherheit

- Alle Endpoints erfordern JWT-Authentifizierung
- Passwörter werden mit **argon2** gehasht (sicherer als bcrypt)
- Ownership-Checks: Nutzer sehen und bearbeiten nur ihre eigenen Daten
- Bildupload: Magic-Bytes-Validierung + 5 MB Limit

---

## Datenbankmodell

```
User ─────────── Workout ──── WorkoutExercise ─── Exercise
                     │
              TrainingProgram ── TrainingProgramItem ── Exercise
                     │
             UserExerciseMax ──────────────────────── Exercise
```

---

*Entwickelt als Schulprojekt · Projektphase 2026*
