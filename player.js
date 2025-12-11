// Variabili globali del player
let player = null;
let currentItem = null;
let currentSeasons = [];
let nativeVideoElement = null; // Per iOS

// Rilevamento iOS
function shouldUseNativePlayer() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /iPad|iPhone|iPod/.test(ua) || 
         (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua));
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

  // Pulisci player iOS se esiste
  if (nativeVideoElement) {
    nativeVideoElement.remove();
    nativeVideoElement = null;
  }
  
  const videoContainer = document.querySelector(".video-container");
  const newVideo = document.createElement("video");
  newVideo.id = "player-video";
  
  // Imposta attributi in base al dispositivo
  if (shouldUseNativePlayer()) {
    // Per iOS - player nativo
    newVideo.className = "native-video-ios";
    newVideo.setAttribute("controls", "");
    newVideo.setAttribute("preload", "auto");
    newVideo.setAttribute("playsinline", "");
    newVideo.setAttribute("webkit-playsinline", "");
    newVideo.setAttribute("crossorigin", "anonymous");
    newVideo.style.cssText = `
      width: 100%;
      height: auto;
      max-height: 70vh;
      background: #000;
      border-radius: 12px;
      display: block;
    `;
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
      // iOS - usa player nativo
      await loadVideoIOS(isMovie, id, season, episode);
    } else {
      // Desktop - usa Video.js
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
    showError("Impossibile caricare il video. Riprova più tardi.");
  }
}

// FUNZIONE PER iOS - AGGIUNTA
async function loadVideoIOS(isMovie, id, season = null, episode = null) {
  try {
    showLoading(true, "iOS: preparazione...");
    
    // Prova prima con getDirectStream
    let streamData = await getDirectStream(id, isMovie, season, episode);
    
    // Se fallisce, prova metodo alternativo per iOS
    if (!streamData || !streamData.m3u8Url) {
      streamData = await getStreamForiOS(id, isMovie, season, episode);
    }
    
    if (!streamData || !streamData.m3u8Url) {
      throw new Error("Nessuno stream disponibile per iOS");
    }
    
    let m3u8Url = streamData.m3u8Url;
    
    // Assicura HTTPS per iOS
    if (m3u8Url.startsWith('http://')) {
      m3u8Url = m3u8Url.replace('http://', 'https://');
    }
    
    // Prepara elemento video iOS
    let videoElement = document.getElementById("player-video");
    if (!videoElement) {
      throw new Error("Elemento video non trovato");
    }
    
    // Configura attributi iOS
    videoElement.setAttribute('controls', '');
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('webkit-playsinline', '');
    videoElement.crossOrigin = "anonymous";
    
    // Salva riferimento
    nativeVideoElement = videoElement;
    
    // Configura event listener
    videoElement.onloadedmetadata = () => {
      console.log("✅ iOS - Video pronto");
      showLoading(false);
      
      // Tenta autoplay (muted per iOS)
      videoElement.muted = true;
      videoElement.play().then(() => {
        console.log("▶️ iOS - Autoplay riuscito");
        setTimeout(() => { videoElement.muted = false; }, 1000);
      }).catch(e => {
        console.log("⏸️ iOS - Tocca il video per avviare");
      });
    };
    
    videoElement.onerror = (e) => {
      console.error("❌ iOS - Errore video:", videoElement.error);
      showLoading(false);
      showError("iOS: Errore video", "Tocca il video per riprovare.");
    };
    
    videoElement.onplay = () => {
      console.log("🎬 iOS - Riproduzione avviata");
      showLoading(false);
    };
    
    // Imposta sorgente
    videoElement.src = m3u8Url;
    
    // Aggiungi elemento source per HLS
    const sourceElement = document.createElement('source');
    sourceElement.src = m3u8Url;
    sourceElement.type = 'application/vnd.apple.mpegurl';
    videoElement.appendChild(sourceElement);
    
    // Forza caricamento
    videoElement.load();
    
    // Tracciamento
    trackVideoProgress(id, isMovie ? "movie" : "tv", videoElement, season, episode);
    
  } catch (error) {
    console.error("💥 iOS - Errore:", error);
    showError("iOS: Impossibile caricare il video", error.message);
    showLoading(false);
  }
}

// FUNZIONE ALTERNATIVA PER iOS - AGGIUNTA
async function getStreamForiOS(tmdbId, isMovie, season = null, episode = null) {
  try {
    showLoading(true, "iOS: metodo alternativo...");
    
    // Usa un servizio alternativo per iOS
    const type = isMovie ? 'movie' : 'tv';
    const apiUrl = `https://vidsrc.xyz/vidsrc/${tmdbId}${!isMovie ? `/${season}/${episode}` : ''}`;
    
    console.log("🔗 iOS - API URL:", apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data && data.result && data.result.sources && data.result.sources.length > 0) {
      // Prendi la prima sorgente HLS
      const hlsSource = data.result.sources.find(s => s.file && s.file.includes('.m3u8'));
      if (hlsSource) {
        let url = hlsSource.file;
        if (url.startsWith('http://')) {
          url = url.replace('http://', 'https://');
        }
        console.log("✅ iOS - Trovato URL alternativo:", url.substring(0, 100));
        
        return {
          m3u8Url: url,
          source: 'ios_alternative'
        };
      }
    }
    
    throw new Error("Nessuna sorgente HLS trovata");
    
  } catch (error) {
    console.error("❌ iOS - Metodo alternativo fallito:", error);
    return null;
  }
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

    // Per iOS, non estrarre baseStreamUrl
    if (!shouldUseNativePlayer()) {
      baseStreamUrl = extractBaseUrl(m3u8Url);
    }

    showLoading(false);
    return {
      iframeUrl: vixsrcUrl,
      m3u8Url: m3u8Url,
    };
  } catch (error) {
    showLoading(false);
    // Su iOS, non mostrare errore qui, lascia che il metodo alternativo gestisca
    if (!shouldUseNativePlayer()) {
      showError("Errore durante l'estrazione dello stream", error.message);
    }
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
    nativeVideoElement = null;
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

// FUNZIONI DI UTILITÀ AGGIUNTE PER iOS
function showIOSMessage(message) {
  const msgDiv = document.createElement('div');
  msgDiv.innerHTML = `
    <div style="
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.9);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      text-align: center;
      z-index: 9999;
      max-width: 90%;
      border: 2px solid #e50914;
      font-size: 14px;
    ">
      ${message}
    </div>
  `;
  
  const videoContainer = document.querySelector(".video-container");
  if (videoContainer) {
    videoContainer.appendChild(msgDiv);
    setTimeout(() => msgDiv.remove(), 3000);
  }
}

// Aggiungi CSS per iOS
if (shouldUseNativePlayer()) {
  document.addEventListener('DOMContentLoaded', function() {
    const style = document.createElement('style');
    style.textContent = `
      /* Stili per player nativo iOS */
      .native-video-ios {
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }
      
      /* Assicura che i controlli siano visibili su iOS */
      .native-video-ios::-webkit-media-controls {
        opacity: 1 !important;
        visibility: visible !important;
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

// TUTTE LE ALTRE FUNZIONI RIMANGONO UGUALI
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
