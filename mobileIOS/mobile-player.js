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
    const timeout = setTimeout(() => {
        showMobileLoading(false);
        showMobileError("Timeout: il video non si carica.");
    }, 20000);

    try {
        // Distrugge player precedente
        if (mobilePlayer) { mobilePlayer.dispose(); mobilePlayer = null; }
        if (hls) { hls.destroy(); hls = null; }

        const container = document.querySelector('.mobile-video-container');
        let video = document.getElementById('mobile-player-video');
        if (!video) {
            video = document.createElement('video');
            video.id = 'mobile-player-video';
            video.className = 'hls-video';
            video.setAttribute('controls', '');
            video.setAttribute('preload', 'auto');
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.setAttribute('x5-playsinline', '');
            video.setAttribute('crossorigin', 'anonymous');
            container.prepend(video);
        }

        const stream = await getDirectStreamMobile(id, type === 'movie', season, episode);
        currentStreamData = stream;
        if (!stream?.m3u8Url) throw new Error('Stream non valido');

        let m3u8Url = stream.m3u8Url;
        if (window.location.protocol === 'https:' && m3u8Url.startsWith('http:'))
            m3u8Url = m3u8Url.replace('http:', 'https:');

        // Usa HLS.js se supportato
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            hls = new Hls({
                xhrSetup: (xhr, url) => {
                    if (url.includes('.key') || url.includes('enc.key'))
                        xhr.withCredentials = false;
                },
                manifestLoadingTimeOut: 10000,
                levelLoadingTimeOut: 10000,
                fragLoadingTimeOut: 20000,
                debug: false
            });

            hls.attachMedia(video);

            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                hls.loadSource(m3u8Url);
            });

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                clearTimeout(timeout);
                showMobileLoading(false);
                extractAvailableQualities();
                extractAudioTracks();
                extractSubtitles();
                video.play().catch(() => showMobileInfo('Tocca per riprodurre'));
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    clearTimeout(timeout);
                    showMobileLoading(false);
                    let msg = 'Errore di riproduzione: ';
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR: msg += 'problema di rete.'; break;
                        case Hls.ErrorTypes.MEDIA_ERROR: msg += 'formato non supportato.'; break;
                        default: msg += data.details || 'errore sconosciuto.';
                    }
                    showMobileError(msg);
                    hls.destroy();
                }
            });

            mobilePlayer = createWrapper(video, hls);

            video.addEventListener('loadedmetadata', () => refreshMobilePlayerControls());
            trackVideoProgressMobile(id, type, video, season, episode);
        } else {
            // Fallback nativo (Safari)
            video.src = m3u8Url;
            const nativeTimeout = setTimeout(() => {
                showMobileLoading(false);
                showMobileError("Timeout del player nativo.");
            }, 15000);

            video.addEventListener('loadedmetadata', () => {
                clearTimeout(nativeTimeout);
                clearTimeout(timeout);
                showMobileLoading(false);
                video.play().catch(() => showMobileInfo('Tocca per riprodurre'));
            });

            video.addEventListener('error', () => {
                clearTimeout(nativeTimeout);
                clearTimeout(timeout);
                showMobileLoading(false);
                showMobileError('Errore di riproduzione nativa.');
            });

            mobilePlayer = createNativeWrapper(video);
            trackVideoProgressMobile(id, type, video, season, episode);
        }
    } catch (error) {
        clearTimeout(timeout);
        console.error('Errore playItemMobile:', error);
        showMobileLoading(false);
        showMobileError(`Errore: ${error.message}`);
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
