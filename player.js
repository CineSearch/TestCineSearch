// Variabili globali del player
let hlsInstance = null;
let currentItem = null;
let currentSeasons = [];

// Rilevamento dispositivo
function isIOSDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /iPad|iPhone|iPod/.test(ua);
}

function isSafariBrowser() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua);
}

function shouldUseNativeHLS() {
  // Safari su iOS o macOS supporta HLS nativamente
  return isIOSDevice() || isSafariBrowser();
}

function shouldUseHlsJs() {
  // Usa hls.js per tutti i browser tranne Safari
  return !shouldUseNativeHLS();
}

async function openPlayer(item) {
  currentItem = item;

  document.getElementById("home").style.display = "none";
  document.getElementById("results").style.display = "none";
  document.getElementById("player").style.display = "block";

  // Pulisci player precedente
  cleanupPlayer();

  // Imposta titolo e info
  const title = item.title || item.name;
  document.getElementById("player-title").textContent = title;
  document.getElementById("player-overview").textContent = item.overview || "...";

  const mediaType = item.media_type || (item.title ? "movie" : "tv");

  if (mediaType === "tv") {
    document.getElementById("episode-warning").style.display = "flex";
    await loadTVSeasons(item.id);
  } else {
    document.getElementById("episode-warning").style.display = "none";
    document.getElementById("episode-selector").style.display = "none";
    await loadVideo(true, item.id);
  }

  window.scrollTo(0, 0);
}

// ==================== PLAYER HLS.JS / NATIVE HLS ====================
async function loadVideo(isMovie, id, season = null, episode = null) {
  console.log("🎬 Caricamento video con HLS");
  showLoading(true, "Ricerca stream...");

  try {
    // Ottieni stream
    const streamData = await getDirectStream(id, isMovie, season, episode);
    
    if (!streamData || !streamData.m3u8Url) {
      throw new Error("Nessun stream disponibile");
    }
    
    const m3u8Url = streamData.m3u8Url;
    console.log("🔗 URL HLS:", m3u8Url.substring(0, 100) + "...");
    
    // Pulisci player precedente
    cleanupPlayer();
    
    // Ottieni elemento video
    let videoElement = document.getElementById("player-video");
    if (!videoElement) {
      videoElement = createVideoElement();
    }
    
    // Configura player in base al browser
    if (shouldUseNativeHLS()) {
      await setupNativeHLS(videoElement, m3u8Url);
    } else {
      await setupHlsJs(videoElement, m3u8Url);
    }
    
    // Tracciamento progresso
    trackVideoProgress(id, isMovie ? "movie" : "tv", videoElement, season, episode);
    
  } catch (error) {
    console.error("❌ Errore caricamento video:", error);
    showError("Errore caricamento video", error.message);
    showLoading(false);
  }
}

// Crea elemento video
function createVideoElement() {
  // Pulisci video esistente
  const oldVideo = document.getElementById("player-video");
  if (oldVideo) oldVideo.remove();
  
  // Crea nuovo elemento video
  const videoContainer = document.querySelector(".video-container");
  const videoElement = document.createElement("video");
  videoElement.id = "player-video";
  videoElement.className = "hls-player";
  videoElement.controls = true;
  videoElement.preload = "auto";
  videoElement.playsInline = true;
  videoElement.crossOrigin = "anonymous";
  
  // Stili
  videoElement.style.cssText = `
    width: 100%;
    height: auto;
    max-height: 70vh;
    background: #000;
    border-radius: 12px;
    display: block;
  `;
  
  // Aggiungi al DOM
  const loadingOverlay = document.getElementById("loading-overlay");
  videoContainer.insertBefore(videoElement, loadingOverlay);
  
  return videoElement;
}

// Configura HLS nativo (Safari/iOS)
async function setupNativeHLS(videoElement, m3u8Url) {
  console.log("🍎 Configurazione HLS nativo");
  
  try {
    // Imposta attributi specifici per iOS/Safari
    videoElement.setAttribute("webkit-playsinline", "");
    videoElement.setAttribute("x-webkit-airplay", "allow");
    
    // Configura sorgente
    videoElement.src = m3u8Url;
    
    // Aggiungi elemento source
    const sourceElement = document.createElement('source');
    sourceElement.src = m3u8Url;
    sourceElement.type = 'application/vnd.apple.mpegurl';
    videoElement.appendChild(sourceElement);
    
    // Event listener
    setupVideoEvents(videoElement);
    
    // Carica video
    videoElement.load();
    
    // Timeout per errori di caricamento
    setTimeout(() => {
      if (videoElement.readyState < 1) {
        console.warn("⚠️ Video non si carica, provo fallback...");
        tryStreamFallback(videoElement, m3u8Url);
      }
    }, 5000);
    
  } catch (error) {
    console.error("❌ Errore HLS nativo:", error);
    throw error;
  }
}

