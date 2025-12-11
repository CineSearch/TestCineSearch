// Variabili globali del player
let player = null;
let currentItem = null;
let currentSeasons = [];
let nativeVideoElement = null;

// Rilevamento iOS
function shouldUseNativePlayer() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /iPad|iPhone|iPod/.test(ua) || 
         (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua));
}

async function openPlayer(item) {
  console.log("🎬 Apertura player per:", item.title || item.name);
  
  currentItem = item;

  document.getElementById("home").style.display = "none";
  document.getElementById("results").style.display = "none";
  document.getElementById("player").style.display = "block";

  // Pulisci tutto
  if (player) {
    player.dispose();
    player = null;
  }
  
  if (nativeVideoElement) {
    nativeVideoElement.remove();
    nativeVideoElement = null;
  }

  const oldVideo = document.getElementById("player-video");
  if (oldVideo) {
    oldVideo.remove();
  }
  
  // Crea elemento video
  const videoContainer = document.querySelector(".video-container");
  const newVideo = document.createElement("video");
  newVideo.id = "player-video";
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
  
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) {
    videoContainer.insertBefore(newVideo, loadingOverlay);
  } else {
    videoContainer.appendChild(newVideo);
  }

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
      document.querySelectorAll(".episode-item").forEach((e) => e.classList.remove("active"));
      div.classList.add("active");
      document.getElementById("episode-warning").style.display = "none";
      loadVideo(false, tvId, seasonNum, ep.episode_number);
    };
    container.appendChild(div);
  });
}

async function loadVideo(isMovie, id, season = null, episode = null) {
  console.log("🎥 Caricamento video per:", { isMovie, id, season, episode });
  
  showLoading(true, "Avvio player...");

  try {
    if (shouldUseNativePlayer()) {
      console.log("📱 iOS - Avvio player nativo");
      await loadVideoIOS(isMovie, id, season, episode);
    } else {
      console.log("💻 Desktop - Avvio Video.js");
      await loadVideoWithVideoJS(isMovie, id, season, episode);
    }
  } catch (err) {
    console.error("❌ Errore loadVideo:", err);
    showError("Impossibile caricare il video. Riprova più tardi.");
    showLoading(false);
  }
}

// NUOVO METODO ROBUSTO PER iOS
async function loadVideoIOS(isMovie, id, season = null, episode = null) {
  console.log("📱 iOS - Inizio caricamento con metodo robusto");
  
  try {
    showLoading(true, "iOS: ricerca stream...");
    
    // STRATEGIA 1: Prova con metodo speciale per iOS
    let streamData = null;
    try {
      streamData = await getStreamForiOSRobust(isMovie, id, season, episode);
      console.log("✅ Metodo robusto risultato:", streamData ? "OK" : "NULL");
    } catch (error) {
      console.log("⚠️ Metodo robusto fallito:", error.message);
      streamData = null;
    }
    
    // STRATEGIA 2: Se fallisce, prova servizio proxy alternativo
    if (!streamData || !streamData.m3u8Url) {
      console.log("🔄 iOS - Tentativo servizio proxy alternativo");
      try {
        streamData = await getStreamFromExternalService(isMovie, id, season, episode);
      } catch (apiError) {
        console.log("❌ Servizio proxy fallito:", apiError.message);
      }
    }
    
    // STRATEGIA 3: Se tutto fallisce, usa stream di test
    if (!streamData || !streamData.m3u8Url) {
      console.log("📺 iOS - Usando stream di test");
      streamData = {
        m3u8Url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        source: "ios_test_fallback",
        title: "Stream dimostrativo"
      };
      showIOSMessage("⚠️ Modalità dimostrativa<br>Stream di test attivo");
    }
    
    console.log("🔗 iOS - URL finale:", streamData.m3u8Url);
    
    // Prepara elemento video
    let videoElement = document.getElementById("player-video");
    if (!videoElement) {
      throw new Error("Elemento video non trovato");
    }
    
    // Aggiorna titolo se siamo in modalità test
    if (streamData.source === "ios_test_fallback") {
      document.getElementById("player-title").textContent = 
        (currentItem.title || currentItem.name) + " (Modalità dimostrativa)";
    }
    
    // Salva riferimento
    nativeVideoElement = videoElement;
    
    // Configura event listener
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
            hideIOSMessage();
          }, 1000);
        }).catch(e => {
          console.log("⏸️ iOS - Tocca il video per avviare");
          showIOSMessage("▶️ Tocca il video per avviare la riproduzione");
        });
      }
    };
    
    videoElement.onerror = (e) => {
      console.error("❌ iOS - Errore video:", videoElement.error);
      showLoading(false);
      
      if (streamData.source === "ios_test_fallback") {
        showError("iOS: Errore critico", "Impossibile riprodurre qualsiasi stream.");
      } else {
        showError("iOS: Errore riproduzione", "Tocca il video per riprovare.");
      }
    };
    
    videoElement.onplay = () => {
      console.log("🎬 iOS - Riproduzione avviata");
      showLoading(false);
      hasStarted = true;
      hideIOSMessage();
    };
    
    // Imposta sorgente (assicura HTTPS)
    let finalUrl = streamData.m3u8Url;
    if (finalUrl.startsWith('http://')) {
      finalUrl = finalUrl.replace('http://', 'https://');
    }
    
    console.log("📱 iOS - Imposto URL:", finalUrl);
    videoElement.src = finalUrl;
    
    // Forza caricamento
    videoElement.load();
    
    // Tracciamento
    trackVideoProgress(id, isMovie ? "movie" : "tv", videoElement, season, episode);
    
  } catch (error) {
    console.error("💥 iOS - Errore fatale:", error);
    showError("iOS: Errore", "Impossibile inizializzare il player.");
    showLoading(false);
  }
}

