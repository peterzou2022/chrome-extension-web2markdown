/* global indexedDB, window, document, chrome, setTimeout, location, URL, fetch, Blob, console */

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

/** 向已获取的目录句柄写入文本文件，避免多次 getSubdir；用 Blob 写入以减少 state 错误 */
async function writeTextToDir(dirHandle, filename, content) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  await writable.write(blob);
  await writable.close();
}

/** 向已获取的目录句柄写入二进制文件，避免多次 getSubdir 触发 "state had changed" 错误 */
async function writeBinaryToDir(dirHandle, filename, blob) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
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

/** 在指定目录下解析出唯一文件名，避免与已有文件冲突 */
async function ensureUniqueFilenameInDir(dirHandle, baseFilename) {
  try {
    await dirHandle.getFileHandle(baseFilename);
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
    const mdDir = await getSubdir(handle, knowledgePath);
    const finalFilename = await ensureUniqueFilenameInDir(mdDir, filename);
    const stem = finalFilename.replace(/\.md$/i, '');
    const assetsDirName = stem + '-assets';
    const assetsPathSegment = knowledgePath + '/' + assetsDirName;
    const needsAssets = images.length > 0;
    const assetsDir = needsAssets ? await getSubdir(handle, assetsPathSegment) : null;

    const hasPlaceholders = /IMAGE_PLACEHOLDER_\d+/.test(content);
    const localPaths = [];
    const alts = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const src = img && img.src ? String(img.src) : '';
      const ext = extFromUrlOrType(src, '');
      const imgFilename = 'img-' + i + '.' + ext;
      localPaths.push('./' + assetsDirName + '/' + imgFilename);
      alts.push((img && img.alt ? String(img.alt) : '').replace(/\]/g, '\\]'));
    }
    let finalContent = content;
    if (localPaths.length > 0) {
      if (hasPlaceholders) {
        finalContent = content.replace(/IMAGE_PLACEHOLDER_(\d+)/g, function (_, n) {
          const idx = parseInt(n, 10);
          return idx < localPaths.length ? localPaths[idx] : 'IMAGE_PLACEHOLDER_' + n;
        });
      } else {
        finalContent =
          content +
          '\n\n## 图片\n\n' +
          localPaths
            .map(function (path, idx) {
              return '![' + alts[idx] + '](' + path + ')';
            })
            .join('\n\n');
      }
    }

    await writeTextToDir(mdDir, finalFilename, finalContent);

    const blobsToWrite = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const src = img && img.src ? String(img.src) : '';
      if (!src) continue;
      const ext = extFromUrlOrType(src, '');
      const imgFilename = 'img-' + i + '.' + ext;
      try {
        const res = await fetch(src, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) continue;
        const blob = await res.blob();
        blobsToWrite.push({ filename: imgFilename, blob });
      } catch {
        /* skip failed image */
      }
    }
    if (assetsDir && blobsToWrite.length > 0) {
      for (let i = 0; i < blobsToWrite.length; i++) {
        const { filename: imgFilename, blob } = blobsToWrite[i];
        try {
          await writeBinaryToDir(assetsDir, imgFilename, blob);
        } catch (imgErr) {
          console.warn('Image write failed:', imgFilename, imgErr);
        }
      }
    }

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