// Configura hls.js (Chrome, Firefox, Edge, etc.)
async function setupHlsJs(videoElement, m3u8Url) {
  console.log("🔧 Configurazione hls.js");
  
  if (!Hls.isSupported()) {
    console.warn("⚠️ hls.js non supportato, provo HLS nativo");
    videoElement.src = m3u8Url;
    videoElement.load();
    return;
  }
  
  try {
    // Crea nuova istanza hls.js
    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.5,
      maxFragLookUpTolerance: 0.2,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      enableSoftwareAES: true,
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: 3,
      manifestLoadingRetryDelay: 500,
      levelLoadingTimeOut: 10000,
      levelLoadingMaxRetry: 3,
      levelLoadingRetryDelay: 500,
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 500,
      startFragPrefetch: true,
      fpsDroppedMonitoringThreshold: 0.2,
      fpsDroppedMonitoringPeriod: 5000,
      capLevelToPlayerSize: true,
      abrEwmaDefaultEstimate: 500000,
      abrEwmaFastLive: 3,
      abrEwmaSlowLive: 9,
      abrEwmaFastVoD: 3,
      abrEwmaSlowVoD: 9,
      abrEwmaDefaultEstimateMax: 500000,
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.7,
      minAutoBitrate: 0
    });
    
    // Carica sorgente
    hlsInstance.loadSource(m3u8Url);
    hlsInstance.attachMedia(videoElement);
    
    // Event listener hls.js
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, function() {
      console.log("✅ Manifest HLS parsato");
      showLoading(false);
      
      // Tenta autoplay
      videoElement.play().catch(e => {
        console.log("⏸️ Autoplay non permesso, tocca per avviare");
      });
    });
    
    hlsInstance.on(Hls.Events.ERROR, function(event, data) {
      console.error("❌ Errore HLS:", data);
      
      if (data.fatal) {
        switch(data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log("🔄 Errore rete, riprovo...");
            hlsInstance.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log("🔄 Errore media, riprovo...");
            hlsInstance.recoverMediaError();
            break;
          default:
            console.error("❌ Errore fatale, ricarico video...");
            hlsInstance.destroy();
            tryStreamFallback(videoElement, m3u8Url);
            break;
        }
      }
    });
    
    // Gestione qualità
    hlsInstance.on(Hls.Events.LEVEL_LOADED, function(event, data) {
      console.log("📊 Livello qualità caricato:", data);
    });
    
    // Event listener video standard
    setupVideoEvents(videoElement);
    
  } catch (error) {
    console.error("❌ Errore hls.js:", error);
    hlsInstance = null;
    throw error;
  }
}

// Configura event listener video
function setupVideoEvents(videoElement) {
  videoElement.onloadedmetadata = () => {
    console.log("✅ Video pronto");
    showLoading(false);
    
    // Tenta autoplay
    videoElement.play().catch(e => {
      console.log("⏸️ Tocca per avviare la riproduzione");
    });
  };
  
  videoElement.onerror = (e) => {
    console.error("❌ Errore video:", videoElement.error);
    showLoading(false);
    
    let errorMsg = "Errore sconosciuto";
    if (videoElement.error) {
      switch(videoElement.error.code) {
        case 1: errorMsg = "Riproduzione annullata"; break;
        case 2: errorMsg = "Errore di rete"; break;
        case 3: errorMsg = "Formato video non supportato"; break;
        case 4: errorMsg = "Formato HLS non compatibile"; break;
      }
    }
    
    showError("Errore riproduzione", errorMsg);
  };
  
  videoElement.onplay = () => {
    console.log("🎬 Riproduzione avviata");
    showLoading(false);
  };
  
  videoElement.onwaiting = () => {
    showLoading(true, "Buffering...");
  };
  
  videoElement.onplaying = () => {
    showLoading(false);
  };
}