// NUOVO METODO ROBUSTO PER iOS
async function getStreamForiOSRobust(isMovie, id, season = null, episode = null) {
  console.log("🛡️ iOS - Metodo robusto attivato");
  
  try {
    showLoading(true, "iOS: connessione speciale...");
    
    // Costruisci URL vixsrc
    let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${id}`;
    if (!isMovie && season !== null && episode !== null) {
      vixsrcUrl += `/${season}/${episode}`;
    }
    
    console.log("🔗 iOS - Target URL:", vixsrcUrl);
    
    // METODO A: Usa proxy che simula browser iOS
    const proxyUrls = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(vixsrcUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(vixsrcUrl)}`,
      `https://proxy.cors.sh/${vixsrcUrl}`
    ];
    
    let html = null;
    let lastError = null;
    
    // Prova tutti i proxy
    for (const proxyUrl of proxyUrls) {
      try {
        console.log("🔄 iOS - Provo proxy:", proxyUrl.substring(0, 50) + "...");
        
        const response = await fetch(proxyUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'it-IT,it;q=0.9',
            'Referer': 'https://vixsrc.to/'
          },
          timeout: 10000
        });
        
        if (response.ok) {
          html = await response.text();
          console.log("✅ iOS - Proxy successo, lunghezza HTML:", html.length);
          break;
        }
      } catch (error) {
        lastError = error;
        console.log("❌ iOS - Proxy fallito:", error.message);
        continue;
      }
    }
    
    if (!html) {
      throw new Error("Tutti i proxy falliti: " + (lastError?.message || "Unknown"));
    }
    
    // Salva HTML per debug (solo in console)
    console.log("📄 iOS - HTML ricevuto (primi 500 caratteri):", html.substring(0, 500));
    
    // Cerca URL m3u8 con pattern multipli
    const m3u8Patterns = [
      /https?:\/\/[^\s"']+\.m3u8[^\s"']*/g,
      /["'](https?:\/\/[^"']+\.m3u8)["']/g,
      /source:\s*["'](https?:\/\/[^"']+\.m3u8)["']/g,
      /file:\s*["'](https?:\/\/[^"']+\.m3u8)["']/g,
      /src:\s*["'](https?:\/\/[^"']+\.m3u8)["']/g
    ];
    
    let m3u8Url = null;
    
    for (const pattern of m3u8Patterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        // Prendi il primo URL che sembra valido
        for (const match of matches) {
          let url = match.replace(/["']/g, '').split(' ')[0].split(')')[0];
          if (url.includes('.m3u8') && (url.includes('vixsrc') || url.includes('cloudflare'))) {
            m3u8Url = url;
            console.log("🎯 iOS - URL trovato con pattern:", url.substring(0, 100));
            break;
          }
        }
        if (m3u8Url) break;
      }
    }
    
    if (!m3u8Url) {
      // Cerca nei dati JavaScript
      console.log("🔍 iOS - Ricerca nei dati JS...");
      
      // Cerca oggetto masterPlaylist
      const masterPlaylistPattern = /window\.masterPlaylist\s*=\s*({[^}]+})/;
      const masterPlaylistMatch = html.match(masterPlaylistPattern);
      
      if (masterPlaylistMatch) {
        const playlistStr = masterPlaylistMatch[1];
        console.log("📝 iOS - Trovato masterPlaylist:", playlistStr.substring(0, 200));
        
        // Estrai URL e parametri
        const urlMatch = playlistStr.match(/url:\s*'([^']+)'/);
        const paramsMatch = playlistStr.match(/params:\s*({[^}]+})/);
        
        if (urlMatch && paramsMatch) {
          const baseUrl = urlMatch[1];
          const paramsStr = paramsMatch[1];
          
          // Estrai token e expires
          const tokenMatch = paramsStr.match(/token:\s*'([^']+)'/);
          const expiresMatch = paramsStr.match(/expires:\s*'([^']+)'/);
          
          if (tokenMatch && expiresMatch) {
            const token = tokenMatch[1];
            const expires = expiresMatch[1];
            const separator = baseUrl.includes('?') ? '&' : '?';
            m3u8Url = `${baseUrl}${separator}expires=${expires}&token=${token}`;
            console.log("🔧 iOS - URL costruito dai parametri");
          }
        }
      }
    }
    
    if (!m3u8Url) {
      // Ultimo tentativo: cerca qualsiasi cosa che assomigli a un URL con parametri
      const anyUrlPattern = /https?:\/\/[^\s"']+\?expires=[^&]+&token=[^&"']+/g;
      const anyMatches = html.match(anyUrlPattern);
      if (anyMatches && anyMatches.length > 0) {
        m3u8Url = anyMatches[0].split('"')[0].split("'")[0];
        console.log("🎰 iOS - URL trovato con pattern generico");
      }
    }
    
    if (!m3u8Url) {
      throw new Error("Impossibile trovare URL m3u8 nell'HTML");
    }
    
    // Pulisci URL
    m3u8Url = m3u8Url.trim();
    
    // Aggiungi parametro qualità se disponibile
    if (html.includes('canPlayFHD') && html.includes('true')) {
      m3u8Url += (m3u8Url.includes('?') ? '&' : '?') + 'h=1';
    }
    
    console.log("✅ iOS - URL finale:", m3u8Url);
    
    return {
      iframeUrl: vixsrcUrl,
      m3u8Url: m3u8Url,
      source: 'ios_robust_extraction'
    };
    
  } catch (error) {
    console.error("❌ iOS - Metodo robusto fallito:", error);
    return null;
  }
}

