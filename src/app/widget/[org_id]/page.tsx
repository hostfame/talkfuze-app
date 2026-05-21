"use client"

import { Send, Zap, X, Bot, Home, MessageCircle, Ticket, Info, ChevronRight, ChevronLeft, Mic, StopCircle, Plus, ChevronDown, Loader2, Paperclip, Video, LogOut, Database, Phone, PhoneOff, User, Sparkles, Shield, Eye } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { sendWidgetMessage, getWidgetMessages, getWidgetSettings, uploadWidgetMedia, startNewConversation, getWidgetConversations, markMessagesAsRead, getAgentProfile, updateWidgetContactDetails, getWidgetContact } from "@/actions/chat"
import { logBrowserCall } from "@/actions/calls"
import { supabase } from "@/lib/supabase"
import { createPeerConnection, VOICE_CONSTRAINTS, createRemoteAudioElement, destroyRemoteAudioElement, requestWakeLock, releaseWakeLock, isScreenShareSupported, unlockAudioContext, bindRemoteAudioStream } from "@/lib/webrtc"
import type { AppMessage } from "@/lib/types"
import { playUISound, playAlertLoop, stopAlertLoop, playRingbackLoop, stopRingbackLoop } from "@/lib/sounds"
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react'

type WidgetMessage = AppMessage & {
  agent?: {
    name: string | null;
    avatar_url: string | null;
  } | null;
}

function getStoredDeviceId() {
  if (typeof window === 'undefined') return ""

  let deviceId = localStorage.getItem("talkfuze_device_id")
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem("talkfuze_device_id", deviceId)
  }
  return deviceId
}

