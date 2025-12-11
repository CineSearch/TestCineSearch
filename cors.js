// Gestione CORS e Video.js hooks
const xhrRequestHook = (options) => {
  const originalUri = options.uri;
  
  // Su iOS, non usare proxy per gli stream video
  if (shouldUseNativePlayer() && originalUri.includes('.m3u8')) {
    return options;
  }
  
  options.uri = applyCorsProxy(originalUri);
  return options;
};
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
  if (
    typeof videojs !== "undefined" &&
    videojs.Vhs &&
    requestHookInstalled
  ) {
    videojs.Vhs.xhr.offRequest(xhrRequestHook);
    requestHookInstalled = false;
  }
}

// Nascondi warning non necessari
const originalconsoleWarn = console.warn;
console.warn = function (...args) {
  const message = args[0];
  if (
    typeof message === "string" &&
    (message.includes("videojs.mergeOptions is deprecated") ||
      message.includes("MouseEvent.mozPressure") ||
      message.includes("MouseEvent.mozInputSource"))
  ) {
    return;
  }
  originalconsoleWarn.apply( console, args);
};