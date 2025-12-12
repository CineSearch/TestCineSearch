// ============ SISTEMA DEBUG VISIVO ============
let debugLog = [];
let debugPanelVisible = false;

function addDebugLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
        time: timestamp,
        message: message,
        type: type
    };
    
    debugLog.push(logEntry);
    
    // Limita a 100 messaggi
    if (debugLog.length > 100) {
        debugLog.shift();
    }
    
    // Aggiorna il pannello visibile se attivo
    updateDebugPanel();
    
    // Anche console normale
    console.log(`[${timestamp}] ${message}`);
}

function updateDebugPanel() {
    const panelContent = document.getElementById('debug-panel-content');
    if (!panelContent) return;
    
    let html = '';
    debugLog.forEach(entry => {
        const color = entry.type === 'error' ? '#ff4444' : 
                     entry.type === 'warning' ? '#ffaa00' : 
                     entry.type === 'success' ? '#00ff00' : '#ffffff';
        
        html += `
            <div class="debug-log-entry">
                <div class="debug-log-time" style="color: ${color}">${entry.time}</div>
                <div class="debug-log-message" style="color: ${color}">${entry.message}</div>
            </div>
        `;
    });
    
    panelContent.innerHTML = html;
    panelContent.scrollTop = panelContent.scrollHeight;
}

function toggleDebugPanel() {
    const panel = document.getElementById('mobile-debug-panel');
    debugPanelVisible = !debugPanelVisible;
    
    if (debugPanelVisible) {
        panel.style.display = 'block';
        updateDebugPanel();
    } else {
        panel.style.display = 'none';
    }
}

function clearDebugLog() {
    debugLog = [];
    updateDebugPanel();
}

// ============ VARIABILI PLAYER ============
let currentMobileItem = null;
let currentMobileSeasons = [];
let mobilePlayer = null;
let currentStreamData = null;
let availableAudioTracks = [];
let availableSubtitles = [];
let availableQualities = [];

// ============ PLAYER FUNCTIONS ============
async function openMobilePlayer(item) {
    addDebugLog(`Apertura player per: ${item.title || item.name} (${item.id})`, 'info');
    
    currentMobileItem = item;
    showMobileSection('mobile-player');
    
    const title = item.title || item.name;
    const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
    
    document.getElementById('mobile-player-title').textContent = title;

    hideAdditionalControls();
    
    try {
        addDebugLog(`Fetch dettagli TMDB: ${mediaType}/${item.id}`, 'info');
        const details = await fetchTMDB(`${mediaType}/${item.id}`);
        
        addDebugLog(`Dettagli caricati: ${title}`, 'success');
        
        const metaDiv = document.getElementById('mobile-player-meta');
        const overviewDiv = document.getElementById('mobile-player-overview');
        
        if (metaDiv) {
            let meta = [];
            if (details.release_date || details.first_air_date) {
                meta.push(new Date(details.release_date || details.first_air_date).getFullYear());
            }
            if (details.vote_average) {
                meta.push(`⭐ ${details.vote_average.toFixed(1)}/10`);
            }
            if (details.runtime) {
                const hours = Math.floor(details.runtime / 60);
                const minutes = details.runtime % 60;
                meta.push(`${hours}h ${minutes}m`);
            }
            metaDiv.textContent = meta.join(' • ');
        }
        
        if (overviewDiv) {
            overviewDiv.textContent = details.overview || "Nessuna descrizione disponibile.";
        }
        
        if (mediaType === 'tv') {
            addDebugLog('Contenuto TV - Caricamento stagioni', 'info');
            document.getElementById('mobile-episode-selector').style.display = 'block';
            await loadTVSeasonsMobile(item.id);
        } else {
            document.getElementById('mobile-episode-selector').style.display = 'none';
            setTimeout(() => playItemMobile(item.id, mediaType), 500);
        }
        
    } catch (error) {
        addDebugLog(`Errore caricamento dettagli: ${error.message}`, 'error');
        showMobileError('Errore nel caricamento dei dettagli');
    }
}

