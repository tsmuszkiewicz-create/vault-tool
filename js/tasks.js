// ================================================================
// Tasks – sammelt Checkbox-Aufgaben aus dem GANZEN Vault ein
// (ersetzt das Obsidian "Tasks"-Plugin, das 📋 Dashboard.md nutzt),
// kategorisiert sie wie im bisherigen Dashboard, und verknüpft sie
// automatisch mit Rocks / Quartalszielen / 10-Punkte-Plan über das
// bestehende Tag-Schema aus 03 Bereiche/Führung & Strategie.
// ================================================================
const Tasks = (() => {
  function parseDate(str) {
    if (!str) return null;
    const d = new Date(str + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }
  function startOfDay(d) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }
  function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
  function nextMonday(from) {
    const c = startOfDay(from);
    const day = c.getDay() || 7; // Montag=1 ... Sonntag=7
    return addDays(c, 8 - day);
  }
  function inPathList(folderPath, list) {
    return list.some((p) => folderPath === p || folderPath.startsWith(p + '/'));
  }

  function resolveStrategic(tags) {
    for (const tag of tags) {
      const m = tag.match(CONFIG.STRATEGIC_TAG_PATTERN);
      if (!m) continue;
      const kind = m[1].toLowerCase();
      const n = m[2];
      const idx = m[3];
      const targetFn = CONFIG.STRATEGIC_TARGETS[kind];
      const labelFn = CONFIG.STRATEGIC_LABELS[kind];
      const targetName = targetFn ? targetFn(n) : null;
      const targetNote = targetName ? Vault.resolveNoteByTarget(targetName) : null;
      return { tag, label: labelFn ? labelFn(n, idx) : tag, targetNote };
    }
    return null;
  }

  function getAllTasks() {
    const out = [];
    Vault.getAllNotes().forEach((note) => {
      note.tasks.forEach((t) => {
        out.push({
          ...t,
          noteId: note.id,
          noteName: note.name,
          notePath: note.fullPath,
          folderPath: note.folderPath,
          strategicLink: resolveStrategic(t.tags),
        });
      });
    });
    return out;
  }

  // Baut die Dashboard-Kategorien, analog zu den bisherigen "tasks"-Query-Blöcken
  // in 📋 Dashboard.md (Überfällig / Heute / Diese Woche / Nächste 30 Tage / ohne Datum / Privat).
  function classify(tasksList) {
    const today = startOfDay(new Date());
    const nextMon = nextMonday(today);
    const in30 = addDays(today, 30);
    const buckets = { overdue: [], today: [], week: [], next30: [], noDate: [], private: [] };

    tasksList.forEach((t) => {
      if (t.done) return;
      if (t.tags.includes('privat') && !inPathList(t.folderPath, CONFIG.TASK_EXCLUDE_PATHS_PRIVATE)) {
        buckets.private.push(t);
      }
      if (inPathList(t.folderPath, CONFIG.TASK_EXCLUDE_PATHS)) return;

      const due = parseDate(t.due);
      if (!due) { buckets.noDate.push(t); return; }
      const dueDay = startOfDay(due);
      if (dueDay < today) buckets.overdue.push(t);
      else if (dueDay.getTime() === today.getTime()) buckets.today.push(t);
      else if (dueDay > today && dueDay < nextMon) buckets.week.push(t);
      else if (dueDay >= nextMon && dueDay <= in30) buckets.next30.push(t);
    });

    ['overdue', 'today', 'week', 'next30'].forEach((k) => {
      buckets[k].sort((a, b) => (a.due || '').localeCompare(b.due || ''));
    });
    return buckets;
  }

  function getStats(buckets, allTasks) {
    return {
      overdue: buckets.overdue.length,
      today: buckets.today.length,
      week: buckets.week.length,
      openTotal: allTasks.filter((t) => !t.done).length,
    };
  }

  function getRootNoteByName(name) {
    return Vault.getAllNotes().find(
      (n) => n.folderPath === '' && n.name.toLowerCase() === name.toLowerCase()
    );
  }

  async function toggleTask(task) {
    const note = Vault.getNote(task.noteId);
    if (!note) throw new Error('Notiz nicht gefunden');
    const lines = note.raw.split('\n');
    lines[task.lineIndex] = MD.toggleLine(lines[task.lineIndex], !task.done);
    const newRaw = lines.join('\n');
    await Drive.writeText(note.id, newRaw);
    await Vault.reindexNote(note.id, newRaw);
  }

  async function addTask({ text, priority, due, tag }) {
    let file = getRootNoteByName(CONFIG.DEFAULT_TASKS_FILE);
    if (!file) {
      const today = new Date().toISOString().slice(0, 10);
      const initial = `# Tasks\n\n_Letzte Aktualisierung: ${today}_\n\n## 🔴 Kritisch / Überfällig\n\n## 🟡 Diese Woche\n\n## 🟢 Aktive Projekte\n\n## ✅ Erledigt (letzte Session)\n`;
      const created = await Drive.createFile(CONFIG.DEFAULT_TASKS_FILE, CONFIG.ROOT_FOLDER_ID, initial);
      file = Vault.registerNote(created, '', initial);
    }

    let line = `- [ ] ${text.trim()}`;
    if (due) line += ` 📅 ${due}`;
    if (tag) line += ` #${tag.trim().replace(/^#/, '')}`;
    if (priority === 'critical') line += ' ⏫';

    const patterns = {
      critical: /##\s+.*(Kritisch|Überfällig)/i,
      week: /##\s+.*Diese Woche/i,
      project: /##\s+.*Aktive Projekte/i,
    };
    let raw = file.raw;
    const pat = patterns[priority];
    const m = raw.match(pat);
    if (m) {
      const pos = raw.indexOf(m[0]) + m[0].length;
      raw = raw.slice(0, pos) + '\n' + line + raw.slice(pos);
    } else {
      const heading = priority === 'critical' ? '🔴 Kritisch / Überfällig'
        : priority === 'week' ? '🟡 Diese Woche' : '🟢 Aktive Projekte';
      raw += `\n\n## ${heading}\n\n${line}\n`;
    }
    raw = raw.replace(/_Letzte Aktualisierung:.*?_/, `_Letzte Aktualisierung: ${new Date().toISOString().slice(0, 10)}_`);

    await Drive.writeText(file.id, raw);
    await Vault.reindexNote(file.id, raw);
  }

  return { getAllTasks, classify, getStats, toggleTask, addTask };
})();
