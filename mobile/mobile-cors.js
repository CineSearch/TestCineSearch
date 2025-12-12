let currentCorsProxy = 'https://corsproxy.io/?';

function initMobileCors() {
    const corsSelect = document.getElementById('mobile-cors-select');
    
    if (!corsSelect) return;
    const savedProxy = localStorage.getItem('mobile-cors-proxy') || 'https://corsproxy.io/?';
    currentCorsProxy = savedProxy;
    
    corsSelect.value = savedProxy;
    
    corsSelect.addEventListener('change', function() {
        currentCorsProxy = this.value;
        localStorage.setItem('mobile-cors-proxy', currentCorsProxy);
        // console.log('CORS proxy mobile cambiato a:', currentCorsProxy);
    });
}

function applyCorsProxy(url) {
    if (url.includes('corsproxy.io') || url.includes('cors-anywhere') || 
        url.includes('allorigins.win') || url.includes('api.codetabs.com')) {
        return url;
    }
    
    if (!currentCorsProxy || currentCorsProxy === '') {
        return url;
    }
    
    try {
        const decodedUrl = decodeURIComponent(url);
        if (decodedUrl.startsWith(currentCorsProxy)) {
            return url;
        }
    } catch (e) {

    }
    
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