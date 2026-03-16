// mobile-player.js - Gestione player video con HLS.js

// ============ VARIABILI PLAYER ============
let currentMobileItem = null;
let currentMobileSeasons = [];
let mobilePlayer = null;        // Ora sarà il nostro wrapper compatibile con Video.js
let hls = null;                 // Istanza HLS.js interna
let currentStreamData = null;
let availableAudioTracks = [];
let availableSubtitles = [];
let availableQualities = [];

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
        
        // DEBUG: Scarica e controlla la playlist M3U8
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

// ============ FUNZIONI PLAYER (RISCITTE PER HLS.js) ============

/**
 * Sostituisce playItemMobile originale con versione HLS.js
 * Mantiene la stessa firma e comportamento esterno.
 */
async function playItemMobile(id, type, season = null, episode = null) {
    // console.log(`Riproduzione ${type} ${id}`, season ? `S${season}E${episode}` : '');
    
    showMobileLoading(true, "Preparazione video...");
    
    try {
        // Distrugge player precedente (se esiste)
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
            videoElement.className = 'video-js vjs-default-skin vjs-big-play-centered'; // manteniamo classe per CSS
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
        
        const m3u8Url = streamData.m3u8Url;
        // console.log('URL M3U8 originale:', m3u8Url);
        
        // Verifica accessibilità (opzionale)
        try {
            const testResponse = await fetch(m3u8Url, { method: 'HEAD' });
            // console.log('Test accessibilità M3U8:', testResponse.status);
        } catch (e) {
            console.warn('M3U8 potrebbe non essere accessibile:', e.message);
        }
        
        // Configura HLS.js
        if (Hls.isSupported()) {
            hls = new Hls({
                // Opzioni per gestire CORS e crittografia
                xhrSetup: (xhr, url) => {
                    // Personalizza le richieste XHR se necessario (es. per chiavi)
                    if (url.includes('.key') || url.includes('enc.key')) {
                        // Per le chiavi, a volte serve un trattamento speciale
                        xhr.withCredentials = false;
                    }
                },
                // Loader personalizzato per gestire proxy CORS (opzionale, manteniamo l'hook esistente)
                // ... eventualmente integra la logica di xhrRequestHook
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
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            // console.log('Errore di rete, tenta il recupero...');
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            // console.log('Errore media, tenta il recupero...');
                            hls.recoverMediaError();
                            break;
                        default:
                            // Errore fatale non recuperabile
                            showMobileError('Errore di riproduzione: ' + data.details);
                            hls.destroy();
                            break;
                    }
                }
            });
            
            // Crea il wrapper mobilePlayer compatibile con Video.js
            mobilePlayer = createVideoJsCompatibleWrapper(videoElement, hls);
            
            // Aggiungi listener per aggiornare UI quando cambiano tracce
            videoElement.addEventListener('loadedmetadata', () => {
                // console.log('loadedmetadata');
                refreshMobilePlayerControls();
            });
            
        } else {
            // Fallback per browser senza MSE (es. Safari desktop) -> usa native HLS
            // console.log('HLS.js non supportato, uso riproduzione nativa');
            videoElement.src = m3u8Url;
            videoElement.addEventListener('loadedmetadata', () => {
                showMobileLoading(false);
                // Non possiamo estrarre qualità/tracce con HLS nativo, ma almeno funziona
                videoElement.play().catch(e => showMobileInfo('Tocca per riprodurre'));
            });
            videoElement.addEventListener('error', (e) => {
                console.error('Errore video nativo:', e);
                showMobileError('Errore di riproduzione nativa');
            });
            // Crea un wrapper minimale senza funzionalità avanzate
            mobilePlayer = createNativeWrapper(videoElement);
        }
        
    } catch (error) {
        console.error('📱 Errore riproduzione mobile:', error);
        showMobileLoading(false);
        showMobileError(`Impossibile riprodurre: ${error.message}`);
    }
}

// ============ WRAPPER COMPATIBILE CON VIDEO.JS ============

/**
 * Crea un oggetto che emula le proprietà di Video.js usate dal codice esistente.
 */
