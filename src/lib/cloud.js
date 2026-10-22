// Cloud save: the visitor's backup (backup.js) kept as one file in their own
// Google Drive (the hidden app-data folder, scope drive.appdata) or Dropbox
// (the app's own folder), read and written straight from the browser with
// OAuth. There is no server in between; tokens stay in this browser
// (cloud-state.js).
//
// A save first checks the cloud file's version: when another device saved
// since this browser last did, that file is merged in (backup import rules)
// before the union is written back, so two devices never overwrite each
// other's new ratings. Dropbox stays connected with a refresh token; Google
// hands a browser one-hour tokens only, so after that a save needs a click.
import { writeJson, removeKey, CHANGED_EVENT } from './store.js';
import { backupData, importBackupData } from './backup.js';
import { withBase } from './util.js';
import { CLOUD_KEY, CLOUD_EVENT, PROVIDERS, cloudState, unsaved } from './cloud-state.js';

const FILE = 'cinema-ledger-save.json';
const GOOGLE_ID = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID || '';
const DROPBOX_KEY = import.meta.env.PUBLIC_DROPBOX_APP_KEY || '';
// Which providers this build can offer (their ids come from the environment).
export const AVAILABLE = { google: !!GOOGLE_ID, dropbox: !!DROPBOX_KEY };

export class CloudError extends Error {
  constructor(message, { auth = false, conflict = false } = {}) {
    super(message);
    this.auth = auth; // the provider wants the visitor to sign in again
    this.conflict = conflict;
  }
}

let status = { state: 'idle' };
function announce(next) {
  if (next) status = next;
  window.dispatchEvent(new CustomEvent(CLOUD_EVENT, { detail: status }));
}
export const cloudStatus = () => status;

function persist(s) {
  writeJson(CLOUD_KEY, s);
  announce();
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const expiresAt = (seconds) => Date.now() + Math.max(60, (Number(seconds) || 3600) - 120) * 1000;

/* ── Google Drive ─────────────────────────────────────────────────────── */

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

// Google's sign-in script, loaded on first need. Load it before the click that
// asks for a token, or the browser may block the sign-in window.
let gis = null;
export function loadGoogle() {
  gis ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve(window.google.accounts.oauth2);
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve(window.google.accounts.oauth2);
    script.onerror = () => {
      gis = null;
      reject(new CloudError("Google's sign-in couldn't load. Check the connection (or a blocker) and try again."));
    };
    document.head.append(script);
  });
  return gis;
}

// A one-hour access token. `prompt` '' lets Google skip screens the visitor
// already agreed to; 'select_account' asks which account to use.
async function googleToken(prompt) {
  const oauth2 = await loadGoogle();
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_ID,
      scope: GOOGLE_SCOPE,
      prompt,
      callback: (r) => {
        if (r.error) return reject(new CloudError('Google sign-in did not finish.', { auth: true }));
        if (!oauth2.hasGrantedAllScopes(r, GOOGLE_SCOPE)) {
          return reject(new CloudError('Google Drive access was not allowed, so nothing can be saved there. Connect again and tick the Drive box.', { auth: true }));
        }
        resolve({ access: r.access_token, expires: expiresAt(r.expires_in) });
      },
      error_callback: (e) =>
        reject(new CloudError(e?.type === 'popup_closed' ? 'The Google window closed before it finished.' : "Google's sign-in window couldn't open. Allow pop-ups for this site and try again.", { auth: true })),
    });
    client.requestAccessToken();
  });
}

