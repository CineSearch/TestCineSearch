// Variabili globali del player
let player = null;
let currentItem = null;
let currentSeasons = [];
let nativeVideoElement = null;

// Funzione per aprire il player
async function openPlayer(item) {
  currentItem = item;

  document.getElementById("home").style.display = "none";
  document.getElementById("results").style.display = "none";
  document.getElementById("player").style.display = "block";

  // Reset completo del player
  if (player) {
    player.dispose();
    player = null;
  }
  
  // Rimuovi l'elemento video esistente
  const oldVideo = document.getElementById("player-video");
  if (oldVideo) {
    oldVideo.remove();
  }
  
  // Crea un nuovo elemento video
  const videoContainer = document.querySelector(".video-container");
  const newVideo = document.createElement("video");
  newVideo.id = "player-video";
  
  // Imposta attributi in base al dispositivo
  if (shouldUseNativePlayer()) {
    // Per iOS/Safari - player nativo
    newVideo.setAttribute("controls", "");
    newVideo.setAttribute("preload", "auto");
    newVideo.setAttribute("playsinline", "");
    newVideo.setAttribute("webkit-playsinline", "");
    newVideo.style.cssText = `
      width: 100%;
      height: auto;
      aspect-ratio: 16/9;
      background: #000;
      border-radius: 12px;
    `;
  } else {
    // Per altri browser - Video.js
    newVideo.className = "video-js vjs-theme-vixflix vjs-big-play-centered";
    newVideo.setAttribute("controls", "");
    newVideo.setAttribute("preload", "auto");
    newVideo.setAttribute("playsinline", "");
    newVideo.setAttribute("crossorigin", "anonymous");
  }
  
  // Posiziona il nuovo video
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

// Carica stagioni TV (rimane uguale)
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

// Carica episodi (rimane uguale)
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

// Funzione principale per caricare il video
async function loadVideo(isMovie, id, season = null, episode = null) {
  showLoading(true);

  try {
    if (shouldUseNativePlayer()) {
      // Usa player nativo per iOS/Safari
      await loadVideoNative(isMovie, id, season, episode);
    } else {
      // Usa Video.js per altri browser
      await loadVideoWithVideoJS(isMovie, id, season, episode);
    }
  } catch (err) {
    console.error("Errore nel caricamento del video:", err);
    showError("Impossibile caricare il video. Riprova più tardi.");
  }
}

// Player nativo per iOS/Safari
async function loadVideoNative(isMovie, id, season = null, episode = null) {
  try {
    console.log("📱 iOS - Inizio loadVideoNative");
    
    // Ottieni i dati dello stream
    const streamData = await getStreamData(isMovie, id, season, episode, false); // No proxy per iOS
    
    if (!streamData || !streamData.m3u8Url) {
      throw new Error("Stream non disponibile");
    }

    let m3u8Url = streamData.m3u8Url;
    
    // DEBUG
    console.log("📱 iOS - URL ottenuto:", m3u8Url);

    // 1️⃣ Assicurati HTTPS per iOS
    if (m3u8Url.startsWith("http://")) {
      m3u8Url = m3u8Url.replace("http://", "https://");
      console.log("📱 iOS - Convertito a HTTPS");
    }

    // 2️⃣ Crea/ottieni elemento video
    let videoElement = document.getElementById("player-video");
    if (!videoElement) {
      const videoContainer = document.querySelector(".video-container");
      videoElement = document.createElement("video");
      videoElement.id = "player-video";
      videoElement.style.cssText = `
        width: 100%;
        height: auto;
        aspect-ratio: 16/9;
        background: #000;
        border-radius: 12px;
      `;
      videoContainer.insertBefore(videoElement, document.getElementById("loading-overlay"));
    }

    // 3️⃣ Configura l'elemento video
    videoElement.controls = true;
    videoElement.playsInline = true;
    videoElement.webkitPlaysInline = true;
    videoElement.preload = "auto";
    
    // Per iOS, spesso serve autoplay mutato
    videoElement.muted = true;
    
    // 4️⃣ Pulisci sorgenti precedenti e imposta nuovo
    videoElement.innerHTML = "";
    
    const source = document.createElement("source");
    source.src = m3u8Url;
    source.type = "application/x-mpegURL";
    
    videoElement.appendChild(source);

    // 5️⃣ Gestisci eventi
    videoElement.addEventListener("loadedmetadata", () => {
      console.log("📱 iOS - Metadata caricati");
      showLoading(false);
      
      // Prova autoplay (muted per iOS)
      videoElement.play().catch(err => {
        console.log("📱 iOS - Autoplay bloccato, aspetta interazione utente");
      });
    });

    videoElement.addEventListener("canplay", () => {
      console.log("📱 iOS - Video può iniziare la riproduzione");
      showLoading(false);
    });

    videoElement.addEventListener("error", (e) => {
      console.error("📱 iOS - Errore video:", e);
      console.error("📱 iOS - Error code:", videoElement.error?.code);
      console.error("📱 iOS - Error message:", videoElement.error?.message);
      
      showError("Errore video iOS", 
        videoElement.error?.message || 
        "Impossibile riprodurre il video sul tuo dispositivo"
      );
    });

    videoElement.addEventListener("stalled", () => {
      console.log("📱 iOS - Video stalled, riprovo...");
      videoElement.load();
    });

    // 6️⃣ Avvia il caricamento
    videoElement.load();
    
    // 7️⃣ Tracciamento progresso
    trackVideoProgress(
      id,
      isMovie ? "movie" : "tv",
      videoElement,
      season,
      episode
    );

  } catch (err) {
    console.error("📱 iOS - Errore loadVideoNative:", err);
    showError("Errore iOS", err.message || "Impossibile avviare la riproduzione");
  }
}


// Video.js per altri browser
async function loadVideoWithVideoJS(isMovie, id, season = null, episode = null) {
  try {
    // Assicurati che l'hook XHR sia installato
    setupVideoJsXhrHook();

    const streamData = await getDirectStream(isMovie, id, season, episode);

    if (!streamData || !streamData.m3u8Url) {
      throw new Error("Impossibile ottenere l'URL dello stream");
    }

    const proxiedM3u8Url = applyCorsProxy(streamData.m3u8Url);

    // Inizializza Video.js
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
        // // console.log("Auto-play prevented:", e);
      });
    });

    player.on("error", function () {
      showError("Errore durante il caricamento del video");
    });

    player.on("loadeddata", function () {
      // // console.log("✅ Video data loaded");
    });

  } catch (err) {
    console.error("Errore loadVideoWithVideoJS:", err);
    throw err;
  }
}

