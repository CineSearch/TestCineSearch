// mobile-continua.js - Gestione "Continua Visione"

function showContinuaMobile() {
    showMobileSection('mobile-continua');
    loadContinuaMobile();
}

async function loadContinuaMobile() {
    const grid = document.getElementById('mobile-continua-grid');
    const emptyState = document.getElementById('mobile-empty-continua');
    if (!grid) return;

    cleanupExpiredStorage();

    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('videoTime_')) keys.push(k);
    }

    grid.innerHTML = '';
    if (keys.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    // --- parsing + fetch parallele ---
    const items = await Promise.all(keys.map(async (key) => {
        try {
            const raw = getFromStorage(key);
            const progress = typeof raw === 'object' ? parseFloat(raw.value) : parseFloat(raw);
            if (!progress || progress < 60) return null;

            // videoTime_tv_123_S1_E1
            const m = key.match(/^videoTime_(movie|tv)_(\d+)(?:_S(\d+)_E(\d+))?$/);
            if (!m) return null;

            const [, mediaType, tmdbId, season, episode] = m;
            const item = await fetchTMDB(`${mediaType}/${tmdbId}`);
            if (!item || !item.id) return null;

            item.media_type = mediaType;
            item.progress = progress;

            if (mediaType === 'tv' && season && episode) {
                item.season = parseInt(season);
                item.episode = parseInt(episode);

                try {
                    const ep = await fetchTMDB(`tv/${tmdbId}/season/${season}/episode/${episode}`);
                    item.episode_title = ep?.name || `Episodio ${episode}`;
                } catch {
                    item.episode_title = `Episodio ${episode}`;
                }
            }

            return item;
        } catch {
            return null;
        }
    }));

    const valid = items.filter(Boolean);

    // ordinamento stabile
    valid.sort((a, b) => b.progress - a.progress);

    if (valid.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    valid.forEach(item => grid.appendChild(createContinueCard(item)));
}

function createContinueCard(item) {
    const card = document.createElement('div');
    card.className = 'mobile-card continue-card';

    const isMovie = item.media_type === 'movie';
    const title = isMovie ? item.title : item.name;

    const imageUrl = item.poster_path
        ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
        : 'https://via.placeholder.com/342x513?text=No+Image';

    const runtimeSec = Number(item.runtime)
        ? item.runtime * 60
        : (isMovie ? 7200 : 2700);

    const progressPercent = Math.min(
        100,
        Math.round((item.progress / runtimeSec) * 100)
    );

    card.innerHTML = `
        <img src="${imageUrl}" class="mobile-card-image">

        <div class="mobile-progress-bar">
            <div class="mobile-progress-fill" style="width:${progressPercent}%"></div>
        </div>

        <div class="mobile-card-content">
            <div class="mobile-card-title">${title}</div>

            <div class="mobile-continua-meta">
                <span>${Math.round(item.progress / 60)} min</span>
                ${!isMovie ? `<span>S${item.season} E${item.episode}</span>` : ''}
            </div>

            <div class="mobile-card-buttons">
                <button onclick="playContinueItem(${item.id}, '${item.media_type}', ${item.season || 1}, ${item.episode || 1}, event)">
                    ▶
                </button>
                <button onclick="removeContinueItem(${item.id}, '${item.media_type}', ${item.season || null}, ${item.episode || null}, this)">
                    🗑
                </button>
            </div>
        </div>
    `;

    card.addEventListener('click', e => {
        if (!e.target.closest('button')) {
            playContinueItem(item.id, item.media_type, item.season || 1, item.episode || 1);
        }
    });

    return card;
}

async function playContinueItem(tmdbId, mediaType, season = 1, episode = 1) {
    console.log(`Riproduci "Continua": ${mediaType} ${tmdbId} S${season}E${episode}`);
    
    try {
        // Carica i dettagli completi
        const details = await fetchTMDB(`${mediaType}/${tmdbId}`);
        details.media_type = mediaType;
        
        // Per serie TV, aggiungi info episodio se disponibile
        if (mediaType === 'tv') {
            details.season = season;
            details.episode = episode;
        }
        
        // Apri il player
        openMobilePlayer(details);
        
        // Per serie TV, avvia immediatamente l'episodio specifico
        if (mediaType === 'tv') {
            setTimeout(() => {
                playTVEpisodeMobile(tmdbId, season, episode);
            }, 1000);
        }
        
    } catch (error) {
        console.error('Errore playContinueItem:', error);
        showMobileError('Errore nel caricamento del contenuto');
    }
}

function removeContinueItem(tmdbId, mediaType, season = null, episode = null, btn) {
    let key = `videoTime_${mediaType}_${tmdbId}`;
    if (mediaType === 'tv' && season && episode) {
        key += `_S${season}_E${episode}`;
    }

    localStorage.removeItem(key);

    const card = btn.closest('.mobile-card');
    if (card) card.remove();
}

// Aggiungi questa funzione a mobile-player.js per aggiornare "Continua Visione" quando si guarda un video
function updateContinuaVisione() {
    if (currentMobileSection === 'continua') {
        loadContinuaMobile();
    }
}

// Esponi la funzione globalmente
window.showContinuaMobile = showContinuaMobile;
window.playContinueItem = playContinueItem;
window.removeContinueItem = removeContinueItem;
window.handlePlayClick = handlePlayClick;