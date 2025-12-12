// ============ INIZIALIZZAZIONE ============
document.addEventListener('DOMContentLoaded', function() {
    // Test debug system
    setTimeout(() => {
        if (typeof addDebugLog !== 'undefined') {
            addDebugLog('CineSearch Mobile inizializzato', 'success');
            addDebugLog(`User Agent: ${navigator.userAgent}`, 'info');
            addDebugLog(`iOS: ${/iPad|iPhone|iPod/.test(navigator.userAgent)}`, 'info');
        }
    }, 1000);
    
    initMobileUI();
    initMobileCors();
    loadMobileHomeData();
    cleanupExpiredStorage();
});

// ============ EVENT LISTENERS GLOBALI ============
document.addEventListener('keydown', function(e) {
    const focusedElement = document.activeElement;
    
    if (focusedElement && focusedElement.classList.contains('mobile-card')) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            focusedElement.click();
        }
    }
    
    if (e.key === 'Escape') {
        if (currentMobileSection === 'player') {
            closePlayerMobile();
        }
    }
});


window.showHomeMobile = showHomeMobile;
window.showAllMoviesMobile = showAllMoviesMobile;
window.showAllTVMobile = showAllTVMobile;
window.showCategoriesMobile = showCategoriesMobile;
window.showPreferitiMobile = showPreferitiMobile;
window.showCategoryContentMobile = showCategoryContentMobile;
window.openMobilePlayer = openMobilePlayer;
window.playItemMobile = playItemMobile;
window.toggleFavoriteMobile = toggleFavoriteMobile;
window.closePlayerMobile = closePlayerMobile;
window.openInExternalPlayer = openInExternalPlayer;
window.prevMoviePageMobile = prevMoviePageMobile;
window.nextMoviePageMobile = nextMoviePageMobile;
window.prevTVPageMobile = prevTVPageMobile;
window.nextTVPageMobile = nextTVPageMobile;
window.applyMovieFilterMobile = applyMovieFilterMobile;
window.applyTVFilterMobile = applyTVFilterMobile;
window.toggleControls = toggleControls;
window.refreshMobilePlayerControls = refreshMobilePlayerControls;
window.showMobileQualitySelector = showMobileQualitySelector;
window.showMobileAudioSelector = showMobileAudioSelector;
window.showMobileSubtitleSelector = showMobileSubtitleSelector;
window.changeMobileQuality = changeMobileQuality;
window.changeMobileAudio = changeMobileAudio;
window.changeMobileSubtitle = changeMobileSubtitle;
window.showContinuaMobile = showContinuaMobile;
window.loadContinuaMobile = loadContinuaMobile;
window.resumeWatching = resumeWatching;
window.removeContinuaItem = removeContinuaItem;