// Funzioni per ottenere lo stream
async function getDirectStream(isMovie, id, season = null, episode = null) {
  return getStreamData(isMovie, id, season, episode, true);
}

async function getDirectStreamForiOS(isMovie, id, season = null, episode = null) {
  return getStreamData(isMovie, id, season, episode, false);
}

async function getStreamData(isMovie, id, season = null, episode = null, useProxy = true) {
  try {
    showLoading(true, "Connessione al server...");

    // Crea l'URL vixsrc
    let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${id}`;
    if (!isMovie && season !== null && episode !== null) {
      vixsrcUrl += `/${season}/${episode}`;
    }

    // DEBUG: Log per iOS
    console.log("📱 iOS - Tentativo con URL:", vixsrcUrl);

    // Per iOS usiamo fetch diretta senza CORS proxy (se possibile)
    let html;
    if (shouldUseNativePlayer()) {
      try {
        // Primo tentativo: fetch diretta
        const directResponse = await fetch(vixsrcUrl, {
          headers: {
            'Accept': 'text/html',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
          }
        });
        
        if (directResponse.ok) {
          html = await directResponse.text();
        } else {
          // Fallback: usa proxy
          const proxyUrl = applyCorsProxy(vixsrcUrl);
          const proxyResponse = await fetch(proxyUrl);
          html = await proxyResponse.text();
        }
      } catch (directError) {
        console.log("📱 iOS - Fallback a proxy CORS");
        const proxyUrl = applyCorsProxy(vixsrcUrl);
        const proxyResponse = await fetch(proxyUrl);
        html = await proxyResponse.text();
      }
    } else {
      // Per altri browser usa proxy normale
      const urlToFetch = useProxy ? applyCorsProxy(vixsrcUrl) : vixsrcUrl;
      const response = await fetch(urlToFetch);
      html = await response.text();
    }

    // Verifica se la pagina contiene stream
    if (!html || html.includes("not found") || html.includes("no sources")) {
      throw new Error("Contenuto non disponibile su Vixsrc");
    }

    showLoading(true, "Estrazione parametri stream...");

    // Cerca i parametri della playlist (pattern più flessibile)
    const playlistPatterns = [
      /window\.masterPlaylist\s*=\s*\{[^}]+\}/,
      /masterPlaylist:\s*\{[^}]+\}/,
      /"params":\s*(\{[^}]+\})/,
      /params:\s*(\{[^}]+\})/
    ];

    let playlistParams = null;
    for (const pattern of playlistPatterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          let paramsStr = match[1] || match[0];
          
          // Pulisci la stringa JSON
          paramsStr = paramsStr
            .replace(/window\.masterPlaylist\s*=\s*\{/, '{')
            .replace(/masterPlaylist:\s*\{/, '{')
            .replace(/'/g, '"')
            .replace(/(\w+):/g, '"$1":')
            .replace(/,}/, '}');
          
          playlistParams = JSON.parse(paramsStr);
          break;
        } catch (e) {
          continue;
        }
      }
    }

    if (!playlistParams) {
      // Fallback: cerca direttamente l'URL m3u8
      const m3u8Patterns = [
        /"(https?:\/\/[^"]+\.m3u8[^"]*)"/,
        /url:\s*'([^']+\.m3u8[^']*)'/,
        /source\s*:\s*'([^']+\.m3u8[^']*)'/
      ];
      
      let m3u8Url = null;
      for (const pattern of m3u8Patterns) {
        const match = html.match(pattern);
        if (match) {
          m3u8Url = match[1];
          break;
        }
      }
      
      if (m3u8Url) {
        return {
          iframeUrl: vixsrcUrl,
          m3u8Url: m3u8Url
        };
      }
      
      throw new Error("Impossibile estrarre i parametri dello stream");
    }

    // Cerca URL della playlist
    const urlPatterns = [
      /window\.masterPlaylist\s*=\s*\{[^}]+url:\s*'([^']+)'/,
      /masterPlaylist:\s*\{[^}]+url:\s*'([^']+)'/,
      /"url":\s*"([^"]+)"/,
      /url:\s*"([^"]+)"/
    ];

    let playlistUrl = null;
    for (const pattern of urlPatterns) {
      const match = html.match(pattern);
      if (match) {
        playlistUrl = match[1];
        break;
      }
    }

    if (!playlistUrl) {
      throw new Error("Impossibile trovare l'URL della playlist");
    }

    // Costruisci l'URL m3u8 finale
    const hasQuery = /\?[^#]+/.test(playlistUrl);
    const separator = hasQuery ? "&" : "?";

    let m3u8Url = playlistUrl + separator +
      "expires=" + (playlistParams.expires || playlistParams.e || "") +
      "&token=" + (playlistParams.token || playlistParams.t || "");

    // Aggiungi parametro per alta qualità se disponibile
    if (playlistParams.h === true || playlistParams.h === "true" || playlistParams.h === 1) {
      m3u8Url += "&h=1";
    }

    // DEBUG
    console.log("📱 iOS - URL m3u8 generato:", m3u8Url);

    // Verifica HTTPS per iOS
    if (shouldUseNativePlayer() && m3u8Url.startsWith("http://")) {
      m3u8Url = m3u8Url.replace("http://", "https://");
      console.log("📱 iOS - URL convertito a HTTPS");
    }

    baseStreamUrl = extractBaseUrl(m3u8Url);

    showLoading(false);
    return {
      iframeUrl: vixsrcUrl,
      m3u8Url: m3u8Url
    };
  } catch (error) {
    showLoading(false);
    console.error("📱 iOS - Errore getStreamData:", error);
    
    // Messaggio più specifico per iOS
    if (shouldUseNativePlayer()) {
      showError(
        "Impossibile estrarre lo stream su iOS",
        "Prova a: 1) Aggiornare Safari 2) Controllare la connessione 3) Riprovare tra qualche minuto"
      );
    } else {
      showError("Errore durante l'estrazione dello stream", error.message);
    }
    
    return null;
  }
}
// Torna indietro dal player
function goBack() {
  // Pulisci tutto
  if (player) {
    player.dispose();
    player = null;
  }
  
  if (nativeVideoElement) {
    nativeVideoElement.src = "";
    nativeVideoElement = null;
  }
  
  const videoElement = document.getElementById("player-video");
  if (videoElement) {
    videoElement.src = "";
    videoElement.remove();
  }
  
  // Reset variabili
  currentItem = null;
  currentSeasons = [];
  
  // Nascondi player e mostra home
  document.getElementById("player").style.display = "none";
  document.getElementById("home").style.display = "block";
  
  // Rimuovi hook CORS
  removeVideoJsXhrHook();
  
  // Aggiorna "Continua visione"
  setTimeout(async () => {
    await loadContinuaDaStorage();
    
    const carousel = document.getElementById("continua-carousel");
    if (carousel && carousel.children.length === 0) {
      document.getElementById("continua-visione").style.display = "none";
    }
  }, 300);
  
  window.scrollTo(0, 0);
}

// Funzioni di utilità (rimangono uguali)
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

// Shortcut da tastiera (solo per Video.js)
function setupKeyboardShortcuts() {
  document.removeEventListener("keydown", handleKeyboardShortcuts);
  document.addEventListener("keydown", handleKeyboardShortcuts);
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

// Feedback visivi
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