function createVideoJsCompatibleWrapper(videoElement, hlsInstance) {
    // Mappa le tracce audio HLS.js in oggetti stile Video.js
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
    
    // Crea l'oggetto tech_.vhs finto per qualità
    const vhsMock = {
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
        vhsMock.playlists.master.playlists = (hlsInstance.levels || []).map((level, idx) => ({
            attributes: {
                RESOLUTION: {
                    height: level.height || 0,
                    width: level.width || 0
                },
                BANDWIDTH: level.bitrate || 0
            },
            // Altri campi utili
            height: level.height,
            width: level.width,
            bitrate: level.bitrate
        }));
    };
    hlsInstance.on(Hls.Events.LEVEL_LOADED, updateQualities);
    hlsInstance.on(Hls.Events.LEVEL_UPDATED, updateQualities);
    
    // Esponi i metodi richiesti
    return {
        // Proprietà usate dal codice
        video: videoElement,
        hls: hlsInstance,
        
        // Metodo dispose per pulizia
        dispose: () => {
            if (hlsInstance) {
                hlsInstance.destroy();
            }
            // Rimuovi eventi
            videoElement.pause();
            videoElement.removeAttribute('src');
            videoElement.load();
        },
        
        // audioTracks() restituisce un oggetto array-like con metodo length e accesso indicizzato
        audioTracks: () => {
            updateAudioTracks();
            const tracks = audioTracksList.slice(); // copia
            tracks.length = audioTracksList.length;
            return tracks;
        },
        
        // textTracks() simile
        textTracks: () => {
            updateTextTracks();
            const tracks = textTracksList.slice();
            tracks.length = textTracksList.length;
            return tracks;
        },
        
        // Oggetto tech_ con vhs
        tech_: {
            vhs: vhsMock
        },
        
        // Trigger di eventi (utile per alcune funzioni)
        trigger: (eventName) => {
            // Emula il trigger di Video.js, per ora vuoto
            // console.log('trigger richiesto:', eventName);
        }
    };
}

/**
 * Wrapper minimale per browser che non supportano HLS.js (riproduzione nativa).
 */
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

// ============ FUNZIONI DI ESTRAZIONE QUALITÀ / AUDIO / SOTTOTITOLI (ADATTATE) ============

// Queste funzioni ora utilizzano il wrapper mobilePlayer invece dell'oggetto Video.js originale.
// Il resto della logica è identico, solo i percorsi per ottenere i dati cambiano.

