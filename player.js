// Variabili globali del player
let player = null;
let currentItem = null;
let currentSeasons = [];
let iosVideoElement = null; // Solo per iOS

// Rilevamento dispositivo CORRETTO
function isIOSDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /iPad|iPhone|iPod/.test(ua);
}

function isSafariBrowser() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua);
}

function shouldUseIosNativePlayer() {
  // Solo per dispositivi iOS fisici, non Safari su desktop
  return isIOSDevice();
}

function shouldUseDesktopPlayer() {
  // Tutto tranne iOS
  return !isIOSDevice();
}

async function openPlayer(item) {
  currentItem = item;

  document.getElementById("home").style.display = "none";
  document.getElementById("results").style.display = "none";
  document.getElementById("player").style.display = "block";

  // DIPENDE DAL DISPOSITIVO
  if (shouldUseIosNativePlayer()) {
    // iOS - Player nativo
    await openPlayerIOS(item);
  } else {
    // Desktop/Android - Video.js
    await openPlayerDesktop(item);
  }

  window.scrollTo(0, 0);
}

// ==================== iOS NATIVE PLAYER - CON STESSA LOGICA ====================
// ========================================================
//  iOS PLAYER – VERSIONE FINALE, SENZA PROXY, 100% HLS
// ========================================================

