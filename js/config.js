// ================================================================
// KONFIGURATION
// ================================================================
// Einmalige Einrichtung:
// 1. console.cloud.google.com → Projekt anlegen (oder vorhandenes nutzen)
// 2. "Google Drive API" aktivieren (APIs & Dienste → Bibliothek)
// 3. APIs & Dienste → Anmeldedaten → OAuth-Client-ID → Web-Anwendung anlegen
//    "Autorisierte JavaScript-Quellen" = die Domain, unter der diese App
//    läuft (z.B. https://dein-name.github.io) UND http://localhost:8080
//    fürs lokale Testen.
// 4. Die generierte Client-ID unten eintragen.
// 5. Die Drive-Ordner-ID deines Vaults unten eintragen (steht in der
//    Drive-URL nach ".../folders/").
// ================================================================
const CONFIG = {
  CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID_HERE',

  // "Lugert Verlag"-Unterordner = dein eigentlicher Notiz-Vault
  ROOT_FOLDER_ID: '1TxmGBrBUTBisa44bDqFXaQz1QgoOoF3a',

  // Volle Drive-Berechtigung, wie im bestehenden aufgaben.html-Tool.
  SCOPE: 'https://www.googleapis.com/auth/drive',

  // Diese Ordnernamen werden beim Einlesen des Vaults übersprungen
  // (Obsidian-/Tool-Konfiguration, keine echten Notizen).
  EXCLUDE_FOLDERS: ['.obsidian', '.claude', '.claudian'],

  // Wie im bisherigen 📋 Dashboard: diese Pfade fließen NICHT in die
  // Standard-Aufgaben-Kategorien ein (nur "Privat" schließt nur Daily Notes aus).
  TASK_EXCLUDE_PATHS: ['05 Daily Notes', '01 Inbox'],
  TASK_EXCLUDE_PATHS_PRIVATE: ['05 Daily Notes'],

  // Name der Datei, in die neue Aufgaben aus dem "+" Dialog geschrieben werden
  // (identisch zum bestehenden aufgaben.html-Tool).
  DEFAULT_TASKS_FILE: 'TASKS.md',

  // Tag-Namensschema für die strategische Verknüpfung, wie in
  // "03 Bereiche/Führung & Strategie/📋 Übersicht.md" festgelegt:
  //   #rock-q{N}-r{M}   → Notiz "Q{N} Rocks"
  //   #qziel-q{N}-z{M}  → Notiz "Quartalsziele Q{N}"
  //   #plan-q{N}-p{M}   → Notiz "Q{N} 10-Punkte-Plan"
  STRATEGIC_TAG_PATTERN: /^(rock|qziel|plan)-q(\d+)-[a-z](\d+)$/i,
  STRATEGIC_TARGETS: {
    rock: (n) => `Q${n} Rocks`,
    qziel: (n) => `Quartalsziele Q${n}`,
    plan: (n) => `Q${n} 10-Punkte-Plan`,
  },
  STRATEGIC_LABELS: {
    rock: (n, m) => `Rock ${m} · Q${n}`,
    qziel: (n, m) => `Ziel ${m} · Q${n}`,
    plan: (n, m) => `Plan-Punkt ${m} · Q${n}`,
  },
};
