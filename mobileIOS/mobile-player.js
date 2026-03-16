// mobile-player.js - Gestione player video con HLS.js

// ============ VARIABILI PLAYER ============
let currentMobileItem = null;
let currentMobileSeasons = [];
let hlsPlayer = null; // Istanza HLS.js
let videoElement = null;
let currentStreamData = null;
let availableAudioTracks = [];
let availableSubtitles = [];
let availableQualities = [];

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

async function playItemMobile(id, type, season = null, episode = null) {
    showMobileLoading(true, "Preparazione video...");
    
    try {
        // Distruggi player HLS precedente
        if (hlsPlayer) {
            hlsPlayer.destroy();
            hlsPlayer = null;
        }
        
        const videoContainer = document.querySelector('.mobile-video-container');
        videoElement = document.getElementById('mobile-player-video');
        
        if (!videoElement) {
            videoElement = document.createElement('video');
            videoElement.id = 'mobile-player-video';
            videoElement.className = 'mobile-native-video'; // classe per stili
            videoElement.setAttribute('controls', '');
            videoElement.setAttribute('preload', 'auto');
            videoElement.setAttribute('playsinline', '');
            videoElement.setAttribute('webkit-playsinline', '');
            videoElement.setAttribute('x5-playsinline', '');
            videoElement.setAttribute('crossorigin', 'anonymous');
            videoContainer.prepend(videoElement);
        }
        
        // Ottieni stream M3U8
        const streamData = await getDirectStreamMobile(id, type === 'movie', season, episode);
        currentStreamData = streamData;
        
        if (!streamData || !streamData.m3u8Url) {
            throw new Error('Impossibile ottenere lo stream');
        }
        
        const m3u8Url = streamData.m3u8Url;
        
        // Test accessibilità
        try {
            await fetch(m3u8Url, { method: 'HEAD' });
        } catch (e) {
            console.warn('M3U8 potrebbe non essere accessibile:', e.message);
        }
        
        // Inizializza HLS.js
        if (Hls.isSupported()) {
            hlsPlayer = new Hls({
                maxBufferLength: 30,
                maxMaxBufferLength: 50,
                enableWorker: true,
                debug: false,
            });
            
            hlsPlayer.loadSource(m3u8Url);
            hlsPlayer.attachMedia(videoElement);
            
            hlsPlayer.on(Hls.Events.MANIFEST_PARSED, function() {
                showMobileLoading(false);
                console.log('HLS.js: manifest parsed');
                
                // Estrai qualità disponibili
                extractQualitiesFromHls();
                
                // Avvia riproduzione (potrebbe essere bloccata)
                videoElement.play().catch(e => {
                    showMobileInfo('Tocca il video per avviare la riproduzione');
                });
            });
            
            hlsPlayer.on(Hls.Events.ERROR, function(event, data) {
                console.error('HLS.js error:', data);
                if (data.fatal) {
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            showMobileError('Errore di rete. Riprova più tardi.');
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            showMobileError('Errore di decodifica. Formato non supportato.');
                            break;
                        default:
                            showMobileError('Errore durante la riproduzione.');
                            break;
                    }
                }
            });
        } 
        else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            // Fallback per Safari (supporto nativo HLS)
            videoElement.src = m3u8Url;
            videoElement.addEventListener('loadedmetadata', () => {
                showMobileLoading(false);
                videoElement.play().catch(e => {
                    showMobileInfo('Tocca il video per avviare la riproduzione');
                });
            });
        } 
        else {
            throw new Error('HLS non supportato su questo browser');
        }
        
        // Gestione eventi video nativi
        videoElement.addEventListener('error', function() {
            console.error('Video element error:', videoElement.error);
            showMobileError('Errore nella riproduzione');
        });
        
    } catch (error) {
        console.error('Errore riproduzione mobile:', error);
        showMobileLoading(false);
        showMobileError(`Impossibile riprodurre: ${error.message}`);
    }
}

