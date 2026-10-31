// Shared app code. Runs both on the website and inside the Electron app.
// window.electronAPI only exists in the desktop app (it comes from preload.js),
// so every desktop-only feature checks for it and falls back to a browser API.

const desktop = window.electronAPI || null;
const config = window.TALLY_CONFIG;

document.documentElement.classList.add(desktop ? 'is-desktop' : 'is-web');

const $ = (id) => document.getElementById(id);
const frame = document.querySelector('.monitor-frame');
const live = $('live');
const playback = $('playback');
const btnSource = $('btn-source');
const btnRecord = $('btn-record');
const btnSave = $('btn-save');
const btnDiscard = $('btn-discard');
const statusEl = $('status');
const timerEl = $('timer');

let stream = null;
let recorder = null;
let chunks = [];
let recording = null; // { blob, url, ext }
let timerId = null;
let startedAt = 0;

// ---------- Recorder ----------

function setState(state) {
  frame.dataset.state = state; // idle | ready | recording | review
  const reviewing = state === 'review';
  btnSource.hidden = reviewing;
  btnRecord.hidden = reviewing;
  btnSave.hidden = !reviewing;
  btnDiscard.hidden = !reviewing;
  live.hidden = reviewing;
  playback.hidden = !reviewing;
  btnRecord.disabled = state === 'idle';
  btnSource.disabled = state === 'recording';
  btnRecord.querySelector('.label').textContent =
    state === 'recording' ? 'Stop recording' : 'Start recording';
  btnSource.textContent = state === 'idle' ? 'Choose screen' : 'Change screen';
}

function say(message) {
  statusEl.textContent = message;
}

function stopStream() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  live.srcObject = null;
}

async function chooseSource() {
  say('');
  try {
    if (desktop) {
      // Desktop: show our own picker, then tell the main process which source to use.
      const id = await pickDesktopSource();
      if (!id) return;
      await desktop.selectSource(id);
    }
    // Browser: this opens the browser's own picker.
    // Desktop: main.js answers this call with the source chosen above.
    const next = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true,
    });
    stopStream();
    stream = next;
    live.srcObject = stream;
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (recorder && recorder.state === 'recording') stopRecording();
      else if (frame.dataset.state !== 'review') {
        stopStream();
        setState('idle');
        say('Screen sharing stopped.');
      }
    });
    setState('ready');
    say('Preview is live. Start recording when you\'re ready.');
  } catch (err) {
    if (err.name === 'NotAllowedError') say('Screen sharing was cancelled.');
    else say(`Couldn't start screen capture: ${err.message}`);
  }
}

function pickMimeType() {
  const options = [
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm'],
    ['video/mp4', 'mp4'], // Safari
  ];
  return options.find(([type]) => MediaRecorder.isTypeSupported(type)) || ['', 'webm'];
}

function startRecording() {
  const [mimeType, ext] = pickMimeType();
  chunks = [];
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => finishRecording(ext);
  recorder.start(1000);

  startedAt = Date.now();
  timerEl.textContent = '00:00';
  timerId = setInterval(() => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    timerEl.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 250);

  setState('recording');
  say('Recording.');
}

function stopRecording() {
  clearInterval(timerId);
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  stopStream();
}

function finishRecording(ext) {
  const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
  recording = { blob, url: URL.createObjectURL(blob), ext };
  playback.src = recording.url;
  setState('review');
  say(`Recorded ${timerEl.textContent}. Save it or discard it.`);
}

async function saveRecording() {
  const name = `tally-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${recording.ext}`;

  if (desktop) {
    // Desktop: native "Save as" dialog, file written by the main process.
    const buffer = await recording.blob.arrayBuffer();
    const result = await desktop.saveRecording(buffer, name);
    if (result.saved) say(`Saved to ${result.path}`);
    return;
  }

  // Browser: download the file.
  const a = document.createElement('a');
  a.href = recording.url;
  a.download = name;
  a.click();
  say(`Downloaded ${name}.`);
}

function discardRecording() {
  if (recording) URL.revokeObjectURL(recording.url);
  recording = null;
  playback.removeAttribute('src');
  setState('idle');
  say('');
}

// ---------- Desktop source picker ----------

async function pickDesktopSource() {
  const dialog = $('picker');
  const grid = $('picker-grid');
  const sources = await desktop.getSources();
  grid.replaceChildren(
    ...sources.map((src) => {
      const btn = document.createElement('button');
      btn.className = 'source';
      btn.value = src.id;
      const img = document.createElement('img');
      img.src = src.thumbnail;
      img.alt = '';
      const label = document.createElement('span');
      label.textContent = src.name;
      btn.append(img, label);
      return btn;
    })
  );
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener(
      'close',
      () => resolve(dialog.returnValue && dialog.returnValue !== 'cancel' ? dialog.returnValue : null),
      { once: true }
    );
  });
}

// ---------- Download section (website only) ----------

function detectOS() {
  const platform = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  const touchDevice = navigator.maxTouchPoints > 1; // iPads report themselves as Macs
  if (/android|iphone|ipad/i.test(navigator.userAgent) || (platform.includes('mac') && touchDevice)) return null;
  if (platform.includes('win')) return 'windows';
  if (platform.includes('mac')) return 'mac';
  if (platform.includes('linux')) return 'linux';
  return null;
}

async function setUpDownloads() {
  const repoUrl = `https://github.com/${config.repo}`;
  $('source-link').href = repoUrl;
  $('all-releases').href = `${repoUrl}/releases`;

  document.querySelectorAll('[data-asset]').forEach((link) => {
    link.href = `${repoUrl}/releases/latest/download/${config.assets[link.dataset.asset]}`;
  });

  // Put the visitor's own OS first.
  const os = detectOS();
  const mine = os && document.querySelector(`.platform[data-os="${os}"]`);
  if (mine) {
    mine.classList.add('is-yours');
    mine.querySelector('.platform-info p').insertAdjacentHTML(
      'beforebegin',
      '<p class="yours">Recommended for this computer</p>'
    );
    $('platforms').prepend(mine);
  }

  const versionEl = $('version');
  if (config.repo.startsWith('YOUR-')) {
    versionEl.textContent = 'Set your GitHub repo in config.js to turn on the download links.';
    return;
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${config.repo}/releases/latest`);
    if (res.status === 404) {
      versionEl.textContent = 'No release has been published yet.';
      return;
    }
    const release = await res.json();
    const date = new Date(release.published_at).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    versionEl.textContent = `Version ${release.tag_name.replace(/^v/, '')}, released ${date}`;
  } catch {
    // Offline or rate-limited: the links still work, we just can't show the version.
  }
}

// ---------- Start ----------

btnSource.addEventListener('click', chooseSource);
btnRecord.addEventListener('click', () =>
  recorder && recorder.state === 'recording' ? stopRecording() : startRecording()
);
btnSave.addEventListener('click', saveRecording);
btnDiscard.addEventListener('click', discardRecording);

setState('idle');

if (!navigator.mediaDevices?.getDisplayMedia) {
  btnSource.disabled = true;
  say('This browser can\'t record the screen. Use Chrome, Edge, Firefox or Safari on a computer, or download the desktop app.');
}

if (!desktop) setUpDownloads();
else $('source-link').addEventListener('click', (e) => {
  e.preventDefault();
  desktop.openExternal(`https://github.com/${config.repo}`);
});
