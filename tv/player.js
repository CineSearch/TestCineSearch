let player = null;
let currentItem = null;
let currentSeasons = [];
let isPlayerLoading = false;
document.addEventListener('DOMContentLoaded', () => {
  setupPlayerFocus();
});

let isTVMode = false;
let tvInfoTimeout = null;

// Rileva se siamo su TV
function detectTVMode() {
  const ua = navigator.userAgent;
  const screenWidth = window.screen.width;
  const isTV = ua.includes('SmartTV') || 
               ua.includes('WebOS') || 
               ua.includes('Tizen') || 
               ua.includes('Android TV') ||
               ua.includes('AppleTV') ||
               (screenWidth >= 1600 && screenHeight >= 900 && !ua.includes('Mobile'));
  return isTV;
}

// Abilita modalità TV
function enableTVMode() {
  isTVMode = detectTVMode();
  
  if (isTVMode) {
    document.getElementById("player").classList.add("tv-fullscreen-player");
    
    // Nascondi header quando il player è attivo
    document.getElementById("header").style.display = "none";
    
    // Crea overlay info per TV
    createTVInfoOverlay();
    
    // Imposta timeout per nascondere info
    resetTVInfoTimeout();
    
    // Focus sui controlli del player
    setTimeout(() => {
      if (player) {
        player.focus();
        player.play();
      }
    }, 500);
  }
}

