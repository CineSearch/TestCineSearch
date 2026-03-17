// mobile-player.js - Versione HLS.js stabile

// ============ VARIABILI GLOBALI ============
let currentMobileItem = null;
let currentMobileSeasons = [];
let mobilePlayer = null;        // Wrapper compatibile
let hls = null;                 // Istanza HLS.js
let currentStreamData = null;
let availableAudioTracks = [];
let availableSubtitles = [];
let availableQualities = [];
let cleanupFunctions = [];

// ============ APERTURA PLAYER ============
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
            if (details.release_date || details.first_air_date)
                meta.push(new Date(details.release_date || details.first_air_date).getFullYear());
            if (details.vote_average)
                meta.push(`⭐ ${details.vote_average.toFixed(1)}/10`);
            if (details.runtime) {
                const hours = Math.floor(details.runtime / 60);
                const minutes = details.runtime % 60;
                meta.push(`${hours}h ${minutes}m`);
            }
            metaDiv.textContent = meta.join(' • ');
        }

        if (overviewDiv) overviewDiv.textContent = details.overview || "Nessuna descrizione disponibile.";

        if (mediaType === 'tv') {
            document.getElementById('mobile-episode-selector').style.display = 'block';
            await loadTVSeasonsMobile(item.id);
        } else {
            setTimeout(() => playItemMobile(item.id, mediaType), 500);
        }
    } catch (error) {
        console.error('Errore apertura player:', error);
        showMobileError('Errore nel caricamento dei dettagli');
    }
}

function hideAdditionalControls() {
    const c = document.getElementById('mobile-additional-controls');
    if (c) c.style.display = 'none';
}

function showAdditionalControls() {
    const c = document.getElementById('mobile-additional-controls');
    if (c) c.style.display = 'flex';
}

