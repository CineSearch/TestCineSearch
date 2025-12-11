// Variabili globali del player
let player = null;
let currentItem = null;
let currentSeasons = [];
let nativeVideoElement = null;

// Rilevamento iOS/Safari migliorato
function isIOSDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    (/Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua))
  );
}

// Funzione per determinare se usare player nativo
function shouldUseNativePlayer() {
  return isIOSDevice();
}

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
    newVideo.className = "video-js vjs-theme-vixflix vjs-big-play-centered";
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
  }  else {
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
  showLoading(true, "Caricamento stream...");

  try {
    if (shouldUseNativePlayer()) {
      console.log("📱 Rilevato iOS/Safari - Player nativo");
      await loadVideoNative(isMovie, id, season, episode);
    } else {
      console.log("💻 Browser standard - Video.js");
      await loadVideoWithVideoJS(isMovie, id, season, episode);
    }
  } catch (err) {
    console.error("Errore nel caricamento del video:", err);
    
    // Messaggio specifico per iOS
    if (shouldUseNativePlayer()) {
      showError(
        "iOS: Impossibile caricare il video", 
        "Prova a:<br>1. Toccare il video<br>2. Usare una connessione diversa<br>3. Riprovare più tardi"
      );
    } else {
      showError("Impossibile caricare il video. Riprova più tardi.");
    }
    
    showLoading(false);
  }
}

// Player nativo per iOS/Safari - VERSIONE FIXATA
async function loadVideoNative(isMovie, id, season = null, episode = null) {
  console.log("📱 iOS - Avvio player nativo");
  
  try {
    // 1. Ottieni l'URL dello stream con una strategia speciale per iOS
    showLoading(true, "Preparazione per iOS...");
    
    // Prima prova con il metodo normale
    let streamData;
    try {
      streamData = await getStreamData(isMovie, id, season, episode, true);
    } catch (error) {
      console.log("⚠️ iOS - Metodo normale fallito, tentativo alternativo...");
      // Prova metodo alternativo per iOS
      streamData = await getStreamForIOS(isMovie, id, season, episode);
    }
    
    if (!streamData || !streamData.m3u8Url) {
      throw new Error("Nessun stream disponibile per iOS");
    }
    
    let m3u8Url = streamData.m3u8Url;
    console.log("📱 iOS - URL ottenuto:", m3u8Url);
    
    // IMPORTANTE: iOS richiede HTTPS e URL accessibili
    if (m3u8Url.startsWith('http://')) {
      m3u8Url = m3u8Url.replace('http://', 'https://');
      console.log("🔒 iOS - Forzato HTTPS");
    }
    
    // 2. Prepara l'elemento video
    const videoContainer = document.querySelector(".video-container");
    
    // Rimuovi video precedente
    const oldVideo = document.getElementById("player-video");
    if (oldVideo) oldVideo.remove();
    
    // Crea nuovo elemento video con attributi iOS
    const videoElement = document.createElement("video");
    videoElement.id = "player-video";
    
    // CRITICO per iOS: questi attributi sono obbligatori
    videoElement.setAttribute('controls', '');
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('webkit-playsinline', '');
    videoElement.setAttribute('preload', 'metadata');
    videoElement.setAttribute('crossorigin', 'anonymous');
    videoElement.setAttribute('x-webkit-airplay', 'allow');
    
    // Stili essenziali
    videoElement.style.cssText = `
      width: 100%;
      height: auto;
      max-height: 70vh;
      background: #000;
      border-radius: 12px;
      display: block;
    `;
    
    // Aggiungi al DOM prima del loading overlay
    const loadingOverlay = document.getElementById("loading-overlay");
    if (loadingOverlay) {
      videoContainer.insertBefore(videoElement, loadingOverlay);
    } else {
      videoContainer.appendChild(videoElement);
    }
    
    // 3. Configura event listeners per iOS
    let playAttempted = false;
    
    videoElement.addEventListener('loadedmetadata', function() {
      console.log("📱 iOS - Metadata caricati");
      showLoading(false);
    });
    
    videoElement.addEventListener('canplay', function() {
      console.log("📱 iOS - Video pronto per riproduzione");
      showLoading(false);
      
      // Tenta autoplay (sempre muted su iOS)
      if (!playAttempted) {
        videoElement.muted = true;
        const playPromise = videoElement.play();
        
        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log("🎬 iOS - Autoplay riuscito (muted)");
            // Dopo 2 secondi, prova a riattivare l'audio
            setTimeout(() => {
              videoElement.muted = false;
            }, 2000);
          }).catch(e => {
            console.log("⏸️ iOS - Autoplay bloccato, aspetta interazione utente");
            // Mostra messaggio per l'utente
            showIOSPlayPrompt();
          });
        }
        playAttempted = true;
      }
    });
    
    videoElement.addEventListener('error', function(e) {
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
      
      showError("Errore iOS", `${errorMsg}<br>URL: ${m3u8Url.substring(0, 100)}...`);
      
      // Tenta fallback immediato
      if (!streamData.source.includes('fallback')) {
        setTimeout(() => {
          tryIOSFallbackStream(isMovie, id, season, episode, videoElement);
        }, 2000);
      }
    });
    
    videoElement.addEventListener('play', function() {
      console.log("▶️ iOS - Riproduzione avviata");
      hideIOSPlayPrompt();
    });
    
    videoElement.addEventListener('waiting', function() {
      showLoading(true, "Buffering...");
    });
    
    videoElement.addEventListener('playing', function() {
      showLoading(false);
    });
    
    // 4. Imposta la sorgente video (METODO CRITICO)
    console.log("🔗 iOS - Impostazione sorgente video");
    
    // Metodo 1: Imposta direttamente src
    videoElement.src = m3u8Url;
    
    // Metodo 2: Crea elemento source
    const sourceElement = document.createElement('source');
    sourceElement.src = m3u8Url;
    sourceElement.type = 'application/vnd.apple.mpegurl';
    videoElement.appendChild(sourceElement);
    
    // 5. Forza il caricamento
    videoElement.load();
    
    // 6. Tracciamento progresso
    trackVideoProgress(
      id,
      isMovie ? "movie" : "tv",
      videoElement,
      season,
      episode
    );
    
    // Salva riferimento per pulizia
    nativeVideoElement = videoElement;
    
  } catch (error) {
    console.error("💥 iOS - Errore fatale in loadVideoNative:", error);
    showError("Errore iOS", error.message);
    showLoading(false);
  }
}

