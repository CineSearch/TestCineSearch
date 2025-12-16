// ============ INIZIALIZZAZIONE ============
document.addEventListener('DOMContentLoaded', function() {
    // console.log('CineSearch Mobile inizializzato');
    initMobileUI();
    initMobileCors();
    initTVNavigation();
    loadMobileHomeData();
    cleanupExpiredStorage();
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
});
// ============ TV NAVIGATION SUPPORT ============
function initTVNavigation() {
    // Controlla se siamo su una TV Android
    const isTV = /Android TV|GoogleTV|TV|SmartTV|Opera TV|bravia|netcast|webOS|hbbtv|appletv|boxee|kylo|roku|xbmc/i.test(navigator.userAgent);
    
    if (isTV) {
        document.body.classList.add('android-tv');
        console.log('Modalità TV Android attivata');
        
        // Imposta gestori eventi per tastiera/D-pad
        document.addEventListener('keydown', handleTVNavigation);
        
        // Rendi focusable tutti gli elementi interattivi
        setTimeout(() => {
            makeAllCardsFocusable();
        }, 1000);
    }
}

function makeAllCardsFocusable() {
    // Rendi tutte le card focusable
    document.querySelectorAll('.mobile-card, .mobile-category-card, .mobile-nav-btn').forEach(element => {
        if (!element.hasAttribute('tabindex')) {
            element.setAttribute('tabindex', '0');
        }
    });
    
    // Rendi tutti i pulsanti focusable
    document.querySelectorAll('button, [role="button"]').forEach(button => {
        if (!button.hasAttribute('tabindex')) {
            button.setAttribute('tabindex', '0');
        }
    });
}

function handleTVNavigation(event) {
    const currentElement = document.activeElement;
    
    switch(event.key) {
        case 'ArrowUp':
            event.preventDefault();
            navigateTV('up', currentElement);
            break;
            
        case 'ArrowDown':
            event.preventDefault();
            navigateTV('down', currentElement);
            break;
            
        case 'ArrowLeft':
            event.preventDefault();
            navigateTV('left', currentElement);
            break;
            
        case 'ArrowRight':
            event.preventDefault();
            navigateTV('right', currentElement);
            break;
            
        case 'Enter':
        case ' ':
            if (currentElement.classList.contains('mobile-card') || 
                currentElement.classList.contains('mobile-category-card')) {
                event.preventDefault();
                currentElement.click();
            }
            break;
    }
}

function navigateTV(direction, currentElement) {
    const allFocusable = Array.from(document.querySelectorAll('[tabindex="0"]:not([disabled])'));
    
    if (allFocusable.length === 0) return;
    
    const currentIndex = allFocusable.indexOf(currentElement);
    const gridElements = document.querySelectorAll('.mobile-grid .mobile-card, .mobile-categories-grid .mobile-category-card');
    
    if (gridElements.length > 0) {
        // Navigazione griglia
        navigateGrid(direction, currentElement, gridElements);
    } else {
        // Navigazione lineare standard
        navigateLinear(direction, currentElement, allFocusable);
    }
}

function navigateGrid(direction, currentElement, gridElements) {
    const gridArray = Array.from(gridElements);
    const currentIndex = gridArray.indexOf(currentElement);
    
    if (currentIndex === -1) {
        gridArray[0]?.focus();
        return;
    }
    
    let nextIndex = currentIndex;
    
    switch(direction) {
        case 'right':
            nextIndex = currentIndex + 1;
            break;
        case 'left':
            nextIndex = currentIndex - 1;
            break;
        case 'down':
            // Calcola colonne (2 su mobile, 3+ su tablet/TV)
            const columns = window.innerWidth >= 768 ? 3 : 2;
            nextIndex = currentIndex + columns;
            break;
        case 'up':
            const columnsUp = window.innerWidth >= 768 ? 3 : 2;
            nextIndex = currentIndex - columnsUp;
            break;
    }
    
    if (gridArray[nextIndex]) {
        gridArray[nextIndex].focus();
    }
}

function navigateLinear(direction, currentElement, elements) {
    const currentIndex = elements.indexOf(currentElement);
    let nextIndex = currentIndex;
    
    switch(direction) {
        case 'down':
        case 'right':
            nextIndex = currentIndex + 1;
            break;
        case 'up':
        case 'left':
            nextIndex = currentIndex - 1;
            break;
    }
    
    // Gestione wrap-around
    if (nextIndex < 0) nextIndex = elements.length - 1;
    if (nextIndex >= elements.length) nextIndex = 0;
    
    elements[nextIndex]?.focus();
}

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
window.applyCategoryFilterMobile = applyCategoryFilterMobile;
window.resetCategoryFilterMobile = resetCategoryFilterMobile;
window.prevCategoryPageMobile = prevCategoryPageMobile;
window.nextCategoryPageMobile = nextCategoryPageMobile;
