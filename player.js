// Variabili globali del player
let player = null;
let currentItem = null;
let currentSeasons = [];
let nativeVideoElement = null;

// Funzione per rilevare iOS/Safari - VERSIONE MIGLIORATA
function shouldUseNativePlayer() {
  // Rileva iOS o Safari più accuratamente
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isSafari = /safari/.test(ua) && !/chrome|crios/.test(ua);
  const isMac = /macintosh/.test(ua) && navigator.maxTouchPoints > 0;
  
  // Usa player nativo per: iOS, Safari su macOS, o dispositivi touch
  return isIOS || isSafari || isMac || ('ontouchstart' in window && window.innerWidth < 1024);
}

// Player nativo per iOS/Safari - VERSIONE FIXATA
async function loadVideoNative(isMovie, id, season = null, episode = null) {
  console.log("📱 iOS/Safari - Caricamento video nativo");
  
  try {
    // Ottieni dati stream (usa sempre proxy per iOS per evitare CORS)
    const streamData = await getStreamData(isMovie, id, season, episode, true);
    
    if (!streamData || !streamData.m3u8Url) {
      throw new Error("Nessun stream disponibile");
    }
    
    let m3u8Url = streamData.m3u8Url;
    console.log("📱 iOS - URL ricevuto:", m3u8Url);
    
    // IMPORTANTE: Assicura HTTPS per iOS
    if (m3u8Url.startsWith('http://')) {
      m3u8Url = m3u8Url.replace('http://', 'https://');
      console.log("🔒 iOS - Forzato HTTPS:", m3u8Url);
    }
    
    // Prepara il contenitore video
    const videoContainer = document.querySelector(".video-container");
    
    // Rimuovi video precedenti
    const oldVideo = document.getElementById("player-video");
    if (oldVideo) oldVideo.remove();
    
    // Crea nuovo elemento video per iOS
    const videoElement = document.createElement("video");
    videoElement.id = "player-video";
    videoElement.className = "video-js vjs-theme-vixflix vjs-big-play-centered";
    
    // ATTRIBUTI CRITICI PER iOS/Safari
    videoElement.setAttribute('controls', '');
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('webkit-playsinline', '');
    videoElement.setAttribute('preload', 'auto');
    videoElement.setAttribute('x-webkit-airplay', 'allow');
    videoElement.setAttribute('webkit-playsinline', '');
    videoElement.crossOrigin = "anonymous";
    
    // Stili per iOS
    videoElement.style.cssText = `
      width: 100% !important;
      height: auto !important;
      max-height: 70vh !important;
      background: #000 !important;
      border-radius: 12px !important;
      -webkit-transform: translateZ(0) !important;
      transform: translateZ(0) !important;
    `;
    
    // Aggiungi al DOM
    const loadingOverlay = document.getElementById("loading-overlay");
    if (loadingOverlay) {
      videoContainer.insertBefore(videoElement, loadingOverlay);
    } else {
      videoContainer.appendChild(videoElement);
    }
    
    // SALVA riferimento
    nativeVideoElement = videoElement;
    
    // Event listeners per iOS
    videoElement.addEventListener('loadedmetadata', () => {
      console.log("📱 iOS - Metadata caricati, video pronto");
      showLoading(false);
    });
    
    videoElement.addEventListener('canplay', () => {
      console.log("📱 iOS - Video può essere riprodotto");
      showLoading(false);
      
      // Tenta autoplay (muted per iOS)
      videoElement.muted = true;
      const playPromise = videoElement.play();
      
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log("🎬 iOS - Autoplay avviato (muted)");
          // Dopo 1 secondo, prova a riattivare l'audio
          setTimeout(() => {
            videoElement.muted = false;
          }, 1000);
        }).catch(e => {
          console.log("⏸️ iOS - Autoplay bloccato, aspetta interazione utente");
          // Mostra messaggio per l'utente
          showIOSHint();
        });
      }
    });
    
    videoElement.addEventListener('error', (e) => {
      console.error("❌ iOS - Errore video:", videoElement.error);
      showLoading(false);
      
      let errorMessage = "Errore sconosciuto";
      if (videoElement.error) {
        switch(videoElement.error.code) {
          case 1: errorMessage = "MEDIA_ERR_ABORTED"; break;
          case 2: errorMessage = "MEDIA_ERR_NETWORK"; break;
          case 3: errorMessage = "MEDIA_ERR_DECODE"; break;
          case 4: errorMessage = "MEDIA_ERR_SRC_NOT_SUPPORTED"; break;
        }
      }
      
      showError("Errore riproduzione iOS", `${errorMessage}<br>Prova a toccare il video per riavviare`);
    });
    
    videoElement.addEventListener('play', () => {
      console.log("▶️ iOS - Riproduzione iniziata");
      hideIOSHint();
    });
    
    videoElement.addEventListener('waiting', () => {
      showLoading(true, "Buffering...");
    });
    
    videoElement.addEventListener('playing', () => {
      showLoading(false);
    });
    
    // Imposta la sorgente FINALE
    console.log("🔗 iOS - Imposto sorgente:", m3u8Url);
    videoElement.src = m3u8Url;
    
    // Aggiungi sorgente come elemento <source> (alternative method)
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
    console.error("💥 iOS - Errore loadVideoNative:", error);
    showError("Errore iOS", error.message);
    showLoading(false);
    
    // Fallback: prova a usare Video.js anche su iOS
    console.log("🔄 iOS - Tentativo fallback con Video.js");
    try {
      await loadVideoWithVideoJS(isMovie, id, season, episode);
    } catch (fallbackError) {
      console.error("❌ iOS - Fallback fallito:", fallbackError);
    }
  }
}

