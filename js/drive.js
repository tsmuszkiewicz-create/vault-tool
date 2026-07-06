// ================================================================
// Drive – dünne Wrapper um die Google Drive REST API.
// Auth-Flow (Google Identity Services Token Client) und die
// Read/Write-Helper sind bewusst wie im bestehenden aufgaben.html-Tool
// gehalten, damit das Muster vertraut bleibt.
// ================================================================
const Drive = (() => {
  let tokenClient = null;
  let token = null;
  let profile = null;

  function isLoggedIn() { return !!token; }

  function init(onReady) {
    const saved = sessionStorage.getItem('_vault_gat');
    const savedProfile = sessionStorage.getItem('_vault_profile');
    if (saved) {
      token = saved;
      profile = savedProfile ? JSON.parse(savedProfile) : null;
    }
    const wait = setInterval(() => {
      if (!window.google?.accounts) return;
      clearInterval(wait);
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPE,
        callback: async (res) => {
          if (res.error) { onReady({ error: res.error }); return; }
          token = res.access_token;
          sessionStorage.setItem('_vault_gat', token);
          await fetchProfile();
          onReady({ ok: true, fresh: true });
        },
      });
      onReady({ ok: !!token, fresh: false });
    }, 150);
  }

  function login() {
    if (!tokenClient) throw new Error('Google-Script noch nicht geladen – kurz warten.');
    tokenClient.requestAccessToken();
  }

  function logout() {
    token = null;
    profile = null;
    sessionStorage.removeItem('_vault_gat');
    sessionStorage.removeItem('_vault_profile');
  }

  async function fetchProfile() {
    try {
      const r = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return;
      const data = await r.json();
      profile = data.user || null;
      if (profile) sessionStorage.setItem('_vault_profile', JSON.stringify(profile));
    } catch (e) { /* ignore */ }
  }

  function getProfile() { return profile; }

  async function authFetch(url, opts = {}) {
    const r = await fetch(url, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
    });
    if (r.status === 401) {
      token = null;
      sessionStorage.removeItem('_vault_gat');
      throw new Error('auth-expired');
    }
    return r;
  }

  // Listet alle direkten Kinder eines Ordners (Dateien + Unterordner), mit Paginierung.
  async function listChildren(folderId) {
    let files = [];
    let pageToken = null;
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id,name,mimeType,parents,modifiedTime)',
        pageSize: '1000',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const r = await authFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
      if (!r.ok) throw new Error(`list:${r.status}`);
      const data = await r.json();
      files = files.concat(data.files || []);
      pageToken = data.nextPageToken || null;
    } while (pageToken);
    return files;
  }

  async function readText(fileId) {
    const r = await authFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    if (!r.ok) throw new Error(`read:${r.status}`);
    return r.text();
  }

  async function writeText(fileId, content) {
    const r = await authFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: content,
      }
    );
    if (!r.ok) throw new Error(`write:${r.status}`);
    return r.json();
  }

  async function createFile(name, parentId, content) {
    const meta = JSON.stringify({ name, mimeType: 'text/markdown', parents: [parentId] });
    const fd = new FormData();
    fd.append('metadata', new Blob([meta], { type: 'application/json' }));
    fd.append('file', new Blob([content], { type: 'text/plain; charset=utf-8' }));
    const r = await authFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,parents',
      { method: 'POST', body: fd }
    );
    if (!r.ok) throw new Error(`create:${r.status}`);
    return r.json();
  }

  return { init, login, logout, isLoggedIn, getProfile, listChildren, readText, writeText, createFile };
})();
