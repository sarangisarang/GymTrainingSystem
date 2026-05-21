# GymOS — Projektplan

## Projektidee

GymOS ist eine intelligente, KI-gestützte Trainingsplattform für Kraftsportler.
Das System verbindet modernes Workout-Tracking mit KI-Analyse, Computer Vision und
einem Coach-Marketplace — alles in einer einzigen Webanwendung.

**Ziel:** Eine vollständige Trainingsplattform, die nicht nur Daten speichert,
sondern aktiv dabei hilft, stärker, strukturierter und smarter zu trainieren.

---

## Was macht GymOS besonders?

| Normale Gym App | GymOS |
|-----------------|-------|
| Statische Einträge | KI analysiert dein Training und gibt persönliche Empfehlungen |
| Manuelle Zählung | Kamera zählt Wiederholungen automatisch (Computer Vision) |
| Einzelner Nutzer | Coach-Marketplace: Trainer betreut mehrere Athleten |
| Nur Rückblick | Predictive Engine: "Du erreichst 100 kg in 6 Wochen" |
| Einfacher Timer | Live Workout Session mit Echtzeit-Rückmeldung |

---

## Kernfunktionen

### 1. KI-Personal-Trainer (Claude API)
Ein eingebauter KI-Coach analysiert die gesamte Trainingshistorie des Nutzers
und gibt personalisierte, kontextbezogene Empfehlungen:

- Erkennt Überlastung, Stagnation und Fortschritt
- Schlägt Anpassungen basierend auf echten Trainingsdaten vor
- Beantwortet Fragen wie: "Diese Woche hatten meine Beine Schmerzen — was empfiehlst du?"
- Nicht generisch — sondern auf Basis der eigenen Daten des Nutzers

### 2. Computer Vision Rep Counter (MediaPipe)
Über die Gerätekamera erkennt das System Bewegungen in Echtzeit:

- Automatisches Zählen von Wiederholungen
- Formkontrolle mit Hinweisen (z.B. "Tiefer in die Kniebeuge")
- Läuft direkt im Browser — keine App-Installation nötig
- Unterstützte Übungen: Squat, Bench Press, Deadlift, Pull-Up

### 3. Predictive Strength Engine
Auf Basis der eigenen Trainingsdaten berechnet das System eine Prognose:

- Lineare Regression auf historischen Kraftwerten
- Visualisierung: "Woche 4: 85 kg — Woche 8: 90 kg — Woche 14: 100 kg"
- Zeigt, wie viele Wochen bis zum gesetzten Ziel verbleiben
- Warnt automatisch bei stagnierendem Fortschritt

### 4. Live Workout Session Mode
Ein vollständiger Workout-Modus für das aktive Training:

- Echtzeit-Rest-Timer mit Ton
- Aktuelle Übung, nächste Übung, verbleibende Sätze
- WebSocket-basiert — keine Seitenneuladen nötig
- Offline-fähig als Progressive Web App (PWA)

### 5. Coach-Dashboard
Trainer können mehrere Athleten gleichzeitig betreuen:

- Vollständige Trainingshistorie aller Klienten einsehbar
- Individuelle Programme für jeden Athleten erstellen
- Fortschrittsberichte auf einen Blick
- Kommunikation direkt in der Plattform

### 6. Progress Charts & Analytics
Professionelle Datenvisualisierung des Fortschritts:

- Kraftkurve pro Übung über Zeit
- Volumen-Chart (Gesamtgewicht pro Woche)
- Körpergewicht + Körperfett-Trend
- Personal Records mit Datum und Kontext

### 7. Body Composition Tracker
Tägliche/wöchentliche Körperdaten erfassen:

- Gewicht, Körperfett in %, Körpermaße
- Automatische Trendlinie
- Korrelation mit Trainingsvolumen

### 8. Gamification & Community
Motivationssystem für langfristige Konsistenz:

- Streak-Counter mit Badges (z.B. "30 Tage Streak", "Iron Consistency")
- Wöchentliche Challenges (z.B. "10.000 kg Gesamtvolumen diese Woche")
- Leaderboard (optional: in der eigenen Gruppe sichtbar)
- PR-Konfetti-Animation bei neuen Bestleistungen

### 9. PWA (Progressive Web App)
Die Anwendung verhält sich wie eine native App:

- Auf dem Homescreen installierbar (Android & iOS)
- Offline-Modus: Workouts auch ohne Internet speicherbar
- Automatische Synchronisation sobald Verbindung wiederhergestellt

### 10. PDF Report Generator
Automatische Berichte für Athleten und Trainer:

- Wochenbericht: Volumen, Übungen, PRs, Kalorienverbrauch
- Monatsbericht: Fortschrittskurven, Zielvergleich
- Export als professionelles PDF-Dokument

---

## Technologien