// Estrae le qualità da HLS.js
function extractQualitiesFromHls() {
    if (!hlsPlayer) return;
    
    const levels = hlsPlayer.levels;
    availableQualities = [];
    
    levels.forEach((level, index) => {
        let label = 'Auto';
        const height = level.height;
        if (height >= 2160) label = '4K';
        else if (height >= 1440) label = 'QHD';
        else if (height >= 1080) label = 'FHD';
        else if (height >= 720) label = 'HD';
        else if (height >= 480) label = 'SD';
        else if (height > 0) label = `${height}p`;
        
        availableQualities.push({
            index: index,
            label: label,
            resolution: `${level.width}x${level.height}`,
            height: height,
            bandwidth: level.bitrate,
        });
    });
    
    updateQualitySelector();
    if (availableQualities.length > 0) {
        showAdditionalControls();
    }
}

function updateQualitySelector() {
    const qualitySelect = document.getElementById('mobile-quality-select');
    if (!qualitySelect) return;
    
    qualitySelect.innerHTML = '';
    
    // Auto
    const autoOption = document.createElement('option');
    autoOption.value = 'auto';
    autoOption.textContent = 'Auto';
    qualitySelect.appendChild(autoOption);
    
    availableQualities.forEach(q => {
        const option = document.createElement('option');
        option.value = q.index;
        option.textContent = `${q.label} (${q.resolution})`;
        qualitySelect.appendChild(option);
    });
    
    // Imposta qualità corrente
    const currentLevel = hlsPlayer ? hlsPlayer.currentLevel : -1;
    qualitySelect.value = currentLevel >= 0 ? currentLevel : 'auto';
    
    qualitySelect.onchange = function() {
        changeMobileQuality(this.value);
    };
}

function changeMobileQuality(value) {
    if (!hlsPlayer) return;
    if (value === 'auto') {
        hlsPlayer.currentLevel = -1;
    } else {
        hlsPlayer.currentLevel = parseInt(value);
    }
}

// ============ GESTIONE LINGUA AUDIO ============
// Nota: HLS.js non fornisce API semplice per tracce audio, ma possiamo provare con audioTracks nativi
function extractAudioTracks() {
    if (!videoElement || !videoElement.audioTracks) {
        availableAudioTracks = [];
        return;
    }
    
    const tracks = videoElement.audioTracks;
    availableAudioTracks = [];
    for (let i = 0; i < tracks.length; i++) {
        availableAudioTracks.push({
            id: i,
            language: tracks[i].language,
            label: tracks[i].label || `Audio ${i+1}`,
            enabled: tracks[i].enabled,
        });
    }
    updateAudioSelector();
}

function updateAudioSelector() {
    const audioSelect = document.getElementById('mobile-audio-select');
    if (!audioSelect) return;
    // Popola select...
    // (implementare se necessario)
}

function changeMobileAudio(index) {
    if (!videoElement || !videoElement.audioTracks) return;
    const tracks = videoElement.audioTracks;
    for (let i = 0; i < tracks.length; i++) {
        tracks[i].enabled = (i === parseInt(index));
    }
}

// ============ GESTIONE SOTTOTITOLI ============
// Simile a audio, usando textTracks
function extractSubtitles() {
    if (!videoElement || !videoElement.textTracks) {
        availableSubtitles = [];
        return;
    }
    
    const tracks = videoElement.textTracks;
    availableSubtitles = [{ id: -1, language: 'none', label: 'Nessun sottotitolo', mode: 'disabled' }];
    for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') {
            availableSubtitles.push({
                id: i,
                language: tracks[i].language,
                label: tracks[i].label || `Sottotitoli ${i+1}`,
                mode: tracks[i].mode,
            });
        }
    }
    updateSubtitleSelector();
}

function updateSubtitleSelector() {
    const subSelect = document.getElementById('mobile-subtitle-select');
    if (!subSelect) return;
    // Popola select...
}