// ============ RECUPERO STREAM ============
async function getDirectStreamMobile(tmdbId, isMovie, season = null, episode = null) {
    try {
        let url = `https://${VIXSRC_URL}/${isMovie ? 'movie' : 'tv'}/${tmdbId}`;
        if (!isMovie && season !== null && episode !== null) url += `/${season}/${episode}`;

        const proxyUrl = applyCorsProxy(url);
        const html = await (await fetch(proxyUrl)).text();

        const paramsMatch = html.match(/window\.masterPlaylist[^:]+params:[^{]+({[^<]+?})/);
        if (!paramsMatch) throw new Error('Parametri playlist non trovati');

        let paramsStr = paramsMatch[1]
            .replace(/'/g, '"')
            .replace(/\s+/g, '')
            .replace(/\n/g, '')
            .replace(/\\n/g, '')
            .replace(',}', '}');

        const params = JSON.parse(paramsStr);

        const urlMatch = html.match(/window\.masterPlaylist\s*=\s*\{[\s\S]*?url:\s*'([^']+)'/);
        if (!urlMatch) throw new Error('URL playlist non trovato');

        const playlistUrl = urlMatch[1];
        const canPlayFHD = (html.match(/window\.canPlayFHD\s+?=\s+?(\w+)/)?.[1] === 'true');

        const separator = /\?/.test(playlistUrl) ? '&' : '?';
        const m3u8Url = `${playlistUrl}${separator}expires=${params.expires}&token=${params.token}${canPlayFHD ? '&h=1' : ''}`;

        return { iframeUrl: url, m3u8Url };
    } catch (error) {
        console.error('getDirectStreamMobile error:', error);
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
            videoElement.className = 'hls-video';
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
        
        // Forza HTTPS se la pagina è in HTTPS
        if (window.location.protocol === 'https:' && m3u8Url.startsWith('http:')) {
            m3u8Url = m3u8Url.replace('http:', 'https:');
        }
        
        if (Hls.isSupported()) {
            // ========== LOADER PERSONALIZZATO PER PROXY CORS ==========
            const CORS_PROXY = document.getElementById('mobile-cors-select')?.value || 'https://corsproxy.io/?';
            
            class CorsLoader extends Hls.DefaultConfig.loader {
                constructor(config) {
                    super(config);
                    const load = this.load.bind(this);
                    this.load = function(context, config, callbacks) {
                        // Applica il proxy a TUTTE le richieste (manifest, segmenti, chiavi)
                        if (context.url && !context.url.startsWith('blob:')) {
                            // Evita di riapplicare il proxy se l'URL è già proxyato
                            if (!context.url.includes(CORS_PROXY)) {
                                context.url = CORS_PROXY + encodeURIComponent(context.url);
                            }
                        }
                        load(context, config, callbacks);
                    };
                }
            }
            
            hls = new Hls({
                loader: CorsLoader,
                xhrSetup: (xhr, url) => {
                    // Disabilita credenziali per chiavi
                    if (url.includes('.key') || url.includes('enc.key')) {
                        xhr.withCredentials = false;
                    }
                },
                manifestLoadingTimeOut: 10000,
                levelLoadingTimeOut: 10000,
                fragLoadingTimeOut: 20000,
                debug: true // Attiva i log per debug (poi puoi toglierli)
            });
            
            hls.attachMedia(videoElement);
            
            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                console.log('HLS.js: MEDIA_ATTACHED, caricamento sorgente:', m3u8Url);
                hls.loadSource(m3u8Url);
            });
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                clearTimeout(loadingTimeout);
                showMobileLoading(false);
                console.log('HLS.js: MANIFEST_PARSED, qualità trovate:', hls.levels);
                
                extractAvailableQualities();
                extractAudioTracks();
                extractSubtitles();
                
                videoElement.play().catch(() => {
                    showMobileInfo('Tocca il video per avviare la riproduzione');
                });
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('HLS.js error:', data);
                
                // Mostra un messaggio di errore dettagliato
                if (data.fatal) {
                    clearTimeout(loadingTimeout);
                    showMobileLoading(false);
                    
                    let errorMsg = 'Errore di riproduzione: ';
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        errorMsg += 'problema di rete. ';
                        if (data.response) {
                            errorMsg += `Status: ${data.response.code}`;
                        } else if (data.url) {
                            errorMsg += `URL: ${data.url}`;
                        }
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        errorMsg += 'formato non supportato.';
                    } else {
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
        console.error('Errore riproduzione:', error);
        showMobileLoading(false);
        showMobileError(`Impossibile riprodurre: ${error.message}`);
    }
}

// ============ WRAPPER PER COMPATIBILITÀ ============
function createWrapper(video, hlsInstance) {
    const audioTracks = [];
    const updateAudio = () => {
        audioTracks.length = 0;
        if (hlsInstance.audioTracks) {
            hlsInstance.audioTracks.forEach((t, i) => {
                audioTracks.push({
                    id: t.id || i,
                    language: t.lang || 'und',
                    label: t.name || `Audio ${i + 1}`,
                    enabled: i === hlsInstance.audioTrack,
                });
            });
        }
    };

    const textTracks = [];
    const updateText = () => {
        textTracks.length = 0;
        if (hlsInstance.subtitleTracks) {
            hlsInstance.subtitleTracks.forEach((t, i) => {
                textTracks.push({
                    id: t.id || i,
                    language: t.lang || 'und',
                    label: t.name || `Sottotitoli ${i + 1}`,
                    mode: i === hlsInstance.subtitleTrack ? 'showing' : 'disabled',
                });
            });
        }
    };

    hlsInstance.on(Hls.Events.AUDIO_TRACKS_UPDATED, updateAudio);
    hlsInstance.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, updateText);

    const qualityMock = {
        playlists: { master: { playlists: [] } },
        selectPlaylist: (idx) => {
            hlsInstance.currentLevel = (idx === undefined || idx === -1) ? -1 : idx;
        }
    };

    const updateQualities = () => {
        qualityMock.playlists.master.playlists = (hlsInstance.levels || []).map(l => ({
            attributes: {
                RESOLUTION: { height: l.height || 0, width: l.width || 0 },
                BANDWIDTH: l.bitrate || 0
            },
            height: l.height,
            width: l.width,
            bitrate: l.bitrate
        }));
    };

    hlsInstance.on(Hls.Events.LEVEL_LOADED, updateQualities);
    hlsInstance.on(Hls.Events.LEVEL_UPDATED, updateQualities);

    return {
        video,
        hls: hlsInstance,
        dispose: () => {
            hlsInstance.destroy();
            video.pause();
            video.removeAttribute('src');
            video.load();
        },
        audioTracks: () => {
            updateAudio();
            const copy = audioTracks.slice();
            copy.length = audioTracks.length;
            return copy;
        },
        textTracks: () => {
            updateText();
            const copy = textTracks.slice();
            copy.length = textTracks.length;
            return copy;
        },
        tech_: { vhs: qualityMock },
        trigger: () => {}
    };
}

function createNativeWrapper(video) {
    return {
        video,
        dispose: () => {
            video.pause();
            video.removeAttribute('src');
            video.load();
        },
        audioTracks: () => [],
        textTracks: () => [],
        tech_: { vhs: { playlists: { master: { playlists: [] } }, selectPlaylist: () => {} } },
        trigger: () => {}
    };
}

// ============ GESTIONE QUALITÀ ============
function extractAvailableQualities() {
    return new Promise(resolve => {
        let attempts = 0;
        const maxAttempts = 20;
        const check = () => {
            attempts++;
            try {
                const vhs = mobilePlayer?.tech_?.vhs;
                if (!vhs) return attempts < maxAttempts ? setTimeout(check, 500) : resolve([]);

                const master = vhs.playlists?.master;
                if (!master?.playlists?.length) return attempts < maxAttempts ? setTimeout(check, 500) : resolve([]);

                availableQualities = master.playlists.map((p, idx) => {
                    const height = p.attributes?.RESOLUTION?.height || p.attributes?.HEIGHT || 0;
                    const width = p.attributes?.RESOLUTION?.width || p.attributes?.WIDTH || 0;
                    let label = 'Auto';
                    if (height >= 2160) label = '4K';
                    else if (height >= 1440) label = 'QHD';
                    else if (height >= 1080) label = 'FHD';
                    else if (height >= 720) label = 'HD';
                    else if (height >= 480) label = 'SD';
                    else if (height > 0) label = `${height}p`;
                    return { index: idx, label, resolution: `${width}x${height}`, height };
                }).filter(q => q.label !== 'Auto');

                updateQualitySelector();
                resolve(availableQualities);
            } catch (e) {
                if (attempts < maxAttempts) setTimeout(check, 500);
                else resolve([]);
            }
        };
        setTimeout(check, 1000);
    });
}

function updateQualitySelector() {
    const sel = document.getElementById('mobile-quality-select');
    if (!sel) return;
    sel.innerHTML = '<option value="auto">Auto</option>';
    availableQualities.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.index;
        opt.textContent = `${q.label} (${q.resolution})`;
        sel.appendChild(opt);
    });
    if (mobilePlayer?.hls) {
        const cur = mobilePlayer.hls.currentLevel;
        sel.value = (cur >= 0 && cur < availableQualities.length) ? cur : 'auto';
    }
    sel.onchange = () => changeMobileQuality(sel.value);
}

