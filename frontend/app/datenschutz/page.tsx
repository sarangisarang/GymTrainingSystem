// Static privacy policy page (Issue #29). Plain German text, no legal-grade
// document — but honest about what is stored, why, and how users can exercise
// their DSGVO rights (export + deletion are linked back to the profile page).
import Link from "next/link";

export const metadata = {
  title: "Datenschutz · Gym Tracker",
  description:
    "Welche Daten Gym Tracker speichert, warum, und wie du sie exportieren oder löschen kannst.",
};

export default function DatenschutzPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="card p-6">
        <h1 className="h1">Datenschutzerklärung</h1>
        <p className="muted mt-2">
          Gym Tracker ist ein Schulprojekt. Diese Erklärung beschreibt in einfacher
          Sprache, welche personenbezogenen Daten wir verarbeiten und wie du
          deine Rechte aus der Datenschutz-Grundverordnung (DSGVO) ausüben kannst.
        </p>
      </div>

      <div className="card p-6 space-y-3">
        <h2 className="font-semibold">Welche Daten speichern wir?</h2>
        <ul className="ml-6 list-disc space-y-1 text-sm text-neutral-300">
          <li>Account: E-Mail, optionaler Name, gehashtes Passwort (Argon2), Rolle, Registrierungsdatum.</li>
          <li>Trainingsdaten: Workouts mit Datum, Notizen, Status und Dauer.</li>
          <li>Übungen pro Workout: Sets, Wiederholungen, Gewicht, Pausen.</li>
          <li>1-Rep-Max-Werte pro Übung.</li>
          <li>Trainingsprogramme und deren wöchentliche Übungspläne.</li>
          <li>Abzeichen (Achievements) und ggf. Coach-Beziehungen.</li>
          <li>Optional: Sichtbarkeit in der Bestenliste (du kannst das im Profil deaktivieren).</li>
        </ul>
      </div>

      <div className="card p-6 space-y-3">
        <h2 className="font-semibold">Warum speichern wir das?</h2>
        <p className="text-sm text-neutral-300">
          Wir brauchen diese Daten, damit die App funktioniert: Workouts wären
          ohne Speicherung sinnlos, Progress-Tracking und der KI-Coach nutzen
          deine Historie. Die Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO
          (Erfüllung des Nutzungsvertrags).
        </p>
      </div>

      <div className="card p-6 space-y-3">
        <h2 className="font-semibold">Wer hat Zugriff?</h2>
        <p className="text-sm text-neutral-300">
          Standardmäßig nur du selbst. Wenn du dich bei einem Coach registrierst,
          kann dieser deine Workouts in seinem Dashboard sehen, bis du die
          Beziehung beendest. In der Bestenliste erscheinen nur Nutzer, die im
          Profil explizit zugestimmt haben (Opt-In).
        </p>
      </div>

      <div className="card p-6 space-y-3">
        <h2 className="font-semibold">Externe Dienste</h2>
        <ul className="ml-6 list-disc space-y-1 text-sm text-neutral-300">
          <li>
            Google Gemini (KI-Coach): wenn du den Coach nutzt, schicken wir deine
            Nachricht plus eine Zusammenfassung deiner letzten Workouts an
            Googles API. Ohne aktive Anfrage findet keine Übertragung statt.
          </li>
          <li>
            Hosting: die App läuft auf einer Cloud-Plattform (aktuell Render oder
            Railway, vorzugsweise EU-Region). Der Anbieter speichert
            Server-Logs gemäß dessen Datenschutzrichtlinie. Bei Wechsel der
            Plattform aktualisieren wir diese Seite.
          </li>
        </ul>
      </div>

      <div className="card p-6 space-y-3">
        <h2 className="font-semibold">Deine Rechte</h2>
        <p className="text-sm text-neutral-300">
          Du hast nach DSGVO insbesondere folgende Rechte:
        </p>
        <ul className="ml-6 list-disc space-y-1 text-sm text-neutral-300">
          <li>
            <span className="font-medium">Art. 15 (Auskunft) & Art. 20 (Datenübertragbarkeit):</span>{" "}
            alle deine Daten als JSON herunterladen via{" "}
            <Link href="/profile" className="text-indigo-400 hover:underline">
              Profil → Meine Daten herunterladen
            </Link>
            .
          </li>
          <li>
            <span className="font-medium">Art. 17 (Löschung):</span> dein Konto und
            sämtliche zugehörigen Daten unwiderruflich entfernen via{" "}
            <Link href="/profile" className="text-indigo-400 hover:underline">
              Profil → Gefahrenzone → Konto löschen
            </Link>
            .
          </li>
          <li>
            <span className="font-medium">Art. 16 (Berichtigung):</span> Name und
            Passwort jederzeit im Profil ändern.
          </li>
        </ul>
      </div>

      <div className="card p-6 space-y-3">
        <h2 className="font-semibold">Aufbewahrung</h2>
        <p className="text-sm text-neutral-300">
          Daten bleiben gespeichert, solange dein Account existiert. Nach einer
          Löschung sind alle deine Daten sofort und ohne Wiederherstellungsmöglichkeit
          weg, inklusive Workouts, Programme und Vector-Such-Index.
        </p>
      </div>

      <div className="card p-6 space-y-2">
        <h2 className="font-semibold">Kontakt</h2>
        <p className="text-sm text-neutral-300">
          Da dies ein Schulprojekt ist, gibt es keinen offiziellen Datenschutzbeauftragten.
          Fragen kannst du an die im Repository hinterlegten Maintainer richten:{" "}
          <a
            href="https://github.com/sarangisarang/GymTrainingSystem"
            className="text-indigo-400 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            github.com/sarangisarang/GymTrainingSystem
          </a>
          .
        </p>
      </div>
    </div>
  );
}
