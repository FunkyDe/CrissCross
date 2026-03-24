const audio = document.getElementById("audio");
const seekLabel = document.getElementById("seek-label");
const seekBar = document.getElementById("seek");
const btnPlay = document.getElementById("btn-play");
const btnNext = document.getElementById("btn-next");
const volumeSlider = document.getElementById("volume");
const volumeLabel = document.getElementById("volume-label");
const btnMute = document.getElementById("btn-mute");
const muteIcon = document.getElementById("mute-icon");
const muteIconMuted = document.getElementById("mute-icon-muted");
const trackName = document.getElementById("track-name");
const trackMeta = document.getElementById("track-meta");
const message = document.getElementById("message");
const statusBadge = document.getElementById("server-status");

let serverAlive = false;
let trackLoaded = false;
let seekHeld = false;

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

function setSeekLabel(seekTime) {
  const currentTime = Math.round(seekTime);
  const audioDuration = Math.round(audio.duration);

  // bail to prevent NaNs
  if (Number.isNaN(audioDuration)) return;

  const fmt = new Intl.DurationFormat("en", {
    style: "digital",
    hoursDisplay: "auto",
  });

  // Lambda hack to trim leading minutes (03:12 => 3:12)
  // Intl.DurationFormat does not allow disable minute padding
  const trimLeadingMinutes = (durationText) => {
    return durationText[0] == "0" ? durationText.slice(1) : durationText;
  };
  seekLabel.textContent =
    trimLeadingMinutes(
      fmt.format({
        hours: Math.floor(currentTime / 3600),
        minutes: Math.floor((currentTime % 3600) / 60),
        seconds: currentTime % 60,
      }),
    ) +
    " / " +
    trimLeadingMinutes(
      fmt.format({
        hours: Math.floor(audioDuration / 3600),
        minutes: Math.floor((audioDuration % 3600) / 60),
        seconds: audioDuration % 60,
      }),
    );
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

audio.addEventListener("loadedmetadata", () => {
  seekBar.max = audio.duration;
  seekBar.value = 0;
  setSeekLabel(0);
});
seekBar.addEventListener("change", () => {
  audio.currentTime = seekBar.value;
  setSeekLabel(seekBar.value);
});
seekBar.addEventListener("input", () => {
  setSeekLabel(seekBar.value);
});
seekBar.addEventListener("pointerdown", () => {
  seekHeld = true;
});
seekBar.addEventListener("pointerup", () => {
  seekHeld = false;
});
audio.addEventListener("timeupdate", () => {
  if (!seekHeld) {
    seekBar.value = audio.currentTime;
    setSeekLabel(seekBar.value);
  }
});

audio.addEventListener("error", () => {
  setMessage(`Playback error — check that the file format is supported.`);
});

function toggleMute() {
  audio.muted = !audio.muted;
  muteIcon.classList.toggle("hidden");
  muteIconMuted.classList.toggle("hidden");
  apiFetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ muted: audio.muted }),
  }).catch(() => {});
}

btnMute.addEventListener("click", toggleMute);

volumeSlider.addEventListener("input", () => {
  const vol = parseFloat(volumeSlider.value);
  audio.volume = vol;
  volumeLabel.textContent = `${Math.round(vol * 100)}%`;
});

volumeSlider.addEventListener("change", () => {
  apiFetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ volume: parseFloat(volumeSlider.value) }),
  }).catch(() => {});
});

function setMessage(text) {
  message.textContent = text;
}

async function initPlayer() {
  try {
    const settings = await apiFetch("/api/settings");
    const vol = settings.volume ?? 1;
    audio.volume = vol;
    volumeSlider.value = vol;
    volumeLabel.textContent = `${Math.round(vol * 100)}%`;
    audio.muted = settings.muted ?? false;
    if (audio.muted) {
      muteIcon.classList.toggle("hidden");
      muteIconMuted.classList.toggle("hidden");
    }
  } catch {
    // default to 100%
    audio.volume = 1;
  }
}

initPlayer();
