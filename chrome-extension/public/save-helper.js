/* global indexedDB, window, document, chrome, setTimeout, location, URL, fetch */

const DB_NAME = 'knowledge-extension-db';
const STORE_NAME = 'knowledge-dir';
const HANDLE_KEY = 'directory-handle';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
  });
}

async function getHandle() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(HANDLE_KEY);
    req.onsuccess = () => {
      db.close();
      resolve(req.result ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function setHandle(handle) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(handle, HANDLE_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getSubdir(rootHandle, pathSegment) {
  const segments = pathSegment.split('/').filter(Boolean);
  let current = rootHandle;
  for (const seg of segments) {
    current = await current.getDirectoryHandle(seg, { create: true });
  }
  return current;
}

async function writeFile(rootHandle, pathSegment, filename, content) {
  const dir = await getSubdir(rootHandle, pathSegment);
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function writeBinaryFile(rootHandle, pathSegment, filename, blob) {
  const dir = await getSubdir(rootHandle, pathSegment);
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function extFromUrlOrType(url, contentType) {
  const type = (contentType || '').toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(png|jpe?g|webp|gif)(\?|$)/i);
    if (match) return match[1].toLowerCase().replace('jpeg', 'jpg');
  } catch {
    /* invalid URL or pathname */
  }
  return 'png';
}

async function ensureUniqueFilename(rootHandle, pathSegment, baseFilename) {
  const dir = await getSubdir(rootHandle, pathSegment);
  try {
    await dir.getFileHandle(baseFilename);
  } catch {
    return baseFilename;
  }
  const base = baseFilename.replace(/\.md$/i, '');
  const d = new Date();
  const suffix =
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0');
  return `${base}-${suffix}.md`;
}

async function obtainWritableHandle() {
  let handle = await getHandle();
  if (handle) {
    try {
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') return handle;
    } catch {
      /* fall through */
    }
  }
  handle = await window.showDirectoryPicker();
  await setHandle(handle);
  return handle;
}

const titleEl = document.getElementById('title');
const pathInfoEl = document.getElementById('pathInfo');
const actionsEl = document.getElementById('actions');
const msgEl = document.getElementById('msg');
const saveBtn = document.getElementById('saveBtn');

let pendingData = null;

async function init() {
  try {
    const stored = await chrome.storage.session.get('pendingSave');
    pendingData = stored?.pendingSave;
    if (!pendingData) {
      titleEl.textContent = '错误';
      msgEl.innerHTML = '<span class="error">没有待保存的数据</span>';
      actionsEl.innerHTML = '<button class="btn btn-secondary" id="closeBtn1">关闭</button>';
      document.getElementById('closeBtn1').addEventListener('click', () => window.close());
      return;
    }
    pathInfoEl.textContent = '\u{1F4C1} ' + pendingData.knowledgePath + '/' + pendingData.filename;
  } catch (err) {
    titleEl.textContent = '错误';
    msgEl.innerHTML = '<span class="error">' + (err?.message ?? err) + '</span>';
    actionsEl.innerHTML = '<button class="btn btn-secondary" id="closeBtn2">关闭</button>';
    document.getElementById('closeBtn2').addEventListener('click', () => window.close());
  }
}

saveBtn.addEventListener('click', async () => {
  if (!pendingData) return;
  saveBtn.disabled = true;
  titleEl.textContent = '正在保存…';
  actionsEl.innerHTML = '<div class="spinner"></div>';
  msgEl.textContent = '';

  try {
    const { content, knowledgePath, filename, images: rawImages } = pendingData;
    const images = Array.isArray(rawImages) ? rawImages : [];
    const handle = await obtainWritableHandle();
    const finalFilename = await ensureUniqueFilename(handle, knowledgePath, filename);
    const stem = finalFilename.replace(/\.md$/i, '');
    const assetsDirName = stem + '-assets';
    const assetsPathSegment = knowledgePath + '/' + assetsDirName;

    let finalContent = content;
    if (images.length > 0) {
      const localPaths = [];
      const alts = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const src = img && img.src ? String(img.src) : '';
        const alt = (img && img.alt ? String(img.alt) : '').replace(/\]/g, '\\]');
        if (!src) continue;
        try {
          const res = await fetch(src, { mode: 'cors', credentials: 'omit' });
          if (!res.ok) continue;
          const blob = await res.blob();
          const contentType = res.headers.get('content-type') || '';
          const ext = extFromUrlOrType(src, contentType);
          const imgFilename = 'img-' + i + '.' + ext;
          await writeBinaryFile(handle, assetsPathSegment, imgFilename, blob);
          localPaths.push('./' + assetsDirName + '/' + imgFilename);
          alts.push(alt);
        } catch {
          /* skip failed image */
        }
      }
      if (localPaths.length > 0) {
        const imageLines = localPaths.map(function (path, idx) {
          return '![' + alts[idx] + '](' + path + ')';
        });
        finalContent = content + '\n\n## 图片\n\n' + imageLines.join('\n\n');
      }
    }

    await writeFile(handle, knowledgePath, finalFilename, finalContent);

    await chrome.storage.session.remove('pendingSave');
    await chrome.storage.session.set({ saveResult: { ok: true, filename: finalFilename, path: knowledgePath } });

    titleEl.textContent = '保存成功';
    actionsEl.innerHTML = '';
    msgEl.innerHTML = '<span class="success">\u2713 已保存到 ' + knowledgePath + '/' + finalFilename + '</span>';
    setTimeout(() => window.close(), 1500);
  } catch (err) {
    const msg = err?.message ?? String(err);
    await chrome.storage.session.set({ saveResult: { ok: false, error: msg } }).catch(() => {});
    titleEl.textContent = '保存失败';
    actionsEl.innerHTML =
      '<button class="btn btn-primary" id="retryBtn">重试</button> <button class="btn btn-secondary" id="closeBtn3">关闭</button>';
    document.getElementById('retryBtn').addEventListener('click', () => location.reload());
    document.getElementById('closeBtn3').addEventListener('click', () => window.close());
    msgEl.innerHTML = '<span class="error">' + msg + '</span>';
  }
});

document.getElementById('cancelBtn').addEventListener('click', () => window.close());

init();
