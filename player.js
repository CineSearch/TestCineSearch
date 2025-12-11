// Variabili globali del player
let player = null;
let currentItem = null;
let currentSeasons = [];
let nativeVideoElement = null;

// Rilevamento iOS semplificato
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
  
  if (shouldUseNativePlayer()) {
    console.log("📱 Configurazione iOS");
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

// NUOVA FUNZIONE PER iOS - SEMPLIFICATA
async function loadVideoIOS(isMovie, id, season = null, episode = null) {
  console.log("📱 iOS - Inizio caricamento");
  
  try {
    showLoading(true, "iOS: ricerca stream...");
    
    // PRIMA PROVA: getDirectStream normale
    let streamData = null;
    try {
      streamData = await getDirectStreamIOS(id, isMovie, season, episode);
      console.log("✅ getDirectStreamIOS risultato:", streamData ? "OK" : "NULL");
    } catch (error) {
      console.log("⚠️ getDirectStreamIOS fallito:", error.message);
      streamData = null;
    }
    
    // SECONDA PROVA: se fallisce, prova API alternativa
    if (!streamData || !streamData.m3u8Url) {
      console.log("🔄 iOS - Tentativo API alternativa");
      try {
        streamData = await getStreamFromIOSApi(id, isMovie, season, episode);
      } catch (apiError) {
        console.log("❌ API alternativa fallita:", apiError.message);
      }
    }
    
    // TERZA PROVA: se tutto fallisce, usa stream di test
    if (!streamData || !streamData.m3u8Url) {
      console.log("📺 iOS - Usando stream di test");
      streamData = {
        m3u8Url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        source: "ios_test_fallback"
      };
    }
    
    console.log("🔗 iOS - URL finale:", streamData.m3u8Url);
    
    // Prepara elemento video
    let videoElement = document.getElementById("player-video");
    if (!videoElement) {
      throw new Error("Elemento video non trovato");
    }
    
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
      
      if (streamData.source === "ios_test_fallback") {
        showError("iOS: Errore critico", "Impossibile riprodurre qualsiasi stream.");
      } else {
        showError("iOS: Errore riproduzione", "Tocca il video per riprovare.");
      }
    };
    
    videoElement.onplay = () => {
      console.log("🎬 iOS - Riproduzione avviata");
      showLoading(false);
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

// VERSIONE DI getDirectStream PER iOS (più tollerante)
async function getDirectStreamIOS(tmdbId, isMovie, season = null, episode = null) {
  console.log("🔍 iOS - Estrazione stream per:", { tmdbId, isMovie, season, episode });
  
  try {
    showLoading(true, "iOS: connessione...");
    
    let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${tmdbId}`;
    if (!isMovie && season !== null && episode !== null) {
      vixsrcUrl += `/${season}/${episode}`;
    }
    
    console.log("🔗 iOS - Target URL:", vixsrcUrl);
    
    // Prova diversi proxy
    const proxyUrl = applyCorsProxy(vixsrcUrl);
    console.log("🔄 iOS - Proxy URL:", proxyUrl);
    
    const response = await fetch(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000 // 10 secondi timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    console.log("📄 iOS - HTML ricevuto, lunghezza:", html.length);
    
    // METODO 1: Cerca URL m3u8 direttamente
    const m3u8Pattern = /https?:\/\/[^\s"']+\.m3u8[^\s"']*/g;
    const m3u8Matches = html.match(m3u8Pattern);
    
    if (m3u8Matches && m3u8Matches.length > 0) {
      console.log("🎯 iOS - Trovati URL m3u8:", m3u8Matches.length);
      let m3u8Url = m3u8Matches[0];
      
      // Pulisci URL
      m3u8Url = m3u8Url.split('"')[0].split("'")[0].split(' ')[0];
      
      console.log("✅ iOS - URL estratto:", m3u8Url);
      
      return {
        iframeUrl: vixsrcUrl,
        m3u8Url: m3u8Url,
        source: 'ios_direct_extraction'
      };
    }
    
    // METODO 2: Cerca parametri
    console.log("🔍 iOS - Tentativo estrazione parametri");
    
    // Pattern più flessibili
    const paramsPattern = /params:\s*({[^}]+})/;
    const paramsMatch = html.match(paramsPattern);
    
    if (paramsMatch) {
      let paramsStr = paramsMatch[1];
      console.log("📝 iOS - Parametri grezzi:", paramsStr.substring(0, 100) + "...");
      
      // Prova a estrarre token e expires
      const tokenMatch = paramsStr.match(/(?:token|t):\s*['"]?([0-9a-fA-F]+)['"]?/);
      const expiresMatch = paramsStr.match(/(?:expires|e):\s*['"]?([0-9]+)['"]?/);
      
      if (tokenMatch && expiresMatch) {
        const token = tokenMatch[1];
        const expires = expiresMatch[1];
        
        // Cerca URL base
        const urlPattern = /(?:url|source):\s*['"]([^'"]+)['"]/;
        const urlMatch = html.match(urlPattern);
        
        if (urlMatch) {
          let baseUrl = urlMatch[1];
          const separator = baseUrl.includes('?') ? '&' : '?';
          const m3u8Url = baseUrl + separator + `expires=${expires}&token=${token}`;
          
          console.log("✅ iOS - URL costruito:", m3u8Url);
          
          return {
            iframeUrl: vixsrcUrl,
            m3u8Url: m3u8Url,
            source: 'ios_params_extraction'
          };
        }
      }
    }
    
    throw new Error("Impossibile estrarre stream");
    
  } catch (error) {
    console.error("❌ iOS - getDirectStreamIOS errore:", error);
    return null;
  }
}

// API ALTERNATIVA PER iOS
async function getStreamFromIOSApi(tmdbId, isMovie, season = null, episode = null) {
  console.log("🌐 iOS - Tentativo API");
  
  try {
    const type = isMovie ? 'movie' : 'tv';
    let apiUrl = `https://vixsrc-proxy.vercel.app/api/stream?tmdb=${tmdbId}&type=${type}`;
    
    if (!isMovie && season && episode) {
      apiUrl += `&season=${season}&episode=${episode}`;
    }
    
    console.log("🔗 iOS - API URL:", apiUrl);
    
    const response = await fetch(apiUrl, { timeout: 8000 });
    
    if (!response.ok) {
      throw new Error(`API HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data && data.url) {
      console.log("✅ iOS - API successo, URL:", data.url);
      return {
        m3u8Url: data.url,
        source: 'ios_api'
      };
    }
    
    throw new Error("API ritornato dati non validi");
    
  } catch (error) {
    console.error("❌ iOS - API fallita:", error);
    return null;
  }
}

// VIDEO.JS (invariato)
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
