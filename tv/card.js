function createCard(item, cookieNames = [], isRemovable = false) {
  const card = document.createElement("div");
  card.className = "card";
  card.setAttribute("tabindex", "0");
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${item.title || item.name || "Contenuto"} - Premi Invio per opzioni`);

  const poster = item.poster_path
    ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
    : "https://via.placeholder.com/200x300?text=No+Image";

  const rawTitle = item.title || item.name || "";
  const mediaType = item.media_type || (item.title ? "movie" : "tv");
  const anno = item.release_date?.slice(0, 4) || item.first_air_date?.slice(0, 4) || "—";
  const tipo = mediaType === "movie" ? "Film" : mediaType === "tv" ? "Serie TV" : "—";
  const voto = item.vote_average?.toFixed(1) || "—";

  let title = rawTitle.length > 42
    ? rawTitle.slice(0, 42).replace(/(.{21})/, "$1\n") + "..."
    : rawTitle.length > 21
      ? rawTitle.replace(/(.{21})/, "$1\n")
      : rawTitle;

  let badge = "";
  cookieNames.forEach((storageKey) => {
    try {
      const item = localStorage.getItem(storageKey);
      if (item) {
        const data = JSON.parse(item);
        const savedTime = parseFloat(data.value);
        if (savedTime > 60) {
          const match = storageKey.match(/_S(\d+)_E(\d+)/);
          if (match) {
            badge = `<div class="resume-badge">📺 S${match[1]} • E${match[2]}<br>⏪ ${formatTime(savedTime)}</div>`;
          } else {
            badge = `<div class="resume-badge">⏪ ${formatTime(savedTime)}</div>`;
          }
        }
      }
    } catch (e) {
      console.error("Errore lettura storage in card:", e);
    }
  });
  
  const preferiti = getPreferiti();
  const itemId = `${mediaType}-${item.id}`;
  const isInPreferiti = preferiti.includes(itemId);
  
  card.innerHTML = `
    <div class="card-image-wrapper">
      <img src="${poster}" alt="${rawTitle}">
      <div class="card-title-overlay">${title}</div>
      ${badge}
      <!-- Overlay opzioni per TV -->
      <div class="card-overlay-options" style="display: none;">
        <div class="overlay-content">
          <button class="overlay-option play-option" tabindex="-1">
            <i class="fas fa-play"></i>
            <span>PLAY</span>
          </button>
          <button class="overlay-option fav-option" tabindex="-1" data-item-id="${itemId}" data-is-fav="${isInPreferiti}">
            ${isInPreferiti ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>'}
            <span>${isInPreferiti ? 'Rimuovi' : 'Aggiungi'}</span>
          </button>
          ${isRemovable ? `<button class="overlay-option remove-option" tabindex="-1">
            <i class="fas fa-trash"></i>
            <span>Rimuovi</span>
          </button>` : ''}
        </div>
      </div>
    </div>
    <div class="card-content">
      <div class="card-meta">
        <div>${anno}</div>
        <div>${voto}</div>
        <div>${tipo}</div>
      </div>
    </div>
  `;

  // Gestione focus per TV
  card.addEventListener("focus", (e) => {
    const isTV = document.body.classList.contains('tv');
    if (isTV) {
      // Nascondi la card e mostra l'overlay
      const overlay = card.querySelector(".card-overlay-options");
      const imageWrapper = card.querySelector(".card-image-wrapper");
      
      imageWrapper.style.filter = "brightness(0.3)";
      overlay.style.display = "block";
      
      // Metti il focus sul primo pulsante dell'overlay
      setTimeout(() => {
        const firstButton = overlay.querySelector(".overlay-option");
        if (firstButton) {
          firstButton.focus();
        }
      }, 100);
    }
  });

  card.addEventListener("blur", (e) => {
    const isTV = document.body.classList.contains('tv');
    if (isTV) {
      const overlay = card.querySelector(".card-overlay-options");
      const imageWrapper = card.querySelector(".card-image-wrapper");
      
      // Nascondi l'overlay e ripristina l'immagine
      overlay.style.display = "none";
      imageWrapper.style.filter = "brightness(1)";
    }
  });

  // Gestione click sull'overlay PLAY
  const playOption = card.querySelector(".play-option");
  if (playOption) {
    playOption.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const isTV = document.body.classList.contains('tv');
      
      if (isTV) {
        openPlayer(item);
        
        setTimeout(() => {
          const player = videojs.getPlayer("player-video");
          if (player) {
            player.requestFullscreen();
          }
        }, 500);
      } else {
        openPlayer(item);
      }
    });
  }

  // Gestione click sull'overlay PREFERITI
  const favOption = card.querySelector(".fav-option");
  if (favOption) {
    favOption.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const isInPreferiti = favOption.getAttribute("data-is-fav") === "true";
      const itemId = favOption.getAttribute("data-item-id");
      
      if (isInPreferiti) {
        // Rimuovi dai preferiti
        removePreferito(item);
        favOption.innerHTML = '<i class="far fa-star"></i><span>Aggiungi</span>';
        favOption.setAttribute("data-is-fav", "false");
      } else {
        // Aggiungi ai preferiti
        addPreferito(item);
        favOption.innerHTML = '<i class="fas fa-star"></i><span>Rimuovi</span>';
        favOption.setAttribute("data-is-fav", "true");
      }
      
      // Aggiorna il contatore e altre sezioni
      updatePreferitiCounter();
      
      if (document.getElementById("preferiti-section") && 
          document.getElementById("preferiti-section").style.display === "block") {
        loadPreferitiSection();
      }
      if (document.getElementById("preferiti")) {
        loadPreferiti();
      }
    });
  }

  // Gestione click sull'overlay RIMUOVI (solo per "Continua visione")
  const removeOption = card.querySelector(".remove-option");
  if (removeOption) {
    removeOption.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const confirmDelete = confirm(`Vuoi rimuovere "${rawTitle}" dalla visione?`);
      if (confirmDelete) {
        cookieNames.forEach((storageKey) => {
          localStorage.removeItem(storageKey);
        });
        card.remove();
        shownContinuaIds.delete(item.id);

        const container = document.getElementById("continua-carousel");
        if (container.children.length === 0) {
          document.getElementById("continua-visione").style.display = "none";
        }
      }
    });
  }

  // Gestione tastiera per l'overlay
  card.addEventListener("keydown", (e) => {
    const overlay = card.querySelector(".card-overlay-options");
    if (overlay && overlay.style.display === "block") {
      const options = Array.from(overlay.querySelectorAll(".overlay-option"));
      const currentIndex = options.findIndex(opt => opt === document.activeElement);
      
      switch(e.key) {
        case "ArrowRight":
          e.preventDefault();
          e.stopPropagation();
          if (currentIndex < options.length - 1) {
            options[currentIndex + 1].focus();
          } else {
            options[0].focus();
          }
          break;
          
        case "ArrowLeft":
          e.preventDefault();
          e.stopPropagation();
          if (currentIndex > 0) {
            options[currentIndex - 1].focus();
          } else {
            options[options.length - 1].focus();
          }
          break;
          
        case "Escape":
        case "Backspace":
          e.preventDefault();
          e.stopPropagation();
          card.focus();
          break;
          
        case "Enter":
        case " ":
          e.preventDefault();
          e.stopPropagation();
          if (document.activeElement.classList.contains("overlay-option")) {
            document.activeElement.click();
          }
          break;
          
        case "ArrowUp":
        case "ArrowDown":
          // Torna alla navigazione principale
          e.preventDefault();
          e.stopPropagation();
          card.focus();
          break;
      }
    } else if (e.key === "Enter" || e.key === " ") {
      // Se la card ha focus e non c'è overlay, mostra l'overlay
      e.preventDefault();
      e.stopPropagation();
      
      const isTV = document.body.classList.contains('tv');
      if (isTV) {
        const overlay = card.querySelector(".card-overlay-options");
        const imageWrapper = card.querySelector(".card-image-wrapper");
        
        imageWrapper.style.filter = "brightness(0.3)";
        overlay.style.display = "block";
        
        setTimeout(() => {
          const firstButton = overlay.querySelector(".overlay-option");
          if (firstButton) {
            firstButton.focus();
          }
        }, 100);
      } else {
        // Per dispositivi non-TV, comportamento normale
        openPlayer(item);
      }
    }
  });

  return card;
}

function togglePreferito(item, card, favBtn) {
  const preferiti = getPreferiti();
  const itemId = `${item.media_type || (item.title ? "movie" : "tv")}-${item.id}`;
  
  if (preferiti.includes(itemId)) {
    removePreferito(item);
    card.classList.remove('in-preferiti');
    favBtn.innerHTML = '☆';
    favBtn.title = 'Aggiungi ai preferiti';
  } else {
    addPreferito(item);
    card.classList.add('in-preferiti');
    favBtn.innerHTML = '⭐';
    favBtn.title = 'Rimuovi dai preferiti';
  }
  
  if (document.getElementById("preferiti-section") && 
      document.getElementById("preferiti-section").style.display === "block") {
    loadPreferitiSection();
  }
  if (document.getElementById("preferiti")) {
    loadPreferiti();
  }
  updatePreferitiCounter();
}


function scrollCarousel(carouselId, direction) {
  const carousel = document.getElementById(carouselId);
  if (!carousel) return;

  const scrollAmount = carousel.clientWidth * 0.8;
  carousel.scrollBy({
    left: direction * scrollAmount,
    behavior: "smooth",
  });
}

document.querySelectorAll('.arrow').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-target');
    const carousel = document.getElementById(targetId);
     
    if (!carousel) {
      return;
    }

    if (carousel.children.length === 0) {
      return;
    }
    if (carousel.scrollWidth <= carousel.clientWidth) {
      return;
    }
    
    const direction = btn.classList.contains('left') ? -1 : 1;
    const scrollAmount = carousel.clientWidth * 0.8;
    if (direction === 1 && carousel.scrollLeft >= (carousel.scrollWidth - carousel.clientWidth - 10)) {
      // console.log('➡️ Già alla fine destra');
      return;
    }
    
    if (direction === -1 && carousel.scrollLeft <= 10) {
      // console.log('⬅️ Già all\'inizio sinistra');
      return;
    }
    
    carousel.scrollBy({
      left: direction * scrollAmount,
      behavior: 'smooth'
    });
  });
});