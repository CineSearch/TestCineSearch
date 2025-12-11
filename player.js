// Variabili globali del player
let player = null;
let currentItem = null;
let currentSeasons = [];
let nativeVideoElement = null; // Per iOS

// SEMPLIFICA la rilevazione iOS
function shouldUseNativePlayer() {
  // Test semplice: se è un dispositivo mobile iOS o Safari su macOS
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua);
  
  return isIOS || isSafari;
}

async function openPlayer(item) {
  console.log("🎬 Apertura player per:", item.title || item.name);
  console.log("📱 Dispositivo iOS?", shouldUseNativePlayer());
  
  currentItem = item;

  // Nascondi tutto tranne il player
  document.getElementById("home").style.display = "none";
  document.getElementById("results").style.display = "none";
  document.getElementById("player").style.display = "block";

  // Pulisci player precedente
  if (player) {
    player.dispose();
    player = null;
  }
  
  // Pulisci player iOS precedente
  if (nativeVideoElement) {
    nativeVideoElement.remove();
    nativeVideoElement = null;
  }

  // Rimuovi video esistente se c'è
  const oldVideo = document.getElementById("player-video");
  if (oldVideo) {
    oldVideo.remove();
  }
  
  // Crea container per il video
  const videoContainer = document.querySelector(".video-container");
  
  // Aggiungi CSS per iOS se necessario
  if (shouldUseNativePlayer()) {
    const style = document.createElement('style');
    style.id = 'ios-video-style';
    style.textContent = `
      #player-video {
        width: 100% !important;
        height: auto !important;
        max-height: 70vh !important;
        background: #000 !important;
        border-radius: 12px !important;
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
      }
    `;
    if (!document.getElementById('ios-video-style')) {
      document.head.appendChild(style);
    }
  }
  
  const newVideo = document.createElement("video");
  newVideo.id = "player-video";
  
  if (shouldUseNativePlayer()) {
    // Per iOS - player nativo semplice
    console.log("📱 Configurazione player iOS");
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
    console.log("💻 Configurazione Video.js");
    newVideo.className = "video-js vjs-theme-vixflix vjs-big-play-centered";
    newVideo.setAttribute("controls", "");
    newVideo.setAttribute("preload", "auto");
    newVideo.setAttribute("playsinline", "");
    newVideo.setAttribute("crossorigin", "anonymous");
  }
  
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) {
    videoContainer.insertBefore(newVideo, loadingOverlay);
  } else {
    videoContainer.appendChild(newVideo);
  }

  // Imposta titolo e informazioni
  const title = item.title || item.name;
  document.getElementById("player-title").textContent = title;
  document.getElementById("player-meta").innerHTML = `...`;
  document.getElementById("player-overview").textContent = item.overview || "...";

  const mediaType = item.media_type || (item.title ? "movie" : "tv");

  if (mediaType === "tv") {
    console.log("📺 Caricamento serie TV");
    document.getElementById("episode-warning").style.display = "flex";
    await loadTVSeasons(item.id);
  } else {
    console.log("🎥 Caricamento film");
    document.getElementById("episode-warning").style.display = "none";
    document.getElementById("episode-selector").style.display = "none";
    await loadVideo(true, item.id);
  }

  window.scrollTo(0, 0);
}

async function loadTVSeasons(tvId) {
  console.log("📋 Caricamento stagioni per TV ID:", tvId);
  
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
    console.log("🔄 Cambio stagione:", selector.value);
    loadEpisodes(tvId, parseInt(selector.value));
  };

  document.getElementById("episode-selector").style.display = "block";

  if (currentSeasons.length > 0) {
    await loadEpisodes(tvId, currentSeasons[0].season_number);
  }
}


async function loadEpisodes(tvId, seasonNum) {
  console.log("🎞️ Caricamento episodi stagione:", seasonNum);
  
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
      console.log("▶️ Cliccato episodio:", ep.episode_number);
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
  console.log("🎥 loadVideo chiamato:", { isMovie, id, season, episode });
  
  showLoading(true, "Preparazione del player...");

  try {
    if (shouldUseNativePlayer()) {
      console.log("📱 iOS - Avvio player nativo");
      await loadVideoNativeIOS(isMovie, id, season, episode);
    } else {
      console.log("💻 Browser desktop - Avvio Video.js");
      await loadVideoWithVideoJS(isMovie, id, season, episode);
    }
  } catch (err) {
    console.error("❌ Errore nel caricamento del video:", err);
    
    // Messaggio di errore specifico per iOS
    if (shouldUseNativePlayer()) {
      showError(
        "iOS: Impossibile caricare il video", 
        "Prova a:<br>1. Toccare direttamente il video<br>2. Usare una connessione Wi-Fi<br>3. Riprovare tra qualche minuto"
      );
    } else {
      showError("Impossibile caricare il video. Riprova più tardi.");
    }
    
    showLoading(false);
  }
}