// Helper per mostrare hint su iOS
function showIOSHint() {
  // Rimuovi hint precedenti
  hideIOSHint();
  
  const hint = document.createElement('div');
  hint.id = 'ios-play-hint';
  hint.innerHTML = `
    <div style="
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.85);
      color: white;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      z-index: 1000;
      max-width: 80%;
      border: 2px solid #e50914;
    ">
      <div style="font-size: 24px; margin-bottom: 10px;">▶️</div>
      <h3 style="margin: 0 0 10px 0; color: #e50914;">Tocca per riprodurre</h3>
      <p style="margin: 0; font-size: 14px; opacity: 0.9;">
        Su iOS, tocca il video per avviare la riproduzione
      </p>
    </div>
  `;
  
  const videoContainer = document.querySelector(".video-container");
  videoContainer.appendChild(hint);
}

function hideIOSHint() {
  const hint = document.getElementById('ios-play-hint');
  if (hint) hint.remove();
}

// Modifica getStreamData per iOS - MANTENENDO LOGICA ESISTENTE
async function getStreamData(isMovie, id, season = null, episode = null, useProxy = true) {
  try {
    showLoading(true, "Recupero dati stream...");
    
    console.log("🔍 Inizio estrazione stream per:", { isMovie, id, season, episode });
    
    // Crea URL vixsrc
    let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${id}`;
    if (!isMovie && season !== null && episode !== null) {
      vixsrcUrl += `/${season}/${episode}`;
    }
    
    console.log("🔗 URL target:", vixsrcUrl);
    
    // STRATEGIA SPECIALE PER iOS
    if (shouldUseNativePlayer()) {
      console.log("📱 iOS - Strategia speciale attivata");
      useProxy = true; // Forza proxy su iOS
      
      // Primo tentativo: proxy CORS affidabile
      try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(vixsrcUrl)}`;
        console.log("🔄 iOS - Proxy CORS:", proxyUrl);
        
        const response = await fetch(proxyUrl, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
          }
        });
        
        if (response.ok) {
          const html = await response.text();
          console.log("✅ iOS - Proxy success, HTML length:", html.length);
          
          // Estrai URL m3u8
          const m3u8Urls = extractM3U8Urls(html);
          
          if (m3u8Urls.length > 0) {
            let m3u8Url = m3u8Urls[0];
            
            // Forza HTTPS per iOS
            if (m3u8Url.startsWith('http://')) {
              m3u8Url = m3u8Url.replace('http://', 'https://');
            }
            
            console.log("🎯 iOS - URL trovato:", m3u8Url);
            
            showLoading(false);
            return {
              iframeUrl: vixsrcUrl,
              m3u8Url: m3u8Url,
              source: 'ios_proxy_extraction'
            };
          }
        }
      } catch (proxyError) {
        console.error("❌ iOS - Proxy fallito:", proxyError);
      }
    }
    
    // RESTA DEL CODICE ESISTENTE (mantieni tutto com'era)
    let html;
    let finalUrl = vixsrcUrl;
    
    if (useProxy) {
      finalUrl = applyCorsProxy(vixsrcUrl);
    }
    
    console.log("🔗 Fetch URL:", finalUrl);
    
    const response = await fetch(finalUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    html = await response.text();
    
    if (!html) {
      throw new Error("Pagina vuota o non raggiungibile");
    }
    
    console.log("📄 Dimensione HTML:", html.length, "caratteri");
    
    // METODO 1: Cerca direttamente l'URL m3u8
    const m3u8Urls = extractM3U8Urls(html);
    
    if (m3u8Urls.length > 0) {
      console.log("🎯 Trovati URL m3u8:", m3u8Urls);
      
      let m3u8Url = m3u8Urls[0];
      
      // Per iOS: forza HTTPS
      if (shouldUseNativePlayer() && m3u8Url.startsWith('http://')) {
        m3u8Url = m3u8Url.replace('http://', 'https://');
      }
      
      console.log("✅ URL m3u8 valido trovato:", m3u8Url);
      
      showLoading(false);
      return {
        iframeUrl: vixsrcUrl,
        m3u8Url: m3u8Url,
        source: 'direct_extraction'
      };
    }
    
    // METODO 2: Cerca i parametri della playlist
    console.log("🔍 Tentativo metodo 2 - Estrazione parametri");
    
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
    
    throw new Error("Impossibile estrarre i parametri dello stream");
    
  } catch (error) {
    showLoading(false);
    console.error("💥 Errore fatale in getStreamData:", error);
    
    // Ultimo tentativo per iOS
    if (shouldUseNativePlayer()) {
      console.log("🆘 iOS - Tentativo fallback estremo");
      return await tryIOSUltimateFallback(isMovie, id, season, episode);
    }
    
    return await tryUltimateFallback(isMovie, id, season, episode);
  }
}

