// mobile-player.js - Gestione player video con HLS.js (VERSIONE FINALE, SENZA SHOWMOBILEINFO)

// ============ VARIABILI GLOBALI PLAYER ============
let currentMobileItem = null;
let currentMobileSeasons = [];
let mobilePlayer = null;          // Oggetto minimale con metodo dispose
let hls = null;                   // Istanza HLS.js
let currentStreamData = null;
let availableAudioTracks = [];
let availableSubtitles = [];
let availableQualities = [];
let cleanupFunctions = [];        // Per pulire intervalli e listener

// ============ FUNZIONI DI APERTURA PLAYER ============
async function openMobilePlayer(item) {
    console.log("Apertura player per:", item);
    currentMobileItem = item;
    
    if (typeof showMobileSection === 'function') {
        showMobileSection('mobile-player');
    }
    
    const title = item.title || item.name;
    const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
    
    const titleEl = document.getElementById('mobile-player-title');
    if (titleEl) titleEl.textContent = title;
    
    hideAdditionalControls();
    
    try {
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
            const epSelector = document.getElementById('mobile-episode-selector');
            if (epSelector) epSelector.style.display = 'block';
            await loadTVSeasonsMobile(item.id);
        } else {
            setTimeout(() => playItemMobile(item.id, mediaType), 500);
        }
        
    } catch (error) {
        console.error('Errore caricamento dettagli:', error);
        if (typeof showMobileError === 'function') {
            showMobileError('Errore nel caricamento dei dettagli');
        }
    }
}

function hideAdditionalControls() {
    const controls = document.getElementById('mobile-additional-controls');
    if (controls) controls.style.display = 'none';
}

function showAdditionalControls() {
    const controls = document.getElementById('mobile-additional-controls');
    if (controls) controls.style.display = 'flex';
}

