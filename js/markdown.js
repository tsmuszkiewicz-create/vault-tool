// ================================================================
// Markdown-Utilities: Frontmatter, [[Wikilinks]], #Tags, Checkbox-Tasks,
// und das Rendering zu HTML (via marked.js + Wikilink-Nachbearbeitung).
// ================================================================
const MD = (() => {
  const WIKILINK_RE = /\[\[([^\]|#]+)(#[^\]|]*)?(\|([^\]]+))?\]\]/g;
  const INLINE_TAG_RE = /(^|[\s(])#([a-zA-Z0-9_\-/]+)/g;
  const TASK_LINE_RE = /^(\s*)-\s\[([ xX])\]\s(.+)$/;
  const DUE_RE = /📅\s*(\d{4}-\d{2}-\d{2})/;
  const DONE_RE = /✅\s*(\d{4}-\d{2}-\d{2})/;
  const HIGH_PRIO_RE = /⏫/;
  const MED_PRIO_RE = /⚠️/;

  if (window.marked) {
    marked.setOptions({ gfm: true, breaks: false });
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- Frontmatter ----
  function splitFrontmatter(raw) {
    if (!raw.startsWith('---')) return { frontmatter: {}, body: raw, frontmatterRaw: '' };
    const end = raw.indexOf('\n---', 3);
    if (end === -1) return { frontmatter: {}, body: raw, frontmatterRaw: '' };
    const fmBlock = raw.slice(3, end).trim();
    let bodyStart = raw.indexOf('\n', end + 1);
    bodyStart = bodyStart === -1 ? raw.length : bodyStart + 1;
    const body = raw.slice(bodyStart);
    return { frontmatter: parseSimpleYaml(fmBlock), body, frontmatterRaw: fmBlock };
  }

  // Sehr einfacher YAML-Parser, reicht für flache key:value / key:[a,b] / key:\n - a Strukturen.
  function parseSimpleYaml(block) {
    const out = {};
    const lines = block.split('\n');
    let currentKey = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const listMatch = line.match(/^\s*-\s*(.+)$/);
      if (listMatch && currentKey) {
        out[currentKey] = out[currentKey] || [];
        out[currentKey].push(listMatch[1].trim());
        continue;
      }
      const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (kv) {
        const key = kv[1];
        let val = kv[2].trim();
        currentKey = key;
        if (val === '') { out[key] = out[key] || []; continue; }
        if (val.startsWith('[') && val.endsWith(']')) {
          out[key] = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
          currentKey = null;
        } else {
          out[key] = val.replace(/^["']|["']$/g, '');
          currentKey = null;
        }
      }
    }
    return out;
  }

  // ---- Wikilinks ----
  function extractWikilinks(raw) {
    const links = [];
    let m;
    WIKILINK_RE.lastIndex = 0;
    while ((m = WIKILINK_RE.exec(raw))) {
      links.push({ target: m[1].trim(), alias: (m[4] || '').trim() });
    }
    return links;
  }

  // ---- Tags (Frontmatter + Inline) ----
  function extractTags(raw, frontmatter) {
    const tags = new Set();
    const fmTags = frontmatter.tags;
    if (Array.isArray(fmTags)) fmTags.forEach((t) => tags.add(String(t).replace(/^#/, '').trim()));
    else if (typeof fmTags === 'string' && fmTags) tags.add(fmTags.replace(/^#/, '').trim());
    let m;
    INLINE_TAG_RE.lastIndex = 0;
    while ((m = INLINE_TAG_RE.exec(raw))) {
      tags.add(m[2]);
    }
    return Array.from(tags).filter(Boolean);
  }

  // ---- Checkbox-Tasks ----
  function extractTasks(raw) {
    const lines = raw.split('\n');
    const tasks = [];
    lines.forEach((line, idx) => {
      const m = line.match(TASK_LINE_RE);
      if (!m) return;
      const done = m[2].toLowerCase() === 'x';
      const rest = m[3];
      const dueM = rest.match(DUE_RE);
      const doneM = rest.match(DONE_RE);
      const tags = [];
      let tm;
      const tagRe = /#([a-zA-Z0-9_\-/]+)/g;
      while ((tm = tagRe.exec(rest))) tags.push(tm[1]);
      let text = rest
        .replace(DUE_RE, '')
        .replace(DONE_RE, '')
        .replace(HIGH_PRIO_RE, '')
        .replace(MED_PRIO_RE, '')
        .replace(/#[a-zA-Z0-9_\-/]+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      tasks.push({
        lineIndex: idx,
        raw: line,
        done,
        text,
        due: dueM ? dueM[1] : null,
        completedOn: doneM ? doneM[1] : null,
        priority: HIGH_PRIO_RE.test(rest) ? 'high' : (MED_PRIO_RE.test(rest) ? 'medium' : null),
        tags,
      });
    });
    return tasks;
  }

  // Setzt den Done-Status einer Zeile um (für's Zurückschreiben nach Drive).
  function toggleLine(raw, done) {
    const today = new Date().toISOString().slice(0, 10);
    let out = raw.replace(DONE_RE, '').trimEnd();
    if (done) {
      out = out.replace(/^(\s*-\s)\[\s\]/, '$1[x]') + ` ✅ ${today}`;
    } else {
      out = out.replace(/^(\s*-\s)\[[xX]\]/, '$1[ ]');
    }
    return out;
  }

  // ---- Rendering ----
  function render(body, resolveFn) {
    if (!window.marked) return `<pre>${escapeHtml(body)}</pre>`;
    const links = [];
    const processed = body.replace(WIKILINK_RE, (whole, target, _anchor, _g, alias) => {
      const idx = links.length;
      links.push({ target: target.trim(), alias: (alias || '').trim() });
      return `zzzWLTOKEN${idx}zzz`;
    });
    let html = marked.parse(processed);
    html = html.replace(/zzzWLTOKEN(\d+)zzz/g, (whole, idxStr) => {
      const { target, alias } = links[Number(idxStr)];
      const label = alias || target.split('/').pop();
      const resolved = resolveFn ? resolveFn(target) : null;
      const cls = resolved ? 'wikilink' : 'wikilink missing';
      const id = resolved ? resolved.id : '';
      return `<a href="#" class="${cls}" data-target="${escapeHtml(target)}" data-id="${escapeHtml(id)}">${escapeHtml(label)}</a>`;
    });
    return html;
  }

  return {
    splitFrontmatter, extractWikilinks, extractTags, extractTasks, toggleLine, render, escapeHtml,
  };
})();
