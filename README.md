# GymTrainingSystem 💪

[![CI](https://github.com/sarangisarang/GymTrainingSystem/actions/workflows/ci.yml/badge.svg)](https://github.com/sarangisarang/GymTrainingSystem/actions/workflows/ci.yml)
![Tests](https://img.shields.io/badge/tests-109-16294d)
![Python](https://img.shields.io/badge/Python-3.12-3776ab)
![Next.js](https://img.shields.io/badge/Next.js-15-000000)

Ein **Trainings-Tracking-System für Kraftsportler**: Workouts erfassen und analysieren,
Trainingsprogramme aus dem 1-Rep-Max generieren, Fortschritt vorhersagen — und ein
**KI-Coach**, der auf den eigenen Trainingsdaten antwortet und bei Unsicherheit an einen
echten Coach übergibt.

FastAPI-Backend, Next.js-Frontend, ~10.700 Zeilen, 109 Tests in der CI.
Entstanden während der Techstarter-Projektphase 2026 und seitdem weitergebaut.

---

## Was das System kann

### Training erfassen und auswerten
- **Workout-Builder** („Cart"): Übungen sammeln, Sets / Reps / Gewicht / Pause konfigurieren, mit
  Datum und Notizen speichern
- **Workout-Analyse:** erkanntes Trainingsziel (Kraft / Hypertrophie / Ausdauer) aus den Daten,
  geschätzte Dauer, Kalorien, Fettverbrennung
- **Personal Records** werden automatisch erkannt und hervorgehoben
- **Dashboard:** Trainings-Streak 🔥, wöchentliche Workouts, Gesamtvolumen, häufigste Muskelgruppe

### Planen und vorhersagen
- **Programm-Generator:** 1RM eingeben → 4-Wochen-Programm (Kraft / Hypertrophie / Ausdauer);
  der Folgezyklus wird aus dem Ergebnis (SUCCESS / REPEAT / FAIL) automatisch angepasst
- **Fortschritts-Prognose:** aus dem bisherigen Verlauf einer Übung wird geschätzt, wann ein
  Zielgewicht erreicht wird — mit ehrlicher Verweigerung, wenn die Datenlage zu dünn ist
  (mindestens drei gewichtete Sessions über mehr als einen Tag)
- **PDF-Reports:** Wochen- und Monatsbericht (reportlab) mit Volumen, Top-Übungen, neuen PRs, Streak

### Motivation
- **Badges** werden automatisch vergeben — `STREAK_7`, `STREAK_30`, `IRON_CONSISTENCY`
  (8 zusammenhängende ISO-Wochen mit mindestens einem Workout) und `FIRST_100KG`. Die Vergabe ist
  idempotent: ein zweites Mal Qualifizieren erzeugt keine zweite Auszeichnung
- **Wochen-Challenge** und **Leaderboard**

### Coach-Funktionen
- Coach und Athlet werden per Einladung verknüpft
- **Coach-Dashboard** mit dem Fortschritt der betreuten Athleten
- **Human Handoff:** eine unsichere KI-Antwort kann an den echten Coach eskaliert werden

---

## Der KI-Coach — das interessanteste Stück

Der Coach beantwortet Fragen zum eigenen Training. Damit das belastbar ist und nicht nur
plausibel klingt, stecken vier Entscheidungen darin:

**1. Antworten sind belegt.** Die Antwort wird aus dem eigenen Trainingsverlauf und einer
Wissensbasis über die Übungen zusammengesetzt (RAG über einen Chroma-Vector-Store). Der
Athlet bekommt die zitierten Quellen mitgeliefert.

**2. Das Modell gibt seine eigene Unsicherheit an.** Nach der Prosa emittiert es einen
`@@@META`-Block mit Confidence-Wert und Quellen. Der Server trennt ihn vom gestreamten Text ab
und parst ihn — die Antwort bleibt lesbarer Fließtext, die Metadaten bleiben maschinenlesbar.

**3. Unter 50 % Confidence wird die Antwort nicht als Fakt präsentiert.** Statt einer
selbstbewussten Auskunft zeigt die UI einen Hinweis. Halluzinationen werden nicht wegdiskutiert,
sondern behandelt.

**4. Und dann übernimmt ein Mensch.** Genau an dieser Stelle kann der Athlet die Frage an seinen
Coach eskalieren; sie erscheint auf dessen Dashboard und wird dort als erledigt markiert. Der
Kreis schließt sich: Die KI weiß, wann sie unsicher ist, und gibt dann ab.

Dazu zwei Details aus dem Betrieb:

- **Modell-Fallback-Kette:** `gemini-2.5-flash` → `gemini-flash-latest` → `gemini-2.0-flash` →
  `gemini-2.0-flash-lite`, bewusst nach Quota-Zuverlässigkeit im kostenlosen Kontingent sortiert.
  Die 2.0-Modelle laufen häufig ins Limit (HTTP 429) und stehen deshalb hinten.
- **Antwortsprache folgt der Frage,** nicht der UI-Sprache — Deutsch, Englisch oder Georgisch
  werden automatisch erkannt.

→ [`ai_coach.py`](backend/fastAPI_functions/ai_coach.py) · [`handoff.py`](backend/fastAPI_functions/handoff.py)

### Der Vector-Store ist defensiv gebaut

Semantische Suche über Übungen (öffentlich) und über die eigenen Workouts (auth-geschützt).
Der `user_id`-Filter wird **innerhalb** des Vector-Stores angewandt, nicht erst auf dem Ergebnis —
Daten anderer Nutzer können damit gar nicht erst zurückkommen.

Der Store fällt außerdem nie hart aus: fehlt `chromadb`, werden alle Index- und Suchaufrufe zu
No-Ops; ist das Embedding-Modell nicht erreichbar, wird geloggt und übersprungen statt 500
zurückzugeben; `CHROMA_DISABLED=1` ist ein Kill-Switch. Semantische Suche kann leer sein — die
App bleibt oben.

→ [`vector_store.py`](backend/data_base_sql/vector_store.py) · [`search.py`](backend/fastAPI_functions/search.py)

---

## Rep-Counter mit Computer Vision

Ein Wiederholungszähler, der im Browser läuft: Google **MediaPipe PoseLandmarker** wertet die
Webcam-Frames aus, der gemessene Gelenkwinkel treibt eine kleine State Machine, die Reps zählt
und die Ausführung bewertet.

Zwei Eigenschaften, die den Ausschlag gaben:

- **Die Frames verlassen das Gerät nicht.** Die Auswertung passiert vollständig client-seitig,
  es gibt keinen Backend-Aufruf — die datenschutzfreundlichste Variante ist hier zugleich die
  einfachere Architektur.
- **WASM-Runtime und Pose-Modell werden erst beim Öffnen der Seite vom CDN geladen**, nicht ins
  Bundle gepackt. Wer den Zähler nie benutzt, lädt ihn auch nie.

→ [`rep-counter/page.tsx`](frontend/app/rep-counter/page.tsx) · [`lib/repCounter.ts`](frontend/lib/repCounter.ts)

---

## DSGVO

Vollständiger Datenexport und vollständige Kontolöschung — inklusive einer Eigenheit, die im Code
dokumentiert ist: Das `User`-Modell hat **kein** ORM-Cascade und kein `ondelete=CASCADE` auf den
Fremdschlüsseln. Ein naives `db.delete(user)` würde Waisen in acht weiteren Tabellen hinterlassen.
Das Modul räumt deshalb explizit auf, sodass echtes Cascading ein späterer Refactor bleiben kann
und keine Voraussetzung ist.

→ [`gdpr.py`](backend/data_base_sql/gdpr.py) · Datenschutzseite unter `/datenschutz`

---

## Technologien

| Bereich | Technologie |
|---------|-------------|
| **Backend** | Python 3.12 · FastAPI · SQLAlchemy · PostgreSQL (SQLite lokal) |
| **KI / RAG** | Google Gemini · Chroma Vector Store · Streaming-Antworten |
| **Computer Vision** | MediaPipe PoseLandmarker (client-seitig, WASM) |
| **Frontend** | TypeScript · Next.js 15 · Tailwind CSS |
| **Auth** | JWT Bearer · argon2-cffi Password Hashing |
| **Logging** | MongoDB-Middleware mit Trace-ID pro Request |
| **Reports** | reportlab (PDF) |
| **Qualität** | pytest (109 Tests) · Ruff · pre-commit · Coverage in der CI |
| **CI/CD** | GitHub Actions · Docker · Render / Railway |

---

## Sicherheit

- Alle geschützten Endpoints erfordern JWT-Authentifizierung
- Passwörter mit **argon2** gehasht
- **Ownership-Checks:** Nutzer sehen und bearbeiten ausschließlich eigene Daten — inklusive der
  semantischen Suche, wo der Filter im Vector-Store selbst sitzt
- Bildupload: Magic-Bytes-Validierung + 5 MB Limit

---

## Projektstruktur

```
GymTrainingSystem/
├── backend/
│   ├── data_base_sql/
│   │   ├── models.py            # Datenbankmodelle
│   │   ├── crud.py              # Geschäftslogik + DB-Operationen + Prognose
│   │   ├── calculations.py      # Formeln (1RM, Volumen, Kalorien)
│   │   ├── personal_records.py  # PR-Erkennung
│   │   ├── gamification.py      # Badges, Challenge, Leaderboard
│   │   ├── vector_store.py      # Chroma: Index + semantische Suche
│   │   ├── knowledge_base.py    # Übungs-Wissensbasis für den Coach
│   │   ├── knowledge_store.py   # Retrieval für die Coach-Antwort
│   │   ├── gdpr.py              # Export + vollständige Löschung
│   │   ├── mongo.py             # Optionale Mongo-Verbindung
│   │   └── schemas.py           # Pydantic-Schemas
│   ├── fastAPI_functions/
│   │   ├── auth.py / security.py    # Login, Registrierung, JWT
│   │   ├── ai_coach.py              # KI-Coach (Streaming, Confidence, Quellen)
│   │   ├── handoff.py               # Eskalation an einen echten Coach
│   │   ├── coach_dashboard.py       # Coach-Sicht auf die Athleten
│   │   ├── search.py                # Semantische Suche
│   │   ├── achievements.py          # Badges + Leaderboard
│   │   ├── reports.py               # PDF-Reports
│   │   ├── workout.py               # Workouts, Analyse, Statistik, Prognose
│   │   ├── programs.py              # Programm-Generierung aus 1RM
│   │   ├── exercises.py             # Übungen + Bildupload
│   │   ├── users.py                 # Benutzerprofil
│   │   └── request_logging.py       # Mongo-Logging-Middleware
│   ├── tests/                       # 109 Tests
│   └── main.py
├── frontend/app/
│   ├── dashboard · progress · workouts · exercises · cart · programs
│   ├── coach · leaderboard · report · rep-counter
│   └── profile · users · login · register · datenschutz
└── .github/workflows/               # CI (Ruff + pytest + Coverage) und Deploy
```

---

## Datenbankmodell

```
User ─────────── Workout ──── WorkoutExercise ─── Exercise
  │                  │
  │           TrainingProgram ── TrainingProgramItem ── Exercise
  │                  │
  │          UserExerciseMax ───────────────────────── Exercise
  │
  ├── UserAchievement          (Badges)
  ├── CoachClient              (Betreuungsbeziehung)
  └── CoachHandoff             (eskalierte Coach-Fragen)
```

---

## Lokale Ausführung

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

API: `http://localhost:8000` · Swagger: `http://localhost:8000/docs`

### Frontend

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

### Docker (gesamter Stack)

```bash
cp .env.docker.example .env   # JWT_SECRET_KEY, GEMINI_API_KEY ausfüllen
docker compose up --build
```

Backend, Frontend und PostgreSQL laufen dann gemeinsam. `docker compose down -v` entfernt auch
das DB-Volume.

Ohne `GEMINI_API_KEY` läuft die App vollständig — nur `/ai/coach` antwortet mit HTTP 503.

---

## Deployment (Render / Railway)

Bei jedem Push auf `main` läuft die CI (`.github/workflows/ci.yml`); danach triggert
`.github/workflows/deploy.yml` automatisch ein Deployment. Ohne gesetzte Secrets passiert nichts
(kein Fehler), damit der Workflow vor dem Cloud-Setup gemergt werden kann.

### Option A: Render (Free Tier vorhanden)

1. Account auf [render.com](https://render.com) anlegen, GitHub-Repo verbinden.
2. **PostgreSQL** erstellen (New → PostgreSQL), **Internal Database URL** kopieren
   (für SQLAlchemy ggf. auf `postgresql+psycopg2://...` umstellen).
3. **Web Service** für das Backend (New → Web Service):
   - Root Directory: `backend` · Runtime: `Docker`
   - Env-Vars: `DATABASE_URL`, `JWT_SECRET_KEY` (≥ 32 Zeichen),
     `GEMINI_API_KEY` (optional), `APP_TIMEZONE` (z. B. `Europe/Berlin`)
4. Optional zweiter Web Service für das Frontend (Root: `frontend`, Runtime: Docker,
   Build-Arg `NEXT_PUBLIC_API_BASE` auf die öffentliche Backend-URL).
5. Backend-Service → **Settings → Deploy Hook → Copy URL**.
6. Repo → **Settings → Secrets and variables → Actions**: `RENDER_DEPLOY_HOOK_URL`
   (und optional `RENDER_FRONTEND_DEPLOY_HOOK_URL`).

### Option B: Railway

1. Projekt mit dem Repo verknüpfen, PostgreSQL-Plugin hinzufügen
   (Railway injiziert `DATABASE_URL`).
2. `JWT_SECRET_KEY`, `GEMINI_API_KEY`, `APP_TIMEZONE` im Service-Tab setzen.
3. Projekt-Token erstellen (**Account Settings → Tokens**) und als Repo-Secret
   `RAILWAY_TOKEN` hinterlegen.

Custom Domain bei beiden unter **Settings → Custom Domain**: `CNAME` setzen, TLS kommt
automatisch über Let's Encrypt.

---

## Nächste Schritte

- Live-Rest-Timer während des Workouts
- Mobile Responsiveness verfeinern
- ORM-Cascade nachziehen, damit die DSGVO-Löschung ohne manuelles Aufräumen auskommt
- Chroma auf einen HTTP-Server oder pgvector umstellen — Renders Disk ist flüchtig, der
  Bootstrap re-indexiert derzeit bei jedem Deploy

---

© 2026 Beka Kikalishvili. Veröffentlicht zu Portfolio- und Bewerbungszwecken;
**keine kommerzielle Nutzung ohne schriftliche Genehmigung**.
