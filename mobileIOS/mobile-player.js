// mobile-player.js - Gestione player video (FIX iOS)

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
            // FIX iOS #1: Avvia immediatamente i film senza timeout
            playItemMobile(item.id, mediaType);
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
        controls.classList.remove('show');
    }
}

function showAdditionalControls() {
    const controls = document.getElementById('mobile-additional-controls');
    if (controls) {
        controls.style.display = 'flex';
        setTimeout(() => {
            controls.classList.add('show');
        }, 10);
    }
}

async function playItemMobile(id, type, season = null, episode = null) {
    // console.log(`Riproduzione ${type} ${id}`, season ? `S${season}E${episode}` : '');
    
    showMobileLoading(true, "Preparazione video...");
    
    try {
        // Distruggi player precedente
        if (mobilePlayer) {
            mobilePlayer.dispose();
            mobilePlayer = null;
        }
        
        const videoContainer = document.querySelector('.mobile-video-container');
        let videoElement = document.getElementById('mobile-player-video');
        
        if (!videoElement) {
            videoElement = document.createElement('video');
            videoElement.id = 'mobile-player-video';
            videoElement.className = 'video-js vjs-default-skin vjs-big-play-centered';
            videoElement.setAttribute('controls', '');
            videoElement.setAttribute('preload', 'auto');
            videoElement.setAttribute('playsinline', '');
            videoElement.setAttribute('webkit-playsinline', ''); // IMPORTANTE per iOS
            videoElement.setAttribute('x5-playsinline', ''); // Per alcuni browser mobile
            videoElement.setAttribute('crossorigin', 'anonymous');
            videoContainer.insertBefore(videoElement, videoContainer.firstChild);
        }
        
        // Ottieni stream M3U8
        const streamData = await getDirectStreamMobile(id, type === 'movie', season, episode);
        currentStreamData = streamData;
        
        if (!streamData || !streamData.m3u8Url) {
            throw new Error('Impossibile ottenere lo stream');
        }
        
        // IMPORTANTE: Controlla se l'M3U8 è accessibile
        const m3u8Url = streamData.m3u8Url;
        // console.log('URL M3U8 originale:', m3u8Url);
        
        // Configura Video.js per iOS
        setupVideoJsXhrHook();
        
        // Configurazione specifica per iOS - FIX #2: disabilita plugin qualità per iOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        const playerOptions = {
            controls: true,
            fluid: true,
            aspectRatio: "16:9",
            playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
            html5: {
                vhs: {
                    overrideNative: !videojs.browser.IS_SAFARI, // Non sovrascrivere su Safari
                    enableLowInitialPlaylist: true,
                    smoothQualityChange: true,
                    useDevicePixelRatio: true,
                    bandwidth: 2000000, // Aumenta bandwidth per iOS
                    withCredentials: false,
                    handleManifestRedirects: true,
                    customTagParsers: [],
                    customTagMappers: [],
                },
                nativeAudioTracks: isIOS, // Usa tracce native su iOS
                nativeVideoTracks: isIOS,
                nativeTextTracks: isIOS
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
                    'fullscreenToggle',
                ],
            },
            liveui: false,
            enableSourceset: true,
            suppressNotSupportedError: false,
            preload: 'auto'
        };
        
        // Inizializza il player
        mobilePlayer = videojs('mobile-player-video', playerOptions);
        
        // IMPORTANTE: Aggiungi gestione errori specifica per iOS
        mobilePlayer.tech_.on('retryplaylist', function() {
            // console.log('📱 iOS - Retry playlist chiamato');
            mobilePlayer.src({
                src: m3u8Url,
                type: 'application/x-mpegURL',
                withCredentials: false
            });
        });
        
        // Imposta la sorgente
        mobilePlayer.src({
            src: m3u8Url,
            type: 'application/x-mpegURL',
            withCredentials: false
        });
        
        // Gestione errori dettagliata
        mobilePlayer.on('error', function (e) {
            const error = mobilePlayer.error();
            console.error('📱 iOS - Video.js error:', error);
            
            switch(error.code) {
                case 1: // MEDIA_ERR_ABORTED
                    // console.log('Utente ha annullato il caricamento');
                    break;
                case 2: // MEDIA_ERR_NETWORK
                    // console.log('Errore di rete, riprovo...');
                    // Riprova una volta
                    setTimeout(() => {
                        mobilePlayer.src({
                            src: m3u8Url,
                            type: 'application/x-mpegURL'
                        });
                    }, 2000);
                    break;
                case 3: // MEDIA_ERR_DECODE
                    // console.log('Errore decodifica - formato non supportato');
                    showMobileError('Formato video non supportato su iOS');
                    break;
                case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                    // console.log('Sorgente non supportata');
                    // Prova a usare il proxy CORS
                    const proxiedUrl = applyCorsProxy(m3u8Url);
                    // console.log('Provo con proxy:', proxiedUrl);
                    mobilePlayer.src({
                        src: proxiedUrl,
                        type: 'application/x-mpegURL'
                    });
                    break;
            }
        });
        
        mobilePlayer.ready(() => {
            showMobileLoading(false);
            // console.log('✅ Player ready su iOS');
            
            // Riproduci automaticamente (iOS potrebbe bloccare)
            const playPromise = mobilePlayer.play();
            
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    // console.log('📱 iOS - Auto-play bloccato, richiede interazione utente');
                    // Mostra messaggio informativo
                    showMobileInfo('Tocca il video per avviare la riproduzione');
                });
            }
            
            // FIX #2: Solo su NON-iOS inizializza il plugin qualità
            if (!isIOS) {
                // Aspetta che VHS sia pronto per estrarre le qualità
                setTimeout(() => {
                    extractAvailableQualities().then(qualities => {
                        if (qualities.length > 0) {
                            // console.log(`✅ ${qualities.length} qualità disponibili`);
                        }
                    });
                }, 2000);
                
                // Estrai tracce audio dopo il caricamento
                setTimeout(() => {
                    extractAudioTracks();
                }, 3000);
                
                // Estrai sottotitoli
                setTimeout(() => {
                    extractSubtitles();
                }, 3000);
            } else {
                // Su iOS usa i controlli nativi
                console.log('📱 iOS - Usando controlli nativi (no plugin qualità)');
            }
        });
        
        // Monitora lo stato del caricamento
        mobilePlayer.on('loadstart', () => {
            // console.log('📱 iOS - Loadstart');
        });
        
        mobilePlayer.on('loadedmetadata', () => {
            // console.log('📱 iOS - Metadata caricati');
        });
        
        mobilePlayer.on('loadeddata', () => {
            // console.log('📱 iOS - Dati caricati');
        });
        
        mobilePlayer.on('canplay', () => {
            // console.log('📱 iOS - Video può essere riprodotto');
        });
        
        mobilePlayer.on('playing', () => {
            // console.log('📱 iOS - Riproduzione iniziata');
        });
        
    } catch (error) {
        console.error('📱 iOS - Errore riproduzione mobile:', error);
        showMobileLoading(false);
        showMobileError(`Impossibile riprodurre: ${error.message}`);
    }
}