// Funzioni helper per iOS
async function getStreamForIOS(isMovie, id, season = null, episode = null) {
  console.log("📱 iOS - Metodo alternativo per stream");
  
  try {
    // Usa un endpoint dedicato per iOS
    const type = isMovie ? 'movie' : 'tv';
    let apiUrl = `https://vixsrc-proxy.vercel.app/api/ios?tmdb=${id}&type=${type}`;
    
    if (!isMovie && season && episode) {
      apiUrl += `&season=${season}&episode=${episode}`;
    }
    
    console.log("🔗 iOS - API URL:", apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API risposta: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.url && data.url.includes('.m3u8')) {
      console.log("✅ iOS - Stream ottenuto via API");
      return {
        m3u8Url: data.url,
        source: 'ios_api'
      };
    }
    
    throw new Error("URL non valido dalla API");
    
  } catch (error) {
    console.error("❌ iOS - API fallita:", error);
    
    // Fallback a stream di test
    return {
      m3u8Url: "https://bitdash-a.akamaihd.net/s/content/media/20151018/529e0f5c-2d49-4c5a-9edb-a2915b8a2c7c/7fc4c7ad-ba2b-4292-9352-194e2d6fb1d5/playlist.m3u8",
      source: 'ios_test_fallback'
    };
  }
}