function changeMobileQuality(val) {
    if (!mobilePlayer?.hls) return;
    if (val === 'auto') mobilePlayer.hls.currentLevel = -1;
    else {
        const idx = parseInt(val);
        if (!isNaN(idx) && idx >= 0 && idx < availableQualities.length)
            mobilePlayer.hls.currentLevel = idx;
    }
}

// ============ GESTIONE AUDIO ============
function extractAudioTracks() {
    if (!mobilePlayer?.audioTracks) { availableAudioTracks = []; return; }
    try {
        const tracks = mobilePlayer.audioTracks();
        availableAudioTracks = [];
        for (let i = 0; i < tracks.length; i++) {
            const t = tracks[i];
            availableAudioTracks.push({
                id: t.id || i,
                language: t.language || 'und',
                label: t.label || `Audio ${i + 1}`,
                enabled: t.enabled || false,
            });
        }
        updateAudioSelector();
    } catch (e) {
        console.error('Errore audio:', e);
        availableAudioTracks = [];
    }
}

function updateAudioSelector() {
    const sel = document.getElementById('mobile-audio-select');
    if (!sel || !availableAudioTracks.length) return;
    sel.innerHTML = '';
    availableAudioTracks.forEach((t, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        let label = t.label;
        if (t.language && t.language !== 'und') {
            const lang = getLanguageName(t.language);
            label = lang || t.language.toUpperCase();
        }
        opt.textContent = label + (t.enabled ? ' ✓' : '');
        sel.appendChild(opt);
        if (t.enabled) sel.value = i;
    });
    sel.onchange = () => changeMobileAudio(sel.value);
}

