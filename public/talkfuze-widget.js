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

        #tf-agent-avatar {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            object-fit: cover;
            opacity: 0;
            transform: scale(0.5);
            transition: opacity 0.3s ease, transform 0.3s ease;
        }

        #tf-agent-avatar.tf-show {
            opacity: 1;
            transform: scale(1);
        }

        .tf-badge {
            position: absolute;
            top: -4px;
            right: -4px;
            background-color: #ef4444; /* Red */
            color: white;
            font-size: 12px;
            font-weight: bold;
            height: 22px;
            min-width: 22px;
            border-radius: 11px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 6px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            opacity: 0;
            transform: scale(0.5);
            transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: none;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        .tf-badge.tf-show {
            opacity: 1;
            transform: scale(1);
        }

        #tf-nudge {
            position: absolute;
            right: 100%;
            bottom: 0px;
            margin-right: 20px;
            background: #ffffff;
            padding: 16px;
            border-radius: 16px;
            border-bottom-right-radius: 4px;
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08), 0 4px 8px rgba(15, 23, 42, 0.04);
            width: 260px;
            pointer-events: auto;
            opacity: 0;
            transform: translateY(10px) scale(0.95);
            transform-origin: bottom right;
            transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            display: none;
            border: 1px solid rgba(226, 232, 240, 0.8);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        #tf-nudge.tf-nudge-show {
            display: block;
            opacity: 1;
            transform: translateY(0) scale(1);
        }

        #tf-nudge-close {
            position: absolute;
            top: 12px;
            right: 12px;
            width: 24px;
            height: 24px;
            color: #94a3b8;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            cursor: pointer;
            transition: color 0.2s, background 0.2s;
        }

        #tf-nudge-close:hover {
            background: #f1f5f9;
            color: #0f172a;
        }
        
        #tf-nudge-btn {
            width: 100%;
            background: #0f172a;
            color: white;
            border: none;
            border-radius: 10px;
            padding: 10px 0;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, background 0.2s, box-shadow 0.2s;
            margin-top: 4px;
        }
        
        #tf-nudge-btn:hover {
            background: #1e293b;
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
        }
        
        #tf-nudge-btn:active {
            transform: scale(0.97);
        }
            
        @media (max-width: 480px) {
            #tf-widget-container.tf-mobile-open {
                bottom: 0px !important;
                right: 0px !important;
                left: 0px !important;
                top: 0px !important;
                width: 100% !important;
                height: 100% !important;
                align-items: stretch !important;
            }
            
            #tf-widget-container.tf-mobile-open #tf-iframe-container {
                width: 100% !important;
                height: 100% !important;
                max-width: 100% !important;
                max-height: 100% !important;
                border-radius: 0px !important;
                margin-bottom: 0px !important;
                box-shadow: none !important;
                transform-origin: center center !important;
            }

            #tf-widget-container.tf-mobile-open #tf-launcher {
                display: none !important;
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
    iframe.allow = 'autoplay; microphone; camera; display-capture';
    
    // Pageview tracking
    function sendPageView() {
        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({ 
                type: 'TALKFUZE_PAGE_VIEW', 
                title: document.title, 
                url: window.location.href 
            }, '*');
        }
        if (typeof checkAndTriggerNudge === 'function') {
            checkAndTriggerNudge();
        }
    }

    iframe.onload = () => {
        sendPageView();
    };

    // SPA Navigation Tracking
    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        setTimeout(sendPageView, 100);
    };
    
    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        setTimeout(sendPageView, 100);
    };

    window.addEventListener('popstate', () => {
        setTimeout(sendPageView, 100);
    });
    
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

    // Agent Avatar Img
    const agentAvatar = `<img id="tf-agent-avatar" src="" alt="Agent" />`;

    // Unread Badge
    const badge = `<div id="tf-badge" class="tf-badge"></div>`;

    launcher.innerHTML = agentAvatar + chatIcon + closeIcon + badge;

    container.appendChild(iframeContainer);
    container.appendChild(launcher);
    document.body.appendChild(container);

    // ==========================================
    // Nudge Logic (Lurker Catcher)
    // ==========================================
    const nudge = document.createElement('div');
    nudge.id = 'tf-nudge';
    
    nudge.innerHTML = `
        <div id="tf-nudge-close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </div>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom: 8px;">
            <div style="width:24px; height:24px; border-radius:50%; background:#0070f3; display:flex; align-items:center; justify-content:center;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"/></svg>
            </div>
            <span style="font-weight:700; font-size:13px; color:#0f172a;">Hostnin Support</span>
        </div>
        <div id="tf-nudge-text" style="color:#475569; font-size:13.5px; line-height:1.5; margin-bottom:12px;"></div>
        <button id="tf-nudge-btn">Chat with us</button>
    `;
    launcher.appendChild(nudge);

    const nudgeText = nudge.querySelector('#tf-nudge-text');
    const nudgeClose = nudge.querySelector('#tf-nudge-close');
    const nudgeBtn = nudge.querySelector('#tf-nudge-btn');

    const NUDGE_CONFIG = {
        rules: [
            { pathMatch: '/vps', message: 'Need help picking the right VPS plan? 👋' },
            { pathMatch: '/shared-hosting', message: 'Looking for web hosting? We can help you choose! 🚀' },
            { pathMatch: '/cart', message: 'Having trouble completing your order? 💳' },
            { pathMatch: 'cart.php', message: 'Having trouble completing your order? 💳' }
        ],
        delayMs: 20000 // 20 seconds
    };
    let nudgeTimer = null;

    let isOpen = sessionStorage.getItem('tf_widget_open') === 'true';
    const swooshAudio = new Audio(baseUrl + '/swoosh.mp3');
    const popAudio = new Audio(baseUrl + '/pop.mp3');
    let isSoundMuted = localStorage.getItem('tf_widget_muted') === 'true';

    // Nudge actions
    nudge.addEventListener('click', (e) => {
        if (e.target === nudgeClose || e.target === nudgeBtn) return;
        if (!isOpen) toggleWidget(true);
        hideNudge(true);
    });
    
    nudgeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!isOpen) toggleWidget(true);
        hideNudge(true);
    });
    
    nudgeClose.addEventListener('click', (e) => {
        e.stopPropagation();
        hideNudge(true); // dismiss for session
    });

    function showNudge(message) {
        nudgeText.innerText = message;
        nudge.style.display = 'block';
        // Use double requestAnimationFrame for butter smooth initial transition
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                nudge.classList.add('tf-nudge-show');
                if (!isSoundMuted) popAudio.play().catch(e => console.log('Audio play blocked:', e));
            });
        });
    }

    function hideNudge(dismissSession = false) {
        if (dismissSession) {
            sessionStorage.setItem('tf_nudge_dismissed', 'true');
        }
        nudge.classList.remove('tf-nudge-show');
        setTimeout(() => {
            nudge.style.display = 'none';
        }, 400); 
    }

    let nudgeFired = false;
    let scrollListener = null;

    function checkAndTriggerNudge() {
        if (nudgeTimer) clearTimeout(nudgeTimer);
        
        // Desktop only
        if (window.innerWidth <= 768) return;

        // Skip if already fired, widget is open, or user dismissed it
        if (nudgeFired || isOpen || sessionStorage.getItem('tf_nudge_dismissed')) return;

        const currentUrl = window.location.href.toLowerCase();
        let matchedMessage = null;

        for (const rule of NUDGE_CONFIG.rules) {
            if (currentUrl.includes(rule.pathMatch)) {
                matchedMessage = rule.message;
                break;
            }
        }

        // If no specific URL match, use dynamic OS text
        if (!matchedMessage) {
            const ua = navigator.userAgent;
            let device = "your device";
            if (ua.includes("Mac OS X")) device = "your Mac";
            else if (ua.includes("Windows")) device = "your Windows PC";
            else if (ua.includes("Linux")) device = "your Linux machine";
            
            matchedMessage = `Welcome back! Need any help configuring hosting for ${device}? Talk with our product experts - we're just a message away.`;
        }

        if (matchedMessage) {
            const fireNudge = () => {
                if (nudgeFired) return;
                nudgeFired = true;
                if (!isOpen && !sessionStorage.getItem('tf_nudge_dismissed')) {
                    showNudge(matchedMessage);
                }
                if (scrollListener) {
                    window.removeEventListener('scroll', scrollListener);
                }
            };

            // 1. Time delay (20s)
            nudgeTimer = setTimeout(fireNudge, NUDGE_CONFIG.delayMs);

            // 2. Scroll delay (300px)
            if (!scrollListener) {
                scrollListener = () => {
                    if (window.scrollY > 300) {
                        clearTimeout(nudgeTimer);
                        fireNudge();
                    }
                };
                window.addEventListener('scroll', scrollListener, { passive: true });
            }
        }
    }

    function toggleWidget(playSound = true) {
        isOpen = !isOpen;
        sessionStorage.setItem('tf_widget_open', isOpen);
        
        if (isOpen) {
            hideNudge(false);
            if (nudgeTimer) clearTimeout(nudgeTimer);
            launcher.classList.add('tf-open');
            iframeContainer.classList.add('tf-open');
            
            // Lock body scroll and apply full-screen styles on mobile viewports
            if (window.innerWidth <= 480) {
                document.body.style.overflow = 'hidden';
                container.classList.add('tf-mobile-open');
            }
            
            if (playSound && !isSoundMuted) swooshAudio.play().catch(e => console.log('Audio play blocked:', e));
            // small delay to allow display:block to apply before animating opacity/transform
            setTimeout(() => {
                iframeContainer.classList.add('tf-animate-in');
            }, 10);
            
            // Tell iframe it's opened
            iframe.contentWindow.postMessage({ type: 'TALKFUZE_OPENED' }, '*');
            
            // Clear unread badge
            const badgeEl = document.getElementById('tf-badge');
            if (badgeEl) badgeEl.classList.remove('tf-show');
        } else {
            launcher.classList.remove('tf-open');
            iframeContainer.classList.remove('tf-animate-in');
            
            // Unlock body scroll and remove full-screen overlay styles on mobile
            if (window.innerWidth <= 480) {
                document.body.style.overflow = '';
                container.classList.remove('tf-mobile-open');
            }
            
            if (playSound && !isSoundMuted) swooshAudio.play().catch(e => console.log('Audio play blocked:', e));
            setTimeout(() => {
                iframeContainer.classList.remove('tf-open');
            }, 300); // match transition duration
            
            // Tell iframe it's closed
            iframe.contentWindow.postMessage({ type: 'TALKFUZE_CLOSED' }, '*');
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
        // Most secure and robust way: verify the message came from OUR iframe, regardless of its origin URL
        if (event.source !== iframe.contentWindow) return;

        if (event.data && event.data.type === 'TALKFUZE_CLOSE') {
            if (isOpen) toggleWidget();
        }

        if (event.data && event.data.type === 'TALKFUZE_OPEN') {
            if (!isOpen) toggleWidget();
        }
        
        if (event.data && event.data.type === 'TALKFUZE_SET_COLOR') {
            launcher.style.backgroundColor = event.data.color;
        }

        if (event.data && event.data.type === 'TALKFUZE_MUTE_TOGGLE') {
            isSoundMuted = event.data.muted;
            localStorage.setItem('tf_widget_muted', isSoundMuted);
        }

        if (event.data && event.data.type === 'TALKFUZE_OPEN_CALL') {
            const callUrl = `${baseUrl}/widget/${orgId}?standalone_call=true&convId=${event.data.convId}&deviceId=${event.data.deviceId}`;
            // Open as a gorgeous center-screen calling popup window
            const width = 380;
            const height = 550;
            const left = (window.screen.width / 2) - (width / 2);
            const top = (window.screen.height / 2) - (height / 2);
            window.open(callUrl, 'TalkFuzeSecureCall', `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no,location=no,resizable=no`);
        }

        if (event.data && event.data.type === 'TALKFUZE_UNREAD_COUNT') {
            const badgeEl = document.getElementById('tf-badge');
            if (badgeEl) {
                if (event.data.count > 0) {
                    badgeEl.innerText = event.data.count > 9 ? '9+' : event.data.count;
                    badgeEl.classList.add('tf-show');
                } else {
                    badgeEl.classList.remove('tf-show');
                }
            }
        }

        if (event.data && event.data.type === 'TALKFUZE_AGENT_AVATAR') {
            const avatarEl = document.getElementById('tf-agent-avatar');
            const chatIcon = document.getElementById('tf-icon-chat');
            if (avatarEl && chatIcon) {
                if (event.data.avatarUrl) {
                    avatarEl.src = event.data.avatarUrl;
                    avatarEl.classList.add('tf-show');
                    chatIcon.style.opacity = '0';
                } else {
                    avatarEl.classList.remove('tf-show');
                    chatIcon.style.opacity = '1';
                }
            }
        }
    });

})();
