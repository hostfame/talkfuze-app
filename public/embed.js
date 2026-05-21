/**
 * TalkFuze Embed Script
 * Injects a floating chat bubble and an iframe pointing to the TalkFuze Next.js app.
 */
(function() {
  if (window.TalkFuzeInitialized) return;
  window.TalkFuzeInitialized = true;

  var scriptTag = document.currentScript || document.querySelector('script[src*="embed.js"]');
  var orgId = (scriptTag ? scriptTag.getAttribute('data-org-id') : null) || 'ec2f8436-05dc-4621-8a7f-57202f865b8e';
  var baseUrl = scriptTag ? new URL(scriptTag.src).origin : 'https://talkfuze-app.vercel.app';

  if (!orgId) {
    console.error('TalkFuze: Missing data-org-id attribute on the script tag.');
    return;
  }

  // Create Container
  var container = document.createElement('div');
  container.id = 'talkfuze-container';
  container.style.cssText = '\
    position: fixed;\
    bottom: 20px;\
    right: 20px;\
    z-index: 2147483647;\
    display: flex;\
    flex-direction: column;\
    align-items: flex-end;\
    pointer-events: none;\
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;\
  ';

  // Create Iframe (Hidden initially - use visibility:hidden to prevent touch interception)
  var iframe = document.createElement('iframe');
  iframe.src = baseUrl + '/widget/' + orgId;
  iframe.allow = 'autoplay; microphone; camera; display-capture';
  iframe.style.cssText = '\
    width: 380px;\
    height: 600px;\
    max-height: calc(100vh - 100px);\
    border: none;\
    border-radius: 16px;\
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);\
    background: transparent;\
    transition: opacity 0.3s ease, transform 0.3s ease;\
    opacity: 0;\
    transform: translateY(20px) scale(0.95);\
    pointer-events: none;\
    visibility: hidden;\
    margin-bottom: 20px;\
    display: block;\
  ';

  // Responsive for mobile
  var style = document.createElement('style');
  style.innerHTML = '\
    @media (max-width: 480px) {\
      #talkfuze-container.tf-mobile-open {\
        bottom: 0px !important;\
        right: 0px !important;\
        left: 0px !important;\
        top: 0px !important;\
        width: 100% !important;\
        height: 100% !important;\
      }\
      #talkfuze-container.tf-mobile-open iframe {\
        width: 100% !important;\
        height: 100% !important;\
        max-width: 100% !important;\
        max-height: 100% !important;\
        border-radius: 0px !important;\
        margin-bottom: 0px !important;\
        box-shadow: none !important;\
      }\
      #talkfuze-container.tf-mobile-open div {\
        display: none !important;\
      }\
    }\
  ';
  document.head.appendChild(style);

  // Create Launcher Button
  var button = document.createElement('div');
  button.style.cssText = '\
    width: 60px;\
    height: 60px;\
    background: white;\
    border-radius: 50%;\
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);\
    cursor: pointer;\
    display: flex;\
    align-items: center;\
    justify-content: center;\
    transition: transform 0.2s ease, background 0.2s ease;\
    position: relative;\
    border: 2px solid white;\
    pointer-events: auto;\
  ';

  var agentImages = [
    baseUrl + '/team/1.avif',
    baseUrl + '/team/2.avif',
    baseUrl + '/team/3.avif'
  ];
  var currentImageIndex = 0;

  function renderAvatar() {
    return '\
      <div style="position: relative; width: 100%; height: 100%; border-radius: 50%; overflow: hidden;">\
        <img id="talkfuze-agent-avatar" src="' + agentImages[currentImageIndex] + '" style="width: 100%; height: 100%; object-fit: cover; transition: opacity 0.3s ease;" />\
      </div>\
      <div style="position: absolute; top: -4px; right: -4px; background: #ef4444; color: white; font-size: 11px; font-weight: bold; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">1</div>\
    ';
  }

  // Close Icon SVG
  var closeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  button.innerHTML = renderAvatar();

  // Rotate images every 4 seconds
  setInterval(function() {
    if (isOpen) return;
    currentImageIndex = (currentImageIndex + 1) % agentImages.length;
    var imgEl = document.getElementById('talkfuze-agent-avatar');
    if (imgEl) {
      imgEl.style.opacity = '0';
      setTimeout(function() {
        imgEl.src = agentImages[currentImageIndex];
        imgEl.style.opacity = '1';
      }, 300);
    }
  }, 4000);

  // Toggle Logic
  var isOpen = false;

  function openWidget() {
    if (isOpen) return;
    isOpen = true;
    iframe.style.visibility = 'visible';
    iframe.style.opacity = '1';
    iframe.style.transform = 'translateY(0) scale(1)';
    iframe.style.pointerEvents = 'all';
    
    if (window.innerWidth <= 480) {
      document.body.style.overflow = 'hidden';
      container.style.pointerEvents = 'auto';
      container.classList.add('tf-mobile-open');
    }
    
    button.style.background = 'white';
    button.style.border = '2px solid #e2e8f0';
    button.innerHTML = closeIcon;
    button.style.transform = 'scale(0.9)';
    setTimeout(function() { button.style.transform = 'scale(1)'; }, 150);
    
    try { iframe.contentWindow.postMessage({ type: 'TALKFUZE_WIDGET_OPENED' }, '*'); } catch(e) {}
  }

  function closeWidget() {
    if (!isOpen) return;
    isOpen = false;
    iframe.style.opacity = '0';
    iframe.style.transform = 'translateY(20px) scale(0.95)';
    iframe.style.pointerEvents = 'none';
    // Hide completely after animation to prevent touch interception on mobile
    setTimeout(function() {
      if (!isOpen) iframe.style.visibility = 'hidden';
    }, 300);
    
    if (window.innerWidth <= 480) {
      document.body.style.overflow = '';
      container.style.pointerEvents = 'none';
      container.classList.remove('tf-mobile-open');
    }
    
    button.style.background = 'white';
    button.style.border = '2px solid white';
    button.innerHTML = renderAvatar();
    button.style.transform = 'scale(0.9)';
    setTimeout(function() { button.style.transform = 'scale(1)'; }, 150);
  }

  button.addEventListener('click', function() {
    if (isOpen) { closeWidget(); } else { openWidget(); }
  });

  // Listen for messages from the widget iframe
  window.addEventListener('message', function(event) {
    if (!event.data || !event.data.type) return;
    if (event.data.type === 'TALKFUZE_CLOSE') {
      closeWidget();
    }
    if (event.data.type === 'TALKFUZE_OPEN') {
      openWidget();
    }
    if (event.data.type === 'TALKFUZE_EXPAND') {
      // Open widget in a new tab for full-screen experience
      window.open(baseUrl + '/widget/' + orgId, '_blank');
    }
    if (event.data.type === 'TALKFUZE_OPEN_CALL') {
      const callUrl = baseUrl + '/widget/' + orgId + '?standalone_call=true&convId=' + event.data.convId;
      const width = 380;
      const height = 550;
      const left = (window.screen.width / 2) - (width / 2);
      const top = (window.screen.height / 2) - (height / 2);
      window.open(callUrl, 'TalkFuzeSecureCall', 'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + ',status=no,menubar=no,toolbar=no,location=no,resizable=no');
    }
  });

  // Assemble
  container.appendChild(iframe);
  container.appendChild(button);
  document.body.appendChild(container);

  // Expose API to host window
  window.TalkFuze = {
    setContext: function(contextData) {
      var sendContext = function() {
        try {
          iframe.contentWindow.postMessage({
            type: 'TALKFUZE_CONTEXT',
            payload: contextData
          }, '*');
        } catch(e) {}
      };
      sendContext();
      iframe.addEventListener('load', sendContext);
    },
    open: function() { openWidget(); },
    close: function() { closeWidget(); }
  };

})();

