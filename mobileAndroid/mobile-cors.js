// mobile-cors.js - Gestione CORS proxy (solo CodeTabs + corsproxy.io)

let currentCorsProxy = 'https://api.codetabs.com/v1/proxy?quest=';

const CORS_PROXIES = [
    { name: 'CodeTabs', url: 'https://api.codetabs.com/v1/proxy?quest=' },
    { name: 'CorsProxy.io', url: 'https://corsproxy.io/?' }
];

function initMobileCors() {
    const corsSelect = document.getElementById('mobile-cors-select');
    if (!corsSelect) return;

    // Aggiungi opzioni
    corsSelect.innerHTML = '';
    CORS_PROXIES.forEach(proxy => {
        const option = document.createElement('option');
        option.value = proxy.url;
        option.textContent = proxy.name;
        corsSelect.appendChild(option);
    });

    // Carica proxy salvato o usa CodeTabs come default
    const savedProxy = localStorage.getItem('mobile-cors-proxy') || CORS_PROXIES[0].url;
    currentCorsProxy = savedProxy;
    corsSelect.value = savedProxy;

    corsSelect.addEventListener('change', function () {
        currentCorsProxy = this.value;
        localStorage.setItem('mobile-cors-proxy', currentCorsProxy);
        console.log('CORS proxy mobile cambiato a:', currentCorsProxy);
    });
}

function applyCorsProxy(url) {
    // NON applicare il proxy se è già proxato
    if (url.includes('corsproxy.io') || url.includes('api.codetabs.com')) {
        return url;
    }

    if (!currentCorsProxy) return url;

    // Evita doppia codifica
    try {
        const decodedUrl = decodeURIComponent(url);
        if (decodedUrl.startsWith(currentCorsProxy)) {
            return url;
        }
    } catch (e) {}

    return currentCorsProxy + encodeURIComponent(url);
}

function extractBaseUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.origin + parsed.pathname;
    } catch (e) {
        return url;
    }
}
