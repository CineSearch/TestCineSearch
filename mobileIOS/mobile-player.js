// mobile-player.js - Gestione player video con HLS.js (COMPLETO)

// ============ VARIABILI PLAYER ============
let currentMobileItem = null;
let currentMobileSeasons = [];
let mobilePlayer = null;        // Wrapper compatibile
let hls = null;                 // Istanza HLS.js interna
let currentStreamData = null;
let availableAudioTracks = [];
let availableSubtitles = [];
let availableQualities = [];
let cleanupFunctions = [];

// ============ PLAYER FUNCTIONS ============
async function openMobilePlayer(item) {
    currentMobileItem = item;
    showMobileSection('mobile-player');
    
    const title = item.title || item.name;
    const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
    
    document.getElementById('mobile-player-title').textContent = title;
    
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
            document.getElementById('mobile-episode-selector').style.display = 'block';
            await loadTVSeasonsMobile(item.id);            
        } else {
            setTimeout(() => playItemMobile(item.id, mediaType), 500);
        }
        
    } catch (error) {
        console.error('Errore caricamento dettagli:', error);
        showMobileError('Errore nel caricamento dei dettagli');
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
    try {
        let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? 'movie' : 'tv'}/${tmdbId}`;
        if (!isMovie && season !== null && episode !== null) {
            vixsrcUrl += `/${season}/${episode}`;
        }
        
        const proxiedVixsrcUrl = applyCorsProxy(vixsrcUrl);
        const response = await fetch(proxiedVixsrcUrl);
        const html = await response.text();
        
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
        
        return { iframeUrl: vixsrcUrl, m3u8Url: m3u8Url };
        
    } catch (error) {
        console.error('Errore getDirectStreamMobile:', error);
        throw error;
    }
}

// ============ FUNZIONI PLAYER (HLS.js) ============
async function playItemMobile(id, type, season = null, episode = null) {
    showMobileLoading(true, "Preparazione video...");
    
    const loadingTimeout = setTimeout(() => {
        showMobileLoading(false);
        showMobileError("Timeout: il video impiega troppo tempo a caricarsi.");
    }, 20000);
    
    try {
        if (mobilePlayer) {
            mobilePlayer.dispose();
            mobilePlayer = null;
        }
        if (hls) {
            hls.destroy();
            hls = null;
        }
        
        const videoContainer = document.querySelector('.mobile-video-container');
        let videoElement = document.getElementById('mobile-player-video');
        
        if (!videoElement) {
            videoElement = document.createElement('video');
            videoElement.id = 'mobile-player-video';
            videoElement.className = 'hls-video';
            videoElement.setAttribute('controls', '');
            videoElement.setAttribute('preload', 'auto');
            videoElement.setAttribute('playsinline', '');
            videoElement.setAttribute('webkit-playsinline', '');
            videoElement.setAttribute('x5-playsinline', '');
            videoElement.setAttribute('crossorigin', 'anonymous');
            videoContainer.insertBefore(videoElement, videoContainer.firstChild);
        }
        
        const streamData = await getDirectStreamMobile(id, type === 'movie', season, episode);
        currentStreamData = streamData;
        
        if (!streamData || !streamData.m3u8Url) {
            throw new Error('Impossibile ottenere lo stream');
        }
        
        let m3u8Url = streamData.m3u8Url;
        
        // Forza HTTPS se la pagina è in HTTPS
        if (window.location.protocol === 'https:' && m3u8Url.startsWith('http:')) {
            m3u8Url = m3u8Url.replace('http:', 'https:');
        }
        
        if (Hls.isSupported()) {
            hls = new Hls({
                xhrSetup: (xhr, url) => {
                    if (url.includes('.key') || url.includes('enc.key')) {
                        xhr.withCredentials = false;
                    }
                },
                manifestLoadingTimeOut: 10000,
                levelLoadingTimeOut: 10000,
                fragLoadingTimeOut: 20000,
                debug: false
            });
            
            hls.attachMedia(videoElement);
            
            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                hls.loadSource(m3u8Url);
            });
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                clearTimeout(loadingTimeout);
                showMobileLoading(false);
                
                extractAvailableQualities();
                extractAudioTracks();
                extractSubtitles();
                
                videoElement.play().catch(() => {
                    showMobileInfo('Tocca il video per avviare la riproduzione');
                });
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('HLS.js error:', data);
                if (data.fatal) {
                    clearTimeout(loadingTimeout);
                    showMobileLoading(false);
                    
                    let errorMsg = 'Errore di riproduzione: ';
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            errorMsg += 'problema di rete.';
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            errorMsg += 'formato non supportato.';
                            break;
                        default:
                            errorMsg += data.details || 'errore sconosciuto.';
                    }
                    showMobileError(errorMsg);
                    hls.destroy();
                }
            });
            
            mobilePlayer = createHlsCompatibleWrapper(videoElement, hls);
            
            videoElement.addEventListener('loadedmetadata', () => {
                refreshMobilePlayerControls();
            });
            
            trackVideoProgressMobile(id, type, videoElement, season, episode);
            
        } else {
            // Fallback nativo (Safari)
            videoElement.src = m3u8Url;
            
            const nativeTimeout = setTimeout(() => {
                showMobileLoading(false);
                showMobileError("Timeout: il video nativo non risponde.");
            }, 15000);
            
            videoElement.addEventListener('loadedmetadata', () => {
                clearTimeout(nativeTimeout);
                clearTimeout(loadingTimeout);
                showMobileLoading(false);
                videoElement.play().catch(() => showMobileInfo('Tocca per riprodurre'));
            });
            
            videoElement.addEventListener('error', () => {
                clearTimeout(nativeTimeout);
                clearTimeout(loadingTimeout);
                showMobileLoading(false);
                showMobileError('Errore di riproduzione nativa.');
            });
            
            mobilePlayer = createNativeWrapper(videoElement);
            trackVideoProgressMobile(id, type, videoElement, season, episode);
        }
        
    } catch (error) {
        clearTimeout(loadingTimeout);
        console.error('Errore riproduzione:', error);
        showMobileLoading(false);
        showMobileError(`Impossibile riprodurre: ${error.message}`);
    }
}

// ============ WRAPPER COMPATIBILE ============
function createHlsCompatibleWrapper(videoElement, hlsInstance) {
    const audioTracksList = [];
    const updateAudioTracks = () => {
        audioTracksList.length = 0;
        if (hlsInstance.audioTracks) {
            hlsInstance.audioTracks.forEach((track, index) => {
                audioTracksList.push({
                    id: track.id || index,
                    language: track.lang || 'und',
                    label: track.name || `Audio ${index + 1}`,
                    enabled: index === hlsInstance.audioTrack,
                });
            });
        }
    };
    
    const textTracksList = [];
    const updateTextTracks = () => {
        textTracksList.length = 0;
        if (hlsInstance.subtitleTracks) {
            hlsInstance.subtitleTracks.forEach((track, index) => {
                textTracksList.push({
                    id: track.id || index,
                    language: track.lang || 'und',
                    label: track.name || `Sottotitoli ${index + 1}`,
                    mode: index === hlsInstance.subtitleTrack ? 'showing' : 'disabled',
                });
            });
        }
    };
    
    hlsInstance.on(Hls.Events.AUDIO_TRACKS_UPDATED, updateAudioTracks);
    hlsInstance.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, updateTextTracks);
    
    const qualityMock = {
        playlists: {
            master: { playlists: [] }
        },
        selectPlaylist: (index) => {
            if (index === undefined || index === -1) {
                hlsInstance.currentLevel = -1;
            } else {
                hlsInstance.currentLevel = index;
            }
        }
    };
    
    const updateQualities = () => {
        qualityMock.playlists.master.playlists = (hlsInstance.levels || []).map((level) => ({
            attributes: {
                RESOLUTION: {
                    height: level.height || 0,
                    width: level.width || 0
                },
                BANDWIDTH: level.bitrate || 0
            },
            height: level.height,
            width: level.width,
            bitrate: level.bitrate
        }));
    };
    hlsInstance.on(Hls.Events.LEVEL_LOADED, updateQualities);
    hlsInstance.on(Hls.Events.LEVEL_UPDATED, updateQualities);
    
    return {
        video: videoElement,
        hls: hlsInstance,
        dispose: () => {
            hlsInstance.destroy();
            videoElement.pause();
            videoElement.removeAttribute('src');
            videoElement.load();
        },
        audioTracks: () => {
            updateAudioTracks();
            const tracks = audioTracksList.slice();
            tracks.length = audioTracksList.length;
            return tracks;
        },
        textTracks: () => {
            updateTextTracks();
            const tracks = textTracksList.slice();
            tracks.length = textTracksList.length;
            return tracks;
        },
        tech_: { vhs: qualityMock },
        trigger: () => {}
    };
}

function createNativeWrapper(videoElement) {
    return {
        video: videoElement,
        dispose: () => {
            videoElement.pause();
            videoElement.removeAttribute('src');
            videoElement.load();
        },
        audioTracks: () => [],
        textTracks: () => [],
        tech_: { vhs: { playlists: { master: { playlists: [] } }, selectPlaylist: () => {} } },
        trigger: () => {}
    };
}

// ============ GESTIONE QUALITÀ ============
function extractAvailableQualities() {
    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 20;
        
        function checkVhs() {
            attempts++;
            try {
                if (!mobilePlayer?.tech_?.vhs) {
                    if (attempts < maxAttempts) {
                        setTimeout(checkVhs, 500);
                    } else {
                        resolve([]);
                    }
                    return;
                }
                
                const vhs = mobilePlayer.tech_.vhs;
                const master = vhs.playlists?.master;
                
                if (!master?.playlists?.length) {
                    if (attempts < maxAttempts) {
                        setTimeout(checkVhs, 500);
                    } else {
                        resolve([]);
                    }
                    return;
                }
                
                availableQualities = [];
                master.playlists.forEach((playlist, index) => {
                    if (playlist.attributes) {
                        const height = playlist.attributes.RESOLUTION?.height || playlist.attributes.HEIGHT || 0;
                        const width = playlist.attributes.RESOLUTION?.width || playlist.attributes.WIDTH || 0;
                        const bandwidth = playlist.attributes.BANDWIDTH || 0;
                        
                        let label = 'Auto';
                        if (height >= 2160) label = '4K';
                        else if (height >= 1440) label = 'QHD';
                        else if (height >= 1080) label = 'FHD';
                        else if (height >= 720) label = 'HD';
                        else if (height >= 480) label = 'SD';
                        else if (height > 0) label = `${height}p`;
                        
                        if (label !== 'Auto') {
                            availableQualities.push({
                                index, label,
                                resolution: `${width}x${height}`,
                                height, bandwidth
                            });
                        }
                    }
                });
                
                updateQualitySelector();
                resolve(availableQualities);
                
            } catch (error) {
                if (attempts < maxAttempts) {
                    setTimeout(checkVhs, 500);
                } else {
                    resolve([]);
                }
            }
        }
        setTimeout(checkVhs, 1000);
    });
}

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
    
    if (mobilePlayer?.hls) {
        const currentLevel = mobilePlayer.hls.currentLevel;
        qualitySelect.value = (currentLevel >= 0 && currentLevel < availableQualities.length) ? currentLevel : 'auto';
    }
    
    qualitySelect.onchange = function() {
        changeMobileQuality(this.value);
    };
}

function changeMobileQuality(qualityIndex) {
    if (!mobilePlayer?.hls) return;
    
    try {
        if (qualityIndex === 'auto') {
            mobilePlayer.hls.currentLevel = -1;
        } else {
            const index = parseInt(qualityIndex);
            if (!isNaN(index) && index >= 0 && index < availableQualities.length) {
                mobilePlayer.hls.currentLevel = index;
            }
        }
    } catch (error) {
        console.error('Errore cambio qualità:', error);
    }
}

// ============ GESTIONE AUDIO ============
function extractAudioTracks() {
    if (!mobilePlayer?.audioTracks) {
        availableAudioTracks = [];
        return;
    }
    
    try {
        const tracks = mobilePlayer.audioTracks();
        availableAudioTracks = [];
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            availableAudioTracks.push({
                id: track.id || i,
                language: track.language || 'und',
                label: track.label || `Audio ${i + 1}`,
                enabled: track.enabled || false,
            });
        }
        updateAudioSelector();
    } catch (error) {
        console.error('Errore estrazione tracce audio:', error);
        availableAudioTracks = [];
    }
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

function changeMobileAudio(audioIndex) {
    if (!mobilePlayer?.hls) return;
    
    try {
        const index = parseInt(audioIndex);
        if (!isNaN(index) && index >= 0 && index < mobilePlayer.hls.audioTracks.length) {
            mobilePlayer.hls.audioTrack = index;
            updateAudioSelector();
        }
    } catch (error) {
        console.error('Errore cambio audio:', error);
    }
}

// ============ GESTIONE SOTTOTITOLI ============
function extractSubtitles() {
    if (!mobilePlayer?.textTracks) {
        availableSubtitles = [];
        return;
    }
    
    try {
        const textTracks = mobilePlayer.textTracks();
        availableSubtitles = [];
        availableSubtitles.push({ id: -1, language: 'none', label: 'Nessun sottotitolo', mode: 'disabled' });
        
        for (let i = 0; i < textTracks.length; i++) {
            const track = textTracks[i];
            if (track.kind === 'subtitles' || track.kind === 'captions') {
                availableSubtitles.push({
                    id: i,
                    language: track.language || 'und',
                    label: track.label || `Sottotitoli ${i + 1}`,
                    mode: track.mode || 'disabled',
                });
            }
        }
        updateSubtitleSelector();
    } catch (error) {
        console.error('Errore estrazione sottotitoli:', error);
        availableSubtitles = [];
    }
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

function changeMobileSubtitle(subtitleId) {
    if (!mobilePlayer?.hls) return;
    
    try {
        const id = parseInt(subtitleId);
        if (id === -1) {
            mobilePlayer.hls.subtitleTrack = -1;
        } else {
            mobilePlayer.hls.subtitleTrack = id;
        }
        updateSubtitleSelector();
    } catch (error) {
        console.error('Errore cambio sottotitoli:', error);
    }
}

// ============ FUNZIONI DI REFRESH ============
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
        showMobileError('Errore nel caricamento degli episodi');
    }
}

function playTVEpisodeMobile(tmdbId, seasonNumber, episodeNumber) {
    document.getElementById('mobile-player-title').textContent = `Stagione ${seasonNumber}, Episodio ${episodeNumber}`;
    playItemMobile(tmdbId, 'tv', seasonNumber, episodeNumber);
}

// ============ UTILITY ============
function getLanguageName(code) {
    const languages = {
        'it': 'Italiano', 'en': 'English', 'es': 'Español', 'fr': 'Français',
        'de': 'Deutsch', 'pt': 'Português', 'ru': 'Русский', 'zh': '中文',
        'ja': '日本語', 'ko': '한국어', 'ar': 'العربية', 'hi': 'हिन्दी',
    };
    return languages[code] || code;
}

function trackVideoProgressMobile(tmdbId, mediaType, videoElement, season = null, episode = null) {
    let storageKey = `videoTime_${mediaType}_${tmdbId}`;
    if (mediaType === "tv" && season !== null && episode !== null) {
        storageKey += `_S${season}_E${episode}`;
    }
    
    const savedTime = getFromStorage(storageKey);
    if (savedTime && parseFloat(savedTime) > 60) {
        videoElement.currentTime = parseFloat(savedTime);
    }
    
    const saveInterval = setInterval(() => {
        if (!videoElement.paused && !videoElement.ended) {
            const currentTime = videoElement.currentTime;
            if (currentTime > 60) {
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
        if (currentMobileSection === 'continua') updateContinuaVisione();
    });
    
    cleanupFunctions.push(() => clearInterval(saveInterval));
}

// ============ CHIUSURA ============
function closePlayerMobile() {
    cleanupMobilePlayer();
    if (mobilePlayer) mobilePlayer.dispose();
    if (hls) hls.destroy();
    
    currentMobileItem = null;
    currentMobileSeasons = [];
    
    const videoElement = document.getElementById('mobile-player-video');
    if (videoElement) videoElement.remove();
    
    showHomeMobile();
    setTimeout(() => updateMobileFavCount(), 300);
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

function openInExternalPlayer(tmdbId, mediaType, season, episode) {
    let externalUrl = `https://${VIXSRC_URL}/${mediaType === 'movie' ? 'movie' : 'tv'}/${tmdbId}`;
    if (mediaType !== 'movie') externalUrl += `/${season || 1}/${episode || 1}`;
    window.open(applyCorsProxy(externalUrl), '_blank');
}
