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
async function openPlayerIOS(item) {
  console.log("📱 iOS - Apertura player nativo");
  
  // Pulisci Video.js se esiste
  if (player) {
    player.dispose();
    player = null;
  }
  
  // Pulisci vecchio video iOS
  if (iosVideoElement) {
    iosVideoElement.remove();
    iosVideoElement = null;
  }
  
  // Rimuovi video esistente
  const oldVideo = document.getElementById("player-video");
  if (oldVideo) {
    oldVideo.remove();
  }
  
  // Crea elemento video per iOS
  const videoContainer = document.querySelector(".video-container");
  const videoElement = document.createElement("video");
  videoElement.id = "player-video";
  videoElement.className = "ios-native-player";
  
  // ATTRIBUTI CRITICI per iOS
  videoElement.setAttribute("controls", "");
  videoElement.setAttribute("playsinline", "");
  videoElement.setAttribute("webkit-playsinline", "");
  videoElement.setAttribute("preload", "auto");
  videoElement.setAttribute("crossorigin", "anonymous");
  videoElement.setAttribute("x-webkit-airplay", "allow");
  
  // Stili iOS
  videoElement.style.cssText = `
    width: 100%;
    height: auto;
    max-height: 70vh;
    background: #000;
    border-radius: 12px;
    display: block;
    -webkit-transform: translateZ(0);
    transform: translateZ(0);
  `;
  
  // Aggiungi al DOM
  const loadingOverlay = document.getElementById("loading-overlay");
  videoContainer.insertBefore(videoElement, loadingOverlay);
  
  // Salva riferimento
  iosVideoElement = videoElement;

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
    await loadVideoIOS(true, item.id);
  }
}

async function loadVideoIOS(isMovie, id, season = null, episode = null) {
  console.log("📱 iOS - Caricamento video");
  showLoading(true, "iOS: preparazione stream...");

  try {
    // Ottieni stream da vixsrc - USA LA STESSA LOGICA
    const streamData = await getDirectStreamIOS(id, isMovie, season, episode);
    
    if (!streamData || !streamData.m3u8Url) {
      throw new Error("Nessun stream disponibile per iOS");
    }
    
    let m3u8Url = streamData.m3u8Url;
    
    // Assicura HTTPS per iOS
    if (m3u8Url.startsWith('http://')) {
      m3u8Url = m3u8Url.replace('http://', 'https://');
      console.log("🔒 iOS - Convertito in HTTPS");
    }
    
    // Prepara elemento video
    let videoElement = document.getElementById("player-video");
    if (!videoElement) {
      throw new Error("Elemento video iOS non trovato");
    }
    
    // Configura event listener per iOS
    setupIOSVideoEvents(videoElement);
    
    // Imposta sorgente
    console.log("🔗 iOS - URL finale:", m3u8Url.substring(0, 100) + "...");
    videoElement.src = m3u8Url;
    
    // Aggiungi elemento source per HLS
    const sourceElement = document.createElement('source');
    sourceElement.src = m3u8Url;
    sourceElement.type = 'application/vnd.apple.mpegurl';
    videoElement.appendChild(sourceElement);
    
    // Forza caricamento
    videoElement.load();
    
    // Tracciamento progresso
    trackVideoProgress(id, isMovie ? "movie" : "tv", videoElement, season, episode);
    
  } catch (error) {
    console.error("❌ iOS - Errore:", error);
    showError("iOS: Impossibile caricare il video", error.message);
    showLoading(false);
  }
}

