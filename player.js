// Variabili globali del player
let player = null;
let currentItem = null;
let currentSeasons = [];
let nativeVideoElement = null; // Per iOS

// Rilevamento iOS/Safari
function isIOSDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    (/Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua))
  );
}

function shouldUseNativePlayer() {
  return isIOSDevice();
}

async function openPlayer(item) {
  currentItem = item;

  document.getElementById("home").style.display = "none";
  document.getElementById("results").style.display = "none";
  document.getElementById("player").style.display = "block";

  if (player) {
    player.dispose();
    player = null;
    const oldVideo = document.getElementById("player-video");
    if (oldVideo) {
      oldVideo.remove();
    }
  }

  // Rimuovi player iOS se esiste
  if (nativeVideoElement) {
    nativeVideoElement.remove();
    nativeVideoElement = null;
  }
  
  const videoContainer = document.querySelector(".video-container");
  const newVideo = document.createElement("video");
  newVideo.id = "player-video";
  
  if (shouldUseNativePlayer()) {
    // Per iOS - attributi speciali
    newVideo.className = "native-video-ios";
    newVideo.setAttribute("controls", "");
    newVideo.setAttribute("preload", "auto");
    newVideo.setAttribute("playsinline", "");
    newVideo.setAttribute("webkit-playsinline", "");
    newVideo.setAttribute("crossorigin", "anonymous");
    newVideo.setAttribute("x-webkit-airplay", "allow");
  } else {
    // Per altri browser - Video.js
    newVideo.className = "video-js vjs-theme-vixflix vjs-big-play-centered";
    newVideo.setAttribute("controls", "");
    newVideo.setAttribute("preload", "auto");
    newVideo.setAttribute("playsinline", "");
    newVideo.setAttribute("crossorigin", "anonymous");
  }
  
  const loadingOverlay = document.getElementById("loading-overlay");
  videoContainer.insertBefore(newVideo, loadingOverlay);

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
    await loadVideo(true, item.id);
  }

  window.scrollTo(0, 0);
}

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

  selector.onchange = () => loadEpisodes(tvId, parseInt(selector.value));

  document.getElementById("episode-selector").style.display = "block";

  if (currentSeasons.length > 0) {
    await loadEpisodes(tvId, currentSeasons[0].season_number);
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
      document
        .querySelectorAll(".episode-item")
        .forEach((e) => e.classList.remove("active"));
      div.classList.add("active");
      document.getElementById("episode-warning").style.display = "none";
      loadVideo(false, tvId, seasonNum, ep.episode_number);
    };
    container.appendChild(div);
  });
}

async function loadVideo(isMovie, id, season = null, episode = null) {
  showLoading(true);

  try {
    if (shouldUseNativePlayer()) {
      // Usa player nativo per iOS
      await loadVideoNativeIOS(isMovie, id, season, episode);
    } else {
      // Usa Video.js per altri browser
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
    }
  } catch (err) {
    console.error("Errore nel caricamento del video:", err);
    showError("Impossibile caricare il video. Riprova più tardi.");
  }
}