async function gfetch(s, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${s.token.access}` } });
  if (res.status === 401) throw new CloudError('Google needs you to sign in again.', { auth: true });
  if (!res.ok) throw new CloudError(`Google Drive answered with an error (${res.status}). Try again later.`);
  return res;
}

const google = {
  async access(s, interactive) {
    if (s.token?.access && s.token.expires > Date.now()) return s;
    if (!interactive) throw new CloudError('Google needs a click to save again.', { auth: true });
    return { ...s, token: await googleToken('') };
  },
  async account(s) {
    const r = await (await gfetch(s, `${DRIVE}/about?fields=user(displayName,emailAddress)`)).json();
    return { name: r.user?.displayName ?? '', email: r.user?.emailAddress ?? '' };
  },
  async stat(s) {
    const q = encodeURIComponent(`name='${FILE}' and trashed=false`);
    const r = await (await gfetch(s, `${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id,version)&pageSize=1`)).json();
    const f = r.files?.[0];
    return f ? { id: f.id, rev: String(f.version) } : null;
  },
  async download(s, remote) {
    return (await gfetch(s, `${DRIVE}/files/${remote.id}?alt=media`)).text();
  },
  async upload(s, body, remote) {
    let res;
    if (remote) {
      res = await gfetch(s, `${DRIVE_UPLOAD}/files/${remote.id}?uploadType=media&fields=id,version`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } else {
      const boundary = `cinema-${b64url(crypto.getRandomValues(new Uint8Array(12)))}`;
      const meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'], mimeType: 'application/json' });
      res = await gfetch(s, `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,version`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
      });
    }
    const r = await res.json();
    return { id: r.id, rev: String(r.version) };
  },
  async revoke(s) {
    if (!s.token?.access || s.token.expires <= Date.now()) return;
    const oauth2 = await loadGoogle();
    await new Promise((done) => oauth2.revoke(s.token.access, done));
  },
};

/* ── Dropbox ──────────────────────────────────────────────────────────── */
// OAuth with PKCE (no app secret in a static site): the visitor goes to
// Dropbox and comes back to /user/ with a code, which finishDropbox() trades
// for a refresh token.

const DBX_AUTHORIZE = 'https://www.dropbox.com/oauth2/authorize';
const DBX_TOKEN = 'https://api.dropboxapi.com/oauth2/token';
const DBX_API = 'https://api.dropboxapi.com/2';
const DBX_CONTENT = 'https://content.dropboxapi.com/2';
const DBX_PATH = `/${FILE}`;
const PKCE_KEY = 'cinema.cloud.pkce';
// Must match a redirect URI registered with the Dropbox app exactly.
const redirectUri = () => new URL(withBase('/user/'), location.origin).href;

async function dropboxToken(params) {
  const res = await fetch(DBX_TOKEN, { method: 'POST', body: new URLSearchParams({ client_id: DROPBOX_KEY, ...params }) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.access_token) throw new CloudError('Dropbox needs you to connect again.', { auth: true });
  return r;
}

async function dfetch(s, url, { arg, body, json } = {}) {
  const headers = { Authorization: `Bearer ${s.token.access}` };
  if (arg) headers['Dropbox-API-Arg'] = JSON.stringify(arg);
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  else if (body !== undefined) headers['Content-Type'] = 'application/octet-stream';
  const res = await fetch(url, { method: 'POST', headers, body: json !== undefined ? JSON.stringify(json) : body });
  if (res.status === 401) throw new CloudError('Dropbox needs you to connect again.', { auth: true });
  return res;
}
const dropboxFailed = (res) => new CloudError(`Dropbox answered with an error (${res.status}). Try again later.`);

const dropbox = {
  async access(s) {
    if (s.token?.access && s.token.expires > Date.now()) return s;
    const r = await dropboxToken({ grant_type: 'refresh_token', refresh_token: s.refresh });
    return { ...s, token: { access: r.access_token, expires: expiresAt(r.expires_in) } };
  },
  async account(s) {
    const res = await dfetch(s, `${DBX_API}/users/get_current_account`);
    if (!res.ok) return null;
    const r = await res.json();
    return { name: r.name?.display_name ?? '', email: r.email ?? '' };
  },
  async stat(s) {
    const res = await dfetch(s, `${DBX_API}/files/get_metadata`, { json: { path: DBX_PATH } });
    if (res.status === 409) return null; // not there yet
    if (!res.ok) throw dropboxFailed(res);
    return { rev: (await res.json()).rev };
  },
  async download(s) {
    const res = await dfetch(s, `${DBX_CONTENT}/files/download`, { arg: { path: DBX_PATH } });
    if (!res.ok) throw dropboxFailed(res);
    return res.text();
  },
  async upload(s, body, remote) {
    // "update" only writes over the version this browser saw; anything newer
    // answers 409 and the save starts over with that version merged in.
    const mode = remote ? { '.tag': 'update', update: remote.rev } : { '.tag': 'add' };
    const res = await dfetch(s, `${DBX_CONTENT}/files/upload`, { arg: { path: DBX_PATH, mode, autorename: false, mute: true }, body });
    if (res.status === 409) throw new CloudError('Someone saved at the same moment.', { conflict: true });
    if (!res.ok) throw dropboxFailed(res);
    return { rev: (await res.json()).rev };
  },
  async revoke(s) {
    if (s.token?.access && s.token.expires > Date.now()) await dfetch(s, `${DBX_API}/auth/token/revoke`);
  },
};

const API = { google, dropbox };

/* ── Connecting ───────────────────────────────────────────────────────── */

// Starts the Dropbox round trip (this page is left for Dropbox's).
export async function connectDropbox() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  try {
    sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  } catch {
    throw new CloudError('This browser blocks site storage, so Dropbox cannot be connected here.');
  }
  const q = new URLSearchParams({
    client_id: DROPBOX_KEY,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    redirect_uri: redirectUri(),
    token_access_type: 'offline',
    state,
  });
  location.assign(`${DBX_AUTHORIZE}?${q}`);
}

// On /user/: when the URL is Dropbox's answer, finishes connecting and syncs.
// Resolves to null when there was nothing to finish, else to what sync()
// resolves to.
export async function finishDropbox() {
  const params = new URLSearchParams(location.search);
  if (!params.has('state') || !(params.has('code') || params.has('error'))) return null;
  let pkce = null;
  try {
    pkce = JSON.parse(sessionStorage.getItem(PKCE_KEY));
    sessionStorage.removeItem(PKCE_KEY);
  } catch {}
  history.replaceState(history.state, '', location.pathname + location.hash);
  if (params.has('error')) {
    throw new CloudError(params.get('error') === 'access_denied' ? 'Dropbox access was not allowed, so nothing was connected.' : 'Dropbox did not finish connecting.');
  }
  if (!pkce || pkce.state !== params.get('state')) throw new CloudError("That Dropbox answer doesn't belong to this browser. Connect again from here.");
  const r = await dropboxToken({ grant_type: 'authorization_code', code: params.get('code'), code_verifier: pkce.verifier, redirect_uri: redirectUri() });
  return connected({ provider: 'dropbox', refresh: r.refresh_token, token: { access: r.access_token, expires: expiresAt(r.expires_in) } });
}

export async function connectGoogle() {
  const token = await googleToken('select_account');
  return connected({ provider: 'google', token });
}

async function connected(base) {
  const prev = cloudState();
  if (prev && prev.provider !== base.provider) await disconnect();
  let s = { account: null, savedAt: null, rev: null, file: null, refresh: null, ...base };
  s.account = await API[s.provider].account(s).catch(() => null);
  persist(s);
  return sync({ interactive: true });
}

// Forgets the connection here and asks the provider to revoke the token.
// The file in the visitor's Drive or Dropbox stays.
export async function disconnect() {
  const s = cloudState();
  removeKey(CLOUD_KEY);
  announce({ state: 'idle' });
  if (s) await API[s.provider].revoke(s).catch(() => {});
}

/* ── Saving ───────────────────────────────────────────────────────────── */

let running = null;
// Brings the cloud file and this browser together: merges the file in when
// another device saved since, then writes everything back if anything here is
// new. Resolves to { imported } (the backup import summary, or null).
export function sync(opts) {
  running ??= run(opts).finally(() => (running = null));
  return running;
}

async function run({ interactive = false, retry = true } = {}) {
  let s = cloudState();
  if (!s) return { imported: null };
  const api = API[s.provider];
  announce({ state: 'saving' });
  try {
    s = await api.access(s, interactive);
    const remote = await api.stat(s);
    let imported = null;
    if (remote && remote.rev !== s.rev) {
      let parsed;
      try {
        parsed = JSON.parse(await api.download(s, remote));
      } catch {
        throw new CloudError(`The save in your ${PROVIDERS[s.provider]} isn't readable. Remove ${FILE} there to start a new one.`);
      }
      imported = importBackupData(parsed).sections;
    }
    if (!remote || remote.rev !== s.rev || unsaved(s)) {
      const gatheredAt = new Date().toISOString();
      const saved = await api.upload(s, JSON.stringify(backupData()), remote);
      s = { ...s, rev: saved.rev, file: saved.id ?? s.file, savedAt: gatheredAt };
    }
    persist(s);
    announce({ state: 'saved', at: Date.now() });
    return { imported };
  } catch (err) {
    if (err.conflict && retry) {
      running = null;
      return run({ interactive, retry: false });
    }
    // Keep a refreshed token even when the save itself failed.
    if (s?.token && cloudState()) persist({ ...cloudState(), token: s.token });
    announce({ state: err.auth ? 'auth' : 'error', message: err.message ?? 'Saving failed.' });
    throw err;
  }
}

// Saves a few seconds after each change on any page, and when the page is
// hidden. Google past its hour leaves the changes pending (header dot) until
// a click.
let started = false;
let timer = null;
export function startAutoSave() {
  if (started) return;
  started = true;
  const kick = (delay) => {
    clearTimeout(timer);
    timer = setTimeout(() => cloudState() && unsaved() && sync().catch(() => {}), delay);
  };
  window.addEventListener(CHANGED_EVENT, () => kick(4000));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && kick(0));
  if (unsaved()) kick(1500);
}
