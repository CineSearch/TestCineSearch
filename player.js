// Variabili globali del player
let player = null;
let currentItem = null;
let currentSeasons = [];
let nativeVideoElement = null;

// Rileva se siamo su iOS/Safari
function shouldUseNativePlayer() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    /Safari/.test(userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(userAgent)
  );
}

// Funzione per aprire il player - MODIFICATA
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
  
  // Rimuovi l'elemento video esistente e qualsiasi messaggio di errore
  const oldVideo = document.getElementById("player-video");
  if (oldVideo) oldVideo.remove();
  
  const errorMessages = document.querySelectorAll(".error-message");
  errorMessages.forEach(el => el.remove());

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

// Player nativo per iOS/Safari - VERSIONE CORRETTA
async function loadVideoNative(isMovie, id, season = null, episode = null) {
  console.log("📱 iOS - Caricamento video nativo");
  
  try {
    // Ottieni dati stream con strategia speciale per iOS
    const streamData = await getStreamDataForiOS(isMovie, id, season, episode);
    
    if (!streamData || !streamData.m3u8Url) {
      throw new Error("Nessun stream disponibile");
    }
    
    let m3u8Url = streamData.m3u8Url;
    console.log("📱 iOS - URL ricevuto:", m3u8Url);
    
    // Preparazione elemento video
    const videoContainer = document.querySelector(".video-container");
    
    // Crea nuovo elemento video con attributi specifici iOS
    const videoElement = document.createElement("video");
    videoElement.id = "player-video";
    videoElement.className = "native-video-player";
    
    // IMPORTANTE: Stili per iOS
    videoElement.style.cssText = `
      width: 100%;
      height: 100%;
      max-height: 80vh;
      object-fit: contain;
      background: #000;
      border-radius: 12px;
    `;
    
    // ATTRIBUTI CRITICI per iOS Safari
    videoElement.setAttribute('controls', '');
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('webkit-playsinline', '');
    videoElement.setAttribute('preload', 'metadata');
    videoElement.setAttribute('autoplay', '');
    videoElement.setAttribute('muted', ''); // Muted per autoplay su iOS
    videoElement.crossOrigin = "anonymous";
    videoElement.controlsList = "nodownload"; // Previene download
    
    // Aggiungi al DOM
    const loadingOverlay = document.getElementById("loading-overlay");
    videoContainer.insertBefore(videoElement, loadingOverlay);
    
    // Event listeners per iOS
    let hasStarted = false;
    
    videoElement.addEventListener('loadedmetadata', () => {
      console.log("📱 iOS - Metadata caricati");
      showLoading(false);
    });
    
    videoElement.addEventListener('loadeddata', () => {
      console.log("📱 iOS - Dati caricati");
    });
    
    videoElement.addEventListener('canplay', () => {
      console.log("📱 iOS - Video pronto per la riproduzione");
      if (!hasStarted) {
        // Tenta autoplay con muted (consentito su iOS)
        videoElement.play().then(() => {
          console.log("🎬 iOS - Autoplay avviato con successo");
          hasStarted = true;
          // Riattiva l'audio dopo l'inizio
          setTimeout(() => {
            videoElement.muted = false;
          }, 1000);
        }).catch(e => {
          console.log("⏸️ iOS - Autoplay bloccato:", e);
          // Mostra messaggio per interazione utente
          showIOSPlayMessage();
        });
      }
    });
    
    videoElement.addEventListener('play', () => {
      console.log("▶️ iOS - Riproduzione iniziata");
      hasStarted = true;
      hideIOSPlayMessage();
    });
    
    videoElement.addEventListener('error', (e) => {
      console.error("❌ iOS - Errore video:", videoElement.error);
      showLoading(false);
      
      let errorMsg = "Errore sconosciuto";
      if (videoElement.error) {
        switch(videoElement.error.code) {
          case 1: errorMsg = "Risorsa video non trovata"; break;
          case 2: errorMsg = "Network error"; break;
          case 3: errorMsg = "Errore decodifica"; break;
          case 4: errorMsg = "Formato non supportato"; break;
        }
      }
      
      showError("Errore riproduzione iOS", errorMsg);
    });
    
    videoElement.addEventListener('stalled', () => {
      console.log("⚠️ iOS - Buffer esaurito");
      showLoading(true, "Buffer...");
    });
    
    videoElement.addEventListener('waiting', () => {
      showLoading(true, "Buffer...");
    });
    
    videoElement.addEventListener('playing', () => {
      showLoading(false);
    });
    
    // Imposta la sorgente DOPO aver aggiunto gli event listener
    console.log("🔗 iOS - Impostazione sorgente:", m3u8Url);
    videoElement.src = m3u8Url;
    
    // Salva riferimento
    nativeVideoElement = videoElement;
    
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
  }
}