function extractAvailableQualities() {
    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 20;
        
        function checkVhs() {
            attempts++;
            
            try {
                // Usa il nostro wrapper
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
                
                if (availableQualities.length > 0) {
                    // Eventuale refresh plugin (non serve più)
                }
                
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
    
    // Imposta qualità corrente
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

// ============ FUNZIONI DI REFRESH (invariate) ============
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

// ============ MODIFICHE A closePlayerMobile e cleanup ============
// (Assicurarsi che chiamino hls.destroy() se presente)

function closePlayerMobile() {
    // console.log("Chiusura player mobile...");
    cleanupMobilePlayer();

    if (mobilePlayer) {
        mobilePlayer.dispose(); // ora dispose distrugge anche hls
        mobilePlayer = null;
    }
    if (hls) {
        hls.destroy();
        hls = null;
    }
    
    currentMobileItem = null;
    currentMobileSeasons = [];
    
    removeVideoJsXhrHook(); // eventuale, se ancora usato
    
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
        videoElement.className = 'video-js vjs-theme-cinesearch';
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
    
    removeVideoJsXhrHook();
}

// ============ VIDEO.JS CORS HOOK ============
const xhrRequestHook = (options) => {
    const originalUri = options.uri;
    
    // console.log('📱 MOBILE - xhrRequestHook - URL originale:', originalUri);
    
    if (!originalUri) return options;
    
    // Gestione speciale per chiavi di crittografia
    if (originalUri.includes('/storage/enc.key') || originalUri.includes('.key')) {
        // console.log('📱 MOBILE - Rilevata richiesta chiave di crittografia');
        
        // Usa l'URL diretto senza proxy per le chiavi
        const directUrl = originalUri
            .replace(/^https:\/\/[^\/]+\//, 'https://vixsrc.to/')
            .replace(/^http:\/\/[^\/]+\//, 'http://vixsrc.to/');
        
        // console.log('📱 MOBILE - URL chiave diretto:', directUrl);
        
        options.uri = directUrl;
        
        // Rimuovi header non sicuri che causano errori
        delete options.headers;
        
        // Configurazione CORS minima
        options.cors = true;
        options.withCredentials = false;
        
        return options;
    }
    
    // Per segmenti media (.ts, .m3u8), usa URL diretto
    if (originalUri.includes('.ts') || originalUri.includes('.m3u8')) {
        // console.log('📱 MOBILE - Segmento media, uso URL diretto');
        options.uri = originalUri;
        
        // Configurazione per media
        options.cors = true;
        options.withCredentials = false;
        
        // Non impostare header non sicuri
        const safeHeaders = {};
        if (options.headers) {
            // Filtra solo header sicuri
            const safeHeaderKeys = ['Accept', 'Accept-Language', 'Cache-Control'];
            safeHeaderKeys.forEach(key => {
                if (options.headers[key]) {
                    safeHeaders[key] = options.headers[key];
                }
            });
        }
        
        options.headers = safeHeaders;
        
        return options;
    }
    
    // Per altri URL, mantieni il proxy ma senza header non sicuri
    if (originalUri.includes('corsproxy.io') || 
        originalUri.includes('allorigins.win') || 
        originalUri.includes('api.codetabs.com')) {
        // console.log('📱 MOBILE - URL già proxyato');
        
        // Pulisci header non sicuri
        delete options.headers;
        
        return options;
    }
    
    // Default: applica proxy ma senza header problematici
    // console.log('📱 MOBILE - Applico proxy CORS (senza header non sicuri)');
    const proxyUrl = applyCorsProxy(originalUri);
    options.uri = proxyUrl;
    
    // Rimuovi header non sicuri
    delete options.headers;
    
    return options;
};

// Aggiungi questa funzione per gestire le richieste di chiavi
function fetchEncryptionKey(keyUrl) {
    return new Promise(async (resolve, reject) => {
        try {
            // console.log('📱 MOBILE - Tentativo di fetch chiave:', keyUrl);
            
            // Prova diverse strategie
            const strategies = [
                () => fetch(keyUrl, { mode: 'no-cors' }),
                () => fetch(keyUrl.replace('https://', 'http://'), { mode: 'no-cors' }),
                () => fetch(applyCorsProxy(keyUrl)),
                () => fetch(keyUrl, { 
                    headers: { 
                        'Origin': 'https://vixsrc.to',
                        'Referer': 'https://vixsrc.to/'
                    }
                })
            ];
            
            for (let strategy of strategies) {
                try {
                    const response = await strategy();
                    if (response.ok || response.type === 'opaque') {
                        const arrayBuffer = await response.arrayBuffer();
                        // console.log('📱 MOBILE - Chiave ottenuta, dimensione:', arrayBuffer.byteLength);
                        resolve(arrayBuffer);
                        return;
                    }
                } catch (e) {
                    console.warn('📱 MOBILE - Strategia fallita:', e.message);
                }
            }
            
            reject(new Error('Impossibile ottenere la chiave di crittografia'));
            
        } catch (error) {
            reject(error);
        }
    });
}

function setupVideoJsXhrHook() {
    if (typeof videojs === "undefined" || !videojs.Vhs) {
        return;
    }

    if (requestHookInstalled) {
        return;
    }

    videojs.Vhs.xhr.onRequest(xhrRequestHook);
    requestHookInstalled = true;
}

function removeVideoJsXhrHook() {
    if (typeof videojs !== "undefined" && videojs.Vhs && requestHookInstalled) {
        videojs.Vhs.xhr.offRequest(xhrRequestHook);
        requestHookInstalled = false;
    }
}

function openInExternalPlayer(tmdbId, mediaType, season, episode) {
    let externalUrl;
    
    if (mediaType === 'movie') {
        externalUrl = `https://${VIXSRC_URL}/movie/${tmdbId}`;
    } else {
        externalUrl = `https://${VIXSRC_URL}/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
    
    // Apri in nuova finestra
    window.open(applyCorsProxy(externalUrl), '_blank');
}