const CustomAudioPlayer = ({ url, isDark }: { url: string, isDark: boolean }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current && !isDragging) {
      setCurrentTime(audioRef.current.currentTime);
      setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Real-time seek drag/scrub mechanics
  const handleScrub = (clientX: number, currentTarget: HTMLDivElement) => {
    if (!audioRef.current || !duration) return;
    const rect = currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    audioRef.current.currentTime = percentage * duration;
    setProgress(percentage * 100);
    setCurrentTime(percentage * duration);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleScrub(e.clientX, e.currentTarget);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    handleScrub(e.clientX, e.currentTarget);
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsDragging(true);
    if (e.touches.length > 0) {
      handleScrub(e.touches[0].clientX, e.currentTarget);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (e.touches.length > 0) {
      handleScrub(e.touches[0].clientX, e.currentTarget);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Determine styles and colors based on bubble alignment
  let containerBg = 'bg-[#f3f4f6] dark:bg-slate-800/80 border border-slate-200/40 dark:border-slate-700/50 text-slate-800 dark:text-slate-100 rounded-[18px] shadow-sm';
  let buttonStyle = 'bg-[#0070f3] text-white hover:bg-[#0062d2] shadow-sm';
  let timeStyle = 'text-slate-400 dark:text-slate-500';
  let activeWaveColor = '#0070f3';
  let inactiveWaveColor = 'rgba(0, 112, 243, 0.15)';
  let playheadColor = '#0070f3';

  if (isDark) {
    // Visitor message (on the right) - give it a slightly cleaner rounded border configuration
    containerBg = 'bg-[#f3f4f6] dark:bg-slate-800/80 border border-slate-200/40 dark:border-slate-700/50 text-slate-800 dark:text-slate-100 rounded-[18px] rounded-br-[4px] shadow-sm';
  }

  // Wave bar heights (22 bars)
  const waveHeights = [8, 14, 10, 18, 12, 22, 16, 24, 18, 26, 20, 24, 16, 20, 12, 16, 10, 14, 8, 12, 6, 10];

  return (
    <div className={`flex items-center gap-3 py-2.5 px-3.5 transition-all duration-300 ${containerBg} min-w-[230px] max-w-[280px]`}>
      <audio 
        ref={audioRef} 
        src={url} 
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => { setIsPlaying(false); setProgress(0); setCurrentTime(0); }}
        className="hidden" 
      />
      
      <button 
        onClick={togglePlay} 
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 hover:scale-105 active:scale-95 ${buttonStyle}`}
      >
        {isPlaying ? (
           <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
        ) : (
           <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>
 
      <div className="flex-1 flex flex-col justify-center gap-1 overflow-hidden pr-1">
        <div className="flex items-center gap-2 w-full">
          <div 
            className="flex items-end gap-[2.5px] h-7 flex-1 cursor-pointer select-none group/wave relative py-1"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {waveHeights.map((barHeight, i, arr) => {
              const barProgress = (i / arr.length) * 100;
              const isActive = progress >= barProgress;
              return (
                <div 
                  key={i} 
                  className="w-[3px] rounded-full transition-all duration-75 origin-bottom"
                  style={{ 
                    height: `${barHeight}px`,
                    backgroundColor: isActive ? activeWaveColor : inactiveWaveColor,
                    transform: isDragging && isActive ? 'scaleY(1.15)' : undefined
                  }}
                />
              );
            })}

            {/* Smooth Floating Scrubbing Playhead */}
            <div 
              className={`absolute top-1/2 -translate-y-1/2 -ml-1.5 w-3 h-3 rounded-full pointer-events-none transition-opacity duration-200 z-30 shadow-[0_1px_4px_rgba(0,0,0,0.3)] ${
                isDragging ? 'opacity-100 scale-125' : 'opacity-0 group-hover/wave:opacity-100'
              }`}
              style={{ 
                left: `${progress}%`,
                backgroundColor: playheadColor
              }}
            />
          </div>
        </div>
        
        <div className={`text-[10px] font-bold tracking-wide flex justify-between ${timeStyle}`}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

const FileIcon = ({ size = 20, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const VideoIcon = ({ size = 20, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const renderMessageContent = (msg: WidgetMessage, isDark: boolean) => {
  const meta = (msg.metadata || {}) as any;
  const url = meta.url || meta.media_url || "";
  const filename = meta.filename || "";
  const mimetype = meta.mimetype || "";
  const progress = meta.uploadProgress || 0;
  const status = msg.status as string;

  // 1. If currently uploading, render the progressive fill overlay
  if (status === 'uploading') {
    const isImageOrVideo = msg.content_type === 'image' || msg.content_type === 'video';
    
    if (isImageOrVideo && url) {
      return (
        <div className="relative rounded-[14px] overflow-hidden max-w-[240px] max-h-[200px] border border-slate-200/50 shadow-sm animate-in fade-in duration-300">
          {msg.content_type === 'image' ? (
            <img src={url} className="w-full h-full object-cover blur-[2px] opacity-60" alt="Uploading Preview" />
          ) : (
            <div className="w-[200px] h-[150px] bg-slate-900/10 blur-[2px] flex items-center justify-center">
              <VideoIcon size={24} className="text-slate-400" />
            </div>
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 text-white gap-2">
            {/* Sleek water-tank fill progress circle */}
            <div className="relative w-12 h-12 rounded-full border-2 border-white/30 flex items-center justify-center overflow-hidden">
              <div 
                className="absolute bottom-0 left-0 right-0 bg-[#0070f3] transition-all duration-300 ease-out" 
                style={{ height: `${progress}%` }}
              />
              <span className="relative text-[11px] font-bold text-white z-10">{progress}%</span>
            </div>
            <span className="text-[10px] font-semibold text-white/95 tracking-wide">Uploading...</span>
          </div>
        </div>
      );
    }

    return (
      <div className={`flex flex-col gap-2 p-3.5 rounded-[14px] min-w-[200px] animate-in fade-in duration-300 ${isDark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg shrink-0 ${isDark ? 'bg-white/10 text-white' : 'bg-slate-200 text-slate-600'}`}>
            <FileIcon size={20} className="animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-semibold truncate leading-snug">{filename || 'Uploading...'}</p>
            <p className="text-[10px] opacity-65 font-medium mt-0.5">Uploading {progress}%</p>
          </div>
        </div>
        <div className="h-1.5 w-full bg-slate-200/30 rounded-full overflow-hidden">
          <div className="h-full bg-[#0070f3] rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
        </div>
      </div>
    );
  }

  // 2. Render completed types
  switch (msg.content_type) {
    case 'image':
      return (
        <div className="relative group overflow-hidden rounded-[14px] border border-slate-200/30 shadow-sm transition-all duration-300">
          <img 
            src={url} 
            alt={filename || 'Image Attachment'} 
            className="max-w-[240px] max-h-[200px] rounded-[14px] object-cover cursor-pointer transition-all duration-300 hover:brightness-95 group-hover:scale-[1.01]"
            onClick={() => window.open(url, '_blank')}
          />
        </div>
      );
    case 'video':
      return (
        <video 
          src={url} 
          controls 
          className="max-w-[240px] max-h-[200px] rounded-[14px] overflow-hidden border border-slate-200/30 shadow-sm" 
        />
      );
    case 'audio':
      return <CustomAudioPlayer url={url} isDark={isDark} />;
    case 'file':
      return (
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer" 
          className={`flex items-center gap-3 p-3 rounded-[14px] transition-all shadow-[0_2px_8px_rgba(0,0,0,0.02)] ${isDark ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-100'}`}
        >
          <div className={`p-2.5 rounded-lg shrink-0 ${isDark ? 'bg-white/10 text-white' : 'bg-slate-200 text-slate-500'}`}>
            <FileIcon size={20} />
          </div>
          <div className="flex-1 min-w-0 pr-1">
            <p className="text-[13.5px] font-semibold truncate leading-snug">{filename || 'Download Document'}</p>
            <p className="text-[10px] opacity-65 font-medium uppercase tracking-wider mt-0.5">{mimetype ? mimetype.split('/')[1] || 'FILE' : 'FILE'}</p>
          </div>
        </a>
      );
    default:
      return <span className="break-words">{msg.content}</span>;
  }
};

export default function WidgetPage() {
  const params = useParams()
  const org_id = params.org_id as string
  const [deviceId] = useState(getStoredDeviceId)
  const [messages, setMessages] = useState<WidgetMessage[]>([])
  const [input, setInput] = useState("")
  const [isAgentTyping, setIsAgentTyping] = useState(false)
  const [isAgentRecording, setIsAgentRecording] = useState(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [settings, setSettings] = useState<any>(null)

  // Dragging logic for the Co-Browsing banner
  const [bannerPosition, setBannerPosition] = useState({ y: 0 });
  const isDraggingBanner = useRef(false);
  const dragStartY = useRef(0);
  const initialBannerY = useRef(0);

  const handleBannerPointerDown = (e: React.PointerEvent) => {
    // Only drag if clicking the banner background, not the stop button
    if ((e.target as HTMLElement).tagName.toLowerCase() === 'button') return;
    isDraggingBanner.current = true;
    dragStartY.current = e.clientY;
    initialBannerY.current = bannerPosition.y;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleBannerPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingBanner.current) return;
    const deltaY = e.clientY - dragStartY.current;
    let newY = initialBannerY.current + deltaY;
    if (newY > 80) newY = 80; // Don't let it go below screen
    setBannerPosition({ y: newY });
  };

  const handleBannerPointerUp = (e: React.PointerEvent) => {
    isDraggingBanner.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const emojiPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  
  const [conversations, setConversations] = useState<any[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | 'new' | null>(null)
  
  type Tab = 'home' | 'messages' | 'chat' | 'tickets' | 'about'
  const [activeTab, setActiveTab] = useState<Tab>('home')
  
  // WHMCS Tickets State
  const [ticketView, setTicketView] = useState<'login' | 'list' | 'detail' | 'new'>('login')
  const [whmcsUser, setWhmcsUser] = useState<{ clientId: number, name?: string } | null>(null)
  const [whmcsTickets, setWhmcsTickets] = useState<any[]>([])
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const [ticketEmail, setTicketEmail] = useState("")
  const [ticketOtp, setTicketOtp] = useState("")
  const [ticketPassword, setTicketPassword] = useState("")
  const [ticketLoginMethod, setTicketLoginMethod] = useState<'otp' | 'password'>('otp')
  const [ticketOtpSent, setTicketOtpSent] = useState(false)
  const [ticketOtpTimer, setTicketOtpTimer] = useState(0)
  const [isTicketOtpFocused, setIsTicketOtpFocused] = useState(false)
  const [ticketLoading, setTicketLoading] = useState(false)
  const [ticketError, setTicketError] = useState("")
  
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false)
  const [tempName, setTempName] = useState("")
  const [tempPhone, setTempPhone] = useState("")
  const [isUpdatingIdentity, setIsUpdatingIdentity] = useState(false)
  
  // Co-Browsing WebRTC State
  const [showCoBrowseRequest, setShowCoBrowseRequest] = useState(false)
  const [isCoBrowsingActive, setIsCoBrowsingActive] = useState(false)
  const coBrowseConnectionRef = useRef<RTCPeerConnection | null>(null)
  const coBrowseStreamRef = useRef<MediaStream | null>(null)
  const coBrowseBufferedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const coBrowseChannelRef = useRef<any>(null)
  const urlBroadcastRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const coBrowseStartTimeRef = useRef<number>(0)

  // Broadcast visitor's current page URL to agent during co-browse
  useEffect(() => {
    if (isCoBrowsingActive && coBrowseChannelRef.current) {
      // Send initial URL immediately
      const getVisitorUrl = () => {
        try {
          // Widget runs in iframe - get parent page URL
          // Try window.parent.location first (same-origin), fallback to document.referrer
          let url = document.referrer || window.location.href;
          try { url = window.parent.location.href; } catch { /* cross-origin */ }
          return url;
        } catch { return ''; }
      }

      const broadcastUrl = () => {
        const url = getVisitorUrl();
        if (url && coBrowseChannelRef.current) {
          coBrowseChannelRef.current.send({
            type: 'broadcast',
            event: 'visitor_url_update',
            payload: { url }
          });
        }
      }

      broadcastUrl(); // Send immediately
      urlBroadcastRef.current = setInterval(broadcastUrl, 3000); // Then every 3s for navigation changes
    } else {
      if (urlBroadcastRef.current) {
        clearInterval(urlBroadcastRef.current);
        urlBroadcastRef.current = null;
      }
    }
    return () => {
      if (urlBroadcastRef.current) {
        clearInterval(urlBroadcastRef.current);
        urlBroadcastRef.current = null;
      }
    }
  }, [isCoBrowsingActive])

  // Premium toast notification state
  const [toastError, setToastError] = useState<string | null>(null)
  const [showMicPermissionGuide, setShowMicPermissionGuide] = useState(false)

  useEffect(() => {
    if (toastError) {
      const t = setTimeout(() => setToastError(null), 6000)
      return () => clearTimeout(t)
    }
  }, [toastError])

  // Live Voice Call State
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'active' | 'declined' | 'ended' | 'ringing'>('idle')
  const [isCallMuted, setIsCallMuted] = useState(false)
  const voiceConnectionRef = useRef<RTCPeerConnection | null>(null)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null)
  const voiceBufferedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const [callDuration, setCallDuration] = useState(0)
  const callDurationRef = useRef(0)
  const callTimerRef = useRef<NodeJS.Timeout | null>(null)
  const voiceChannelRef = useRef<any>(null)
  const incomingAgentCallRef = useRef<{ offer: any } | null>(null)

  const subscribeToVoiceCall = (convId: string) => {
    // Force remove existing call channel first to prevent duplicate channels
    const oldCh = supabase.getChannels().find(c => c.topic === `realtime:voicecall:${convId}`);
    if (oldCh) {
      supabase.removeChannel(oldCh);
    }

    const callChannel = supabase.channel(`voicecall:${convId}`)
      .on('broadcast', { event: 'voice_call_answered' }, async (payload) => {
        try {
          setCallStatus('active')
          const pc = voiceConnectionRef.current
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.payload.answer));
            // Now that agent answered, start the ICE connection timeout
            if ((pc as any).startTimeout) (pc as any).startTimeout();

            // Flush buffered candidates
            if (voiceBufferedCandidatesRef.current.length > 0) {
              for (const candidate of voiceBufferedCandidatesRef.current) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                  console.error("Error adding buffered candidate:", e);
                }
              }
              voiceBufferedCandidatesRef.current = [];
            }
          }
          setCallDuration(0)
          callDurationRef.current = 0
          if (callTimerRef.current) clearInterval(callTimerRef.current)
          callTimerRef.current = setInterval(() => {
            setCallDuration(d => d + 1)
            callDurationRef.current += 1
          }, 1000)
        } catch (err) {
          console.error("Answer setup failed", err)
        }
      })
      .on('broadcast', { event: 'voice_call_declined' }, () => {
        handleEndVoiceCall(false)
        setCallStatus('declined')
        setTimeout(() => setCallStatus('idle'), 5000)
      })
      .on('broadcast', { event: 'voice_call_ended' }, () => {
        handleEndVoiceCall(false)
      })
      .on('broadcast', { event: 'voice_call_from_agent' }, (payload) => {
        // Agent is calling the visitor
        console.log('[Widget Call] Received voice_call_from_agent, offer present:', !!payload.payload?.offer);
        incomingAgentCallRef.current = { offer: payload.payload.offer }
        setCallStatus('ringing')
      })
      .on('broadcast', { event: 'ice_candidate' }, async (payload) => {
        const pc = voiceConnectionRef.current;
        if (pc && pc.remoteDescription && payload.payload.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.payload.candidate));
          } catch (e) {
            console.error("Error adding ice candidate:", e);
          }
        } else if (payload.payload.candidate) {
          voiceBufferedCandidatesRef.current.push(payload.payload.candidate);
        }
      })

    callChannel.subscribe((status) => {
      console.log(`[Widget VoiceChannel] Subscribe status: ${status} for conv: ${convId}`);
      if (status === 'SUBSCRIBED') {
        voiceChannelRef.current = callChannel
      }
    })

    return callChannel;
  }

  useEffect(() => {
    if (!activeConversationId || activeConversationId === 'new') return

    const callChannel = subscribeToVoiceCall(activeConversationId);

    return () => {
      supabase.removeChannel(callChannel)
      voiceChannelRef.current = null
      if (callTimerRef.current) clearInterval(callTimerRef.current)
    }
  }, [activeConversationId])

  const handleStartVoiceCall = async () => {
    // Warm up/unlock the mobile browser audio context synchronously inside the user click event
    const unlockedAudio = unlockAudioContext();

    let targetConvId = activeConversationId;
    if (!targetConvId || targetConvId === 'new') {
      try {
        const res = await sendWidgetMessage(org_id, deviceId, "Started a voice call", "system");
        if (!res || !res.success || !res.conversationId) throw new Error("Creation failed");
        targetConvId = res.conversationId;
        setActiveConversationId(res.conversationId);
      } catch (e) {
        console.error("Failed to create conversation for call", e);
        setToastError("Failed to initiate call. Please try again.");
        return;
      }
    }
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setToastError("Microphone API unavailable. Ensure you're on a secure context (HTTPS) and your browser supports WebRTC.")
        return
      }

      setCallStatus('calling')
      
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(VOICE_CONSTRAINTS);
      } catch (err: any) {
        setCallStatus('idle')
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
          setToastError("Microphone blocked. Click the lock icon in the URL bar to allow. On Mac, also check System Settings > Privacy & Security > Microphone.")
          setShowMicPermissionGuide(true)
        } else {
          setToastError("Failed to access microphone. Please check your system settings or device connection.")
          setShowMicPermissionGuide(true)
        }
        return
      }
      
      // Re-initialize a clean call channel specifically for this outgoing call
      const callChannel = subscribeToVoiceCall(targetConvId as string);
      // Wait up to 3s for channel to subscribe
      for (let i = 0; i < 30; i++) {
        if (voiceChannelRef.current === callChannel) break;
        await new Promise(r => setTimeout(r, 100));
      }

      voiceStreamRef.current = stream

      const pc = createPeerConnection({
        onConnectionFailed: () => {
          console.warn('[Widget] Voice call ICE failed, auto-ending');
          handleEndVoiceCall(true);
          setToastError('Call connection failed. Please try again.');
        },
        deferTimeout: true // Don't start timeout until agent answers
      });
      voiceConnectionRef.current = pc

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Request wake lock to prevent screen sleep during call
      requestWakeLock();

      pc.ontrack = (event) => {
        // Use pre-unlocked mobile-safe audio element
        bindRemoteAudioStream(unlockedAudio, event.streams[0]);
        voiceAudioRef.current = unlockedAudio;
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && voiceChannelRef.current) {
          voiceChannelRef.current.send({
            type: 'broadcast',
            event: 'ice_candidate',
            payload: { candidate: event.candidate }
          })
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Force remove any old global channel first to guarantee clean subscription
      const oldGlobal = supabase.getChannels().find(c => c.topic === `realtime:voicecall_global:${org_id}`);
      if (oldGlobal) {
        await supabase.removeChannel(oldGlobal);
      }

      const globalChannel = supabase.channel(`voicecall_global:${org_id}`);
      globalChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          globalChannel.send({
            type: 'broadcast',
            event: 'voice_call_alert',
            payload: { 
              conversationId: targetConvId,
              offer: offer,
              callerName: 'Visitor'
            }
          }).then(() => {
            // Clean up global channel right after broadcast is sent to prevent duplicate sub conflicts
            supabase.removeChannel(globalChannel);
          });
          
          // Delay the actual offer broadcast by 1.5s as fallback for active channels
          setTimeout(() => {
            if (voiceChannelRef.current) {
              voiceChannelRef.current.send({
                type: 'broadcast',
                event: 'voice_call_incoming',
                payload: { offer }
              });
            }
          }, 1500);

          // Auto-end after 30s if agent doesn't answer
          setTimeout(() => {
            if (voiceConnectionRef.current === pc && pc.iceConnectionState === 'new') {
              console.warn('[Widget] 30s ringing timeout, agent did not answer');
              handleEndVoiceCall(true);
              setToastError('No answer. The agent may be unavailable.');
            }
          }, 30000);
        }
      });

    } catch (err: any) {
      console.error("Mic access denied or WebRTC error", err)
      alert("Voice Call Error: " + (err.message || String(err)));
      setCallStatus('idle')
      setToastError("Microphone access is required to place calls. Please click the lock icon in your address bar and toggle 'Allow'.")
    }
  }

  const handleEndVoiceCall = (sendBroadcast = true) => {
    voiceBufferedCandidatesRef.current = [];
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach(t => t.stop())
      voiceStreamRef.current = null
    }
    if (voiceConnectionRef.current) {
      voiceConnectionRef.current.close()
      voiceConnectionRef.current = null
    }
    // Clean up audio element and release wake lock
    destroyRemoteAudioElement(voiceAudioRef.current);
    voiceAudioRef.current = null;
    releaseWakeLock();
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }
    
    if (sendBroadcast && voiceChannelRef.current) {
      voiceChannelRef.current.send({
        type: 'broadcast',
        event: 'voice_call_ended'
      })
    }

    // Force remove existing channels to guarantee clean state
    if (voiceChannelRef.current) {
      supabase.removeChannel(voiceChannelRef.current)
      voiceChannelRef.current = null
    }
    const globalChannel = supabase.getChannels().find(c => c.topic === `realtime:voicecall_global:${org_id}`);
    if (globalChannel) {
      supabase.removeChannel(globalChannel);
    }

    if (activeConversationId && activeConversationId !== 'new') {
      const duration = callDurationRef.current;
      if (duration > 0) {
        sendWidgetMessage(org_id, deviceId, `Voice call ended`, 'system', { duration: formatCallDuration(duration) }, activeConversationId);
      } else {
        sendWidgetMessage(org_id, deviceId, `Missed voice call`, 'system', {}, activeConversationId);
      }

      // Log browser call to call_logs table
      logBrowserCall({
        orgId: org_id,
        direction: 'browser_inbound',
        durationSeconds: duration,
        status: duration > 0 ? 'ANSWERED' : 'MISSED',
        conversationId: activeConversationId,
        contactName: 'Web Visitor'
      }).catch(err => console.error('Failed to log browser call:', err))
    }
    
    setCallStatus('idle')
    setCallDuration(0)
    callDurationRef.current = 0
    setIsCallMuted(false)

    // Resubscribe to a fresh, clean conversation voice channel to listen for future agent-initiated calls
    if (activeConversationId && activeConversationId !== 'new') {
      subscribeToVoiceCall(activeConversationId);
    }
  }

  const toggleMuteVoiceCall = () => {
    if (voiceStreamRef.current) {
      const audioTrack = voiceStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsCallMuted(!audioTrack.enabled);
      }
    }
  }

  // Visitor answers an agent-initiated call
  const handleAnswerAgentCall = async () => {
    const incoming = incomingAgentCallRef.current;
    console.log('[Widget Call] handleAnswerAgentCall - incoming:', !!incoming, 'activeConv:', activeConversationId, 'channelRef:', !!voiceChannelRef.current);
    if (!incoming || !activeConversationId) return;

    // Warm up/unlock the mobile browser audio context synchronously inside the "Accept" click event
    const unlockedAudio = unlockAudioContext();

    try {
      setCallStatus('active')
      incomingAgentCallRef.current = null;

      const stream = await navigator.mediaDevices.getUserMedia(VOICE_CONSTRAINTS);
      voiceStreamRef.current = stream;

      const pc = createPeerConnection({
        onConnectionFailed: () => {
          console.warn('[Widget] Agent-initiated call ICE failed, auto-ending');
          handleEndVoiceCall(true);
          setToastError('Call connection failed. Please try again.');
        }
      });
      voiceConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Request wake lock for active call
      requestWakeLock();

      pc.ontrack = (event) => {
        bindRemoteAudioStream(unlockedAudio, event.streams[0]);
        voiceAudioRef.current = unlockedAudio;
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && voiceChannelRef.current) {
          voiceChannelRef.current.send({
            type: 'broadcast',
            event: 'ice_candidate',
            payload: { candidate: event.candidate }
          })
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(incoming.offer));

      // Flush buffered candidates
      if (voiceBufferedCandidatesRef.current.length > 0) {
        for (const candidate of voiceBufferedCandidatesRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error("Error adding buffered candidate:", e);
          }
        }
        voiceBufferedCandidatesRef.current = [];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (voiceChannelRef.current) {
        console.log('[Widget Call] Sending voice_call_answered_by_visitor on channel:', voiceChannelRef.current.topic);
        voiceChannelRef.current.send({
          type: 'broadcast',
          event: 'voice_call_answered_by_visitor',
          payload: { answer }
        })
      } else {
        console.error('[Widget Call] Cannot send answer - voiceChannelRef.current is null!');
      }

      setCallDuration(0)
      callDurationRef.current = 0
      if (callTimerRef.current) clearInterval(callTimerRef.current)
      callTimerRef.current = setInterval(() => {
        setCallDuration(d => d + 1)
        callDurationRef.current += 1
      }, 1000)
    } catch (err) {
      console.error("Visitor failed to answer agent call", err)
      setCallStatus('idle')
      setToastError("Microphone access is required to answer calls.")
    }
  }

  // Visitor declines an agent-initiated call
  const handleDeclineAgentCall = () => {
    console.log('[Widget Call] Declining agent call, channelRef:', !!voiceChannelRef.current);
    incomingAgentCallRef.current = null;
    setCallStatus('idle')
    if (voiceChannelRef.current) {
      voiceChannelRef.current.send({
        type: 'broadcast',
        event: 'voice_call_declined_by_visitor'
      })
    }
  }

  const formatCallDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  useEffect(() => {
    if (!activeConversationId || activeConversationId === 'new') return

    const cobrowseChannel = supabase.channel(`cobrowse:${activeConversationId}`)
      .on('broadcast', { event: 'request_screen_share' }, () => {
        setShowCoBrowseRequest(true)
      })
      .on('broadcast', { event: 'screen_share_ended' }, () => {
        if (coBrowseStreamRef.current) {
          coBrowseStreamRef.current.getTracks().forEach(t => t.stop())
          coBrowseStreamRef.current = null
        }
        if (coBrowseConnectionRef.current) {
          coBrowseConnectionRef.current.close()
          coBrowseConnectionRef.current = null
        }
        setIsCoBrowsingActive(false)
        setShowCoBrowseRequest(false)
      })
      .on('broadcast', { event: 'webrtc_answer' }, async (payload) => {
        const pc = coBrowseConnectionRef.current;
        if (pc && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.payload.answer));

          // Flush buffered candidates
          if (coBrowseBufferedCandidatesRef.current.length > 0) {
            for (const candidate of coBrowseBufferedCandidatesRef.current) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              } catch (e) {
                console.error("Error adding buffered candidate:", e);
              }
            }
            coBrowseBufferedCandidatesRef.current = [];
          }
        }
      })
      .on('broadcast', { event: 'ice_candidate' }, async (payload) => {
        const pc = coBrowseConnectionRef.current;
        if (pc && pc.remoteDescription && payload.payload.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.payload.candidate));
          } catch (e) {
            console.error("Error adding ice candidate:", e);
          }
        } else if (payload.payload.candidate) {
          coBrowseBufferedCandidatesRef.current.push(payload.payload.candidate);
        }
      })
    cobrowseChannel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        coBrowseChannelRef.current = cobrowseChannel
      }
    })

    return () => {
      stopAlertLoop()
      supabase.removeChannel(cobrowseChannel)
      coBrowseChannelRef.current = null
    }
  }, [activeConversationId])

  // Start/stop alert sound when co-browse request popup is visible + auto-timeout
  useEffect(() => {
    if (showCoBrowseRequest) {
      playAlertLoop()
      // Auto-decline after 30s if visitor doesn't respond
      const timeout = setTimeout(() => {
        stopAlertLoop()
        setShowCoBrowseRequest(false)
        if (coBrowseChannelRef.current) {
          coBrowseChannelRef.current.send({
            type: 'broadcast',
            event: 'request_declined'
          })
        }
      }, 30000)
      return () => { stopAlertLoop(); clearTimeout(timeout) }
    } else {
      stopAlertLoop()
    }
    return () => { stopAlertLoop() }
  }, [showCoBrowseRequest])

  // Start/stop alert sound when incoming call is ringing or outgoing call is calling
  useEffect(() => {
    if (callStatus === 'ringing') {
      playAlertLoop()
    } else {
      stopAlertLoop()
    }

    if (callStatus === 'calling') {
      playRingbackLoop()
    } else {
      stopRingbackLoop()
    }

    return () => { 
      stopAlertLoop()
      stopRingbackLoop()
    }
  }, [callStatus])

  const handleAcceptCoBrowse = async () => {
    stopAlertLoop()
    setShowCoBrowseRequest(false)
    const cobrowseChannel = coBrowseChannelRef.current;
    if (!cobrowseChannel) {
      console.error("Co-browse channel not ready");
      return;
    }

    try {
      // Check if screen sharing is supported (not on iOS)
      if (!isScreenShareSupported()) {
        setToastError('Screen sharing is not supported on this device. Please use a desktop browser or Android device.');
        if (cobrowseChannel) {
          cobrowseChannel.send({ type: 'broadcast', event: 'request_declined' });
        }
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      coBrowseStreamRef.current = stream
      setIsCoBrowsingActive(true)
      coBrowseStartTimeRef.current = Date.now()

      const pc = createPeerConnection({
        onConnectionFailed: () => {
          console.warn('[Widget] Co-browse ICE failed');
          handleStopCoBrowse();
        }
      });
      coBrowseConnectionRef.current = pc

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      stream.getVideoTracks()[0].onended = () => {
        // Calculate session duration
        const durationSec = Math.floor((Date.now() - coBrowseStartTimeRef.current) / 1000)
        const durStr = `${Math.floor(durationSec / 60)}:${(durationSec % 60).toString().padStart(2, '0')}`

        if (coBrowseChannelRef.current) {
          coBrowseChannelRef.current.send({
            type: 'broadcast',
            event: 'screen_share_stopped'
          })
        }
        pc.close()
        coBrowseConnectionRef.current = null
        coBrowseStreamRef.current = null
        setIsCoBrowsingActive(false)

        // Log session to chat
        if (activeConversationId && activeConversationId !== 'new' && durationSec > 0) {
          sendWidgetMessage(org_id, deviceId, `Screen share session ended`, 'system', { duration: durStr }, activeConversationId)
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && coBrowseChannelRef.current) {
          coBrowseChannelRef.current.send({
            type: 'broadcast',
            event: 'ice_candidate',
            payload: { candidate: event.candidate }
          })
        }
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      await cobrowseChannel.send({
        type: 'broadcast',
        event: 'webrtc_offer',
        payload: { offer }
      })

    } catch (e) {
      console.error("Co-browse failed", e)
      setIsCoBrowsingActive(false)
    }
  }

  const handleDeclineCoBrowse = () => {
    stopAlertLoop()
    setShowCoBrowseRequest(false)
    if (coBrowseChannelRef.current) {
      coBrowseChannelRef.current.send({
        type: 'broadcast',
        event: 'request_declined'
      })
    }
  }

  const handleStopCoBrowse = () => {
    // Calculate session duration before cleanup
    const durationSec = coBrowseStartTimeRef.current > 0 ? Math.floor((Date.now() - coBrowseStartTimeRef.current) / 1000) : 0
    const durStr = `${Math.floor(durationSec / 60)}:${(durationSec % 60).toString().padStart(2, '0')}`

    coBrowseBufferedCandidatesRef.current = [];
    if (coBrowseStreamRef.current) {
      coBrowseStreamRef.current.getTracks().forEach(t => t.stop())
      coBrowseStreamRef.current = null
    }
    if (coBrowseConnectionRef.current) {
      coBrowseConnectionRef.current.close()
      coBrowseConnectionRef.current = null
    }
    if (coBrowseChannelRef.current) {
      coBrowseChannelRef.current.send({
        type: 'broadcast',
        event: 'screen_share_stopped'
      })
    }
    setIsCoBrowsingActive(false)

    // Log session to chat
    if (activeConversationId && activeConversationId !== 'new' && durationSec > 0) {
      sendWidgetMessage(org_id, deviceId, `Screen share session ended`, 'system', { duration: durStr }, activeConversationId)
    }
    coBrowseStartTimeRef.current = 0
  }

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const ticketEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Check for existing WHMCS session in localStorage
    try {
      const stored = localStorage.getItem('whmcs_user')
      if (stored) {
        setWhmcsUser(JSON.parse(stored))
        setTicketView('list')
      }
    } catch (e) {}
  }, [])

  useEffect(() => {
    if (selectedTicket) {
      setTimeout(() => {
        ticketEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 200);
    }
  }, [selectedTicket])

  useEffect(() => {
    if (!org_id) return
    
    // Fetch Settings
    getWidgetSettings(org_id).then(data => {
        if (data) {
            setSettings(data)
            // Post message to parent to set launcher color
            if (data.color) {
                window.parent.postMessage({ type: 'TALKFUZE_SET_COLOR', color: data.color }, '*')
            }
        }
    })
  }, [org_id])

  const fetchConversations = async () => {
    if (!org_id || !deviceId) return
    try {
      const data = await getWidgetConversations(org_id, deviceId, Date.now())
      if (data) setConversations(data)
    } catch (e) {
      console.error("Fetch convs error", e)
    }
  }

  const loadMoreMessages = async () => {
    if (!org_id || !deviceId || isLoadingMore || !hasMoreMessages || activeConversationId === 'new') return;
    setIsLoadingMore(true);
    const oldestMsg = messages[0];
    try {
      const olderMessages = await getWidgetMessages(org_id, deviceId, activeConversationId, Date.now(), 50, oldestMsg.created_at);
      if (olderMessages && olderMessages.length > 0) {
        setMessages(prev => [...olderMessages as WidgetMessage[], ...prev]);
      } else {
        setHasMoreMessages(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMore(false);
    }
  }

  const fetchMsgs = async () => {
    if (!org_id || !deviceId) return
    if (activeConversationId === 'new') {
      setMessages([])
      return
    }
    try {
      const data = await getWidgetMessages(org_id, deviceId, activeConversationId, Date.now())
      if (data) {
        setMessages(prev => {
          const dbMessages = data as WidgetMessage[];
          
          // Preserve any optimistic messages that haven't been returned by the DB yet
          const optimisticMessages = prev.filter(m => m.id.startsWith('temp-'));
          const pendingOptimistic = optimisticMessages.filter(optMsg => 
            !dbMessages.some(dbMsg => dbMsg.content === optMsg.content && dbMsg.sender_type === 'contact')
          );

          const newMessages = [...dbMessages, ...pendingOptimistic];
          
          const prevLen = prev.filter(m => !m.id.startsWith('temp-')).length;
          const newLen = dbMessages.length;
          if (newLen > prevLen) {
             const lastMsg = dbMessages[dbMessages.length - 1];
             if (lastMsg && lastMsg.sender_type !== 'contact') {
                 playUISound('receive');
             }
          }
          return newMessages;
        })
      }
    } catch (e) {
      console.error("Fetch messages error", e)
    }
  }

  useEffect(() => {
    fetchConversations()
    fetchMsgs()
    const presenceChannel = supabase.channel(`presence:${org_id}`)
    presenceChannel.on('presence', { event: 'sync' }, () => {})
    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({
          user: deviceId,
          activeConversationId: activeConversationId || null,
          online_at: new Date().toISOString()
        })
      }
    })

    const typingChannel = supabase.channel(`typing:${org_id}`)
      .on('broadcast', { event: 'typingStatus' }, (payload) => {
        if (payload.payload.direction === 'agent' && payload.payload.conversation_id === activeConversationId) {
          setIsAgentTyping(payload.payload.is_typing)
        }
      })
      .on('broadcast', { event: 'recordingStatus' }, (payload) => {
        if (payload.payload.direction === 'agent' && payload.payload.conversation_id === activeConversationId) {
          setIsAgentRecording(payload.payload.is_recording)
        }
      })
      .subscribe()
      
    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        fetchConversations()
        
        const newMsg = payload.new as any;
        if (newMsg && newMsg.conversation_id === activeConversationId && !newMsg.is_internal) {
          
          // Fetch agent details for realtime incoming agent/system messages
          if (newMsg.sender_type === 'agent' || newMsg.sender_type === 'system') {
            let existingAgent = null;
            setMessages(prev => {
              const prevMsgWithAgent = prev.find(m => m.sender_id === newMsg.sender_id && m.agent);
              if (prevMsgWithAgent) existingAgent = prevMsgWithAgent.agent;
              return prev;
            });

            if (existingAgent) {
              newMsg.agent = existingAgent;
            } else {
              const agentData = await getAgentProfile(newMsg.sender_id);
              if (agentData) {
                newMsg.agent = agentData;
              }
            }
          }

          setMessages(prev => {
            // Prevent duplicate insertion
            if (prev.some(m => m.id === newMsg.id)) return prev;
            
            // Play receive sound for incoming messages
            if (newMsg.sender_type !== 'contact') {
                playUISound('receive');
                // Immediately clear agent typing/recording state to prevent UI flicker
                setIsAgentTyping(false);
                setIsAgentRecording(false);
            }
            
            if (newMsg.sender_type === 'contact') {
              const tempIndex = prev.findIndex(m => m.id.startsWith('temp-') && m.content === newMsg.content);
              if (tempIndex !== -1) {
                const next = [...prev];
                next[tempIndex] = newMsg as WidgetMessage;
                return next;
              }
            }
            
            return [...prev, newMsg as WidgetMessage];
          });
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(typingChannel)
      supabase.removeChannel(presenceChannel)
    }
  }, [org_id, deviceId, activeConversationId])

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, activeTab])

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setInput((prev) => prev + emojiData.emoji)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(VOICE_CONSTRAINTS)
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const tempId = `temp-upload-${Date.now()}`
        const localUrl = URL.createObjectURL(audioBlob)

        // 1. Create a sleek optimistic uploading message for instant layout inclusion
        const uploadingMsg: WidgetMessage = {
          id: tempId,
          conversation_id: activeConversationId === 'new' ? '' : activeConversationId || '',
          org_id,
          sender_type: 'contact',
          sender_id: null,
          content: '[Audio Voice Message]',
          content_type: 'audio',
          metadata: {
            url: localUrl,
            filename: 'voice-message.webm',
            mimetype: 'audio/webm',
            uploadProgress: 0,
            status: 'uploading'
          } as any,
          platform_message_id: null,
          is_internal: false,
          status: 'uploading' as any,
          created_at: new Date().toISOString()
        }

        // 2. Add directly to messages state
        setMessages(prev => [...prev, uploadingMsg])

        // 3. Stop all recording tracks immediately so browser mic state turns off
        stream.getTracks().forEach(track => track.stop())

        // 4. Use progressive upload via XHR so we don't freeze the text box/input layout!
        const formData = new FormData()
        formData.append('file', audioBlob, 'voice-message.webm')

        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/upload', true)

        xhr.onload = async () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText)
              if (response.success && response.url) {
                if (activeConversationId === 'new') {
                  await startNewConversation(org_id, deviceId)
                }
                
                const res = await sendWidgetMessage(org_id, deviceId, '[Audio Voice Message]', 'audio', { 
                  url: response.url,
                  filename: 'voice-message.webm',
                  mimetype: 'audio/webm'
                }, activeConversationId === 'new' || !activeConversationId ? undefined : activeConversationId)

                if (res?.success && res.conversationId && res.conversationId !== activeConversationId) {
                  setActiveConversationId(res.conversationId)
                }

                // Update local temp message state to final sent state
                setMessages(prev => prev.map(m => {
                  if (m.id === tempId) {
                    return {
                      ...m,
                      status: 'sent',
                      metadata: {
                        ...m.metadata,
                        url: response.url,
                        uploadProgress: 100,
                        status: 'sent'
                      }
                    }
                  }
                  return m
                }))
              } else {
                throw new Error(response.error || 'Upload failed')
              }
            } catch (err) {
              console.error("Voice message upload complete but processing failed:", err)
              setMessages(prev => prev.filter(m => m.id !== tempId))
              setToastError("Failed to send voice message. Please try again.")
            }
          } else {
            setMessages(prev => prev.filter(m => m.id !== tempId))
            setToastError("Failed to upload voice message. Please try again.")
          }
        }

        xhr.onerror = () => {
          setMessages(prev => prev.filter(m => m.id !== tempId))
          setToastError("Network error during voice message upload.")
        }

        xhr.send(formData)
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingDuration(0)
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
    } catch (e: any) {
      console.error("Microphone access denied or error:", e)
      setToastError("Microphone blocked or not available. Please allow access via your browser address bar settings.")
      setShowMicPermissionGuide(true)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null // prevent upload
      mediaRecorderRef.current.stop()
      // Stop all tracks
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      setIsRecording(false)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !deviceId) return;
    
    const file = e.target.files[0];
    const tempId = `temp-upload-${Date.now()}`;
    
    // Determine content type
    let contentType: "image" | "video" | "audio" | "file" = "file";
    if (file.type.startsWith('image/')) contentType = "image";
    else if (file.type.startsWith('video/')) contentType = "video";
    else if (file.type.startsWith('audio/')) contentType = "audio";

    // Generate local preview URL if applicable to show instantaneous preview
    const localUrl = (contentType === 'image' || contentType === 'video' || contentType === 'audio')
      ? URL.createObjectURL(file)
      : '';

    // Create a sleek optimistic uploading message
    const uploadingMsg: WidgetMessage = {
      id: tempId,
      conversation_id: activeConversationId === 'new' ? '' : activeConversationId || '',
      org_id,
      sender_type: 'contact',
      sender_id: null,
      content: '[Attachment]',
      content_type: contentType,
      metadata: {
        url: localUrl,
        filename: file.name,
        mimetype: file.type,
        uploadProgress: 0,
        status: 'uploading'
      } as any,
      platform_message_id: null,
      is_internal: false,
      status: 'uploading' as any,
      created_at: new Date().toISOString()
    };

    // Add directly to messages state
    setMessages(prev => [...prev, uploadingMsg]);

    // Use XMLHttpRequest for real-time progress events to /api/upload
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        setMessages(prev => prev.map(m => {
          if (m.id === tempId) {
            return {
              ...m,
              metadata: {
                ...m.metadata,
                uploadProgress: percentComplete
              }
            };
          }
          return m;
        }));
      }
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.success && response.url) {
            if (activeConversationId === 'new') {
              await startNewConversation(org_id, deviceId);
            }
            
            const res = await sendWidgetMessage(org_id, deviceId, '[Attachment]', contentType, { 
              url: response.url,
              filename: file.name,
              mimetype: file.type
            }, activeConversationId === 'new' || !activeConversationId ? undefined : activeConversationId);

            if (res?.success && res.conversationId && res.conversationId !== activeConversationId) {
              setActiveConversationId(res.conversationId);
            }

            // Update local temp message state to final sent state
            setMessages(prev => prev.map(m => {
              if (m.id === tempId) {
                return {
                  ...m,
                  status: 'sent',
                  metadata: {
                    ...m.metadata,
                    url: response.url,
                    uploadProgress: 100,
                    status: 'sent'
                  }
                };
              }
              return m;
            }));
          } else {
            throw new Error(response.error || 'Upload failed');
          }
        } catch (err) {
          console.error("Progressive upload complete but processing failed:", err);
          setMessages(prev => prev.map(m => {
            if (m.id === tempId) {
              return {
                ...m,
                status: 'error' as any,
                content: 'Failed to upload attachment.'
              };
            }
            return m;
          }));
        }
      } else {
        setMessages(prev => prev.map(m => {
          if (m.id === tempId) {
            return {
              ...m,
              status: 'error' as any,
              content: 'Failed to upload attachment.'
            };
          }
          return m;
        }));
      }
    };

    xhr.onerror = () => {
      setMessages(prev => prev.map(m => {
        if (m.id === tempId) {
          return {
            ...m,
            status: 'error' as any,
            content: 'Failed to upload attachment.'
          };
        }
        return m;
      }));
    };

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async () => {
    if (!input.trim() || isSending || !deviceId) return

    const messageText = input.trim()
    setInput("")
    playUISound('send')
    
    setTimeout(() => {
      textareaRef.current?.focus()
    }, 10)
    
    const optimisticId = `temp-${Date.now()}`
    
    // Optimistic UI update
    setMessages(prev => [...prev, {
      id: optimisticId,
      conversation_id: "",
      org_id,
      sender_type: 'contact',
      sender_id: null,
      content: messageText,
      content_type: 'text',
      metadata: null,
      platform_message_id: null,
      is_internal: false,
      status: 'delivered', // Optimistically fake delivery for instant UX
      created_at: new Date().toISOString()
    }])
    setIsSending(true)

    try {
      if (activeConversationId === 'new') {
        await startNewConversation(org_id, deviceId)
      }
      const res = await sendWidgetMessage(org_id, deviceId, messageText, 'text', {}, activeConversationId === 'new' || !activeConversationId ? undefined : activeConversationId)
      if (res?.success && res.conversationId && res.conversationId !== activeConversationId) {
        setActiveConversationId(res.conversationId)
      }
    } catch (e) {
      console.error(e)
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
    } finally {
      setIsSending(false)
      setTimeout(() => {
        textareaRef.current?.focus()
      }, 10)
    }
  }

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  const [isMuted, setIsMuted] = useState(false)

  useEffect(() => {
    // Read mute preference
    const muted = localStorage.getItem('tf_widget_muted') === 'true'
    setIsMuted(muted)
  }, [])

  const toggleMute = () => {
    const newMuted = !isMuted
    setIsMuted(newMuted)
    localStorage.setItem('tf_widget_muted', String(newMuted))
    window.parent.postMessage({ type: 'TALKFUZE_MUTE_TOGGLE', muted: newMuted }, '*')
  }

  // ... (rest of the code)
  
  // Dynamic values with fallbacks
  const themeColor = settings?.color || 'linear-gradient(to bottom right, #2563eb, #1d4ed8)' // tailwind blue-600 to blue-700
  const isCustomColor = !!settings?.color
  const greetingTitle = settings?.greetingTitle || 'Hey there! 👋'
  const greetingSubtitle = settings?.greetingSubtitle || 'How can we help?'
  
  const lastAgentMessage = [...messages].reverse().find(m => m.sender_type === 'agent' && m.agent);
  const activeAgent = lastAgentMessage?.agent || null;
  const headerName = activeAgent?.name || 'Support Team';
  const headerSubtitle = activeAgent ? 'Active' : 'Active now';

  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  // WHMCS Ticket Handlers
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (ticketOtpTimer > 0) {
      interval = setInterval(() => {
        setTicketOtpTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [ticketOtpTimer]);

  const handleResendOTP = async () => {
    if (ticketOtpTimer > 0 || ticketLoading || !ticketEmail) return;
    setTicketLoading(true);
    setTicketError("");
    try {
      const res = await fetch('/api/widget/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email: ticketEmail })
      });
      const data = await res.json();
      if (data.success) {
        setTicketOtpTimer(60);
      } else {
        setTicketError(data.error || "Failed to resend OTP");
      }
    } catch (err) {
      setTicketError("A network error occurred.");
    } finally {
      setTicketLoading(false);
    }
  };

  const handleTicketLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketEmail) return;
    setTicketLoading(true);
    setTicketError("");
    try {
      if (ticketLoginMethod === 'password') {
        if (!ticketPassword) {
          setTicketError("Password is required.");
          setTicketLoading(false);
          return;
        }
        const res = await fetch('/api/widget/whmcs/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: ticketEmail, password: ticketPassword })
        });
        const data = await res.json();
        if (data.success) {
          const user = { clientId: data.clientId, name: data.name };
          setWhmcsUser(user);
          localStorage.setItem('whmcs_user', JSON.stringify(user));
          setTicketView('list');
          fetchWhmcsTickets(data.clientId);
        } else {
          setTicketError(data.error || "Invalid email or password.");
        }
      } else {
        if (!ticketOtpSent) {
          // Send OTP (Optimistic Pattern)
          const res = await fetch('/api/widget/otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'prepare_otp', email: ticketEmail })
          });
          const data = await res.json();
          if (data.success) {
            // Artificial 1.5s delay so user sees "Sending..." and feels secure that process ran
            await new Promise(resolve => setTimeout(resolve, 1500));
            setTicketOtpSent(true);
            setTicketOtpTimer(60);
            
            // Dispatch the actual email in background
            fetch('/api/widget/otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'dispatch_email', email: ticketEmail })
            }).catch(e => console.error("OTP email dispatch failed", e));
          } else {
            setTicketError(data.error || "Failed to send OTP");
          }
        } else {
          // Verify OTP for Login
          const res = await fetch('/api/widget/otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'verify', email: ticketEmail, otp: ticketOtp, intent: 'login' })
          });
          const data = await res.json();
          if (data.success) {
            const user = { clientId: data.clientId, name: data.name };
            setWhmcsUser(user);
            localStorage.setItem('whmcs_user', JSON.stringify(user));
            setTicketView('list');
            fetchWhmcsTickets(data.clientId);
          } else {
            setTicketError(data.error || "Invalid OTP");
          }
        }
      }
    } catch (err) {
      setTicketError("A network error occurred.");
    } finally {
      setTicketLoading(false);
    }
  };

  const fetchWhmcsTickets = async (clientId: number) => {
    try {
      const res = await fetch(`/api/widget/whmcs/tickets?clientId=${clientId}`);
      const data = await res.json();
      if (data.success) {
        setWhmcsTickets(data.tickets);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFetchTicketDetails = async (ticketId: number) => {
    setTicketLoading(true);
    try {
      const res = await fetch(`/api/widget/whmcs/tickets/${ticketId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedTicket(data.ticket);
        setTicketView('detail');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTicketLoading(false);
    }
  };

  const [ticketReplyInput, setTicketReplyInput] = useState("");
  const handleTicketReply = async () => {
    if (!whmcsUser || !selectedTicket) return;
    const hasAttachments = ticketImages.length > 0;
    const hasVideoLinks = ticketVideoLinks.some(l => l.trim().length > 0);
    if (!ticketReplyInput.trim() && !hasAttachments && !hasVideoLinks) return;
    
    // Create optimistic reply
    let formattedMessage = ticketReplyInput || '';
    if (hasVideoLinks) {
      const validLinks = ticketVideoLinks.filter(l => l.trim().length > 0);
      if (validLinks.length > 0) {
        formattedMessage += (formattedMessage ? '\n\n' : '') + 'Video Attached:\n' + validLinks.join('\n');
      }
    }

    const optimisticReply = {
      admin: false,
      name: whmcsUser.name || 'You',
      date: 'Just now',
      message: formattedMessage,
      _optimisticAttachments: [...ticketImages]
    };

    setSelectedTicket((prev: any) => {
       if (!prev) return prev;
       return {
          ...prev,
          replies: {
             reply: [...(prev.replies?.reply || []), optimisticReply]
          }
       };
    });

    const payloadInput = ticketReplyInput;
    const payloadImages = [...ticketImages];
    const payloadVideoLinks = [...ticketVideoLinks];

    setTicketReplyInput("");
    setTicketImages([]);
    setTicketVideoLinks([]);
    
    setTimeout(() => {
      ticketEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    try {
      await fetch(`/api/widget/whmcs/tickets/${selectedTicket.id || selectedTicket.ticketid}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          clientId: whmcsUser.clientId, 
          message: payloadInput,
          attachments: payloadImages,
          videoLinks: payloadVideoLinks
        })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const [newTicketSubject, setNewTicketSubject] = useState("");
  const [newTicketMessage, setNewTicketMessage] = useState("");
  const [newTicketDept, setNewTicketDept] = useState(1);
  const [whmcsDepartments, setWhmcsDepartments] = useState<Array<{id: number, name: string}>>([]);
  
  const [ticketImages, setTicketImages] = useState<Array<{ name: string; data: string }>>([]);
  const [ticketVideoLinks, setTicketVideoLinks] = useState<string[]>([]);
  const ticketFileInputRef = useRef<HTMLInputElement>(null);

  const handleTicketImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
      if (ticketImages.length >= 3) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target?.result?.toString().split(',')[1];
        if (base64Data) {
          setTicketImages(prev => [...prev, { name: file.name, data: base64Data }]);
        }
      };
      reader.readAsDataURL(file);
    });
    
    if (ticketFileInputRef.current) {
      ticketFileInputRef.current.value = '';
    }
  };

  const removeTicketImage = (index: number) => {
    setTicketImages(prev => prev.filter((_, i) => i !== index));
  };

  const addTicketVideoLink = () => {
    if (ticketVideoLinks.length < 3) {
      setTicketVideoLinks(prev => [...prev, ""]);
    }
  };

  const updateTicketVideoLink = (index: number, val: string) => {
    setTicketVideoLinks(prev => {
      const newLinks = [...prev];
      newLinks[index] = val;
      return newLinks;
    });
  };

  const removeTicketVideoLink = (index: number) => {
    setTicketVideoLinks(prev => prev.filter((_, i) => i !== index));
  };
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicketSubject || !whmcsUser || (!newTicketMessage.trim() && ticketImages.length === 0 && ticketVideoLinks.length === 0)) return;
    setTicketLoading(true);
    try {
      const res = await fetch('/api/widget/whmcs/tickets/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          clientId: whmcsUser.clientId, 
          deptid: newTicketDept, 
          subject: newTicketSubject, 
          message: newTicketMessage,
          attachments: ticketImages,
          videoLinks: ticketVideoLinks
        })
      });
      const data = await res.json();
      if (data.success) {
        setNewTicketSubject("");
        setNewTicketMessage("");
        setTicketImages([]);
        setTicketVideoLinks([]);
        setTicketView('list'); // Go back to list, useEffect will fetch tickets
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTicketLoading(false);
    }
  };

  useEffect(() => {
    if (whmcsUser && ticketView === 'list') {
      fetchWhmcsTickets(whmcsUser.clientId);
    }
    
    if (ticketView === 'new' && whmcsDepartments.length === 0) {
      fetch('/api/widget/whmcs/departments')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.departments) {
            setWhmcsDepartments(data.departments);
            if (data.departments.length > 0) {
              setNewTicketDept(data.departments[0].id);
            }
          }
        })
        .catch(console.error);
    }
  }, [ticketView, whmcsUser]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setIsHeaderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [showTicketLogin, setShowTicketLogin] = useState(false);
  const [otpStep, setOtpStep] = useState<'email' | 'sending' | 'otp' | 'verifying' | 'success'>('email');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpName, setOtpName] = useState('');
  const [otpTicketId, setOtpTicketId] = useState('');

  const resetOtpModal = () => {
    setOtpStep('email');
    setOtpEmail('');
    setOtpCode('');
    setOtpError('');
    setOtpName('');
    setOtpTicketId('');
    setShowTicketLogin(false);
  };

  const conversationId = messages.find(m => m.conversation_id)?.conversation_id || '';

  const handleSendOTP = async () => {
    if (!otpEmail.trim() || !otpEmail.includes('@')) {
      setOtpError('Please enter a valid email address.');
      return;
    }
    setOtpError('');
    setOtpStep('sending');
    try {
      const res = await fetch('/api/widget/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email: otpEmail, conversationId, orgId: org_id }),
      });
      const data = await res.json();
      if (!data.success) {
        setOtpError(data.error || 'Failed to send OTP. Please try again.');
        setOtpStep('email');
      } else {
        setOtpName(data.name || '');
        setOtpStep('otp');
      }
    } catch {
      setOtpError('Network error. Please check your connection.');
      setOtpStep('email');
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode.trim() || otpCode.length < 6) {
      setOtpError('Please enter the 6-digit code.');
      return;
    }
    setOtpError('');
    setOtpStep('verifying');
    try {
      const res = await fetch('/api/widget/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email: otpEmail, otp: otpCode, conversationId, orgId: org_id }),
      });
      const data = await res.json();
      if (!data.success) {
        setOtpError(data.error || 'Incorrect code. Please try again.');
        setOtpStep('otp');
      } else {
        setOtpTicketId(data.ticketId || '');
        setOtpStep('success');
        if (data.clientId && data.name) {
          localStorage.setItem('whmcs_user', JSON.stringify({ clientId: data.clientId, name: data.name }));
          setWhmcsUser({ clientId: data.clientId, name: data.name });
        }
      }
    } catch {
      setOtpError('Network error. Please check your connection.');
      setOtpStep('otp');
    }
  };

  const handleDownloadTranscript = () => {
    const text = messages.map(m => `[${new Date(m.created_at).toLocaleString()}] ${m.sender_type === 'agent' ? m.agent?.name || 'Agent' : 'You'}: ${m.content}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TalkFuze_Transcript_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setIsHeaderMenuOpen(false);
  };

  const handleOpenIdentityModal = async () => {
    setIsHeaderMenuOpen(false);
    setIsIdentityModalOpen(true);
    try {
      const contact = await getWidgetContact(org_id, deviceId);
      if (contact) {
        setTempName(contact.name || "");
        setTempPhone(contact.phone || "");
      }
    } catch (e) {
      console.error("Error loading contact details:", e);
    }
  };

  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    setIsUpdatingIdentity(true);
    try {
      const res = await updateWidgetContactDetails(org_id, deviceId, tempName, tempPhone);
      if (res?.success) {
        setIsIdentityModalOpen(false);
        // Refresh conversations so that the new name is updated instantly!
        fetchConversations();
      }
    } catch (e) {
      console.error("Error updating contact details:", e);
    } finally {
      setIsUpdatingIdentity(false);
    }
  };

  const handleConvertToTicket = async () => {
    setIsHeaderMenuOpen(false);

    if (whmcsUser) {
      const subjectMsg = [...messages].reverse().find(m => m.sender_type !== 'agent' && m.content);
      const subject = subjectMsg ? subjectMsg.content.substring(0, 60) + (subjectMsg.content.length > 60 ? '...' : '') : 'WhatsApp Chat Escalation';
      const transcript = messages.map(m => {
          if (m.sender_type === 'system') return `* ${m.content} *`
          if (m.sender_type === 'ai') return `Nina:\n${m.content}`
          const name = m.sender_type === 'agent' ? m.agent?.name || 'Support Agent' : 'Myself'
          return `${name}:\n${m.content}`
      }).join('\n\n');
      
      const finalMessage = `Hi Team! 👋\n\nThis ticket was created from my recent live chat. Please read the chat and help me further.\n\n--- Chat History ---\n\n${transcript}`;
      
      setOtpStep('sending');
      setShowTicketLogin(true); // Show modal for loading state

      try {
        const res = await fetch('/api/widget/whmcs/tickets/new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
             clientId: whmcsUser.clientId, 
             deptid: 1, // Default support dept
             subject: subject, 
             message: finalMessage 
          })
        });
        const data = await res.json();
        if (data.success) {
           setOtpTicketId(data.result?.tid || '');
           setOtpStep('success');
        } else {
           setOtpError('Failed to convert chat. Please try again.');
           setOtpStep('email'); // Fallback to ask email
        }
      } catch {
         setOtpError('Network error. Please try again.');
         setOtpStep('email');
      }
      return;
    }

    setOtpStep('email');
    setOtpError('');
    setShowTicketLogin(true);
  };

  const handleExpandWindow = () => {
    setIsHeaderMenuOpen(false);
    window.parent.postMessage({ type: 'TALKFUZE_EXPAND' }, '*');
  };

  const headerStyle = isCustomColor ? { backgroundColor: settings.color } : {}

  const isFullScreenTicketView = activeTab === 'tickets' && (ticketView === 'detail' || ticketView === 'new');

  return (
    <div className="h-full w-full flex flex-col bg-white rounded-none sm:rounded-2xl shadow-none sm:shadow-xl overflow-hidden font-sans relative">
      
      {/* Background Gradient for Home/Tickets/About */}
      {activeTab !== 'messages' && activeTab !== 'chat' && !isFullScreenTicketView && (
        <div 
          className={`absolute top-0 left-0 right-0 h-[45%] ${!isCustomColor ? 'bg-gradient-to-b from-[#1a2744] via-[#1e3a5f] to-[#2d5a8a]' : ''} z-0`}
          style={isCustomColor ? { background: `linear-gradient(to bottom, ${settings.color}, ${settings.color}ee)` } : {}}
        />
      )}

      {/* Header controls (Close, Mute) - Absolute positioned */}
      {activeTab !== 'messages' && activeTab !== 'chat' && !isFullScreenTicketView && (
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-20 pointer-events-none">
          <div className="flex -space-x-2 opacity-0">
             {/* hidden placeholder for flex space-between balance */}
             <div className="w-8"></div>
          </div>
          <div className="flex items-center gap-1 pointer-events-auto">
            <button onClick={toggleMute} className="text-white/80 hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10" title={isMuted ? "Unmute sounds" : "Mute sounds"}>
              {isMuted ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
              )}
            </button>
            <button className="text-white/80 hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10" onClick={() => window.parent.postMessage({ type: 'TALKFUZE_CLOSE' }, '*')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M13.25 3.95L12.05 2.75L8 6.8L3.95 2.75L2.75 3.95L6.8 8L2.75 12.05L3.95 13.25L8 9.2L12.05 13.25L13.25 12.05L9.2 8L13.25 3.95Z" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 relative z-10 overflow-hidden bg-transparent">
        
        {/* HOME TAB - stays in place when chat opens (chat slides over it) */}
        <div className={`absolute inset-0 overflow-y-auto pb-[80px] scrollbar-hide bg-transparent will-change-transform transition-[transform,opacity] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${activeTab === 'home' ? 'translate-x-0 opacity-100 z-20' : activeTab === 'messages' ? '-translate-x-[30%] opacity-0 z-10 pointer-events-none' : activeTab === 'chat' ? 'translate-x-0 opacity-100 z-20 pointer-events-none' : 'opacity-0 z-10 pointer-events-none'}`}>
          <div className="px-5 pt-12 pb-6 flex flex-col gap-5">
            
            {/* Header Graphics (Ahrefs Style) */}
            <div className="flex justify-between items-center mt-4 mb-6">
              {/* Left Side: Company Logo */}
              <div className="flex items-center h-[32px]">
                <img src="/hostnin-white.png" className="h-[28px] w-auto object-contain" alt="Hostnin Logo" />
              </div>

              {/* Right Side: Team Avatars Stack */}
              <div className="flex items-center mr-1">
                <div className="flex -space-x-2.5 relative">
                  <img src="/team/1.avif" className="w-[32px] h-[32px] rounded-full border-[2px] border-slate-500 object-cover shadow-sm relative z-40" alt="Team member" />
                  <img src="/team/2.avif" className="w-[32px] h-[32px] rounded-full border-[2px] border-slate-500 object-cover shadow-sm relative z-30" alt="Team member" />
                  <img src="/team/3.avif" className="w-[32px] h-[32px] rounded-full border-[2px] border-slate-500 object-cover shadow-sm relative z-20" alt="Team member" />
                  <div className="w-[32px] h-[32px] rounded-full border-[2px] border-slate-500 bg-slate-700/80 flex items-center justify-center text-[11px] font-bold text-white shadow-sm relative z-10">
                    +9
                  </div>
                </div>
              </div>
            </div>

            {/* Header Text */}
            <div className="mb-2">
              <h1 className="text-[32px] font-bold tracking-tight text-white leading-[1.15] mb-1">{greetingTitle}</h1>
              <p className="text-white/90 text-[17px] font-medium tracking-tight">{greetingSubtitle}</p>
            </div>

            {/* Recent Message Card */}
            <div 
              className="bg-white p-4 rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.06)] border border-slate-100 flex flex-col gap-3 cursor-pointer hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] transition-all" 
              onClick={() => { setActiveConversationId(conversations[0]?.id || 'new'); setActiveTab('chat'); }}
            >
               <div className="flex justify-between items-center">
                  <span className="text-[13px] font-bold text-slate-800 tracking-tight">Recent message</span>
                  {lastMessage && <span className="text-[12px] text-slate-400">Just now</span>}
               </div>
               <div className="flex items-center gap-3">
                 <div className="relative shrink-0">
                    {activeAgent?.avatar_url ? (
                      <div className="w-[42px] h-[42px] rounded-full border border-slate-100 bg-white flex items-center justify-center shadow-sm overflow-hidden">
                        <img src={activeAgent.avatar_url} className="w-full h-full object-cover" alt={headerName} />
                      </div>
                    ) : (
                      <div className="w-[42px] h-[42px] rounded-full border border-slate-100 bg-white flex items-center justify-center shadow-sm overflow-hidden">
                         <img src="/team/h.jpg" className="w-full h-full object-cover" alt="Logo" />
                      </div>
                    )}
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                 </div>
                 <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] font-bold text-slate-800 tracking-tight">{headerName}</span>
                       {lastMessage && lastMessage.sender_type !== 'contact' && lastMessage.status !== 'read' && (
                         <div className="w-2 h-2 rounded-full bg-red-500 shrink-0"></div>
                      )}
                    </div>
                    <p className="text-[14px] text-slate-500 truncate mt-0.5 tracking-tight">
                      {lastMessage ? (lastMessage.sender_type === 'contact' ? 'You: ' + lastMessage.content : lastMessage.content) : "If you still need help with anything..."}
                    </p>
                 </div>
               </div>
            </div>

            {/* Start Chat Button */}
            <div 
              className="group bg-white rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.06)] border border-slate-100 overflow-hidden cursor-pointer hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] transition-all"
              onClick={() => { setActiveConversationId('new'); setActiveTab('chat'); }}
            >
               <div className="p-4 flex items-center justify-between text-left">
                  <div>
                    <h3 className="font-bold text-slate-800 text-[15px] tracking-tight mb-0.5">Chat with us</h3>
                    <p className="text-[13px] text-slate-500 tracking-tight">Active now</p>
                  </div>
                  <div className="w-[32px] h-[32px] bg-slate-100 group-hover:bg-slate-200 text-slate-500 group-hover:text-slate-700 rounded-full flex items-center justify-center rotate-0 shrink-0 transition-colors">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M7.4 1.899a.85.85 0 0 1 1.201 0l4.5 4.5A.85.85 0 1 1 11.9 7.6L8.85 4.552V13.5a.85.85 0 0 1-1.7 0V4.552L4.101 7.601A.85.85 0 1 1 2.9 6.399z" /></svg>
                  </div>
               </div>
            </div>
            
          </div>
        </div>

        {/* CONVERSATIONS LIST TAB - stays in place when chat opens (chat slides over it) */}
        <div className={`absolute inset-0 overflow-y-auto bg-[#f9fafb] flex flex-col will-change-transform transition-[transform,opacity] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${activeTab === 'messages' ? 'translate-x-0 opacity-100 z-20' : activeTab === 'home' ? 'translate-x-full opacity-0 z-10 pointer-events-none' : activeTab === 'chat' ? 'translate-x-0 opacity-100 z-20 pointer-events-none' : 'opacity-0 z-10 pointer-events-none'}`}>
            <div className="bg-white px-6 py-4 flex justify-between items-center shrink-0 border-b border-slate-100 relative z-30">
               <div className="flex items-center gap-1.5">
                 <button onClick={() => setActiveTab('home')} className="p-1 -ml-2 hover:bg-slate-50 transition-colors rounded-full text-slate-400">
                   <ChevronLeft size={20} />
                 </button>
                 <h1 className="text-[18px] font-bold text-slate-800 tracking-tight">Messages</h1>
               </div>
               <button className="p-1.5 hover:bg-slate-50 transition-colors rounded-full text-slate-400 -mr-1.5" onClick={() => window.parent.postMessage({ type: 'TALKFUZE_CLOSE' }, '*')}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M13.25 3.95L12.05 2.75L8 6.8L3.95 2.75L2.75 3.95L6.8 8L2.75 12.05L3.95 13.25L8 9.2L12.05 13.25L13.25 12.05L9.2 8L13.25 3.95Z" /></svg>
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-4 py-4 pb-[80px] flex flex-col gap-0 relative z-30 bg-white">
               {conversations.length === 0 ? (
                 <div className="text-center text-slate-500 mt-10 text-[14px]">No messages yet.</div>
               ) : (
                 conversations.map(conv => (
                   <div key={conv.id} onClick={() => { setActiveConversationId(conv.id); setActiveTab('chat'); }} className="bg-white p-4 cursor-pointer hover:bg-slate-50 transition-colors flex gap-3 relative border-b border-slate-50 last:border-0">
                      <div className="relative shrink-0 mt-0.5">
                         {conv.agent?.avatar_url ? (
                           <div className="w-[36px] h-[36px] rounded-full border border-slate-100 bg-white flex items-center justify-center shadow-sm overflow-hidden">
                              <img src={conv.agent.avatar_url} className="w-full h-full object-cover" alt="Agent" />
                           </div>
                         ) : (
                           <div className="w-[36px] h-[36px] rounded-full border border-slate-100 bg-white flex items-center justify-center shadow-sm overflow-hidden">
                              <img src="/team/h.jpg" className="w-full h-full object-cover" alt="Agent" />
                           </div>
                         )}
                      </div>
                      <div className="flex-1 min-w-0">
                         <div className="flex justify-between items-start">
                            <span className="font-semibold text-[14px] text-slate-800">{conv.agent?.name || "Hostnin"}</span>
                            <span className="text-[12px] text-slate-400">
                               {new Date(conv.last_message_at || conv.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                         </div>
                         <div className="flex items-center justify-between mt-0.5">
                           <p className="text-[14px] text-slate-500 truncate tracking-tight pr-4">
                              {conv.latestMessage ? (conv.latestMessage.sender_type === 'contact' ? 'You: ' + conv.latestMessage.content : conv.latestMessage.content) : 'No messages yet'}
                           </p>
                           {conv.latestMessage && conv.latestMessage.sender_type !== 'contact' && conv.latestMessage.status !== 'read' && (
                              <div className="w-2 h-2 rounded-full bg-red-500 shrink-0"></div>
                           )}
                         </div>
                      </div>
                   </div>
                 ))
               )}
            </div>

            {/* Floating Chat with us button */}
            <div className="absolute bottom-[24px] left-0 right-0 flex justify-center z-40 pointer-events-none">
               <button onClick={() => { setActiveConversationId('new'); setActiveTab('chat'); }} className="pointer-events-auto bg-[#5a718c] hover:bg-[#4d6179] text-white px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 font-semibold text-[14px] transition-all">
                  Chat with us
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
               </button>
            </div>
          </div>

        {/* CHAT TAB (THREAD) - instant show over home/messages, z-40 */}
        <div className={`absolute inset-0 overflow-hidden bg-white flex flex-col z-40 ${activeTab === 'chat' ? 'visible' : 'invisible pointer-events-none'}`}>
            {activeConversationId && (
              <div className="h-full flex flex-col relative z-30">
            
            {/* Thread Header */}
            <div className="bg-white border-b border-slate-100 px-3 py-3 flex justify-between items-center shrink-0 shadow-sm relative z-30">
              <div className="flex items-center gap-2">
                 <button onClick={() => setActiveTab('messages')} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 -ml-1">
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M10.85 3.99984C10.85 4.21984 10.77 4.43984 10.6 4.59984L7.20005 7.99984L10.6 11.3998C10.93 11.7298 10.93 12.2698 10.6 12.5998C10.27 12.9298 9.73005 12.9298 9.40005 12.5998L4.80005 7.99984L9.40005 3.39984C9.73005 3.06984 10.27 3.06984 10.6 3.39984C10.77 3.56984 10.85 3.77984 10.85 3.99984Z" /></svg>
                 </button>
                 <div className="flex items-center gap-2.5">
                   <div className="relative">
                     {activeAgent?.avatar_url ? (
                       <div className="w-9 h-9 rounded-full border border-slate-100 bg-white flex items-center justify-center shadow-sm overflow-hidden">
                          <img src={activeAgent.avatar_url} className="w-full h-full object-cover" alt={headerName} />
                       </div>
                     ) : (
                       <div className="w-9 h-9 rounded-full border border-slate-100 bg-white flex items-center justify-center shadow-sm overflow-hidden">
                          <img src="/team/h.jpg" className="w-full h-full object-cover" alt="Logo" />
                       </div>
                     )}
                     <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></div>
                   </div>
                   <div className="flex flex-col">
                     <span className="font-bold text-[14px] text-slate-800 leading-tight">{headerName}</span>
                     <span className="text-[12px] text-slate-500 leading-tight">{headerSubtitle}</span>
                   </div>
                 </div>
              </div>
              <div className="flex items-center gap-0.5 text-slate-400">
                  <button 
                    onClick={handleStartVoiceCall}
                    className="p-1.5 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50 flex items-center justify-center mr-1"
                    title="Call Support"
                  >
                    <Phone size={18} strokeWidth={2.3} className="text-slate-500 hover:text-blue-600 transition-colors" />
                  </button>
                 <div className="relative" ref={headerMenuRef}>
                   <button 
                     onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)} 
                     className="p-1.5 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50"
                   >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                   </button>
                   
                   {isHeaderMenuOpen && (
                     <div className="absolute right-0 top-full mt-1 w-max bg-white border border-slate-100 rounded-xl shadow-lg z-50 py-1 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                       <button onClick={handleConvertToTicket} className="text-left px-4 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors font-medium whitespace-nowrap">Convert to Ticket</button>
                       <button onClick={handleOpenIdentityModal} className="text-left px-4 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors font-medium whitespace-nowrap">Unlock Call & Callback Support</button>
                       <button onClick={handleDownloadTranscript} className="text-left px-4 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors font-medium whitespace-nowrap">Download Transcript</button>
                     </div>
                   )}
                 </div>
                 <button className="p-1.5 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50" onClick={() => window.parent.postMessage({ type: 'TALKFUZE_CLOSE' }, '*')}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M13.25 3.95L12.05 2.75L8 6.8L3.95 2.75L2.75 3.95L6.8 8L2.75 12.05L3.95 13.25L8 9.2L12.05 13.25L13.25 12.05L9.2 8L13.25 3.95Z" /></svg>
                 </button>
              </div>
            </div>

            {/* Compact Active Call Banner for Visitor */}
            {(callStatus === 'calling' || callStatus === 'active' || callStatus === 'declined') && (
              <div className="z-20 shrink-0 animate-in slide-in-from-top duration-200">
                <div className={`mx-0 px-4 py-2.5 flex items-center justify-between ${callStatus === 'declined' ? 'bg-red-50 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900/50' : 'bg-slate-900 text-white border-b border-slate-800'}`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    {callStatus === 'active' ? (
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    ) : callStatus === 'calling' ? (
                      <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping shrink-0" />
                    ) : null}
                    <span className={`text-[12px] font-semibold truncate ${callStatus === 'declined' ? 'text-red-600 dark:text-red-400' : ''}`}>
                      {callStatus === 'calling' ? 'Ringing...' : callStatus === 'active' ? `${formatCallDuration(callDuration)}` : 'Call declined'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {callStatus === 'active' && (
                      <button 
                        onClick={toggleMuteVoiceCall}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${isCallMuted ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                      >
                        {isCallMuted ? (
                          <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l6.02 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.34 3 3 3 .74 0 1.43-.16 2.05-.43l2.67 2.67c-1.18.9-2.67 1.43-4.32 1.43-3.66 0-6.62-2.96-6.62-6.62H4c0 4.08 3.05 7.47 7 7.93V22h2v-3.07c1.7-.2 3.28-.85 4.6-1.85L19.73 21 21 19.73 4.27 3z"/></svg>
                        ) : (
                          <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3h-1.8c0 2.27-1.84 4.1-4.11 4.1S7.89 13.27 7.89 11H6.09c0 2.93 2.3 5.37 5.21 5.8v2.9c0 .17.14.3.31.3h.8c.17 0 .31-.13.31-.3v-2.9c2.91-.43 5.21-2.87 5.21-5.8z"/></svg>
                        )}
                      </button>
                    )}
                    {callStatus !== 'declined' && (
                      <button 
                        onClick={() => handleEndVoiceCall(true)}
                        className="bg-red-500 hover:bg-red-600 active:scale-95 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg transition-all uppercase tracking-wide flex items-center gap-1"
                      >
                        <PhoneOff size={11} strokeWidth={2.5} />
                        End
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 pb-[120px] flex flex-col gap-3 bg-[#f9fafb]">
              {/* Persistent Welcome Greeting */}
              <div className="flex flex-col gap-1 items-start mb-1 mt-2">
                <div className="flex gap-2 items-end">
                  <img src="/team/h.jpg" className="w-6 h-6 rounded-full shrink-0 object-cover bg-slate-100 border border-slate-200" alt="Support Team" />
                  <div className="bg-[#f3f4f6] rounded-[18px] rounded-bl-[4px] py-3 px-4 text-[15px] text-slate-800 max-w-[85%] whitespace-pre-wrap tracking-tight">
                    Hello! How can I assist you today?
                  </div>
                </div>
                <span className="text-[11px] text-slate-400 ml-[32px]">Support Team</span>
              </div>

              {messages.length >= 50 && hasMoreMessages && (
                <div className="flex justify-center mb-2">
                  <button 
                    onClick={loadMoreMessages}
                    disabled={isLoadingMore}
                    className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full text-[12px] font-medium transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isLoadingMore ? "Loading..." : "Load previous messages"}
                  </button>
                </div>
              )}

              {messages.map((msg, idx) => {
                const isSystem = msg.sender_type === 'system';
                const isAgent = msg.sender_type === 'agent';
                const isAiOrAgent = isAgent || msg.sender_type === 'ai';

                if (isSystem) {
                  const safeMeta = typeof msg.metadata === 'string'
                    ? (() => { try { return JSON.parse(msg.metadata) } catch(e) { return {} } })()
                    : (msg.metadata || {});
                  const msgTime = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

                  // Hide the "Started a voice call" system message
                  if (msg.content === 'Started a voice call') return null;

                  // Sleek, centered system messages with thin horizontal lines to match the admin panel styling perfectly
                  let displayContent = msg.content;
                  if (msg.content.includes('voice call') || msg.content.includes('Voice call')) {
                    const isMissed = msg.content.toLowerCase().includes('missed');
                    const durationStr = safeMeta.duration ? ` (${safeMeta.duration})` : '';
                    displayContent = isMissed ? 'Missed voice call' : `Voice call ended${durationStr}`;
                  } else if (msg.content.includes('Screen share session') || msg.content.includes('screen share')) {
                    const durationStr = safeMeta.duration ? ` (${safeMeta.duration})` : '';
                    displayContent = `Screen share ended${durationStr}`;
                  }

                  return (
                    <div key={idx} className="flex items-center gap-3 my-4 px-2 select-none">
                      <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium px-2 shrink-0 tracking-tight">
                        {displayContent}
                      </span>
                      <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                    </div>
                  );
                }

                return isAiOrAgent ? (
                  <div key={idx} className="flex flex-col gap-1 items-start mb-1">
                    <div className="flex gap-2 items-end">
                      {msg.agent?.avatar_url ? (
                        <img src={msg.agent.avatar_url} className="w-6 h-6 rounded-full shrink-0 object-cover bg-slate-100 border border-slate-200" alt="Agent Avatar" />
                      ) : (
                        <div className="w-6 h-6 rounded-full shrink-0 bg-[#0070f3] flex items-center justify-center text-white font-bold text-[11px]">
                          {msg.agent?.name ? msg.agent.name.charAt(0).toUpperCase() : 'H'}
                        </div>
                      )}
                      <div className={msg.content_type === 'text' ? "bg-[#f3f4f6] rounded-[18px] rounded-bl-[4px] py-3 px-4 text-[15px] text-slate-800 max-w-[85%] whitespace-pre-wrap tracking-tight" : "max-w-[85%]"}>
                        {renderMessageContent(msg, false)}
                      </div>
                    </div>
                    {idx === messages.length - 1 && (
                      <span className="text-[11px] text-slate-400 ml-[32px]">{msg.agent?.name || 'Support Team'} • Just now</span>
                    )}
                  </div>
                ) : (() => {
                  const msgTime = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  const isSending = msg.status === 'sending' || msg.status === 'uploading';
                  const isSeen = !isSending && messages.slice(idx + 1).some(m => m.sender_type === 'agent' || m.sender_type === 'ai');
                  return (
                    <div key={idx} className="flex flex-col gap-0.5 items-end mb-1">
                      <div className={msg.content_type === 'text' ? "bg-[#64748b] rounded-[18px] rounded-br-[4px] py-3 px-4 text-[15px] text-white shadow-sm max-w-[85%] whitespace-pre-wrap tracking-tight" : "max-w-[85%]"}>
                        {renderMessageContent(msg, true)}
                      </div>
                      <div className="flex items-center gap-1 mr-0.5">
                        {msgTime && <span className="text-[11px] text-slate-400">{msgTime}</span>}
                        {isSending ? (
                          <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
                        ) : isSeen ? (
                          <svg className="w-[15px] h-[15px] text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 13l5 5L18 6"/><path d="M8 13l5 5L22 6"/></svg>
                        ) : (
                          <svg className="w-[13px] h-[13px] text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                        )}
                      </div>
                    </div>
                  );
                })()
              })}
              
              {/* Typing Indicator */}
              {isAgentTyping && (
              <div className="flex items-start gap-1 animate-in fade-in duration-300" id="tf-typing-indicator">
                 <div className="w-6 h-6 rounded-full border border-slate-100 bg-white shadow-sm flex items-center justify-center overflow-hidden shrink-0">
                    <img src={activeAgent?.avatar_url || "/team/h.jpg"} className="w-full h-full object-cover" />
                 </div>
                 <div className="bg-white border border-slate-100 rounded-[16px] rounded-tl-[4px] py-2 px-3.5 shadow-sm text-slate-500 text-[13px] flex items-center gap-1 min-h-[36px]">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                 </div>
              </div>
              )}

              {/* Voice Recording Indicator */}
              {isAgentRecording && !isAgentTyping && (
              <div className="flex items-start gap-1 animate-in fade-in slide-in-from-bottom-2 duration-300" id="tf-recording-indicator">
                 <div className="w-6 h-6 rounded-full border border-slate-100 bg-white shadow-sm flex items-center justify-center overflow-hidden shrink-0">
                    <img src={activeAgent?.avatar_url || "/team/h.jpg"} className="w-full h-full object-cover" />
                 </div>
                 <div className="bg-white border border-slate-100 rounded-[16px] rounded-tl-[4px] py-2.5 px-4 shadow-sm flex items-center gap-2.5 min-h-[40px]">
                    <div className="relative flex items-center justify-center w-5 h-5">
                      <div className="absolute inset-0 rounded-full bg-red-500/15 animate-ping" style={{ animationDuration: '1.5s' }} />
                      <svg className="w-3.5 h-3.5 text-red-500 relative z-10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                      </svg>
                    </div>
                    <span className="text-[12.5px] font-medium text-slate-500">Recording a voice</span>
                    <div className="flex items-end gap-[3px] h-4 ml-0.5">
                      <span className="w-[3px] rounded-full bg-red-400/70" style={{ animation: 'tf-soundbar 0.8s ease-in-out infinite', height: '40%' }} />
                      <span className="w-[3px] rounded-full bg-red-400/80" style={{ animation: 'tf-soundbar 0.8s ease-in-out 0.15s infinite', height: '70%' }} />
                      <span className="w-[3px] rounded-full bg-red-400/90" style={{ animation: 'tf-soundbar 0.8s ease-in-out 0.3s infinite', height: '100%' }} />
                      <span className="w-[3px] rounded-full bg-red-400/80" style={{ animation: 'tf-soundbar 0.8s ease-in-out 0.45s infinite', height: '55%' }} />
                      <span className="w-[3px] rounded-full bg-red-400/70" style={{ animation: 'tf-soundbar 0.8s ease-in-out 0.6s infinite', height: '35%' }} />
                    </div>
                 </div>
              </div>
              )}
              <style>{`
                @keyframes tf-soundbar {
                  0%, 100% { transform: scaleY(0.3); }
                  50% { transform: scaleY(1); }
                }
              `}</style>
              
              <div className="hidden" id="tf-old-typing-indicator">
                 <div className="bg-[#f3f4f6] rounded-[18px] rounded-bl-[4px] py-4 px-4 text-[15px] text-slate-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                 </div>
              </div>
              
              <div ref={messagesEndRef} className="h-4" />
            </div>
            
            {/* Embedded Composer (Intercom style floating box) */}
            <div className="absolute bottom-0 left-0 right-0 p-4 pt-10 bg-gradient-to-t from-[#f9fafb] via-[#f9fafb] to-transparent z-40 pointer-events-none">
               <div className="bg-white rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-slate-100 overflow-visible pointer-events-auto flex flex-col relative">
                  
                  {showEmojiPicker && (
                    <div ref={emojiPickerRef} className="absolute bottom-[105%] right-0 mb-2 z-50 shadow-xl rounded-xl overflow-hidden border border-slate-100">
                      <EmojiPicker onEmojiClick={handleEmojiClick} width={280} height={300} searchDisabled skinTonesDisabled previewConfig={{showPreview: false}} />
                    </div>
                  )}

                  {isRecording ? (
                    <div className="flex items-center justify-between p-4 min-h-[52px]">
                      <div className="flex items-center gap-2 text-red-500 animate-pulse">
                        <Mic size={18} />
                        <span className="text-[14px] font-bold">{formatDuration(recordingDuration)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={cancelRecording} className="text-slate-400 hover:text-slate-600 text-[13px] font-medium px-2 py-1">Cancel</button>
                        <button onClick={stopRecording} className="bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 transition-colors">
                          <StopCircle size={20} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <textarea 
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value)
                        if (activeConversationId && activeConversationId !== 'new') {
                          supabase.channel(`typing:${org_id}`).send({
                            type: 'broadcast',
                            event: 'typingStatus',
                            payload: { conversation_id: activeConversationId, direction: 'contact', is_typing: true }
                          })
                          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                          typingTimeoutRef.current = setTimeout(() => {
                            supabase.channel(`typing:${org_id}`).send({
                              type: 'broadcast',
                              event: 'typingStatus',
                              payload: { conversation_id: activeConversationId, direction: 'contact', is_typing: false }
                            })
                          }, 2000)
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          if (e.nativeEvent.isComposing) return
                          e.preventDefault()
                          handleSend()
                        }
                      }}
                      placeholder="Message..."
                      className="w-full bg-transparent border-none focus:ring-0 resize-none text-[15px] text-slate-800 placeholder:text-slate-400 p-4 pb-0 min-h-[52px] max-h-[120px] outline-none"
                      rows={1}
                    ></textarea>
                  )}
                  
                  {!isRecording && (
                     <div className="flex justify-between items-center px-2 pb-2 pt-1">
                       <input 
                         type="file" 
                         ref={fileInputRef} 
                         className="hidden" 
                         onChange={handleFileUpload} 
                         accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                       />
                       <div className="flex items-center gap-0.5 text-slate-400">
                          <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50">
                             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                          </button>
                          <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-2 transition-colors rounded-full ${showEmojiPicker ? 'text-blue-600 bg-blue-50' : 'hover:text-slate-600 hover:bg-slate-50'}`}>
                             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                          </button>
                          <button onClick={startRecording} className="p-2 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50">
                             <Mic size={18} />
                          </button>
                       </div>
                       <button 
                          onClick={handleSend}
                          disabled={!input.trim() || isSending}
                          className="w-[32px] h-[32px] bg-slate-100 text-slate-400 flex items-center justify-center rounded-full transition-all data-[active=true]:bg-[#0070f3] data-[active=true]:text-white mr-1 shrink-0"
                          data-active={!!input.trim() && !isSending}
                       >
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M7.4 1.899a.85.85 0 0 1 1.201 0l4.5 4.5A.85.85 0 1 1 11.9 7.6L8.85 4.552V13.5a.85.85 0 0 1-1.7 0V4.552L4.101 7.601A.85.85 0 1 1 2.9 6.399z" /></svg>
                       </button>
                    </div>
                   )}

              {/* Unlock Voice & Callback Support Modal */}
              {isIdentityModalOpen && (
                <>
                  <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] z-40 animate-in fade-in duration-200" onClick={() => setIsIdentityModalOpen(false)} />
                  <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 z-50 border-t border-slate-105 dark:border-slate-800 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] rounded-t-[24px] p-6 pb-8 animate-in slide-in-from-bottom-8 duration-300">
                    <form onSubmit={handleSaveIdentity}>
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="font-bold text-slate-800 dark:text-white text-[18px] tracking-tight">Unlock Call Support</h3>
                        <button 
                          type="button"
                          onClick={() => setIsIdentityModalOpen(false)} 
                          className="text-slate-400 hover:text-slate-650 dark:text-slate-500 dark:hover:text-slate-350 bg-slate-50 dark:bg-slate-805 hover:bg-slate-100 dark:hover:bg-slate-750 rounded-full p-1.5 transition-colors cursor-pointer"
                        >
                          <X size={18} strokeWidth={2.5} />
                        </button>
                      </div>
                      
                      <p className="text-slate-500 dark:text-slate-400 text-[13px] mb-5 leading-relaxed">
                        Add your phone number and name below. This enables our support team to verify your profile and connect with you directly via call or WhatsApp to resolve your queries instantly!
                      </p>

                      <div className="flex flex-col gap-4 mb-6">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-550 dark:text-slate-400 uppercase tracking-wider mb-1.5">Your Name</label>
                          <input
                            type="text"
                            required
                            value={tempName}
                            onChange={e => setTempName(e.target.value)}
                            placeholder="e.g., Mujahid Islam"
                            className="w-full bg-[#f9fafb] dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 text-[14px] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:focus:ring-blue-500/5 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 text-slate-850 dark:text-slate-150"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-550 dark:text-slate-400 uppercase tracking-wider mb-1.5">Phone Number (with country code)</label>
                          <input
                            type="tel"
                            required
                            value={tempPhone}
                            onChange={e => setTempPhone(e.target.value)}
                            placeholder="e.g., +8801700000000"
                            className="w-full bg-[#f9fafb] dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 text-[14px] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:focus:ring-blue-500/5 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 text-slate-850 dark:text-slate-150"
                          />
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setIsIdentityModalOpen(false)}
                          className="flex-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 font-semibold py-3.5 rounded-xl text-[14px] border border-slate-200 dark:border-slate-700 transition-all active:scale-[0.98] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isUpdatingIdentity || !tempName.trim()}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3.5 rounded-xl text-[14px] transition-all shadow-[0_4px_12px_rgba(37,99,235,0.2)] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {isUpdatingIdentity ? (
                            <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Saving...</>
                          ) : 'Unlock Call Support'}
                        </button>
                      </div>
                    </form>
                  </div>
                </>
              )}
               </div>
             </div>

             {/* Convert to Ticket Modal */}
             {showTicketLogin && (
               <>
                 <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[1px] z-40 animate-in fade-in duration-200" onClick={otpStep === 'email' ? resetOtpModal : undefined} />
                 <div className="absolute bottom-0 left-0 right-0 bg-white z-50 border-t border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-t-[24px] p-6 pb-8 animate-in slide-in-from-bottom-8 duration-300">

                   {/* STEP: email */}
                   {(otpStep === 'email' || otpStep === 'sending') && (
                     <>
                       <div className="flex justify-between items-center mb-3">
                         <h3 className="font-bold text-slate-800 text-[18px] tracking-tight">Convert to Ticket</h3>
                         <button onClick={resetOtpModal} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5 transition-colors"><X size={18} strokeWidth={2.5} /></button>
                       </div>
                       <p className="text-slate-500 text-[14px] mb-5 leading-relaxed">Enter your registered hostnin account email. We'll send a 6-digit code to verify your identity.</p>
                       <label className="block text-[12px] font-bold text-slate-600 uppercase tracking-wider mb-2">Email Address</label>
                       <input
                         type="email"
                         value={otpEmail}
                         onChange={e => { setOtpEmail(e.target.value); setOtpError(''); }}
                         onKeyDown={e => e.key === 'Enter' && handleSendOTP()}
                         placeholder="admin@yourdomain.com"
                         disabled={otpStep === 'sending'}
                         className="w-full bg-[#f9fafb] border border-slate-200 rounded-xl p-3.5 text-[14px] mb-1 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400 disabled:opacity-60"
                       />
                       {otpError && <p className="text-red-500 text-[13px] mb-3 mt-1">{otpError}</p>}
                       {!otpError && <div className="mb-4" />}
                       <button
                         onClick={handleSendOTP}
                         disabled={otpStep === 'sending'}
                         className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3.5 rounded-xl text-[14px] transition-all shadow-[0_4px_12px_rgba(37,99,235,0.2)] active:scale-[0.98] flex items-center justify-center gap-2"
                       >
                         {otpStep === 'sending' ? (
                           <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Sending Code...</>
                         ) : 'Send Login OTP'}
                       </button>
                     </>
                   )}

                   {/* STEP: otp entry */}
                   {(otpStep === 'otp' || otpStep === 'verifying') && (
                     <>
                       <div className="flex justify-between items-center mb-3">
                         <button onClick={() => { setOtpStep('email'); setOtpError(''); }} className="text-slate-400 hover:text-slate-600 p-1 -ml-1 transition-colors">
                           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                         </button>
                         <h3 className="font-bold text-slate-800 text-[18px] tracking-tight">Check your inbox</h3>
                         <button onClick={resetOtpModal} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5 transition-colors"><X size={18} strokeWidth={2.5} /></button>
                       </div>
                       <p className="text-slate-500 text-[14px] mb-5 leading-relaxed">
                         We sent a 6-digit code to <strong className="text-slate-700">{otpEmail}</strong>{otpName ? `. Hi ${otpName}!` : '.'} Enter it below.
                       </p>
                       <label className="block text-[12px] font-bold text-slate-600 uppercase tracking-wider mb-2">6-Digit Code</label>
                       <input
                         type="text"
                         value={otpCode}
                         onChange={e => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError(''); }}
                         onKeyDown={e => e.key === 'Enter' && handleVerifyOTP()}
                         placeholder="000000"
                         maxLength={6}
                         disabled={otpStep === 'verifying'}
                         className="w-full bg-[#f9fafb] border border-slate-200 rounded-xl p-3.5 text-[18px] text-center font-mono tracking-[0.5em] mb-1 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300 disabled:opacity-60"
                       />
                       {otpError && <p className="text-red-500 text-[13px] mb-3 mt-1">{otpError}</p>}
                       {!otpError && <div className="mb-4" />}
                       <button
                         onClick={handleVerifyOTP}
                         disabled={otpStep === 'verifying' || otpCode.length < 6}
                         className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3.5 rounded-xl text-[14px] transition-all shadow-[0_4px_12px_rgba(37,99,235,0.2)] active:scale-[0.98] flex items-center justify-center gap-2"
                       >
                         {otpStep === 'verifying' ? (
                           <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Verifying...</>
                         ) : 'Verify & Convert'}
                       </button>
                       <button onClick={handleSendOTP} disabled={otpStep === 'verifying'} className="w-full text-center text-[13px] text-slate-400 hover:text-blue-600 mt-3 transition-colors disabled:opacity-40">
                         Resend code
                       </button>
                     </>
                   )}

                   {/* STEP: success */}
                   {otpStep === 'success' && (
                     <div className="flex flex-col items-center text-center py-4">
                       <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mb-4">
                         <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                       </div>
                       <h3 className="font-bold text-slate-800 text-[18px] mb-2">Ticket Created!</h3>
                       {otpTicketId ? (
                         <p className="text-slate-500 text-[14px] leading-relaxed mb-6">Your conversation has been converted to ticket <strong className="text-slate-700">#{otpTicketId}</strong>. We'll reply to <strong className="text-slate-700">{otpEmail}</strong> shortly.</p>
                       ) : (
                         <p className="text-slate-500 text-[14px] leading-relaxed mb-6">Your request has been received. We'll get back to you at <strong className="text-slate-700">{otpEmail}</strong> shortly.</p>
                       )}
                       <button onClick={resetOtpModal} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3.5 rounded-xl text-[14px] transition-all active:scale-[0.98]">
                         Done
                       </button>
                     </div>
                   )}

                 </div>
               </>
             )}
              </div>
            )}
        </div>

        {/* TICKETS TAB */}
        {activeTab === 'tickets' && (
          <div className="pt-20 px-6 pb-[90px] animate-in fade-in duration-300 flex flex-col h-full bg-white relative z-10">
            
            {ticketView === 'login' && (
              <form onSubmit={handleTicketLogin} className="flex-1 flex flex-col mx-auto w-full relative z-20">
                <div className="mb-6">
                   <h2 className="text-[26px] font-bold text-slate-900 tracking-tight leading-tight">{ticketOtpSent ? 'Enter Login Code' : 'Log in with your email'}</h2>
                   {ticketOtpSent && <p className="text-slate-500 text-[14px] mt-2">Code sent to {ticketEmail}</p>}
                </div>
                
                <div className="grid">
                  {/* OTP Flow */}
                  <div className={`col-start-1 row-start-1 flex flex-col gap-4 transition-all duration-500 ease-in-out ${ticketLoginMethod === 'otp' ? 'opacity-100 translate-x-0 z-10 pointer-events-auto' : 'opacity-0 -translate-x-8 z-0 pointer-events-none'}`}>
                     {!ticketOtpSent ? (
                       <div className="relative border border-slate-300 rounded-[12px] pt-2 pb-1.5 px-4 focus-within:border-slate-800 focus-within:ring-1 focus-within:ring-slate-800 transition-all bg-white">
                         <label className="block text-[12px] font-semibold text-slate-700 mb-0.5">Email</label>
                         <input 
                           type="email" 
                           value={ticketEmail}
                           onChange={(e) => setTicketEmail(e.target.value)}
                           placeholder="admin@yourdomain.com"
                           className="w-full text-[16px] text-slate-900 bg-transparent outline-none placeholder:text-slate-400 font-medium"
                           required={ticketLoginMethod === 'otp' && !ticketOtpSent}
                         />
                       </div>
                      ) : (
                       <div className="flex flex-col gap-3">
                         <label className="block text-[12px] font-semibold text-slate-700 ml-1">6-Digit Code</label>
                         <div className="relative flex justify-between gap-2 w-full">
                           {[0, 1, 2, 3, 4, 5].map((index) => (
                             <div 
                               key={index} 
                               className={`flex-1 h-[52px] sm:h-[60px] flex items-center justify-center text-[22px] font-bold rounded-[10px] border-2 transition-all ${
                                 isTicketOtpFocused && ticketOtp.length === index 
                                   ? 'border-blue-500 ring-4 ring-blue-500/20 bg-white'
                                   : ticketOtp.length > index
                                     ? 'border-slate-800 bg-white text-slate-900'
                                     : 'border-slate-200 bg-slate-50'
                               }`}
                             >
                               {ticketOtp[index] || ''}
                             </div>
                           ))}
                           <input 
                             type="text" 
                             inputMode="numeric"
                             pattern="[0-9]*"
                             maxLength={6}
                             value={ticketOtp}
                             onChange={(e) => setTicketOtp(e.target.value.replace(/[^0-9]/g, ''))}
                             onFocus={() => setIsTicketOtpFocused(true)}
                             onBlur={() => setIsTicketOtpFocused(false)}
                             className="absolute inset-0 w-full h-full opacity-0 cursor-text z-10"
                             autoComplete="one-time-code"
                             required={ticketLoginMethod === 'otp' && ticketOtpSent}
                           />
                         </div>
                         <div className="flex justify-center mt-2">
                           <button 
                             type="button" 
                             disabled={ticketOtpTimer > 0 || ticketLoading}
                             onClick={handleResendOTP}
                             className="text-[13px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-60 transition-colors"
                           >
                             {ticketOtpTimer > 0 ? `Resend Code in ${ticketOtpTimer}s` : 'Resend Code'}
                           </button>
                         </div>
                       </div>
                      )}
                      {!ticketOtpSent && (
                        <button type="button" onClick={() => setTicketLoginMethod('password')} className="text-[14px] font-semibold text-blue-600 hover:text-blue-700 transition-colors text-left self-start ml-1 mt-1">
                          Login with Password instead?
                        </button>
                      )}
                  </div>

                  {/* Password Flow */}
                  <div className={`col-start-1 row-start-1 flex flex-col gap-4 transition-all duration-500 ease-in-out ${ticketLoginMethod === 'password' ? 'opacity-100 translate-x-0 z-10 pointer-events-auto' : 'opacity-0 translate-x-8 z-0 pointer-events-none'}`}>
                       <div className="relative border border-slate-300 rounded-[12px] pt-2 pb-1.5 px-4 focus-within:border-slate-800 focus-within:ring-1 focus-within:ring-slate-800 transition-all bg-white">
                         <label className="block text-[12px] font-semibold text-slate-700 mb-0.5">Email</label>
                         <input 
                           type="email" 
                           value={ticketEmail}
                           onChange={(e) => setTicketEmail(e.target.value)}
                           placeholder="admin@yourdomain.com"
                           className="w-full text-[16px] text-slate-900 bg-transparent outline-none placeholder:text-slate-400 font-medium"
                           required={ticketLoginMethod === 'password'}
                         />
                       </div>
                       <div className="relative border border-slate-300 rounded-[12px] pt-2 pb-1.5 px-4 focus-within:border-slate-800 focus-within:ring-1 focus-within:ring-slate-800 transition-all bg-white">
                         <label className="block text-[12px] font-semibold text-slate-700 mb-0.5">Password</label>
                         <input 
                           type="password" 
                           value={ticketPassword}
                           onChange={(e) => setTicketPassword(e.target.value)}
                           placeholder="••••••••"
                           className="w-full text-[16px] text-slate-900 bg-transparent outline-none placeholder:text-slate-400 font-medium"
                           required={ticketLoginMethod === 'password'}
                         />
                       </div>
                      <button type="button" onClick={() => setTicketLoginMethod('otp')} className="text-[14px] font-semibold text-blue-600 hover:text-blue-700 transition-colors text-left self-start ml-1 mt-1">
                        Login with Email Code instead?
                      </button>
                  </div>
                </div>
                
                {ticketError && <p className="text-red-500 text-[13px] font-medium ml-1 mt-2">{ticketError}</p>}
                
                <div className="mt-auto pt-8 pb-2">
                   <button disabled={ticketLoading} type="submit" className="w-full bg-slate-800 hover:bg-slate-900 disabled:bg-slate-700 disabled:opacity-90 disabled:active:scale-100 text-white font-semibold py-4 rounded-[14px] text-[16px] transition-all shadow-[0_4px_12px_rgba(15,23,42,0.15)] hover:shadow-[0_6px_16px_rgba(15,23,42,0.25)] active:scale-[0.98] flex items-center justify-center gap-2.5">
                      {ticketLoading ? (
                        <>
                          <Loader2 size={18} className="animate-spin text-white/80" />
                          <span>{ticketLoginMethod === 'otp' ? (ticketOtpSent ? 'Verifying...' : 'Sending...') : 'Logging in...'}</span>
                        </>
                      ) : (
                        <span>Next</span>
                      )}
                   </button>
                </div>
              </form>
            )}

            {ticketView === 'list' && (
              <div className="flex flex-col h-full absolute inset-0 bg-[#f8fafc] animate-in slide-in-from-left-4 fade-in duration-300">
                 {/* Header */}
                 <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 bg-white shadow-sm shrink-0">
                    <h2 className="text-[20px] font-bold text-slate-900 tracking-tight">Support Tickets</h2>
                    <div className="flex items-center gap-2">
                       <button onClick={() => { localStorage.removeItem('whmcs_user'); setWhmcsUser(null); setTicketView('login'); }} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors" title="Log out">
                          <LogOut size={16} />
                       </button>
                       <button onClick={() => setTicketView('new')} className="text-blue-600 hover:text-blue-700 font-semibold text-[13px] flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-full transition-colors shrink-0">
                         <Plus size={14} /> New Ticket
                       </button>
                    </div>
                 </div>
                 {/* List */}
                 <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 pb-[100px]">
                    {whmcsTickets.length === 0 ? (
                      <div className="text-center mt-10 text-slate-500 text-[14px]">No tickets found.</div>
                    ) : whmcsTickets.map(ticket => (
                      <div key={ticket.id} onClick={() => handleFetchTicketDetails(ticket.id)} className="bg-white p-4 rounded-[16px] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-slate-100 cursor-pointer hover:border-blue-200 hover:shadow-md transition-all group">
                        <div className="flex justify-between items-start mb-2">
                           <span className="text-[12px] font-semibold text-slate-400 group-hover:text-slate-500 transition-colors">#{ticket.tid}</span>
                           <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ticket.status === 'Open' ? 'bg-amber-100 text-amber-700' : ticket.status === 'Answered' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                             {ticket.status}
                           </span>
                        </div>
                        <h4 className="font-bold text-slate-800 text-[14px] leading-snug mb-1 group-hover:text-blue-600 transition-colors">{ticket.subject}</h4>
                        <p className="text-[12px] text-slate-500">Updated: {ticket.lastreply}</p>
                      </div>
                    ))}
                 </div>
              </div>
            )}

            {ticketView === 'detail' && selectedTicket && (
              <div className="flex flex-col h-full absolute inset-0 bg-[#f8fafc] z-50 animate-in slide-in-from-right-4 fade-in duration-300">
                 {/* Header */}
                 <div className="flex items-center gap-3 px-4 pt-6 pb-4 border-b border-slate-100 bg-white shadow-sm shrink-0 z-10">
                    <button onClick={() => setTicketView('list')} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-600 transition-colors">
                      <ChevronLeft size={20} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-900 text-[15px] truncate">{selectedTicket.subject}</h3>
                      <p className="text-[12px] text-slate-500">Ticket #{selectedTicket.tid}</p>
                    </div>
                 </div>
                 {/* Chat Area */}
                 <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                    {/* Initial Message */}
                    <div className="flex flex-col gap-1 items-end w-full">
                       <div className="bg-[#0070f3] text-white rounded-[18px] rounded-br-[4px] py-2.5 px-4 text-[14px] max-w-[85%] shadow-sm">
                         {(() => {
                         let text = selectedTicket.message || '';
                         const videoRegex = /Video Attached:\n((?:https?:\/\/[^\s]+\n?)+)/;
                         const match = text.match(videoRegex);
                         let videoLinks = [];
                         if (match) {
                           text = text.replace(match[0], '').trim();
                           videoLinks = match[1].split('\n').filter(Boolean);
                         }
                         return (
                           <>
                             {text && <div className="whitespace-pre-wrap break-words">{text}</div>}
                             {videoLinks.length > 0 && (
                               <div className={`flex flex-col gap-1.5 ${text ? 'mt-2 pt-2 border-t border-slate-100' : ''}`}>
                                 {videoLinks.map((link: string, lIdx: number) => (
                                   <a key={lIdx} href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 transition-colors w-max">
                                     <Video size={12} className="shrink-0 opacity-80" />
                                     <span className="text-[11.5px] truncate max-w-[150px] font-medium tracking-tight">View Video</span>
                                   </a>
                                 ))}
                               </div>
                             )}
                           </>
                         );
                       })()}
                         {selectedTicket.attachments?.attachment && (() => {
                           const list = Array.isArray(selectedTicket.attachments.attachment) ? selectedTicket.attachments.attachment : [selectedTicket.attachments.attachment];
                           return list.length > 0 ? (
                             <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-white/10">
                               {list.map((filename: string, idx: number) => (
                                 <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-white/20 border-white/10 text-white">
                                   <Paperclip size={12} className="shrink-0 opacity-80"/> 
                                   <span className="text-[11.5px] truncate max-w-[150px] font-medium tracking-tight">{filename}</span>
                                 </div>
                               ))}
                             </div>
                           ) : null;
                         })()}
                       </div>
                    </div>
                    {/* Replies */}
                    {selectedTicket.replies?.reply?.map((reply: any, idx: number) => (
                      <div key={idx} className={`flex flex-col gap-1 w-full ${reply.admin ? 'items-start' : 'items-end'}`}>
                        {reply.admin && <span className="text-[11px] font-medium text-slate-400 ml-3">{reply.requestor_name || 'Support Team'}</span>}
                        <div className={`${reply.admin ? 'bg-white border border-slate-100 text-slate-800 rounded-bl-[4px]' : 'bg-[#0070f3] text-white rounded-br-[4px]'} rounded-[18px] py-2.5 px-4 text-[14px] max-w-[85%] shadow-sm`}>
                          {(() => {
                            let text = reply.message || '';
                            const videoRegex = /Video Attached:\n((?:https?:\/\/[^\s]+\n?)+)/;
                            const match = text.match(videoRegex);
                            let videoLinks = [];
                            if (match) {
                              text = text.replace(match[0], '').trim();
                              videoLinks = match[1].split('\n').filter(Boolean);
                            }
                            return (
                              <>
                                {text && <div className="whitespace-pre-wrap break-words">{text}</div>}
                                {videoLinks.length > 0 && (
                                  <div className={`flex flex-col gap-1.5 ${text ? 'mt-2 pt-2 border-t' : ''} ${reply.admin ? 'border-slate-100' : 'border-white/10'}`}>
                                    {videoLinks.map((link: string, lIdx: number) => (
                                      <a key={lIdx} href={link} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${reply.admin ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600' : 'bg-white/20 hover:bg-white/30 border-white/10 text-white'} transition-colors`}>
                                        <Video size={12} className="shrink-0 opacity-80" />
                                        <span className="text-[11.5px] truncate max-w-[150px] font-medium tracking-tight">View Video</span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          {reply.attachments?.attachment && (() => {
                            const list = Array.isArray(reply.attachments.attachment) ? reply.attachments.attachment : [reply.attachments.attachment];
                            return list.length > 0 ? (
                              <div className={`flex flex-col gap-1.5 mt-2 pt-2 border-t ${reply.admin ? 'border-slate-100' : 'border-white/10'}`}>
                                {list.map((filename: string, attIdx: number) => (
                                  <div key={attIdx} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${reply.admin ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-white/20 border-white/10 text-white'}`}>
                                    <Paperclip size={12} className="shrink-0 opacity-80"/> 
                                    <span className="text-[11.5px] truncate max-w-[150px] font-medium tracking-tight">{filename}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null;
                          })()}
                          {reply._optimisticAttachments && reply._optimisticAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-white/10">
                              {reply._optimisticAttachments.map((img: any, imgIdx: number) => (
                                <img key={imgIdx} src={`data:image/jpeg;base64,${img.data}`} className="w-16 h-16 object-cover rounded-lg border border-white/20 shadow-sm" />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={ticketEndRef} className="h-4 shrink-0" />
                 </div>
                 {/* Input Bar */}
                 <div className="p-4 pt-2 bg-gradient-to-t from-[#f8fafc] to-[#f8fafc] shrink-0 z-20">
                    <div className="bg-white rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-200 flex flex-col relative overflow-hidden transition-all">
                       {/* Staged Attachments */}
                       {(ticketImages.length > 0 || ticketVideoLinks.length > 0) && (
                         <div className="px-4 pt-3 pb-1 flex flex-col gap-2">
                           {/* Images */}
                           {ticketImages.length > 0 && (
                             <div className="flex flex-wrap gap-2">
                               {ticketImages.map((img, idx) => (
                                 <div key={idx} className="relative group w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shrink-0">
                                   <img src={`data:image/jpeg;base64,${img.data}`} className="w-full h-full object-cover" />
                                   <button onClick={() => removeTicketImage(idx)} className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5 hover:bg-black/70 transition-colors"><X size={10} strokeWidth={3}/></button>
                                 </div>
                               ))}
                             </div>
                           )}
                           {/* Video Links */}
                           {ticketVideoLinks.map((link, idx) => (
                             <div key={idx} className="flex items-center gap-2 group bg-blue-50/50 rounded-lg p-1.5 border border-blue-100/50 transition-colors">
                               <div className="w-7 h-7 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                  <Video size={14} />
                               </div>
                               <input type="url" value={link} onChange={(e) => updateTicketVideoLink(idx, e.target.value)} placeholder="Paste Drive/Loom link here" className="flex-1 bg-transparent border-none py-1 px-1 text-[13px] outline-none text-blue-900 placeholder:text-blue-300 font-medium" />
                               <button onClick={() => removeTicketVideoLink(idx)} className="w-6 h-6 flex items-center justify-center text-blue-400 hover:text-red-500 rounded-full hover:bg-blue-100 transition-colors shrink-0"><X size={14}/></button>
                             </div>
                           ))}
                         </div>
                       )}

                       <textarea 
                         value={ticketReplyInput}
                         onChange={(e) => setTicketReplyInput(e.target.value)}
                         placeholder="Reply to ticket..."
                         className="w-full bg-transparent border-none outline-none resize-none min-h-[52px] max-h-[120px] py-3.5 px-4 text-[14px] text-slate-800 placeholder:text-slate-400"
                         rows={1}
                       />
                       
                       <div className="flex justify-between items-center px-2 pb-2 pt-1 border-t border-slate-50">
                          <div className="flex items-center gap-0.5 text-slate-400">
                             <input type="file" ref={ticketFileInputRef} className="hidden" accept="image/*" multiple onChange={handleTicketImageUpload} />
                             <button onClick={() => ticketFileInputRef.current?.click()} className="p-2 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50" title="Attach Image">
                               <Paperclip size={18} />
                             </button>
                             <button onClick={addTicketVideoLink} className="p-2 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50" title="Attach Video Link">
                               <Video size={18} />
                             </button>
                          </div>
                          <button 
                             onClick={handleTicketReply}
                             disabled={ticketLoading || (!ticketReplyInput.trim() && ticketImages.length === 0 && !ticketVideoLinks.some(l => l.trim().length > 0))}
                             className="w-[32px] h-[32px] bg-slate-100 text-slate-400 flex items-center justify-center rounded-full transition-all data-[active=true]:bg-[#0070f3] data-[active=true]:text-white mr-1 shrink-0"
                             data-active={(!ticketLoading && (!!ticketReplyInput.trim() || ticketImages.length > 0 || ticketVideoLinks.some(l => l.trim().length > 0)))}
                          >
                             {ticketLoading ? <Loader2 size={16} className="animate-spin text-slate-400" /> : <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M7.4 1.899a.85.85 0 0 1 1.201 0l4.5 4.5A.85.85 0 1 1 11.9 7.6L8.85 4.552V13.5a.85.85 0 0 1-1.7 0V4.552L4.101 7.601A.85.85 0 1 1 2.9 6.399z" /></svg>}
                          </button>
                       </div>
                    </div>
                 </div>
              </div>
            )}

            {ticketView === 'new' && (
              <div className="flex flex-col h-full absolute inset-0 bg-white z-50 animate-in slide-in-from-right-4 fade-in duration-300">
                 {/* Header */}
                 <div className="flex items-center gap-3 px-4 pt-6 pb-4 border-b border-slate-100 bg-white shrink-0 shadow-sm z-10">
                    <button onClick={() => setTicketView('list')} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-600 transition-colors">
                      <ChevronLeft size={20} />
                    </button>
                    <h2 className="font-bold text-slate-900 text-[17px]">Create New Ticket</h2>
                 </div>
                 {/* Form */}
                 <form onSubmit={handleCreateTicket} className="flex-1 overflow-y-auto p-6 pt-5 flex flex-col gap-4 pb-[100px] bg-[#f8fafc]">
                    
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[13px] font-semibold text-slate-700 ml-1">Department</label>
                      <div className="relative group">
                        <select 
                          value={newTicketDept} 
                          onChange={(e) => setNewTicketDept(parseInt(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded-[12px] p-3.5 text-[14px] text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all appearance-none font-medium shadow-sm cursor-pointer group-hover:border-slate-300"
                        >
                          {whmcsDepartments.length > 0 ? (
                            whmcsDepartments.map(dept => (
                              <option key={dept.id} value={dept.id}>{dept.name}</option>
                            ))
                          ) : (
                            <option value={newTicketDept}>Loading departments...</option>
                          )}
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-4 text-slate-400 pointer-events-none group-hover:text-slate-600 transition-colors" />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[13px] font-semibold text-slate-700 ml-1">Subject</label>
                      <input 
                        type="text" 
                        required
                        value={newTicketSubject}
                        onChange={(e) => setNewTicketSubject(e.target.value)}
                        placeholder="Brief summary of the issue..."
                        className="w-full bg-white border border-slate-200 rounded-[12px] p-3.5 text-[14px] text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all font-medium placeholder:font-normal shadow-sm"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[13px] font-semibold text-slate-700 ml-1">Message</label>
                      <textarea 
                        required
                        value={newTicketMessage}
                        onChange={(e) => setNewTicketMessage(e.target.value)}
                        placeholder="Describe your issue in detail..."
                        className="w-full bg-white border border-slate-200 rounded-[12px] p-3.5 text-[14px] text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all min-h-[140px] resize-none font-medium placeholder:font-normal shadow-sm"
                      />
                    </div>

                    <div className="flex flex-col gap-3 p-3.5 bg-white border border-slate-200 rounded-[12px] shadow-sm">
                      <div className="flex items-center justify-between">
                         <span className="text-[13px] font-semibold text-slate-700">Attachments <span className="font-normal text-slate-400 text-[11px] ml-1">(Optional)</span></span>
                         <div className="flex items-center gap-1 text-blue-600">
                           <input type="file" ref={ticketFileInputRef} className="hidden" accept="image/*" multiple onChange={handleTicketImageUpload} />
                           <button type="button" onClick={() => ticketFileInputRef.current?.click()} className="text-[12px] font-semibold hover:bg-blue-50 px-2 py-1 rounded-md transition-colors flex items-center gap-1"><Paperclip size={14}/> Image</button>
                           <button type="button" onClick={addTicketVideoLink} className="text-[12px] font-semibold hover:bg-blue-50 px-2 py-1 rounded-md transition-colors flex items-center gap-1"><Video size={14}/> Video</button>
                         </div>
                      </div>
                      
                      {(ticketImages.length > 0 || ticketVideoLinks.length > 0) && (
                         <div className="flex flex-col gap-3 pt-2 border-t border-slate-100">
                           {ticketImages.length > 0 && (
                             <div className="flex flex-wrap gap-2">
                               {ticketImages.map((img, idx) => (
                                 <div key={idx} className="relative group w-14 h-14 rounded-lg border border-slate-200 overflow-hidden shrink-0">
                                   <img src={`data:image/jpeg;base64,${img.data}`} className="w-full h-full object-cover" />
                                   <button type="button" onClick={() => removeTicketImage(idx)} className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5 hover:bg-black/70 transition-colors"><X size={12} strokeWidth={3}/></button>
                                 </div>
                               ))}
                             </div>
                           )}
                           {ticketVideoLinks.length > 0 && (
                             <div className="flex flex-col gap-2">
                               <p className="text-[11px] text-slate-500 font-medium">Links added here will be attached to your ticket message.</p>
                               {ticketVideoLinks.map((link, idx) => (
                                 <div key={idx} className="flex items-center gap-2 group bg-blue-50/50 rounded-lg p-1.5 border border-blue-100/50 transition-colors">
                                   <div className="w-7 h-7 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                      <Video size={14} />
                                   </div>
                                   <input type="url" required value={link} onChange={(e) => updateTicketVideoLink(idx, e.target.value)} placeholder="Paste Drive/Loom link here" className="flex-1 bg-transparent border-none py-1 px-1 text-[13px] outline-none text-blue-900 placeholder:text-blue-300 font-medium" />
                                   <button type="button" onClick={() => removeTicketVideoLink(idx)} className="w-6 h-6 flex items-center justify-center text-blue-400 hover:text-red-500 rounded-full hover:bg-blue-100 transition-colors shrink-0"><X size={14}/></button>
                                 </div>
                               ))}
                             </div>
                           )}
                         </div>
                      )}
                    </div>

                    <div className="mt-2">
                       <button disabled={ticketLoading} type="submit" className="w-full bg-[#0070f3] hover:bg-blue-600 disabled:bg-slate-300 disabled:opacity-70 disabled:active:scale-100 text-white font-semibold py-3.5 rounded-[12px] text-[15px] transition-all flex items-center justify-center shadow-sm hover:shadow-md active:scale-95">
                          {ticketLoading ? 'Opening Ticket...' : 'Submit Ticket'}
                       </button>
                    </div>
                 </form>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Bottom Navigation */}
      {activeTab !== 'chat' && activeTab !== 'messages' && !isFullScreenTicketView && (
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex justify-between px-2 py-1 z-20">
          <button onClick={() => setActiveTab('home')} className={`flex-1 flex flex-col items-center justify-center py-2 gap-[5px] ${activeTab === 'home' ? 'text-[#7384a2]' : 'text-[#6c6f74] hover:text-[#7384a2]'} transition-colors`}>
             <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeWidth="1.7" d="M2.85 9.35c0-.423.218-.85.635-1.143l7.496-5.172h.001a1.84 1.84 0 0 1 2.036 0l7.495 5.17.002.002c.417.293.635.72.635 1.142V19.7c0 .73-.676 1.45-1.65 1.45h-15c-.974 0-1.65-.72-1.65-1.45z"></path><path stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" d="M17.25 15A7.86 7.86 0 0 1 12 17.002 7.86 7.86 0 0 1 6.75 15"></path></svg>
             </div>
             <span className={`text-[13px] ${activeTab === 'home' ? 'font-bold' : 'font-medium'} tracking-tight`}>Home</span>
          </button>
          
          <button onClick={() => setActiveTab('messages')} className={`flex-1 flex flex-col items-center justify-center py-2 gap-[5px] ${(activeTab as any) === 'messages' ? 'text-[#7384a2]' : 'text-[#6c6f74] hover:text-[#7384a2]'} transition-colors`}>
             <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true"><mask id="msg-mask" fill="#fff"><path fillRule="evenodd" d="M19 2a3 3 0 0 1 3 3v15.806c0 1.335-1.613 2.005-2.559 1.062L15.56 18H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3z" clipRule="evenodd"></path></mask><path fill="currentColor" d="m19.441 21.868 1.2-1.204zM15.56 18v-1.7h.702l.498.496zM20.3 5A1.3 1.3 0 0 0 19 3.7V.3A4.7 4.7 0 0 1 23.7 5zm0 8.956V5h3.4v8.956zm0 2.544v-2.544h3.4V16.5zm0 4.306V16.5h3.4v4.306zm.341-.142a.23.23 0 0 0-.218-.043.23.23 0 0 0-.123.185h3.4c0 2.848-3.441 4.277-5.459 2.267zm-3.882-3.868 3.882 3.868-2.4 2.409-3.882-3.869zM5 16.3h10.559v3.4H5zM3.7 15A1.3 1.3 0 0 0 5 16.3v3.4A4.7 4.7 0 0 1 .3 15zm0-10v10H.3V5zM5 3.7A1.3 1.3 0 0 0 3.7 5H.3A4.7 4.7 0 0 1 5 .3zm14 0H5V.3h14z" mask="url(#msg-mask)"></path><path fill="currentColor" fillRule="evenodd" d="M17 7a.85.85 0 0 1 0 1.7H7A.85.85 0 1 1 7 7zm-5 4a.85.85 0 0 1 0 1.7H7A.85.85 0 0 1 7 11z" clipRule="evenodd"></path></svg>
             </div>
             <span className={`text-[13px] ${(activeTab as any) === 'messages' ? 'font-bold' : 'font-medium'} tracking-tight`}>Messages</span>
          </button>
          
          <button onClick={() => setActiveTab('tickets')} className={`flex-1 flex flex-col items-center justify-center py-2 gap-[5px] ${activeTab === 'tickets' ? 'text-[#7384a2]' : 'text-[#6c6f74] hover:text-[#7384a2]'} transition-colors`}>
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.65" stroke="currentColor" strokeWidth="1.7"></circle><path stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" d="M9.664 8.576a2.41 2.41 0 1 1 4.102 2.39l-1.075 1.104c-.326.322-.765.76-.765 1.544v.364"></path><circle cx="11.927" cy="16.884" r="0.884" fill="currentColor"></circle></svg>
             <span className={`text-[13px] ${activeTab === 'tickets' ? 'font-bold' : 'font-medium'} tracking-tight`}>Help</span>
          </button>
        </div>
      )}

      {/* Co-Browsing Screen Share Request Alert */}
      {showCoBrowseRequest && (
        <>
          {/* Glassmorphic backdrop overlay */}
          <div className="absolute inset-0 z-[99] bg-black/20 backdrop-blur-[2px] animate-in fade-in duration-200" />
          <div className="absolute top-0 left-0 right-0 bottom-0 z-[100] flex items-center justify-center p-5 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-700/50 shadow-[0_20px_60px_rgb(0,0,0,0.15)] p-5 w-full max-w-[300px] text-center flex flex-col items-center relative overflow-hidden">
              {/* Animated gradient top bar */}
              <div className="absolute top-0 left-0 right-0 h-1">
                <div className="h-full bg-gradient-to-r from-[#0070f3] via-blue-400 to-[#0070f3] bg-[length:200%_100%]" style={{ animation: 'shimmer 2s linear infinite' }} />
              </div>

              {/* Animated icon with concentric rings */}
              <div className="relative w-16 h-16 flex items-center justify-center mt-2 mb-3">
                <div className="absolute inset-0 rounded-full border-2 border-[#0070f3]/15" style={{ animation: 'ping 2.5s cubic-bezier(0,0,0.2,1) infinite' }} />
                <div className="absolute inset-2 rounded-full border-2 border-[#0070f3]/25" style={{ animation: 'ping 2.5s cubic-bezier(0,0,0.2,1) infinite', animationDelay: '0.4s' }} />
                <div className="w-10 h-10 bg-gradient-to-br from-[#0070f3] to-[#0050c8] rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
                  <Eye size={20} strokeWidth={2} className="text-white" />
                </div>
              </div>

              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white mb-1">Screen Share Request</h3>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-1.5 leading-relaxed px-2">
                Our agent would like to view your screen to help guide you.
              </p>

              {/* Trust badge */}
              <div className="flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-800/40">
                <Shield size={11} className="text-emerald-500" />
                <span className="text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">Secure, encrypted session</span>
              </div>

              <div className="flex gap-2.5 w-full">
                <button 
                  onClick={handleDeclineCoBrowse}
                  className="flex-1 py-3 text-[13.5px] flex items-center justify-center font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 rounded-xl transition-all active:scale-[0.97] cursor-pointer"
                >
                  Decline
                </button>
                <button 
                  onClick={handleAcceptCoBrowse}
                  className="flex-1 py-3 text-[13.5px] flex items-center justify-center gap-1.5 font-semibold text-white bg-[#0070f3] hover:bg-blue-600 rounded-xl shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/30 transition-all active:scale-[0.97] cursor-pointer"
                >
                  <Video size={15} strokeWidth={2.2} />
                  Share
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Co-Browsing Active Float Indicator */}
      {isCoBrowsingActive && (
        <div 
          className="absolute left-3 right-3 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border border-slate-200/80 dark:border-slate-700/60 rounded-2xl px-4 py-3 flex items-center justify-between shadow-[0_8px_30px_rgb(0,0,0,0.10)] animate-in slide-in-from-bottom-2 duration-300 cursor-move touch-none select-none"
          style={{ bottom: `${Math.max(10, 80 - bannerPosition.y)}px` }}
          onPointerDown={handleBannerPointerDown}
          onPointerMove={handleBannerPointerMove}
          onPointerUp={handleBannerPointerUp}
          onPointerCancel={handleBannerPointerUp}
        >
          <div className="flex items-center gap-2.5 pointer-events-none">
            <div className="relative flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <div className="absolute w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div className="flex flex-col">
              <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-200">Screen sharing active</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1">
                <Shield size={8} className="text-emerald-500" /> Secure session
              </span>
            </div>
          </div>
          <button 
            onClick={handleStopCoBrowse}
            className="bg-red-500 hover:bg-red-600 active:scale-[0.95] text-white font-semibold text-[11px] px-3.5 py-2 rounded-xl shadow-sm transition-all uppercase tracking-wide shrink-0 cursor-pointer"
          >
            Stop
          </button>
        </div>
      )}

      {/* Incoming Call from Agent - Accept/Decline */}
      {callStatus === 'ringing' && (
        <>
          {/* Backdrop overlay */}
          <div className="absolute inset-0 z-[59] bg-black/15 backdrop-blur-[1px] animate-in fade-in duration-200" />
          <div className="absolute top-0 left-0 right-0 bottom-0 z-[60] flex items-center justify-center p-5 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-700/50 shadow-[0_20px_60px_rgb(0,0,0,0.15)] p-5 w-full max-w-[300px] text-center flex flex-col items-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-t-2xl" />

              {/* Animated phone rings */}
              <div className="relative w-16 h-16 flex items-center justify-center mt-2 mb-3">
                <div className="absolute inset-0 rounded-full border-2 border-emerald-400/15" style={{ animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite' }} />
                <div className="absolute inset-2 rounded-full border-2 border-emerald-400/25" style={{ animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite', animationDelay: '0.3s' }} />
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <Phone size={19} strokeWidth={2.2} className="text-white" />
                </div>
              </div>

              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white mb-0.5">Incoming Voice Call</h3>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-4">Support agent wants to talk with you</p>
              <div className="flex gap-2.5 w-full">
                <button onClick={handleDeclineAgentCall} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[13px] rounded-xl transition-all active:scale-[0.97] cursor-pointer">
                  Decline
                </button>
                <button onClick={handleAnswerAgentCall} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-[13px] rounded-xl transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/25 cursor-pointer">
                  <Phone size={14} strokeWidth={2.5} />
                  Accept
                </button>
              </div>
            </div>
          </div>
        </>
      )}


      {/* Premium Branded Toast Error Notification */}
      {toastError && (
        <div className="absolute top-[82px] left-4 right-4 z-[9999] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between text-slate-800 dark:text-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.12)] animate-in slide-in-from-top-6 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-500 flex items-center justify-center shrink-0">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-bold text-slate-900 dark:text-white">Action Required</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-snug pr-2">{toastError}</span>
            </div>
          </div>
          <button 
            onClick={() => setToastError(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* Visual Microphone Permission Guide Modal */}
      {showMicPermissionGuide && (
        <div className="absolute inset-0 z-[10000] bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-[340px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] animate-in zoom-in-95 duration-200 text-slate-850 dark:text-slate-100 flex flex-col items-center">
            
            {/* Pulsing mic warning icon */}
            <div className="relative w-14 h-14 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center text-white text-[10px] font-bold">!</div>
            </div>

            <h3 className="text-[15px] font-bold text-slate-900 dark:text-white text-center mb-1 leading-snug">
              Allow Microphone Access
            </h3>
            
            <p className="text-[11.5px] text-slate-500 dark:text-slate-400 text-center leading-relaxed mb-4 px-2">
              TalkFuze needs microphone access to record voice messages and make live audio calls.
            </p>

            {/* Steps layout */}
            <div className="w-full flex flex-col gap-3.5 mb-5 text-left bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/40">
              <div className="flex gap-3 items-start">
                <span className="w-5 h-5 rounded-full bg-[#0070f3] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                <div className="flex-1">
                  <p className="text-[12.5px] font-bold text-slate-800 dark:text-slate-200 leading-snug">Click lock icon</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal font-normal">Look at the browser address bar above and click the <b>🔒 (Lock)</b> icon next to the URL.</p>
                </div>
              </div>

              <div className="flex gap-3 items-start border-t border-slate-100 dark:border-slate-800/60 pt-3">
                <span className="w-5 h-5 rounded-full bg-[#0070f3] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                <div className="flex-1">
                  <p className="text-[12.5px] font-bold text-slate-800 dark:text-slate-200 leading-snug">Toggle Mic to 'Allow'</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal font-normal">Switch the <b>Microphone</b> slider to enabled or choose <b>Allow</b>.</p>
                </div>
              </div>

              <div className="flex gap-3 items-start border-t border-slate-100 dark:border-slate-800/60 pt-3">
                <span className="w-5 h-5 rounded-full bg-[#0070f3] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                <div className="flex-1">
                  <p className="text-[12.5px] font-bold text-slate-800 dark:text-slate-200 leading-snug">Reload the page</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal font-normal">Refresh your browser page to apply the microphone permissions.</p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2.5 w-full">
              <button 
                onClick={() => setShowMicPermissionGuide(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[13px] rounded-xl transition-all active:scale-[0.98] cursor-pointer"
              >
                Close
              </button>
              <button 
                onClick={() => window.location.reload()}
                className="flex-1 py-2.5 bg-[#0070f3] hover:bg-[#0060d3] text-white font-bold text-[13px] rounded-xl transition-all active:scale-[0.98] shadow-md shadow-[#0070f3]/20 flex items-center justify-center gap-1 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 16h5v5"></path></svg>
                Reload
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