// SERVIZIO ESTERNO PER STREAM
async function getStreamFromExternalService(isMovie, id, season = null, episode = null) {
  console.log("🌐 iOS - Tentativo servizio esterno");
  
  try {
    const type = isMovie ? 'movie' : 'tv';
    
    // Prova diversi servizi esterni
    const services = [
      `https://vixsrc-proxy.vercel.app/api/stream?tmdb=${id}&type=${type}`,
      `https://movie-web-worker.vercel.app/api/stream?tmdb=${id}&type=${type}`,
      `https://stream-finder-api.vercel.app/api/vixsrc?tmdb=${id}&type=${type}`
    ];
    
    if (!isMovie && season && episode) {
      services.forEach((url, index) => {
        services[index] = url + `&season=${season}&episode=${episode}`;
      });
    }
    
    let result = null;
    
    for (const serviceUrl of services) {
      try {
        console.log("🔗 iOS - Provo servizio:", serviceUrl);
        
        const response = await fetch(serviceUrl, { 
          timeout: 8000,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data && data.url && data.url.includes('.m3u8')) {
            console.log("✅ iOS - Servizio successo, URL:", data.url);
            result = {
              m3u8Url: data.url,
              source: 'external_service'
            };
            break;
          }
        }
      } catch (error) {
        console.log("❌ iOS - Servizio fallito:", error.message);
        continue;
      }
    }
    
    if (!result) {
      throw new Error("Tutti i servizi esterni falliti");
    }
    
    return result;
    
  } catch (error) {
    console.error("❌ iOS - Servizi esterni falliti:", error);
    return null;
  }
}

// FUNZIONI HELPER PER iOS
function showIOSMessage(message) {
  hideIOSMessage();
  
  const msgDiv = document.createElement('div');
  msgDiv.id = 'ios-message';
  msgDiv.innerHTML = `
    <div style="
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.85);
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
    
    // Auto-rimuovi dopo 5 secondi se non è un messaggio importante
    if (!message.includes('Modalità dimostrativa')) {
      setTimeout(hideIOSMessage, 5000);
    }
  }
}

function hideIOSMessage() {
  const msg = document.getElementById('ios-message');
  if (msg) msg.remove();
}

// VIDEO.JS (per desktop)
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
    throw err;
  }
}

// getDirectStream ORIGINALE (per desktop)
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
    console.error("Errore getDirectStream:", error);
    showError("Errore durante l'estrazione dello stream", error.message);
    return null;
  }
}

function goBack() {
  if (player) {
    player.dispose();
    player = null;
  }
  
  if (nativeVideoElement) {
    nativeVideoElement.pause();
    nativeVideoElement.src = "";
    nativeVideoElement = null;
  }
  
  hideIOSMessage();
  
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

// FUNZIONI UTILITY
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