function initQualitySelectorPlugin() {
    try {
        // Controlla se il plugin esiste come oggetto globale
        if (typeof window.videojsHlsQualitySelector !== 'undefined') {
            // Registra solo se non è già registrato
            if (typeof videojs.getPlugin('hlsQualitySelector') === 'undefined') {
                videojs.registerPlugin('hlsQualitySelector', window.videojsHlsQualitySelector);
                // console.log('✅ Plugin qualità registrato');
            }
            
            // Applica il plugin
            mobilePlayer.hlsQualitySelector({
                displayCurrentQuality: true,
                placementIndex: 7
            });
            // console.log('✅ Plugin qualità inizializzato');
            return true;
        }
        
        // Se il plugin è già registrato globalmente
        if (typeof videojs.getPlugin('hlsQualitySelector') !== 'undefined') {
            mobilePlayer.hlsQualitySelector({
                displayCurrentQuality: true
            });
            // console.log('✅ Plugin qualità già attivo');
            return true;
        }
        
        console.warn('⚠️ Plugin qualità non trovato');
        return false;
    } catch (error) {
        console.error('Errore inizializzazione plugin qualità:', error);
        return false;
    }
}

// ============ GESTIONE QUALITÀ ============
function extractAvailableQualities() {
    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 20;
        
        function checkVhs() {
            attempts++;
            
            try {
                // METODO CORRETTO per ottenere il tech
                const tech = mobilePlayer.tech_;
                
                if (!tech) {
                    // console.log(`Tentativo ${attempts}: Tech non disponibile`);
                    if (attempts < maxAttempts) {
                        setTimeout(checkVhs, 500);
                    } else {
                        console.warn('❌ Tech non disponibile dopo massimi tentativi');
                        resolve([]);
                    }
                    return;
                }
                
                if (!tech.vhs) {
                    // console.log(`Tentativo ${attempts}: VHS non disponibile`);
                    if (attempts < maxAttempts) {
                        setTimeout(checkVhs, 500);
                    } else {
                        console.warn('❌ VHS non disponibile dopo massimi tentativi');
                        resolve([]);
                    }
                    return;
                }
                
                const vhs = tech.vhs;
                const playlists = vhs.playlists || {};
                const master = playlists.master;
                
                if (!master || !master.playlists) {
                    // console.log(`Tentativo ${attempts}: Master playlist non pronta`);
                    if (attempts < maxAttempts) {
                        setTimeout(checkVhs, 500);
                    } else {
                        console.warn('❌ Master playlist non pronta');
                        resolve([]);
                    }
                    return;
                }
                
                // SUCCESSO: VHS è pronto!
                // console.log(`✅ VHS pronto dopo ${attempts} tentativi`);
                
                availableQualities = [];
                
                // Estrai qualità dalla master playlist
                master.playlists.forEach((playlist, index) => {
                    if (playlist.attributes) {
                        const height = playlist.attributes.RESOLUTION ? 
                            playlist.attributes.RESOLUTION.height : 
                            playlist.attributes.HEIGHT || 0;
                        
                        const width = playlist.attributes.RESOLUTION ? 
                            playlist.attributes.RESOLUTION.width : 
                            playlist.attributes.WIDTH || 0;
                        
                        const bandwidth = playlist.attributes.BANDWIDTH || 0;
                        
                        // Determina etichetta qualità
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
                
                // console.log('Qualità estratte:', availableQualities);
                
                // Aggiorna il dropdown
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
        
        // Inizia il controllo
        // console.log('Inizio estrazione qualità...');
        setTimeout(checkVhs, 1000);
    });
}

function updateQualitySelector() {
    const qualitySelect = document.getElementById('mobile-quality-select');
    if (!qualitySelect) return;
    
    qualitySelect.innerHTML = '';
    
    // Aggiungi opzione automatica
    const autoOption = document.createElement('option');
    autoOption.value = 'auto';
    autoOption.textContent = 'Auto';
    qualitySelect.appendChild(autoOption);
    
    // Aggiungi tutte le qualità disponibili
    availableQualities.forEach((quality, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${quality.label} (${quality.resolution})`;
        qualitySelect.appendChild(option);
    });
    
    // Imposta qualità attuale - METODO CORRETTO
    const tech = mobilePlayer.tech_;
    if (tech && tech.vhs) {
        try {
            const currentQuality = tech.vhs.selectPlaylist();
            if (currentQuality !== -1 && currentQuality < availableQualities.length) {
                qualitySelect.value = currentQuality;
            }
        } catch (e) {
            // console.log('Impossibile ottenere qualità corrente:', e);
        }
    }
    
    // Aggiungi evento change
    qualitySelect.onchange = function() {
        changeMobileQuality(this.value);
    };
}

function changeMobileQuality(qualityIndex) {
    // METODO CORRETTO per ottenere il VHS
    const tech = mobilePlayer.tech_;
    if (!tech || !tech.vhs) return;
    
    try {
        const vhs = tech.vhs;
        
        if (qualityIndex === 'auto') {
            // Modalità automatica
            vhs.playlists.media();
            // console.log('Qualità impostata su: Auto');
        } else {
            const index = parseInt(qualityIndex);
            if (!isNaN(index) && index >= 0 && index < availableQualities.length) {
                vhs.playlists.media(index);
                // console.log(`Qualità cambiata a: ${availableQualities[index].label}`);
            }
        }
        
        // Forza aggiornamento
        mobilePlayer.trigger('loadstart');
    } catch (error) {
        console.error('Errore cambio qualità:', error);
    }
}

// ============ GESTIONE LINGUA AUDIO ============
function extractAudioTracks() {
    try {
        if (!mobilePlayer || !mobilePlayer.audioTracks) {
            // console.log('Tracce audio non disponibili');
            availableAudioTracks = [];
            return;
        }
        
        const audioTracks = mobilePlayer.audioTracks();
        availableAudioTracks = [];
        
        for (let i = 0; i < audioTracks.length; i++) {
            const track = audioTracks[i];
            availableAudioTracks.push({
                id: track.id || i,
                language: track.language || 'und',
                label: track.label || `Audio ${i + 1}`,
                enabled: track.enabled || false,
            });
        }
        
        // console.log('Tracce audio disponibili:', availableAudioTracks);
        
        // Aggiorna dropdown audio
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
        
        // Formatta etichetta lingua
        let label = track.label;
        if (track.language && track.language !== 'und') {
            const langName = getLanguageName(track.language);
            label = langName || track.language.toUpperCase();
        }
        
        option.textContent = label + (track.enabled ? ' ✓' : '');
        audioSelect.appendChild(option);
        
        // Seleziona traccia attiva
        if (track.enabled) {
            audioSelect.value = index;
        }
    });
    
    // Aggiungi evento change
    audioSelect.onchange = function() {
        changeMobileAudio(this.value);
    };
}

function changeMobileAudio(audioIndex) {
    if (!mobilePlayer || !mobilePlayer.audioTracks || availableAudioTracks.length === 0) return;
    
    try {
        const index = parseInt(audioIndex);
        if (!isNaN(index) && index >= 0 && index < availableAudioTracks.length) {
            const audioTracks = mobilePlayer.audioTracks();
            
            // Disabilita tutte le tracce
            for (let i = 0; i < audioTracks.length; i++) {
                audioTracks[i].enabled = false;
            }
            
            // Abilita traccia selezionata
            if (audioTracks[index]) {
                audioTracks[index].enabled = true;
                // console.log(`Audio cambiato a: ${availableAudioTracks[index].label}`);
                
                // Aggiorna UI
                updateAudioSelector();
            }
        }
    } catch (error) {
        console.error('Errore cambio audio:', error);
    }
}

// ============ GESTIONE SOTTOTITOLI ============
function extractSubtitles() {
    try {
        if (!mobilePlayer || !mobilePlayer.textTracks) {
            // console.log('Tracce testo non disponibili');
            availableSubtitles = [];
            return;
        }
        
        const textTracks = mobilePlayer.textTracks();
        availableSubtitles = [];
        
        for (let i = 0; i < textTracks.length; i++) {
            const track = textTracks[i];
            
            // Filtra solo sottotitoli (non metadata o chapters)
            if (track.kind === 'subtitles' || track.kind === 'captions') {
                availableSubtitles.push({
                    id: track.id || i,
                    language: track.language || 'und',
                    label: track.label || `Sottotitolo ${i + 1}`,
                    mode: track.mode || 'disabled',
                    kind: track.kind
                });
            }
        }
        
        // console.log('Sottotitoli disponibili:', availableSubtitles);
        
        // Aggiorna dropdown sottotitoli
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
    if (!subtitleSelect) return;
    
    subtitleSelect.innerHTML = '';
    
    // Opzione "Nessuno"
    const noneOption = document.createElement('option');
    noneOption.value = 'none';
    noneOption.textContent = 'Nessuno';
    subtitleSelect.appendChild(noneOption);
    
    if (availableSubtitles.length === 0) {
        return;
    }
    
    availableSubtitles.forEach((track, index) => {
        const option = document.createElement('option');
        option.value = index;
        
        // Formatta etichetta lingua
        let label = track.label;
        if (track.language && track.language !== 'und') {
            const langName = getLanguageName(track.language);
            label = langName || track.language.toUpperCase();
        }
        
        option.textContent = label + (track.mode === 'showing' ? ' ✓' : '');
        subtitleSelect.appendChild(option);
        
        // Seleziona traccia attiva
        if (track.mode === 'showing') {
            subtitleSelect.value = index;
        }
    });
    
    // Aggiungi evento change
    subtitleSelect.onchange = function() {
        changeMobileSubtitle(this.value);
    };
}

function changeMobileSubtitle(subtitleIndex) {
    if (!mobilePlayer || !mobilePlayer.textTracks) return;
    
    try {
        const textTracks = mobilePlayer.textTracks();
        
        // Disabilita tutti i sottotitoli
        for (let i = 0; i < textTracks.length; i++) {
            textTracks[i].mode = 'disabled';
        }
        
        if (subtitleIndex !== 'none') {
            const index = parseInt(subtitleIndex);
            if (!isNaN(index) && index >= 0 && index < availableSubtitles.length) {
                // Abilita sottotitolo selezionato
                const trackIndex = availableSubtitles[index].id;
                
                for (let i = 0; i < textTracks.length; i++) {
                    if (textTracks[i].id === trackIndex || i === trackIndex) {
                        textTracks[i].mode = 'showing';
                        // console.log(`Sottotitolo cambiato a: ${availableSubtitles[index].label}`);
                        break;
                    }
                }
                
                // Aggiorna UI
                updateSubtitleSelector();
            }
        }
    } catch (error) {
        console.error('Errore cambio sottotitoli:', error);
    }
}

function getLanguageName(code) {
    const languages = {
        'it': 'Italiano',
        'en': 'Inglese',
        'es': 'Spagnolo',
        'fr': 'Francese',
        'de': 'Tedesco',
        'pt': 'Portoghese',
        'ru': 'Russo',
        'ja': 'Giapponese',
        'zh': 'Cinese',
        'ar': 'Arabo',
        'hi': 'Hindi'
    };
    
    return languages[code] || code.toUpperCase();
}

function showMobileQualitySelector() {
    // Mostra/nascondi selettore qualità
    const selector = document.getElementById('mobile-quality-selector');
    if (selector) {
        selector.style.display = selector.style.display === 'none' ? 'block' : 'none';
    }
}

function showMobileAudioSelector() {
    // Mostra/nascondi selettore audio
    const selector = document.getElementById('mobile-audio-selector');
    if (selector) {
        selector.style.display = selector.style.display === 'none' ? 'block' : 'none';
    }
}

function showMobileSubtitleSelector() {
    // Mostra/nascondi selettore sottotitoli
    const selector = document.getElementById('mobile-subtitle-selector');
    if (selector) {
        selector.style.display = selector.style.display === 'none' ? 'block' : 'none';
    }
}

function refreshMobilePlayerControls() {
    // Aggiorna tutti i selettori
    updateQualitySelector();
    updateAudioSelector();
    updateSubtitleSelector();
}

// ============ GESTIONE SERIE TV ============
async function loadTVSeasonsMobile(tvId) {
    try {
        const tvDetails = await fetchTMDB(`tv/${tvId}`);
        currentMobileSeasons = tvDetails.seasons || [];
        
        const seasonSelect = document.getElementById('mobile-season-select');
        const episodeSelect = document.getElementById('mobile-episode-select');
        
        if (!seasonSelect || !episodeSelect) return;
        
        seasonSelect.innerHTML = '';
        
        // Popola stagioni (escludi specials se season_number = 0)
        currentMobileSeasons.forEach(season => {
            if (season.season_number > 0) {
                const option = document.createElement('option');
                option.value = season.season_number;
                option.textContent = `Stagione ${season.season_number}`;
                seasonSelect.appendChild(option);
            }
        });
        
        // Carica episodi della prima stagione
        if (currentMobileSeasons.length > 0) {
            const firstSeason = currentMobileSeasons.find(s => s.season_number > 0);
            if (firstSeason) {
                await loadEpisodesMobile(tvId, firstSeason.season_number);
            }
        }
        
        // Aggiungi event listener per cambio stagione
        seasonSelect.addEventListener('change', async function() {
            await loadEpisodesMobile(tvId, parseInt(this.value));
        });
        
    } catch (error) {
        console.error('Errore caricamento stagioni:', error);
    }
}

async function loadEpisodesMobile(tvId, seasonNumber) {
    try {
        const seasonData = await fetchTMDB(`tv/${tvId}/season/${seasonNumber}`);
        const episodeSelect = document.getElementById('mobile-episode-select');
        
        if (!episodeSelect) return;
        
        episodeSelect.innerHTML = '';
        
        // Popola episodi
        seasonData.episodes.forEach(episode => {
            const option = document.createElement('option');
            option.value = episode.episode_number;
            option.textContent = `${episode.episode_number}. ${episode.name}`;
            episodeSelect.appendChild(option);
        });
        
    } catch (error) {
        console.error('Errore caricamento episodi:', error);
    }
}

function playTVEpisodeMobile(tvId, season, episode) {
    season = season || 1;
    episode = episode || 1;
    
    playItemMobile(tvId, 'tv', season, episode);
}

function handlePlayClick() {
    if (!currentMobileItem) return;
    
    const mediaType = currentMobileItem.media_type || (currentMobileItem.title ? 'movie' : 'tv');
    
    if (mediaType === 'tv') {
        const seasonSelect = document.getElementById('mobile-season-select');
        const episodeSelect = document.getElementById('mobile-episode-select');
        
        const season = seasonSelect ? parseInt(seasonSelect.value) : 1;
        const episode = episodeSelect ? parseInt(episodeSelect.value) : 1;
        
        playTVEpisodeMobile(currentMobileItem.id, season, episode);
    } else {
        playItemMobile(currentMobileItem.id, mediaType);
    }
}

// ============ ESTRAZIONE STREAM M3U8 ============
async function getDirectStreamMobile(tmdbId, isMovie, season = null, episode = null) {
    try {
        let vixsrcUrl;
        
        if (isMovie) {
            vixsrcUrl = `https://${VIXSRC_URL}/movie/${tmdbId}`;
        } else {
            vixsrcUrl = `https://${VIXSRC_URL}/tv/${tmdbId}/${season || 1}/${episode || 1}`;
        }
        
        // console.log('🎬 Estrazione stream da:', vixsrcUrl);
        
        // Fetch della pagina tramite proxy CORS
        const proxyUrl = applyCorsProxy(vixsrcUrl);
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await response.text();
        
        // Cerca window.masterPlaylist nel codice sorgente
        const masterPlaylistMatch = html.match(/window\.masterPlaylist\s*=\s*"([^"]+)"/);
        
        if (!masterPlaylistMatch || !masterPlaylistMatch[1]) {
            throw new Error('Playlist non trovata nella pagina');
        }
        
        let m3u8Url = masterPlaylistMatch[1];
        
        // Decodifica URL (potrebbe essere escapato)
        m3u8Url = m3u8Url.replace(/\\/g, '');
        
        // console.log('✅ Stream M3U8 estratto:', m3u8Url);
        
        return {
            m3u8Url: m3u8Url,
            vixsrcUrl: vixsrcUrl
        };
        
    } catch (error) {
        console.error('❌ Errore estrazione stream:', error);
        throw new Error(`Impossibile estrarre stream: ${error.message}`);
    }
}

function showMobileInfo(message) {
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 20px 30px;
        border-radius: 10px;
        text-align: center;
        z-index: 10000;
        max-width: 80%;
    `;
    infoDiv.innerHTML = `
        <p style="margin: 0;">${message}</p>
    `;
    
    document.body.appendChild(infoDiv);
    
    setTimeout(() => {
        infoDiv.remove();
    }, 3000);
}

// Aggiungi listener per salvare il progresso di visione
window.addEventListener('beforeunload', function() {
    if (mobilePlayer && currentMobileItem) {
        const currentTime = mobilePlayer.currentTime();
        const mediaType = currentMobileItem.media_type || (currentMobileItem.title ? 'movie' : 'tv');
        
        let storageKey = `videoTime_${mediaType}_${currentMobileItem.id}`;
        
        if (mediaType === 'tv') {
            const seasonSelect = document.getElementById('mobile-season-select');
            const episodeSelect = document.getElementById('mobile-episode-select');
            
            const season = seasonSelect ? parseInt(seasonSelect.value) : 1;
            const episode = episodeSelect ? parseInt(episodeSelect.value) : 1;
            
            storageKey += `_S${season}_E${episode}`;
        }
        
        // Salva solo se ha guardato almeno 60 secondi
        if (currentTime > 60) {
            saveToStorage(storageKey, currentTime, 30); // Salva per 30 giorni
        }
    }
});

let cleanupFunctions = [];
function closePlayerMobile() {
    // // console.log("Chiusura player mobile...");
    cleanupMobilePlayer();

    if (mobilePlayer) {
        mobilePlayer.dispose();
        mobilePlayer = null;
    }
    
    currentMobileItem = null;
    currentMobileSeasons = [];
    
    removeVideoJsXhrHook();
    
    // Pulisci elemento video
    const videoElement = document.getElementById('mobile-player-video');
    if (videoElement) {
        videoElement.remove();
    }
    
    showHomeMobile();
    
    // Aggiorna "Continua visione"
    setTimeout(() => {
        updateMobileFavCount();
    }, 300);
}

function cleanupMobilePlayer() {
    // console.log("🧹 PULIZIA COMPLETA PLAYER MOBILE");
    
    // Rimuovi tutti gli event listener
    cleanupFunctions.forEach(fn => fn());
    cleanupFunctions = [];
    
    // Distruggi player Video.js
    if (mobilePlayer) {
        try {
            mobilePlayer.dispose();
            mobilePlayer = null;
        } catch (e) {
            console.error("Errore durante dispose player:", e);
        }
    }
    
    // Pulisci elemento video completamente
    const videoContainer = document.querySelector('.mobile-video-container');
    if (videoContainer) {
        videoContainer.innerHTML = '';
        
        // Crea nuovo elemento video
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
    
    // Resetta tutte le variabili globali
    currentStreamData = null;
    availableAudioTracks = [];
    availableSubtitles = [];
    availableQualities = [];
    playerInitialized = false;
    
    // Rimuovi hook XHR
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