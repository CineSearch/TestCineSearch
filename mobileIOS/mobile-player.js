// mobile-player.js - Gestione player video con HLS.js (COMPLETO, SENZA VIDEO.JS)

// ============ VARIABILI PLAYER ============
let currentMobileItem = null;
let currentMobileSeasons = [];
let mobilePlayer = null;        // Wrapper compatibile con le funzioni esistenti
let hls = null;                 // Istanza HLS.js interna
let currentStreamData = null;
let availableAudioTracks = [];
let availableSubtitles = [];
let availableQualities = [];
let cleanupFunctions = [];      // Per gestire cleanup di listener

// ============ PLAYER FUNCTIONS ============
async function openMobilePlayer(item) {
    // console.log("Apertura player per:", item);
    
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
    if (controls) {
        controls.style.display = 'none';
    }
}

function showAdditionalControls() {
    const controls = document.getElementById('mobile-additional-controls');
    if (controls) {
        controls.style.display = 'flex';
    }
}

// ============ RECUPERO STREAM M3U8 ============
async function getDirectStreamMobile(tmdbId, isMovie, season = null, episode = null) {
    try {
        let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? 'movie' : 'tv'}/${tmdbId}`;
        if (!isMovie && season !== null && episode !== null) {
            vixsrcUrl += `/${season}/${episode}`;
        }
        
        // console.log('Fetching vixsrc URL:', vixsrcUrl);
        
        const proxiedVixsrcUrl = applyCorsProxy(vixsrcUrl);
        const response = await fetch(proxiedVixsrcUrl);
        const html = await response.text();
        
        // Estrai parametri playlist
        const playlistParamsRegex = /window\.masterPlaylist[^:]+params:[^{]+({[^<]+?})/;
        const playlistParamsMatch = html.match(playlistParamsRegex);
        
        if (!playlistParamsMatch) {
            throw new Error('Parametri playlist non trovati');
        }
        
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
        
        if (!playlistUrlMatch) {
            throw new Error('URL playlist non trovato');
        }
        
        const playlistUrl = playlistUrlMatch[1];
        // console.log('Playlist URL trovato:', playlistUrl);
        
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
        
        // console.log('M3U8 URL ottenuto:', m3u8Url);
        
        // DEBUG: Scarica e controlla la playlist M3U8 (opzionale)
        try {
            const m3u8Response = await fetch(applyCorsProxy(m3u8Url));
            const m3u8Content = await m3u8Response.text();
            // console.log('📱 MOBILE - Contenuto M3U8 (prime 500 caratteri):', m3u8Content.substring(0, 500));
            
            const keyLines = m3u8Content.split('\n').filter(line => line.includes('EXT-X-KEY'));
            // console.log('📱 MOBILE - Linee chiave trovate:', keyLines);
        } catch (e) {
            // console.log('📱 MOBILE - Errore lettura M3U8:', e);
        }
        
        return {
            iframeUrl: vixsrcUrl,
            m3u8Url: m3u8Url
        };
        
    } catch (error) {
        console.error('Errore getDirectStreamMobile:', error);
        throw error;
    }
}

// ============ FUNZIONI PLAYER (HLS.js) ============

async function playItemMobile(id, type, season = null, episode = null) {
    // console.log(`Riproduzione ${type} ${id}`, season ? `S${season}E${episode}` : '');
    
    showMobileLoading(true, "Preparazione video...");
    
    // Timeout di sicurezza per evitare caricamento infinito
    const loadingTimeout = setTimeout(() => {
        showMobileLoading(false);
        showMobileError("Timeout: il video impiega troppo tempo a caricarsi. Verifica la connessione.");
    }, 20000);
    
    try {
        // Distrugge player precedente
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
            videoElement.className = 'hls-video'; // classe neutra per eventuali stili
            videoElement.setAttribute('controls', '');
            videoElement.setAttribute('preload', 'auto');
            videoElement.setAttribute('playsinline', '');
            videoElement.setAttribute('webkit-playsinline', '');
            videoElement.setAttribute('x5-playsinline', '');
            videoElement.setAttribute('crossorigin', 'anonymous');
            videoContainer.insertBefore(videoElement, videoContainer.firstChild);
        }
        
        // Ottieni stream M3U8
        const streamData = await getDirectStreamMobile(id, type === 'movie', season, episode);
        currentStreamData = streamData;
        
        if (!streamData || !streamData.m3u8Url) {
            throw new Error('Impossibile ottenere lo stream');
        }
        
        let m3u8Url = streamData.m3u8Url;
        
        // Se la pagina è in HTTPS e l'URL è HTTP, converti in HTTPS (evita mixed content)
        if (window.location.protocol === 'https:' && m3u8Url.startsWith('http:')) {
            m3u8Url = m3u8Url.replace('http:', 'https:');
        }
        
        // Verifica accessibilità (opzionale)
        fetch(m3u8Url, { method: 'HEAD' })
            .then(res => {
                if (!res.ok) console.warn('M3U8 HEAD non OK:', res.status);
            })
            .catch(e => console.warn('M3U8 non accessibile:', e.message));
        
        // Configura HLS.js
        if (Hls.isSupported()) {
            hls = new Hls({
                xhrSetup: (xhr, url) => {
                    // Per le chiavi di crittografia, disabilita i cookie/credenziali
                    if (url.includes('.key') || url.includes('enc.key')) {
                        xhr.withCredentials = false;
                    }
                },
                manifestLoadingTimeOut: 10000,
                levelLoadingTimeOut: 10000,
                fragLoadingTimeOut: 20000,
                debug: false
            });
            
            // Attacca il player al video
            hls.attachMedia(videoElement);
            
            // Quando il media è attaccato, carica la sorgente
            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                // console.log('HLS.js: MEDIA_ATTACHED');
                hls.loadSource(m3u8Url);
            });
            
            // Quando il manifest è caricato, popola qualità, audio, sottotitoli
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                clearTimeout(loadingTimeout);
                // console.log('HLS.js: MANIFEST_PARSED');
                showMobileLoading(false);
                
                // Estrai e aggiorna UI
                extractAvailableQualities();
                extractAudioTracks();
                extractSubtitles();
                
                // Tenta la riproduzione automatica
                videoElement.play().catch(error => {
                    // console.log('📱 Auto-play bloccato, richiede interazione');
                    showMobileInfo('Tocca il video per avviare la riproduzione');
                });
            });
            
            // Gestione errori
            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('HLS.js error:', data);
                if (data.fatal) {
                    clearTimeout(loadingTimeout);
                    showMobileLoading(false);
                    
                    let errorMsg = 'Errore di riproduzione: ';
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            errorMsg += 'problema di rete. Controlla la connessione.';
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            errorMsg += 'formato non supportato.';
                            break;
                        default:
                            errorMsg += data.details || 'errore sconosciuto.';
                    }
                    showMobileError(errorMsg);
                    
                    hls.destroy();
                } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.details === 'manifestLoadError') {
                    clearTimeout(loadingTimeout);
                    showMobileLoading(false);
                    showMobileError('Impossibile caricare la playlist. Verifica che il video sia disponibile.');
                }
            });
            
            // Crea il wrapper compatibile con le funzioni esistenti
            mobilePlayer = createHlsCompatibleWrapper(videoElement, hls);
            
            // Aggiungi listener per aggiornare UI quando cambiano tracce
            videoElement.addEventListener('loadedmetadata', () => {
                // console.log('loadedmetadata');
                refreshMobilePlayerControls();
            });
            
            // Avvia il tracciamento del progresso
            trackVideoProgressMobile(id, type, videoElement, season, episode);
            
        } else {
            // Fallback per browser senza MSE (es. Safari desktop) -> usa native HLS
            // console.log('HLS.js non supportato, uso riproduzione nativa');
            videoElement.src = m3u8Url;
            
            const nativeTimeout = setTimeout(() => {
                showMobileLoading(false);
                showMobileError("Timeout: il video nativo non risponde.");
            }, 15000);
            
            videoElement.addEventListener('loadedmetadata', () => {
                clearTimeout(nativeTimeout);
                clearTimeout(loadingTimeout);
                showMobileLoading(false);
                videoElement.play().catch(e => showMobileInfo('Tocca per riprodurre'));
            });
            
            videoElement.addEventListener('error', (e) => {
                clearTimeout(nativeTimeout);
                clearTimeout(loadingTimeout);
                showMobileLoading(false);
                showMobileError('Errore di riproduzione nativa. Prova con un altro browser.');
            });
            
            mobilePlayer = createNativeWrapper(videoElement);
            trackVideoProgressMobile(id, type, videoElement, season, episode);
        }
        
    } catch (error) {
        clearTimeout(loadingTimeout);
        console.error('📱 Errore riproduzione mobile:', error);
        showMobileLoading(false);
        showMobileError(`Impossibile riprodurre: ${error.message}`);
    }
}

// ============ WRAPPER COMPATIBILE (emula le funzioni attese dal codice) ============

function createHlsCompatibleWrapper(videoElement, hlsInstance) {
    // Mappa le tracce audio HLS.js in oggetti stile atteso
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
    
    // Mappa le tracce sottotitoli
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
    
    // Aggiorna le liste quando cambiano
    hlsInstance.on(Hls.Events.AUDIO_TRACKS_UPDATED, updateAudioTracks);
    hlsInstance.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, updateTextTracks);
    
    // Crea un oggetto che emuli le proprietà di qualità attese (tech_.vhs)
    const qualityMock = {
        playlists: {
            master: {
                playlists: []
            }
        },
        selectPlaylist: (index) => {
            if (index === undefined || index === -1) {
                hlsInstance.currentLevel = -1; // auto
            } else {
                hlsInstance.currentLevel = index;
            }
        }
    };
    
    // Aggiorna la lista qualità quando cambia
    const updateQualities = () => {
        qualityMock.playlists.master.playlists = (hlsInstance.levels || []).map((level, idx) => ({
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
    
    // Esponi i metodi richiesti
    return {
        video: videoElement,
        hls: hlsInstance,
        
        dispose: () => {
            if (hlsInstance) {
                hlsInstance.destroy();
            }
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
        
        tech_: {
            vhs: qualityMock
        },
        
        trigger: (eventName) => {
            // Non necessario, mantenuto per compatibilità
        }
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
        tech_: {
            vhs: {
                playlists: { master: { playlists: [] } },
                selectPlaylist: () => {}
            }
        },
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
                if (!mobilePlayer || !mobilePlayer.tech_ || !mobilePlayer.tech_.vhs) {
                    if (attempts < maxAttempts) {
                        setTimeout(checkVhs, 500);
                    } else {
                        resolve([]);
                    }
                    return;
                }
                
                const vhs = mobilePlayer.tech_.vhs;
                const playlists = vhs.playlists || {};
                const master = playlists.master;
                
                if (!master || !master.playlists || master.playlists.length === 0) {
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
                        const height = playlist.attributes.RESOLUTION ? 
                            playlist.attributes.RESOLUTION.height : 
                            playlist.attributes.HEIGHT || 0;
                        
                        const width = playlist.attributes.RESOLUTION ? 
                            playlist.attributes.RESOLUTION.width : 
                            playlist.attributes.WIDTH || 0;
                        
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
                                index: index,
                                label: label,
                                resolution: `${width}x${height}`,
                                height: height,
                                bandwidth: bandwidth,
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
    
    availableQualities.forEach((quality, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${quality.label} (${quality.resolution})`;
        qualitySelect.appendChild(option);
    });
    
    if (mobilePlayer && mobilePlayer.hls) {
        const currentLevel = mobilePlayer.hls.currentLevel;
        if (currentLevel >= 0 && currentLevel < availableQualities.length) {
            qualitySelect.value = currentLevel;
        } else {
            qualitySelect.value = 'auto';
        }
    }
    
    qualitySelect.onchange = function() {
        changeMobileQuality(this.value);
    };
}