function changeMobileAudio(idx) {
    if (!mobilePlayer?.hls) return;
    const index = parseInt(idx);
    if (!isNaN(index) && index >= 0 && index < mobilePlayer.hls.audioTracks.length) {
        mobilePlayer.hls.audioTrack = index;
        updateAudioSelector();
    }
}

// ============ GESTIONE SOTTOTITOLI ============
function extractSubtitles() {
    if (!mobilePlayer?.textTracks) { availableSubtitles = []; return; }
    try {
        const tracks = mobilePlayer.textTracks();
        availableSubtitles = [{ id: -1, language: 'none', label: 'Nessun sottotitolo', mode: 'disabled' }];
        for (let i = 0; i < tracks.length; i++) {
            const t = tracks[i];
            if (t.kind === 'subtitles' || t.kind === 'captions') {
                availableSubtitles.push({
                    id: i,
                    language: t.language || 'und',
                    label: t.label || `Sottotitoli ${i + 1}`,
                    mode: t.mode || 'disabled',
                });
            }
        }
        updateSubtitleSelector();
    } catch (e) {
        console.error('Errore sottotitoli:', e);
        availableSubtitles = [];
    }
}

function updateSubtitleSelector() {
    const sel = document.getElementById('mobile-subtitle-select');
    if (!sel || !availableSubtitles.length) return;
    sel.innerHTML = '';
    availableSubtitles.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        let label = s.label;
        if (s.language && s.language !== 'none' && s.language !== 'und') {
            const lang = getLanguageName(s.language);
            label = lang || s.language.toUpperCase();
        }
        opt.textContent = label;
        sel.appendChild(opt);
        if (s.mode === 'showing') sel.value = s.id;
    });
    sel.onchange = () => changeMobileSubtitle(sel.value);
}

function changeMobileSubtitle(id) {
    if (!mobilePlayer?.hls) return;
    const idx = parseInt(id);
    mobilePlayer.hls.subtitleTrack = (idx === -1) ? -1 : idx;
    updateSubtitleSelector();
}

// ============ REFRESH ============
function refreshMobilePlayerControls() {
    setTimeout(() => {
        extractAvailableQualities();
        extractAudioTracks();
        extractSubtitles();
    }, 1000);
}

function showMobileQualitySelector() {
    const q = document.getElementById('mobile-quality-select');
    if (q) { q.style.display = 'block'; updateQualitySelector(); }
}
function showMobileAudioSelector() {
    const a = document.getElementById('mobile-audio-select');
    if (a) { a.style.display = 'block'; updateAudioSelector(); }
}
function showMobileSubtitleSelector() {
    const s = document.getElementById('mobile-subtitle-select');
    if (s) { s.style.display = 'block'; updateSubtitleSelector(); }
}

// ============ STAGIONI ED EPISODI ============
async function loadTVSeasonsMobile(tmdbId) {
    try {
        const details = await fetchTMDB(`tv/${tmdbId}`);
        currentMobileSeasons = details.seasons || [];
        const seasonSel = document.getElementById('mobile-season-select');
        const episodesDiv = document.getElementById('mobile-episodes-list');
        if (!seasonSel || !episodesDiv) return;

        seasonSel.innerHTML = '';
        const valid = currentMobileSeasons.filter(s => s.season_number > 0);
        valid.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.season_number;
            opt.textContent = `Stagione ${s.season_number} (${s.episode_count} episodi)`;
            seasonSel.appendChild(opt);
        });

        if (valid.length) await loadSeasonEpisodesMobile(tmdbId, valid[0].season_number);
        else await loadSeasonEpisodesMobile(tmdbId, 1);

        seasonSel.onchange = () => loadSeasonEpisodesMobile(tmdbId, parseInt(seasonSel.value));
    } catch (error) {
        console.error('loadTVSeasonsMobile error:', error);
    }
}

