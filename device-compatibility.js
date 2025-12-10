const DeviceCompatibility = {
  // Rileva tipo di dispositivo
  getDeviceType() {
    const ua = navigator.userAgent;
    
    if (/iP(hone|od|ad)/.test(navigator.platform)) {
      if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
        return 'safari-ios';
      }
      return 'ios';
    }
    
    if (/Android/.test(ua)) {
      return 'android';
    }
    
    if (/JDownload|AFT[AN]|AFTM|AFTT|AFTB/i.test(ua)) {
      return 'firestick-app';
    }
    
    if (/SmartTV|Tizen|WebOS|NetCast|BOXEE|KDL|DLNADIG/.test(ua)) {
      return 'smart-tv';
    }
    
    return 'desktop';
  },
  
  // Ottieni proxy consigliato per dispositivo
  getRecommendedProxy() {
    const device = this.getDeviceType();
    
    const proxyMap = {
      'safari-ios': 'api.allorigins.win/raw?url=',
      'ios': 'api.allorigins.win/raw?url=',
      'android': 'corsproxy.io/',
      'firestick-app': 'cors.zimjs.com/',
      'smart-tv': 'api.allorigins.win/raw?url=',
      'desktop': 'corsproxy.io/'
    };
    
    return proxyMap[device] || 'corsproxy.io/';
  },
  
  // Configura Video.js per dispositivo
  setupVideoJSForDevice(player) {
    const device = this.getDeviceType();
    
    // Impostazioni comuni
    const baseOptions = {
      controls: true,
      fluid: true,
      aspectRatio: "16:9",
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2]
    };
    
    // Impostazioni specifiche per dispositivo
    const deviceOptions = {
      'safari-ios': {
        html5: {
          vhs: {
            overrideNative: false, // IMPORTANTE: lascia al nativo su Safari
            useBandwidthFromLocalStorage: false
          },
          nativeAudioTracks: true,
          nativeVideoTracks: true
        }
      },
      'firestick-app': {
        html5: {
          vhs: {
            overrideNative: true,
            limitRenditionByPlayerDimensions: true,
            smoothQualityChange: false
          }
        },
        controlBar: {
          volumePanel: {
            inline: false
          }
        }
      },
      'default': {
        html5: {
          vhs: {
            overrideNative: true
          }
        }
      }
    };
    
    const options = {
      ...baseOptions,
      ...(deviceOptions[device] || deviceOptions.default)
    };
    
    player.options(options);
    
    // Log per debug
    console.log(`📱 Configurato per: ${device}`);
  },
  
  // Metodo per applicare proxy corretto
  applyDeviceProxy(url) {
    const device = this.getDeviceType();
    const proxy = this.getRecommendedProxy();
    
    // Clean URL
    let cleanUrl = url;
    CORS_PROXIES_REQUIRING_ENCODING.forEach(p => {
      if (url.includes(p)) {
        cleanUrl = decodeURIComponent(url.split(p)[1]);
      }
    });
    
    if (device === 'safari-ios') {
      // Safari richiede encoding speciale
      return `https://${proxy}${encodeURIComponent(cleanUrl)}`;
    }
    
    return `https://${proxy}${cleanUrl}`;
  },
  
  // Controlla se il formato è supportato
  isFormatSupported(m3u8Url) {
    const device = this.getDeviceType();
    
    // Safari/iOS ha problemi con certi formati HLS
    if (device.includes('ios') || device.includes('safari')) {
      // Controlla se è HLS standard
      return m3u8Url.includes('.m3u8') && 
             !m3u8Url.includes('hlsvariant') &&
             !m3u8Url.includes('dash');
    }
    
    return true;
  },
  
  // Fallback per dispositivi problematici
  getFallbackPlayerHTML(item) {
    const device = this.getDeviceType();
    
    if (device === 'safari-ios' || device === 'firestick-app') {
      return `
        <div style="text-align: center; padding: 2rem;">
          <h3>⚠️ Compatibilità Dispositivo</h3>
          <p>Il player nativo potrebbe non funzionare su questo dispositivo.</p>
          <button onclick="DeviceCompatibility.openExternalPlayer('${item.id}', '${item.media_type}')" 
                  style="background: #2a09e5; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; margin: 1rem; cursor: pointer; font-size: 1.1rem;">
            📺 Apri in Player Esterno
          </button>
          <p style="font-size: 0.9rem; color: #888; margin-top: 1rem;">
            Suggerimento: Prova con un proxy CORS diverso dalle impostazioni.
          </p>
        </div>
      `;
    }
    
    return null;
  },
  
  openExternalPlayer(tmdbId, mediaType) {
    const externalUrl = `https://vixsrc.to/${mediaType}/${tmdbId}`;
    window.open(externalUrl, '_blank');
  }
};

// Esporta per uso globale
window.DeviceCompatibility = DeviceCompatibility;