function changeMobileQuality(qualityIndex) {
    if (!mobilePlayer || !mobilePlayer.hls) return;
    
    try {
        if (qualityIndex === 'auto') {
            mobilePlayer.hls.currentLevel = -1;
            // console.log('Qualità impostata su: Auto');
        } else {
            const index = parseInt(qualityIndex);
            if (!isNaN(index) && index >= 0 && index < availableQualities.length) {
                mobilePlayer.hls.currentLevel = index;
                // console.log(`Qualità cambiata a: ${availableQualities[index].label}`);
            }
        }
    } catch (error) {
        console.error('Errore cambio qualità:', error);
    }
}

// ============ GESTIONE LINGUA AUDIO ============
function extractAudioTracks() {
    try {
        if (!mobilePlayer || !mobilePlayer.audioTracks) {
            availableAudioTracks = [];
            return;
        }
        
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
        return availableAudioTracks;
    } catch (error) {
        console.error('Errore estrazione tracce audio:', error);
        availableAudioTracks = [];
        return [];
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
        
        if (track.enabled) {
            audioSelect.value = index;
        }
    });
    
    audioSelect.onchange = function() {
        changeMobileAudio(this.value);
    };
}

function changeMobileAudio(audioIndex) {
    if (!mobilePlayer || !mobilePlayer.hls) return;
    
    try {
        const index = parseInt(audioIndex);
        if (!isNaN(index) && index >= 0 && index < mobilePlayer.hls.audioTracks.length) {
            mobilePlayer.hls.audioTrack = index;
            // console.log(`Audio cambiato a: ${availableAudioTracks[index].label}`);
            updateAudioSelector(); // aggiorna spunta
        }
    } catch (error) {
        console.error('Errore cambio audio:', error);
    }
}