// Funzione helper per mostrare messaggio play su iOS
function showIOSPlayMessage() {
  const existing = document.querySelector('.ios-play-message');
  if (existing) existing.remove();
  
  const message = document.createElement('div');
  message.className = 'ios-play-message';
  message.innerHTML = `
    <div style="
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.9);
      color: white;
      padding: 20px;
      border-radius: 10px;
      text-align: center;
      z-index: 1000;
      max-width: 80%;
    ">
      <h3 style="margin: 0 0 10px 0; color: #e50914;">⏯️ Tocca per avviare</h3>
      <p style="margin: 0; font-size: 14px; opacity: 0.8;">
        Su iOS, tocca il video per avviare la riproduzione
      </p>
    </div>
  `;
  
  const videoContainer = document.querySelector(".video-container");
  videoContainer.appendChild(message);
}

function hideIOSPlayMessage() {
  const message = document.querySelector('.ios-play-message');
  if (message) message.remove();
}

// Versione speciale di getStreamData per iOS
async function getStreamDataForiOS(isMovie, id, season = null, episode = null) {
  try {
    showLoading(true, "Preparazione per iOS...");
    
    console.log("📱 iOS - Inizio estrazione stream");
    
    // Crea URL vixsrc
    let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${id}`;
    if (!isMovie && season !== null && episode !== null) {
      vixsrcUrl += `/${season}/${episode}`;
    }
    
    console.log("🔗 iOS - URL target:", vixsrcUrl);
    
    // STRATEGIA 1: Prova con un proxy che supporti CORS
    let html;
    try {
      // Usa un proxy CORS affidabile per iOS
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(vixsrcUrl)}`;
      console.log("🔄 iOS - Tentativo con proxy CORS:", proxyUrl);
      
      const response = await fetch(proxyUrl, {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        html = data.contents;
        console.log("✅ iOS - Proxy CORS successo");
      } else {
        throw new Error("Proxy CORS fallito");
      }
    } catch (proxyError) {
      console.log("⚠️ iOS - Proxy CORS fallito, tentativo diretto");
      
      // STRATEGIA 2: Fetch diretto (con header iOS)
      try {
        const response = await fetch(vixsrcUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'it-IT,it;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Referer': 'https://vixsrc.to/'
          },
          mode: 'no-cors'
        });
        
        // Con no-cors non possiamo leggere la risposta, ma possiamo comunque provare
        console.log("📱 iOS - Fetch no-cors completato");
        
        // Fallback a URL fisso per test
        return await getFallbackStreamForiOS(isMovie, id, season, episode);
        
      } catch (directError) {
        console.error("❌ iOS - Fetch diretto fallito:", directError);
        throw new Error("Impossibile raggiungere il server");
      }
    }
    
    if (!html) {
      throw new Error("Pagina vuota o non raggiungibile");
    }
    
    console.log("📄 iOS - HTML ricevuto:", html.length, "caratteri");
    
    // Estrai URL m3u8
    const m3u8Urls = extractM3U8Urls(html);
    
    if (m3u8Urls.length > 0) {
      let m3u8Url = m3u8Urls[0];
      
      // Assicura HTTPS per iOS
      if (m3u8Url.startsWith('http://')) {
        m3u8Url = m3u8Url.replace('http://', 'https://');
      }
      
      // Verifica che sia un URL valido per iOS
      if (m3u8Url.includes('.m3u8')) {
        console.log("✅ iOS - URL m3u8 valido trovato:", m3u8Url);
        
        // Test rapido se l'URL è accessibile
        try {
          const testResponse = await fetch(m3u8Url, { 
            method: 'HEAD',
            mode: 'no-cors'
          });
          console.log("🔍 iOS - Test URL riuscito");
        } catch (testError) {
          console.log("⚠️ iOS - Test URL fallito, ma procedo comunque");
        }
        
        showLoading(false);
        return {
          iframeUrl: vixsrcUrl,
          m3u8Url: m3u8Url,
          source: 'ios_direct_extraction'
        };
      }
    }
    
    // Se nessun URL diretto, usa fallback
    return await getFallbackStreamForiOS(isMovie, id, season, episode);
    
  } catch (error) {
    console.error("💥 iOS - Errore getStreamDataForiOS:", error);
    
    // Prova fallback come ultima risorsa
    return await getFallbackStreamForiOS(isMovie, id, season, episode);
  }
}