// Fallback per stream problematici
async function tryStreamFallback(videoElement, originalUrl) {
  console.log("🔄 Attivazione fallback");
  
  try {
    // 1. Prova a forzare HTTPS
    if (originalUrl.startsWith('http://')) {
      const httpsUrl = originalUrl.replace('http://', 'https://');
      console.log("🔒 Provo HTTPS:", httpsUrl);
      videoElement.src = httpsUrl;
      videoElement.load();
      return;
    }
    
    // 2. Prova stream di test
    console.log("📺 Provo stream di test");
    const testStreams = [
      "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", // MPEG-TS H.264
      "https://content.jwplatform.com/manifests/vM7nH0Kl.m3u8", // H.264 AAC
      "https://bitdash-a.akamaihd.net/s/content/media/Manifest.m3u8" // Akamai test
    ];
    
    videoElement.src = testStreams[0];
    videoElement.load();
    
  } catch (fallbackError) {
    console.error("❌ Fallback fallito:", fallbackError);
  }
}

// Pulisci player
function cleanupPlayer() {
  // Distruggi hls.js se esiste
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  
  // Pulisci elemento video
  const videoElement = document.getElementById("player-video");
  if (videoElement) {
    videoElement.pause();
    videoElement.src = "";
    videoElement.load();
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
    loadEpisodes(tvId, seasonNum);
  };

  document.getElementById("episode-selector").style.display = "block";

  if (currentSeasons.length > 0) {
    const firstSeason = currentSeasons[0].season_number;
    await loadEpisodes(tvId, firstSeason);
  }
}

async function loadEpisodes(tvId, seasonNum) {
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
      loadVideo(false, tvId, seasonNum, ep.episode_number);
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

    showLoading(false);
    return {
      iframeUrl: vixsrcUrl,
      m3u8Url: m3u8Url,
    };
  } catch (error) {
    showLoading(false);
    console.error("❌ Errore getDirectStream:", error);
    throw error;
  }
}

function goBack() {
  // Pulisci player
  cleanupPlayer();
  
  currentItem = null;
  currentSeasons = [];

  document.getElementById("player").style.display = "none";
  document.getElementById("home").style.display = "block";

  setTimeout(async () => {
    await loadContinuaDaStorage();
    const carousel = document.getElementById("continua-carousel");
    if (carousel && carousel.children.length === 0) {
      document.getElementById("continua-visione").style.display = "none";
    }
  }, 300);
  
  window.scrollTo(0, 0);
}

// ==================== FUNZIONI HELPER ====================
function showLoading(show, message = "Caricamento stream...") {
  const overlay = document.getElementById("loading-overlay");
  overlay.style.display = show ? "flex" : "none";
  overlay.querySelector(".loading-text").textContent = message;
}

function showError(message, details = "") {
  showLoading(false);
  const container = document.querySelector(".video-container");
  
  // Rimuovi errori precedenti
  const oldError = container.querySelector('.error-message');
  if (oldError) oldError.remove();
  
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.innerHTML = `
    <h3>⚠️ Errore</h3>
    <p>${message}</p>
    ${details ? `<p style="font-size:0.9em;opacity:0.7;margin-top:0.5em;">${details}</p>` : ""}
  `;
  
  // Stili
  errorDiv.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 20px 30px;
    border-radius: 10px;
    text-align: center;
    z-index: 1000;
    max-width: 80%;
    border: 2px solid #e50914;
  `;
  
  container.appendChild(errorDiv);

  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.remove();
    }
  }, 5000);
}

// Funzione per applicare proxy CORS
function applyCorsProxy(url) {
  // Usa il proxy CORS selezionato dall'utente o default
  const corsSelect = document.getElementById('cors-select');
  if (corsSelect && corsSelect.value) {
    const proxyUrl = corsSelect.value;
    return proxyUrl.replace('{url}', encodeURIComponent(url));
  }
  
  // Default fallback
  return `https://corsproxy.io/?${encodeURIComponent(url)}`;
}

// Funzione per tracciare progresso video
function trackVideoProgress(mediaId, mediaType, videoElement, season = null, episode = null) {
  if (!videoElement) return;
  
  let lastSaveTime = 0;
  const SAVE_INTERVAL = 10000;
  
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
      
      const key = `progress_${mediaType}_${mediaId}`;
      if (mediaType === 'tv') {
        progressData.season = season;
        progressData.episode = episode;
      }
      
      localStorage.setItem(key, JSON.stringify(progressData));
      lastSaveTime = Date.now();
    }
  };
  
  videoElement.addEventListener('timeupdate', () => {
    if (Date.now() - lastSaveTime > SAVE_INTERVAL) {
      saveProgress();
    }
  });
  
  videoElement.addEventListener('pause', saveProgress);
  videoElement.addEventListener('ended', () => {
    const key = `progress_${mediaType}_${mediaId}`;
    localStorage.removeItem(key);
  });
}