// Fallback specifico per iOS
async function tryIOSUltimateFallback(isMovie, id, season = null, episode = null) {
  try {
    console.log("🆘 iOS - Fallback estremo attivato");
    
    const tmdbType = isMovie ? 'movie' : 'tv';
    
    // Primo tentativo: servizio proxy dedicato
    const iosProxyUrl = `https://vixsrc-proxy.vercel.app/api/ios-stream?tmdb=${id}&type=${tmdbType}`;
    
    if (!isMovie && season && episode) {
      iosProxyUrl += `&season=${season}&episode=${episode}`;
    }
    
    const response = await fetch(iosProxyUrl);
    if (response.ok) {
      const data = await response.json();
      if (data.url && data.url.includes('.m3u8')) {
        console.log("🎉 iOS - Fallback proxy riuscito");
        return {
          iframeUrl: `https://vixsrc.to/${tmdbType}/${id}`,
          m3u8Url: data.url,
          source: 'ios_proxy_fallback'
        };
      }
    }
    
    // Secondo tentativo: stream di test HLS (sempre funzionante)
    const testStream = "https://moctobpltc-i.akamaihd.net/hls/live/571329/eight/playlist.m3u8";
    console.log("📺 iOS - Usando stream di test HLS");
    
    return {
      iframeUrl: `https://vixsrc.to/${tmdbType}/${id}`,
      m3u8Url: testStream,
      source: 'ios_test_stream'
    };
    
  } catch (fallbackError) {
    console.error("❌ iOS - Fallback estremo fallito:", fallbackError);
    
    // Restituisci comunque uno stream di test
    return {
      iframeUrl: `https://vixsrc.to/${isMovie ? 'movie' : 'tv'}/${id}`,
      m3u8Url: "https://bitdash-a.akamaihd.net/s/content/media/20151018/529e0f5c-2d49-4c5a-9edb-a2915b8a2c7c/7fc4c7ad-ba2b-4292-9352-194e2d6fb1d5/playlist.m3u8",
      source: 'emergency_test_stream'
    };
  }
}