// NUOVA FUNZIONE PER iOS
async function loadVideoNativeIOS(isMovie, id, season = null, episode = null) {
  console.log("📱 iOS - Caricamento video nativo");
  
  try {
    // Prima prova con il metodo normale
    showLoading(true, "Recupero stream per iOS...");
    const streamData = await getDirectStream(id, isMovie, season, episode);
    
    if (!streamData || !streamData.m3u8Url) {
      throw new Error("Nessun stream disponibile");
    }
    
    let m3u8Url = streamData.m3u8Url;
    
    // IMPORTANTE: iOS richiede HTTPS
    if (m3u8Url.startsWith('http://')) {
      m3u8Url = m3u8Url.replace('http://', 'https://');
    }
    
    // Prepara l'elemento video
    const videoContainer = document.querySelector(".video-container");
    let videoElement = document.getElementById("player-video");
    
    if (!videoElement) {
      videoElement = document.createElement("video");
      videoElement.id = "player-video";
      videoElement.className = "native-video-ios";
      
      // Attributi critici per iOS
      videoElement.setAttribute('controls', '');
      videoElement.setAttribute('playsinline', '');
      videoElement.setAttribute('webkit-playsinline', '');
      videoElement.setAttribute('preload', 'auto');
      videoElement.setAttribute('crossorigin', 'anonymous');
      videoElement.setAttribute('x-webkit-airplay', 'allow');
      
      const loadingOverlay = document.getElementById("loading-overlay");
      videoContainer.insertBefore(videoElement, loadingOverlay);
    }
    
    // Salva riferimento
    nativeVideoElement = videoElement;
    
    // Configura event listeners per iOS
    videoElement.addEventListener('loadedmetadata', () => {
      console.log("📱 iOS - Metadata caricati");
      showLoading(false);
    });
    
    videoElement.addEventListener('canplay', () => {
      console.log("📱 iOS - Video pronto");
      showLoading(false);
      
      // Tenta autoplay (muted per iOS)
      videoElement.muted = true;
      videoElement.play().catch(e => {
        console.log("📱 iOS - Autoplay bloccato, aspetta interazione utente");
        showIOSPlayHint();
      });
    });
    
    videoElement.addEventListener('play', () => {
      console.log("▶️ iOS - Riproduzione avviata");
      hideIOSPlayHint();
      
      // Riattiva l'audio dopo l'avvio
      setTimeout(() => {
        videoElement.muted = false;
      }, 1000);
    });
    
    videoElement.addEventListener('error', (e) => {
      console.error("📱 iOS - Errore video:", videoElement.error);
      showLoading(false);
      
      // Prova fallback per iOS
      if (!streamData.source || !streamData.source.includes('fallback')) {
        console.log("🔄 iOS - Tentativo fallback...");
        tryIOSFallback(isMovie, id, season, episode, videoElement);
      } else {
        showError(
          "Errore iOS",
          `Codice: ${videoElement.error?.code || 'N/A'}<br>
           Messaggio: ${videoElement.error?.message || 'Errore sconosciuto'}`
        );
      }
    });
    
    videoElement.addEventListener('waiting', () => {
      showLoading(true, "Buffering...");
    });
    
    videoElement.addEventListener('playing', () => {
      showLoading(false);
    });
    
    // Imposta la sorgente
    console.log("🔗 iOS - Imposto sorgente:", m3u8Url);
    videoElement.src = m3u8Url;
    
    // Aggiungi anche come elemento source
    const sourceElement = document.createElement('source');
    sourceElement.src = m3u8Url;
    sourceElement.type = 'application/vnd.apple.mpegurl';
    videoElement.appendChild(sourceElement);
    
    // Forza il caricamento
    videoElement.load();
    
    // Tracciamento progresso
    trackVideoProgress(
      id,
      isMovie ? "movie" : "tv",
      videoElement,
      season,
      episode
    );
    
  } catch (error) {
    console.error("📱 iOS - Errore loadVideoNativeIOS:", error);
    
    // Fallback per iOS
    try {
      await tryIOSFallback(isMovie, id, season, episode);
    } catch (fallbackError) {
      console.error("❌ iOS - Fallback fallito:", fallbackError);
      showError("Errore iOS", "Impossibile caricare il video su questo dispositivo");
    }
    
    showLoading(false);
  }
}

// FUNZIONE DI FALLBACK PER iOS
async function tryIOSFallback(isMovie, id, season = null, episode = null, existingVideoElement = null) {
  console.log("🔄 iOS - Attivazione fallback");
  
  showLoading(true, "Fallback iOS in corso...");
  
  try {
    // Primo tentativo: API proxy per iOS
    const type = isMovie ? 'movie' : 'tv';
    let apiUrl = `https://vixsrc-proxy.vercel.app/api/stream?tmdb=${id}&type=${type}`;
    
    if (!isMovie && season && episode) {
      apiUrl += `&season=${season}&episode=${episode}`;
    }
    
    const response = await fetch(apiUrl);
    if (response.ok) {
      const data = await response.json();
      if (data.url && data.url.includes('.m3u8')) {
        console.log("✅ iOS - Fallback API riuscito:", data.url);
        
        let videoElement = existingVideoElement || document.getElementById("player-video");
        if (videoElement) {
          // Assicura HTTPS
          let fallbackUrl = data.url;
          if (fallbackUrl.startsWith('http://')) {
            fallbackUrl = fallbackUrl.replace('http://', 'https://');
          }
          
          videoElement.src = fallbackUrl;
          videoElement.load();
          return true;
        }
      }
    }
    
    // Secondo tentativo: stream di test HLS
    console.log("⚠️ iOS - Usando stream di test");
    const testStreams = [
      "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
      "https://content.jwplatform.com/manifests/vM7nH0Kl.m3u8",
      "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
    ];
    
    const testStream = testStreams[Math.floor(Math.random() * testStreams.length)];
    
    let videoElement = existingVideoElement || document.getElementById("player-video");
    if (videoElement) {
      videoElement.src = testStream;
      videoElement.load();
      
      setTimeout(() => {
        showLoading(false);
        showIOSPlayHint("Stream di test - Tocca per avviare");
      }, 1000);
      
      return true;
    }
    
    throw new Error("Nessun elemento video trovato per il fallback");
    
  } catch (error) {
    console.error("❌ iOS - Fallback fallito:", error);
    throw error;
  }
}

