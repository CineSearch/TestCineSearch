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

// VERSIONE MIGLIORATA per iOS
async function loadVideoIOS(isMovie, id, season = null, episode = null) {
  console.log("📱 iOS - Caricamento video (versione fixata)");
  showLoading(true, "iOS: ricerca stream...");

  try {
    // Recupero URL
    const streamData = await getDirectStreamIOS(id, isMovie, season, episode);

    if (!streamData || !streamData.m3u8Url) {
      throw new Error("Nessun URL HLS disponibile");
    }

    const m3u8Url = streamData.m3u8Url;
    console.log("🔗 iOS - HLS finale:", m3u8Url);

    // Ottieni elemento
    const videoElement = document.getElementById("player-video");
    if (!videoElement) {
      throw new Error("player-video non trovato");
    }

    // RESET totale iOS
    videoElement.pause();
    videoElement.removeAttribute("src");
    videoElement.load();
    videoElement.innerHTML = "";

    // Reconfigurazione per iOS
    configureVideoForIOS(videoElement);

    // Imposta SOLO src → iOS non vuole else
    videoElement.src = m3u8Url;

    // Caricamento forzato
    videoElement.load();

    // Eventi iOS
    setupIOSVideoEvents(videoElement);

    // Timeout fallback
    setTimeout(() => {
      if (videoElement.readyState === 0) {
        console.warn("⚠️ iOS: non si carica, fallback attivo");
        tryIOSStreamFallback(videoElement, m3u8Url);
      }
    }, 5000);

    // Tracking
    trackVideoProgress(id, isMovie ? "movie" : "tv", videoElement, season, episode);

    showLoading(false);

  } catch (error) {
    console.error("❌ ERRORE iOS:", error);
    showError("iOS: errore caricamento", error.message);
    showLoading(false);
  }
}

// Configurazione avanzata video per iOS
function configureVideoForIOS(videoElement) {
  // Reset e setup completo
  videoElement.autoplay = false;
  videoElement.playsInline = true;
  videoElement.webkitPlaysInline = true;
  videoElement.crossOrigin = "anonymous";
  videoElement.preload = "auto";
  videoElement.controls = true;
  
  // Stili
  videoElement.style.width = "100%";
  videoElement.style.height = "auto";
  videoElement.style.maxHeight = "70vh";
  videoElement.style.backgroundColor = "#000";
  videoElement.style.borderRadius = "12px";
  videoElement.style.display = "block";
  
  // Performance iOS
  videoElement.style.webkitTransform = "translateZ(0)";
  videoElement.style.transform = "translateZ(0)";
  videoElement.style.webkitBackfaceVisibility = "hidden";
  videoElement.style.perspective = "1000";
}

