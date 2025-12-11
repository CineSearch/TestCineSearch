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
    
    let m3u8Url = streamData.m3u8Url;
    
    // Ottimizza URL in base al dispositivo
    m3u8Url = await optimizeStreamUrl(m3u8Url);
    
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

// Ottimizza URL stream in base al dispositivo
async function optimizeStreamUrl(url) {
  console.log("⚙️ Ottimizzazione URL per dispositivo");
  
  let optimizedUrl = url;
  
  // Per iOS/Safari: ottimizza per HLS nativo
  if (shouldUseNativeHLS()) {
    // 1. Forza HTTPS
    if (optimizedUrl.startsWith('http://')) {
      optimizedUrl = optimizedUrl.replace('http://', 'https://');
      console.log("🔒 Forzato HTTPS per iOS");
    }
    
    // 2. Rimuovi parametri problematici per iOS
    const problematicParams = [
      'h265', 'hevc', 'vp9', 'av1', // Codec non supportati
      'dolby', 'atmos', 'hdr' // Formati avanzati
    ];
    
    problematicParams.forEach(param => {
      if (optimizedUrl.includes(param)) {
        optimizedUrl = optimizedUrl.replace(new RegExp(`[?&]${param}=[^&]*`, 'gi'), '');
        console.log(`🗑️ Rimosso parametro ${param} per iOS`);
      }
    });
    
    // 3. Aggiungi parametri per iOS se non presenti
    if (!optimizedUrl.includes('avc=1')) {
      optimizedUrl += (optimizedUrl.includes('?') ? '&' : '?') + 'avc=1';
    }
  }
  
  // Per hls.js: ottimizza per prestazioni
  if (shouldUseHlsJs()) {
    // Aggiungi parametri per migliori prestazioni hls.js
    if (!optimizedUrl.includes('hls.js=1')) {
      optimizedUrl += (optimizedUrl.includes('?') ? '&' : '?') + 'hls.js=1&lowLatency=1';
    }
  }
  
  console.log("✅ URL ottimizzato:", optimizedUrl.substring(0, 120));
  return optimizedUrl;
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
  
  // Attributi specifici per iOS
  if (shouldUseNativeHLS()) {
    videoElement.setAttribute("webkit-playsinline", "");
    videoElement.setAttribute("x-webkit-airplay", "allow");
  }
  
  // Stili
  videoElement.style.cssText = `
    width: 100%;
    height: auto;
    max-height: 70vh;
    background: #000;
    border-radius: 12px;
    display: block;
  `;
  
  // Performance per iOS
  if (shouldUseNativeHLS()) {
    videoElement.style.webkitTransform = "translateZ(0)";
    videoElement.style.transform = "translateZ(0)";
  }
  
  // Aggiungi al DOM
  const loadingOverlay = document.getElementById("loading-overlay");
  videoContainer.insertBefore(videoElement, loadingOverlay);
  
  return videoElement;
}

// Configura HLS nativo (Safari/iOS)
async function setupNativeHLS(videoElement, m3u8Url) {
  console.log("🍎 Configurazione HLS nativo");
  
  try {
    // Configura sorgente
    videoElement.src = m3u8Url;
    
    // Aggiungi elemento source
    const sourceElement = document.createElement('source');
    sourceElement.src = m3u8Url;
    sourceElement.type = 'application/vnd.apple.mpegurl';
    videoElement.appendChild(sourceElement);
    
    // Event listener
    setupVideoEvents(videoElement, true); // true = iOS mode
    
    // Carica video
    videoElement.load();
    
    // Timeout per errori di caricamento
    setTimeout(() => {
      if (videoElement.readyState < 1) {
        console.warn("⚠️ Video non si carica, provo fallback...");
        tryStreamFallback(videoElement, m3u8Url, true);
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
    setupVideoEvents(videoElement, false);
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
            tryStreamFallback(videoElement, m3u8Url, false);
            break;
        }
      }
    });
    
    // Gestione qualità (opzionale)
    hlsInstance.on(Hls.Events.LEVEL_LOADED, function(event, data) {
      console.log("📊 Livello qualità caricato:", data);
      // Puoi implementare un selettore qualità qui
      showAvailableQualities(hlsInstance.levels);
    });
    
    // Event listener video standard
    setupVideoEvents(videoElement, false);
    
  } catch (error) {
    console.error("❌ Errore hls.js:", error);
    hlsInstance = null;
    throw error;
  }
}

// Mostra qualità disponibili (opzionale)
function showAvailableQualities(levels) {
  if (!levels || levels.length < 2) return;
  
  // Puoi creare un selettore qualità qui
  console.log("📶 Qualità disponibili:", levels.map(l => `${l.height}p`));
}