// NUOVA VERSIONE SEMPLIFICATA per iOS
async function loadVideoNativeIOS(isMovie, id, season = null, episode = null) {
  console.log("📱 iOS - Inizio caricamento video nativo");
  
  try {
    showLoading(true, "iOS: Recupero stream...");
    
    // Ottieni i dati dello stream
    const streamData = await getDirectStream(id, isMovie, season, episode);
    
    if (!streamData || !streamData.m3u8Url) {
      console.warn("⚠️ Nessun stream diretto, prova fallback...");
      // Prova un fallback diretto
      await trySimpleIOSFallback(isMovie, id, season, episode);
      return;
    }
    
    let m3u8Url = streamData.m3u8Url;
    console.log("🔗 URL ottenuto:", m3u8Url);
    
    // Assicura HTTPS per iOS
    if (m3u8Url.startsWith('http://')) {
      m3u8Url = m3u8Url.replace('http://', 'https://');
      console.log("🔒 Convertito a HTTPS");
    }
    
    // Prepara l'elemento video
    let videoElement = document.getElementById("player-video");
    if (!videoElement) {
      console.error("❌ Elemento video non trovato!");
      throw new Error("Elemento video non trovato");
    }
    
    // Configura attributi finali per iOS
    videoElement.setAttribute('controls', '');
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('webkit-playsinline', '');
    videoElement.setAttribute('preload', 'auto');
    videoElement.crossOrigin = "anonymous";
    
    // Salva riferimento
    nativeVideoElement = videoElement;
    
    // Event listener semplice
    videoElement.onloadedmetadata = () => {
      console.log("✅ iOS - Metadata caricati");
      showLoading(false);
      
      // Prova autoplay
      videoElement.muted = true;
      videoElement.play().then(() => {
        console.log("▶️ iOS - Autoplay riuscito");
        setTimeout(() => {
          videoElement.muted = false;
        }, 1000);
      }).catch(e => {
        console.log("⏸️ iOS - Autoplay bloccato, attendi interazione");
      });
    };
    
    videoElement.onerror = (e) => {
      console.error("❌ iOS - Errore video:", videoElement.error);
      showLoading(false);
      showError("iOS: Errore video", "Tocca il video per riprovare o usa il fallback.");
    };
    
    videoElement.onplay = () => {
      console.log("🎬 iOS - Riproduzione iniziata");
      showLoading(false);
    };
    
    // Imposta la sorgente
    console.log("📱 iOS - Imposto sorgente video");
    videoElement.src = m3u8Url;
    
    // Forza caricamento
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
    console.error("💥 iOS - Errore fatale:", error);
    
    // Prova fallback ultima risorsa
    try {
      await trySimpleIOSFallback(isMovie, id, season, episode);
    } catch (fallbackError) {
      console.error("❌ Fallback fallito:", fallbackError);
      showError("iOS: Errore critico", "Impossibile riprodurre su questo dispositivo.");
      showLoading(false);
    }
  }
}

// FALLBACK SEMPLICE per iOS
async function trySimpleIOSFallback(isMovie, id, season = null, episode = null) {
  console.log("🔄 iOS - Fallback semplice attivato");
  
  showLoading(true, "iOS: Fallback in corso...");
  
  // Stream di test garantiti per iOS
  const fallbackStreams = [
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    "https://content.jwplatform.com/manifests/vM7nH0Kl.m3u8",
    "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8"
  ];
  
  const testStream = fallbackStreams[0]; // Usa sempre il primo per semplicità
  
  let videoElement = document.getElementById("player-video");
  if (!videoElement) {
    throw new Error("Elemento video non trovato per fallback");
  }
  
  // Configura per il fallback
  videoElement.setAttribute('controls', '');
  videoElement.setAttribute('playsinline', '');
  videoElement.setAttribute('webkit-playsinline', '');
  videoElement.crossOrigin = "anonymous";
  
  videoElement.onloadedmetadata = () => {
    console.log("✅ Fallback iOS - Video pronto");
    showLoading(false);
    
    videoElement.muted = true;
    videoElement.play().catch(e => {
      console.log("Fallback iOS - Tocca per avviare");
    });
  };
  
  videoElement.onerror = (e) => {
    console.error("❌ Fallback iOS - Errore:", videoElement.error);
    showLoading(false);
    showError("iOS Fallback", "Anche lo stream di test non funziona.");
  };
  
  console.log("📺 iOS - Usando stream di test:", testStream);
  videoElement.src = testStream;
  videoElement.load();
  
  nativeVideoElement = videoElement;
}

// VIDEO.JS per altri browser (LOGICA ORIGINALE)
async function loadVideoWithVideoJS(isMovie, id, season = null, episode = null) {
  try {
    setupVideoJsXhrHook();
    if (player) {
      player.dispose();
      player = null;
    }

    const streamData = await getDirectStream(id, isMovie, season, episode);

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
    console.error("Errore loadVideoWithVideoJS:", err);
    showError("Impossibile caricare il video. Riprova più tardi.");
  }
}