// VERSIONE DI getDirectStream PER iOS - OTTIMIZZATA PER FORMATO iOS
async function getDirectStreamIOS(tmdbId, isMovie, season = null, episode = null) {
  console.log("📱 iOS - Estrazione diretta senza proxy");

  try {
    const base = isMovie ? "movie" : "tv";
    let url = `https://${VIXSRC_URL}/${base}/${tmdbId}`;
    if (!isMovie && season !== null && episode !== null)
      url += `/${season}/${episode}`;

    console.log("🔗 URL VixSRC:", url);

    // ----- ⛔️ NIENTE PROXY -----
    const htmlRes = await fetch(url);
    if (!htmlRes.ok) throw new Error("Impossibile caricare pagina VixSRC");
    const html = await htmlRes.text();

    // ----- 🎯 ESTRAZIONE M3U8 DIRETTA -----
    const m3u8Regex = /(https?:\/\/[^"' ]+\.m3u8[^"' ]*)/gi;
    const matches = [...html.matchAll(m3u8Regex)];

    if (matches.length === 0) throw new Error("Nessun .m3u8 trovato");

    // Filtra per codec compatibili iOS
    const valid = matches.map(m => m[1]).filter(url =>
      !url.includes("h265") &&
      !url.includes("hevc") &&
      !url.includes("av1") &&
      !url.includes("vp9")
    );

    if (valid.length === 0)
      throw new Error("Trovati .m3u8 ma non compatibili iOS");

    let finalUrl = valid[0];

    // ----- 🔧 OTTIMIZZAZIONE LEGGERA -----
    if (finalUrl.startsWith("http://"))
      finalUrl = finalUrl.replace("http://", "https://");

    if (!finalUrl.includes("avc=1"))
      finalUrl += (finalUrl.includes("?") ? "&" : "?") + "avc=1";

    console.log("✅ URL finale iOS:", finalUrl);

    return { m3u8Url: finalUrl };

  } catch (e) {
    console.error("❌ Errore getDirectStreamIOS:", e);
    return {
      m3u8Url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      source: "ios_test_stream"
    };
  }
}

// Estrai URL m3u8 che potrebbero funzionare su iOS
async function extractIOSCompatibleM3u8(html, vixsrcUrl) {
  console.log("🔍 iOS - Ricerca stream compatibili");
  
  // Cerca URL che contengono parole chiave per streaming mobile
  const mobilePatterns = [
    /(https?:\/\/[^"\s]+\.m3u8[^"\s]*)/gi,
    /"url"\s*:\s*"([^"]+\.m3u8[^"]*)"/gi,
    /source\s+src\s*=\s*"([^"]+\.m3u8[^"]*)"/gi,
    /file\s*:\s*"([^"]+\.m3u8[^"]*)"/gi
  ];
  
  let foundUrls = [];
  
  for (const pattern of mobilePatterns) {
    const matches = html.match(pattern);
    if (matches) {
      matches.forEach(match => {
        let url = match.replace(/["']/g, '').split(' ')[0].split(')')[0];
        if (url.includes('.m3u8')) {
          // Filtra per URL che potrebbero funzionare su iOS
          if (!url.includes('360p') && !url.includes('480p') && 
              !url.includes('h265') && !url.includes('hevc')) {
            foundUrls.push(url);
          }
        }
      });
    }
  }
  
  // Seleziona il migliore per iOS
  if (foundUrls.length > 0) {
    // Preferisci URL che contengono:
    // 1. cloudflare (di solito funziona su iOS)
    // 2. https
    // 3. Nessun parametro strano
    for (const url of foundUrls) {
      if (url.includes('cloudflare') || url.includes('akamai')) {
        console.log("🎯 iOS - Trovato URL con CDN compatibile:", url.substring(0, 80));
        return url;
      }
    }
    
    // Altrimenti prendi il primo
    console.log("📱 iOS - Usando primo URL trovato:", foundUrls[0].substring(0, 80));
    return foundUrls[0];
  }
  
  return null;
}

// Converte URL per compatibilità iOS
async function extractAndConvertForIOS(html, vixsrcUrl) {
  console.log("🔄 iOS - Conversione stream per iOS");
  
  try {
    // Prova la logica normale
    const playlistParamsRegex = /window\.masterPlaylist[^:]+params:[^{]+({[^<]+?})/;
    const playlistParamsMatch = html.match(playlistParamsRegex);

    if (!playlistParamsMatch) {
      return null;
    }

    let playlistParamsStr = playlistParamsMatch[1]
      .replace(/'/g, '"')
      .replace(/\s+/g, " ")
      .trim();

    let playlistParams;
    try {
      playlistParams = JSON.parse(playlistParamsStr);
    } catch (e) {
      // Estrai manualmente
      const tokenMatch = playlistParamsStr.match(/"token":\s*"([^"]+)"/);
      const expiresMatch = playlistParamsStr.match(/"expires":\s*"([^"]+)"/);
      
      if (!tokenMatch || !expiresMatch) {
        return null;
      }
      
      playlistParams = {
        token: tokenMatch[1],
        expires: expiresMatch[1]
      };
    }

    const playlistUrlRegex = /window\.masterPlaylist\s*=\s*\{[\s\S]*?url:\s*'([^']+)'/;
    const playlistUrlMatch = html.match(playlistUrlRegex);

    if (!playlistUrlMatch) {
      return null;
    }

    const playlistUrl = playlistUrlMatch[1];
    const separator = playlistUrl.includes('?') ? '&' : '?';
    
    let m3u8Url = playlistUrl + separator +
      "expires=" + playlistParams.expires +
      "&token=" + playlistParams.token;
    
    // Aggiungi parametri per iOS
    m3u8Url += "&ios=1&avc=1"; // Forza AVC/H.264 per iOS
    
    console.log("🔧 iOS - URL convertito:", m3u8Url.substring(0, 100));
    return m3u8Url;
    
  } catch (error) {
    console.error("❌ iOS - Conversione fallita:", error);
    return null;
  }
}

// Ottimizza URL per iOS
async function optimizeUrlForIOS(url) {
  console.log("⚙️ iOS - Ottimizzazione URL");
  
  let optimizedUrl = url;
  
  // 1. Forza HTTPS
  if (optimizedUrl.startsWith('http://')) {
    optimizedUrl = optimizedUrl.replace('http://', 'https://');
    console.log("🔒 iOS - Forzato HTTPS");
  }
  
  // 2. Rimuovi parametri problematici per iOS
  const problematicParams = [
    'h265', 'hevc', 'vp9', 'av1', // Codec non supportati
    'dolby', 'atmos', 'hdr', // Formati avanzati
    '360p', '480p' // Qualità troppo bassa
  ];
  
  problematicParams.forEach(param => {
    if (optimizedUrl.includes(param)) {
      optimizedUrl = optimizedUrl.replace(new RegExp(`[?&]${param}=[^&]*`, 'gi'), '');
      console.log(`🗑️ iOS - Rimosso parametro ${param}`);
    }
  });
  
  // 3. Aggiungi parametri per iOS
  if (!optimizedUrl.includes('avc=1')) {
    optimizedUrl += (optimizedUrl.includes('?') ? '&' : '?') + 'avc=1';
  }
  
  if (!optimizedUrl.includes('aac=1')) {
    optimizedUrl += '&aac=1';
  }
  
  // 4. Se è un URL cloudflare, assicura formato corretto
  if (optimizedUrl.includes('cloudflare')) {
    if (!optimizedUrl.includes('/manifest/')) {
      // Ristruttura URL cloudflare
      optimizedUrl = optimizedUrl.replace('/hls/', '/manifest/');
    }
  }
  
  console.log("✅ iOS - URL ottimizzato:", optimizedUrl.substring(0, 120));
  return optimizedUrl;
}

// Servizio alternativo specifico per iOS
async function getIOSCompatibleStream(tmdbId, isMovie, season = null, episode = null) {
  console.log("🌐 iOS - Servizio alternativo per iOS");
  
  try {
    showLoading(true, "iOS: servizio alternativo...");
    
    const type = isMovie ? 'movie' : 'tv';
    
    // Servizi che forniscono HLS compatibile con iOS
    const iosServices = [
      // Service 1: Vidsrc (molto compatibile con iOS)
      `https://vidsrc.xyz/vidsrc/${tmdbId}${!isMovie ? `/${season}/${episode}` : ''}`,
      
      // Service 2: 2embed (formato mobile)
      `https://www.2embed.cc/embed/${tmdbId}${!isMovie ? `/${season}/${episode}` : ''}`,
      
      // Service 3: Autoembed
      `https://autoembed.co/${type}/tmdb/${tmdbId}${!isMovie ? `-${season}-${episode}` : ''}`
    ];
    
    for (const serviceUrl of iosServices) {
      try {
        console.log("🔗 iOS - Provo servizio:", serviceUrl);
        
        // Usa proxy per evitare CORS
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(serviceUrl)}`;
        const response = await fetch(proxyUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
          }
        });
        
        if (response.ok) {
          const html = await response.text();
          
          // Cerca stream HLS compatibile
          const hlsPattern = /(https?:\/\/[^"\s]+\.m3u8[^"\s]*)/gi;
          const matches = html.match(hlsPattern);
          
          if (matches && matches.length > 0) {
            // Prendi il primo che sembra valido
            for (const match of matches) {
              let url = match.replace(/["']/g, '').split(' ')[0];
              if (url.includes('.m3u8') && 
                  !url.includes('h265') && 
                  !url.includes('hevc')) {
                
                // Ottimizza per iOS
                url = await optimizeUrlForIOS(url);
                
                console.log("✅ iOS - Trovato stream compatibile:", url.substring(0, 100));
                
                return {
                  m3u8Url: url,
                  source: 'ios_service'
                };
              }
            }
          }
        }
      } catch (serviceError) {
        console.log("❌ iOS - Servizio fallito:", serviceError.message);
        continue;
      }
    }
    
    throw new Error("Nessun servizio alternativo disponibile");
    
  } catch (error) {
    console.error("❌ iOS - Tutti i servizi falliti:", error);
    
    // Ultima risorsa: stream di test garantito
    return {
      m3u8Url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      source: 'ios_test_stream'
    };
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
    console.error("❌ iOS - Errore video DETTAGLIATO:");
    console.error("1. Error object:", videoElement.error);
    console.error("2. Error code:", videoElement.error?.code);
    console.error("3. Error message:", videoElement.error?.message);
    console.error("4. Current src:", videoElement.src);
    console.error("5. Network state:", videoElement.networkState);
    console.error("6. Ready state:", videoElement.readyState);
    
    showLoading(false);
    
    let errorMsg = "Errore sconosciuto";
    let errorCode = videoElement.error?.code;
    
    if (errorCode) {
      switch(errorCode) {
        case 1: 
          errorMsg = "MEDIA_ERR_ABORTED - Riproduzione annullata";
          break;
        case 2: 
          errorMsg = "MEDIA_ERR_NETWORK - Errore di rete o CORS";
          break;
        case 3: 
          errorMsg = "MEDIA_ERR_DECODE - Formato video non supportato da iOS";
          break;
        case 4: 
          errorMsg = "MEDIA_ERR_SRC_NOT_SUPPORTED - Formato HLS non compatibile";
          break;
      }
    }
    
    // DEBUG: Testa se l'URL è accessibile
    testM3u8Url(videoElement.src).then(isAccessible => {
      if (!isAccessible) {
        errorMsg += "<br>⚠️ L'URL non è accessibile da iOS";
      }
    });
    
    showError("iOS: Errore riproduzione", 
      `${errorMsg}<br><br>
       <strong>Cosa provare:</strong><br>
       1. Tocca il video per riprovare<br>
       2. Prova un altro film/serie<br>
       3. Controlla la connessione internet`);
    
    // Tenta fallback automatico dopo 3 secondi
    setTimeout(() => {
      tryIOSStreamFallback(videoElement);
    }, 3000);
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

// Funzione per testare se l'URL m3u8 è accessibile
async function testM3u8Url(url) {
  try {
    // Prova una richiesta HEAD per vedere se l'URL è raggiungibile
    const response = await fetch(url, { 
      method: 'HEAD',
      mode: 'no-cors' // no-cors per evitare problemi CORS nel test
    });
    return true;
  } catch (error) {
    console.log("❌ Test URL fallito:", error.message);
    return false;
  }
}

// Fallback automatico per iOS
async function tryIOSStreamFallback(videoElement) {
  console.log("🔄 iOS - Attivazione fallback automatico");
  
  try {
    // 1. Prova a forzare HTTPS se non già presente
    let currentUrl = videoElement.src;
    if (currentUrl.startsWith('http://')) {
      currentUrl = currentUrl.replace('http://', 'https://');
      console.log("🔒 iOS - Fallback: forzato HTTPS");
      videoElement.src = currentUrl;
      videoElement.load();
      return;
    }
    
    // 2. Prova a cambiare user agent nel URL (se supportato dal server)
    if (currentUrl.includes('vixsrc')) {
      // Aggiungi parametro per mobile
      const separator = currentUrl.includes('?') ? '&' : '?';
      const mobileUrl = currentUrl + separator + 'ios=1&mobile=1';
      console.log("📱 iOS - Fallback: URL per mobile");
      videoElement.src = mobileUrl;
      videoElement.load();
      return;
    }
    
    // 3. Prova stream di test garantito
    console.log("📺 iOS - Fallback: stream di test");
    const testStreams = [
      "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", // MPEG-TS H.264
      "https://content.jwplatform.com/manifests/vM7nH0Kl.m3u8", // H.264 AAC
      "https://moctobpltc-i.akamaihd.net/hls/live/571329/eight/playlist.m3u8" // Live stream
    ];
    
    const testStream = testStreams[0]; // Usa il primo
    showIOSMessage("🔄 Provo stream alternativo...");
    
    videoElement.src = testStream;
    videoElement.load();
    
    // Cambia titolo per indicare modalità test
    const currentTitle = document.getElementById("player-title").textContent;
    if (!currentTitle.includes("(Modalità test)")) {
      document.getElementById("player-title").textContent = currentTitle + " (Modalità test)";
    }
    
  } catch (fallbackError) {
    console.error("❌ iOS - Fallback fallito:", fallbackError);
    showError("iOS: Fallback fallito", "Impossibile trovare uno stream compatibile");
  }
}

// Helper per mostrare messaggi iOS
function showIOSMessage(message) {
  // Rimuovi messaggi precedenti
  const oldMsg = document.getElementById('ios-status-message');
  if (oldMsg) oldMsg.remove();
  
  const msgDiv = document.createElement('div');
  msgDiv.id = 'ios-status-message';
  msgDiv.innerHTML = `
    <div style="
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.9);
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      text-align: center;
      z-index: 9999;
      max-width: 90%;
      border: 2px solid #e50914;
      font-size: 14px;
      backdrop-filter: blur(10px);
    ">
      ${message}
    </div>
  `;
  
  const videoContainer = document.querySelector(".video-container");
  if (videoContainer) {
    videoContainer.appendChild(msgDiv);
    setTimeout(() => msgDiv.remove(), 5000);
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