// ... (nel resto del file, sostituisci TUTTI i console.log con addDebugLog)
// Esempio per la funzione playItemMobile:
async function playItemMobile(id, type, season = null, episode = null) {
    addDebugLog(`Riproduzione ${type} ${id} ${season ? `S${season}E${episode}` : ''}`, 'info');
    
    showMobileLoading(true, "Preparazione video...");
    
    try {
        if (mobilePlayer) {
            addDebugLog('Dispose player precedente', 'info');
            mobilePlayer.dispose();
            mobilePlayer = null;
        }
        
        const videoContainer = document.querySelector('.mobile-video-container');
        let videoElement = document.getElementById('mobile-player-video');
        
        if (!videoElement) {
            addDebugLog('Creazione elemento video', 'info');
            videoElement = document.createElement('video');
            videoElement.id = 'mobile-player-video';
            videoElement.className = 'video-js vjs-theme-vixflix';
            videoElement.setAttribute('controls', '');
            videoElement.setAttribute('preload', 'auto');
            videoElement.setAttribute('playsinline', '');
            videoElement.setAttribute('crossorigin', 'anonymous');
            videoContainer.insertBefore(videoElement, videoContainer.firstChild);
        }
    
        addDebugLog('Recupero stream M3U8...', 'info');
        const streamData = await getDirectStreamMobile(id, type === 'movie', season, episode);
        currentStreamData = streamData;
        
        if (!streamData || !streamData.m3u8Url) {
            addDebugLog('ERRORE: Impossibile ottenere stream M3U8', 'error');
            throw new Error('Impossibile ottenere lo stream');
        }
        
        addDebugLog(`Stream ottenuto: ${streamData.m3u8Url.substring(0, 100)}...`, 'success');
        
        const proxiedM3u8Url = applyCorsProxy(streamData.m3u8Url);
        addDebugLog(`M3U8 con proxy: ${proxiedM3u8Url.substring(0, 80)}...`, 'info');

        setupVideoJsXhrHook();
        
        addDebugLog('Configurazione Video.js in corso...', 'info');
        const playerOptions = {
            controls: true,
            fluid: true,
            aspectRatio: "16:9",
            playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
            html5: {
                vhs: {
                    overrideNative: true,
                    bandwidth: 1000000,
                    withCredentials: false,
                    useDevicePixelRatio: true
                },
                nativeAudioTracks: false,
                nativeVideoTracks: false,
                nativeTextTracks: false
            },
            controlBar: {
                children: [
                    'playToggle',
                    'volumePanel',
                    'currentTimeDisplay',
                    'timeDivider',
                    'durationDisplay',
                    'progressControl',
                    'remainingTimeDisplay',
                    'playbackRateMenuButton',
                    'qualitySelector',
                    'fullscreenToggle',
                ],
            },
            userActions: {
                hotkeys: true
            }
        };

        mobilePlayer = videojs('mobile-player-video', playerOptions);
        
        addDebugLog('Video.js inizializzato, impostazione sorgente...', 'info');
        mobilePlayer.src({
            src: proxiedM3u8Url,
            type: 'application/x-mpegURL',
        });
        
        mobilePlayer.ready(() => {
            addDebugLog('✅ Player READY - Video.js pronto', 'success');
            showMobileLoading(false);
            
            // Apri automaticamente il debug panel
            if (!debugPanelVisible) {
                setTimeout(() => toggleDebugPanel(), 500);
            }
            
            setTimeout(() => {
                initVideoJsPlugins();
            }, 1000);
            
            const progressTracker = trackVideoProgressMobile(
                currentMobileItem.id,
                currentMobileItem.media_type || (currentMobileItem.title ? 'movie' : 'tv'),
                mobilePlayer.el().querySelector('video'),
                season,
                episode
            );
            mobilePlayer.progressTracker = progressTracker;
            
            showAdditionalControls();
            
            mobilePlayer.play().catch(e => {
                addDebugLog(`Auto-play bloccato: ${e.message}`, 'warning');
            });
        });
        
        mobilePlayer.on('error', function (e) {
            addDebugLog(`❌ Video.js ERROR: ${mobilePlayer.error()?.message || 'Errore sconosciuto'}`, 'error');
            showMobileError('Errore durante il caricamento del video');
        });
        
        mobilePlayer.on('loadeddata', function() {
            addDebugLog('✅ Video data loaded, ready for plugins', 'success');
        });
        
        // Aggiungi più event listeners per debug
        mobilePlayer.on('loadstart', () => addDebugLog('Event: loadstart', 'info'));
        mobilePlayer.on('loadedmetadata', () => addDebugLog('Event: loadedmetadata', 'info'));
        mobilePlayer.on('canplay', () => addDebugLog('Event: canplay - video può essere riprodotto', 'success'));
        mobilePlayer.on('playing', () => addDebugLog('Event: playing - riproduzione iniziata', 'success'));
        mobilePlayer.on('waiting', () => addDebugLog('Event: waiting - in attesa di dati', 'warning'));
        mobilePlayer.on('stalled', () => addDebugLog('Event: stalled - dati non arrivano', 'error'));
        
    } catch (error) {
        addDebugLog(`❌ Errore riproduzione mobile: ${error.message}`, 'error');
        showMobileLoading(false);
        showMobileError(`Impossibile riprodurre: ${error.message}`);
    }
}