// Configura event listener video
function setupVideoEvents(videoElement, isIOS = false) {
  let hasStarted = false;
  
  videoElement.onloadedmetadata = () => {
    console.log("✅ Video pronto");
    showLoading(false);
    
    if (!hasStarted) {
      // Tenta autoplay (muted per iOS)
      if (isIOS) {
        videoElement.muted = true;
        videoElement.play().then(() => {
          console.log("▶️ Autoplay riuscito su iOS");
          hasStarted = true;
          setTimeout(() => { 
            videoElement.muted = false;
          }, 1000);
        }).catch(e => {
          console.log("⏸️ Tocca per avviare su iOS");
        });
      } else {
        videoElement.play().catch(e => {
          console.log("⏸️ Tocca per avviare");
        });
      }
    }
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
    
    if (isIOS) {
      errorMsg += "<br><strong>Cosa provare su iOS:</strong><br>" +
                  "1. Tocca il video per riprovare<br>" +
                  "2. Prova un altro film/serie<br>" +
                  "3. Controlla la connessione internet";
    }
    
    showError("Errore riproduzione", errorMsg);
    
    // Tenta fallback automatico dopo 3 secondi
    setTimeout(() => {
      tryStreamFallback(videoElement, videoElement.src, isIOS);
    }, 3000);
  };
  
  videoElement.onplay = () => {
    console.log("🎬 Riproduzione avviata");
    showLoading(false);
    hasStarted = true;
  };
  
  videoElement.onwaiting = () => {
    showLoading(true, "Buffering...");
  };
  
  videoElement.onplaying = () => {
    showLoading(false);
  };
  
  // Gestione tap su iOS per avviare
  if (isIOS) {
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
}

// Fallback per stream problematici
async function tryStreamFallback(videoElement, originalUrl, isIOS = false) {
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
    
    // 2. Prova servizi alternativi
    if (isIOS) {
      await tryAlternativeServices(videoElement, isIOS);
      return;
    }
    
    // 3. Prova stream di test garantito
    console.log("📺 Provo stream di test");
    const testStreams = [
      "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", // MPEG-TS H.264
      "https://content.jwplatform.com/manifests/vM7nH0Kl.m3u8", // H.264 AAC
      "https://bitdash-a.akamaihd.net/s/content/media/Manifest.m3u8" // Akamai test
    ];
    
    videoElement.src = testStreams[0];
    videoElement.load();
    
    // Cambia titolo per indicare modalità test
    const currentTitle = document.getElementById("player-title").textContent;
    if (!currentTitle.includes("(Modalità test)")) {
      document.getElementById("player-title").textContent = currentTitle + " (Modalità test)";
    }
    
  } catch (fallbackError) {
    console.error("❌ Fallback fallito:", fallbackError);
    showError("Fallback fallito", "Impossibile trovare uno stream compatibile");
  }
}

// Prova servizi alternativi (soprattutto per iOS)
async function tryAlternativeServices(videoElement, isIOS = false) {
  console.log("🌐 Provo servizi alternativi");
  
  const currentItemId = currentItem?.id;
  if (!currentItemId) return;
  
  const isMovie = currentItem.title ? true : false;
  
  try {
    // Servizi alternativi per streaming
    const altServices = [
      // Service 1: Vidsrc
      `https://vidsrc.xyz/vidsrc/${currentItemId}${!isMovie ? `/1/1` : ''}`,
      
      // Service 2: 2embed
      `https://www.2embed.cc/embed/${currentItemId}${!isMovie ? `/1/1` : ''}`,
      
      // Service 3: Autoembed
      `https://autoembed.co/${isMovie ? 'movie' : 'tv'}/tmdb/${currentItemId}${!isMovie ? '-1-1' : ''}`
    ];
    
    for (const serviceUrl of altServices) {
      try {
        console.log("🔗 Provo servizio:", serviceUrl);
        
        // Usa proxy CORS
        const proxyUrl = applyCorsProxy(serviceUrl);
        const response = await fetch(proxyUrl, {
          headers: {
            'User-Agent': isIOS 
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
              : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        if (response.ok) {
          const html = await response.text();
          
          // Cerca stream HLS
          const hlsPattern = /(https?:\/\/[^"\s]+\.m3u8[^"\s]*)/gi;
          const matches = html.match(hlsPattern);
          
          if (matches && matches.length > 0) {
            for (const match of matches) {
              let url = match.replace(/["']/g, '').split(' ')[0];
              if (url.includes('.m3u8')) {
                // Ottimizza per dispositivo
                url = await optimizeStreamUrl(url);
                
                console.log("✅ Trovato stream alternativo:", url.substring(0, 100));
                
                videoElement.src = url;
                videoElement.load();
                return;
              }
            }
          }
        }
      } catch (serviceError) {
        console.log("❌ Servizio fallito:", serviceError.message);
        continue;
      }
    }
    
    throw new Error("Nessun servizio alternativo disponibile");
    
  } catch (error) {
    console.error("❌ Tutti i servizi alternativi falliti:", error);
    throw error;
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
