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
    
    if (debugLog.length > 100) debugLog.shift();
    updateDebugPanel();
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
        
        html += `<div class="debug-log-entry" style="color: ${color}">
            <div class="debug-log-time">${entry.time}</div>
            <div class="debug-log-message">${entry.message}</div>
        </div>`;
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

// ============ PLAYER SIMPLIFIED FOR iOS ============
async function openMobilePlayer(item) {
    addDebugLog(`Apertura player per: ${item.title || item.name}`, 'info');
    
    currentMobileItem = item;
    showMobileSection('mobile-player');
    
    const title = item.title || item.name;
    const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
    
    document.getElementById('mobile-player-title').textContent = title;

    // Nascondi controlli aggiuntivi per iOS
    hideAdditionalControls();
    
    try {
        addDebugLog(`Caricamento dettagli TMDB...`, 'info');
        const details = await fetchTMDB(`${mediaType}/${item.id}`);
        
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
            addDebugLog('Serie TV - Caricamento stagioni', 'info');
            document.getElementById('mobile-episode-selector').style.display = 'block';
            await loadTVSeasonsMobile(item.id);
        } else {
            document.getElementById('mobile-episode-selector').style.display = 'none';
            setTimeout(() => playItemMobileSimple(item.id, mediaType), 500);
        }
        
    } catch (error) {
        addDebugLog(`Errore caricamento dettagli: ${error.message}`, 'error');
        showMobileError('Errore nel caricamento dei dettagli');
    }
}

function hideAdditionalControls() {
    const controls = document.getElementById('mobile-additional-controls');
    if (controls) controls.style.display = 'none';
}