// ============ GESTIONE SOTTOTITOLI ============
function extractSubtitles() {
    try {
        if (!mobilePlayer || !mobilePlayer.textTracks) {
            availableSubtitles = [];
            return;
        }
        
        const textTracks = mobilePlayer.textTracks();
        availableSubtitles = [];
        
        availableSubtitles.push({
            id: -1,
            language: 'none',
            label: 'Nessun sottotitolo',
            mode: 'disabled',
        });
        
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
        return availableSubtitles;
    } catch (error) {
        console.error('Errore estrazione sottotitoli:', error);
        availableSubtitles = [];
        return [];
    }
}

function updateSubtitleSelector() {
    const subtitleSelect = document.getElementById('mobile-subtitle-select');
    if (!subtitleSelect || availableSubtitles.length === 0) return;
    
    subtitleSelect.innerHTML = '';
    
    availableSubtitles.forEach((sub, index) => {
        const option = document.createElement('option');
        option.value = sub.id;
        
        let label = sub.label;
        if (sub.language && sub.language !== 'none' && sub.language !== 'und') {
            const langName = getLanguageName(sub.language);
            label = langName || sub.language.toUpperCase();
        }
        
        option.textContent = label;
        subtitleSelect.appendChild(option);
        
        if (sub.mode === 'showing') {
            subtitleSelect.value = sub.id;
        }
    });
    
    subtitleSelect.onchange = function() {
        changeMobileSubtitle(this.value);
    };
}

