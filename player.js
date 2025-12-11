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
  console.log("📱 iOS - Caricamento video nativo");
  
  try {
    // Ottieni dati stream (senza proxy per iOS)
    const streamData = await getStreamData(isMovie, id, season, episode, false);
    
    if (!streamData || !streamData.m3u8Url) {
      throw new Error("Nessun stream disponibile");
    }
    
    let m3u8Url = streamData.m3u8Url;
    console.log("📱 iOS - URL ricevuto:", m3u8Url);
    
    // Preparazione elemento video
    const videoContainer = document.querySelector(".video-container");
    
    // Rimuovi video precedenti
    const oldVideo = document.getElementById("player-video");
    if (oldVideo) oldVideo.remove();
    
    // Crea nuovo elemento video
    const videoElement = document.createElement("video");
    videoElement.id = "player-video";
    videoElement.style.cssText = `
      width: 100%;
      height: auto;
      aspect-ratio: 16/9;
      background: #000;
      border-radius: 12px;
    `;
    
    // Imposta attributi per iOS
    videoElement.setAttribute('controls', '');
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('webkit-playsinline', '');
    videoElement.setAttribute('preload', 'auto');
    videoElement.crossOrigin = "anonymous";
    
    // Aggiungi al DOM
    videoContainer.insertBefore(videoElement, document.getElementById("loading-overlay"));
    
    // Imposta sorgente con event listener
    videoElement.addEventListener('loadedmetadata', () => {
      console.log("📱 iOS - Metadata caricati");
      showLoading(false);
      
      // Prova a far partire il video (muted per iOS)
      videoElement.muted = true;
      videoElement.play().catch(e => {
        console.log("📱 iOS - Autoplay bloccato, aspetta interazione utente");
      });
    });
    
    videoElement.addEventListener('canplay', () => {
      console.log("📱 iOS - Video pronto");
      showLoading(false);
    });
    
    videoElement.addEventListener('error', (e) => {
      console.error("📱 iOS - Errore video:", videoElement.error);
      showLoading(false);
      showError(
        "Errore riproduzione iOS",
        `Codice: ${videoElement.error?.code || 'N/A'}<br>
         Messaggio: ${videoElement.error?.message || 'Errore sconosciuto'}`
      );
    });
    
    // Imposta la sorgente
    videoElement.src = m3u8Url;
    
    // Tracciamento progresso
    trackVideoProgress(
      id,
      isMovie ? "movie" : "tv",
      videoElement,
      season,
      episode
    );
    
  } catch (error) {
    console.error("📱 iOS - Errore loadVideoNative:", error);
    showError("Errore iOS", error.message);
    showLoading(false);
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

async function getStreamData(isMovie, id, season = null, episode = null, useProxy = false) {
  try {
    showLoading(true, "Recupero dati stream...");
    
    console.log("🔍 Inizio estrazione stream per:", { isMovie, id, season, episode });
    
    // Crea URL vixsrc
    let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${id}`;
    if (!isMovie && season !== null && episode !== null) {
      vixsrcUrl += `/${season}/${episode}`;
    }
    
    console.log("🔗 URL target:", vixsrcUrl);
    
    // Su iOS, evitiamo proxy il più possibile
    let html;
    let finalUrl = vixsrcUrl;
    
    // Strategia di fetch per iOS
    if (shouldUseNativePlayer()) {
      try {
        console.log("📱 iOS - Tentativo fetch diretta");
        const response = await fetch(finalUrl, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'Accept-Language': 'it-IT,it;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache'
          },
          mode: 'no-cors' // Prova no-cors per evitare problemi CORS
        });
        
        if (response.ok || response.type === 'opaque') {
          html = await response.text();
          console.log("✅ iOS - Fetch diretta riuscita");
        } else {
          throw new Error("Fetch diretta fallita");
        }
      } catch (directError) {
        console.log("⚠️ iOS - Fallback a proxy CORS");
        finalUrl = applyCorsProxy(vixsrcUrl);
        const proxyResponse = await fetch(finalUrl);
        html = await proxyResponse.text();
      }
    } else {
      // Per altri browser
      finalUrl = useProxy ? applyCorsProxy(vixsrcUrl) : vixsrcUrl;
      const response = await fetch(finalUrl);
      html = await response.text();
    }
    
    if (!html) {
      throw new Error("Pagina vuota o non raggiungibile");
    }
    
    console.log("📄 Dimensione HTML:", html.length, "caratteri");
    
    // SALVA PER DEBUG (utile per analisi)
    if (shouldUseNativePlayer()) {
      console.log("📝 HTML ricevuto (primi 1000 caratteri):", html.substring(0, 1000));
    }
    
    // METODO 1: Cerca direttamente l'URL m3u8 in vari formati
    const m3u8Urls = extractM3U8Urls(html);
    
    if (m3u8Urls.length > 0) {
      console.log("🎯 Trovati URL m3u8:", m3u8Urls);
      
      // Prendi il primo URL valido
      let m3u8Url = m3u8Urls[0];
      
      // Assicura HTTPS per iOS
      if (shouldUseNativePlayer() && m3u8Url.startsWith('http://')) {
        m3u8Url = m3u8Url.replace('http://', 'https://');
      }
      
      // Verifica che sia un URL valido
      if (m3u8Url.includes('.m3u8')) {
        console.log("✅ URL m3u8 valido trovato:", m3u8Url);
        
        showLoading(false);
        return {
          iframeUrl: vixsrcUrl,
          m3u8Url: m3u8Url,
          source: 'direct_extraction'
        };
      }
    }
    
    // METODO 2: Cerca i parametri della playlist
    console.log("🔍 Tentativo metodo 2 - Estrazione parametri");
    
    // Pattern più flessibili per i parametri
    const paramPatterns = [
      /(?:params|parameters|data):?\s*({[^}]+})/,
      /window\.masterPlaylist\s*=\s*\{[^}]+\}/,
      /"params"\s*:\s*({[^}]+})/,
      /'params'\s*:\s*({[^}]+})/,
      /params\s*=\s*({[^}]+})/,
      /var\s+params\s*=\s*({[^}]+})/,
      /let\s+params\s*=\s*({[^}]+})/
    ];
    
    let paramsString = null;
    for (const pattern of paramPatterns) {
      const match = html.match(pattern);
      if (match) {
        paramsString = match[1] || match[0];
        console.log("📝 Parametri trovati con pattern:", pattern);
        break;
      }
    }
    
    if (!paramsString) {
      // Ultimo tentativo: cerca qualsiasi oggetto JSON che assomigli a params
      const jsonPattern = /{[^{]*?(?:expires|token|e|t)[^{]*?:[^{]*?[0-9a-fA-F]+[^{]*?}/g;
      const jsonMatches = html.match(jsonPattern);
      if (jsonMatches && jsonMatches.length > 0) {
        paramsString = jsonMatches[0];
        console.log("📝 Parametri trovati con ricerca JSON generica");
      }
    }
    
    if (paramsString) {
      console.log("📝 Stringa parametri grezza:", paramsString);
      
      let playlistParams;
      try {
        // Pulisci e converte in JSON
        let cleanParams = paramsString
          .replace(/window\.masterPlaylist\s*=\s*\{/, '{')
          .replace(/params:\s*/, '')
          .replace(/'/g, '"')
          .replace(/(\w+):/g, '"$1":')
          .replace(/,(\s*})/g, '$1')
          .replace(/,\s*$/, '');
        
        playlistParams = JSON.parse(cleanParams);
        console.log("✅ Parametri parsati:", playlistParams);
      } catch (parseError) {
        console.error("❌ Errore parsing JSON:", parseError);
        
        // Fallback: estrai token e expires manualmente
        const tokenMatch = paramsString.match(/(?:token|t):\s*['"]?([0-9a-fA-F]+)['"]?/);
        const expiresMatch = paramsString.match(/(?:expires|e):\s*['"]?([0-9]+)['"]?/);
        
        playlistParams = {
          token: tokenMatch ? tokenMatch[1] : '',
          expires: expiresMatch ? expiresMatch[1] : ''
        };
        
        console.log("⚠️ Parametri estratti manualmente:", playlistParams);
      }
      
      // Cerca URL base
      const urlPatterns = [
        /(?:url|source):\s*['"]([^'"]+)['"]/,
        /window\.masterPlaylist[^}]+url:\s*['"]([^'"]+)['"]/,
        /masterPlaylist[^}]+url:\s*['"]([^'"]+)['"]/,
        /"url":\s*"([^"]+)"/,
        /'url':\s*'([^']+)'/
      ];
      
      let baseUrl = null;
      for (const pattern of urlPatterns) {
        const match = html.match(pattern);
        if (match) {
          baseUrl = match[1];
          console.log("🔗 URL base trovato:", baseUrl);
          break;
        }
      }
      
      if (baseUrl && playlistParams.token && playlistParams.expires) {
        // Costruisci URL finale
        const separator = baseUrl.includes('?') ? '&' : '?';
        let m3u8Url = baseUrl + separator + 
          `expires=${playlistParams.expires}&token=${playlistParams.token}`;
        
        // Aggiungi parametro qualità se disponibile
        if (playlistParams.h || html.includes('canPlayFHD')) {
          m3u8Url += '&h=1';
        }
        
        // HTTPS per iOS
        if (shouldUseNativePlayer() && m3u8Url.startsWith('http://')) {
          m3u8Url = m3u8Url.replace('http://', 'https://');
        }
        
        console.log("✅ URL finale costruito:", m3u8Url);
        
        showLoading(false);
        return {
          iframeUrl: vixsrcUrl,
          m3u8Url: m3u8Url,
          source: 'params_extraction'
        };
      }
    }
    
    // METODO 3: Fallback - Prova con un proxy alternativo
    console.log("🔄 Tentativo metodo 3 - Proxy alternativo");
    
    try {
      const proxyFallbackUrl = `https://corsproxy.io/?${encodeURIComponent(vixsrcUrl)}`;
      const proxyResponse = await fetch(proxyFallbackUrl);
      const proxyHtml = await proxyResponse.text();
      
      // Riprova l'estrazione con l'HTML dal proxy
      const fallbackUrls = extractM3U8Urls(proxyHtml);
      
      if (fallbackUrls.length > 0) {
        let fallbackUrl = fallbackUrls[0];
        
        if (shouldUseNativePlayer() && fallbackUrl.startsWith('http://')) {
          fallbackUrl = fallbackUrl.replace('http://', 'https://');
        }
        
        console.log("✅ URL fallback trovato:", fallbackUrl);
        
        showLoading(false);
        return {
          iframeUrl: vixsrcUrl,
          m3u8Url: fallbackUrl,
          source: 'proxy_fallback'
        };
      }
    } catch (proxyError) {
      console.error("❌ Fallback proxy fallito:", proxyError);
    }
    
    // Se arriviamo qui, tutti i metodi hanno fallito
    throw new Error("Impossibile estrarre i parametri dello stream dopo tutti i tentativi");
    
  } catch (error) {
    showLoading(false);
    console.error("💥 Errore fatale in getStreamData:", error);
    
    // Messaggio di errore più utile
    let errorMessage = "Impossibile estrarre i parametri dello stream";
    let errorDetails = error.message;
    
    if (shouldUseNativePlayer()) {
      errorMessage = "Errore su iOS/Safari";
      errorDetails = "Il sito potrebbe non essere accessibile dal tuo dispositivo. Prova con una connessione diversa.";
    }
    
    showError(errorMessage, errorDetails);
    
    // Tenta un ultimo fallback
    return await tryUltimateFallback(isMovie, id, season, episode);
  }
}