async function playItemMobileSimple(id, type, season = null, episode = null) {
    addDebugLog(`Riproduzione ${type} ${id} ${season ? `S${season}E${episode}` : ''}`, 'info');
    
    showMobileLoading(true, "Preparazione video per iOS...");
    
    try {
        // Distruggi player precedente se esiste
        if (mobilePlayer) {
            try {
                mobilePlayer.dispose();
            } catch (e) {}
            mobilePlayer = null;
        }
        
        const videoContainer = document.querySelector('.mobile-video-container');
        
        // Rimuovi video element esistente
        const existingVideo = document.getElementById('mobile-player-video');
        if (existingVideo) existingVideo.remove();
        
        // Crea elemento video NATIVO per iOS
        const videoElement = document.createElement('video');
        videoElement.id = 'mobile-player-video';
        videoElement.className = 'video-js vjs-default-skin';
        videoElement.setAttribute('controls', '');
        videoElement.setAttribute('preload', 'auto');
        videoElement.setAttribute('playsinline', '');
        videoElement.setAttribute('webkit-playsinline', '');
        videoElement.setAttribute('x-webkit-airplay', 'allow');
        videoElement.setAttribute('crossorigin', 'anonymous');
        
        videoContainer.insertBefore(videoElement, videoContainer.firstChild);
        
        addDebugLog('Recupero stream M3U8...', 'info');
        const streamData = await getDirectStreamMobile(id, type === 'movie', season, episode);
        currentStreamData = streamData;
        
        if (!streamData || !streamData.m3u8Url) {
            addDebugLog('ERRORE: Impossibile ottenere stream M3U8', 'error');
            throw new Error('Impossibile ottenere lo stream');
        }
        
        addDebugLog(`Stream ottenuto, lunghezza URL: ${streamData.m3u8Url.length}`, 'success');
        
        // Test diretto dell'M3U8
        addDebugLog('Test connessione M3U8...', 'info');
        try {
            const testResponse = await fetch(applyCorsProxy(streamData.m3u8Url));
            const testContent = await testResponse.text();
            addDebugLog(`M3U8 test OK (${testContent.length} bytes, prime righe):`, 'success');
            addDebugLog(testContent.split('\n').slice(0, 10).join(' | '), 'info');
        } catch (e) {
            addDebugLog(`Test M3U8 fallito: ${e.message}`, 'warning');
        }
        
        // Per iOS, usiamo l'approccio più semplice possibile
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        if (isIOS) {
            // APPROCCIO iOS: Elemento video nativo
            addDebugLog('Configurazione per iOS Safari...', 'info');
            
            // Usa l'URL M3U8 originale (iOS gestisce meglio gli URL diretti)
            let m3u8Url = streamData.m3u8Url;
            
            // Se l'URL contiene parametri complessi, prova a semplificare
            if (m3u8Url.includes('?')) {
                const baseUrl = m3u8Url.split('?')[0];
                addDebugLog(`URL base: ${baseUrl}`, 'info');
            }
            
            // Configurazione Video.js minimale per iOS
            const playerOptions = {
                controls: true,
                fluid: true,
                aspectRatio: "16:9",
                html5: {
                    vhs: {
                        overrideNative: false, // IMPORTANTE: NON sovrascrivere il player nativo iOS
                        withCredentials: false
                    },
                    nativeAudioTracks: true,
                    nativeVideoTracks: true,
                    nativeTextTracks: true
                },
                playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2]
            };
            
            mobilePlayer = videojs('mobile-player-video', playerOptions);
            
            // IMPORTANTE: Per iOS, usa il proxy CORS sull'M3U8
            const proxiedM3u8Url = applyCorsProxy(m3u8Url);
            addDebugLog(`M3U8 con proxy: ${proxiedM3u8Url.substring(0, 100)}...`, 'info');
            
            mobilePlayer.src({
                src: proxiedM3u8Url,
                type: 'application/x-mpegURL',
            });
            
        } else {
            // Approccio standard per altri browser
            addDebugLog('Configurazione per browser non-iOS', 'info');
            
            const playerOptions = {
                controls: true,
                fluid: true,
                aspectRatio: "16:9",
                html5: {
                    vhs: {
                        overrideNative: true,
                        withCredentials: false
                    }
                }
            };
            
            mobilePlayer = videojs('mobile-player-video', playerOptions);
            
            const proxiedM3u8Url = applyCorsProxy(streamData.m3u8Url);
            mobilePlayer.src({
                src: proxiedM3u8Url,
                type: 'application/x-mpegURL',
            });
        }
        
        // Event handlers
        mobilePlayer.ready(() => {
            addDebugLog('✅ Player READY', 'success');
            showMobileLoading(false);
            
            // Mostra debug panel
            if (!debugPanelVisible) {
                setTimeout(() => toggleDebugPanel(), 500);
            }
            
            // Traccia progressi
            trackVideoProgressMobile(
                currentMobileItem.id,
                currentMobileItem.media_type || (currentMobileItem.title ? 'movie' : 'tv'),
                mobilePlayer.el().querySelector('video'),
                season,
                episode
            );
            
            // Riproduci
            mobilePlayer.play().catch(e => {
                addDebugLog(`Auto-play bloccato: ${e.message}`, 'warning');
                addDebugLog(`Codice errore: ${e.code}`, 'info');
            });
        });
        
        mobilePlayer.on('error', function (e) {
            const error = mobilePlayer.error();
            addDebugLog(`❌ Video.js ERROR: ${error?.message || 'Errore sconosciuto'}`, 'error');
            addDebugLog(`Codice errore: ${error?.code || 'N/A'}`, 'error');
            showMobileError('Errore durante il caricamento del video');
        });
        
        mobilePlayer.on('loadeddata', () => addDebugLog('✅ Video data loaded', 'success'));
        mobilePlayer.on('loadedmetadata', () => addDebugLog('✅ Metadata loaded', 'success'));
        mobilePlayer.on('canplay', () => addDebugLog('✅ Video può essere riprodotto', 'success'));
        mobilePlayer.on('playing', () => addDebugLog('🎬 Riproduzione iniziata', 'success'));
        mobilePlayer.on('waiting', () => addDebugLog('⏳ In attesa di dati...', 'warning'));
        
        // Aggiungi test manuale dopo 3 secondi
        setTimeout(() => {
            if (mobilePlayer && mobilePlayer.currentTime() === 0) {
                addDebugLog('⚠️ Player ancora a 0 secondi, tentativo riproduzione manuale', 'warning');
                mobilePlayer.play().catch(e => {
                    addDebugLog(`Riproduzione manuale fallita: ${e.message}`, 'error');
                });
            }
        }, 3000);
        
    } catch (error) {
        addDebugLog(`❌ Errore riproduzione: ${error.message}`, 'error');
        showMobileLoading(false);
        showMobileError(`Impossibile riprodurre: ${error.message}`);
        
        // Fallback: Apri in browser esterno
        addDebugLog('Tentativo fallback: apertura in browser esterno', 'info');
        openInExternalPlayer(id, type, season, episode);
    }
}

