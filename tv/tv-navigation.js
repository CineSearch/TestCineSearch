// tv-navigation.js (versione semplificata)
class TVNavigation {
  constructor() {
    this.currentFocus = null;
    this.focusableElements = [];
    this.isNavigating = false;
    this.init();
  }
  
  init() {
    this.updateFocusableElements();
    this.setupEventListeners();
    setTimeout(() => this.focusFirstElement(), 500);
  }
  
  updateFocusableElements() {
    this.focusableElements = Array.from(document.querySelectorAll(
      'button, .card, .category-card, #search, #cors-select, .nav-btn, .page-btn, .episode-item, .arrow, .carousel-btn'
    )).filter(el => 
      el.offsetParent !== null && 
      !el.disabled && 
      el.style.display !== 'none' &&
      getComputedStyle(el).visibility !== 'hidden'
    );
  }
  
  setupEventListeners() {
    document.addEventListener('keydown', this.handleKey.bind(this));
    document.addEventListener('click', this.handleClick.bind(this));
    
    const observer = new MutationObserver(() => {
      this.updateFocusableElements();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  handleKey(event) {
    switch(event.key) {
      case 'ArrowRight':
        this.moveFocus('right');
        event.preventDefault();
        break;
      case 'ArrowLeft':
        this.moveFocus('left');
        event.preventDefault();
        break;
      case 'ArrowDown':
        this.moveFocus('down');
        event.preventDefault();
        break;
      case 'ArrowUp':
        this.moveFocus('up');
        event.preventDefault();
        break;
      case 'Enter':
      case ' ':
        this.activateFocusedElement();
        event.preventDefault();
        break;
      case 'Backspace':
      case 'Escape':
        this.goBack();
        event.preventDefault();
        break;
    }
  }
  
  handleClick() {
    setTimeout(() => this.updateFocusableElements(), 100);
  }
  
  moveFocus(direction) {
    if (this.isNavigating) return;
    
    this.isNavigating = true;
    this.updateFocusableElements();
    
    const visibleElements = this.focusableElements.filter(el => {
      return el.offsetParent !== null && 
             !el.disabled && 
             getComputedStyle(el).display !== 'none' &&
             getComputedStyle(el).visibility !== 'hidden' &&
             el.style.display !== 'none';
    });
    
    if (visibleElements.length === 0) {
      this.isNavigating = false;
      return;
    }
    
    const currentIndex = visibleElements.indexOf(this.currentFocus);
    let nextIndex = currentIndex;
    
    if (currentIndex === -1) {
      nextIndex = 0;
    } else {
      const currentRect = this.currentFocus.getBoundingClientRect();
      const viewportCenterX = window.innerWidth / 2;
      
      switch(direction) {
        case 'right':
          nextIndex = this.getNextElementRight(visibleElements, currentIndex, currentRect);
          break;
        case 'left':
          nextIndex = this.getNextElementLeft(visibleElements, currentIndex, currentRect);
          break;
        case 'down':
          nextIndex = this.getNextElementDown(visibleElements, currentIndex, currentRect, viewportCenterX);
          break;
        case 'up':
          nextIndex = this.getNextElementUp(visibleElements, currentIndex, currentRect, viewportCenterX);
          break;
      }
      
      if (nextIndex === -1) {
        nextIndex = direction === 'right' || direction === 'down' 
          ? (currentIndex + 1) % visibleElements.length
          : (currentIndex - 1 + visibleElements.length) % visibleElements.length;
      }
    }
    
    if (nextIndex >= 0 && nextIndex < visibleElements.length) {
      this.setFocus(visibleElements[nextIndex]);
    }
    
    setTimeout(() => {
      this.isNavigating = false;
    }, 100);
  }
  
  setFocus(element) {
    if (this.currentFocus) {
      this.currentFocus.classList.remove('tv-focused');
      this.currentFocus.removeAttribute('data-tv-focused');
    }
    
    this.currentFocus = element;
    element.classList.add('tv-focused');
    element.setAttribute('data-tv-focused', 'true');
    element.focus({ preventScroll: true });
    
    setTimeout(() => {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
      });
    }, 50);
  }
  
  activateFocusedElement() {
    if (this.currentFocus) {
      this.currentFocus.click();
    }
  }
  
  focusFirstElement() {
    if (this.focusableElements.length > 0) {
      this.setFocus(this.focusableElements[0]);
    }
  }
  
  goBack() {
    if (document.getElementById("player").style.display === "block") {
      goBack();
    } else if (!document.getElementById("home").style.display === "block") {
      goBackToHome();
    }
  }
}