// Crea overlay info per TV
function createTVInfoOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "tv-info-overlay";
  overlay.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2 id="tv-player-title" style="margin: 0; font-size: 1.8rem;">${currentItem?.title || currentItem?.name || ''}</h2>
        <div id="tv-player-meta" style="opacity: 0.8; font-size: 1rem;"></div>
      </div>
      <button class="tv-close-btn" onclick="goBack()" style="background: #2a09e5; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 1rem; cursor: pointer;">
        ✕ Chiudi
      </button>
    </div>
  `;
  
  document.querySelector(".video-container").prepend(overlay);
  
  // Aggiorna meta info
  if (currentItem) {
    updateTVInfoOverlay();
  }
}

// Aggiorna overlay info
function updateTVInfoOverlay() {
  const titleEl = document.getElementById("tv-player-title");
  const metaEl = document.getElementById("tv-player-meta");
  
  if (titleEl && currentItem) {
    titleEl.textContent = currentItem.title || currentItem.name || '';
  }
  
  if (metaEl && currentItem) {
    const mediaType = currentItem.media_type || (currentItem.title ? "movie" : "tv");
    const releaseDate = currentItem.release_date || currentItem.first_air_date || '';
    const year = releaseDate.slice(0, 4) || '';
    
    metaEl.innerHTML = `${mediaType === 'movie' ? '🎬 Film' : '📺 Serie'} • ${year} • ⭐ ${currentItem.vote_average?.toFixed(1) || 'N/A'}`;
  }
}

// Reset timeout per nascondere info
function resetTVInfoTimeout() {
  if (tvInfoTimeout) clearTimeout(tvInfoTimeout);
  
  const overlay = document.querySelector(".tv-info-overlay");
  if (overlay) {
    overlay.classList.remove("hidden");
    
    tvInfoTimeout = setTimeout(() => {
      overlay.classList.add("hidden");
    }, 5000); // Nascondi dopo 5 secondi
  }
}

// Mostra overlay info temporaneamente
function showTVInfoTemporarily() {
  const overlay = document.querySelector(".tv-info-overlay");
  if (overlay) {
    overlay.classList.remove("hidden");
    resetTVInfoTimeout();
  }
}

// Modalità selezione episodi per TV
function showTVEpisodeSelector() {
  const container = document.querySelector(".video-container");
  const selector = document.createElement("div");
  selector.className = "tv-episode-selector-modal";
  selector.innerHTML = `
    <div style="background: rgba(0,0,0,0.95); padding: 30px; border-radius: 12px; max-width: 800px; margin: 50px auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0; color: white;">Seleziona Episodio</h2>
        <button onclick="closeTVEpisodeSelector()" style="background: #2a09e5; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">
          ✕ Chiudi
        </button>
      </div>
      <div class="tv-episode-selector" id="tv-episodes-grid"></div>
    </div>
  `;
  
  container.appendChild(selector);
  
  // Carica episodi nella griglia
  loadTVEpisodesGrid();
}

function closeTVEpisodeSelector() {
  const modal = document.querySelector(".tv-episode-selector-modal");
  if (modal) {
    modal.remove();
  }
}

function loadTVEpisodesGrid() {
  const grid = document.getElementById("tv-episodes-grid");
  if (!grid) return;
  
  grid.innerHTML = "";
  
  // Esempio: carica episodi per la stagione corrente
  const seasons = currentSeasons;
  const seasonSelector = document.getElementById("season-select");
  const currentSeason = seasonSelector ? parseInt(seasonSelector.value) : 1;
  
  seasons.forEach(season => {
    if (season.season_number === currentSeason) {
      // Qui dovresti caricare gli episodi per questa stagione
      // Per ora mostriamo un esempio
      for (let i = 1; i <= 10; i++) {
        const episodeCard = document.createElement("div");
        episodeCard.className = "tv-episode-card";
        episodeCard.tabIndex = 0;
        episodeCard.innerHTML = `
          <div style="font-weight: bold; font-size: 1.2rem;">Ep. ${i}</div>
          <div style="font-size: 0.9rem; opacity: 0.8;">Episodio ${i}</div>
        `;
        
        episodeCard.addEventListener("click", () => {
          // Carica l'episodio
          loadVideo(false, currentItem.id, currentSeason, i);
          closeTVEpisodeSelector();
        });
        
        episodeCard.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            episodeCard.click();
          }
        });
        
        grid.appendChild(episodeCard);
      }
    }
  });
}
async function openPlayer(item) {
  console.log('🎬 player.js - openPlayer chiamato per:', item);
  
  currentItem = item;

  // Salva la sezione corrente prima di aprire il player
  const currentSection = document.querySelector('section[style*="block"]')?.id || 'home';
  
  // Nascondi tutto
  hideAllSections();
  document.getElementById("player").style.display = "block";
  
  // Abilita modalità TV se rilevata
  enableTVMode();
  
  if (document.body.classList.contains('tv')) {
    setupTVPlayerControls();
  }
  
  // Aggiungi stato all'history
  history.pushState({ 
    section: 'player', 
    previousSection: currentSection,
    item: item 
  }, '', '#player');

  // Reset player
  if (player) {
    player.dispose();
    player = null;
  }
  
  // Mostra loading
  showLoading(true, "Preparazione contenuto...");
  
  const title = item.title || item.name;
  const releaseDate = item.release_date || item.first_air_date || "N/A";
  const mediaType = item.media_type || (item.title ? "movie" : "tv");

  document.getElementById("player-title").textContent = title;
  document.getElementById("player-meta").innerHTML = `...`;
  document.getElementById("player-overview").textContent =
    item.overview || "...";

  if (mediaType === "tv") {
    console.log('🎬 player.js - Serie TV, carico stagioni');
    
    // Per TV: mostra direttamente il selettore episodi
    if (isTVMode) {
      document.getElementById("episode-warning").style.display = "flex";
      await loadTVSeasons(item.id);
      
      // Mostra selettore episodi in modalità TV
      showTVEpisodeSelector();
    } else {
      // Per altri dispositivi, procedi normalmente
      document.getElementById("episode-warning").style.display = "flex";
      await loadTVSeasons(item.id);
    }
  } else {
    console.log('🎬 player.js - Film, carico direttamente');
    document.getElementById("episode-warning").style.display = "none";
    document.getElementById("episode-selector").style.display = "none";
    
    // Per film: carica direttamente
    await loadVideo(true, item.id);
    
    // Per TV: mostra info overlay
    if (isTVMode) {
      createTVInfoOverlay();
    }
  }

  window.scrollTo(0, 0);
}

async function loadTVSeasons(tvId) {
  console.log('🎬 player.js - loadTVSeasons per ID:', tvId);
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
  console.log('🎬 player.js - loadEpisodes S:', seasonNum, 'per TV ID:', tvId);
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

async function loadVideo(isMovie, id, season = null, episode = null) {
  console.log('🎬 player.js - loadVideo chiamato:', {
    isMovie,
    id,
    season,
    episode
  });
  
  // MODIFICA: Imposta flag di caricamento
  isPlayerLoading = true;
  showLoading(true);
  
  try {
    console.log('🎬 player.js - Setup video.js xhr hook');
    setupVideoJsXhrHook();
    
    if (player) {
      console.log('🎬 player.js - Pulizia player esistente');
      player.dispose();
      player = null;
    }

    console.log('🎬 player.js - Ottenimento stream...');
    const streamData = await getDirectStream(
      id,
      isMovie,
      season,
      episode
    );

    console.log('🎬 player.js - Stream data ottenuto:', streamData);

    if (!streamData || !streamData.m3u8Url) {
      throw new Error("Impossibile ottenere l'URL dello stream");
    }

    const proxiedM3u8Url = applyCorsProxy(streamData.m3u8Url);
    console.log('🎬 player.js - M3U8 URL con proxy:', proxiedM3u8Url);

    let videoElement = document.getElementById("player-video");
    if (!videoElement) {
      console.log('🎬 player.js - Creazione nuovo elemento video');
      const videoContainer = document.querySelector(".video-container");
      videoElement = document.createElement("video");
      videoElement.id = "player-video";
      videoElement.className = "video-js vjs-theme-cinesearch vjs-big-play-centered";
      videoElement.setAttribute("controls", "");
      videoElement.setAttribute("preload", "auto");
      videoElement.setAttribute("playsinline", "");
      videoElement.setAttribute("crossorigin", "anonymous");
      
      const loadingOverlay = document.getElementById("loading-overlay");
      videoContainer.insertBefore(videoElement, loadingOverlay);
    }

    console.log('🎬 player.js - Inizializzazione video.js');
    player = videojs("player-video", {
      controls: true,
      fluid: true,
      aspectRatio: "16:9",
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
      html5: {
        vhs: {
          overrideNative: true,
          bandwidth: 1000000,
          limitRenditionByPlayerDimensions: false
        },
      },
      userActions: {
        hotkeys: true,
        click: true,
        doubleClick: true
      },
      controlBar: {
        volumePanel: {
          inline: false
        },
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

    console.log('🎬 player.js - Impostazione sorgente video');
    player.src({
      src: proxiedM3u8Url,
      type: "application/x-mpegURL",
    });

    console.log('🎬 player.js - Aggiunta quality selector');
    player.hlsQualitySelector();

    player.ready(function () {
      console.log('🎬 player.js - Video.js ready');
      setupKeyboardShortcuts();
      
      // MODIFICA: Rilascia il flag di caricamento
      isPlayerLoading = false;
      showLoading(false);
      
      trackVideoProgress(
        currentItem.id,
        currentItem.media_type || (currentItem.title ? "movie" : "tv"),
        player.el().querySelector("video"),
        season,
        episode
      );

      // FIX FINALE PER TIMELINE - Forza il ridisegno
      setTimeout(() => {
        const progressControl = player.controlBar.getChild('progressControl');
        if (progressControl) {
          console.log('🎬 player.js - Aggiornamento progress control');
          progressControl.el().style.display = 'none';
          progressControl.el().offsetHeight; // Trigger reflow
          progressControl.el().style.display = '';
        }
      }, 100);

      console.log('🎬 player.js - Tentativo di avvio riproduzione');
      player.play().catch((e) => {
        console.log('🎬 player.js - Auto-play prevented:', e);
      });
    });

    player.on('mousemove', function() {
      const mouseDisplay = player.controlBar.progressControl.mouseDisplay;
      if (mouseDisplay) {
        mouseDisplay.el().style.zIndex = '1000';
      }
    });

    player.on("error", function () {
      console.error('🎬 player.js - Errore video.js:', player.error());
      showError("Errore durante il caricamento del video");
      isPlayerLoading = false; // MODIFICA: Rilascia flag in caso di errore
    });
    
    player.on('loadedmetadata', function() {
      console.log('🎬 player.js - Metadata loaded, duration:', player.duration());
    });
    
  } catch (err) {
    console.error('🎬 player.js - Errore in loadVideo:', err);
    showError("Impossibile caricare il video. Riprova più tardi.");
    isPlayerLoading = false; // MODIFICA: Rilascia flag in caso di errore
  } finally {
    showLoading(false);
  }
}


async function getDirectStream(tmdbId, isMovie, season = null, episode = null) {
  console.log('🎬 player.js - getDirectStream chiamato:', {
    tmdbId,
    isMovie,
    season,
    episode
  });
  
  try {
    showLoading(true, "Connessione al server...");

    let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${tmdbId}`;
    if (!isMovie && season !== null && episode !== null) {
      vixsrcUrl += `/${season}/${episode}`;
    }
    
    console.log('🎬 player.js - vixsrc URL:', vixsrcUrl);

    showLoading(true, "Recupero pagina vixsrc...");
    const proxiedUrl = applyCorsProxy(vixsrcUrl);
    console.log('🎬 player.js - vixsrc URL con proxy:', proxiedUrl);
    
    const response = await fetch(proxiedUrl);
    console.log('🎬 player.js - Risposta vixsrc status:', response.status);
    
    const html = await response.text();
    console.log('🎬 player.js - HTML ricevuto, lunghezza:', html.length);

    showLoading(true, "Estrazione parametri stream...");

    const playlistParamsRegex =
      /window\.masterPlaylist[^:]+params:[^{]+({[^<]+?})/;
    const playlistParamsMatch = html.match(playlistParamsRegex);

    console.log('🎬 player.js - Playlist params match:', playlistParamsMatch);

    if (!playlistParamsMatch) {
      throw new Error("Impossibile trovare i parametri della playlist");
    }

    let playlistParamsStr = playlistParamsMatch[1]
      .replace(/'/g, '"')
      .replace(/\s+/g, "")
      .replace(/\n/g, "")
      .replace(/\\n/g, "")
      .replace(",}", "}");

    console.log('🎬 player.js - Playlist params string:', playlistParamsStr);

    let playlistParams;
    try {
      playlistParams = JSON.parse(playlistParamsStr);
      console.log('🎬 player.js - Playlist params parsed:', playlistParams);
    } catch (e) {
      throw new Error("Errore nel parsing dei parametri: " + e.message);
    }

    const playlistUrlRegex =
      /window\.masterPlaylist\s*=\s*\{[\s\S]*?url:\s*'([^']+)'/;
    const playlistUrlMatch = html.match(playlistUrlRegex);

    console.log('🎬 player.js - Playlist URL match:', playlistUrlMatch);

    if (!playlistUrlMatch) {
      throw new Error("Impossibile trovare l'URL della playlist");
    }

    const playlistUrl = playlistUrlMatch[1];
    console.log('🎬 player.js - Playlist URL:', playlistUrl);

    const canPlayFHDRegex = /window\.canPlayFHD\s+?=\s+?(\w+)/;
    const canPlayFHDMatch = html.match(canPlayFHDRegex);
    const canPlayFHD = canPlayFHDMatch && canPlayFHDMatch[1] === "true";
    
    console.log('🎬 player.js - Can play FHD:', canPlayFHD);

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

    console.log('🎬 player.js - M3U8 URL finale:', m3u8Url);

    baseStreamUrl = extractBaseUrl(m3u8Url);

    showLoading(false);
    return {
      iframeUrl: vixsrcUrl,
      m3u8Url: m3u8Url,
    };
  } catch (error) {
    console.error('🎬 player.js - Errore in getDirectStream:', error);
    showLoading(false);
    showError("Errore durante l'estrazione dello stream", error.message);
    return null;
  }
}