function changeMobileSubtitle(id) {
    if (!videoElement || !videoElement.textTracks) return;
    const tracks = videoElement.textTracks;
    id = parseInt(id);
    for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') {
            tracks[i].mode = (i === id) ? 'showing' : 'disabled';
        }
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
        episodesList.innerHTML = '<div class="mobile-episode-item">Caricamento episodi...</div>';
        
        const seasonData = await fetchTMDB(`tv/${tmdbId}/season/${seasonNumber}`);
        const episodes = seasonData.episodes || [];
        episodesList.innerHTML = '';
        
        const validEpisodes = episodes.filter(e => e.episode_number > 0);
        validEpisodes.forEach(episode => {
            const item = document.createElement('div');
            item.className = 'mobile-episode-item';
            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>Episodio ${episode.episode_number}</strong>
                        <div style="font-size: 12px; color: #aaa;">${episode.name || 'Senza titolo'}</div>
                        ${episode.overview ? `<div style="font-size: 11px;">${episode.overview.substring(0,100)}...</div>` : ''}
                    </div>
                    <button class="mobile-control-btn" onclick="playTVEpisodeMobile(${tmdbId}, ${seasonNumber}, ${episode.episode_number})">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            `;
            item.onclick = (e) => {
                if (!e.target.closest('button')) {
                    playTVEpisodeMobile(tmdbId, seasonNumber, episode.episode_number);
                }
            };
            episodesList.appendChild(item);
        });
        
        if (validEpisodes.length === 0) {
            episodesList.innerHTML = '<div class="mobile-episode-item">Nessun episodio disponibile</div>';
        }
    } catch (error) {
        console.error('Errore caricamento episodi:', error);
        showMobileError('Errore caricamento episodi');
    }
}

function playTVEpisodeMobile(tmdbId, season, episode) {
    document.getElementById('mobile-player-title').textContent = `Stagione ${season}, Episodio ${episode}`;
    playItemMobile(tmdbId, 'tv', season, episode);
}

// ============ FUNZIONI DI UTILITÀ ============
function getLanguageName(code) {
    const map = {
        it: 'Italiano', en: 'English', es: 'Español', fr: 'Français',
        de: 'Deutsch', pt: 'Português', ru: 'Русский', zh: '中文',
        ja: '日本語', ko: '한국어', ar: 'العربية', hi: 'हिन्दी'
    };
    return map[code] || code;
}

// ============ FUNZIONI ESPOSTE PER UI ============
function refreshMobilePlayerControls() {
    setTimeout(() => {
        extractQualitiesFromHls();
        extractAudioTracks();
        extractSubtitles();
    }, 1000);
}

function showMobileQualitySelector() {
    const qs = document.getElementById('mobile-quality-select');
    if (qs) {
        qs.style.display = 'block';
        updateQualitySelector();
    }
}

function showMobileAudioSelector() {
    const as = document.getElementById('mobile-audio-select');
    if (as) {
        as.style.display = 'block';
        updateAudioSelector();
    }
}

function showMobileSubtitleSelector() {
    const ss = document.getElementById('mobile-subtitle-select');
    if (ss) {
        ss.style.display = 'block';
        updateSubtitleSelector();
    }
}

// ============ CHIUSURA PLAYER ============
function closePlayerMobile() {
    if (hlsPlayer) {
        hlsPlayer.destroy();
        hlsPlayer = null;
    }
    if (videoElement) {
        videoElement.remove();
        videoElement = null;
    }
    currentMobileItem = null;
    currentMobileSeasons = [];
    showHomeMobile();
    setTimeout(updateMobileFavCount, 300);
}

// ============ PROXY E STREAM (invariati) ============
async function getDirectStreamMobile(tmdbId, isMovie, season = null, episode = null) {
    // La tua funzione originale, la riporto qui per completezza
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
        
        let playlistParams = JSON.parse(playlistParamsStr);
        
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

function trackVideoProgressMobile(tmdbId, mediaType, videoElement, season = null, episode = null) {
    // Puoi implementare se vuoi salvare progresso
}