async function loadSeasonEpisodesMobile(tmdbId, seasonNumber) {
    try {
        const div = document.getElementById('mobile-episodes-list');
        if (!div) return;
        div.innerHTML = '<div class="mobile-episode-item">Caricamento episodi...</div>';

        const data = await fetchTMDB(`tv/${tmdbId}/season/${seasonNumber}`);
        const episodes = data.episodes || [];
        div.innerHTML = '';

        episodes.filter(e => e.episode_number > 0).forEach(ep => {
            const item = document.createElement('div');
            item.className = 'mobile-episode-item';
            item.innerHTML = `
                <div style="display: flex; justify-content: space-between;">
                    <div>
                        <strong>Episodio ${ep.episode_number}</strong>
                        <div style="font-size:12px; color:#aaa;">${ep.name || ''}</div>
                        ${ep.overview ? `<div style="font-size:11px;">${ep.overview.substring(0,100)}...</div>` : ''}
                    </div>
                    <button class="mobile-control-btn" onclick="playTVEpisodeMobile(${tmdbId},${seasonNumber},${ep.episode_number})">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            `;
            item.onclick = (e) => {
                if (!e.target.closest('button'))
                    playTVEpisodeMobile(tmdbId, seasonNumber, ep.episode_number);
            };
            div.appendChild(item);
        });

        if (!episodes.length) div.innerHTML = '<div class="mobile-episode-item">Nessun episodio</div>';
    } catch (error) {
        console.error('loadSeasonEpisodesMobile error:', error);
        showMobileError('Errore caricamento episodi');
    }
}

function playTVEpisodeMobile(id, s, e) {
    document.getElementById('mobile-player-title').textContent = `Stagione ${s}, Episodio ${e}`;
    playItemMobile(id, 'tv', s, e);
}

// ============ UTILITY ============
function getLanguageName(code) {
    const map = { it:'Italiano', en:'English', es:'Español', fr:'Français', de:'Deutsch', pt:'Português', ru:'Русский', zh:'中文', ja:'日本語', ko:'한국어', ar:'العربية', hi:'हिन्दी' };
    return map[code] || code;
}

function trackVideoProgressMobile(id, type, video, season = null, episode = null) {
    let key = `videoTime_${type}_${id}`;
    if (type === 'tv' && season !== null && episode !== null) key += `_S${season}_E${episode}`;
    const saved = getFromStorage(key);
    if (saved && parseFloat(saved) > 60) video.currentTime = parseFloat(saved);

    const interval = setInterval(() => {
        if (!video.paused && !video.ended && video.currentTime > 60)
            saveToStorage(key, video.currentTime, 365);
    }, 5000);

    video.addEventListener('ended', () => {
        clearInterval(interval);
        localStorage.removeItem(key);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearInterval(interval);
    });

    video.addEventListener('timeupdate', () => {
        if (currentMobileSection === 'continua') updateContinuaVisione();
    });

    cleanupFunctions.push(() => clearInterval(interval));
}

// ============ CHIUSURA E PULIZIA ============
function closePlayerMobile() {
    cleanupMobilePlayer();
    if (mobilePlayer) mobilePlayer.dispose();
    if (hls) hls.destroy();
    currentMobileItem = null;
    currentMobileSeasons = [];
    const v = document.getElementById('mobile-player-video');
    if (v) v.remove();
    showHomeMobile();
    setTimeout(() => updateMobileFavCount(), 300);
}

function cleanupMobilePlayer() {
    cleanupFunctions.forEach(f => f());
    cleanupFunctions = [];
    if (mobilePlayer) { try { mobilePlayer.dispose(); } catch (e) {} mobilePlayer = null; }
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }

    const container = document.querySelector('.mobile-video-container');
    if (container) {
        container.innerHTML = '';
        const vid = document.createElement('video');
        vid.id = 'mobile-player-video';
        vid.className = 'hls-video';
        vid.setAttribute('controls', '');
        vid.setAttribute('preload', 'auto');
        vid.setAttribute('playsinline', '');
        vid.setAttribute('crossorigin', 'anonymous');
        vid.style.width = '100%';
        vid.style.height = '100%';
        container.appendChild(vid);
    }

    currentStreamData = null;
    availableAudioTracks = [];
    availableSubtitles = [];
    availableQualities = [];
}

function openInExternalPlayer(tmdbId, mediaType, season, episode) {
    let url = `https://${VIXSRC_URL}/${mediaType === 'movie' ? 'movie' : 'tv'}/${tmdbId}`;
    if (mediaType !== 'movie') url += `/${season || 1}/${episode || 1}`;
    window.open(applyCorsProxy(url), '_blank');
}
