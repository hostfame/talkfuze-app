/**
 * TalkFuze Embed Script
 * Injects a floating chat bubble and an iframe pointing to the TalkFuze Next.js app.
 */
(function() {
  if (window.TalkFuzeInitialized) return;
  window.TalkFuzeInitialized = true;

  const scriptTag = document.currentScript || document.querySelector('script[src*="embed.js"]');
  const orgId = scriptTag ? scriptTag.getAttribute('data-org-id') : null;
  const baseUrl = scriptTag ? new URL(scriptTag.src).origin : 'https://talkfuze.com';

  if (!orgId) {
    console.error('TalkFuze: Missing data-org-id attribute on the script tag.');
    return;
  }

  // Create Container
  const container = document.createElement('div');
  container.id = 'talkfuze-container';
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  `;

  // Create Iframe (Hidden initially)
  const iframe = document.createElement('iframe');
  iframe.src = `${baseUrl}/widget/${orgId}`;
  iframe.style.cssText = `
    width: 380px;
    height: 600px;
    max-height: calc(100vh - 100px);
    border: none;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    background: transparent;
    transition: opacity 0.3s ease, transform 0.3s ease, pointer-events 0s;
    opacity: 0;
    transform: translateY(20px) scale(0.95);
    pointer-events: none;
    margin-bottom: 20px;
    display: block;
  `;

  // Responsive for mobile
  const style = document.createElement('style');
  style.innerHTML = `
    @media (max-width: 480px) {
      #talkfuze-container iframe {
        width: calc(100vw - 40px);
        height: calc(100vh - 120px);
      }
    }
  `;
  document.head.appendChild(style);

  // Create Launcher Button
  const button = document.createElement('div');
  button.style.cssText = `
    width: 60px;
    height: 60px;
    background: #2563EB; /* Tailwind blue-600 */
    border-radius: 50%;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease, background 0.2s ease;
  `;

  // Chat Icon SVG
  const chatIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
  // Close Icon SVG
  const closeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

  button.innerHTML = chatIcon;

  // Toggle Logic
  let isOpen = false;
  button.addEventListener('click', () => {
    isOpen = !isOpen;
    if (isOpen) {
      iframe.style.opacity = '1';
      iframe.style.transform = 'translateY(0) scale(1)';
      iframe.style.pointerEvents = 'all';
      button.innerHTML = closeIcon;
      button.style.transform = 'scale(0.9)';
      setTimeout(() => button.style.transform = 'scale(1)', 150);
      
      // Notify iframe to focus input if needed
      iframe.contentWindow.postMessage({ type: 'TALKFUZE_WIDGET_OPENED' }, '*');
    } else {
      iframe.style.opacity = '0';
      iframe.style.transform = 'translateY(20px) scale(0.95)';
      iframe.style.pointerEvents = 'none';
      button.innerHTML = chatIcon;
      button.style.transform = 'scale(0.9)';
      setTimeout(() => button.style.transform = 'scale(1)', 150);
    }
  });

  // Assemble
  container.appendChild(iframe);
  container.appendChild(button);
  document.body.appendChild(container);

  // Expose API to host window (e.g. for WooCommerce to pass context)
  window.TalkFuze = {
    setContext: (contextData) => {
      // Pass data to iframe when it's ready
      const sendContext = () => {
        iframe.contentWindow.postMessage({
          type: 'TALKFUZE_CONTEXT',
          payload: contextData
        }, '*');
      };
      
      // If iframe is already loaded, send immediately
      sendContext();
      // Also send on load just in case
      iframe.addEventListener('load', sendContext);
    },
    open: () => {
      if (!isOpen) button.click();
    },
    close: () => {
      if (isOpen) button.click();
    }
  };

})();
