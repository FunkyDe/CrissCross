const audio = document.getElementById("audio");
const btnPlay = document.getElementById("btn-play");
const btnNext = document.getElementById("btn-next");
const volumeSlider = document.getElementById("volume");
const volumeLabel = document.getElementById("volume-label");
const trackName = document.getElementById("track-name");
const trackMeta = document.getElementById("track-meta");
const message = document.getElementById("message");
const statusBadge = document.getElementById("server-status");

let serverAlive = false;
let trackLoaded = false;

async function apiFetch(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

async function checkHealth() {
  try {
    await apiFetch("/health");
    if (!serverAlive) {
      serverAlive = true;
      statusBadge.textContent = "● Connected";
      statusBadge.classList.remove("disconnected");
      if (!trackLoaded) await loadCurrent();
    }
  } catch {
    serverAlive = false;
    statusBadge.textContent = "● Disconnected";
    statusBadge.classList.add("disconnected");
    setMessage("Cannot reach server. Is it running?");
    setControlsEnabled(false);
  }
}

setInterval(checkHealth, 5000);
checkHealth();

async function loadCurrent() {
  try {
    const track = await apiFetch("/api/current");
    setTrack(track);
  } catch (e) {
    setMessage(`Could not load track: ${e.message}`);
  }
}

async function loadNext() {
  try {
    const track = await apiFetch("/api/next", { method: "POST" });
    setTrack(track);
    audio.play();
  } catch (e) {
    setMessage(`Could not advance queue: ${e.message}`);
  }
}

function setTrack(track) {
  audio.src = `/api/tracks/${encodeURIComponent(track.filename)}`;
  trackName.textContent = track.filename;
  trackMeta.textContent = `Track ${track.index + 1} of ${track.total}`;
  trackLoaded = true;
  setControlsEnabled(true);
  setMessage("Ready");
}

function setControlsEnabled(enabled) {
  btnPlay.disabled = !enabled;
  btnNext.disabled = !enabled;
}

btnPlay.addEventListener("click", () => {
  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
});

btnNext.addEventListener("click", loadNext);

audio.addEventListener("ended", loadNext);

audio.addEventListener("play", () => {
  btnPlay.textContent = "Pause";
});
audio.addEventListener("pause", () => {
  btnPlay.textContent = "Play";
});

audio.addEventListener("error", () => {
  setMessage(`Playback error — check that the file format is supported.`);
});

async function initVolume() {
  try {
    const settings = await apiFetch("/api/settings");
    const vol = settings.volume ?? 1;
    audio.volume = vol;
    volumeSlider.value = vol;
    volumeLabel.textContent = `${Math.round(vol * 100)}%`;
  } catch {
    // default to 100%
    audio.volume = 1;
  }
}

volumeSlider.addEventListener("input", () => {
  const vol = parseFloat(volumeSlider.value);
  audio.volume = vol;
  volumeLabel.textContent = `${Math.round(vol * 100)}%`;
});

let volumeSaveTimer;
volumeSlider.addEventListener("change", () => {
  clearTimeout(volumeSaveTimer);
  volumeSaveTimer = setTimeout(() => {
    apiFetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volume: parseFloat(volumeSlider.value) }),
    }).catch(() => {});
  }, 300);
});

function setMessage(text) {
  message.textContent = text;
}

initVolume();
