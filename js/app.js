// ================================================================
// App – verdrahtet Drive/Vault/Tasks/MD mit der Oberfläche.
// ================================================================
(function () {
  const esc = MD.escapeHtml;
  const $ = (id) => document.getElementById(id);

  const state = {
    view: 'dashboard',       // 'dashboard' | 'board' | 'note' | 'tag'
    boardProject: null,      // null = Übersicht, sonst Notiz-ID des Projekts
    noteId: null,
    tag: null,
    editing: false,
    expanded: new Set(),
  };

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove('show'), 3000);
  }

  function closeMobileSidebar() {
    if (window.innerWidth <= 760) $('sidebar').classList.remove('open');
  }

  // ---------------- AUTH / BOOTSTRAP ----------------
  function showApp() {
    $('login-screen').style.display = 'none';
    $('app').style.display = 'block';
    const p = Drive.getProfile();
    if (p) {
      $('avatar').textContent = (p.displayName || p.emailAddress || '?').trim()[0].toUpperCase();
      $('avatar').title = p.emailAddress || '';
    }
  }
  function showLogin() {
    $('app').style.display = 'none';
    $('login-screen').style.display = 'flex';
    if (CONFIG.CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') $('setup-box').style.display = 'block';
  }

  async function runSync() {
    const syncBtn = $('sync-btn');
    syncBtn.classList.add('spinning');
    $('sync-meta').textContent = 'Synchronisiere…';
    $('sb-body').innerHTML = '<div class="loading"><span class="spin">↻</span> Lädt Vault…</div>';
    try {
      await Vault.sync((p) => {
        if (p.phase === 'content' && p.total) {
          $('sync-meta').textContent = `Lädt Inhalte ${p.done}/${p.total}…`;
        }
      });
      const t = Vault.getLastSync();
      $('sync-meta').textContent = 'Sync ' + t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
      renderSidebar();
      renderMain();
    } catch (e) {
      if (e.message === 'auth-expired') {
        toast('Anmeldung abgelaufen – bitte neu anmelden.');
        showLogin();
      } else {
        toast('Fehler beim Laden des Vaults.');
        console.error(e);
      }
    } finally {
      syncBtn.classList.remove('spinning');
    }
  }

  // ---------------- SIDEBAR ----------------
  function renderTreeNode(node, depth) {
    if (node.type === 'note') {
      const active = state.view === 'note' && state.noteId === node.id;
      return `<div class="tree-row${active ? ' active' : ''}" data-type="note" data-id="${node.id}" style="padding-left:${8 + depth * 12}px">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
        <span class="lbl">${esc(node.name.replace(/\.md$/i, ''))}</span>
      </div>`;
    }
    const isOpen = state.expanded.has(node.id);
    let html = `<div class="tree-row${isOpen ? ' open' : ''}" data-type="folder" data-id="${node.id}" style="padding-left:${8 + depth * 12}px">
      <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="9 6 15 12 9 18"/></svg>
      <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h5l2 2h11v10H3z"/></svg>
      <span class="lbl">${esc(node.name)}</span>
    </div>`;
    html += `<div class="tree-children${isOpen ? ' open' : ''}">`;
    node.children.forEach((c) => { html += renderTreeNode(c, depth + 1); });
    html += `</div>`;
    return html;
  }

  function renderSidebar() {
    const tree = Vault.getTree();
    if (!tree) { $('sb-body').innerHTML = '<div class="loading"><span class="spin">↻</span> Noch nicht synchronisiert</div>'; return; }
    if (state.expanded.size === 0) state.expanded.add(tree.id);

    let html = '<div class="sb-section-t">Ordner</div>';
    tree.children.forEach((c) => { html += renderTreeNode(c, 0); });

    html += '<div class="sb-section-t">Tags</div>';
    const tags = Vault.getTagList();
    if (!tags.length) html += '<div class="empty">Keine Tags gefunden</div>';
    tags.slice(0, 80).forEach((t) => {
      html += `<div class="tag-pill-row" data-tag="${esc(t.tag)}"><span>#${esc(t.tag)}</span><span class="n">${t.count}</span></div>`;
    });

    $('sb-body').innerHTML = html;
  }

  function renderSidebarSearch(query) {
    const results = Vault.search(query);
    let html = `<div class="sb-section-t">Suche · ${results.length} Treffer</div>`;
    if (!results.length) html += '<div class="empty">Keine Treffer</div>';
    results.forEach((r) => {
      html += `<div class="tree-row" data-type="note" data-id="${r.note.id}" style="padding-left:8px; flex-direction:column; align-items:flex-start; gap:2px; height:auto; padding-top:7px; padding-bottom:7px;">
        <span class="lbl" style="font-weight:500">${esc(r.note.nameNoExt)}</span>
        ${r.snippet ? `<span style="font-size:11px;color:var(--text-3);white-space:normal;">${esc(r.snippet)}</span>` : ''}
      </div>`;
    });
    $('sb-body').innerHTML = html;
  }

  // ---------------- MAIN VIEWS ----------------
  function setView(view, extra) {
    state.view = view;
    if (view === 'note') state.noteId = extra;
    if (view === 'tag') state.tag = extra;
    state.editing = false;
    const notesActive = view === 'note' || view === 'notes' || view === 'tag';
    document.querySelectorAll('.sb-nav button').forEach((b) => {
      b.classList.toggle('active',
        (b.dataset.view === 'dashboard' && view === 'dashboard') ||
        (b.dataset.view === 'board' && view === 'board') ||
        (b.dataset.view === 'notes' && notesActive));
    });
    renderSidebar();
    renderMain();
    closeMobileSidebar();
  }

  function renderMain() {
    if (state.view === 'dashboard') return renderDashboard();
    if (state.view === 'board') return renderBoard();
    if (state.view === 'note' || state.view === 'notes') return renderNoteView(state.noteId);
    if (state.view === 'tag') return renderTagView(state.tag);
  }

  function taskRowHtml(t) {
    const badges = [];
    if (t.due) badges.push(`<span class="badge bb">📅 ${esc(t.due)}</span>`);
    if (t.priority === 'high') badges.push(`<span class="badge br">⏫</span>`);
    if (t.strategicLink) {
      const targetId = t.strategicLink.targetNote ? t.strategicLink.targetNote.id : '';
      badges.push(`<span class="badge bv tag-chip" data-action="open-note" data-note="${targetId}">→ ${esc(t.strategicLink.label)}</span>`);
    }
    return `<div class="ti">
      <div class="chk ${t.done ? 'on' : ''}" data-action="toggle" data-note="${t.noteId}" data-line="${t.lineIndex}"></div>
      <div class="tb">
        <div class="tt ${t.done ? 'done' : ''}">${esc(t.text)}</div>
        <div class="tm">${badges.join('')}<span class="src-link" data-action="open-note" data-note="${t.noteId}">${esc(t.noteName.replace(/\.md$/i, ''))}</span></div>
      </div>
    </div>`;
  }

  function taskListHtml(list, emptyMsg) {
    if (!list.length) return `<div class="empty">${esc(emptyMsg)}</div>`;
    return list.map(taskRowHtml).join('');
  }

  function renderDashboard() {
    $('main-title-text').textContent = 'Aufgaben';
    $('main-title-path').textContent = '';
    $('main-actions').innerHTML = `<button class="btn btn-p" id="add-task-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Aufgabe</button>`;
    $('add-task-btn').onclick = () => openTaskModal();

    const all = Tasks.getAllTasks();
    const b = Tasks.classify(all);
    const stats = Tasks.getStats(b, all);

    $('main-body').innerHTML = `
      <div class="dash-wrap">
        <div class="stats">
          <div class="stat"><div class="stat-n r">${stats.overdue}</div><div class="stat-l">Überfällig</div></div>
          <div class="stat"><div class="stat-n a">${stats.today}</div><div class="stat-l">Heute</div></div>
          <div class="stat"><div class="stat-n">${stats.week}</div><div class="stat-l">Diese Woche</div></div>
          <div class="stat"><div class="stat-n">${stats.openTotal}</div><div class="stat-l">Offen gesamt</div></div>
        </div>
        <div class="dash-grid">
          <div class="card"><div class="card-t">🔴 Überfällig</div>${taskListHtml(b.overdue, 'Nichts überfällig 🎉')}</div>
          <div class="card"><div class="card-t">⚡ Heute</div>${taskListHtml(b.today, 'Nichts für heute')}</div>
          <div class="card"><div class="card-t">🟡 Diese Woche</div>${taskListHtml(b.week, 'Keine Aufgaben diese Woche')}</div>
          <div class="card"><div class="card-t">🔵 Nächste 30 Tage</div>${taskListHtml(b.next30, 'Keine Aufgaben in Sicht')}</div>
          <div class="card"><div class="card-t">⚪ Ohne Datum</div>${taskListHtml(b.noDate, 'Keine')}</div>
          <div class="card"><div class="card-t">🔒 Privat</div>${taskListHtml(b.private, 'Keine privaten Aufgaben')}</div>
        </div>
      </div>`;
  }

  function frontmatterBadges(note) {
    const parts = [];
    if (note.frontmatter.status) parts.push(`<span class="badge bg">${esc(note.frontmatter.status)}</span>`);
    if (note.frontmatter.date) parts.push(`<span class="badge bg">📅 ${esc(note.frontmatter.date)}</span>`);
    note.tags.forEach((t) => parts.push(`<span class="badge bt tag-chip" data-action="open-tag" data-tag="${esc(t)}">#${esc(t)}</span>`));
    return parts.length ? `<div class="note-frontmatter">${parts.join('')}</div>` : '';
  }

  function renderNoteView(id) {
    const note = Vault.getNote(id);
    if (!note) {
      $('main-title-text').textContent = 'Notizen';
      $('main-title-path').textContent = '';
      $('main-actions').innerHTML = '';
      $('main-body').innerHTML = '<div class="note-wrap"><div class="empty">Wähle links eine Notiz aus dem Ordnerbaum.</div></div>';
      return;
    }
    $('main-title-text').textContent = note.nameNoExt;
    $('main-title-path').textContent = note.folderPath || 'Vault';
    $('main-actions').innerHTML = state.editing
      ? `<button class="btn" id="cancel-edit-btn">Abbrechen</button><button class="btn btn-p" id="save-note-btn">Speichern</button>`
      : `<button class="btn" id="edit-note-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          Bearbeiten</button>`;

    if (state.editing) {
      $('main-body').innerHTML = `<div class="note-wrap"><textarea class="note-editor" id="note-editor">${esc(note.raw)}</textarea></div>`;
      $('save-note-btn').onclick = async () => {
        const val = $('note-editor').value;
        try {
          await Drive.writeText(note.id, val);
          await Vault.reindexNote(note.id, val);
          state.editing = false;
          renderSidebar();
          renderNoteView(id);
          toast('Gespeichert ✓');
        } catch (e) { toast('Fehler beim Speichern'); console.error(e); }
      };
      $('cancel-edit-btn').onclick = () => { state.editing = false; renderNoteView(id); };
    } else {
      const backlinks = Vault.getBacklinks(id);
      const html = MD.render(note.body, Vault.resolveNoteByTarget);
      $('main-body').innerHTML = `<div class="note-wrap">
        ${frontmatterBadges(note)}
        <div class="note-content">${html}</div>
        <div class="backlinks">
          <div class="backlinks-t">🔗 Backlinks (${backlinks.length})</div>
          ${backlinks.length ? backlinks.map((n) => `<div class="backlink-item" data-note="${n.id}">${esc(n.nameNoExt)}</div>`).join('') : '<div class="empty">Keine Notiz verlinkt hierher.</div>'}
        </div>
      </div>`;
      $('edit-note-btn').onclick = () => { state.editing = true; renderNoteView(id); };
    }
  }

  function renderTagView(tag) {
    $('main-title-text').textContent = '#' + tag;
    $('main-title-path').textContent = '';
    $('main-actions').innerHTML = '';
    const notes = Vault.getNotesByTag(tag);
    const tasks = Tasks.getAllTasks().filter((t) => t.tags.includes(tag));
    $('main-body').innerHTML = `<div class="dash-wrap">
      <div class="dash-grid">
        <div class="card">
          <div class="card-t">Notizen mit #${esc(tag)} (${notes.length})</div>
          ${notes.length ? notes.map((n) => `<div class="backlink-item" data-note="${n.id}">${esc(n.nameNoExt)}</div>`).join('') : '<div class="empty">Keine Notizen</div>'}
        </div>
        <div class="card">
          <div class="card-t">Aufgaben mit #${esc(tag)} (${tasks.length})</div>
          ${taskListHtml(tasks, 'Keine Aufgaben mit diesem Tag')}
        </div>
      </div>
    </div>`;
  }

  // ---------------- BOARD ----------------
  function boardCardHtml(t) {
    const badges = [];
    if (t.due) badges.push(`<span class="badge bb">📅 ${esc(t.due)}</span>`);
    if (t.priority === 'high') badges.push(`<span class="badge br">⏫</span>`);
    if (t.done && t.completedOn) badges.push(`<span class="badge bg">✅ ${esc(t.completedOn)}</span>`);
    const colIdx = Board.columnIndexOf(t);
    const last = Board.ORDER.length - 1;
    const source = state.boardProject ? '' :
      `<span class="src-link" data-action="open-note" data-note="${t.noteId}">${esc(t.noteName.replace(/\.md$/i, ''))}</span>`;
    return `<div class="bcard" draggable="true" data-note="${t.noteId}" data-line="${t.lineIndex}">
      <div class="bcard-t${t.done ? ' done' : ''}">${esc(t.text)}</div>
      <div class="bcard-m">
        ${badges.join('')}${source}
        <span class="bmove">
          <button class="mv" data-action="board-move" data-dir="-1" ${colIdx <= 0 ? 'disabled' : ''} title="Spalte zurück">‹</button>
          <button class="mv" data-action="board-move" data-dir="1" ${colIdx >= last ? 'disabled' : ''} title="Spalte weiter">›</button>
        </span>
      </div>
    </div>`;
  }

  function renderBoard() {
    const project = state.boardProject ? Vault.getNote(state.boardProject) : null;
    if (state.boardProject && !project) state.boardProject = null;

    $('main-title-text').textContent = 'Board';
    $('main-title-path').textContent = project ? project.nameNoExt : 'Übersicht · alle Aufgaben';
    $('main-actions').innerHTML = `<button class="btn btn-p" id="add-task-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Aufgabe</button>`;
    $('add-task-btn').onclick = () => openTaskModal();

    const projects = Board.getProjects();
    let chips = `<button class="proj-chip${!state.boardProject ? ' active' : ''}" data-board="">☰ Übersicht</button>`;
    projects.forEach((p) => {
      chips += `<button class="proj-chip${state.boardProject === p.id ? ' active' : ''}" data-board="${p.id}">
        ${esc(p.nameNoExt)}<span class="n">${p.openCount}</span></button>`;
    });

    const buckets = Board.getColumns(state.boardProject);
    const colsHtml = Board.COLUMNS.map((c) => {
      const list = buckets[c.id];
      const count = c.id === 'done' ? buckets.doneTotal : list.length;
      return `<div class="bcol" data-col="${c.id}">
        <div class="bcol-h"><span>${c.title}</span><span class="n">${count}</span></div>
        <div class="bcol-body">${list.map(boardCardHtml).join('') || '<div class="bempty">Karten hierher ziehen</div>'}</div>
      </div>`;
    }).join('');

    $('main-body').innerHTML = `<div class="board-wrap">
      <div class="proj-chips">${chips}</div>
      <div class="board">${colsHtml}</div>
    </div>`;
  }

  function boardMove(ref, targetCol) {
    Board.moveTask(ref, targetCol)
      .then(() => { renderMain(); toast('Verschoben ✓'); })
      .catch((e) => { toast('Fehler beim Verschieben'); console.error(e); renderMain(); });
  }

  // ---------------- TASK MODAL ----------------
  function openTaskModal() {
    $('m-text').value = '';
    $('m-date').value = '';
    $('m-tag').value = '';
    $('m-prio').value = 'week';
    $('overlay').classList.add('open');
    setTimeout(() => $('m-text').focus(), 50);
  }
  function closeTaskModal() { $('overlay').classList.remove('open'); }

  async function saveTaskFromModal() {
    const text = $('m-text').value.trim();
    if (!text) return;
    const priority = $('m-prio').value;
    const due = $('m-date').value;
    const tag = $('m-tag').value.trim();
    closeTaskModal();
    try {
      await Tasks.addTask({ text, priority, due, tag });
      renderSidebar();
      renderMain();
      toast('Aufgabe gespeichert ✓');
    } catch (e) { toast('Fehler beim Speichern'); console.error(e); }
  }

  // ---------------- EVENT WIRING ----------------
  function handleToggle(el) {
    const noteId = el.dataset.note;
    const line = Number(el.dataset.line);
    const wasDone = el.classList.contains('on');
    el.classList.toggle('on');
    Tasks.toggleTask({ noteId, lineIndex: line, done: wasDone })
      .then(() => renderMain())
      .catch((e) => { toast('Fehler beim Speichern'); console.error(e); renderMain(); });
  }

  function wireStatic() {
    $('login-btn').onclick = () => {
      try { Drive.login(); } catch (e) { toast(e.message); }
    };
    $('sync-btn').onclick = () => runSync();
    $('logout-btn').onclick = () => { Drive.logout(); showLogin(); };
    $('menu-btn').onclick = () => $('sidebar').classList.toggle('open');

    document.querySelectorAll('.sb-nav button').forEach((btn) => {
      btn.onclick = () => {
        const v = btn.dataset.view;
        if (v === 'notes') setView(state.noteId ? 'note' : 'notes');
        else setView(v);
      };
    });

    $('search-input').addEventListener('input', debounce((e) => {
      const q = e.target.value.trim();
      if (q.length < 2) { renderSidebar(); return; }
      renderSidebarSearch(q);
    }, 180));

    $('sb-body').addEventListener('click', (e) => {
      const tagRow = e.target.closest('.tag-pill-row');
      if (tagRow) { setView('tag', tagRow.dataset.tag); return; }
      const row = e.target.closest('.tree-row');
      if (!row) return;
      if (row.dataset.type === 'folder') {
        const id = row.dataset.id;
        state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
        renderSidebar();
      } else if (row.dataset.type === 'note') {
        setView('note', row.dataset.id);
      }
    });

    $('main-body').addEventListener('click', (e) => {
      const mv = e.target.closest('[data-action="board-move"]');
      if (mv && !mv.disabled) {
        const card = mv.closest('.bcard');
        const t = { noteId: card.dataset.note, lineIndex: Number(card.dataset.line) };
        const note = Vault.getNote(t.noteId);
        const task = note && note.tasks.find((x) => x.lineIndex === t.lineIndex);
        if (!task) return;
        const idx = Board.columnIndexOf(task) + Number(mv.dataset.dir);
        const target = Board.ORDER[idx];
        if (target) boardMove(t, target);
        return;
      }
      const chip = e.target.closest('.proj-chip');
      if (chip) {
        state.boardProject = chip.dataset.board || null;
        renderBoard();
        return;
      }
      const chk = e.target.closest('[data-action="toggle"]');
      if (chk) { handleToggle(chk); return; }
      const openN = e.target.closest('[data-action="open-note"]');
      if (openN && openN.dataset.note) { setView('note', openN.dataset.note); return; }
      const openT = e.target.closest('[data-action="open-tag"]');
      if (openT) { setView('tag', openT.dataset.tag); return; }
      const backlink = e.target.closest('.backlink-item');
      if (backlink) { setView('note', backlink.dataset.note); return; }
      const wl = e.target.closest('a.wikilink');
      if (wl) {
        e.preventDefault();
        if (wl.dataset.id) setView('note', wl.dataset.id);
        else toast(`Notiz "${wl.dataset.target}" nicht gefunden`);
      }
    });

    // Drag & Drop fürs Board (delegiert, überlebt Re-Renders)
    $('main-body').addEventListener('dragstart', (e) => {
      const card = e.target.closest('.bcard');
      if (!card) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.note + '|' + card.dataset.line);
      card.classList.add('dragging');
    });
    $('main-body').addEventListener('dragend', (e) => {
      const card = e.target.closest('.bcard');
      if (card) card.classList.remove('dragging');
      document.querySelectorAll('.bcol.over').forEach((c) => c.classList.remove('over'));
    });
    $('main-body').addEventListener('dragover', (e) => {
      const col = e.target.closest('.bcol');
      if (!col) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.bcol.over').forEach((c) => { if (c !== col) c.classList.remove('over'); });
      col.classList.add('over');
    });
    $('main-body').addEventListener('dragleave', (e) => {
      const col = e.target.closest('.bcol');
      if (col && !col.contains(e.relatedTarget)) col.classList.remove('over');
    });
    $('main-body').addEventListener('drop', (e) => {
      const col = e.target.closest('.bcol');
      if (!col) return;
      e.preventDefault();
      col.classList.remove('over');
      const data = e.dataTransfer.getData('text/plain');
      if (!data) return;
      const [noteId, line] = data.split('|');
      boardMove({ noteId, lineIndex: Number(line) }, col.dataset.col);
    });

    $('m-cancel').onclick = closeTaskModal;
    $('m-save').onclick = saveTaskFromModal;
    $('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeTaskModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTaskModal(); });
  }

  // ---------------- INIT ----------------
  function init() {
    wireStatic();
    Drive.init((result) => {
      if (result.error) { toast('Anmeldung fehlgeschlagen'); return; }
      if (result.ok) {
        showApp();
        runSync();
      } else {
        showLogin();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