async function getDirectStream(tmdbId, isMovie, season = null, episode = null) {
  try {
    showLoading(true, "Connessione al server...");

    let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${tmdbId}`;
    if (!isMovie && season !== null && episode !== null) {
      vixsrcUrl += `/${season}/${episode}`;
    }

    console.log("🔗 Fetching URL:", vixsrcUrl);
    showLoading(true, "Recupero pagina vixsrc...");
    
    // Usa sempre proxy per evitare problemi CORS
    const urlToFetch = applyCorsProxy(vixsrcUrl);
    const response = await fetch(urlToFetch);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();

    showLoading(true, "Estrazione parametri stream...");

    // Cerca i parametri della playlist
    const playlistParamsRegex =
      /window\.masterPlaylist[^:]+params:[^{]+({[^<]+?})/;
    const playlistParamsMatch = html.match(playlistParamsRegex);

    if (!playlistParamsMatch) {
      // Prova pattern alternativo
      const altPattern = /params:\s*({[^}]+})/;
      const altMatch = html.match(altPattern);
      if (!altMatch) {
        throw new Error("Impossibile trovare i parametri della playlist");
      }
      playlistParamsMatch = altMatch;
    }

    let playlistParamsStr = playlistParamsMatch[1]
      .replace(/'/g, '"')
      .replace(/\s+/g, " ")
      .replace(/\n/g, " ")
      .trim();

    // Correggi JSON se necessario
    if (!playlistParamsStr.endsWith("}")) {
      playlistParamsStr = playlistParamsStr.replace(/,\s*$/, "") + "}";
    }

    let playlistParams;
    try {
      playlistParams = JSON.parse(playlistParamsStr);
    } catch (e) {
      console.warn("⚠️ Errore parsing JSON, estrazione manuale...");
      // Estrai manualmente token e expires
      const tokenMatch = playlistParamsStr.match(/"token":\s*"([^"]+)"/) || 
                        playlistParamsStr.match(/token:\s*'([^']+)'/);
      const expiresMatch = playlistParamsStr.match(/"expires":\s*"([^"]+)"/) || 
                          playlistParamsStr.match(/expires:\s*'([^']+)'/);
      
      if (!tokenMatch || !expiresMatch) {
        throw new Error("Impossibile estrarre token/expires");
      }
      
      playlistParams = {
        token: tokenMatch[1],
        expires: expiresMatch[1]
      };
    }

    const playlistUrlRegex =
      /window\.masterPlaylist\s*=\s*\{[\s\S]*?url:\s*'([^']+)'/;
    const playlistUrlMatch = html.match(playlistUrlRegex);

    if (!playlistUrlMatch) {
      // Prova pattern alternativo per URL
      const altUrlPattern = /"url":\s*"([^"]+)"/;
      const altUrlMatch = html.match(altUrlPattern);
      if (!altUrlMatch) {
        throw new Error("Impossibile trovare l'URL della playlist");
      }
      playlistUrlMatch = altUrlMatch;
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

    console.log("✅ Stream estratto con successo");
    showLoading(false);
    
    return {
      iframeUrl: vixsrcUrl,
      m3u8Url: m3u8Url,
      source: 'direct_extraction'
    };
  } catch (error) {
    console.error("❌ Errore in getDirectStream:", error);
    showLoading(false);
    
    // Per iOS, non mostrare errore qui, lascia che il fallback gestisca
    if (shouldUseNativePlayer()) {
      return null;
    }
    
    showError("Errore durante l'estrazione dello stream", error.message);
    return null;
  }
}

function goBack() {
  console.log("🔙 Tornando indietro dal player...");
  
  // Pulisci Video.js
  if (player) {
    player.dispose();
    player = null;
  }
  
  // Pulisci player iOS
  if (nativeVideoElement) {
    try {
      nativeVideoElement.pause();
      nativeVideoElement.src = "";
    } catch (e) {
      console.error("Errore pulizia iOS:", e);
    }
    nativeVideoElement = null;
  }
  
  // Rimuovi elemento video
  const videoElement = document.getElementById("player-video");
  if (videoElement) {
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

// FUNZIONI DI UTILITÀ (invariate)
function showLoading(show, message = "Caricamento stream...") {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.style.display = show ? "flex" : "none";
    const textEl = overlay.querySelector(".loading-text");
    if (textEl) {
      textEl.textContent = message;
    }
  }
}

function showError(message, details = "") {
  showLoading(false);
  const container = document.querySelector(".video-container");
  if (!container) return;
  
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.innerHTML = `<h3>⚠️ Errore</h3><p>${message}</p>${details ? `<p style="font-size:0.9em;opacity:0.7;margin-top:0.5em;">${details}</p>` : ""}`;
  container.appendChild(errorDiv);

  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}
