# GymTrainingSystem 💪

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