// HELPER FUNCTIONS PER iOS
function showIOSPlayHint(message = "Tocca il video per avviare la riproduzione") {
  hideIOSPlayHint();
  
  const hint = document.createElement('div');
  hint.id = 'ios-play-hint';
  hint.innerHTML = `
    <div style="
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.9);
      color: white;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      z-index: 9999;
      max-width: 80%;
      border: 2px solid #e50914;
    ">
      <div style="font-size: 36px; margin-bottom: 10px;">▶️</div>
      <h3 style="margin: 0 0 10px 0; color: #e50914;">Riproduzione su iOS</h3>
      <p style="margin: 0; font-size: 14px; opacity: 0.9;">${message}</p>
    </div>
  `;
  
  const videoContainer = document.querySelector(".video-container");
  if (videoContainer) {
    videoContainer.appendChild(hint);
  }
}

function hideIOSPlayHint() {
  const hint = document.getElementById('ios-play-hint');
  if (hint) hint.remove();
}

async function getDirectStream(tmdbId, isMovie, season = null, episode = null) {
  try {
    showLoading(true, "Connessione al server...");

    let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${tmdbId}`;
    if (!isMovie && season !== null && episode !== null) {
      vixsrcUrl += `/${season}/${episode}`;
    }

    showLoading(true, "Recupero pagina vixsrc...");
    
    // Per iOS, usa sempre proxy
    const urlToFetch = shouldUseNativePlayer() ? applyCorsProxy(vixsrcUrl) : applyCorsProxy(vixsrcUrl);
    const response = await fetch(urlToFetch);
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
      source: 'direct_extraction'
    };
  } catch (error) {
    showLoading(false);
    console.error("Errore durante l'estrazione dello stream:", error);
    
    // Per iOS, ritorna null per attivare il fallback
    if (shouldUseNativePlayer()) {
      return null;
    }
    
    showError("Errore durante l'estrazione dello stream", error.message);
    return null;
  }
}

function goBack() {
  // console.log("🔙 Tornando indietro dal player...");
  
  if (player) {
    player.dispose();
    player = null;
  }
  
  // Pulisci player iOS
  if (nativeVideoElement) {
    nativeVideoElement.pause();
    nativeVideoElement.src = "";
    nativeVideoElement.remove();
    nativeVideoElement = null;
  }
  
  hideIOSPlayHint();
  
  const videoElement = document.getElementById("player-video");
  if (videoElement) {
    videoElement.remove();
  }

  currentItem = null;
  currentSeasons = [];

  document.getElementById("player").style.display = "none";
  document.getElementById("home").style.display = "block";
  
  removeVideoJsXhrHook();
  // console.log("🔄 Aggiorno 'Continua visione' dopo aver guardato...");

  setTimeout(async () => {
    await loadContinuaDaStorage();
    const carousel = document.getElementById("continua-carousel");
    if (carousel && carousel.children.length === 0) {
      document.getElementById("continua-visione").style.display = "none";
    }
  }, 300);
  window.scrollTo(0, 0);
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
  videoContainer.appendChild(feedback);

  setTimeout(() => feedback.remove(), 800);
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
    videoContainer.appendChild(volumeDisplay);
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

function showLoading(show, message = "Caricamento stream...") {
  const overlay = document.getElementById("loading-overlay");
  overlay.style.display = show ? "flex" : "none";
  overlay.querySelector(".loading-text").textContent = message;
}

function setupKeyboardShortcuts() {
  document.removeEventListener("keydown", handleKeyboardShortcuts);
  document.addEventListener("keydown", handleKeyboardShortcuts);
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

// Aggiungi CSS per iOS
if (shouldUseNativePlayer()) {
  document.addEventListener('DOMContentLoaded', function() {
    const style = document.createElement('style');
    style.textContent = `
      /* Stili per player nativo iOS */
      .native-video-ios {
        width: 100% !important;
        height: auto !important;
        max-height: 70vh !important;
        background: #000 !important;
        border-radius: 12px !important;
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
      }
      
      /* Assicura che i controlli siano visibili su iOS */
      .native-video-ios::-webkit-media-controls {
        display: flex !important;
      }
      
      /* Container video responsive per iOS */
      .video-container {
        position: relative;
        min-height: 250px;
      }
      
      @media (max-width: 768px) {
        .native-video-ios {
          max-height: 60vh !important;
        }
      }
    `;
    document.head.appendChild(style);
  });
}