// ============ FUNZIONI DI SUPPORTO ============
async function getDirectStreamMobile(tmdbId, isMovie, season = null, episode = null) {
    try {
        addDebugLog(`getDirectStreamMobile: ${tmdbId} ${isMovie ? 'movie' : 'tv'}`, 'info');
        
        let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? 'movie' : 'tv'}/${tmdbId}`;
        if (!isMovie && season !== null && episode !== null) {
            vixsrcUrl += `/${season}/${episode}`;
        }
        
        addDebugLog(`Fetching: ${vixsrcUrl}`, 'info');
        
        const proxiedVixsrcUrl = applyCorsProxy(vixsrcUrl);
        const response = await fetch(proxiedVixsrcUrl);
        
        if (!response.ok) {
            addDebugLog(`HTTP Error: ${response.status}`, 'error');
            throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await response.text();
        addDebugLog(`HTML ricevuto (${html.length} bytes)`, 'success');
        
        // Verifica che non sia pagina di errore
        if (html.includes('not found') || html.includes('404') || html.includes('No sources')) {
            addDebugLog('Pagina contiene "not found" o "404"', 'error');
            throw new Error('Contenuto non trovato su vixsrc');
        }
        
        // Pattern 1: masterPlaylist
        const playlistParamsRegex = /window\.masterPlaylist[^:]+params:[^{]+({[^<]+?})/;
        const playlistParamsMatch = html.match(playlistParamsRegex);
        
        if (!playlistParamsMatch) {
            // Pattern alternativo
            addDebugLog('Pattern 1 non trovato, tentativo pattern alternativo', 'warning');
            const altPattern = /masterPlaylist\s*=\s*{[^}]+url:\s*'([^']+)'[^}]+params:\s*({[^}]+})/;
            const altMatch = html.match(altPattern);
            
            if (!altMatch) {
                addDebugLog('Nessun pattern playlist trovato', 'error');
                throw new Error('Parametri playlist non trovati');
            }
            
            const playlistUrl = altMatch[1];
            const paramsStr = altMatch[2].replace(/'/g, '"').replace(/\s+/g, '');
            
            addDebugLog(`URL playlist trovato: ${playlistUrl}`, 'success');
            
            let playlistParams;
            try {
                playlistParams = JSON.parse(paramsStr);
            } catch (e) {
                // Estrai manualmente expires e token
                const expiresMatch = paramsStr.match(/"expires"\s*:\s*"([^"]+)"/);
                const tokenMatch = paramsStr.match(/"token"\s*:\s*"([^"]+)"/);
                
                playlistParams = {
                    expires: expiresMatch ? expiresMatch[1] : '',
                    token: tokenMatch ? tokenMatch[1] : ''
                };
            }
            
            const hasQuery = /\?[^#]+/.test(playlistUrl);
            const separator = hasQuery ? '&' : '?';
            
            const m3u8Url = playlistUrl + separator + 
                'expires=' + playlistParams.expires + 
                '&token=' + playlistParams.token;
            
            addDebugLog(`M3U8 generato (alt): ${m3u8Url.substring(0, 100)}...`, 'success');
            return { iframeUrl: vixsrcUrl, m3u8Url: m3u8Url };
        }
        
        let playlistParamsStr = playlistParamsMatch[1]
            .replace(/'/g, '"')
            .replace(/\s+/g, '')
            .replace(/\n/g, '')
            .replace(/\\n/g, '')
            .replace(',}', '}');
        
        addDebugLog(`Parametri raw: ${playlistParamsStr}`, 'info');
        
        let playlistParams;
        try {
            playlistParams = JSON.parse(playlistParamsStr);
            addDebugLog('Parametri JSON parsati', 'success');
        } catch (e) {
            addDebugLog(`Errore parsing JSON: ${e.message}`, 'warning');
            // Estrai manualmente
            const expiresMatch = playlistParamsStr.match(/"expires"\s*:\s*"([^"]+)"/);
            const tokenMatch = playlistParamsStr.match(/"token"\s*:\s*"([^"]+)"/);
            
            playlistParams = {
                expires: expiresMatch ? expiresMatch[1] : Date.now() + 3600000,
                token: tokenMatch ? tokenMatch[1] : 'default'
            };
        }
        
        const playlistUrlRegex = /window\.masterPlaylist\s*=\s*\{[\s\S]*?url:\s*'([^']+)'/;
        const playlistUrlMatch = html.match(playlistUrlRegex);
        
        if (!playlistUrlMatch) {
            throw new Error('URL playlist non trovato');
        }
        
        const playlistUrl = playlistUrlMatch[1];
        addDebugLog(`Playlist URL: ${playlistUrl}`, 'info');
        
        const canPlayFHDRegex = /window\.canPlayFHD\s+?=\s+?(\w+)/;
        const canPlayFHDMatch = html.match(canPlayFHDRegex);
        const canPlayFHD = canPlayFHDMatch && canPlayFHDMatch[1] === 'true';
        
        const hasQuery = /\?[^#]+/.test(playlistUrl);
        const separator = hasQuery ? '&' : '?';
        
        const m3u8Url = playlistUrl + 
            separator + 
            'expires=' + playlistParams.expires + 
            '&token=' + playlistParams.token + 
            (canPlayFHD ? '&h=1' : '');
        
        addDebugLog(`M3U8 finale: ${m3u8Url.substring(0, 100)}...`, 'success');
        
        // Test rapido dell'M3U8
        try {
            const testResponse = await fetch(applyCorsProxy(m3u8Url), { method: 'HEAD' });
            addDebugLog(`M3U8 HEAD test: ${testResponse.status}`, 
                       testResponse.ok ? 'success' : 'warning');
        } catch (e) {
            addDebugLog(`M3U8 test fallito: ${e.message}`, 'warning');
        }
        
        return {
            iframeUrl: vixsrcUrl,
            m3u8Url: m3u8Url
        };
        
    } catch (error) {
        addDebugLog(`Errore getDirectStreamMobile: ${error.message}`, 'error');
        throw error;
    }
}

function trackVideoProgressMobile(tmdbId, mediaType, videoElement, season = null, episode = null) {
    let storageKey = `videoProgress_${mediaType}_${tmdbId}`;
    if (mediaType === "tv" && season !== null && episode !== null) {
        storageKey += `_S${season}_E${episode}`;
    }
    
    try {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            const savedTime = parseFloat(parsedData.time || 0);
            const savedTimestamp = parseInt(parsedData.timestamp || 0);
            const isRecent = Date.now() - savedTimestamp < (30 * 24 * 60 * 60 * 1000);
            
            if (savedTime > 10 && isRecent) {
                addDebugLog(`Ripresa da: ${savedTime} secondi`, 'info');
                videoElement.currentTime = savedTime;
            }
        }
    } catch (e) {
        addDebugLog(`Errore lettura progresso: ${e.message}`, 'warning');
    }
    
    const saveInterval = setInterval(() => {
        if (!videoElement.paused && !videoElement.ended) {
            const currentTime = videoElement.currentTime;
            const totalDuration = videoElement.duration;

            if (currentTime > 30 || (totalDuration > 0 && (currentTime / totalDuration) > 0.05)) {
                const saveData = {
                    time: currentTime,
                    timestamp: Date.now(),
                    totalDuration: totalDuration,
                    tmdbId: tmdbId,
                    mediaType: mediaType,
                    season: season,
                    episode: episode,
                    watchedPercentage: totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0
                };
                
                localStorage.setItem(storageKey, JSON.stringify(saveData));
                addDebugLog(`Progresso salvato: ${currentTime.toFixed(1)}s`, 'info');
            }
        }
    }, 10000);
    
    return {
        storageKey: storageKey,
        cleanup: () => clearInterval(saveInterval)
    };
}

function closePlayerMobile() {
    addDebugLog('Chiusura player...', 'info');
    
    if (mobilePlayer) {
        try {
            mobilePlayer.dispose();
            addDebugLog('Player disposed', 'info');
        } catch (e) {
            addDebugLog(`Errore dispose player: ${e.message}`, 'warning');
        }
        mobilePlayer = null;
    }
    
    currentMobileItem = null;
    currentMobileSeasons = [];
    
    const videoElement = document.getElementById('mobile-player-video');
    if (videoElement) {
        videoElement.remove();
    }
    
    showHomeMobile();
}

function openInExternalPlayer(tmdbId, mediaType, season, episode) {
    let externalUrl;
    
    if (mediaType === 'movie') {
        externalUrl = `https://${VIXSRC_URL}/movie/${tmdbId}`;
    } else {
        externalUrl = `https://${VIXSRC_URL}/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
    
    addDebugLog(`Apertura in browser esterno: ${externalUrl}`, 'info');
    window.open(applyCorsProxy(externalUrl), '_blank');
}

// ============ GESTIONE STAGIONI ED EPISODI ============
async function loadTVSeasonsMobile(tmdbId) {
    try {
        addDebugLog(`Caricamento stagioni per: ${tmdbId}`, 'info');
        const details = await fetchTMDB(`tv/${tmdbId}`);
        currentMobileSeasons = details.seasons || [];
        
        const seasonSelect = document.getElementById('mobile-season-select');
        const episodesList = document.getElementById('mobile-episodes-list');
        
        if (!seasonSelect || !episodesList) return;
        
        seasonSelect.innerHTML = '';
        
        currentMobileSeasons.forEach((season, index) => {
            const option = document.createElement('option');
            option.value = season.season_number;
            option.textContent = `Stagione ${season.season_number} (${season.episode_count} episodi)`;
            seasonSelect.appendChild(option);
        });
        
        if (currentMobileSeasons.length > 0) {
            const firstSeasonNumber = currentMobileSeasons[0].season_number;
            await loadSeasonEpisodesMobile(tmdbId, firstSeasonNumber);
        }
        
        seasonSelect.onchange = function() {
            const seasonNumber = parseInt(this.value);
            loadSeasonEpisodesMobile(tmdbId, seasonNumber);
        };
        
    } catch (error) {
        addDebugLog(`Errore caricamento stagioni: ${error.message}`, 'error');
    }
}

async function loadSeasonEpisodesMobile(tmdbId, seasonNumber) {
    try {
        const episodesList = document.getElementById('mobile-episodes-list');
        if (!episodesList) return;
        
        episodesList.innerHTML = '<div class="mobile-episode-item">Caricamento episodi...</div>';
        
        const seasonData = await fetchTMDB(`tv/${tmdbId}/season/${seasonNumber}`);
        const episodes = seasonData.episodes || [];
        episodesList.innerHTML = '';
        
        episodes.forEach(episode => {
            const episodeItem = document.createElement('div');
            episodeItem.className = 'mobile-episode-item';
            episodeItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>Episodio ${episode.episode_number}</strong>
                        <div style="font-size: 12px; color: #aaa;">${episode.name || 'Senza titolo'}</div>
                        ${episode.overview ? `<div style="font-size: 11px; margin-top: 5px; opacity: 0.8;">${episode.overview.substring(0, 100)}...</div>` : ''}
                    </div>
                    <button class="mobile-control-btn" onclick="playTVEpisodeMobile(${tmdbId}, ${seasonNumber}, ${episode.episode_number})">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            `;
            
            episodeItem.onclick = (e) => {
                if (!e.target.closest('button')) {
                    playTVEpisodeMobile(tmdbId, seasonNumber, episode.episode_number);
                }
            };
            
            episodesList.appendChild(episodeItem);
        });
        
        if (episodes.length === 0) {
            episodesList.innerHTML = '<div class="mobile-episode-item">Nessun episodio disponibile</div>';
        }
        
    } catch (error) {
        addDebugLog(`Errore caricamento episodi: ${error.message}`, 'error');
        showMobileError('Errore nel caricamento degli episodi');
    }
}

function playTVEpisodeMobile(tmdbId, seasonNumber, episodeNumber) {
    addDebugLog(`Riproduzione episodio S${seasonNumber}E${episodeNumber}`, 'info');

    const episodeTitle = `Stagione ${seasonNumber}, Episodio ${episodeNumber}`;
    document.getElementById('mobile-player-title').textContent = episodeTitle;
    
    playItemMobileSimple(tmdbId, 'tv', seasonNumber, episodeNumber);
}

// ============ ESPOSIZIONE FUNZIONI GLOBALI ============
window.openMobilePlayer = openMobilePlayer;
window.playItemMobileSimple = playItemMobileSimple;
window.playTVEpisodeMobile = playTVEpisodeMobile;
window.closePlayerMobile = closePlayerMobile;
window.openInExternalPlayer = openInExternalPlayer;
window.toggleDebugPanel = toggleDebugPanel;
window.clearDebugLog = clearDebugLog;