// VERSIONE DI getDirectStream PER iOS - STESSA LOGICA MA ADATTATA
async function getDirectStreamIOS(tmdbId, isMovie, season = null, episode = null) {
  console.log("📱 iOS - Estrazione stream (stessa logica desktop)");
  
  try {
    showLoading(true, "iOS: connessione al server...");

    let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${tmdbId}`;
    if (!isMovie && season !== null && episode !== null) {
      vixsrcUrl += `/${season}/${episode}`;
    }

    console.log("🔗 iOS - Vixsrc URL:", vixsrcUrl);
    
    // SU iOS USA SEMPRE PROXY CON HEADER CORRETTI
    const proxyUrl = applyCorsProxy(vixsrcUrl);
    const response = await fetch(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9',
        'Referer': 'https://vixsrc.to/'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log("📄 iOS - HTML ricevuto, lunghezza:", html.length);

    showLoading(true, "iOS: estrazione parametri...");

    // STESSA LOGICA DEL DESKTOP
    const playlistParamsRegex = /window\.masterPlaylist[^:]+params:[^{]+({[^<]+?})/;
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
      console.warn("⚠️ iOS - Errore parsing JSON, estrazione manuale...");
      // Estrai manualmente token e expires - STESSA LOGICA
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

    const playlistUrlRegex = /window\.masterPlaylist\s*=\s*\{[\s\S]*?url:\s*'([^']+)'/;
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

    const m3u8Url = playlistUrl + separator +
      "expires=" + playlistParams.expires +
      "&token=" + playlistParams.token +
      (canPlayFHD ? "&h=1" : "");

    console.log("✅ iOS - Stream estratto con successo:", m3u8Url.substring(0, 100) + "...");
    
    showLoading(false);
    
    return {
      iframeUrl: vixsrcUrl,
      m3u8Url: m3u8Url,
    };
    
  } catch (error) {
    console.error("❌ iOS - Errore in getDirectStreamIOS:", error);
    showLoading(false);
    
    // Prova metodo alternativo se il primo fallisce
    console.log("🔄 iOS - Tentativo metodo alternativo...");
    return await getDirectStreamIOSAlternative(tmdbId, isMovie, season, episode);
  }
}

// METODO ALTERNATIVO PER iOS SE IL PRIMO FALLISCE
async function getDirectStreamIOSAlternative(tmdbId, isMovie, season = null, episode = null) {
  console.log("🔄 iOS - Metodo alternativo attivato");
  
  try {
    showLoading(true, "iOS: metodo alternativo...");
    
    let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${tmdbId}`;
    if (!isMovie && season !== null && episode !== null) {
      vixsrcUrl += `/${season}/${episode}`;
    }
    
    // Prova proxy diverso
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(vixsrcUrl)}`;
    console.log("🔄 iOS - Proxy alternativo:", proxyUrl);
    
    const response = await fetch(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Proxy alternativo HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Cerca direttamente URL m3u8 nel HTML
    const m3u8Patterns = [
      /https?:\/\/[^\s"']+\.m3u8[^\s"']*/g,
      /["'](https?:\/\/[^"']+\.m3u8)["']/g,
      /source:\s*["'](https?:\/\/[^"']+\.m3u8)["']/g,
      /file:\s*["'](https?:\/\/[^"']+\.m3u8)["']/g
    ];
    
    for (const pattern of m3u8Patterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        let url = matches[0].replace(/["']/g, '').split(' ')[0];
        if (url.includes('.m3u8')) {
          // Verifica che sia un URL valido
          if (url.startsWith('http')) {
            console.log("✅ iOS - URL trovato con pattern diretto:", url.substring(0, 100));
            
            // Assicura HTTPS
            if (url.startsWith('http://')) {
              url = url.replace('http://', 'https://');
            }
            
            return {
              iframeUrl: vixsrcUrl,
              m3u8Url: url
            };
          }
        }
      }
    }
    
    throw new Error("Nessun URL m3u8 trovato con metodo alternativo");
    
  } catch (error) {
    console.error("❌ iOS - Metodo alternativo fallito:", error);
    return null;
  }
}

function setupIOSVideoEvents(videoElement) {
  let hasStarted = false;
  
  videoElement.onloadedmetadata = () => {
    console.log("✅ iOS - Video pronto");
    showLoading(false);
    
    if (!hasStarted) {
      // Tenta autoplay (muted per iOS)
      videoElement.muted = true;
      videoElement.play().then(() => {
        console.log("▶️ iOS - Autoplay riuscito");
        hasStarted = true;
        setTimeout(() => { 
          videoElement.muted = false;
        }, 1000);
      }).catch(e => {
        console.log("⏸️ iOS - Tocca per avviare");
      });
    }
  };
  
  videoElement.onerror = (e) => {
    console.error("❌ iOS - Errore video:", videoElement.error);
    showLoading(false);
    
    let errorMsg = "Errore sconosciuto";
    if (videoElement.error) {
      switch(videoElement.error.code) {
        case 1: errorMsg = "Video cancellato"; break;
        case 2: errorMsg = "Errore di rete"; break;
        case 3: errorMsg = "Errore decodifica"; break;
        case 4: errorMsg = "Formato non supportato"; break;
      }
    }
    
    showError("iOS: Errore video", `${errorMsg}<br>Tocca il video per riprovare`);
  };
  
  videoElement.onplay = () => {
    console.log("🎬 iOS - Riproduzione avviata");
    showLoading(false);
    hasStarted = true;
  };
  
  videoElement.onwaiting = () => {
    showLoading(true, "Buffering...");
  };
  
  videoElement.onplaying = () => {
    showLoading(false);
  };
  
  // Aggiungi anche event listener per gestire tap su iOS
  videoElement.addEventListener('click', () => {
    if (videoElement.paused && !hasStarted) {
      videoElement.muted = true;
      videoElement.play().then(() => {
        hasStarted = true;
        setTimeout(() => { videoElement.muted = false; }, 1000);
      });
    }
  });
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
