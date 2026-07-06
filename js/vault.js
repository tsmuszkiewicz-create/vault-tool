// ================================================================
// Vault – lädt den gesamten Notiz-Baum von Drive, parst jede Notiz
// und hält Link-Graph, Backlinks, Tag-Index und Suchindex im Speicher.
// Bewusst "live gegen Drive": kein persistenter lokaler Cache, der
// Zustand hier lebt nur während der laufenden Session.
// ================================================================
const Vault = (() => {
  const FOLDER_MIME = 'application/vnd.google-apps.folder';

  let tree = null;               // { id, name, type:'folder', path, children:[] }
  let notesById = {};            // id -> note
  let notesInOrder = [];         // stabile Reihenfolge fürs Rendern
  let tagIndex = {};             // tag -> Set<noteId>
  let lastSync = null;

  function isNoteFile(f) {
    if (f.mimeType === FOLDER_MIME) return false;
    if (f.mimeType === 'text/markdown') return true;
    return /\.md$/i.test(f.name);
  }

  async function mapPool(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }
    const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
    await Promise.all(workers);
    return results;
  }

  // Rekursiver Ordner-Walk. Baut gleichzeitig den Baum und eine flache Notizliste auf.
  async function walk(folderId, folderName, path, onProgress) {
    const node = { id: folderId, name: folderName, type: 'folder', path, children: [] };
    const children = await Drive.listChildren(folderId);
    const folders = children.filter((c) => c.mimeType === FOLDER_MIME && !CONFIG.EXCLUDE_FOLDERS.includes(c.name));
    const notes = children.filter(isNoteFile);

    notes.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    folders.sort((a, b) => a.name.localeCompare(b.name, 'de'));

    for (const n of notes) {
      const nameNoExt = n.name.replace(/\.md$/i, '');
      const note = {
        id: n.id, name: n.name, nameNoExt, folderPath: path,
        fullPath: (path ? path + '/' : '') + nameNoExt,
        modifiedTime: n.modifiedTime,
        raw: null, frontmatter: {}, body: '', tags: [], links: [], backlinks: new Set(), tasks: [],
      };
      notesById[n.id] = note;
      notesInOrder.push(note);
      node.children.push({ id: n.id, name: n.name, type: 'note', path: note.fullPath });
      if (onProgress) onProgress({ phase: 'list', name: n.name });
    }

    for (const f of folders) {
      const childPath = (path ? path + '/' : '') + f.name;
      const childNode = await walk(f.id, f.name, childPath, onProgress);
      node.children.push(childNode);
    }

    return node;
  }

  function parseNote(note) {
    const { frontmatter, body } = MD.splitFrontmatter(note.raw);
    note.frontmatter = frontmatter;
    note.body = body;
    note.tags = MD.extractTags(note.raw, frontmatter);
    note.links = MD.extractWikilinks(note.raw);
    note.tasks = MD.extractTasks(note.raw);
  }

  function rebuildGraphAndTags() {
    // Backlinks zurücksetzen
    notesInOrder.forEach((n) => n.backlinks.clear());
    tagIndex = {};
    notesInOrder.forEach((note) => {
      note.links.forEach((link) => {
        const target = resolveNoteByTarget(link.target);
        if (target && target.id !== note.id) target.backlinks.add(note.id);
      });
      note.tags.forEach((tag) => {
        tagIndex[tag] = tagIndex[tag] || new Set();
        tagIndex[tag].add(note.id);
      });
    });
  }

  async function sync(onProgress) {
    notesById = {};
    notesInOrder = [];
    if (onProgress) onProgress({ phase: 'tree', message: 'Ordnerstruktur wird geladen…' });
    tree = await walk(CONFIG.ROOT_FOLDER_ID, 'Vault', '', onProgress);

    if (onProgress) onProgress({ phase: 'content', message: `Lade Inhalte (${notesInOrder.length} Notizen)…`, total: notesInOrder.length, done: 0 });
    let done = 0;
    await mapPool(notesInOrder, 6, async (note) => {
      try {
        note.raw = await Drive.readText(note.id);
      } catch (e) {
        note.raw = '';
      }
      parseNote(note);
      done++;
      if (onProgress) onProgress({ phase: 'content', total: notesInOrder.length, done });
    });

    rebuildGraphAndTags();
    lastSync = new Date();
    if (onProgress) onProgress({ phase: 'done' });
  }

  async function reindexNote(id, newRaw) {
    const note = notesById[id];
    if (!note) return;
    note.raw = newRaw;
    parseNote(note);
    rebuildGraphAndTags();
  }

  function findTreeNode(path) {
    if (!path) return tree;
    let node = tree;
    for (const part of path.split('/')) {
      if (!node) return null;
      node = node.children.find((c) => c.type === 'folder' && c.name === part);
    }
    return node;
  }

  // Registriert eine neu angelegte Datei (z.B. eine frisch erstellte TASKS.md)
  // im laufenden Index, ohne dass ein kompletter Re-Sync nötig ist.
  function registerNote(fileMeta, folderPath, content) {
    const nameNoExt = fileMeta.name.replace(/\.md$/i, '');
    const note = {
      id: fileMeta.id, name: fileMeta.name, nameNoExt, folderPath,
      fullPath: (folderPath ? folderPath + '/' : '') + nameNoExt,
      modifiedTime: fileMeta.modifiedTime || new Date().toISOString(),
      raw: content, frontmatter: {}, body: '', tags: [], links: [], backlinks: new Set(), tasks: [],
    };
    notesById[note.id] = note;
    notesInOrder.push(note);
    parseNote(note);
    rebuildGraphAndTags();
    const parentNode = findTreeNode(folderPath) || tree;
    if (parentNode) parentNode.children.push({ id: note.id, name: note.name, type: 'note', path: note.fullPath });
    return note;
  }

  // Löst ein [[Wikilink]]-Ziel (bare Name oder Pfad/Name) auf eine Notiz auf.
  function resolveNoteByTarget(target) {
    if (!target) return null;
    const clean = target.trim().replace(/^\/+|\/+$/g, '');
    const cleanLower = clean.toLowerCase();
    let hit = notesInOrder.find((n) => n.fullPath.toLowerCase() === cleanLower);
    if (hit) return hit;
    const lastSeg = clean.split('/').pop().toLowerCase();
    hit = notesInOrder.find((n) => n.nameNoExt.toLowerCase() === lastSeg);
    return hit || null;
  }

  function getTree() { return tree; }
  function getNote(id) { return notesById[id]; }
  function getAllNotes() { return notesInOrder; }
  function getLastSync() { return lastSync; }

  function getBacklinks(id) {
    const note = notesById[id];
    if (!note) return [];
    return Array.from(note.backlinks).map((bid) => notesById[bid]).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  function getTagList() {
    return Object.keys(tagIndex)
      .map((tag) => ({ tag, count: tagIndex[tag].size }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'de'));
  }

  function getNotesByTag(tag) {
    const ids = tagIndex[tag];
    if (!ids) return [];
    return Array.from(ids).map((id) => notesById[id]).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  function search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results = [];
    notesInOrder.forEach((note) => {
      const nameHit = note.name.toLowerCase().includes(q);
      const bodyIdx = note.body.toLowerCase().indexOf(q);
      if (!nameHit && bodyIdx === -1) return;
      let snippet = '';
      if (bodyIdx !== -1) {
        const start = Math.max(0, bodyIdx - 40);
        snippet = (start > 0 ? '…' : '') + note.body.slice(start, bodyIdx + q.length + 60).replace(/\n/g, ' ') + '…';
      }
      results.push({ note, score: (nameHit ? 10 : 0) + (bodyIdx !== -1 ? 1 : 0), snippet });
    });
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 40);
  }

  return {
    sync, reindexNote, registerNote, getTree, getNote, getAllNotes, getLastSync,
    getBacklinks, getTagList, getNotesByTag, resolveNoteByTarget, search,
  };
})();
