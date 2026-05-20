/**
 * TalkFuze Embed Script
 * Injects a floating chat bubble and an iframe pointing to the TalkFuze Next.js app.
 */
(function() {
  if (window.TalkFuzeInitialized) return;
  window.TalkFuzeInitialized = true;

  const scriptTag = document.currentScript || document.querySelector('script[src*="embed.js"]');
  const orgId = (scriptTag ? scriptTag.getAttribute('data-org-id') : null) || 'ec2f8436-05dc-4621-8a7f-57202f865b8e'; // Fallback to Hostnin
  const baseUrl = scriptTag ? new URL(scriptTag.src).origin : 'https://talkfuze-app.vercel.app';

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
    z-index: 2147483647; /* Max z-index to overlay on top of AnyChat */
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  `;

  // Create Iframe (Hidden initially)
  const iframe = document.createElement('iframe');
  iframe.src = `${baseUrl}/widget/${orgId}`;
  iframe.allow = 'autoplay *; microphone *; camera *; display-capture *';
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
    background: white;
    border-radius: 50%;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease, background 0.2s ease;
    position: relative;
    border: 2px solid white;
  `;

  const agentImages = [
    `${baseUrl}/team/1.avif`,
    `${baseUrl}/team/2.avif`,
    `${baseUrl}/team/3.avif`
  ];
  let currentImageIndex = 0;

  function renderAvatar() {
    return `
      <div style="position: relative; width: 100%; height: 100%; border-radius: 50%; overflow: hidden;">
        <img id="talkfuze-agent-avatar" src="${agentImages[currentImageIndex]}" style="width: 100%; height: 100%; object-fit: cover; transition: opacity 0.3s ease;" />
      </div>
      <div style="position: absolute; top: -4px; right: -4px; background: #ef4444; color: white; font-size: 11px; font-weight: bold; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">1</div>
    `;
  }

  // Close Icon SVG (consistent gray)
  const closeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

  button.innerHTML = renderAvatar();

  // Rotate images every 4 seconds
  setInterval(() => {
    if (isOpen) return; // Don't switch if open
    currentImageIndex = (currentImageIndex + 1) % agentImages.length;
    const imgEl = document.getElementById('talkfuze-agent-avatar');
    if (imgEl) {
      imgEl.style.opacity = '0';
      setTimeout(() => {
        imgEl.src = agentImages[currentImageIndex];
        imgEl.style.opacity = '1';
      }, 300);
    }
  }, 4000);

  // Toggle Logic
  let isOpen = false;
  button.addEventListener('click', () => {
    isOpen = !isOpen;
    if (isOpen) {
      iframe.style.opacity = '1';
      iframe.style.transform = 'translateY(0) scale(1)';
      iframe.style.pointerEvents = 'all';
      button.style.background = 'white'; // White when open for consistency
      button.style.border = '2px solid #e2e8f0'; // Subtle slate border

      button.innerHTML = closeIcon;
      button.style.transform = 'scale(0.9)';
      setTimeout(() => button.style.transform = 'scale(1)', 150);
      
      // Notify iframe to focus input if needed
      iframe.contentWindow.postMessage({ type: 'TALKFUZE_WIDGET_OPENED' }, '*');
    } else {
      iframe.style.opacity = '0';
      iframe.style.transform = 'translateY(20px) scale(0.95)';
      iframe.style.pointerEvents = 'none';
      button.style.background = 'white'; // White when closed for avatars
      button.style.border = '2px solid white';
      button.innerHTML = renderAvatar();
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
