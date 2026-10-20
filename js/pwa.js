// pwa.js - Progressive Web App Registration, Install Prompts & Offline Status Handler

let deferredInstallPrompt = null;
let swRegistration = null;

/**
 * Check if the current environment is running as an installed PWA (standalone)
 */
export function isStandalone() {
  const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
  const isNavigatorStandalone = window.navigator.standalone === true;
  const isWindowOverlay = window.matchMedia('(display-mode: window-controls-overlay)').matches;
  return isStandaloneMedia || isNavigatorStandalone || isWindowOverlay;
}

/**
 * Detect iOS device (iPhone, iPad, iPod)
 */
export function isIOS() {
  const ua = window.navigator.userAgent;
  const isIosDevice = /iPad|iPhone|iPod/.test(ua);
  const isIpadOs = navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform);
  return isIosDevice || isIpadOs;
}

/**
 * Detect iOS Safari (not in-app webview or Chrome for iOS)
 */
export function isIOSSafari() {
  const ua = window.navigator.userAgent;
  return isIOS() && /WebKit/.test(ua) && !/CriOS|FxiOS|OPiOS|mercury/i.test(ua);
}

/**
 * Register Service Worker with update detection
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('[PWA] Service Workers are not supported in this browser.');
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      swRegistration = registration;
      console.log('[PWA] Service Worker registered with scope:', registration.scope);

      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[PWA] New version installed and ready to activate.');
            showUpdateToast();
          }
        });
      });

      // Periodically check for service worker updates (every 60 minutes)
      setInterval(() => {
        registration.update().catch((err) => {
          console.warn('[PWA] Periodic update check failed:', err);
        });
      }, 60 * 60 * 1000);

    } catch (err) {
      console.warn('[PWA] Service Worker registration failed:', err);
    }
  });

  // Only reload on controllerchange if the page already had an active controller (i.e. an update, not initial install)
  let refreshing = false;
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing && hadController) {
      refreshing = true;
      window.location.reload();
    }
  });
}

/**
 * Display update toast notification
 */
function showUpdateToast() {
  const toast = document.getElementById('pwaUpdateToast');
  if (toast) {
    toast.style.display = 'flex';
  }
}

/**
 * Trigger service worker update skip waiting
 */
export function applyAppUpdate() {
  if (!swRegistration || !swRegistration.waiting) {
    window.location.reload();
    return;
  }
  swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
}

/**
 * Setup beforeinstallprompt listener and Install button UI
 */
function initInstallPrompt() {
  const installBtn = document.getElementById('pwaInstallHeaderBtn');
  const installModal = document.getElementById('pwaInstallModal');
  const modalCloseBtn = document.getElementById('closePwaInstallModalBtn');
  const modalActionBtn = document.getElementById('pwaModalInstallActionBtn');

  // If already running in standalone mode, mark document and keep install UI hidden
  if (isStandalone()) {
    document.documentElement.classList.add('pwa-standalone');
    if (installBtn) installBtn.style.display = 'none';
    return;
  }

  // If on iOS and not standalone, show install button to offer home screen guidance
  if (isIOS() && !isStandalone()) {
    if (installBtn) {
      installBtn.style.display = 'inline-flex';
    }
  }

  // Intercept beforeinstallprompt on supported browsers (Chrome, Edge, Android, etc.)
  window.addEventListener('beforeinstallprompt', (e) => {
    console.log('[PWA] beforeinstallprompt event fired.');
    e.preventDefault();
    deferredInstallPrompt = e;

    if (installBtn) {
      installBtn.style.display = 'inline-flex';
      installBtn.classList.add('pulse-once');
    }
  });

  // Handle click on Install Button in header
  installBtn?.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      // Standard native PWA prompt available
      try {
        await deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        console.log(`[PWA] Install prompt outcome: ${outcome}`);
        if (outcome === 'accepted') {
          deferredInstallPrompt = null;
          installBtn.style.display = 'none';
        }
      } catch (err) {
        console.warn('[PWA] Error displaying install prompt:', err);
      }
    } else if (isIOS()) {
      // iOS doesn't support beforeinstallprompt; show visual guide
      openInstallModal(true);
    } else {
      // General browser helper (e.g. desktop browser instructions)
      openInstallModal(false);
    }
  });

  // Modal close handlers
  modalCloseBtn?.addEventListener('click', () => {
    closeInstallModal();
  });

  installModal?.addEventListener('click', (e) => {
    if (e.target === installModal) {
      closeInstallModal();
    }
  });

  // Modal action button handler
  modalActionBtn?.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      closeInstallModal();
      try {
        await deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          deferredInstallPrompt = null;
          if (installBtn) installBtn.style.display = 'none';
        }
      } catch (err) {
        console.warn('[PWA] Prompt error:', err);
      }
    } else {
      closeInstallModal();
    }
  });

  // App installed event listener
  window.addEventListener('appinstalled', (evt) => {
    console.log('[PWA] App installed successfully.', evt);
    deferredInstallPrompt = null;
    if (installBtn) installBtn.style.display = 'none';
    closeInstallModal();

    // Show celebratory toast
    const saveToast = document.getElementById('saveToast');
    const saveToastMsg = document.getElementById('saveToastMsg');
    if (saveToast && saveToastMsg) {
      saveToastMsg.textContent = '🎉 EPL Predictor installed successfully!';
      saveToast.classList.add('show');
      setTimeout(() => saveToast.classList.remove('show'), 4000);
    }
  });
}