function goBack() {
  console.log("🎬 player.js - goBack chiamato");
  
  // MODIFICA: Riabilita lo scroll
  document.body.style.overflow = 'auto';
  document.body.classList.remove('no-scroll');
  isPlayerLoading = false;
  
  if (player) {
    player.dispose();
    player = null;
  }
  
  const videoElement = document.getElementById("player-video");
  if (videoElement) {
    videoElement.remove();
  }

  currentItem = null;
  currentSeasons = [];

  document.getElementById("player").style.display = "none";
  
  // Torna alla sezione precedente dall'history
  const historyState = history.state;
  if (historyState && historyState.previousSection) {
    hideAllSections();
    switch(historyState.previousSection) {
      case 'home':
        document.getElementById("home").style.display = "block";
        break;
      case 'allMovies':
        document.getElementById("allMovies").style.display = "block";
        break;
      case 'allTV':
        document.getElementById("allTV").style.display = "block";
        break;
      case 'categories':
        document.getElementById("categories").style.display = "block";
        break;
      case 'results':
        document.getElementById("results").style.display = "block";
        break;
      case 'preferiti-section':
        document.getElementById("preferiti-section").style.display = "block";
        break;
      default:
        document.getElementById("home").style.display = "block";
    }
  } else {
    // Fallback: mostra la home
    document.getElementById("home").style.display = "block";
  }
  
  // Aggiorna l'history state per rimuovere il player
  history.replaceState({ section: historyState?.previousSection || 'home' }, '', 
                       historyState?.previousSection ? `#${historyState.previousSection}` : window.location.pathname);
  
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

// NUOVA FUNZIONE: setupPlayerFocus
function setupPlayerFocus() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && 
          mutation.attributeName === 'style' &&
          document.getElementById("player").style.display === "block") {
        
        setTimeout(() => {
          const focusableElements = document.querySelectorAll(
            '#player button, #player .back-btn, #player .episode-item'
          );
          
          if (focusableElements.length > 0) {
            focusableElements[0].focus();
          }
        }, 100);
      }
    });
  });
  
  observer.observe(document.getElementById("player"), {
    attributes: true,
    attributeFilter: ['style']
  });
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

