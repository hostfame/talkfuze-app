(function() {
    // Prevent multiple injections
    if (window.TalkFuzeWidgetInitialized) return;
    window.TalkFuzeWidgetInitialized = true;

    // Find the script tag to extract parameters
    const scripts = document.getElementsByTagName('script');
    let currentScript = null;
    let orgId = null;
    let baseUrl = 'https://app.talkfuze.com';

    for (let i = 0; i < scripts.length; i++) {
        const src = scripts[i].src;
        if (src && src.includes('talkfuze-widget.js')) {
            currentScript = scripts[i];
            orgId = currentScript.getAttribute('data-org-id');
            // Allow overriding baseUrl for local testing
            if (src.startsWith('http://localhost')) {
                const url = new URL(src);
                baseUrl = url.origin;
            }
            break;
        }
    }

    if (!orgId) {
        console.error('TalkFuze Widget: Missing data-org-id attribute on the script tag.');
        return;
    }

    // Config
    const WIDGET_URL = `${baseUrl}/widget/${orgId}`;
    const BUTTON_SIZE = 60;
    const MARGIN = 20;

    // Create a shadow DOM or just inject CSS into head. Injecting CSS into head is safer for cross-origin iframes.
    const style = document.createElement('style');
    style.innerHTML = `
        #tf-widget-container {
            position: fixed;
            bottom: ${MARGIN}px;
            right: ${MARGIN}px;
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            pointer-events: none; /* Let clicks pass through the container */
        }
        
        #tf-iframe-container {
            width: 400px;
            height: 700px;
            max-height: calc(100vh - ${MARGIN * 2 + BUTTON_SIZE + 20}px);
            max-width: calc(100vw - ${MARGIN * 2}px);
            background: transparent;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 12px 28px rgba(0,0,0,0.15), 0 8px 10px rgba(0,0,0,0.08);
            opacity: 0;
            transform: scale(0.95) translateY(20px);
            transform-origin: bottom right;
            transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: auto;
            margin-bottom: 20px;
            display: none;
        }

        #tf-iframe-container.tf-open {
            display: block;
        }
        
        #tf-iframe-container.tf-animate-in {
            opacity: 1;
            transform: scale(1) translateY(0);
        }

        #tf-iframe {
            width: 100%;
            height: 100%;
            border: none;
            background: transparent;
        }

        #tf-launcher {
            width: ${BUTTON_SIZE}px;
            height: ${BUTTON_SIZE}px;
            border-radius: 50%;
            background-color: #0070f3; /* Default hostnin/talkfuze blue */
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            cursor: pointer;
            pointer-events: auto;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s;
            position: relative;
        }

        #tf-launcher:hover {
            transform: scale(1.05);
        }

        #tf-launcher:active {
            transform: scale(0.95);
        }

        .tf-icon {
            position: absolute;
            width: 28px;
            height: 28px;
            fill: white;
            transition: opacity 0.3s ease, transform 0.3s ease;
        }

        #tf-icon-chat {
            opacity: 1;
            transform: rotate(0deg) scale(1);
        }

        #tf-icon-close {
            opacity: 0;
            transform: rotate(-90deg) scale(0.5);
        }

        .tf-open #tf-icon-chat {
            opacity: 0;
            transform: rotate(90deg) scale(0.5);
        }

        .tf-open #tf-icon-close {
            opacity: 1;
            transform: rotate(0deg) scale(1);
        }
            
        @media (max-width: 480px) {
            #tf-iframe-container {
                width: calc(100vw - 40px);
                height: calc(100vh - 120px);
            }
        }
    `;
    document.head.appendChild(style);

    // Create container
    const container = document.createElement('div');
    container.id = 'tf-widget-container';

    // Create iframe container
    const iframeContainer = document.createElement('div');
    iframeContainer.id = 'tf-iframe-container';

    const iframe = document.createElement('iframe');
    iframe.id = 'tf-iframe';
    iframe.src = WIDGET_URL;
    iframe.allow = 'autoplay; microphone; camera';
    
    iframeContainer.appendChild(iframe);

    // Create launcher button
    const launcher = document.createElement('div');
    launcher.id = 'tf-launcher';

    // SVG for chat icon (default intercom-ish or generic chat bubble)
    const chatIcon = `
        <svg id="tf-icon-chat" class="tf-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16Z" fill="currentColor"/>
        </svg>
    `;

    // SVG for close icon
    const closeIcon = `
        <svg id="tf-icon-close" class="tf-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor"/>
        </svg>
    `;

    launcher.innerHTML = chatIcon + closeIcon;

    container.appendChild(iframeContainer);
    container.appendChild(launcher);
    document.body.appendChild(container);

    let isOpen = sessionStorage.getItem('tf_widget_open') === 'true';

    // Setup audio
    const swooshAudio = new Audio(baseUrl + '/swoosh.mp3');
    const popAudio = new Audio(baseUrl + '/pop.mp3');
    let isSoundMuted = localStorage.getItem('tf_widget_muted') === 'true';

    function toggleWidget(playSound = true) {
        isOpen = !isOpen;
        sessionStorage.setItem('tf_widget_open', isOpen);
        
        if (isOpen) {
            launcher.classList.add('tf-open');
            iframeContainer.classList.add('tf-open');
            if (playSound && !isSoundMuted) swooshAudio.play().catch(e => console.log('Audio play blocked:', e));
            // small delay to allow display:block to apply before animating opacity/transform
            setTimeout(() => {
                iframeContainer.classList.add('tf-animate-in');
            }, 10);
            
            // Tell iframe it's opened
            iframe.contentWindow.postMessage({ type: 'TALKFUZE_OPENED' }, '*');
        } else {
            launcher.classList.remove('tf-open');
            iframeContainer.classList.remove('tf-animate-in');
            if (playSound && !isSoundMuted) swooshAudio.play().catch(e => console.log('Audio play blocked:', e));
            setTimeout(() => {
                iframeContainer.classList.remove('tf-open');
            }, 300); // match transition duration
        }
    }

    // Initialize state on load
    if (isOpen) {
        isOpen = false; // reset so toggle flips it to true
        toggleWidget(false); // open without sound on load
    }

    launcher.addEventListener('click', toggleWidget);

    // Listen for messages from iframe
    window.addEventListener('message', (event) => {
        // Validate origin if needed, but since it's a widget on arbitrary sites, 
        // we check if it matches baseUrl
        if (event.origin !== baseUrl) return;

        if (event.data && event.data.type === 'TALKFUZE_CLOSE') {
            if (isOpen) toggleWidget();
        }
        
        if (event.data && event.data.type === 'TALKFUZE_SET_COLOR') {
            launcher.style.backgroundColor = event.data.color;
        }

        if (event.data && event.data.type === 'TALKFUZE_MUTE_TOGGLE') {
            isSoundMuted = event.data.muted;
            localStorage.setItem('tf_widget_muted', isSoundMuted);
        }
    });

})();