// APERTURA PLAYER
async function openPlayerIOS(item) {

  if (player) { player.dispose(); player = null; }
  if (iosVideoElement) { iosVideoElement.remove(); iosVideoElement = null; }

  const existing = document.getElementById("player-video");
  if (existing) existing.remove();

  const container = document.querySelector(".video-container");
  const video = document.createElement("video");

  video.id = "player-video";
  video.className = "ios-native-player";

  video.setAttribute("controls", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("preload", "auto");
  video.setAttribute("crossorigin", "anonymous");

  video.style.cssText = `
    width: 100%;
    height: auto;
    max-height: 70vh;
    background: #000;
    border-radius: 12px;
    display: block;
    transform: translateZ(0);
  `;

  const loadingOverlay = document.getElementById("loading-overlay");
  container.insertBefore(video, loadingOverlay);

  iosVideoElement = video;

  document.getElementById("player-title").textContent = item.title ?? item.name;
  document.getElementById("player-overview").textContent = item.overview ?? "...";

  const type = item.media_type ?? (item.title ? "movie" : "tv");

  if (type === "tv") {
    document.getElementById("episode-warning").style.display = "flex";
    await loadTVSeasons(item.id);
  } else {
    document.getElementById("episode-warning").style.display = "none";
    await loadVideoIOS(true, item.id);
  }
}



// ========================================================
//  CARICAMENTO VIDEO iOS – VERSIONE FINALE
// ========================================================

async function loadVideoIOS(isMovie, id, season = null, episode = null) {

  showLoading(true, "iOS: recupero HLS...");

  try {
    const stream = await getDirectStreamIOS(id, isMovie, season, episode);

    if (!stream || !stream.m3u8Url)
      throw new Error("Nessun HLS compatibile trovato");

    const finalUrl = stream.m3u8Url;

    const video = document.getElementById("player-video");
    if (!video) throw new Error("player-video non esiste");

    video.pause();
    video.removeAttribute("src");
    video.innerHTML = "";
    video.load();

    configureVideoForIOS(video);

    video.src = finalUrl;
    video.load();

    setupIOSVideoEvents(video);

    setTimeout(() => {
      if (video.readyState === 0)
        tryIOSStreamFallback(video, finalUrl);
    }, 5000);

    const type = isMovie ? "movie" : "tv";
    trackVideoProgress(id, type, video, season, episode);

    showLoading(false);

  } catch (e) {
    showError("Errore iOS", e.message);
    showLoading(false);
  }
}



// ========================================================
//  getDirectStreamIOS – VERSIONE *INFALLIBILE*
// ========================================================

async function getDirectStreamIOS(tmdbId, isMovie, season = null, episode = null) {

  const base = isMovie ? "movie" : "tv";

  let url = `https://${VIXSRC_URL}/${base}/${tmdbId}`;
  if (!isMovie) url += `/${season}/${episode}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Impossibile aprire VixSRC");

  const html = await res.text();

  // 1) Estrazione HLS brute-force (HLS diretto)
  const direct = extractIOSHLS(html);
  if (direct) return { m3u8Url: direct };

  // 2) Controllo se c'è masterPlaylist token
  const converted = extractAndConvertForIOS(html, url);
  if (converted) return { m3u8Url: converted };

  throw new Error("Nessun HLS rilevato");
}



// ========================================================
//  Parser HLS – VERSIONE DEFINITIVA
// ========================================================

function extractIOSHLS(html) {

  const regex = /(https?:\/\/[^"' ]+\.m3u8[^"' ]*)/gi;
  const matches = [...html.matchAll(regex)].map(m => m[1]);

  if (!matches.length) return null;

  // 1. Filtra codec non supportati
  const filtered = matches.filter(u =>
    !u.includes("h265") &&
    !u.includes("hevc") &&
    !u.includes("av1") &&
    !u.includes("vp9")
  );

  if (!filtered.length) return null;

  // 2. Ordina preferendo i CDN più compatibili
  filtered.sort((a, b) => {
    const score = u =>
      (u.includes("cloudflare") ? 3 : 0) +
      (u.includes("akamai") ? 2 : 0) +
      (u.startsWith("https://") ? 2 : 0);

    return score(b) - score(a);
  });

  let best = filtered[0];

  // 3. Ottimizzazione iOS finale
  best = optimizeIOSURL(best);

  return best;
}



// ========================================================
//  Ottimizzazione URL iOS – versione finale
// ========================================================

function optimizeIOSURL(url) {

  let u = url;

  if (u.startsWith("http://")) u = u.replace("http://", "https://");

  const bad = ["h265", "hevc", "av1", "vp9", "dolby", "atmos"];
  for (const p of bad)
    u = u.replace(new RegExp(`[?&]${p}=[^&]*`, "gi"), "");

  if (!u.includes("avc=1"))
    u += (u.includes("?") ? "&" : "?") + "avc=1";

  return u;
}



// ========================================================
//  EVENTI VIDEO iOS – STABILI
// ========================================================

function setupIOSVideoEvents(video) {

  let started = false;

  video.onloadedmetadata = () => {
    showLoading(false);

    if (!started) {
      video.muted = true;
      video.play().then(() => {
        started = true;
        setTimeout(() => (video.muted = false), 1000);
      });
    }
  };

  video.onerror = () => {
    console.error("iOS VIDEO ERROR:", video.error);
    showError("Errore video", "Stream non valido");
  };
}



// ========================================================
//  CONFIGURAZIONE
// ========================================================

function configureVideoForIOS(v) {

  v.autoplay = false;
  v.playsInline = true;
  v.webkitPlaysInline = true;
  v.crossOrigin = "anonymous";
  v.preload = "auto";
  v.controls = true;

  v.style.webkitTransform = "translateZ(0)";
  v.style.transform = "translateZ(0)";
}

// ==================== DESKTOP/ANDROID PLAYER (Video.js) ====================
async function openPlayerDesktop(item) {
  console.log("💻 Desktop - Apertura Video.js");
  
  // Pulisci iOS se esiste
  if (iosVideoElement) {
    iosVideoElement.remove();
    iosVideoElement = null;
  }
  
  if (player) {
    player.dispose();
    player = null;
    const oldVideo = document.getElementById("player-video");
    if (oldVideo) {
      oldVideo.remove();
    }
    
    const videoContainer = document.querySelector(".video-container");
    const newVideo = document.createElement("video");
    newVideo.id = "player-video";
    newVideo.className = "video-js vjs-theme-vixflix vjs-big-play-centered";
    newVideo.setAttribute("controls", "");
    newVideo.setAttribute("preload", "auto");
    newVideo.setAttribute("playsinline", "");
    newVideo.setAttribute("crossorigin", "anonymous");
    
    const loadingOverlay = document.getElementById("loading-overlay");
    videoContainer.insertBefore(newVideo, loadingOverlay);
  }

  const title = item.title || item.name;
  const releaseDate = item.release_date || item.first_air_date || "N/A";
  const mediaType = item.media_type || (item.title ? "movie" : "tv");

  document.getElementById("player-title").textContent = title;
  document.getElementById("player-meta").innerHTML = `...`;
  document.getElementById("player-overview").textContent =
    item.overview || "...";

  if (mediaType === "tv") {
    document.getElementById("episode-warning").style.display = "flex";
    await loadTVSeasons(item.id);
  } else {
    document.getElementById("episode-warning").style.display = "none";
    document.getElementById("episode-selector").style.display = "none";
    await loadVideoDesktop(true, item.id);
  }
}

async function loadVideoDesktop(isMovie, id, season = null, episode = null) {
  showLoading(true);

  try {
    setupVideoJsXhrHook();
    if (player) {
      player.dispose();
      player = null;
    }

    const streamData = await getDirectStream(
      id,
      isMovie,
      season,
      episode
    );

    if (!streamData || !streamData.m3u8Url) {
      throw new Error("Impossibile ottenere l'URL dello stream");
    }

    const proxiedM3u8Url = applyCorsProxy(streamData.m3u8Url);

    let videoElement = document.getElementById("player-video");
    if (!videoElement) {
      const videoContainer = document.querySelector(".video-container");
      videoElement = document.createElement("video");
      videoElement.id = "player-video";
      videoElement.className = "video-js vjs-theme-vixflix vjs-big-play-centered";
      videoElement.setAttribute("controls", "");
      videoElement.setAttribute("preload", "auto");
      videoElement.setAttribute("playsinline", "");
      videoElement.setAttribute("crossorigin", "anonymous");
      
      const loadingOverlay = document.getElementById("loading-overlay");
      videoContainer.insertBefore(videoElement, loadingOverlay);
    }

    player = videojs("player-video", {
      controls: true,
      fluid: true,
      aspectRatio: "16:9",
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
      html5: {
        vhs: {
          overrideNative: true,
          bandwidth: 1000000,
        },
      },
      controlBar: {
        children: [
          "playToggle",
          "volumePanel",
          "currentTimeDisplay",
          "timeDivider",
          "durationDisplay",
          "progressControl",
          "remainingTimeDisplay",
          "playbackRateMenuButton",
          "chaptersButton",
          "descriptionsButton",
          "subsCapsButton",
          "audioTrackButton",
          "qualitySelector",
          "fullscreenToggle",
        ],
      },
    });

    player.src({
      src: proxiedM3u8Url,
      type: "application/x-mpegURL",
    });

    player.hlsQualitySelector();

    player.ready(function () {
      setupKeyboardShortcuts();
      showLoading(false);
      
      trackVideoProgress(
        currentItem.id,
        currentItem.media_type || (currentItem.title ? "movie" : "tv"),
        player.el().querySelector("video"),
        season,
        episode
      );

      player.play().catch((e) => {
        // console.log("Auto-play prevented:", e);
      });
    });

    player.on("error", function () {
      showError("Errore durante il caricamento del video");
    });

    player.on("loadeddata", function () {
      // console.log("✅ Video data loaded");
    });
  } catch (err) {
    showError("Impossibile caricare il video. Riprova più tardi.");
  }
}

// ==================== FUNZIONI COMUNI ====================
async function loadTVSeasons(tvId) {
  const seasons = await fetchTVSeasons(tvId);
  currentSeasons = seasons.filter((s) => s.season_number > 0);

  const selector = document.getElementById("season-select");
  selector.innerHTML = "";

  currentSeasons.forEach((season) => {
    const opt = document.createElement("option");
    opt.value = season.season_number;
    opt.textContent = `Stagione ${season.season_number}`;
    selector.appendChild(opt);
  });

  selector.onchange = () => {
    const seasonNum = parseInt(selector.value);
    if (shouldUseIosNativePlayer()) {
      loadEpisodesIOS(tvId, seasonNum);
    } else {
      loadEpisodesDesktop(tvId, seasonNum);
    }
  };

  document.getElementById("episode-selector").style.display = "block";

  if (currentSeasons.length > 0) {
    const firstSeason = currentSeasons[0].season_number;
    if (shouldUseIosNativePlayer()) {
      await loadEpisodesIOS(tvId, firstSeason);
    } else {
      await loadEpisodesDesktop(tvId, firstSeason);
    }
  }
}

async function loadEpisodesIOS(tvId, seasonNum) {
  const episodes = await fetchEpisodes(tvId, seasonNum);
  const container = document.getElementById("episodes-list");
  container.innerHTML = "";

  episodes.forEach((ep) => {
    const div = document.createElement("div");
    div.className = "episode-item";
    div.innerHTML = `
      <div class="episode-number">Episodio ${ep.episode_number}</div>
      <div class="episode-title">${ep.name || "Senza titolo"}</div>
    `;
    div.onclick = () => {
      document.querySelectorAll(".episode-item").forEach((e) => e.classList.remove("active"));
      div.classList.add("active");
      document.getElementById("episode-warning").style.display = "none";
      loadVideoIOS(false, tvId, seasonNum, ep.episode_number);
    };
    container.appendChild(div);
  });
}

async function loadEpisodesDesktop(tvId, seasonNum) {
  const episodes = await fetchEpisodes(tvId, seasonNum);
  const container = document.getElementById("episodes-list");
  container.innerHTML = "";

  episodes.forEach((ep) => {
    const div = document.createElement("div");
    div.className = "episode-item";
    div.innerHTML = `
      <div class="episode-number">Episodio ${ep.episode_number}</div>
      <div class="episode-title">${ep.name || "Senza titolo"}</div>
    `;
    div.onclick = () => {
      document.querySelectorAll(".episode-item").forEach((e) => e.classList.remove("active"));
      div.classList.add("active");
      document.getElementById("episode-warning").style.display = "none";
      loadVideoDesktop(false, tvId, seasonNum, ep.episode_number);
    };
    container.appendChild(div);
  });
}

async function getDirectStream(tmdbId, isMovie, season = null, episode = null) {
  try {
    showLoading(true, "Connessione al server...");

    let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${tmdbId}`;
    if (!isMovie && season !== null && episode !== null) {
      vixsrcUrl += `/${season}/${episode}`;
    }

    showLoading(true, "Recupero pagina vixsrc...");
    const response = await fetch(applyCorsProxy(vixsrcUrl));
    const html = await response.text();

    showLoading(true, "Estrazione parametri stream...");

    const playlistParamsRegex =
      /window\.masterPlaylist[^:]+params:[^{]+({[^<]+?})/;
    const playlistParamsMatch = html.match(playlistParamsRegex);

    if (!playlistParamsMatch) {
      throw new Error("Impossibile trovare i parametri della playlist");
    }

    let playlistParamsStr = playlistParamsMatch[1]
      .replace(/'/g, '"')
      .replace(/\s+/g, "")
      .replace(/\n/g, "")
      .replace(/\\n/g, "")
      .replace(",}", "}");

    let playlistParams;
    try {
      playlistParams = JSON.parse(playlistParamsStr);
    } catch (e) {
      throw new Error("Errore nel parsing dei parametri: " + e.message);
    }

    const playlistUrlRegex =
      /window\.masterPlaylist\s*=\s*\{[\s\S]*?url:\s*'([^']+)'/;
    const playlistUrlMatch = html.match(playlistUrlRegex);

    if (!playlistUrlMatch) {
      throw new Error("Impossibile trovare l'URL della playlist");
    }

    const playlistUrl = playlistUrlMatch[1];

    const canPlayFHDRegex = /window\.canPlayFHD\s+?=\s+?(\w+)/;
    const canPlayFHDMatch = html.match(canPlayFHDRegex);
    const canPlayFHD = canPlayFHDMatch && canPlayFHDMatch[1] === "true";

    const hasQuery = /\?[^#]+/.test(playlistUrl);
    const separator = hasQuery ? "&" : "?";

    const m3u8Url =
      playlistUrl +
      separator +
      "expires=" +
      playlistParams.expires +
      "&token=" +
      playlistParams.token +
      (canPlayFHD ? "&h=1" : "");

    baseStreamUrl = extractBaseUrl(m3u8Url);

    showLoading(false);
    return {
      iframeUrl: vixsrcUrl,
      m3u8Url: m3u8Url,
    };
  } catch (error) {
    showLoading(false);
    showError("Errore durante l'estrazione dello stream", error.message);
    return null;
  }
}

function goBack() {
  // Pulisci in base al dispositivo
  if (shouldUseIosNativePlayer()) {
    // iOS
    if (iosVideoElement) {
      iosVideoElement.pause();
      iosVideoElement.src = "";
      iosVideoElement.remove();
      iosVideoElement = null;
    }
  } else {
    // Desktop
    if (player) {
      player.dispose();
      player = null;
    }
  }
  
  const videoElement = document.getElementById("player-video");
  if (videoElement) {
    videoElement.remove();
  }

  currentItem = null;
  currentSeasons = [];

  document.getElementById("player").style.display = "none";
  document.getElementById("home").style.display = "block";
  
  removeVideoJsXhrHook();

  setTimeout(async () => {
    await loadContinuaDaStorage();
    const carousel = document.getElementById("continua-carousel");
    if (carousel && carousel.children.length === 0) {
      document.getElementById("continua-visione").style.display = "none";
    }
  }, 300);
  
  window.scrollTo(0, 0);
}

// ==================== CSS PER iOS ====================
if (shouldUseIosNativePlayer()) {
  document.addEventListener('DOMContentLoaded', function() {
    const style = document.createElement('style');
    style.id = 'ios-video-styles';
    style.textContent = `
      /* Player nativo iOS */
      .ios-native-player {
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }
      
      .ios-native-player::-webkit-media-controls {
        display: flex !important;
      }
      
      .ios-native-player::-webkit-media-controls-panel {
        background: linear-gradient(transparent, rgba(0,0,0,0.7));
      }
      
      /* Nascondi Video.js su iOS */
      .video-js {
        display: none !important;
      }
      
      .vjs-theme-vixflix {
        display: none !important;
      }
    `;
    
    // Rimuovi stili vecchi se esistono
    const oldStyle = document.getElementById('ios-video-styles');
    if (oldStyle) oldStyle.remove();
    
    document.head.appendChild(style);
  });
}

// ==================== TUTTE LE ALTRE FUNZIONI RIMANGONO UGUALI ====================
function showLoading(show, message = "Caricamento stream...") {
  const overlay = document.getElementById("loading-overlay");
  overlay.style.display = show ? "flex" : "none";
  overlay.querySelector(".loading-text").textContent = message;
}

function showError(message, details = "") {
  showLoading(false);
  const container = document.querySelector(".video-container");
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.innerHTML = `<h3>⚠️ Errore</h3><p>${message}</p>${details ? `<p style="font-size:0.9em;opacity:0.7;margin-top:0.5em;">${details}</p>` : ""}`;
  container.appendChild(errorDiv);

  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

function handleKeyboardShortcuts(event) {
  if (!player || !player.readyState()) {
    return;
  }

  if (
    event.target.tagName === "INPUT" ||
    event.target.tagName === "TEXTAREA" ||
    event.target.isContentEditable
  ) {
    return;
  }

  const key = event.key.toLowerCase();

  switch (key) {
    case " ":
      event.preventDefault();
      if (player.paused()) {
        player.play();
      } else {
        player.pause();
      }
      break;

    case "arrowright":
      event.preventDefault();
      const newTimeForward = Math.min(
        player.currentTime() + 5,
        player.duration()
      );
      player.currentTime(newTimeForward);
      showSeekFeedback("+5s");
      break;

    case "arrowleft":
      event.preventDefault();
      const newTimeBackward = Math.max(player.currentTime() - 5, 0);
      player.currentTime(newTimeBackward);
      showSeekFeedback("-5s");
      break;

    case "arrowup":
      event.preventDefault();
      const newVolumeUp = Math.min(player.volume() + 0.1, 1);
      player.volume(newVolumeUp);
      showVolumeFeedback(Math.round(newVolumeUp * 100));
      break;

    case "arrowdown":
      event.preventDefault();
      const newVolumeDown = Math.max(player.volume() - 0.1, 0);
      player.volume(newVolumeDown);
      showVolumeFeedback(Math.round(newVolumeDown * 100));
      break;

    case "f":
      event.preventDefault();
      if (player.isFullscreen()) {
        player.exitFullscreen();
      } else {
        player.requestFullscreen();
      }
      break;

    case "m":
      event.preventDefault();
      player.muted(!player.muted());
      break;
  }
}

function showSeekFeedback(text) {
  const feedback = document.createElement("div");
  feedback.className = "keyboard-feedback";
  feedback.textContent = text;
  feedback.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.8);
    color: #e50914;
    padding: 20px 40px;
    border-radius: 10px;
    font-size: 2rem;
    font-weight: bold;
    z-index: 100;
    pointer-events: none;
    animation: feedbackFade 0.8s ease;
  `;

  const videoContainer = document.querySelector(".video-container");
  if (videoContainer) {
    videoContainer.appendChild(feedback);
  }

  setTimeout(() => {
    if (feedback.parentNode) {
      feedback.remove();
    }
  }, 800);
}

function showVolumeFeedback(volumePercent) {
  let volumeDisplay = document.getElementById("volume-feedback");

  if (!volumeDisplay) {
    volumeDisplay = document.createElement("div");
    volumeDisplay.id = "volume-feedback";
    volumeDisplay.style.cssText = `
      position: absolute;
      top: 50%;
      right: 40px;
      transform: translateY(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      padding: 15px 25px;
      border-radius: 8px;
      font-size: 1.5rem;
      font-weight: bold;
      z-index: 100;
      pointer-events: none;
      display: flex;
      align-items: center;
      gap: 10px;
    `;

    const videoContainer = document.querySelector(".video-container");
    if (videoContainer) {
      videoContainer.appendChild(volumeDisplay);
    }
  }

  volumeDisplay.innerHTML = `
    <span>🔊</span>
    <span>${volumePercent}%</span>
  `;

  volumeDisplay.style.opacity = "1";

  if (volumeDisplay.timeoutId) {
    clearTimeout(volumeDisplay.timeoutId);
  }

  volumeDisplay.timeoutId = setTimeout(() => {
    volumeDisplay.style.opacity = "0";
  }, 1000);
}

function setupKeyboardShortcuts() {
  document.removeEventListener("keydown", handleKeyboardShortcuts);
  document.addEventListener("keydown", handleKeyboardShortcuts);
}

// Funzione per impostare hook XHR per Video.js (se non esiste già)
function setupVideoJsXhrHook() {
  if (window.videojs && window.videojs.Hls) {
    const originalXhr = window.videojs.Hls.xhr;
    window.videojs.Hls.xhr = function() {
      const xhr = originalXhr();
      
      // Hook per le richieste
      const originalOpen = xhr.open;
      xhr.open = function(method, url) {
        // Aggiungi header per evitare CORS
        if (url && url.includes('.m3u8')) {
          this.setRequestHeader('Origin', window.location.origin);
          this.setRequestHeader('Referer', 'https://vixsrc.to/');
        }
        return originalOpen.apply(this, arguments);
      };
      
      return xhr;
    };
  }
}

// Funzione per rimuovere hook XHR
function removeVideoJsXhrHook() {
  // Resetta se necessario
  if (window.videojs && window.videojs.Hls && window.videojs.Hls.__originalXhr) {
    window.videojs.Hls.xhr = window.videojs.Hls.__originalXhr;
  }
}

// Funzione per applicare proxy CORS
function applyCorsProxy(url) {
  // Usa il tuo proxy CORS preferito
  return `https://corsproxy.io/?${encodeURIComponent(url)}`;
}

// Funzione per estrarre URL base (se usata da getDirectStream)
function extractBaseUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch (e) {
    return url.split('?')[0];
  }
}

// Funzione per tracciare progresso video (se non esiste)
function trackVideoProgress(mediaId, mediaType, videoElement, season = null, episode = null) {
  if (!videoElement) return;
  
  let lastSaveTime = 0;
  const SAVE_INTERVAL = 10000; // 10 secondi
  
  const saveProgress = () => {
    const currentTime = videoElement.currentTime;
    const duration = videoElement.duration;
    
    if (duration > 0 && currentTime > 0) {
      const progress = (currentTime / duration) * 100;
      const progressData = {
        mediaId,
        mediaType,
        currentTime,
        duration,
        progress: Math.round(progress),
        timestamp: Date.now(),
        season,
        episode
      };
      
      // Salva in localStorage
      const key = `progress_${mediaType}_${mediaId}`;
      if (mediaType === 'tv') {
        progressData.season = season;
        progressData.episode = episode;
      }
      
      localStorage.setItem(key, JSON.stringify(progressData));
      lastSaveTime = Date.now();
    }
  };
  
  // Salva periodicamente
  videoElement.addEventListener('timeupdate', () => {
    if (Date.now() - lastSaveTime > SAVE_INTERVAL) {
      saveProgress();
    }
  });
  
  // Salva quando si lascia la pagina
  videoElement.addEventListener('pause', saveProgress);
  videoElement.addEventListener('ended', () => {
    // Rimuovi progresso quando il video finisce
    const key = `progress_${mediaType}_${mediaId}`;
    localStorage.removeItem(key);
  });
}