// Funzione helper per estrarre URL m3u8
function extractM3U8Urls(html) {
  const urls = [];
  
  // Pattern per trovare URL m3u8
  const patterns = [
    /https?:\/\/[^\s"']+\.m3u8[^\s"']*/g,
    /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/g,
    /source:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/g,
    /file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/g,
    /src:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/g
  ];
  
  for (const pattern of patterns) {
    const matches = html.match(pattern);
    if (matches) {
      matches.forEach(match => {
        // Pulisci l'URL
        let cleanUrl = match.replace(/["']/g, '');
        
        // Assicurati che sia un URL completo
        if (cleanUrl.startsWith('http') && cleanUrl.includes('.m3u8')) {
          // Rimuovi parametri extra
          cleanUrl = cleanUrl.split('"')[0].split("'")[0].split(' ')[0];
          urls.push(cleanUrl);
        }
      });
    }
  }
  
  // Rimuovi duplicati
  return [...new Set(urls)];
}

// Ultimo fallback
async function tryUltimateFallback(isMovie, id, season, episode) {
  try {
    console.log("🆘 Tentativo fallback estremo");
    
    // Prova con un endpoint alternativo
    const tmdbType = isMovie ? 'movie' : 'tv';
    const fallbackApi = `https://vixsrc-proxy.vercel.app/api/stream?tmdb=${id}&type=${tmdbType}`;
    
    if (!isMovie) {
      fallbackApi += `&season=${season || 1}&episode=${episode || 1}`;
    }
    
    const response = await fetch(fallbackApi);
    if (response.ok) {
      const data = await response.json();
      if (data.url) {
        console.log("🎉 Fallback riuscito con URL:", data.url);
        return {
          iframeUrl: `https://vixsrc.to/${tmdbType}/${id}`,
          m3u8Url: data.url,
          source: 'ultimate_fallback'
        };
      }
    }
  } catch (fallbackError) {
    console.error("❌ Fallback estremo fallito:", fallbackError);
  }
  
  return null;
}
async function tryUltimateFallback(isMovie, id, season, episode) {
  try {
    console.log("🆘 Tentativo fallback estremo");
    
    // Prova con un endpoint alternativo
    const tmdbType = isMovie ? 'movie' : 'tv';
    const fallbackApi = `https://vixsrc-proxy.vercel.app/api/stream?tmdb=${id}&type=${tmdbType}`;
    
    if (!isMovie) {
      fallbackApi += `&season=${season || 1}&episode=${episode || 1}`;
    }
    
    const response = await fetch(fallbackApi);
    if (response.ok) {
      const data = await response.json();
      if (data.url) {
        console.log("🎉 Fallback riuscito con URL:", data.url);
        return {
          iframeUrl: `https://vixsrc.to/${tmdbType}/${id}`,
          m3u8Url: data.url,
          source: 'ultimate_fallback'
        };
      }
    }
  } catch (fallbackError) {
    console.error("❌ Fallback estremo fallito:", fallbackError);
  }
  
  return null;
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