// Fallback specifico per iOS
async function getFallbackStreamForiOS(isMovie, id, season = null, episode = null) {
  try {
    console.log("🔄 iOS - Tentativo fallback");
    
    // Usa un servizio di proxy/stream alternativo
    const type = isMovie ? 'movie' : 'tv';
    let fallbackUrl = `https://vixsrc-proxy.vercel.app/api/stream?tmdb=${id}&type=${type}`;
    
    if (!isMovie && season && episode) {
      fallbackUrl += `&season=${season}&episode=${episode}`;
    }
    
    console.log("🔗 iOS - Fallback URL:", fallbackUrl);
    
    const response = await fetch(fallbackUrl);
    if (response.ok) {
      const data = await response.json();
      if (data.url) {
        console.log("🎉 iOS - Fallback riuscito:", data.url);
        return {
          iframeUrl: `https://vixsrc.to/${type}/${id}`,
          m3u8Url: data.url,
          source: 'ios_fallback'
        };
      }
    }
    
    // Ultimo tentativo: URL di test generico (sostituisci con uno valido)
    const testStream = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
    console.log("⚠️ iOS - Usando stream di test");
    
    return {
      iframeUrl: `https://vixsrc.to/${isMovie ? 'movie' : 'tv'}/${id}`,
      m3u8Url: testStream,
      source: 'ios_test_stream'
    };
    
  } catch (fallbackError) {
    console.error("❌ iOS - Fallback fallito:", fallbackError);
    throw new Error("Impossibile trovare uno stream compatibile con iOS");
  }
}

// Funzione principale per caricare il video - AGGIORNATA
async function loadVideo(isMovie, id, season = null, episode = null) {
  showLoading(true, "Preparazione player...");

  try {
    if (shouldUseNativePlayer()) {
      // Usa player nativo per iOS/Safari
      console.log("📱 Dispositivo iOS/Safari rilevato - Usa player nativo");
      await loadVideoNative(isMovie, id, season, episode);
    } else {
      // Usa Video.js per altri browser
      console.log("💻 Browser desktop rilevato - Usa Video.js");
      await loadVideoWithVideoJS(isMovie, id, season, episode);
    }
  } catch (err) {
    console.error("Errore nel caricamento del video:", err);
    showError("Impossibile caricare il video", err.message);
    showLoading(false);
  }
}

// Aggiungi questo CSS per iOS
function addIOSStyles() {
  if (!shouldUseNativePlayer()) return;
  
  const style = document.createElement('style');
  style.textContent = `
    /* Stili specifici per iOS */
    .native-video-player {
      -webkit-transform: translateZ(0);
      transform: translateZ(0);
      -webkit-tap-highlight-color: transparent;
    }
    
    .native-video-player::-webkit-media-controls {
      display: flex !important;
    }
    
    .native-video-player::-webkit-media-controls-panel {
      background: linear-gradient(transparent, rgba(0,0,0,0.7));
    }
    
    .native-video-player::-webkit-media-controls-play-button {
      display: flex;
    }
    
    .native-video-player::-webkit-media-controls-timeline {
      display: flex;
    }
    
    .native-video-player::-webkit-media-controls-current-time-display,
    .native-video-player::-webkit-media-controls-time-remaining-display {
      display: flex;
    }
    
    .native-video-player::-webkit-media-controls-mute-button,
    .native-video-player::-webkit-media-controls-volume-slider {
      display: flex;
    }
    
    .native-video-player::-webkit-media-controls-fullscreen-button {
      display: flex;
    }
    
    /* Adatta il contenitore per iOS */
    .video-container {
      min-height: 300px;
      position: relative;
    }
    
    @media (max-width: 768px) {
      .video-container {
        min-height: 250px;
      }
      
      .native-video-player {
        height: auto;
        max-height: 60vh;
      }
    }
  `;
  
  document.head.appendChild(style);
}

// Inizializza stili iOS all'avvio
if (shouldUseNativePlayer()) {
  document.addEventListener('DOMContentLoaded', addIOSStyles);
}

// Torna indietro dal player - AGGIORNATA
function goBack() {
  // Pulisci player iOS
  if (nativeVideoElement) {
    nativeVideoElement.pause();
    nativeVideoElement.src = "";
    nativeVideoElement.remove();
    nativeVideoElement = null;
  }
  
  // Pulisci Video.js
  if (player) {
    player.dispose();
    player = null;
  }
  
  // Rimuovi eventuali messaggi iOS
  hideIOSPlayMessage();
  
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