function changeMobileSubtitle(subtitleId) {
    if (!mobilePlayer || !mobilePlayer.hls) return;
    
    try {
        const id = parseInt(subtitleId);
        
        if (id === -1) {
            mobilePlayer.hls.subtitleTrack = -1; // disabilita
            // console.log('Sottotitoli disabilitati');
        } else {
            mobilePlayer.hls.subtitleTrack = id;
            // console.log(`Sottotitoli attivati: ${availableSubtitles.find(s => s.id === id)?.label}`);
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
        
        // FILTRA: Rimuovi le stagioni con season_number = 0
        const validSeasons = currentMobileSeasons.filter(season => season.season_number > 0);
        
        validSeasons.forEach((season, index) => {
            const option = document.createElement('option');
            option.value = season.season_number;
            option.textContent = `Stagione ${season.season_number} (${season.episode_count} episodi)`;
            seasonSelect.appendChild(option);
        });
        
        if (validSeasons.length > 0) {
            const firstSeasonNumber = validSeasons[0].season_number;
            await loadSeasonEpisodesMobile(tmdbId, firstSeasonNumber);
        } else {
            console.warn("Nessuna stagione valida trovata, provo con la stagione 1");
            await loadSeasonEpisodesMobile(tmdbId, 1);
        }
        
        seasonSelect.onchange = function() {
            const seasonNumber = parseInt(this.value);
            loadSeasonEpisodesMobile(tmdbId, seasonNumber);
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
        
        // FILTRA: Rimuovi episodi con episode_number = 0
        const validEpisodes = episodes.filter(episode => episode.episode_number > 0);
        
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
    // console.log(`Riproduzione episodio S${seasonNumber}E${episodeNumber}`);
    
    const episodeTitle = `Stagione ${seasonNumber}, Episodio ${episodeNumber}`;
    document.getElementById('mobile-player-title').textContent = episodeTitle;
    
    playItemMobile(tmdbId, 'tv', seasonNumber, episodeNumber);
}

// ============ UTILITY LINGUE ============
function getLanguageName(code) {
    const languages = {
        'it': 'Italiano',
        'en': 'English',
        'es': 'Español',
        'fr': 'Français',
        'de': 'Deutsch',
        'pt': 'Português',
        'ru': 'Русский',
        'zh': '中文',
        'ja': '日本語',
        'ko': '한국어',
        'ar': 'العربية',
        'hi': 'हिन्दी',
    };
    
    return languages[code] || code;
}

// ============ TRACKING PROGRESSO ============
function trackVideoProgressMobile(tmdbId, mediaType, videoElement, season = null, episode = null) {
    let storageKey = `videoTime_${mediaType}_${tmdbId}`;
    if (mediaType === "tv" && season !== null && episode !== null) {
        storageKey += `_S${season}_E${episode}`;
    }
    
    // Riprendi da tempo salvato
    const savedTime = getFromStorage(storageKey);
    if (savedTime && parseFloat(savedTime) > 60) {
        videoElement.currentTime = parseFloat(savedTime);
    }
    
    // Salva progresso ogni 5 secondi
    const saveInterval = setInterval(() => {
        if (!videoElement.paused && !videoElement.ended) {
            const currentTime = videoElement.currentTime;
            if (currentTime > 60) {
                saveToStorage(storageKey, currentTime, 365);
            }
        }
    }, 5000);
    
    // Pulisci intervallo quando il video finisce
    videoElement.addEventListener('ended', () => {
        clearInterval(saveInterval);
        localStorage.removeItem(storageKey);
    });
    
    // Gestione uscita dal player
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearInterval(saveInterval);
        }
    });

    videoElement.addEventListener('timeupdate', () => {
        if (currentMobileSection === 'continua') {
            updateContinuaVisione();
        }
    });
    
    // Aggiungi alla lista di cleanup
    cleanupFunctions.push(() => {
        clearInterval(saveInterval);
    });
}