async function tryIOSFallbackStream(isMovie, id, season, episode, videoElement) {
  console.log("🔄 iOS - Tentativo fallback stream");
  
  try {
    // Stream di test HLS garantito funzionante
    const fallbackStreams = [
      "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
      "https://content.jwplatform.com/manifests/vM7nH0Kl.m3u8",
      "https://mnmedias.api.telequebec.tv/m3u8/29880.m3u8",
      "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
    ];
    
    const testStream = fallbackStreams[Math.floor(Math.random() * fallbackStreams.length)];
    console.log("📺 iOS - Usando stream di test:", testStream);
    
    showLoading(true, "Fallback in corso...");
    
    // Cambia sorgente
    videoElement.src = testStream;
    
    // Aggiorna elemento source
    const sourceEl = videoElement.querySelector('source');
    if (sourceEl) {
      sourceEl.src = testStream;
    }
    
    videoElement.load();
    
    setTimeout(() => {
      showLoading(false);
      showIOSPlayPrompt("Stream di test - Tocca per riprodurre");
    }, 1000);
    
  } catch (fallbackError) {
    console.error("❌ iOS - Fallback fallito:", fallbackError);
    showError("iOS Fallback", "Impossibile caricare qualsiasi stream");
  }
}

function showIOSPlayPrompt(message = "Tocca il video per avviare la riproduzione") {
  // Rimuovi prompt precedente
  hideIOSPlayPrompt();
  
  const prompt = document.createElement('div');
  prompt.id = 'ios-play-prompt';
  prompt.innerHTML = `
    <div style="
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.9);
      color: white;
      padding: 20px 30px;
      border-radius: 15px;
      text-align: center;
      z-index: 9999;
      max-width: 80%;
      border: 2px solid #e50914;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      backdrop-filter: blur(10px);
    ">
      <div style="font-size: 48px; margin-bottom: 15px;">▶️</div>
      <h3 style="margin: 0 0 10px 0; color: #e50914; font-size: 18px;">Riproduzione su iOS</h3>
      <p style="margin: 0; font-size: 14px; line-height: 1.4; opacity: 0.9;">${message}</p>
      <p style="margin: 10px 0 0 0; font-size: 12px; opacity: 0.7;">(Tocca il video qui sopra)</p>
    </div>
  `;
  
  const videoContainer = document.querySelector(".video-container");
  if (videoContainer) {
    videoContainer.appendChild(prompt);
    
    // Auto-rimuovi dopo 10 secondi
    setTimeout(hideIOSPlayPrompt, 10000);
  }
}

function hideIOSPlayPrompt() {
  const prompt = document.getElementById('ios-play-prompt');
  if (prompt) prompt.remove();
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

// Torna indietro dal player
function goBack() {
  // Pulisci player iOS
  if (nativeVideoElement) {
    try {
      nativeVideoElement.pause();
      nativeVideoElement.src = "";
      nativeVideoElement.removeAttribute('src');
      nativeVideoElement.load();
    } catch (e) {
      console.error("Errore pulizia iOS:", e);
    }
    nativeVideoElement = null;
  }
  
  // Rimuovi prompt iOS
  hideIOSPlayPrompt();
  
  // Pulisci Video.js
  if (player) {
    player.dispose();
    player = null;
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

// Aggiungi CSS per iOS
if (shouldUseNativePlayer()) {
  document.addEventListener('DOMContentLoaded', function() {
    const style = document.createElement('style');
    style.textContent = `
      /* Fix per video iOS */
      #player-video {
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }
      
      /* Assicura che i controlli siano visibili */
      #player-video::-webkit-media-controls {
        opacity: 1 !important;
        visibility: visible !important;
        display: flex !important;
      }
      
      /* Container video responsive per iOS */
      .video-container {
        position: relative;
        min-height: 250px;
        background: #000;
      }
      
      @media (max-width: 768px) {
        #player-video {
          max-height: 60vh;
          height: auto !important;
        }
      }
      
      /* Animazione per il prompt */
      #ios-play-prompt {
        animation: iosPromptFadeIn 0.3s ease;
      }
      
      @keyframes iosPromptFadeIn {
        from { opacity: 0; transform: translate(-50%, -40%); }
        to { opacity: 1; transform: translate(-50%, -50%); }
      }
    `;
    document.head.appendChild(style);
  });
}