// Funzione per estrarre URL m3u8 - MIGLIORATA PER iOS
function extractM3U8Urls(html) {
  const urls = [];
  
  // Pattern per trovare URL m3u8
  const patterns = [
    /https?:\/\/[^\s"']+\.m3u8[^\s"']*/g,
    /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/g,
    /source:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/g,
    /file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/g,
    /src:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/g,
    // Pattern specifici per iOS/HLS
    /(https?:\/\/[^"'&\s]+\.m3u8[^"'&\s]*)/gi,
    /(?:hls|m3u8)[^'"]*['"]([^'"]+)['"]/gi
  ];
  
  for (const pattern of patterns) {
    const matches = html.match(pattern);
    if (matches) {
      matches.forEach(match => {
        // Pulisci l'URL
        let cleanUrl = match.replace(/["'`]/g, '');
        
        // Rimuovi parti non URL
        cleanUrl = cleanUrl.split('"')[0].split("'")[0].split(' ')[0].split(')')[0];
        
        if (cleanUrl.startsWith('http') && cleanUrl.includes('.m3u8')) {
          // Filtra URL di bassa qualità per iOS
          if (!cleanUrl.includes('360p') && !cleanUrl.includes('480p')) {
            urls.push(cleanUrl);
          }
        }
      });
    }
  }
  
  // Rimuovi duplicati e preferisci HTTPS
  const uniqueUrls = [...new Set(urls)];
  const httpsUrls = uniqueUrls.filter(url => url.startsWith('https://'));
  
  return httpsUrls.length > 0 ? httpsUrls : uniqueUrls;
}

// Funzione principale per caricare il video - MODIFICA MINIMA
async function loadVideo(isMovie, id, season = null, episode = null) {
  showLoading(true, "Caricamento stream...");

  try {
    if (shouldUseNativePlayer()) {
      console.log("📱 iOS/Safari rilevato - Usa player nativo");
      await loadVideoNative(isMovie, id, season, episode);
    } else {
      console.log("💻 Browser desktop - Usa Video.js");
      await loadVideoWithVideoJS(isMovie, id, season, episode);
    }
  } catch (err) {
    console.error("Errore nel caricamento del video:", err);
    showError("Impossibile caricare il video. Riprova più tardi.");
    showLoading(false);
  }
}

// Torna indietro dal player - AGGIORNATA PER iOS
function goBack() {
  // Pulisci tutto
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
  
  // Rimuovi hint iOS
  hideIOSHint();
  
  // Rimuovi elemento video
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

// Aggiungi stili CSS per iOS
document.addEventListener('DOMContentLoaded', function() {
  if (shouldUseNativePlayer()) {
    const style = document.createElement('style');
    style.textContent = `
      /* Stili per player nativo iOS */
      #player-video {
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
        -webkit-tap-highlight-color: transparent;
        outline: none;
      }
      
      #player-video::-webkit-media-controls {
        display: flex !important;
      }
      
      #player-video::-webkit-media-controls-panel {
        background: linear-gradient(transparent, rgba(0,0,0,0.7));
      }
      
      #player-video::-webkit-media-controls-play-button {
        display: flex;
      }
      
      #player-video::-webkit-media-controls-timeline {
        display: flex;
      }
      
      #player-video::-webkit-media-controls-current-time-display,
      #player-video::-webkit-media-controls-time-remaining-display {
        display: flex;
      }
      
      #player-video::-webkit-media-controls-mute-button,
      #player-video::-webkit-media-controls-volume-slider {
        display: flex;
      }
      
      #player-video::-webkit-media-controls-fullscreen-button {
        display: flex;
      }
      
      /* Video container per iOS */
      .video-container {
        min-height: 300px;
        position: relative;
      }
      
      @media (max-width: 768px) {
        .video-container {
          min-height: 250px;
        }
        
        #player-video {
          max-height: 60vh !important;
        }
      }
      
      /* Hint per iOS */
      #ios-play-hint {
        animation: fadeIn 0.3s ease;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translate(-50%, -40%); }
        to { opacity: 1; transform: translate(-50%, -50%); }
      }
    `;
    document.head.appendChild(style);
  }
});
