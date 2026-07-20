// Registers the service worker and manages the "Add to Home Screen" prompt.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((reg) => console.log('WellnessHub service worker registered:', reg.scope))
      .catch((err) => console.warn('Service worker registration failed:', err));
  });
}

// Capture the browser's install prompt so we can trigger it from our own UI
// (e.g. an "Install App" button) instead of relying on the default mini-infobar.
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;

  const installBtn = document.getElementById('installAppBtn');
  if (installBtn) installBtn.classList.remove('d-none');
});

function initInstallButton() {
  const installBtn = document.getElementById('installAppBtn');
  if (!installBtn) return;

  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.classList.add('d-none');
  });
}

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const installBtn = document.getElementById('installAppBtn');
  if (installBtn) installBtn.classList.add('d-none');
  console.log('WellnessHub installed as a mobile app');
});

document.addEventListener('DOMContentLoaded', initInstallButton);
  
// Request notification permission  
if ('Notification' in window) { Notification.requestPermission(); } 
  
// Request notification permission  
if ('Notification' in window) { Notification.requestPermission(); } 