// ============ CHIUSURA E PULIZIA ============
function closePlayerMobile() {
    // console.log("Chiusura player mobile...");
    cleanupMobilePlayer();

    if (mobilePlayer) {
        mobilePlayer.dispose();
        mobilePlayer = null;
    }
    if (hls) {
        hls.destroy();
        hls = null;
    }
    
    currentMobileItem = null;
    currentMobileSeasons = [];
    
    const videoElement = document.getElementById('mobile-player-video');
    if (videoElement) {
        videoElement.remove();
    }
    
    showHomeMobile();
    
    setTimeout(() => {
        updateMobileFavCount();
    }, 300);
}

function cleanupMobilePlayer() {
    // console.log("🧹 PULIZIA COMPLETA PLAYER MOBILE");
    
    cleanupFunctions.forEach(fn => fn());
    cleanupFunctions = [];
    
    if (mobilePlayer) {
        try {
            mobilePlayer.dispose();
            mobilePlayer = null;
        } catch (e) {
            console.error("Errore durante dispose player:", e);
        }
    }
    
    if (hls) {
        try {
            hls.destroy();
            hls = null;
        } catch (e) {}
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
    let externalUrl;
    
    if (mediaType === 'movie') {
        externalUrl = `https://${VIXSRC_URL}/movie/${tmdbId}`;
    } else {
        externalUrl = `https://${VIXSRC_URL}/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
    
    window.open(applyCorsProxy(externalUrl), '_blank');
}

// ============ NOTA: Le seguenti funzioni devono essere definite globalmente o importate ============
// showMobileSection, fetchTMDB, showMobileLoading, showMobileError, showMobileInfo,
// showHomeMobile, updateMobileFavCount, applyCorsProxy, getFromStorage, saveToStorage,
// VIXSRC_URL, currentMobileSection, updateContinuaVisione