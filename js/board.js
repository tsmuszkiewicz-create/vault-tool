// ================================================================
// Board – Kanban-Ansicht über den Aufgaben des Vaults.
//
// Boards:
//   · "Übersicht"  = alle Aufgaben (außer 05 Daily Notes)
//   · je Notiz in "02 Projekte" ein eigenes Projekt-Board
//
// Spalten leiten sich aus dem 📅-Fälligkeitsdatum ab (die Dateien
// bleiben damit 1:1 kompatibel zum Obsidian-Tasks-Format):
//   Inbox        = kein Datum ODER später als diese Woche
//   Diese Woche  = fällig bis einschließlich Sonntag
//   Heute        = fällig heute oder überfällig
//   Erledigt     = [x]
//
// Eine Karte verschieben = Datum/Status der Zeile im Markdown ändern:
//   → Heute:       📅 heute
//   → Diese Woche: 📅 Sonntag dieser Woche
//   → Inbox:       📅 entfernen
//   → Erledigt:    [x] + ✅ Datum (via MD.toggleLine)
// ================================================================
const Board = (() => {
  const PROJECTS_FOLDER = '02 Projekte';
  const BOARD_EXCLUDE_PATHS = ['05 Daily Notes'];
  const DONE_LIMIT = 20; // Erledigt-Spalte: nur die letzten N zeigen
  const ORDER_FILE = 'Board-Reihenfolge.md'; // im Vault-Root; hält die Projektreihenfolge fest

  let customOrder = null; // Array von Projekt-nameNoExt in gewünschter Reihenfolge

  const COLUMNS = [
    { id: 'inbox', title: '📥 Inbox' },
    { id: 'week', title: '🟡 Diese Woche' },
    { id: 'today', title: '⚡ Heute' },
    { id: 'done', title: '✅ Erledigt' },
  ];
  const ORDER = COLUMNS.map((c) => c.id);

  // ---- Datums-Helfer (gleiche Logik wie tasks.js) ----
  function parseDate(str) {
    if (!str) return null;
    const d = new Date(str + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }
  function startOfDay(d) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }
  function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
  function nextMonday(from) {
    const c = startOfDay(from);
    const day = c.getDay() || 7; // Montag=1 … Sonntag=7
    return addDays(c, 8 - day);
  }
  function iso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function inPathList(folderPath, list) {
    return list.some((p) => folderPath === p || folderPath.startsWith(p + '/'));
  }

  // ---- Klassifizierung ----
  function classify(t) {
    if (t.done) return 'done';
    const due = parseDate(t.due);
    if (!due) return 'inbox';
    const today = startOfDay(new Date());
    const d = startOfDay(due);
    if (d <= today) return 'today';                 // heute oder überfällig
    if (d < nextMonday(today)) return 'week';       // bis Ende dieser Woche
    return 'inbox';                                 // später → zurück in die Inbox-Spalte
  }

  function columnIndexOf(t) { return ORDER.indexOf(classify(t)); }

  // ---- Boards / Projekte ----
  function isProjectNote(n) {
    return n.folderPath === PROJECTS_FOLDER || n.folderPath.startsWith(PROJECTS_FOLDER + '/');
  }

  function getProjects() {
    const list = Vault.getAllNotes()
      .filter(isProjectNote)
      .map((n) => ({
        id: n.id,
        nameNoExt: n.nameNoExt,
        status: String(n.frontmatter.status || '').toLowerCase(),
        openCount: n.tasks.filter((t) => !t.done).length,
      }))
      // Zeige aktive Projekte immer, andere nur mit offenen Aufgaben
      .filter((p) => p.status === 'aktiv' || p.openCount > 0);

    const order = customOrder || [];
    const rank = (p) => {
      const i = order.indexOf(p.nameNoExt);
      return i === -1 ? Infinity : i; // Unbekannte ans Ende
    };
    return list.sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      // Fallback für noch nicht einsortierte Projekte: aktiv zuerst, dann nach offenen Aufgaben
      return (a.status === 'aktiv' ? 0 : 1) - (b.status === 'aktiv' ? 0 : 1) ||
        b.openCount - a.openCount ||
        a.nameNoExt.localeCompare(b.nameNoExt, 'de');
    });
  }

  // ---- Reihenfolge laden/speichern (kleine JSON-Datei im Vault-Root) ----
  function getOrderNote() {
    return Vault.getAllNotes().find((n) => n.folderPath === '' && n.name === ORDER_FILE);
  }

  function loadOrder() {
    const note = getOrderNote();
    if (!note || !note.raw) { customOrder = null; return; }
    // Liest die "- Projektname"-Zeilen unterhalb der Überschrift aus.
    const names = note.raw.split('\n')
      .map((l) => l.match(/^\s*-\s+(.+?)\s*$/))
      .filter(Boolean)
      .map((m) => m[1].trim());
    customOrder = names.length ? names : null;
  }

  function buildOrderFile(nameList) {
    const today = new Date().toISOString().slice(0, 10);
    return `# Board-Reihenfolge\n\n` +
      `_Reihenfolge der Projekte im Board. Automatisch gepflegt · ${today}_\n\n` +
      nameList.map((n) => `- ${n}`).join('\n') + '\n';
  }

  async function saveOrder(nameList) {
    customOrder = nameList.slice();
    const content = buildOrderFile(nameList);
    const existing = getOrderNote();
    if (existing) {
      await Drive.writeText(existing.id, content);
      await Vault.reindexNote(existing.id, content);
    } else {
      const created = await Drive.createFile(ORDER_FILE, CONFIG.ROOT_FOLDER_ID, content);
      Vault.registerNote(created, '', content);
    }
  }

  // Verschiebt ein Projekt vor ein anderes und speichert die neue Reihenfolge.
  async function reorderProjects(dragName, targetName) {
    const names = getProjects().map((p) => p.nameNoExt);
    const from = names.indexOf(dragName);
    if (from === -1) return;
    names.splice(from, 1);
    let to = targetName ? names.indexOf(targetName) : names.length;
    if (to === -1) to = names.length;
    names.splice(to, 0, dragName);
    await saveOrder(names);
  }

  function getTasks(projectNoteId) {
    if (projectNoteId) {
      const note = Vault.getNote(projectNoteId);
      if (!note) return [];
      return note.tasks.map((t) => ({ ...t, noteId: note.id, noteName: note.name, folderPath: note.folderPath }));
    }
    return Tasks.getAllTasks().filter((t) => !inPathList(t.folderPath, BOARD_EXCLUDE_PATHS));
  }

  function getColumns(projectNoteId) {
    const buckets = { inbox: [], week: [], today: [], done: [] };
    getTasks(projectNoteId).forEach((t) => buckets[classify(t)].push(t));
    buckets.today.sort((a, b) => (a.due || '').localeCompare(b.due || ''));
    buckets.week.sort((a, b) => (a.due || '').localeCompare(b.due || ''));
    // Inbox: Aufgaben ohne Datum zuerst, dann nach Datum
    buckets.inbox.sort((a, b) => (a.due ? 1 : 0) - (b.due ? 1 : 0) || (a.due || '').localeCompare(b.due || ''));
    // Erledigt: zuletzt abgehakte oben, Liste begrenzen
    buckets.done.sort((a, b) => (b.completedOn || '').localeCompare(a.completedOn || ''));
    buckets.doneTotal = buckets.done.length;
    buckets.done = buckets.done.slice(0, DONE_LIMIT);
    return buckets;
  }

  // ---- Verschieben = Markdown-Zeile umschreiben ----
  function dueFor(target) {
    const today = startOfDay(new Date());
    if (target === 'today') return iso(today);
    if (target === 'week') {
      // Sonntag dieser Woche; ist heute bereits Sonntag, bleibt nur "heute"
      const sunday = addDays(nextMonday(today), -1);
      return iso(sunday.getTime() <= today.getTime() ? today : sunday);
    }
    return null; // inbox → Datum entfernen
  }

  function setDue(line, due) {
    let out = line.replace(/\s*📅\s*\d{4}-\d{2}-\d{2}/g, '').trimEnd();
    if (due) out += ` 📅 ${due}`;
    return out;
  }

  async function moveTask(ref, target) {
    const note = Vault.getNote(ref.noteId);
    if (!note) throw new Error('Notiz nicht gefunden');
    const lines = note.raw.split('\n');
    let line = lines[ref.lineIndex];
    if (line === undefined) throw new Error('Aufgabenzeile nicht gefunden');
    const isDone = /^\s*-\s\[[xX]\]/.test(line);

    if (target === 'done') {
      if (!isDone) line = MD.toggleLine(line, true);
    } else {
      if (isDone) line = MD.toggleLine(line, false);
      line = setDue(line, dueFor(target));
    }

    lines[ref.lineIndex] = line;
    const raw = lines.join('\n');
    await Drive.writeText(note.id, raw);
    await Vault.reindexNote(note.id, raw);
  }

  // Fügt eine neue Aufgabe in eine Projektnotiz ein – unter der Überschrift
  // "Nächste Schritte", damit sie zum bestehenden Aufbau der Projektdateien passt.
  async function addTaskToProject(projectNoteId, { text, column, due, high }) {
    const note = Vault.getNote(projectNoteId);
    if (!note) throw new Error('Projekt nicht gefunden');

    // Fälligkeitsdatum aus Spaltenwahl ableiten (leer = Inbox)
    const dueDate = due || dueFor(column);
    let line = `- [ ] ${text.trim()}`;
    if (dueDate) line += ` 📅 ${dueDate}`;
    if (high) line += ' ⏫';

    const lines = note.raw.split('\n');
    // Zeile der "Nächste Schritte"-Überschrift suchen
    let hIdx = lines.findIndex((l) => /^#{1,6}\s+Nächste Schritte/i.test(l));
    let raw;
    if (hIdx === -1) {
      // Keine Überschrift vorhanden → am Ende anlegen
      raw = note.raw.replace(/\s*$/, '') + `\n\n## Nächste Schritte\n\n${line}\n`;
    } else {
      // Direkt unter die Überschrift einfügen (nach evtl. Leerzeile)
      let insertAt = hIdx + 1;
      if (lines[insertAt] !== undefined && lines[insertAt].trim() === '') insertAt++;
      lines.splice(insertAt, 0, line);
      raw = lines.join('\n');
    }

    await Drive.writeText(note.id, raw);
    await Vault.reindexNote(note.id, raw);
  }

  return { COLUMNS, ORDER, classify, columnIndexOf, getProjects, getColumns, moveTask, addTaskToProject, loadOrder, reorderProjects };
})();
