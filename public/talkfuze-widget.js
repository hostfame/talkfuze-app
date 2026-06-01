(function() {
    // Prevent multiple injections
    if (window.TalkFuzeWidgetInitialized) return;
    window.TalkFuzeWidgetInitialized = true;

    // Set parameters
    let orgId = 'ec2f8436-05dc-4621-8a7f-57202f865b8e';
    let baseUrl = 'https://app.talkfuze.com';
    let scriptTag = null;

    // Allow dynamic override if the script tag has data-org-id
    const injector = document.getElementById('talkfuze-script-injector');
    if (injector) {
        scriptTag = injector;
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
                scriptTag = scripts[i];
                if (src && src.startsWith('http://localhost')) {
                    baseUrl = new URL(src).origin;
                }
                break;
            }
            if (src && (src.includes('talkfuze-widget.js') || src.includes('embed.js'))) {
                orgId = scripts[i].getAttribute('data-org-id') || orgId;
                scriptTag = scripts[i];
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

    // SSO Identity: Read user data from script tag attributes
    let userIdentity = null;
    if (scriptTag) {
        const userEmail = scriptTag.getAttribute('data-user-email');
        const userName = scriptTag.getAttribute('data-user-name');
        const userClientId = scriptTag.getAttribute('data-user-client-id');
        const userSig = scriptTag.getAttribute('data-user-sig');
        const userTs = scriptTag.getAttribute('data-user-ts');

        if (userEmail && userSig && userTs) {
            userIdentity = {
                email: userEmail,
                name: userName || '',
                clientId: userClientId || '',
                sig: userSig,
                ts: userTs
            };
        }
    }

    const isMobile = window.innerWidth <= 480;
    let WIDGET_URL = `${baseUrl}/widget/${orgId}?is_mobile=${isMobile}`;

    // Append identity params to iframe URL if available
    if (userIdentity) {
        WIDGET_URL += `&user_email=${encodeURIComponent(userIdentity.email)}`;
        WIDGET_URL += `&user_name=${encodeURIComponent(userIdentity.name)}`;
        WIDGET_URL += `&user_client_id=${encodeURIComponent(userIdentity.clientId)}`;
        WIDGET_URL += `&user_sig=${encodeURIComponent(userIdentity.sig)}`;
        WIDGET_URL += `&user_ts=${encodeURIComponent(userIdentity.ts)}`;
    }
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
            position: fixed;
            bottom: ${MARGIN + BUTTON_SIZE + 14}px;
            right: ${MARGIN}px;
            width: 390px;
            max-width: calc(100vw - 32px);
            height: min(700px, calc(100vh - 160px));
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 8px 40px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.1);
            opacity: 0;
            transform: scale(0.95) translateY(10px);
            transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: none;
            margin-bottom: 20px;
            display: none;
            background-color: #1a2744;
        }

        #tf-iframe-container.tf-open {
            display: block;
        }

        #tf-iframe-container.tf-animate-in {
            opacity: 1;
            transform: scale(1) translateY(0);
            pointer-events: auto;
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
            opacity: 0;
            transform: scale(0.7);
        }

        #tf-launcher.tf-launcher-ready {
            opacity: 1;
            transform: scale(1);
        }

        @keyframes tfPulse {
            0% { box-shadow: 0 0 0 0 rgba(0, 112, 243, 0.7); }
            70% { box-shadow: 0 0 0 15px rgba(0, 112, 243, 0); }
            100% { box-shadow: 0 0 0 0 rgba(0, 112, 243, 0); }
        }

        #tf-launcher.tf-pulsing {
            animation: tfPulse 2s infinite;
        }

        #tf-launcher.tf-hide-for-focus {
            opacity: 0 !important;
            transform: scale(0.5) !important;
            pointer-events: none !important;
        }

        #tf-launcher:hover {
            transform: scale(1.06);
            box-shadow: 0 6px 20px rgba(0, 112, 243, 0.55), 0 3px 8px rgba(0,0,0,0.15);
            animation: none;
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
            right: ${MARGIN + BUTTON_SIZE + 16}px;
            background: #ffffff;
            border-radius: 100px;
            box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.1), 0 4px 10px rgba(0, 0, 0, 0.05);
            border: 1px solid rgba(226, 232, 240, 0.8);
            display: flex;
            align-items: center;
            width: 280px;
            height: ${NUDGE_HEIGHT}px;
            padding: 0;
            pointer-events: auto;
            opacity: 0;
            transform: translateX(12px) scale(0.97);
            transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.3s cubic-bezier(0.16, 1, 0.3, 1), right 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s, border-color 0.2s;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            cursor: text;
            overflow: hidden;
            z-index: 2147483646;
        }

        #tf-nudge.tf-nudge-show {
            opacity: 1;
            transform: translateX(0) scale(1);
        }

        #tf-nudge.tf-nudge-focused {
            right: ${MARGIN}px;
            width: ${280 + BUTTON_SIZE + 16}px;
            border-color: #2563eb;
            box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.1), 0 0 0 1px #2563eb, 0 0 0 4px rgba(37, 99, 235, 0.2);
        }

        #tf-nudge-input {
            flex: 1;
            border: none;
            outline: none;
            background: transparent;
            font-size: 15px;
            font-weight: 400;
            color: #0f172a;
            padding: 0 12px 0 24px;
            font-family: inherit;
            cursor: text;
            min-width: 0;
            height: 100%;
            caret-color: #0f172a;
            letter-spacing: -0.01em;
        }

        #tf-nudge-input::placeholder {
            color: #94a3b8;
            font-weight: 400;
        }

        #tf-nudge-send {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: #e2e8f0;
            color: #334155;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            margin: 0 8px 0 6px;
            transition: background 0.18s, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }

        #tf-nudge-send:hover {
            background: #cbd5e1;
            color: #0f172a;
            transform: scale(1.05);
        }

        #tf-nudge-send:active {
            transform: scale(0.92);
        }

        #tf-nudge-send svg {
            width: 20px;
            height: 20px;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
            fill: none;
        }

        /* =============================================
           REPLY NUDGE - Floating bar for unread messages
           ============================================= */
        #tf-reply-nudge {
            position: fixed;
            bottom: ${MARGIN + BUTTON_SIZE + 16}px;
            right: ${MARGIN}px;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.1), 0 4px 10px rgba(0, 0, 0, 0.05);
            border: 1px solid rgba(226, 232, 240, 0.8);
            display: flex;
            align-items: center;
            max-width: 320px;
            padding: 12px 16px;
            pointer-events: auto;
            opacity: 0;
            transform: translateY(10px) scale(0.95);
            transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            cursor: pointer;
            z-index: 2147483646;
        }

        #tf-reply-nudge.tf-reply-show {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
        
        #tf-reply-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            margin-right: 12px;
            object-fit: cover;
            flex-shrink: 0;
            display: none;
        }
        
        #tf-reply-content {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
        }
        
        #tf-reply-name {
            font-size: 13px;
            font-weight: 600;
            color: #0f172a;
            margin-bottom: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        #tf-reply-text {
            font-size: 14px;
            color: #334155;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        #tf-reply-close {
            margin-left: 12px;
            color: #94a3b8;
            cursor: pointer;
            padding: 4px;
            font-size: 18px;
            line-height: 1;
        }
        
        #tf-reply-close:hover {
            color: #64748b;
        }

        @media (max-width: 768px) {
            #tf-nudge {
                display: none !important;
            }

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
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
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
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16Z" fill="white"/>
        </svg>
    `;

    const closeIcon = `
        <svg id="tf-icon-close" class="tf-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="white"/>
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

    // Fallback avatars if API returns none (uses TalkFuze app's team photos)
    const FALLBACK_AVATARS = [
        { avatar_url: `${baseUrl}/team/4.avif` },
        { avatar_url: `${baseUrl}/team/5.avif` },
        { avatar_url: `${baseUrl}/team/6.avif` },
    ];

    // Fetch agent avatars from API
    fetch(`${baseUrl}/api/widget/agents?org_id=${orgId}`)
        .then(res => res.json())
        .then(data => {
            if (data.success && data.agents && data.agents.length > 0) {
                startAvatarCarousel(data.agents);
            } else {
                // No agents configured - use fallback team photos
                startAvatarCarousel(FALLBACK_AVATARS);
            }
        })
        .catch(() => {
            // Network error - use fallback
            startAvatarCarousel(FALLBACK_AVATARS);
        });

    // =============================================
    // Nudge - Floating pill input bar (desktop only)
    // =============================================
    const nudge = document.createElement('div');
    nudge.id = 'tf-nudge';
    nudge.innerHTML = `
        <input id="tf-nudge-input" type="text" placeholder="Write a message..." autocomplete="off" />
        <button id="tf-nudge-send" aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4L12 20M12 4L6 10M12 4L18 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
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
        if (trimmed) {
            // Send message immediately to avoid white flash of empty tab
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'TALKFUZE_PREFILL_MESSAGE', message: trimmed }, '*');
            }
        }
        if (!isOpen) toggleWidget(true);
        hideNudge();
    }

    // Clicking anywhere on pill focuses the input
    nudge.addEventListener('click', (e) => {
        if (e.target !== nudgeSend && !nudgeSend.contains(e.target)) {
            nudgeInput.focus();
        }
    });

    nudgeInput.addEventListener('focus', () => {
        nudge.classList.add('tf-nudge-focused');
        launcher.classList.add('tf-hide-for-focus');
    });

    nudgeInput.addEventListener('blur', () => {
        if (nudgeInput.value.trim() === '') {
            nudge.classList.remove('tf-nudge-focused');
            launcher.classList.remove('tf-hide-for-focus');
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

        // Skip if already fired, widget is open, or user already engaged
        const hasEngaged = localStorage.getItem('tf_has_engaged') === 'true';
        if (nudgeFired || isOpen || hasEngaged) return;

        const fireNudge = () => {
            if (nudgeFired || isOpen || localStorage.getItem('tf_has_engaged') === 'true') return;
            nudgeFired = true;
            showNudge();
            
            // Show fake badge
            const badgeEl = document.getElementById('tf-badge');
            if (badgeEl && !badgeEl.classList.contains('tf-show')) {
                badgeEl.innerText = '1';
                badgeEl.classList.add('tf-show');
            }
        };

        // After 10 seconds on page
        nudgeTimer = setTimeout(fireNudge, 10000);

        // Scroll listener for firing nudge AND hiding at footer
        if (!scrollListener) {
            scrollListener = () => {
                if (!nudgeFired && window.scrollY > 300) {
                    clearTimeout(nudgeTimer);
                    fireNudge();
                }

                if (nudgeFired && !isOpen) {
                    const scrollBottom = window.innerHeight + window.scrollY;
                    const docHeight = Math.max(
                        document.body.scrollHeight, document.documentElement.scrollHeight,
                        document.body.offsetHeight, document.documentElement.offsetHeight
                    );
                    
                    if (docHeight - scrollBottom < 200) {
                        hideNudge();
                    } else if (!nudge.classList.contains('tf-nudge-show')) {
                        showNudge();
                    }
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

        // If they open the widget, consider them engaged and stop nudging them forever
        if (isOpen) {
            localStorage.setItem('tf_has_engaged', 'true');
        }

        if (isOpen) {
            hideNudge();
            if (typeof hideReplyNudge === 'function') hideReplyNudge();
            if (nudgeTimer) clearTimeout(nudgeTimer);
            launcher.classList.add('tf-open');
            launcher.classList.remove('tf-pulsing');
            iframeContainer.classList.add('tf-open');

            if (window.innerWidth <= 768) {
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

    // =============================================
    // Reply Nudge UI
    // =============================================
    const replyNudge = document.createElement('div');
    replyNudge.id = 'tf-reply-nudge';
    replyNudge.innerHTML = `
        <img id="tf-reply-avatar" src="" alt="Agent" />
        <div id="tf-reply-content">
            <div id="tf-reply-name">Support</div>
            <div id="tf-reply-text">New message</div>
        </div>
        <div id="tf-reply-close">×</div>
    `;
    document.body.appendChild(replyNudge);

    replyNudge.addEventListener('click', (e) => {
        if (e.target.id === 'tf-reply-close') {
            if (typeof hideReplyNudge === 'function') hideReplyNudge();
        } else {
            toggleWidget(true);
            if (typeof hideReplyNudge === 'function') hideReplyNudge();
        }
    });

    let replyNudgeTimer = null;
    function showReplyNudge(text, name, avatar) {
        hideNudge();
        
        const avatarEl = document.getElementById('tf-reply-avatar');
        if (avatarEl) {
            if (avatar) {
                avatarEl.src = avatar;
                avatarEl.style.display = 'block';
            } else if (agentAvatars.length > 0) {
                avatarEl.src = agentAvatars[0].avatar_url;
                avatarEl.style.display = 'block';
            } else {
                avatarEl.src = FALLBACK_AVATARS[0].avatar_url;
                avatarEl.style.display = 'block';
            }
        }
        
        document.getElementById('tf-reply-name').innerText = name || 'Support';
        document.getElementById('tf-reply-text').innerText = text || 'Sent an attachment';
        
        replyNudge.classList.add('tf-reply-show');
        
        if (replyNudgeTimer) clearTimeout(replyNudgeTimer);
        replyNudgeTimer = setTimeout(hideReplyNudge, 8000); // 8s auto hide
    }

    function hideReplyNudge() {
        replyNudge.classList.remove('tf-reply-show');
    }

    window.addEventListener('message', (event) => {
        // Handle custom attributes update from parent window
        if (event.data && event.data.type === 'TALKFUZE_UPDATE_CONTEXT') {
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'TALKFUZE_SET_ATTRIBUTES',
                    payload: event.data.payload
                }, '*');
            }
            return;
        }

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
                    
                    if (!isOpen && event.data.message) {
                        showReplyNudge(event.data.message, event.data.senderName, event.data.avatarUrl);
                    }
                } else {
                    badgeEl.classList.remove('tf-show');
                    if (typeof hideReplyNudge === 'function') hideReplyNudge();
                }
            }
        }

        if (event.data && event.data.type === 'TALKFUZE_ZOOM_IMAGE') {
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.backgroundColor = 'rgba(0,0,0,0.85)';
            overlay.style.zIndex = '2147483647';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.cursor = 'zoom-out';
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.2s';
            
            const img = document.createElement('img');
            img.src = event.data.src;
            img.style.maxWidth = '90vw';
            img.style.maxHeight = '90vh';
            img.style.objectFit = 'contain';
            img.style.borderRadius = '8px';
            img.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
            img.style.transform = 'scale(0.95)';
            img.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
            
            overlay.appendChild(img);
            document.body.appendChild(overlay);
            
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    overlay.style.opacity = '1';
                    img.style.transform = 'scale(1)';
                });
            });
            
            overlay.addEventListener('click', () => {
                overlay.style.opacity = '0';
                img.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                }, 200);
            });
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

    // =============================================
    // TalkFuze SDK - Public API
    // =============================================
    window.TalkFuze = {
        // Identify a logged-in user at runtime (for SPA login flows)
        identify: function(data) {
            if (!data || !data.email || !data.signature || !data.timestamp) {
                console.error('TalkFuze.identify: email, signature, and timestamp are required');
                return;
            }
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'TALKFUZE_IDENTIFY',
                    email: data.email,
                    name: data.name || '',
                    clientId: data.clientId || '',
                    signature: data.signature,
                    timestamp: data.timestamp
                }, '*');
            }
        },
        setCustomAttributes: function(data) {
            if (typeof data !== 'object' || data === null) {
                console.error('TalkFuze.setCustomAttributes: data must be an object');
                return;
            }
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'TALKFUZE_SET_ATTRIBUTES',
                    payload: data
                }, '*');
            }
        },
        open: function() {
            if (!isOpen) toggleWidget();
        },
        close: function() {
            if (isOpen) toggleWidget();
        },
        toggle: function() {
            toggleWidget();
        }
    };

})();