function openInstallModal(isIosMode = false) {
  const modal = document.getElementById('pwaInstallModal');
  const stepsContainer = document.getElementById('pwaInstallSteps');
  const actionBtn = document.getElementById('pwaModalInstallActionBtn');
  if (!modal || !stepsContainer) return;

  if (isIosMode) {
    stepsContainer.innerHTML = `
      <div class="pwa-guide-card">
        <h4 class="pwa-guide-title">How to Install on iPhone & iPad:</h4>
        <ol class="pwa-step-list">
          <li class="pwa-step-item">
            <span class="pwa-step-num">1</span>
            <span class="pwa-step-text">Tap the <strong>Share</strong> button <span class="pwa-share-badge">⎙ / ⎋</span> at the bottom of Safari.</span>
          </li>
          <li class="pwa-step-item">
            <span class="pwa-step-num">2</span>
            <span class="pwa-step-text">Scroll down the menu and tap <strong>Add to Home Screen</strong> <span class="pwa-add-badge">⊞</span>.</span>
          </li>
          <li class="pwa-step-item">
            <span class="pwa-step-num">3</span>
            <span class="pwa-step-text">Tap <strong>Add</strong> in the top-right corner to complete installation.</span>
          </li>
        </ol>
      </div>
    `;
    if (actionBtn) {
      actionBtn.textContent = 'Got it';
    }
  } else if (deferredInstallPrompt) {
    stepsContainer.innerHTML = `
      <div class="pwa-guide-card">
        <p style="margin: 0 0 12px; color: var(--text-secondary, #cbd5e1); font-size: 0.9rem;">
          Install EPL Score Predictor on your device to enjoy instant match updates, offline access, and a clean full-screen experience with no browser address bar.
        </p>
        <ul style="margin: 0; padding-left: 20px; color: var(--text-muted, #94a3b8); font-size: 0.85rem; line-height: 1.6;">
          <li>⚡ Launches instantly from your desktop or home screen</li>
          <li>📊 Retains your predictions & league views offline</li>
          <li>🔒 Secure, lightweight and fast</li>
        </ul>
      </div>
    `;
    if (actionBtn) {
      actionBtn.textContent = 'Install App Now';
    }
  } else {
    stepsContainer.innerHTML = `
      <div class="pwa-guide-card">
        <h4 class="pwa-guide-title">Desktop / Browser Installation:</h4>
        <p style="margin: 0 0 12px; color: var(--text-secondary, #cbd5e1); font-size: 0.88rem;">
          Click the <strong>Install</strong> icon in your browser's address bar (look for the ⊕ or desktop monitor icon near the URL), or open browser settings (⋮) and select <strong>Install EPL Score Predictor</strong>.
        </p>
      </div>
    `;
    if (actionBtn) {
      actionBtn.textContent = 'Done';
    }
  }

  modal.style.display = 'flex';
}

function closeInstallModal() {
  const modal = document.getElementById('pwaInstallModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Handle network connectivity status (online / offline)
 */
function initConnectivityHandler() {
  const offlineBanner = document.getElementById('pwaOfflineBanner');

  const updateNetworkStatus = () => {
    const isOnline = navigator.onLine;
    if (!isOnline) {
      if (offlineBanner) {
        offlineBanner.style.display = 'flex';
      }
      document.body.classList.add('is-offline');
      console.log('[PWA] Network status: offline');
    } else {
      if (offlineBanner) {
        offlineBanner.style.display = 'none';
      }
      document.body.classList.remove('is-offline');
      console.log('[PWA] Network status: online');
    }
  };

  window.addEventListener('online', () => {
    updateNetworkStatus();
    const saveToast = document.getElementById('saveToast');
    const saveToastMsg = document.getElementById('saveToastMsg');
    if (saveToast && saveToastMsg) {
      saveToastMsg.textContent = '🌐 Connection restored. Online mode.';
      saveToast.classList.add('show');
      setTimeout(() => saveToast.classList.remove('show'), 3000);
    }
  });

  window.addEventListener('offline', updateNetworkStatus);

  // Initial check
  if (!navigator.onLine) {
    updateNetworkStatus();
  }
}

/**
 * Setup Update Toast buttons
 */
function initUpdateToastEvents() {
  const reloadBtn = document.getElementById('pwaReloadBtn');
  const dismissBtn = document.getElementById('pwaDismissUpdateBtn');
  const toast = document.getElementById('pwaUpdateToast');

  reloadBtn?.addEventListener('click', () => {
    applyAppUpdate();
  });

  dismissBtn?.addEventListener('click', () => {
    if (toast) toast.style.display = 'none';
  });
}

/**
 * Handle PWA deep links / shortcuts (?tab=whatif, ?tab=rules, ?tab=dashboard)
 */
function handlePwaShortcuts() {
  try {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) {
      // Allow app to finish initialization, then trigger tab click
      window.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
          if (tab === 'whatif') {
            document.getElementById('navDashboardBtn')?.click();
          } else if (tab === 'rules') {
            document.getElementById('navScoringBtn')?.click();
          } else if (tab === 'dashboard') {
            document.getElementById('navDashboardBtn')?.click();
          }
        }, 150);
      });
    }
  } catch (e) {
    console.warn('[PWA] Error handling PWA shortcuts:', e);
  }
}

// Initialize all PWA components
export function initPWA() {
  registerServiceWorker();
  initInstallPrompt();
  initConnectivityHandler();
  initUpdateToastEvents();
  handlePwaShortcuts();
}

// Auto-run if script is loaded
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPWA);
  } else {
    initPWA();
  }
}