### Backend
| Technologie | Einsatz |
|-------------|---------|
| Python 3.12 | Programmiersprache |
| FastAPI | REST API + WebSockets |
| SQLAlchemy | Datenbankabstraktion |
| PostgreSQL | Produktionsdatenbank |
| Redis | Sessions, Echtzeit-Cache, Leaderboard |
| Claude API (Anthropic) | KI-Coach, Analyse, Empfehlungen |
| argon2-cffi | Sicheres Passwort-Hashing |
| JWT | Authentifizierung |

### Frontend
| Technologie | Einsatz |
|-------------|---------|
| TypeScript | Typsichere Programmierung |
| Next.js 15 (App Router) | React-Framework |
| Tailwind CSS | Styling |
| Recharts + D3.js | Datenvisualisierung |
| MediaPipe (Google) | Computer Vision im Browser |
| WebSockets | Echtzeit-Kommunikation |
| PWA (Service Worker) | Offline-Modus, Installierbarkeit |

### Infrastruktur
| Technologie | Einsatz |
|-------------|---------|
| GitHub Actions | CI/CD Pipeline |
| Docker | Containerisierung |
| Render / Railway | Cloud-Deployment |

---

## Systemarchitektur

```
┌─────────────────────────────────────────────────┐
│                   Browser / PWA                  │
│  Next.js 15 · TypeScript · Tailwind · Recharts   │
│  MediaPipe (Camera) · WebSocket Client           │
└──────────────────┬──────────────────────────────┘
                   │ HTTPS + WebSocket
┌──────────────────▼──────────────────────────────┐
│              FastAPI Backend                     │
│  REST API · WebSocket Server · Auth (JWT)        │
│  Claude API Integration · PDF Generator         │
└──────┬────────────────────┬───────────────────── ┘
       │                    │
┌──────▼──────┐    ┌────────▼────────┐
│ PostgreSQL  │    │     Redis       │
│  (Daten)    │    │ (Cache/Echtzeit)│
└─────────────┘    └─────────────────┘
```

---

## Datenbankmodell

```
User ──────── Workout ──── WorkoutExercise ──── Exercise
  │               │
  │          TrainingProgram ── ProgramItem ──── Exercise
  │
  ├── BodyMeasurement (Gewicht, Körperfett, Maße)
  ├── UserExerciseMax (1RM pro Übung)
  ├── CoachClient (Coach ↔ Athlet Verbindung)
  └── Achievement (Badges, Meilensteine)
```

---

## 3-Wochen-Plan

### Woche 1 — Core Upgrade
- [ ] PostgreSQL statt SQLite (produktionsreif)
- [ ] Progress Charts: Kraftkurve, Volumen, Körpergewicht (Recharts)
- [ ] Body Composition Tracker (Gewicht + Körperfett)
- [ ] Live Workout Session Mode (WebSocket + Timer)
- [ ] Predictive Strength Engine (lineare Regression)

### Woche 2 — KI & Computer Vision
- [ ] Claude API Integration — KI-Coach mit Trainingsdaten-Kontext
- [ ] MediaPipe Rep Counter — Kamera-basiertes Zählen im Browser
- [ ] PDF Report Generator (wöchentlich/monatlich)
- [ ] PWA Setup — offline-fähig, installierbar
- [ ] Coach-Dashboard (Multi-Athleten-Verwaltung)

### Woche 3 — Polish & Launch
- [ ] Gamification: Badges, Streak-System, Leaderboard
- [ ] PR-Konfetti-Animation
- [ ] Mobile Responsive Feinschliff
- [ ] Landing Page
- [ ] CI/CD Deployment (Render/Railway)
- [ ] Abschlusspräsentation + Demo-Video

---

## Arbeitsaufteilung

| Person | Bereich |
|--------|---------|
| **Beka Toro** | Backend (FastAPI, KI-Integration, Datenbanklogik, Berechnungen) · Frontend (Next.js, Charts, Live Session, PWA) |
| *(Teammitglied 2)* | *(z.B. Computer Vision, Gamification, UI/UX)* |
| *(Teammitglied 3)* | *(z.B. Coach-Dashboard, Testing, Deployment)* |

---

## Erste Schritte (sofort)

1. GitHub Repository erstellen und Team einladen
2. PostgreSQL lokal einrichten (Docker Compose)
3. Recharts installieren und erste Kraftkurve rendern
4. Claude API Key beantragen (console.anthropic.com)
5. MediaPipe Prototyp testen (Kamera-Zugriff im Browser)

---

## Technische Highlights für die Präsentation

- **KI-Demo:** Live-Frage an den KI-Coach mit echten Trainingsdaten
- **Vision-Demo:** Kamera an — Squat ausführen — Wiederholungen werden gezählt
- **Charts-Demo:** 3-Monats-Kraftkurve mit PR-Markierungen
- **Prediction-Demo:** "Wann erreiche ich 100 kg?" — Antwort in Sekunden
- **Mobile-Demo:** App auf Smartphone installiert, offline funktionsfähig

---

*GymOS · Entwickelt als Schulprojekt · Projektphase 2026*
*GitHub: https://github.com/sarangisarang/GymTrainingSystem*
