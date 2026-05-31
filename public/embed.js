(function() {
    // Prevent multiple injections
    if (window.TalkFuzeWidgetInitialized) return;
    window.TalkFuzeWidgetInitialized = true;

    // Set parameters
    let orgId = 'ec2f8436-05dc-4621-8a7f-57202f865b8e';
    let baseUrl = 'https://app.talkfuze.com';

    // Allow dynamic override if the script tag has data-org-id
    const injector = document.getElementById('talkfuze-script-injector');
    if (injector) {
        const dynamicOrgId = injector.getAttribute('data-org-id');
        if (dynamicOrgId) orgId = dynamicOrgId;
    }

    // Fallback: Find the script tag by searching src/attributes
    if (!injector) {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].src;
            const dataOrgId = scripts[i].getAttribute('data-org-id');
            if (dataOrgId) {
                orgId = dataOrgId;
                if (src && src.startsWith('http://localhost')) {
                    baseUrl = new URL(src).origin;
                }
                break;
            }
            if (src && (src.includes('talkfuze-widget.js') || src.includes('embed.js'))) {
                orgId = scripts[i].getAttribute('data-org-id') || orgId;
                if (src.startsWith('http://localhost')) {
                    baseUrl = new URL(src).origin;
                }
                break;
            }
        }
    }

    if (!orgId) {
        console.error('TalkFuze Widget: Missing data-org-id.');
        return;
    }

    const WIDGET_URL = `${baseUrl}/widget/${orgId}`;
    const BUTTON_SIZE = 60;
    const MARGIN = 20;
    const NUDGE_HEIGHT = 54;

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
            pointer-events: none;
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
            background-color: #0070f3;
            box-shadow: 0 4px 16px rgba(0, 112, 243, 0.45), 0 2px 6px rgba(0,0,0,0.12);
            cursor: pointer;
            pointer-events: auto;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s, opacity 0.35s ease;
            position: relative;
            overflow: hidden;
            opacity: 0;
            transform: scale(0.7);
        }

        #tf-launcher.tf-launcher-ready {
            opacity: 1;
            transform: scale(1);
        }

        #tf-launcher:hover {
            transform: scale(1.06);
            box-shadow: 0 6px 20px rgba(0, 112, 243, 0.55), 0 3px 8px rgba(0,0,0,0.15);
        }

        #tf-launcher:active {
            transform: scale(0.94);
        }

        .tf-icon {
            position: absolute;
            width: 26px;
            height: 26px;
            fill: white;
            transition: opacity 0.25s ease, transform 0.25s ease;
        }

        #tf-icon-chat {
            opacity: 0;
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
            transition: opacity 0.4s ease;
        }

        #tf-agent-avatar.tf-show {
            opacity: 1;
        }

        /* When widget is open, hide avatar so X icon is visible */
        .tf-open #tf-agent-avatar {
            opacity: 0 !important;
        }

        .tf-badge {
            position: absolute;
            top: -3px;
            right: -3px;
            background-color: #ef4444;
            color: white;
            font-size: 11px;
            font-weight: 700;
            height: 20px;
            min-width: 20px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.25);
            opacity: 0;
            transform: scale(0.5);
            transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: none;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            border: 2px solid white;
        }

        .tf-badge.tf-show {
            opacity: 1;
            transform: scale(1);
        }

        /* =============================================
           NUDGE PILL - Premium, aligned with bubble
           ============================================= */
        #tf-nudge {
            position: fixed;
            bottom: ${MARGIN + Math.round((BUTTON_SIZE - NUDGE_HEIGHT) / 2)}px;
            right: ${MARGIN + BUTTON_SIZE + 10}px;
            background: #ffffff;
            border-radius: 100px;
            box-shadow: 0 4px 20px rgba(15, 23, 42, 0.10), 0 1px 4px rgba(15, 23, 42, 0.06);
            border: 1.5px solid rgba(226, 232, 240, 0.9);
            display: flex;
            align-items: center;
            width: 288px;
            height: ${NUDGE_HEIGHT}px;
            padding: 0;
            pointer-events: auto;
            opacity: 0;
            transform: translateX(12px) scale(0.97);
            transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            cursor: text;
            overflow: hidden;
            z-index: 2147483646;
        }

        #tf-nudge.tf-nudge-show {
            opacity: 1;
            transform: translateX(0) scale(1);
        }

        #tf-nudge-input {
            flex: 1;
            border: none;
            outline: none;
            background: transparent;
            font-size: 14px;
            font-weight: 400;
            color: #0f172a;
            padding: 0 10px 0 22px;
            font-family: inherit;
            cursor: text;
            min-width: 0;
            height: 100%;
            caret-color: #0070f3;
            letter-spacing: -0.01em;
        }

        #tf-nudge-input::placeholder {
            color: #94a3b8;
            font-weight: 400;
        }

        #tf-nudge-send {
            width: 38px;
            height: 38px;
            border-radius: 50%;
            background: #0070f3;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            margin: 0 8px 0 6px;
            transition: background 0.18s, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 2px 8px rgba(0, 112, 243, 0.35);
        }

        #tf-nudge-send:hover {
            background: #0060df;
            transform: scale(1.08);
        }

        #tf-nudge-send:active {
            transform: scale(0.92);
        }

        #tf-nudge-send svg {
            width: 16px;
            height: 16px;
            fill: white;
            transform: translateX(1px);
        }

        @media (max-width: 768px) {
            #tf-nudge {
                display: none !important;
            }
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
        checkAndTriggerNudge();
    }

    // Skeleton loading overlay - prevents white flash while iframe loads
    const skeleton = document.createElement('div');
    skeleton.id = 'tf-skeleton';
    skeleton.style.cssText = `
        position:absolute;
        inset:0;
        background:#0f172a;
        border-radius:16px;
        z-index:10;
        display:flex;
        flex-direction:column;
        overflow:hidden;
        transition:opacity 0.3s ease;
    `;
    skeleton.innerHTML = `
        <div style="padding:20px 20px 16px;display:flex;align-items:center;gap:12px;background:#0f172a;border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);flex-shrink:0;"></div>
            <div style="flex:1;">
                <div style="height:10px;width:120px;border-radius:6px;background:rgba(255,255,255,0.1);margin-bottom:7px;"></div>
                <div style="height:8px;width:80px;border-radius:6px;background:rgba(255,255,255,0.06);"></div>
            </div>
        </div>
        <div style="flex:1;background:#f8fafc;padding:20px 16px;display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;gap:10px;align-items:flex-end;">
                <div style="width:28px;height:28px;border-radius:50%;background:#e2e8f0;flex-shrink:0;"></div>
                <div style="background:#e2e8f0;border-radius:12px 12px 12px 3px;padding:10px 14px;max-width:65%;">
                    <div style="height:9px;width:110px;background:#cbd5e1;border-radius:4px;margin-bottom:6px;"></div>
                    <div style="height:9px;width:80px;background:#cbd5e1;border-radius:4px;"></div>
                </div>
            </div>
            <div style="display:flex;justify-content:flex-end;">
                <div style="background:#dbeafe;border-radius:12px 12px 3px 12px;padding:10px 14px;max-width:55%;">
                    <div style="height:9px;width:90px;background:#bfdbfe;border-radius:4px;"></div>
                </div>
            </div>
            <div style="display:flex;gap:10px;align-items:flex-end;">
                <div style="width:28px;height:28px;border-radius:50%;background:#e2e8f0;flex-shrink:0;"></div>
                <div style="background:#e2e8f0;border-radius:12px 12px 12px 3px;padding:10px 14px;max-width:70%;">
                    <div style="height:9px;width:140px;background:#cbd5e1;border-radius:4px;"></div>
                </div>
            </div>
        </div>
        <div style="background:#fff;border-top:1px solid #e2e8f0;padding:12px 16px;display:flex;align-items:center;gap:10px;">
            <div style="flex:1;height:38px;border-radius:20px;background:#f1f5f9;"></div>
            <div style="width:38px;height:38px;border-radius:50%;background:#0070f3;flex-shrink:0;"></div>
        </div>
    `;

    iframe.onload = () => {
        sendPageView();
        // Fade out skeleton once iframe is ready
        setTimeout(() => {
            skeleton.style.opacity = '0';
            setTimeout(() => { skeleton.remove(); }, 320);
        }, 100);
    };

    iframeContainer.appendChild(skeleton);
    iframeContainer.appendChild(iframe);

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


    // Create launcher button
    const launcher = document.createElement('div');
    launcher.id = 'tf-launcher';

    const chatIcon = `
        <svg id="tf-icon-chat" class="tf-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16Z" fill="currentColor"/>
        </svg>
    `;

    const closeIcon = `
        <svg id="tf-icon-close" class="tf-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor"/>
        </svg>
    `;

    const agentAvatar = `<img id="tf-agent-avatar" src="" alt="Agent" />`;
    const badge = `<div id="tf-badge" class="tf-badge"></div>`;

    launcher.innerHTML = agentAvatar + chatIcon + closeIcon + badge;

    container.appendChild(iframeContainer);
    container.appendChild(launcher);
    document.body.appendChild(container);

    // =============================================
    // Agent Avatar Carousel (fetched from API)
    // =============================================
    let agentAvatars = [];
    let avatarIndex = 0;
    let avatarRotateTimer = null;
    const avatarEl = document.getElementById('tf-agent-avatar');
    const chatIconEl = document.getElementById('tf-icon-chat');

    function revealLauncher() {
        launcher.classList.add('tf-launcher-ready');
    }

    function showAvatar(url) {
        if (!avatarEl || !url) return;
        const img = new Image();
        img.onload = () => {
            avatarEl.src = url;
            avatarEl.classList.add('tf-show');
            if (chatIconEl) chatIconEl.style.opacity = '0';
            revealLauncher();
        };
        img.onerror = () => {
            avatarEl.classList.remove('tf-show');
            if (chatIconEl) chatIconEl.style.opacity = '1';
            revealLauncher();
        };
        img.src = url;
    }

    function rotateAvatar() {
        if (agentAvatars.length === 0) return;
        avatarIndex = (avatarIndex + 1) % agentAvatars.length;
        showAvatar(agentAvatars[avatarIndex].avatar_url);
    }

    function startAvatarCarousel(agents) {
        agentAvatars = agents;
        if (agents.length === 0) {
            // No avatars - show chat icon
            if (chatIconEl) chatIconEl.style.opacity = '1';
            return;
        }
        // Show first avatar immediately
        showAvatar(agents[0].avatar_url);
        // Rotate every 10 seconds if multiple agents
        if (agents.length > 1) {
            if (avatarRotateTimer) clearInterval(avatarRotateTimer);
            avatarRotateTimer = setInterval(rotateAvatar, 10000);
        }
    }

    // Fetch agent avatars from API
    fetch(`${baseUrl}/api/widget/agents?org_id=${orgId}`)
        .then(res => res.json())
        .then(data => {
            if (data.success && data.agents && data.agents.length > 0) {
                startAvatarCarousel(data.agents);
            } else {
                // No avatars - show chat icon
                if (chatIconEl) chatIconEl.style.opacity = '1';
                revealLauncher();
            }
        })
        .catch(() => {
            // Network error - show chat icon
            if (chatIconEl) chatIconEl.style.opacity = '1';
            revealLauncher();
        });

    // =============================================
    // Nudge - Floating pill input bar (desktop only)
    // =============================================
    const nudge = document.createElement('div');
    nudge.id = 'tf-nudge';
    nudge.innerHTML = `
        <input id="tf-nudge-input" type="text" placeholder="Write a message..." autocomplete="off" />
        <button id="tf-nudge-send" aria-label="Send">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
    `;
    document.body.appendChild(nudge);

    const nudgeInput = nudge.querySelector('#tf-nudge-input');
    const nudgeSend = nudge.querySelector('#tf-nudge-send');

    let isOpen = sessionStorage.getItem('tf_widget_open') === 'true';
    const swooshAudio = new Audio(baseUrl + '/swoosh.mp3');
    let isSoundMuted = localStorage.getItem('tf_widget_muted') === 'true';

    function openWidgetWithMessage(text) {
        const trimmed = (text || '').trim();
        if (!isOpen) toggleWidget(true);
        hideNudge();
        if (trimmed) {
            // Wait for widget to open + iframe to be ready, then send message
            setTimeout(() => {
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ type: 'TALKFUZE_PREFILL_MESSAGE', message: trimmed }, '*');
                }
            }, 500);
        }
    }

    // Clicking anywhere on pill focuses the input
    nudge.addEventListener('click', (e) => {
        if (e.target !== nudgeSend && !nudgeSend.contains(e.target)) {
            nudgeInput.focus();
        }
    });

    // Send button click
    nudgeSend.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = nudgeInput.value;
        nudgeInput.value = '';
        openWidgetWithMessage(text);
    });

    // Enter key sends
    nudgeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const text = nudgeInput.value;
            nudgeInput.value = '';
            openWidgetWithMessage(text);
        }
    });

    function showNudge() {
        if (window.innerWidth <= 768) return;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                nudge.classList.add('tf-nudge-show');
            });
        });
    }

    function hideNudge() {
        nudge.classList.remove('tf-nudge-show');
    }

    let nudgeFired = false;
    let nudgeTimer = null;
    let scrollListener = null;

    function checkAndTriggerNudge() {
        if (nudgeTimer) clearTimeout(nudgeTimer);

        // Desktop only
        if (window.innerWidth <= 768) return;

        // Skip if already fired or widget is open
        if (nudgeFired || isOpen) return;

        const fireNudge = () => {
            if (nudgeFired || isOpen) return;
            nudgeFired = true;
            showNudge();
            if (scrollListener) window.removeEventListener('scroll', scrollListener);
        };

        // After 8 seconds on page
        nudgeTimer = setTimeout(fireNudge, 8000);

        // Or after 300px scroll - whichever first
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

    // Kick off nudge check shortly after setup
    setTimeout(checkAndTriggerNudge, 500);

    function toggleWidget(playSound = true) {
        isOpen = !isOpen;
        sessionStorage.setItem('tf_widget_open', isOpen);

        if (isOpen) {
            hideNudge();
            if (nudgeTimer) clearTimeout(nudgeTimer);
            launcher.classList.add('tf-open');
            iframeContainer.classList.add('tf-open');

            if (window.innerWidth <= 480) {
                document.body.style.overflow = 'hidden';
                container.classList.add('tf-mobile-open');
            }

            if (playSound && !isSoundMuted) swooshAudio.play().catch(() => {});
            setTimeout(() => {
                iframeContainer.classList.add('tf-animate-in');
            }, 10);

            iframe.contentWindow.postMessage({ type: 'TALKFUZE_OPENED' }, '*');

            const badgeEl = document.getElementById('tf-badge');
            if (badgeEl) badgeEl.classList.remove('tf-show');
        } else {
            launcher.classList.remove('tf-open');
            iframeContainer.classList.remove('tf-animate-in');

            if (window.innerWidth <= 480) {
                document.body.style.overflow = '';
                container.classList.remove('tf-mobile-open');
            }

            if (playSound && !isSoundMuted) swooshAudio.play().catch(() => {});
            setTimeout(() => {
                iframeContainer.classList.remove('tf-open');
            }, 300);

            iframe.contentWindow.postMessage({ type: 'TALKFUZE_CLOSED' }, '*');
        }
    }

    // Initialize state on load
    if (isOpen) {
        isOpen = false;
        toggleWidget(false);
    }

    launcher.addEventListener('click', toggleWidget);

    // Listen for messages from iframe
    window.addEventListener('message', (event) => {
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

        // Override avatar from iframe if it sends one (e.g. active agent in conversation)
        if (event.data && event.data.type === 'TALKFUZE_AGENT_AVATAR') {
            if (event.data.avatarUrl) {
                // Stop carousel and pin to this agent's avatar
                if (avatarRotateTimer) clearInterval(avatarRotateTimer);
                showAvatar(event.data.avatarUrl);
            } else if (agentAvatars.length > 0) {
                // Resume carousel
                showAvatar(agentAvatars[0].avatar_url);
                if (agentAvatars.length > 1) {
                    avatarRotateTimer = setInterval(rotateAvatar, 10000);
                }
            } else {
                if (avatarEl) avatarEl.classList.remove('tf-show');
                if (chatIconEl) chatIconEl.style.opacity = '1';
            }
        }
    });

})();