function showLoading(show, message = "Caricamento stream...") {
  const overlay = document.getElementById("loading-overlay");
  overlay.style.display = show ? "flex" : "none";
  overlay.querySelector(".loading-text").textContent = message;
}

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

function setupTVPlayerControls() {
  // Assicurati che i controlli siano accessibili
  const playerContainer = document.getElementById("player");
  
  const makeFocusable = () => {
    const buttons = playerContainer.querySelectorAll('button');
    buttons.forEach(btn => {
      if (!btn.hasAttribute('tabindex')) {
        btn.setAttribute('tabindex', '0');
      }
    });
    
    const episodeItems = playerContainer.querySelectorAll('.episode-item');
    episodeItems.forEach(item => {
      if (!item.hasAttribute('tabindex')) {
        item.setAttribute('tabindex', '0');
        item.setAttribute('role', 'button');
      }
    });
  };
  
  makeFocusable();
  
  const observer = new MutationObserver(makeFocusable);
  observer.observe(playerContainer, {
    childList: true,
    subtree: true
  });
  
  document.addEventListener('keydown', handleTVPlayerControls);
}

function handleTVPlayerControls(event) {
  const playerVisible = document.getElementById("player").style.display === "block";
  if (!playerVisible) {
    return;
  }
  
  // MODIFICA: Se siamo in caricamento, blocca tutto tranne Esc/Backspace
  if (isPlayerLoading && event.key !== 'Escape' && event.key !== 'Backspace') {
    event.preventDefault();
    return;
  }
  
  // Ignora se l'utente sta interagendo con controlli del player
  if (event.target.closest('.vjs-control-bar') || 
      event.target.matches('input, select, textarea')) {
    return;
  }
  
  switch(event.key) {
    case 'MediaPlayPause':
    case ' ':
      if (player && player.paused) {
        event.preventDefault();
        player.play();
      } else if (player) {
        event.preventDefault();
        player.pause();
      }
      break;
      
    case 'MediaStop':
    case 'Escape':
    case 'Backspace':
      event.preventDefault();
      goBack();
      break;
      
    case 'MediaFastForward':
    case 'ArrowRight':
      if (!event.repeat && player && player.currentTime) {
        event.preventDefault();
        const newTime = Math.min(player.currentTime() + 10, player.duration());
        player.currentTime(newTime);
        showSeekFeedback('+10s');
      }
      break;
      
    case 'MediaRewind':
    case 'ArrowLeft':
      if (!event.repeat && player && player.currentTime) {
        event.preventDefault();
        const newTime = Math.max(player.currentTime() - 10, 0);
        player.currentTime(newTime);
        showSeekFeedback('-10s');
      }
      break;
      
    case 'ArrowUp':
      event.preventDefault();
      if (player && player.volume) {
        player.volume(Math.min(player.volume() + 0.1, 1));
        showVolumeFeedback(Math.round(player.volume() * 100));
      }
      break;
      
    case 'ArrowDown':
      event.preventDefault();
      if (player && player.volume) {
        player.volume(Math.max(player.volume() - 0.1, 0));
        showVolumeFeedback(Math.round(player.volume() * 100));
      }
      break;
      
    case 'KeyF':
      event.preventDefault();
      if (player.isFullscreen) {
        player.exitFullscreen();
      } else {
        player.requestFullscreen();
      }
      break;
      
    case 'KeyM':
      event.preventDefault();
      if (player.muted) {
        player.muted(!player.muted());
      }
      break;
      
    case 'Enter':
      // Gestisci l'attivazione dell'elemento in focus
      if (event.target.matches('.episode-item')) {
        event.target.click();
      }
      break;
  }
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