// ============ RECUPERO STREAM M3U8 ============
async function getDirectStreamMobile(tmdbId, isMovie, season = null, episode = null) {
    // Verifica che VIXSRC_URL sia definita globalmente
    if (typeof VIXSRC_URL === 'undefined') {
        throw new Error('VIXSRC_URL non definita. Imposta la variabile globalmente.');
    }
    
    try {
        let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? 'movie' : 'tv'}/${tmdbId}`;
        if (!isMovie && season !== null && episode !== null) {
            vixsrcUrl += `/${season}/${episode}`;
        }
        
        // Applica proxy CORS selezionato (funzione definita altrove)
        const proxiedUrl = (typeof applyCorsProxy === 'function') 
            ? applyCorsProxy(vixsrcUrl) 
            : vixsrcUrl;
        
        const response = await fetch(proxiedUrl);
        const html = await response.text();
        
        // Estrai parametri playlist
        const playlistParamsRegex = /window\.masterPlaylist[^:]+params:[^{]+({[^<]+?})/;
        const playlistParamsMatch = html.match(playlistParamsRegex);
        if (!playlistParamsMatch) throw new Error('Parametri playlist non trovati');
        
        let playlistParamsStr = playlistParamsMatch[1]
            .replace(/'/g, '"')
            .replace(/\s+/g, '')
            .replace(/\n/g, '')
            .replace(/\\n/g, '')
            .replace(',}', '}');
        
        let playlistParams;
        try {
            playlistParams = JSON.parse(playlistParamsStr);
        } catch (e) {
            throw new Error('Errore parsing parametri: ' + e.message);
        }
        
        const playlistUrlRegex = /window\.masterPlaylist\s*=\s*\{[\s\S]*?url:\s*'([^']+)'/;
        const playlistUrlMatch = html.match(playlistUrlRegex);
        if (!playlistUrlMatch) throw new Error('URL playlist non trovato');
        
        const playlistUrl = playlistUrlMatch[1];
        
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
        
        return { iframeUrl: vixsrcUrl, m3u8Url };
        
    } catch (error) {
        console.error('Errore getDirectStreamMobile:', error);
        throw error;
    }
}

// ============ FUNZIONE PRINCIPALE DI RIPRODUZIONE ============
async function playItemMobile(id, type, season = null, episode = null) {
    showMobileLoading(true, "Preparazione video...");
    
    const loadingTimeout = setTimeout(() => {
        showMobileLoading(false);
        showMobileError("Timeout: il video impiega troppo tempo a caricarsi.");
    }, 20000);
    
    try {
        if (hls) hls.destroy();
        
        const videoElement = document.getElementById('mobile-player-video');
        if (!videoElement) throw new Error("Elemento video non trovato");
        
        const streamData = await getDirectStreamMobile(id, type === 'movie', season, episode);
        if (!streamData?.m3u8Url) throw new Error("URL non valido");
        
        let m3u8Url = streamData.m3u8Url;
        
        // Forza HTTPS se necessario
        if (window.location.protocol === 'https:' && m3u8Url.startsWith('http:')) {
            m3u8Url = m3u8Url.replace('http:', 'https:');
        }
        
        // Ottieni il proxy selezionato dall'utente
        const corsSelect = document.getElementById('mobile-cors-select');
        const proxyBase = corsSelect ? corsSelect.value : '';
        
        // Se c'è un proxy, applichiamolo all'URL del manifest
        let finalUrl = m3u8Url;
        if (proxyBase && !proxyBase.includes('nessun')) {
            finalUrl = proxyBase + m3u8Url;
        }
        
        showMobileInfo(`Caricamento...`, 3000); // opzionale, se showMobileInfo non esiste, commenta
        
        console.log('URL finale M3U8:', finalUrl);
        
        if (Hls.isSupported()) {
            hls = new Hls({
                xhrSetup: (xhr) => { xhr.withCredentials = false; }
            });
            
            hls.attachMedia(videoElement);
            
            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                hls.loadSource(finalUrl);
            });
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                clearTimeout(loadingTimeout);
                showMobileLoading(false);
                
                extractQualitiesFromHls();
                extractAudioFromHls();
                extractSubtitlesFromHls();
                
                videoElement.play().catch(() => {});
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('HLS.js error:', data);
                
                if (data.fatal) {
                    clearTimeout(loadingTimeout);
                    showMobileLoading(false);
                    
                    let errorMsg = 'Errore di riproduzione: ';
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        errorMsg += 'problema di rete.';
                        if (data.response) {
                            errorMsg += ` Status: ${data.response.code}`;
                        } else if (data.url) {
                            errorMsg += ` URL: ${data.url}`;
                        }
                    } else {
                        errorMsg += data.details;
                    }
                    
                    showMobileError(errorMsg);
                    
                    // Suggerisci di cambiare proxy
                    if (data.url && data.url.includes(proxyBase)) {
                        showMobileInfo("Prova a selezionare un proxy diverso", 5000);
                    }
                    
                    hls.destroy();
                }
            });
            
            trackVideoProgressMobile(id, type, videoElement, season, episode);
            
        } else {
            // Fallback nativo
            videoElement.src = finalUrl;
            videoElement.addEventListener('loadedmetadata', () => {
                clearTimeout(loadingTimeout);
                showMobileLoading(false);
                videoElement.play().catch(() => {});
            });
            videoElement.addEventListener('error', (e) => {
                clearTimeout(loadingTimeout);
                showMobileLoading(false);
                showMobileError('Errore nativo. Prova un proxy diverso.');
            });
            trackVideoProgressMobile(id, type, videoElement, season, episode);
        }
        
    } catch (error) {
        clearTimeout(loadingTimeout);
        showMobileLoading(false);
        showMobileError(`Errore: ${error.message}`);
    }
}

// ============ ESTRAZIONE QUALITÀ / AUDIO / SOTTOTITOLI ============
function extractQualitiesFromHls() {
    if (!hls || !hls.levels) return;
    availableQualities = [];
    hls.levels.forEach((level, index) => {
        const height = level.height || 0;
        const width = level.width || 0;
        const bandwidth = level.bitrate || 0;
        let label = 'Auto';
        if (height >= 2160) label = '4K';
        else if (height >= 1440) label = 'QHD';
        else if (height >= 1080) label = 'FHD';
        else if (height >= 720) label = 'HD';
        else if (height >= 480) label = 'SD';
        else if (height > 0) label = `${height}p`;
        
        if (label !== 'Auto') {
            availableQualities.push({
                index,
                label,
                resolution: `${width}x${height}`,
                height,
                bandwidth
            });
        }
    });
    updateQualitySelector();
}

function extractAudioFromHls() {
    if (!hls || !hls.audioTracks) return;
    availableAudioTracks = [];
    hls.audioTracks.forEach((track, index) => {
        availableAudioTracks.push({
            id: track.id || index,
            language: track.lang || 'und',
            label: track.name || `Audio ${index + 1}`,
            enabled: index === hls.audioTrack
        });
    });
    updateAudioSelector();
}

function extractSubtitlesFromHls() {
    if (!hls || !hls.subtitleTracks) return;
    availableSubtitles = [];
    availableSubtitles.push({ id: -1, language: 'none', label: 'Nessun sottotitolo', mode: 'disabled' });
    hls.subtitleTracks.forEach((track, index) => {
        availableSubtitles.push({
            id: index,
            language: track.lang || 'und',
            label: track.name || `Sottotitoli ${index + 1}`,
            mode: index === hls.subtitleTrack ? 'showing' : 'disabled'
        });
    });
    updateSubtitleSelector();
}

function extractAvailableQualities() {
    extractQualitiesFromHls();
    return availableQualities;
}

function extractAudioTracks() {
    extractAudioFromHls();
    return availableAudioTracks;
}

function extractSubtitles() {
    extractSubtitlesFromHls();
    return availableSubtitles;
}

// ============ AGGIORNAMENTO UI DROPDOWN ============
function updateQualitySelector() {
    const qualitySelect = document.getElementById('mobile-quality-select');
    if (!qualitySelect) return;
    
    qualitySelect.innerHTML = '';
    
    const autoOption = document.createElement('option');
    autoOption.value = 'auto';
    autoOption.textContent = 'Auto';
    qualitySelect.appendChild(autoOption);
    
    availableQualities.forEach((quality) => {
        const option = document.createElement('option');
        option.value = quality.index;
        option.textContent = `${quality.label} (${quality.resolution})`;
        qualitySelect.appendChild(option);
    });
    
    if (hls) {
        const currentLevel = hls.currentLevel;
        qualitySelect.value = (currentLevel >= 0 && currentLevel < availableQualities.length) ? currentLevel : 'auto';
    }
    
    qualitySelect.onchange = function() {
        changeMobileQuality(this.value);
    };
}

function updateAudioSelector() {
    const audioSelect = document.getElementById('mobile-audio-select');
    if (!audioSelect || availableAudioTracks.length === 0) return;
    
    audioSelect.innerHTML = '';
    availableAudioTracks.forEach((track, index) => {
        const option = document.createElement('option');
        option.value = index;
        
        let label = track.label;
        if (track.language && track.language !== 'und') {
            const langName = getLanguageName(track.language);
            label = langName || track.language.toUpperCase();
        }
        option.textContent = label + (track.enabled ? ' ✓' : '');
        audioSelect.appendChild(option);
        
        if (track.enabled) audioSelect.value = index;
    });
    
    audioSelect.onchange = function() {
        changeMobileAudio(this.value);
    };
}

function updateSubtitleSelector() {
    const subtitleSelect = document.getElementById('mobile-subtitle-select');
    if (!subtitleSelect || availableSubtitles.length === 0) return;
    
    subtitleSelect.innerHTML = '';
    availableSubtitles.forEach((sub) => {
        const option = document.createElement('option');
        option.value = sub.id;
        
        let label = sub.label;
        if (sub.language && sub.language !== 'none' && sub.language !== 'und') {
            const langName = getLanguageName(sub.language);
            label = langName || sub.language.toUpperCase();
        }
        option.textContent = label;
        subtitleSelect.appendChild(option);
        
        if (sub.mode === 'showing') subtitleSelect.value = sub.id;
    });
    
    subtitleSelect.onchange = function() {
        changeMobileSubtitle(this.value);
    };
}

function changeMobileQuality(qualityIndex) {
    if (!hls) return;
    try {
        if (qualityIndex === 'auto') {
            hls.currentLevel = -1;
        } else {
            const index = parseInt(qualityIndex);
            if (!isNaN(index) && index >= 0 && index < availableQualities.length) {
                hls.currentLevel = index;
            }
        }
    } catch (error) {
        console.error('Errore cambio qualità:', error);
    }
}

function changeMobileAudio(audioIndex) {
    if (!hls) return;
    try {
        const index = parseInt(audioIndex);
        if (!isNaN(index) && index >= 0 && index < hls.audioTracks.length) {
            hls.audioTrack = index;
            extractAudioFromHls();
        }
    } catch (error) {
        console.error('Errore cambio audio:', error);
    }
}

function changeMobileSubtitle(subtitleId) {
    if (!hls) return;
    try {
        const id = parseInt(subtitleId);
        hls.subtitleTrack = id === -1 ? -1 : id;
        extractSubtitlesFromHls();
    } catch (error) {
        console.error('Errore cambio sottotitoli:', error);
    }
}

function refreshMobilePlayerControls() {
    setTimeout(() => {
        extractAvailableQualities();
        extractAudioTracks();
        extractSubtitles();
    }, 1000);
}

function showMobileQualitySelector() {
    const qualitySelect = document.getElementById('mobile-quality-select');
    if (qualitySelect) {
        qualitySelect.style.display = 'block';
        updateQualitySelector();
    }
}

function showMobileAudioSelector() {
    const audioSelect = document.getElementById('mobile-audio-select');
    if (audioSelect) {
        audioSelect.style.display = 'block';
        updateAudioSelector();
    }
}

function showMobileSubtitleSelector() {
    const subtitleSelect = document.getElementById('mobile-subtitle-select');
    if (subtitleSelect) {
        subtitleSelect.style.display = 'block';
        updateSubtitleSelector();
    }
}

// ============ GESTIONE STAGIONI ED EPISODI ============
async function loadTVSeasonsMobile(tmdbId) {
    try {
        const details = await fetchTMDB(`tv/${tmdbId}`);
        currentMobileSeasons = details.seasons || [];
        
        const seasonSelect = document.getElementById('mobile-season-select');
        const episodesList = document.getElementById('mobile-episodes-list');
        if (!seasonSelect || !episodesList) return;
        
        seasonSelect.innerHTML = '';
        const validSeasons = currentMobileSeasons.filter(s => s.season_number > 0);
        
        validSeasons.forEach(season => {
            const option = document.createElement('option');
            option.value = season.season_number;
            option.textContent = `Stagione ${season.season_number} (${season.episode_count} episodi)`;
            seasonSelect.appendChild(option);
        });
        
        if (validSeasons.length > 0) {
            await loadSeasonEpisodesMobile(tmdbId, validSeasons[0].season_number);
        } else {
            await loadSeasonEpisodesMobile(tmdbId, 1);
        }
        
        seasonSelect.onchange = function() {
            loadSeasonEpisodesMobile(tmdbId, parseInt(this.value));
        };
        
    } catch (error) {
        console.error('Errore caricamento stagioni:', error);
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
        
        const validEpisodes = episodes.filter(e => e.episode_number > 0);
        
        validEpisodes.forEach(episode => {
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
        
        if (validEpisodes.length === 0) {
            episodesList.innerHTML = '<div class="mobile-episode-item">Nessun episodio disponibile</div>';
        }
        
    } catch (error) {
        console.error('Errore caricamento episodi:', error);
        if (typeof showMobileError === 'function') {
            showMobileError('Errore nel caricamento degli episodi');
        }
    }
}

function playTVEpisodeMobile(tmdbId, seasonNumber, episodeNumber) {
    const titleEl = document.getElementById('mobile-player-title');
    if (titleEl) titleEl.textContent = `Stagione ${seasonNumber}, Episodio ${episodeNumber}`;
    playItemMobile(tmdbId, 'tv', seasonNumber, episodeNumber);
}

// ============ UTILITY LINGUE ============
function getLanguageName(code) {
    const languages = {
        'it': 'Italiano', 'en': 'English', 'es': 'Español', 'fr': 'Français',
        'de': 'Deutsch', 'pt': 'Português', 'ru': 'Русский', 'zh': '中文',
        'ja': '日本語', 'ko': '한국어', 'ar': 'العربية', 'hi': 'हिन्दी',
    };
    return languages[code] || code;
}

// ============ TRACKING PROGRESSO ============
function trackVideoProgressMobile(tmdbId, mediaType, videoElement, season = null, episode = null) {
    let storageKey = `videoTime_${mediaType}_${tmdbId}`;
    if (mediaType === "tv" && season !== null && episode !== null) {
        storageKey += `_S${season}_E${episode}`;
    }
    
    if (typeof getFromStorage === 'function') {
        const savedTime = getFromStorage(storageKey);
        if (savedTime && parseFloat(savedTime) > 60) {
            videoElement.currentTime = parseFloat(savedTime);
        }
    }
    
    const saveInterval = setInterval(() => {
        if (!videoElement.paused && !videoElement.ended) {
            const currentTime = videoElement.currentTime;
            if (currentTime > 60 && typeof saveToStorage === 'function') {
                saveToStorage(storageKey, currentTime, 365);
            }
        }
    }, 5000);
    
    videoElement.addEventListener('ended', () => {
        clearInterval(saveInterval);
        localStorage.removeItem(storageKey);
    });
    
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearInterval(saveInterval);
    });
    
    videoElement.addEventListener('timeupdate', () => {
        if (typeof currentMobileSection !== 'undefined' && currentMobileSection === 'continua') {
            if (typeof updateContinuaVisione === 'function') updateContinuaVisione();
        }
    });
    
    cleanupFunctions.push(() => clearInterval(saveInterval));
}

// ============ CHIUSURA E PULIZIA ============
function closePlayerMobile() {
    console.log("Chiusura player mobile...");
    cleanupMobilePlayer();
    
    if (mobilePlayer && typeof mobilePlayer.dispose === 'function') {
        mobilePlayer.dispose();
    }
    if (hls) {
        hls.destroy();
        hls = null;
    }
    
    currentMobileItem = null;
    currentMobileSeasons = [];
    
    const videoElement = document.getElementById('mobile-player-video');
    if (videoElement) videoElement.remove();
    
    if (typeof showHomeMobile === 'function') showHomeMobile();
    if (typeof updateMobileFavCount === 'function') {
        setTimeout(() => updateMobileFavCount(), 300);
    }
}

function cleanupMobilePlayer() {
    cleanupFunctions.forEach(fn => fn());
    cleanupFunctions = [];
    
    if (mobilePlayer) {
        try { mobilePlayer.dispose(); } catch (e) {}
        mobilePlayer = null;
    }
    if (hls) {
        try { hls.destroy(); } catch (e) {}
        hls = null;
    }
    
    const videoContainer = document.querySelector('.mobile-video-container');
    if (videoContainer) {
        videoContainer.innerHTML = '';
        const videoElement = document.createElement('video');
        videoElement.id = 'mobile-player-video';
        videoElement.className = 'hls-video';
        videoElement.setAttribute('controls', '');
        videoElement.setAttribute('preload', 'auto');
        videoElement.setAttribute('playsinline', '');
        videoElement.setAttribute('crossorigin', 'anonymous');
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        videoContainer.appendChild(videoElement);
    }
    
    currentStreamData = null;
    availableAudioTracks = [];
    availableSubtitles = [];
    availableQualities = [];
}

// ============ APERTURA IN PLAYER ESTERNO ============
function openInExternalPlayer(tmdbId, mediaType, season, episode) {
    if (typeof VIXSRC_URL === 'undefined') {
        console.error('VIXSRC_URL non definita');
        return;
    }
    let externalUrl;
    if (mediaType === 'movie') {
        externalUrl = `https://${VIXSRC_URL}/movie/${tmdbId}`;
    } else {
        externalUrl = `https://${VIXSRC_URL}/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
    
    const finalUrl = (typeof applyCorsProxy === 'function') ? applyCorsProxy(externalUrl) : externalUrl;
    window.open(finalUrl, '_blank');
}
