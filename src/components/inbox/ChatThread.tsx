"use client"

import { Clock, Zap, Check, CheckCheck, MessageSquare, Lock, Paperclip, Loader2, Mic, Square, X, Bot, MoreVertical, LogOut, LogIn, Phone, PhoneOutgoing, PhoneMissed, Archive, Pin, BellOff, Mail, Trash2, Pencil, Ban, Image as ImageIcon, Video, CornerUpLeft, Database, ArrowLeft, Plus, Copy, Type, Play, PanelRightClose, PanelRightOpen } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { createPeerConnection, VOICE_CONSTRAINTS, createRemoteAudioElement, destroyRemoteAudioElement, requestWakeLock, releaseWakeLock, unlockAudioContext, bindRemoteAudioStream } from "@/lib/webrtc"
import { createPortal } from "react-dom"
import { getMessages, replyToConversation, getQuickReplies, joinConversation, getParticipants, getQuickRepliesFromTable, toggleConversationFlag, updateConversationStatus, leaveConversation, deleteConversation, uploadAgentMedia, editMessage, recallMessage, createQuickReply } from "@/actions/dashboard"
import { logBrowserCall } from "@/actions/calls"
import { markMessagesAsRead } from "@/actions/chat"
import { updateContactName, updateContactEmail, updateContactPhone } from "@/actions/contacts"
import { convertChatToTicket, fetchWhmcsClient } from "@/actions/whmcs"
import { supabase } from "@/lib/supabase"
import { getErrorMessage } from "@/lib/utils"
import { useMessageStore, useInboxStore, useGlobalAudioStore } from "@/lib/store"
import type { AppMessage, ConversationParticipant, ConversationWithDetails, QuickReplyItem, Relation, UserProfile } from "@/lib/types"
// removed generateAiDraft import
import { logAiDraft, completeAiDraftLog } from "@/actions/ai-learning"
import { playIncomingRingtoneLoop, stopIncomingRingtoneLoop } from "@/lib/sounds"

interface StagedAttachment {
  file: File;
  id: string;
  url?: string;
  type: string;
  name: string;
  progress: number;
  status: 'uploading' | 'uploaded' | 'failed';
  previewUrl: string | null;
}

const AVATAR_COLORS = [
  'bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500'
]

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const SafeImage = ({ 
  src, 
  alt = "Attachment", 
  onClick, 
  className = "" 
}: { 
  src: string; 
  alt?: string; 
  onClick?: () => void; 
  className?: string; 
}) => {
  const [loaded, setLoaded] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [errorState, setErrorState] = useState(false);

  useEffect(() => {
    setCurrentSrc(src);
    setLoaded(false);
    setRetryAttempt(0);
    setErrorState(false);
  }, [src]);

  const handleLoad = () => {
    setLoaded(true);
    setErrorState(false);
  };

  const handleError = () => {
    if (retryAttempt < 6) {
      setErrorState(true);
      const nextAttempt = retryAttempt + 1;
      setRetryAttempt(nextAttempt);
      
      const delay = 800 * nextAttempt;
      setTimeout(() => {
        const separator = src.includes('?') ? '&' : '?';
        setCurrentSrc(`${src}${separator}retry=${nextAttempt}&t=${Date.now()}`);
      }, delay);
    } else {
      setErrorState(true);
    }
  };

  return (
    <div className="relative w-[240px] max-w-full overflow-hidden bg-slate-50 dark:bg-slate-800/40 flex items-center justify-center min-h-[140px] max-h-[320px] rounded-xl border border-slate-100 dark:border-slate-800/50">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 dark:bg-slate-850/60 animate-pulse z-10">
          <div className="flex flex-col items-center gap-1.5">
            <Loader2 size={16} className="animate-spin text-blue-500/60" />
            <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-bold tracking-wider uppercase">Loading image</span>
          </div>
        </div>
      )}

      <img
        src={currentSrc}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        onClick={onClick}
        className={`${className} transition-all duration-300 ${
          loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        }`}
        style={{
          display: loaded ? 'block' : 'none'
        }}
      />

      {errorState && !loaded && retryAttempt >= 6 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-slate-50/90 dark:bg-slate-850 z-20">
          <ImageIcon size={18} className="text-slate-400 mb-1" />
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Failed to load</span>
          <button 
            type="button"
            onClick={() => {
              setLoaded(false);
              setRetryAttempt(0);
              setErrorState(false);
              const separator = src.includes('?') ? '&' : '?';
              setCurrentSrc(`${src}${separator}refresh=${Date.now()}`);
            }}
            className="mt-1.5 px-2 py-0.5 text-[9.5px] font-bold text-[#0070f3] hover:text-blue-650 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md transition active:scale-95 shadow-sm cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

const CustomAudioPlayer = ({ url, type, messageId, transcript, fullWidth = false }: { url: string, type: 'agent' | 'customer' | 'internal' | 'system', messageId?: string, transcript?: string, fullWidth?: boolean }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { currentSrc, isPlaying: globalIsPlaying, currentTime: globalCurrentTime, play, seek } = useGlobalAudioStore();
  const isPlaying = currentSrc === url && globalIsPlaying;

  const [duration, setDuration] = useState(0);
  const [localCurrentTime, setLocalCurrentTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    if (messageId && !transcript && !isTranscribing) {
      setIsTranscribing(true);
      fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId })
      })
      .catch(e => {
        console.error("Transcription trigger failed:", e);
      })
      .finally(() => {
        setIsTranscribing(false);
      });
    }
  }, [messageId, transcript]);

  // Sync with global time if this is the active track
  useEffect(() => {
    if (currentSrc === url && !isDragging) {
      setLocalCurrentTime(globalCurrentTime);
      if (duration > 0) setProgress((globalCurrentTime / duration) * 100);
    }
  }, [globalCurrentTime, currentSrc, url, isDragging, duration]);

  const togglePlay = () => {
    play(url);
    if (currentSrc !== url && localCurrentTime > 0) {
      setTimeout(() => seek(localCurrentTime), 50);
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
    if (!duration) return;
    const rect = currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const newTime = percentage * duration;

    setLocalCurrentTime(newTime);
    setProgress(percentage * 100);

    if (currentSrc === url) {
      seek(newTime);
    } else if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
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

  // Determine colors and layout configurations based on bubble type
  const isAgent = type === 'agent';
  const isInternal = type === 'internal';
  const isCustomer = type === 'customer';
  const isSystem = type === 'system';

  // Standard premium minimalist audio card design (default for Agent/Customer)
  let containerBg = 'bg-slate-50/90 dark:bg-[#202c33]/90 border border-slate-200/60 dark:border-[#2a3942]/60 text-slate-800 dark:text-slate-100 rounded-2xl p-3.5 shadow-md shadow-slate-100/50 dark:shadow-none';
  let buttonStyle = 'bg-[#0070f3] text-white hover:bg-blue-600';
  let timeStyle = 'text-slate-500 dark:text-[#8696a0] font-semibold';
  let activeWaveColor = '#0070f3';
  let inactiveWaveColor = 'rgba(0,112,243,0.18)';
  let playheadColor = '#0070f3';

  if (isCustomer) {
    containerBg = 'bg-slate-50/90 dark:bg-[#202c33]/90 border border-slate-200/60 dark:border-[#2a3942]/60 text-slate-800 dark:text-slate-100 rounded-2xl p-3.5 shadow-md shadow-slate-100/50 dark:shadow-none';
  } else if (isInternal) {
    containerBg = 'bg-amber-50/90 dark:bg-amber-950/25 border border-amber-200/60 dark:border-amber-900/40 rounded-2xl p-3.5 shadow-md shadow-amber-500/5 backdrop-blur-sm';
    buttonStyle = 'bg-amber-500 hover:bg-amber-600 text-amber-950';
    timeStyle = 'text-amber-700/80 dark:text-amber-400/80 font-semibold';
    activeWaveColor = '#d97706'; // Amber 600
    inactiveWaveColor = 'rgba(217,119,6,0.2)';
    playheadColor = '#d97706';
  } else if (isSystem) {
    containerBg = 'bg-white dark:bg-slate-950 border border-slate-250 dark:border-slate-850 text-slate-800 dark:text-slate-100 rounded-2xl p-3.5 shadow-md shadow-slate-100/50 dark:shadow-none';
    buttonStyle = 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800';
    timeStyle = 'text-slate-400 dark:text-slate-500 font-semibold';
    activeWaveColor = '#475569'; // slate-600
    inactiveWaveColor = 'rgba(71,85,105,0.18)';
    playheadColor = '#475569';
  }

  // Wave bar heights
  const baseWaveHeights = [8, 14, 10, 18, 12, 22, 16, 24, 18, 26, 20, 24, 16, 20, 12, 16, 10, 14, 8, 12, 6, 10];
  const waveHeights = fullWidth ? [...baseWaveHeights, ...baseWaveHeights.reverse(), ...baseWaveHeights] : baseWaveHeights;

  return (
    <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : ''}`}>
      <div className={`flex items-center gap-3 transition-all duration-300 ${containerBg} ${fullWidth ? 'w-full' : 'min-w-[230px] max-w-[280px]'}`}>
        <audio 
          ref={audioRef} 
          src={url} 
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          className="hidden" 
        />
        
        <button 
          onClick={togglePlay} 
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm ${buttonStyle}`}
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
              className={`flex items-end h-7 flex-1 cursor-pointer select-none group/wave relative py-1 ${fullWidth ? 'justify-between' : 'gap-[2.5px]'}`}
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
            <span>{formatTime(localCurrentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
      
      {transcript && (
        <div className="text-[12px] text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50 px-3 py-2 rounded-xl rounded-tl-sm w-fit max-w-[280px]">
           <span className="leading-relaxed">{transcript}</span>
        </div>
      )}
      {!transcript && isTranscribing && (
        <div className="text-[11px] text-slate-400 dark:text-slate-500 italic px-2 animate-pulse">
           Transcribing audio...
        </div>
      )}
    </div>
  );
};

function formatWhatsAppMarkdown(text: string) {
  if (!text) return text;
  const regex = /(\*[^*]+\*|_[^_]+_)/g;
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return <strong key={i} className="font-bold">{part.slice(1, -1)}</strong>;
    }
    if (part.startsWith('_') && part.endsWith('_')) {
      return <em key={i} className="italic">{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function renderTextWithLinks(text: string, isAgent: boolean, teamMembers: UserProfile[] = [], metadataMentions?: Record<string, string>) {
  if (!text) return text;
  
  if (text === '[Audio Voice Message]') {
    return <span className="flex items-center gap-1"><Mic size={14} className="text-blue-500 shrink-0" /> Voice message</span>;
  }
  if (text === '[Image]') {
    return <span className="flex items-center gap-1"><ImageIcon size={14} className="text-blue-500 shrink-0" /> Photo</span>;
  }
  if (text === '[Video]') {
    return <span className="flex items-center gap-1"><Video size={14} className="text-blue-500 shrink-0" /> Video</span>;
  }
  if (text === '[Attachment]') {
    return <span className="flex items-center gap-1"><Paperclip size={14} className="text-blue-500 shrink-0" /> Attachment</span>;
  }

  const urlRegex = /((?:https?:\/\/|www\.)[^\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;
  const parts = text.split(urlRegex);
  const mentionRegex = /(@\d+)|(@[a-zA-Z0-9_-]+)/g;
  
  return parts.map((part, i) => {
    const isUrl = urlRegex.test(part);
    urlRegex.lastIndex = 0; // reset after test

    if (isUrl) {
      let cleanPart = part;
      let trailing = "";
      while (cleanPart.length > 0 && ['.', ',', '!', '?', ';', ')', '*'].includes(cleanPart.slice(-1))) {
        trailing = cleanPart.slice(-1) + trailing;
        cleanPart = cleanPart.slice(0, -1);
      }
      
      let href = cleanPart;
      const isEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanPart);
      if (isEmail) {
        href = `mailto:${cleanPart}`;
      } else {
        href = cleanPart.toLowerCase().startsWith('http') ? cleanPart : `https://${cleanPart}`;
      }

      return (
        <span key={i}>
          <a 
            href={href} 
            target="_blank" 
            rel="noopener noreferrer" 
            className={isAgent ? "underline underline-offset-2 hover:opacity-80 transition-opacity" : "text-blue-600 dark:text-blue-400 hover:underline underline-offset-2 transition-all"}
            onClick={(e) => e.stopPropagation()}
          >
            {cleanPart}
          </a>
          {trailing}
        </span>
      );
    }
    
    // Check for mentions in non-URL parts
    const mentionParts = part.split(mentionRegex).filter(Boolean); // filter out undefined from capture groups
    if (mentionParts.length === 1) return formatWhatsAppMarkdown(part);
    
    return mentionParts.map((mPart, j) => {
      if (mPart.match(mentionRegex)) {
        const valueStr = mPart.substring(1); // remove @
        let displayName = mPart;
        
        // Try to find member by phone matching last 10 digits
        const cleanMention = valueStr.replace(/\D/g, '');
        let isTeamMember = false;
        
        if (cleanMention.length >= 10 && teamMembers && teamMembers.length > 0) {
          const mentionLast10 = cleanMention.slice(-10);
          const member = teamMembers.find(m => {
            if (!(m as any).phone) return false;
            const cleanPhone = (m as any).phone.replace(/\D/g, '');
            return cleanPhone.length >= 10 && cleanPhone.slice(-10) === mentionLast10;
          });
          if (member && member.name) {
            displayName = `@${member.name}`;
            isTeamMember = true;
          }
        } else if (teamMembers && teamMembers.length > 0) {
          // Check if it matches a team member's name directly (for internal mentions)
          const memberByName = teamMembers.find(m => m.name.replace(/\s+/g, '').toLowerCase() === valueStr.toLowerCase());
          if (memberByName) {
             displayName = `@${memberByName.name}`;
             isTeamMember = true;
          }
        }
        
        // If not a team member, check metadata from the worker or format nicely
        if (!isTeamMember) {
           if (metadataMentions && metadataMentions[cleanMention]) {
             displayName = `@${metadataMentions[cleanMention]}`;
           } else if (cleanMention.length >= 10) {
             displayName = `@Member (+${cleanMention.slice(0, Math.max(1, cleanMention.length - 8))}...${cleanMention.slice(-4)})`;
           } else {
             displayName = mPart; // Fallback to raw text if it wasn't a valid phone mention or name mention
             return formatWhatsAppMarkdown(mPart); // Don't highlight invalid mentions
           }
        }
        
        return (
          <span 
            key={`${i}-${j}`} 
            className={`px-1.5 py-0.5 mx-0.5 rounded-md font-medium text-[0.9em] inline-block ${isAgent ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'}`}
          >
            {displayName}
          </span>
        );
      }
      return formatWhatsAppMarkdown(mPart);
    });
  });
}

function firstRelation<T>(relation: Relation<T> | undefined) {
  return Array.isArray(relation) ? relation[0] : relation
}

function getContentType(file: File | null) {
  if (!file) return 'text'
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('video/')) return 'video'
  return 'file'
}

const VoiceCallWidget = ({ msg, isMissed, agent, safeMeta, msgTime }: any) => {
  const [showPlayer, setShowPlayer] = useState(false);
  const hasRecording = !!safeMeta?.recording_url;
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showPlayer && widgetRef.current) {
      setTimeout(() => {
        widgetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [showPlayer]);

  return (
    <div key={msg.id} className="flex justify-center my-4" ref={widgetRef}>
      <div 
        className={`flex flex-col gap-2 border px-3.5 py-2 rounded-[14px] shadow-sm transition-all duration-200 ${
          isMissed 
            ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700' 
            : 'bg-blue-50/80 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/30'
        } ${hasRecording ? 'cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-800/30' : ''}`}
        onClick={() => {
          if (hasRecording) setShowPlayer(!showPlayer);
        }}
      >
        <div className="flex items-center gap-2.5">
          {agent && (
            <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden border border-white/50 shadow-sm flex items-center justify-center bg-blue-50 dark:bg-slate-800">
              {agent.avatar_url ? (
                <img src={agent.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                  {agent.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          )}
          <div className="flex flex-col flex-1 mr-2 min-w-[120px]">
            <span className={`text-[12px] font-semibold flex items-center gap-1.5 ${
              isMissed ? 'text-slate-600 dark:text-slate-300' : 'text-blue-700 dark:text-blue-300'
            }`}>
              {isMissed ? 'Missed Voice Call' : 'Voice Call'}
              {hasRecording && !showPlayer && <Play size={12} className={isMissed ? 'text-slate-400' : 'text-blue-500/70'} />}
            </span>
            <div className="flex flex-col gap-0.5 mt-0.5">
              <span className={`text-[11px] font-medium ${
                isMissed ? 'text-slate-400 dark:text-slate-500' : 'text-blue-500/70 dark:text-blue-400/70'
              }`}>
                {msgTime} {safeMeta?.duration ? `\u2022 ${safeMeta.duration}` : ''}
              </span>
              {!isMissed && safeMeta?.agent_name && (
                <span className="text-[10px] text-slate-400 font-medium">
                  {safeMeta.direction === 'outbound' 
                    ? `Called by ${safeMeta.agent_name}` 
                    : `Answered by ${safeMeta.agent_name}`}
                </span>
              )}
            </div>
          </div>
          <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center overflow-hidden border border-white/50 shadow-sm ${
            isMissed
              ? 'bg-slate-200 dark:bg-slate-700'
              : 'bg-blue-100 dark:bg-blue-800'
          }`}>
            {isMissed ? (
              <PhoneMissed size={14} className="text-slate-500 dark:text-slate-400" />
            ) : (
              <Phone size={14} className="text-blue-600 dark:text-blue-300" />
            )}
          </div>
        </div>
        
        {showPlayer && hasRecording && (
          <div className={`mt-1 mb-1 border-t pt-3 flex w-full min-w-[240px] ${
            isMissed ? 'border-slate-200/50 dark:border-slate-700/50' : 'border-blue-200/50 dark:border-blue-700/50'
          }`} onClick={(e) => e.stopPropagation()}>
            <div className="w-full scale-95 origin-left">
              <CustomAudioPlayer url={safeMeta.recording_url} type="system" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

type ChatThreadProps = {
  conversationId: string | null
  messages: AppMessage[]
  orgId: string
  teamMembers?: UserProfile[]
  isCustomerTyping?: boolean
  isCustomerRecording?: boolean
  isCustomerOnline?: boolean
  activeAgents?: { name: string; avatar_url?: string; activity: 'viewing' | 'typing' }[]
  conversation?: ConversationWithDetails | null
  currentUser?: UserProfile | null
  isFetching?: boolean
  onBackToList?: () => void
  isRightSidebarOpen?: boolean
  onToggleRightSidebar?: () => void
}

export default function ChatThread({ 
  conversationId, 
  messages, 
  orgId,
  teamMembers = [],
  isCustomerTyping = false,
  isCustomerRecording = false,
  isCustomerOnline = false,
  activeAgents = [],
  conversation = null,
  currentUser,
  isFetching = false,
  onBackToList,
  isRightSidebarOpen = true,
  onToggleRightSidebar
}: ChatThreadProps) {
  const contact = firstRelation(conversation?.contact)
  const contactName = contact?.name || 'Contact'
  const contactInitial = contactName.charAt(0).toUpperCase()
  const avatarColor = getAvatarColor(contactName)
  const channelObj = firstRelation(conversation?.channel) || firstRelation(conversation?.channels)
  const isWebWidget = channelObj?.type === 'widget'

  // Voice Call Agent-Side States
  const pendingIncomingCall = useInboxStore(state => state.pendingIncomingCall)
  const setPendingIncomingCall = useInboxStore(state => state.setPendingIncomingCall)

  const [callConversationId, setCallConversationId] = useState<string | null>(null)
  const [callerName, setCallerName] = useState<string>('')
  const activeCallId = callConversationId || conversationId

  const [incomingCall, setIncomingCall] = useState<{ offer: any } | null>(null)
  const [callStatus, setCallStatus] = useState<'idle' | 'ringing' | 'active' | 'calling'>('idle')
  const [isMuted, setIsMuted] = useState(false)
  const [isRingtoneMuted, setIsRingtoneMuted] = useState(false)
  const [canHangUpVoice, setCanHangUpVoice] = useState(true)
  const voiceConnectionRef = useRef<RTCPeerConnection | null>(null)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null)
  const voiceBufferedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const [callDuration, setCallDuration] = useState(0)
  const callTimerRef = useRef<NodeJS.Timeout | null>(null)
  const voiceChannelRef = useRef<any>(null)
  const voiceChannelSubscribedRef = useRef<boolean>(false)

  const subscribeToVoiceCall = (convId: string) => {
    // Force remove existing channel to guarantee a clean WebRTC state
    const existingCh = supabase.getChannels().find(c => c.topic === `realtime:voicecall:${convId}`);
    if (existingCh) {
      supabase.removeChannel(existingCh);
    }

    const callChannel = supabase.channel(`voicecall:${convId}`)
      .on('broadcast', { event: 'voice_call_incoming' }, (payload) => {
        setCallConversationId(convId)
        setCallerName(contactName)
        setIncomingCall({ offer: payload.payload.offer })
        setCallStatus('ringing')
        playRingtone()
      })
      .on('broadcast', { event: 'voice_call_ended' }, () => {
        handleEndVoiceCall(false)
      })
      .on('broadcast', { event: 'voice_call_answered' }, () => {
        // If another agent answers the call, stop local ringing/popups
        setCallStatus((prevStatus) => {
          if (prevStatus === 'ringing') {
            stopRingtone()
            setIncomingCall(null)
            setCallConversationId(null)
            setCallerName('')
            return 'idle'
          }
          return prevStatus
        })
      })
      .on('broadcast', { event: 'voice_call_answered_by_visitor' }, async (payload) => {
        // Visitor accepted agent-initiated call
        try {
          const pc = voiceConnectionRef.current;
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.payload.answer));
            // Now that remote description is set, start ICE timeout
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
          setCallStatus('active')
          setCanHangUpVoice(false)
          setTimeout(() => setCanHangUpVoice(true), 5000)
          setCallDuration(0)
          if (callTimerRef.current) clearInterval(callTimerRef.current)
          callTimerRef.current = setInterval(() => {
            setCallDuration(d => d + 1)
          }, 1000)
        } catch (err) {
          console.error("Agent-initiated call answer setup failed", err)
        }
      })
      .on('broadcast', { event: 'voice_call_declined_by_visitor' }, () => {
        handleEndVoiceCall(false)
      })
      .on('broadcast', { event: 'voice_call_popup_ready' }, () => {
        // Visitor just loaded standalone call popup. Re-send offer!
        console.log('[Agent Call] Visitor popped open standalone window. Re-sending offer.');
        const pc = voiceConnectionRef.current;
        const ch = voiceChannelRef.current;
        if (pc && pc.localDescription && ch) {
          ch.send({
            type: 'broadcast',
            event: 'voice_call_from_agent',
            payload: { offer: pc.localDescription }
          });
        }
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

    // Assign channel reference immediately to guarantee availability during active accept races
    voiceChannelRef.current = callChannel
      
    callChannel.subscribe((status) => {
      console.log(`[Agent VoiceChannel] Subscribe status: ${status} for conv: ${convId}`);
      if (status === 'SUBSCRIBED') {
        voiceChannelRef.current = callChannel
        voiceChannelSubscribedRef.current = true
      } else {
        voiceChannelSubscribedRef.current = false
      }
    })

    return callChannel;
  }

  // Resolve pending WebRTC call from global alert
  useEffect(() => {
    if (pendingIncomingCall && pendingIncomingCall.conversationId === activeCallId) {
      console.log('[Agent Call] Consuming pending incoming WebRTC call for conversation:', activeCallId);
      
      // Force recreate channel to guarantee clean state
      subscribeToVoiceCall(activeCallId);
      
      setCallConversationId(pendingIncomingCall.conversationId)
      setCallerName(pendingIncomingCall.callerName || contactName)
      setIncomingCall({ offer: pendingIncomingCall.offer })
      setCallStatus('ringing')
      playRingtone()
      setPendingIncomingCall(null)
    }
  }, [pendingIncomingCall, activeCallId, contactName])


  const playRingtone = () => {
    if (isRingtoneMuted) return
    playIncomingRingtoneLoop()
  }

  const stopRingtone = () => {
    stopIncomingRingtoneLoop()
  }

  const handleMuteRingtone = () => {
    stopRingtone()
    setIsRingtoneMuted(true)
  }

  useEffect(() => {
    if (!activeCallId) return

    const callChannel = subscribeToVoiceCall(activeCallId);

    return () => {
      supabase.removeChannel(callChannel)
      voiceChannelRef.current = null
      voiceChannelSubscribedRef.current = false
      stopRingtone()
      if (callTimerRef.current) clearInterval(callTimerRef.current)
    }
  }, [activeCallId])

  const handleAnswerVoiceCall = async () => {
    if (!activeCallId || !incomingCall) return
    
    // Warm up/unlock the browser audio context synchronously inside the user click handler
    const unlockedAudio = unlockAudioContext();

    setCanHangUpVoice(false)
    setTimeout(() => {
      setCanHangUpVoice(true)
    }, 5000)
    stopRingtone()
    setIsRingtoneMuted(false)
    try {
      setCallStatus('active')
      setIncomingCall(null)

      const stream = await navigator.mediaDevices.getUserMedia(VOICE_CONSTRAINTS);
      voiceStreamRef.current = stream

      const pc = createPeerConnection({
        onConnectionFailed: () => {
          console.warn('[Agent] Voice call ICE failed, auto-ending');
          handleEndVoiceCall(true);
        }
      });
      voiceConnectionRef.current = pc

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

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

      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));

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
        await voiceChannelRef.current.send({
          type: 'broadcast',
          event: 'voice_call_answered',
          payload: { 
            answer,
            agentId: currentUser?.id,
            agentName: currentUser?.name
          }
        })
      }

      setCallDuration(0)
      if (callTimerRef.current) clearInterval(callTimerRef.current)
      callTimerRef.current = setInterval(() => {
        setCallDuration(d => d + 1)
      }, 1000)

    } catch (err) {
      console.error("Agent microphone access failed", err)
      setCallStatus('idle')
      setCustomAlert({ title: 'Permission Denied', message: 'Microphone permission is required to answer the voice call.', type: 'error' })
      handleDeclineVoiceCall()
    }
  }

  const handleDeclineVoiceCall = () => {
    voiceBufferedCandidatesRef.current = [];
    stopRingtone()
    setIncomingCall(null)
    setCallStatus('idle')
    if (voiceChannelRef.current) {
      voiceChannelRef.current.send({
        type: 'broadcast',
        event: 'voice_call_declined'
      })
    }
  }

  const handleEndVoiceCall = (sendBroadcast = true) => {
    setPendingIncomingCall(null)
    voiceBufferedCandidatesRef.current = [];
    if (sendBroadcast && !canHangUpVoice) return
    
    stopRingtone()
    setIsRingtoneMuted(false)
    setCanHangUpVoice(true)

    const finalDuration = callDuration;

    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach(t => t.stop())
      voiceStreamRef.current = null
    }
    if (voiceConnectionRef.current) {
      voiceConnectionRef.current.close()
      voiceConnectionRef.current = null
    }
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
      voiceChannelSubscribedRef.current = false
    }

    // Resubscribe to a fresh, clean conversation voice channel to listen for subsequent incoming calls
    if (activeCallId) {
      subscribeToVoiceCall(activeCallId);
    }

    // Log browser call to call_logs table
    if (activeCallId && orgId) {
      logBrowserCall({
        orgId,
        direction: incomingCall ? 'browser_inbound' : 'browser_outbound',
        durationSeconds: finalDuration,
        status: finalDuration > 0 ? 'ANSWERED' : 'NO ANSWER',
        conversationId: activeCallId,
        agentName: currentUser?.name || undefined,
        contactName: callerName || contactName || undefined
      }).catch(err => console.error('Failed to log browser call:', err))
    }

    setCallStatus('idle')
    setIncomingCall(null)
    setIsMuted(false)
    setCallConversationId(null)
    setCallerName('')
  }

  const toggleMuteVoiceCall = () => {
    if (voiceStreamRef.current) {
      const audioTrack = voiceStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }

  // Agent-initiated voice call
  const handleStartVoiceCallFromAgent = async () => {
    if (!conversationId || callStatus !== 'idle') return
    console.log('[Agent Call] Starting call for conversation:', conversationId);
    
    // Warm up/unlock the browser audio context synchronously inside the "Call" click handler
    const unlockedAudio = unlockAudioContext();

    try {
      setCallStatus('calling')
      setCallConversationId(conversationId)
      setCallerName(contactName)
      
      // Force recreate channel to guarantee fresh subscription
      subscribeToVoiceCall(conversationId);
      
      const stream = await navigator.mediaDevices.getUserMedia(VOICE_CONSTRAINTS);
      console.log('[Agent Call] Got mic stream');
      voiceStreamRef.current = stream

      const pc = createPeerConnection({
        onConnectionFailed: () => {
          console.warn('[Agent] Agent-initiated call ICE failed, auto-ending');
          handleEndVoiceCall(true);
        },
        deferTimeout: true // Don't start ICE timeout until visitor accepts
      });
      voiceConnectionRef.current = pc

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        console.log('[Agent Call] Got remote track from visitor');
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
      console.log('[Agent Call] Created offer, checking channel...');

      // Wait for channel to be SUBSCRIBED (up to 3s)
      let isSubscribed = voiceChannelSubscribedRef.current;
      if (!isSubscribed) {
        console.log('[Agent Call] Channel not subscribed yet, polling...');
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 100));
          if (voiceChannelSubscribedRef.current) {
            isSubscribed = true;
            break;
          }
        }
      }

      const ch = voiceChannelRef.current;
      if (ch && isSubscribed) {
        console.log('[Agent Call] Sending voice_call_from_agent on channel:', ch.topic);
        ch.send({
          type: 'broadcast',
          event: 'voice_call_from_agent',
          payload: { offer }
        })
        console.log('[Agent Call] Offer sent successfully');

        // Auto-end after 30s if visitor doesn't answer (ringing timeout)
        setTimeout(() => {
          if (voiceConnectionRef.current === pc && pc.iceConnectionState === 'new') {
            console.warn('[Agent Call] 30s ringing timeout, visitor did not answer');
            handleEndVoiceCall(true);
          }
        }, 30000);
      } else {
        console.error('[Agent Call] Failed to send offer: channel not subscribed');
        handleEndVoiceCall(false);
      }
    } catch (err) {
      console.error('[Agent Call] Initiation failed:', err)
      setCallStatus('idle')
      setCustomAlert({ title: 'Permission Denied', message: 'Microphone permission is required to place calls.', type: 'error' })
    }
  }

  const formatCallDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const [input, setInput] = useState("")
  const [selectedText, setSelectedText] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 300)}px`;
    }
  }, [input])

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showResolveConfirm, setShowResolveConfirm] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { updateConversation, removeConversation, isLoaded, convertingTickets, setConvertingTicket } = useInboxStore()
  const isConverting = conversationId ? convertingTickets[conversationId] || false : false

  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState("")

  useEffect(() => {
    if (contactName) setEditedName(contactName)
  }, [contactName, conversationId])

  const handleSaveName = async () => {
    if (!editedName.trim() || editedName === contactName || !contact?.id) {
      setIsEditingName(false)
      return
    }
    const result = await updateContactName(contact.id, editedName.trim())
    if (result.success) {
      setIsEditingName(false)
      if (conversationId) {
        updateConversation(conversationId, { contact: { ...contact, name: editedName.trim() } })
      }
    } else {
      setEditedName(contactName)
      setIsEditingName(false)
    }
  }

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleResolveAndReview = () => {
    if (!conversationId || !conversation) return
    setShowResolveConfirm(true)
  }

  const executeResolveAndReview = async () => {
    if (!conversationId || !conversation) return
    setIsResolving(true)
    try {
      const message = "Did we fix your issue? If yes, please leave a quick review here: https://g.page/r/hostnin/review\n\nIf no, click here to escalate: https://hostnin.com/contact"
      
      const tempId = "temp-" + crypto.randomUUID()
      addOptimisticMessage(conversationId, {
        id: tempId,
        sender_type: 'agent',
        sender_id: currentUser?.id ?? null,
        content: message,
        content_type: 'text',
        metadata: null,
        is_internal: false,
        status: 'sending',
        created_at: new Date().toISOString()
      })
      
      await replyToConversation(orgId, conversationId, message, false)
      markConfirmed(conversationId, tempId)
      
      // Auto-archive after sending CSAT
      await toggleConversationFlag(conversationId, 'is_archived', true)
      
      setShowResolveConfirm(false)
      setIsMenuOpen(false)
    } catch (error) {
      console.error(error)
      setCustomAlert({ title: 'Error', message: 'Failed to send review prompt or archive conversation', type: 'error' })
    } finally {
      setIsResolving(false)
    }
  }

  const handleThreadAction = async (action: string) => {
    if (!conversationId || !conversation) return
    setIsMenuOpen(false)
    try {
      if (action === 'leave' && currentUser) {
        // Optimistically insert the system message
        addOptimisticMessage(conversationId, {
          id: `temp-${Date.now()}`,
          conversation_id: conversationId,
          org_id: orgId,
          sender_id: currentUser.id,
          sender_type: 'system',
          content: `${currentUser.name} left the conversation`,
          content_type: 'system',
          metadata: null,
          is_internal: false,
          status: 'sending',
          created_at: new Date().toISOString()
        })
        const prevParticipants = [...participants]
        setParticipants(participants.filter(p => p.user_id !== currentUser?.id))
        updateConversation(conversationId, { assigned_to: null, assigned_type: 'unassigned' })
        try {
          await leaveConversation(conversationId)
        } catch (e) {
          setParticipants(prevParticipants)
          throw e
        }
      } else if (action === 'pin') {
        const newVal = !conversation.is_pinned
        updateConversation(conversationId, { is_pinned: newVal })
        try {
          await toggleConversationFlag(conversationId, 'is_pinned', newVal)
        } catch (e) {
          updateConversation(conversationId, { is_pinned: !newVal })
          throw e
        }
      } else if (action === 'unread') {
        const newVal = !conversation.is_unread
        updateConversation(conversationId, { is_unread: newVal })
        try {
          await toggleConversationFlag(conversationId, 'is_unread', newVal)
        } catch (e) {
          updateConversation(conversationId, { is_unread: !newVal })
          throw e
        }
      } else if (action === 'mute') {
        const newVal = !conversation.is_muted
        updateConversation(conversationId, { is_muted: newVal })
        try {
          await toggleConversationFlag(conversationId, 'is_muted', newVal)
        } catch (e) {
          updateConversation(conversationId, { is_muted: !newVal })
          throw e
        }
      } else if (action === 'archive') {
        const newVal = !conversation.is_archived
        updateConversation(conversationId, { is_archived: newVal })
        try {
          await toggleConversationFlag(conversationId, 'is_archived', newVal)
        } catch (e) {
          updateConversation(conversationId, { is_archived: !newVal })
          throw e
        }
      } else if (action === 'delete') {
        if (confirm('Are you sure you want to permanently delete this thread?')) {
          const tempConv = conversation
          removeConversation(conversationId)
          try {
            await deleteConversation(conversationId)
          } catch (e) {
            updateConversation(conversationId, tempConv) // crude revert
            throw e
          }
        }
      } else if (action === 'convert') {
        setConvertingTicket(conversationId, true)
        try {
          const rawPlatformId = contact?.platform_id || ""
          const isLid = rawPlatformId.endsWith('@lid')
          const isMessenger = contact?.platform_type === 'messenger'
          const isInstagram = contact?.platform_type === 'instagram'
          const platformId = rawPlatformId.includes('@') ? rawPlatformId.split('@')[0] : rawPlatformId
          const metadataPhone = (contact?.metadata as Record<string, any>)?.real_phone
          const displayPlatformId = metadataPhone || platformId
          const contactEmail = contact?.email
          const contactPhone = contact?.phone
          const effectivePhoneId = contactEmail || contactPhone || displayPlatformId

          const isEmail = effectivePhoneId.includes('@') && !effectivePhoneId.endsWith('@lid')
          const cleanPhone = isEmail ? effectivePhoneId : (effectivePhoneId.startsWith('+') ? effectivePhoneId : `+${effectivePhoneId}`)

          const client = await fetchWhmcsClient(cleanPhone)
          if (!client) {
            setCustomAlert({
              title: "Client Profile Missing",
              message: `No WHMCS client found for ${cleanPhone}. Link a profile in the Portal tab first.`,
              type: "error"
            })
            setConvertingTicket(conversationId, false)
            return
          }

          const result = await convertChatToTicket(conversationId, client.id, 1, currentUser?.id)
          if (result.success) {
            setCustomAlert({
              title: "Ticket Created Successfully",
              message: `Chat successfully converted to ticket #${result.ticket?.tid || ''}!`,
              type: "success"
            })
          } else {
            setCustomAlert({
              title: "Conversion Failed",
              message: result.error || "An unknown error occurred while converting the chat.",
              type: "error"
            })
          }
        } catch (e: any) {
          setCustomAlert({
            title: "Conversion Error",
            message: e?.message || e || "Failed to convert chat.",
            type: "error"
          })
        } finally {
          setConvertingTicket(conversationId, false)
        }
      }
    } catch (e) {
      console.error('Failed to perform action:', e)
    }
  }
  
  // Load draft when conversation changes
  useEffect(() => {
    if (conversationId) {
      const timer = setTimeout(() => {
        const draft = localStorage.getItem(`draft_${conversationId}`)
        setInput(draft || "")
        
        // Restore AI draft log ID if exists
        const logId = localStorage.getItem(`draft_log_id_${conversationId}`)
        if (logId) {
          aiDraftLogIdRef.current = logId
        } else {
          aiDraftLogIdRef.current = null
        }
        aiDraftLogPromiseRef.current = null
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [conversationId])

  // Save draft when input changes
  useEffect(() => {
    if (conversationId) {
      if (input) {
        localStorage.setItem(`draft_${conversationId}`, input)
      } else {
        localStorage.removeItem(`draft_${conversationId}`)
        localStorage.removeItem(`draft_log_id_${conversationId}`)
        setAiDraftSources([])
        aiDraftLogIdRef.current = null
      }
    }
  }, [input, conversationId])

  const [isSending, setIsSending] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [isInternal, setIsInternal] = useState(false)
  const { 
    optimisticMessages: optimisticByConv,
    addOptimisticMessage,
    removeOptimisticMessage,
    markFailed,
    markConfirmed,
    confirmOptimisticMessage
  } = useMessageStore()
  const optimisticMessages = conversationId ? (optimisticByConv[conversationId] || []) : []
  
  // Quick Replies State
  const [quickReplies, setQuickReplies] = useState<QuickReplyItem[]>([])
  const [showMacroMenu, setShowMacroMenu] = useState(false)
  const [macroFilter, setMacroFilter] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Internal Mention State
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [mentionFilter, setMentionFilter] = useState("")
  const [mentionIndex, setMentionIndex] = useState(0)

  // Quick Replies Creation Modal
  const [quickReplyModalOpen, setQuickReplyModalOpen] = useState(false)
  const [quickReplyShortcut, setQuickReplyShortcut] = useState("")
  const [quickReplyTitle, setQuickReplyTitle] = useState("")
  const [quickReplyContent, setQuickReplyContent] = useState("")
  const [quickReplySaving, setQuickReplySaving] = useState(false)
  const [quickReplyError, setQuickReplyError] = useState(false)

  // Join Thread State
  const [participants, setParticipants] = useState<ConversationParticipant[]>([])
  const [isJoining, setIsJoining] = useState(false)
  const [isLoadingParticipants, setIsLoadingParticipants] = useState(false)
  const [showWhisperComposer, setShowWhisperComposer] = useState(false)
  const isJoined = !conversationId ? true : participants.some(p => p.user_id === currentUser?.id)
  const isPickedUp = !conversationId ? true : (participants.length > 0 || messages.some(m => m.sender_type === 'agent' || (m.sender_type === 'system' && m.content && m.content.includes('joined the conversation'))))

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadFileName, setUploadFileName] = useState("")
  
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([])
  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [stagedAudio, setStagedAudio] = useState<{ url: string; file: File } | null>(null)
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false)
  


  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [customAlert, setCustomAlert] = useState<{ title: string; message: string; type: 'error' | 'success' | 'info' } | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const [isAiDrafting, setIsAiDrafting] = useState(false)
  const [isAiStreaming, setIsAiStreaming] = useState(false)
  const [isWaitingForTranscript, setIsWaitingForTranscript] = useState(false)
  const [aiDraftFailed, setAiDraftFailed] = useState(false)
  const [aiDraftSources, setAiDraftSources] = useState<string[]>([])
  const aiDraftLogIdRef = useRef<string | null>(null)
  const aiDraftLogPromiseRef = useRef<Promise<string | null> | null>(null)
  const autoTranscribeRef = useRef<boolean>(false)
  const audioChunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const activeUploadsRef = useRef<Record<string, Promise<{ url: string; type: string; name: string }>>>({})
  const [replyToMessage, setReplyToMessage] = useState<any | null>(null)
  
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: any } | null>(null)
  const [editingMessage, setEditingMessage] = useState<any | null>(null)

  // Unified Agent Activity Tracking
  const lastActivityTimeRef = useRef<number>(Date.now());
  const [isActivelyComposing, setIsActivelyComposing] = useState(false);
  const lastBroadcastRef = useRef<boolean>(false);
  
  const currentTypingAgents = activeAgents?.filter(a => a.activity === 'typing') || [];
  const [displayTypingAgents, setDisplayTypingAgents] = useState<{ name: string; avatar_url?: string; activity: 'viewing' | 'typing' }[]>(currentTypingAgents);
  const currentTypingAgentsLen = currentTypingAgents.length;
  useEffect(() => {
    if (currentTypingAgentsLen > 0) {
      setDisplayTypingAgents(activeAgents?.filter(a => a.activity === 'typing') || []);
    }
  }, [currentTypingAgentsLen, activeAgents]);

  useEffect(() => {
    if (!conversationId || isInternal) {
      setIsActivelyComposing(false);
      return;
    }

    const checkActivity = () => {
      const isAiWorking = isAiDrafting || isAiStreaming;
      const isUploading = stagedAttachments.some(a => a.status === 'uploading');
      const timeSinceLastActivity = Date.now() - lastActivityTimeRef.current;
      
      // Consider "active" if AI is working, actively uploading, OR typed/changed something within last 1.5 seconds
      const active = isAiWorking || isUploading || (timeSinceLastActivity < 1500 && input.trim().length > 0);
      
      setIsActivelyComposing(active);
    };

    const interval = setInterval(checkActivity, 1000);
    return () => clearInterval(interval);
  }, [conversationId, isInternal, isAiDrafting, isAiStreaming, stagedAttachments, input]);

  useEffect(() => {
    if (!conversationId || isInternal) return;

    if (isActivelyComposing) {
      if (!lastBroadcastRef.current) {
        supabase.channel(`typing:${orgId}`).send({
          type: 'broadcast',
          event: 'typingStatus',
          payload: { conversation_id: conversationId, direction: 'agent', is_typing: true, agent_name: currentUser?.name, agent_avatar: currentUser?.avatar_url, agent_id: currentUser?.id }
        });
        lastBroadcastRef.current = true;
      }
      
      const pingInterval = setInterval(() => {
        supabase.channel(`typing:${orgId}`).send({
          type: 'broadcast',
          event: 'typingStatus',
          payload: { conversation_id: conversationId, direction: 'agent', is_typing: true, agent_name: currentUser?.name, agent_avatar: currentUser?.avatar_url, agent_id: currentUser?.id }
        });
      }, 2500);
      
      return () => clearInterval(pingInterval);
    } else {
      if (lastBroadcastRef.current) {
        supabase.channel(`typing:${orgId}`).send({
          type: 'broadcast',
          event: 'typingStatus',
          payload: { conversation_id: conversationId, direction: 'agent', is_typing: false, agent_name: currentUser?.name, agent_avatar: currentUser?.avatar_url, agent_id: currentUser?.id }
        });
        lastBroadcastRef.current = false;
      }
    }
  }, [isActivelyComposing, conversationId, isInternal, orgId, currentUser]);

  const handleContextMenu = (e: React.MouseEvent, message: any) => {
    if (message.status === 'recalled' || message.status === 'deleted') return
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      message
    })
  }

  const triggerEditMessage = (msg: any) => {
    setEditingMessage(msg);
    setInput(msg.content);
    setContextMenu(null);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const len = msg.content?.length || 0;
        textareaRef.current.setSelectionRange(len, len);
      }
    }, 100);
  }

  useEffect(() => {
    getQuickRepliesFromTable(orgId).then(data => {
      if (data) setQuickReplies(data as QuickReplyItem[])
    })
  }, [orgId])

  // Removed forced internal mode - users can reply immediately and it will auto-join

  // Load participants and reset composer inputs when conversation changes to prevent cross-customer leakage
  useEffect(() => {
    setInput("")
    stagedAttachments.forEach(att => {
      if (att.previewUrl) URL.revokeObjectURL(att.previewUrl)
    })
    setStagedAttachments([])
    setReplyToMessage(null)
    setShowMacroMenu(false)
    setIsInternal(false)

    if (!conversationId) return
    setIsLoadingParticipants(true)
    let active = true

    getParticipants(conversationId).then(data => {
      if (active) {
        setParticipants(data as unknown as ConversationParticipant[])
        setIsLoadingParticipants(false)
      }
    })

    const channel = supabase
      .channel(`participants_thread:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_participants',
          filter: `conversation_id=eq.${conversationId}`
        },
        () => {
          getParticipants(conversationId).then(data => {
            if (active) {
              setParticipants(data as unknown as ConversationParticipant[])
            }
          })
        }
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  // Keep ref of staged attachments to revoke on unmount only, avoiding premature destruction
  const stagedAttachmentsRef = useRef<StagedAttachment[]>([]);
  useEffect(() => {
    stagedAttachmentsRef.current = stagedAttachments;
  }, [stagedAttachments]);

  useEffect(() => {
    return () => {
      stagedAttachmentsRef.current.forEach(att => {
        if (att.previewUrl) {
          try {
            URL.revokeObjectURL(att.previewUrl);
          } catch (e) {
            console.error(e);
          }
        }
      });
    };
  }, []);

  async function handleJoinThread() {
    if (!conversationId || !currentUser) return
    
    // Optimistic UI update to make it feel instant
    const prevParticipants = [...participants]
    setParticipants([...participants, { user_id: currentUser.id, role: 'agent' } as unknown as ConversationParticipant])
    setIsInternal(false) // Auto-switch to reply mode
    setIsJoining(true)
    
    try {
      const updated = await joinConversation(conversationId)
      setParticipants(updated as unknown as ConversationParticipant[])
    } catch (e) {
      console.error('Failed to join:', e)
      setParticipants(prevParticipants)
      setIsInternal(true)
    } finally {
      setIsJoining(false)
    }
  }

  // Global ringtone for unjoined chats is now handled in page.tsx

  // Smart confirm: when real agent messages arrive, remove matching optimistic ones by content
  useEffect(() => {
    if (!conversationId) return;
    messages.forEach(msg => {
      if (msg.sender_type === 'agent' || msg.sender_type === 'system') {
        confirmOptimisticMessage(conversationId, msg.content ?? '');
      }
    });
    // Mark as read when messages load or change
    if (messages.length > 0) {
      markMessagesAsRead(conversationId, 'agent');
      const hasUnread = messages.some(m => m.sender_type === 'contact' && m.status !== 'read' && m.content_type !== 'system');
      if (hasUnread) {
        const updatedMessages = messages.map(m => 
          (m.sender_type === 'contact' && m.status !== 'read' && m.content_type !== 'system') ? { ...m, status: 'read' } : m
        );
        setTimeout(() => {
          useInboxStore.getState().setMessages(conversationId, updatedMessages as AppMessage[]);
          // Also update the lastMessage on the conversation so sidebar dot disappears
          const store = useInboxStore.getState();
          const conv = store.conversations.find(c => c.id === conversationId);
          if (conv) {
            const lastMsg = conv.messages?.[0];
            if (lastMsg && lastMsg.sender_type === 'contact' && lastMsg.status !== 'read' && lastMsg.content_type !== 'system') {
              store.updateConversation(conversationId, {
                messages: [{ ...lastMsg, status: 'read' }]
              });
            }
          }
        }, 50);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, conversationId])

  // Merge: real messages + any still-pending/failed/confirmed optimistic ones
  // Confirmed optimistic messages show as 'delivered' until real-time replaces them (no flicker)
  const allMessages = [
    ...messages,
    ...(optimisticMessages
      .filter(om => {
        // Filter out confirmed optimistic messages that already have a real counterpart
        if (om.status === 'confirmed') {
          return !messages.some(m => m.content === om.content && m.sender_type === om.sender_type);
        }
        return true;
      })
      .map(om => ({
        ...om,
        // Show confirmed messages as 'sent' (single checkmark) instead of spinning clock
        status: om.status === 'confirmed' ? 'sent' : om.status
      })) as unknown as AppMessage[]
    )
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  // Safety net: auto-clean any confirmed optimistic messages older than 10s
  // This handles edge cases where real-time subscription misses the INSERT
  useEffect(() => {
    if (!conversationId) return;
    const staleThreshold = 10000; // 10s
    const interval = setInterval(() => {
      const now = Date.now();
      const currentOptimistic = useMessageStore.getState().optimisticMessages[conversationId] || [];
      currentOptimistic.forEach(om => {
        if (om.status === 'confirmed' && om._confirmedAt && (now - om._confirmedAt > staleThreshold)) {
          removeOptimisticMessage(conversationId, om.id);
        }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [conversationId, removeOptimisticMessage])

  const prevMsgLength = useRef(messages.length)

  useEffect(() => {
    // Skip scroll when there are no messages (loading state)
    if (messages.length === 0) {
      prevMsgLength.current = 0
      return
    }

    // Use instant scroll for bulk loads, smooth for single new messages
    const isBulkLoad = Math.abs(messages.length - prevMsgLength.current) > 1
    
    // Use rAF to batch with paint and avoid layout thrashing
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ 
        behavior: isBulkLoad ? 'auto' : 'smooth' 
      })
    })
    
    prevMsgLength.current = messages.length
  }, [messages.length, optimisticMessages.length])

  // Keep messages pinned to bottom as textarea grows during AI streaming
  useEffect(() => {
    if (isAiStreaming && input) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      })
    }
  }, [isAiStreaming, input])

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Check cursor position to trigger quick reply menu
  const [macroPrefix, setMacroPrefix] = useState('/');

  const checkMacroTrigger = (val: string, selectionStart: number) => {
    const textUpToCursor = val.slice(0, selectionStart);
    const match = textUpToCursor.match(/(?:^|\s)(\/)([a-zA-Z0-9_-]*)$/);
    if (match) {
      setShowMacroMenu(true);
      setMacroPrefix(match[1]);
      setMacroFilter(match[2].toLowerCase());
      setSelectedIndex(0);
    } else {
      setShowMacroMenu(false);
    }
  };

  const checkMentionTrigger = (val: string, selectionStart: number) => {
    if (!isInternal) {
      setShowMentionMenu(false);
      return;
    }
    const textUpToCursor = val.slice(0, selectionStart);
    const match = textUpToCursor.match(/(?:^|\s)(@)([a-zA-Z0-9_-]*)$/);
    if (match) {
      setShowMentionMenu(true);
      setMentionFilter(match[2].toLowerCase());
      setMentionIndex(0);
    } else {
      setShowMentionMenu(false);
    }
  };

  // Handle Input Change for Macro Menu and Mentions
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;

    // Quick Voice Record shortcut (//v)
    if (val.trim() === '//v' || val.endsWith(' //v') || val.endsWith('\n//v')) {
      const newVal = val.replace(/(^|\s|\n)\/\/v$/, '').trim();
      setInput(newVal);
      setShowMacroMenu(false);
      setShowMentionMenu(false);
      startRecording(true);
      return;
    }

    setInput(val);
    checkMacroTrigger(val, e.target.selectionStart);
    checkMentionTrigger(val, e.target.selectionStart);
    lastActivityTimeRef.current = Date.now();
  };

  const filteredMacros = (() => {
    
    return quickReplies.filter(r => {
      if (!macroFilter) return true;
      const shortcutLower = r.shortcut.toLowerCase();
      const titleLower = (r.title || '').toLowerCase();
      
      if (shortcutLower.startsWith(macroFilter) || titleLower.startsWith(macroFilter)) return true;
      if (shortcutLower.includes(macroFilter) || titleLower.includes(macroFilter)) return true;
      return false;
    }).sort((a, b) => {
      if (!macroFilter) return a.shortcut.localeCompare(b.shortcut);
      
      const aShortcut = a.shortcut.toLowerCase();
      const bShortcut = b.shortcut.toLowerCase();
      
      const aStartsWith = aShortcut.startsWith(macroFilter);
      const bStartsWith = bShortcut.startsWith(macroFilter);
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      
      if (aShortcut === macroFilter && bShortcut !== macroFilter) return -1;
      if (bShortcut === macroFilter && aShortcut !== macroFilter) return 1;
      
      return aShortcut.localeCompare(bShortcut);
    });
  })();

  const filteredMentions = (() => {
    return teamMembers.filter(m => {
      if (!mentionFilter) return true;
      const nameLower = m.name.toLowerCase();
      return nameLower.includes(mentionFilter);
    });
  })();

  useEffect(() => {
    if (showMacroMenu) {
      const element = document.getElementById(`macro-item-${selectedIndex}`);
      if (element) {
        element.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, showMacroMenu]);

  useEffect(() => {
    if (showMentionMenu) {
      const element = document.getElementById(`mention-item-${mentionIndex}`);
      if (element) {
        element.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [mentionIndex, showMentionMenu]);

  const applyMacro = (macroContent: string) => {
    if (macroContent.startsWith('//translate-')) {
      const mode = macroContent.split('-')[1]; // 'en', 'bn', or 'auto'
      const val = input;
      const textarea = textareaRef.current;
      if (textarea) {
        const textUpToCursor = val.slice(0, textarea.selectionStart);
        const slashIndex = textUpToCursor.lastIndexOf('//');
        const textToTranslate = (val.slice(0, slashIndex) + val.slice(textarea.selectionEnd)).trim();
        
        if (textToTranslate) {
          let instruction = '';
          if (mode === 'en') instruction = `Translate the following exactly to English: ${textToTranslate}`;
          else if (mode === 'bn') instruction = `Translate the following exactly to Bengali: ${textToTranslate}`;
          else instruction = `Translate the following exactly, auto-detecting language (Bangla <-> English): ${textToTranslate}`;
          
          handleAiDraft(instruction, true);
        } else {
          // If no text, just insert the //t 
          const newValue = val.slice(0, slashIndex) + (mode === 'auto' ? '//t ' : `//translate to ${mode}: `) + val.slice(textarea.selectionEnd);
          setInput(newValue);
          setTimeout(() => {
             textarea.focus();
             const newCursorPos = slashIndex + (mode === 'auto' ? 4 : 17);
             textarea.setSelectionRange(newCursorPos, newCursorPos);
          }, 10);
        }
      }
      setShowMacroMenu(false);
      return;
    }

    const val = input;
    const textarea = textareaRef.current;
    
    if (textarea) {
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      const textUpToCursor = val.slice(0, selectionStart);
      const textAfterCursor = val.slice(selectionEnd);
      
      const match = textUpToCursor.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);
      if (match) {
        // Find the index of the "/" that triggered this macro
        const slashIndex = textUpToCursor.lastIndexOf('/');
        
        // Construct the new value replacing only the "/" trigger part
        const newValue = val.slice(0, slashIndex) + macroContent + textAfterCursor;
        setInput(newValue);
        setShowMacroMenu(false);
        
        // Return focus and set caret exactly after the inserted macro
        setTimeout(() => {
          textarea.focus();
          const newCursorPos = slashIndex + macroContent.length;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 10);
        return;
      }
    }
    
    // Fallback direct replacement
    setInput(macroContent);
    setShowMacroMenu(false);
  };

  const applyMention = (member: UserProfile) => {
    const val = input;
    const textarea = textareaRef.current;
    
    if (textarea) {
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      const textUpToCursor = val.slice(0, selectionStart);
      const textAfterCursor = val.slice(selectionEnd);
      
      const match = textUpToCursor.match(/(?:^|\s)(@)([a-zA-Z0-9_-]*)$/);
      if (match) {
        const atIndex = textUpToCursor.lastIndexOf('@');
        const mentionText = `@${member.name.replace(/\s+/g, '')} `; // Usually mentions don't have spaces, but we can just use the name without spaces or keep spaces if we want. Let's keep the name as is but remove spaces so it matches. Actually wait, if we use name, we can just do @Name
        const newValue = val.slice(0, atIndex) + mentionText + textAfterCursor;
        setInput(newValue);
        setShowMentionMenu(false);
        
        setTimeout(() => {
          textarea.focus();
          const newCursorPos = atIndex + mentionText.length;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 10);
        return;
      }
    }
    
    setInput(val + `@${member.name.replace(/\s+/g, '')} `);
    setShowMentionMenu(false);
  };

  const loadMoreMessages = async () => {
    if (!messages.length || isLoadingMore || !hasMoreMessages || !conversationId) return;
    setIsLoadingMore(true);
    const oldestMsg = messages[0];
    try {
      const olderMessages = await getMessages(conversationId, 50, oldestMsg.created_at);
      if (olderMessages.length > 0) {
        useInboxStore.getState().setMessages(conversationId, [...olderMessages, ...messages]);
      } else {
        setHasMoreMessages(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMore(false);
    }
  }

  const handleAiDraft = async (instruction?: string, isTranslation = false, prefix = "", suffix = "") => {
    if (!conversationId) return
    setIsAiDrafting(true)
    setAiDraftSources([])
    aiDraftLogIdRef.current = null
    
    // Format context messages - exclude whisper/internal messages (skip context for translation to save tokens/time)
    const contextMessages = isTranslation ? "" : allMessages
      .filter(m => !m.is_internal)
      .slice(-20)
      .map(m => {
        let name = 'System'
        if (m.content_type !== 'system') {
          const isAgent = m.sender_type === 'agent' || m.sender_type === 'ai'
          name = isAgent ? 'Agent' : (contactName || 'Customer')
        }
        
        let contentStr = m.content_type === 'text' || m.content_type === 'system' ? m.content : `[${m.content_type}]`
        if (m.content_type === 'audio') {
           const transcript = (m.metadata as any)?.transcript
           contentStr = transcript ? `[Audio Transcript]: ${transcript}` : `[Audio Voice Message]`
        }
        return `[${name}]: ${contentStr}`
      }).join('\n')



    try {
      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextMessages, contactName, orgId, instruction, isTranslation })
      })

      if (!res.ok) throw new Error('API failed')
      if (!res.body) throw new Error('No body')

      if (!prefix && !suffix) setInput('')
      setIsInternal(false)
      setIsAiDrafting(false) // stop spinner, text is about to stream
      setIsAiStreaming(true) // show pulsing blue border while streaming

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let lang = 'en'
      let usageTokens: number | undefined
      let usageModel: string | undefined
      let usageTemp: number | undefined

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.error) {
                throw new Error(data.error)
              }
              if (data.text) {
                fullText += data.text
                setInput(prefix + fullText + suffix)
                if (textareaRef.current) {
                  textareaRef.current.focus()
                  textareaRef.current.scrollTop = textareaRef.current.scrollHeight
                }
              }
              if (data.language) {
                lang = data.language
              }
              if (data.sources) {
                setAiDraftSources(data.sources)
              }
              if (data.usage) {
                usageTokens = data.usage.total
              }
              if (data.model) {
                usageModel = data.model
              }
              if (data.temperature !== undefined) {
                usageTemp = data.temperature
              }
            } catch (e) {}
          }
        }
      }

      setIsAiStreaming(false)



      // Log the AI draft for learning - store promise to handle fast sends
      if (orgId && conversationId && currentUser) {
        aiDraftLogPromiseRef.current = logAiDraft(
          orgId, 
          conversationId, 
          currentUser.id, 
          fullText.trim(), 
          lang, 
          usageTokens, 
          usageModel, 
          usageTemp
        )
          .then(logId => { 
            aiDraftLogIdRef.current = logId; 
            if (logId) {
              localStorage.setItem(`draft_log_id_${conversationId}`, logId);
            }
            return logId; 
          })
          .catch(() => null)
      }
    } catch (e: any) {
      setAiDraftFailed(true)
      setTimeout(() => setAiDraftFailed(false), 3000)
      setIsAiDrafting(false)
      setIsAiStreaming(false)

    }
  }

  const handleSend = async () => {
    if ((!input.trim() && stagedAttachments.length === 0) || !conversationId) return

    const msgText = input.trim()
    
    // AI Copilot feature
    if (msgText.startsWith('//') && msgText.length > 2) {
      const instruction = msgText.substring(2).trim();
      handleAiDraft(instruction);
      return;
    }

    const currentAttachments = [...stagedAttachments]
    
    if (editingMessage) {
      setInput("");
      const editMsgId = editingMessage.id;
      setEditingMessage(null);

      // Optimistic update
      const updatedMessages = messages.map(m => 
        m.id === editMsgId ? { ...m, content: msgText } : m
      );
      useInboxStore.getState().setMessages(conversationId, updatedMessages as AppMessage[]);

      try {
         await editMessage(editMsgId, msgText);
      } catch (err: any) {
         console.error('Failed to edit: ' + err.message);
         // Revert on failure
         useInboxStore.getState().setMessages(conversationId, messages);
      }
      return;
    }
    
    // Capture and clear reply message instantly
    const repliedMessage = replyToMessage
    setReplyToMessage(null)

    const replyMeta = repliedMessage ? {
      message_id: repliedMessage.id,
      sender_name: repliedMessage.sender_type === 'agent' || repliedMessage.sender_type === 'ai'
        ? (teamMembers.find(t => t.id === repliedMessage.sender_id)?.name || "Agent")
        : (contactName || "Customer"),
      content: repliedMessage.content,
      content_type: repliedMessage.content_type || 'text'
    } : null;

    setInput("")
    setStagedAttachments([])
    localStorage.removeItem(`draft_${conversationId}`)
    localStorage.removeItem(`draft_log_id_${conversationId}`)
    setAiDraftSources([])
    setIsSending(true)

    // Complete AI draft log if this message came from an AI draft
    // Process asynchronously so it doesn't block the UI
    const processAiDraftLog = async (promise: Promise<string | null> | null, id: string | null, text: string) => {
      try {
        let finalId = id;
        if (promise && !finalId) {
          finalId = await promise;
        }
        if (finalId && text) {
          const contextMessages = allMessages
            .filter(m => !m.is_internal)
            .slice(-20)
            .map(m => {
              let name = 'System'
              if (m.content_type !== 'system') {
                const isAgent = m.sender_type === 'agent' || m.sender_type === 'ai'
                name = isAgent ? 'Agent' : (contactName || 'Customer')
              }
              
              let contentStr = m.content_type === 'text' || m.content_type === 'system' ? m.content : `[${m.content_type}]`
              if (m.content_type === 'audio') {
                 const transcript = (m.metadata as any)?.transcript
                 contentStr = transcript ? `[Audio Transcript]: ${transcript}` : `[Audio Voice Message]`
              }
              return `[${name}]: ${contentStr}`
            }).join('\n')

          await completeAiDraftLog(finalId, text, contextMessages);
        }
      } catch (e) {
        console.error("Failed to process AI draft log", e);
      }
    };

    if (aiDraftLogPromiseRef.current || aiDraftLogIdRef.current) {
      processAiDraftLog(aiDraftLogPromiseRef.current, aiDraftLogIdRef.current, msgText);
      aiDraftLogIdRef.current = null;
      aiDraftLogPromiseRef.current = null;
    }

    // Auto-join if not joined and sending a public reply
    if (!isJoined && !isInternal) {
      const prevParticipants = [...participants]
      setParticipants([...participants, { user_id: currentUser?.id, role: 'agent' } as unknown as ConversationParticipant])
      joinConversation(conversationId).then(updated => {
        setParticipants(updated as unknown as ConversationParticipant[])
      }).catch(e => {
        console.error('Failed to auto-join:', e)
        setParticipants(prevParticipants)
      })
    }
    
    try {
      // Send text message first if exists
      if (msgText || currentAttachments.length === 0) {
        const tempId = "temp-" + crypto.randomUUID()
        addOptimisticMessage(conversationId, {
          id: tempId,
          sender_type: 'agent',
          sender_id: currentUser?.id ?? null,
          content: msgText,
          content_type: 'text',
          metadata: replyMeta ? { reply_to: replyMeta } as any : null,
          is_internal: isInternal,
          status: 'sending',
          created_at: new Date().toISOString()
        })
        // Fire and forget so the UI is not blocked
        replyToConversation(orgId, conversationId, msgText, isInternal, 'text', replyMeta ? { reply_to: replyMeta } : undefined)
          .then(() => markConfirmed(conversationId, tempId))
          .catch((e: unknown) => {
            console.error(e)
            markFailed(conversationId, tempId)
          })
      }

      // Process attachments
      if (currentAttachments.length > 0) {
        // Fire attachment sending pipelines completely in the background!
        currentAttachments.forEach(async (attachment) => {
          const tempId = "temp-" + crypto.randomUUID()
          const isImage = attachment.type?.startsWith('image/')
          const isAudio = attachment.type?.startsWith('audio/')
          const isVideo = attachment.type?.startsWith('video/')
          const optimisticContent = isImage ? '[Image]' : isAudio ? '[Audio Voice Message]' : isVideo ? '[Video]' : '[Attachment]'
          
          addOptimisticMessage(conversationId, {
            id: tempId,
            sender_type: 'agent',
            sender_id: currentUser?.id ?? null,
            content: optimisticContent,
            content_type: getContentType(attachment.file),
            metadata: {
              media_url: attachment.previewUrl || attachment.url || '',
              filename: attachment.name,
              mimetype: attachment.type,
              ...(replyMeta ? { reply_to: replyMeta } : {})
            } as any,
            is_internal: isInternal,
            status: 'sending',
            created_at: new Date().toISOString()
          })
          
          try {
            let meta = {
              url: attachment.url || '',
              type: attachment.type || '',
              name: attachment.name || ''
            }
            
            // If the background upload is still active, wait for it!
            if (attachment.status === 'uploading') {
              const activePromise = activeUploadsRef.current[attachment.id]
              if (activePromise) {
                const res = await activePromise
                meta = {
                  url: res.url,
                  type: res.type,
                  name: res.name
                }
              }
            }
            
            let contentType = 'file'
            if (meta.type.startsWith('image/')) contentType = 'image'
            else if (meta.type.startsWith('audio/')) contentType = 'audio'
            else if (meta.type.startsWith('video/')) contentType = 'video'
            
            await replyToConversation(orgId, conversationId, optimisticContent, isInternal, contentType, {
              media_url: meta.url,
              mimetype: meta.type,
              filename: meta.name,
              ...(replyMeta ? { reply_to: replyMeta } : {})
            })
            markConfirmed(conversationId, tempId)
          } catch (error) {
            console.error(error)
            markFailed(conversationId, tempId)
          }
        })
      }
    } finally {
      setIsSending(false)
    }
  }
  const startRecording = async (isAutoTranscribe: boolean | any = false) => {
    const shouldAutoTranscribe = typeof isAutoTranscribe === 'boolean' ? isAutoTranscribe : false;
    autoTranscribeRef.current = shouldAutoTranscribe;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(VOICE_CONSTRAINTS)
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const actualMimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
          const extension = actualMimeType.includes('mp4') ? 'mp4' : 
                            actualMimeType.includes('ogg') ? 'ogg' :
                            actualMimeType.includes('wav') ? 'wav' : 'webm'
          const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType })
          const file = new File([audioBlob], `voice-message.${extension}`, { type: actualMimeType })
          const localUrl = URL.createObjectURL(audioBlob)
          
          if (autoTranscribeRef.current) {
            handleTranscribeAudio(file, true)
          } else {
            setStagedAudio({ url: localUrl, file })
          }
        }
        audioChunksRef.current = []
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
      setRecordingDuration(0)

      // Broadcast recording status to visitor widget
      if (conversationId) {
        supabase.channel(`typing:${orgId}`).send({
          type: 'broadcast',
          event: 'recordingStatus',
          payload: { conversation_id: conversationId, direction: 'agent', is_recording: true, agent_name: currentUser?.name, agent_id: currentUser?.id }
        });
      }

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      console.error("Error accessing microphone:", err)
      setCustomAlert({ title: 'Permission Denied', message: 'Microphone access is required to record audio.', type: 'error' })
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      if (timerRef.current) clearInterval(timerRef.current)
      setIsRecording(false)

      // Clear recording status broadcast
      if (conversationId) {
        supabase.channel(`typing:${orgId}`).send({
          type: 'broadcast',
          event: 'recordingStatus',
          payload: { conversation_id: conversationId, direction: 'agent', is_recording: false, agent_name: currentUser?.name, agent_id: currentUser?.id }
        });
      }
    }
  }

  const cancelRecording = () => {
    if (isRecording && mediaRecorderRef.current) {
      audioChunksRef.current = [] // clear chunks before stop so onstop won't stage it
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
    }
    if (timerRef.current) clearInterval(timerRef.current)
    setIsRecording(false)
    setRecordingDuration(0)
    setStagedAudio(null)
    audioChunksRef.current = []
    if (conversationId) {
      supabase.channel(`typing:${orgId}`).send({
        type: 'broadcast',
        event: 'recordingStatus',
        payload: { conversation_id: conversationId, direction: 'agent', is_recording: false, agent_name: currentUser?.name, agent_id: currentUser?.id }
      });
    }
  }

  const sendRecording = () => {
    if (!stagedAudio || !conversationId) return
    
    const { url, file } = stagedAudio;
    const tempId = "temp-" + crypto.randomUUID()
    
    addOptimisticMessage(conversationId, {
      id: tempId,
      sender_type: 'agent',
      sender_id: currentUser?.id ?? null,
      content: '[Audio Voice Message]',
      content_type: 'audio',
      metadata: { media_url: url },
      is_internal: isInternal,
      status: 'sending',
      created_at: new Date().toISOString()
    })
    
    try {
      uploadToStorage(file, false).then(async (meta) => {
        await replyToConversation(orgId, conversationId, '[Audio Voice Message]', isInternal, 'audio', {
          media_url: meta.url,
          mimetype: meta.type,
          filename: meta.name
        });
        removeOptimisticMessage(conversationId, tempId)
      }).catch(err => {
        console.error("Upload failed:", err);
        markFailed(conversationId, tempId)
        setCustomAlert({ title: 'Upload Failed', message: `Failed to send voice message: ${getErrorMessage(err)}`, type: 'error' })
      });
    } catch (err: unknown) {
      console.error("Upload failed:", err);
      markFailed(conversationId, tempId)
      setCustomAlert({ title: 'Upload Failed', message: `Failed to send voice message: ${getErrorMessage(err)}`, type: 'error' })
    }
    
    setStagedAudio(null)
  }

  const handleTranscribeAudio = async (fileToTranscribe?: File, isAuto: boolean = false) => {
    const file = fileToTranscribe || stagedAudio?.file;
    if (!file) return;
    
    if (isAuto) {
      setIsAiStreaming(true);
      setIsWaitingForTranscript(true);
    } else {
      setIsTranscribingAudio(true);
    }
    
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch('/api/ai/speech-to-text', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to transcribe audio");
      }

      const data = await res.json();
      if (data.transcript) {
        setIsWaitingForTranscript(false);
        if (!isAuto) cancelRecording();
        
        setIsAiStreaming(true);
        
        setInput(prev => {
          const prefix = prev.trim() ? prev + " " : "";
          return prefix;
        });
        
        let i = 0;
        const text = data.transcript;
        const streamInterval = setInterval(() => {
          setInput(prev => prev + text.charAt(i));
          i++;
          if (i >= text.length) {
            clearInterval(streamInterval);
            setIsAiStreaming(false);
          }
        }, 15);
      } else {
        throw new Error("No transcript returned");
      }
    } catch (err) {
      console.error("Transcription error:", err);
      setCustomAlert({ title: 'Transcription Failed', message: 'Could not convert audio to text.', type: 'error' });
      setIsAiStreaming(false);
      setIsWaitingForTranscript(false);
    } finally {
      if (!isAuto) {
        setIsTranscribingAudio(false);
      }
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const uploadWithProgress = (file: File, onProgress: (percent: number) => void): Promise<{ url: string; type: string; name: string }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append('file', file)

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100)
          onProgress(percent)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText)
            if (res.success) {
              resolve({ url: res.url, type: file.type, name: file.name })
            } else {
              reject(new Error(res.error || 'Upload failed'))
            }
          } catch (err) {
            reject(new Error('Invalid response from server'))
          }
        } else {
          reject(new Error(`Server returned status ${xhr.status}`))
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'))
      })

      xhr.open('POST', '/api/upload')
      xhr.send(formData)
    })
  }

  const uploadToStorage = async (file: File, showProgress = true) => {
    if (!conversationId) throw new Error("No conversation ID");
    
    if (showProgress) {
      setUploadFileName(file.name || "file")
      setUploadProgress(1) // Set starting percent to trigger progress UI instantly
    }
    
    try {
      const res = await uploadWithProgress(file, (percent) => {
        if (showProgress) {
          setUploadProgress(percent)
        }
      })
      return res
    } finally {
      if (showProgress) {
        // Add brief premium delay so the agent sees 100% completion state
        setTimeout(() => {
          setUploadProgress(0)
          setUploadFileName("")
        }, 600)
      }
    }
  }

  const uploadFileStaged = async (item: StagedAttachment) => {
    try {
      const uploadPromise = uploadWithProgress(item.file, (percent) => {
        setStagedAttachments(prev => prev.map(s => {
          if (s.id === item.id) {
            return { ...s, progress: percent };
          }
          return s;
        }));
      });
      
      activeUploadsRef.current[item.id] = uploadPromise;
      const res = await uploadPromise;
      
      setStagedAttachments(prev => prev.map(s => {
        if (s.id === item.id) {
          return { 
            ...s, 
            status: 'uploaded', 
            url: res.url, 
            type: res.type, 
            name: res.name, 
            progress: 100 
          };
        }
        return s;
      }));
    } catch (err) {
      console.error("Failed to upload staged file:", err);
      setStagedAttachments(prev => prev.map(s => {
        if (s.id === item.id) {
          return { ...s, status: 'failed', progress: 0 };
        }
        return s;
      }));
    }
  }

  const stageAttachments = (files: File[]) => {
    setStagedAttachments(prev => {
      const incoming = files.slice(0, 5 - prev.length);
      if (incoming.length === 0) return prev;

      const newStaged = incoming.map(file => {
        const id = crypto.randomUUID();
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        const previewUrl = (isImage || isVideo) ? URL.createObjectURL(file) : null;
        
        const item: StagedAttachment = {
          file,
          id,
          previewUrl,
          progress: 1, // start at 1% for active feedback
          status: 'uploading',
          type: file.type,
          name: file.name
        };

        // Fire background upload immediately
        uploadFileStaged(item);

        return item;
      });

      return [...prev, ...newStaged];
    });
  }

  const removeAttachment = (index: number) => {
    setStagedAttachments(prev => {
      const copy = [...prev];
      const removed = copy.splice(index, 1)[0];
      if (removed && removed.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return copy;
    });
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    stageAttachments(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }


  if (!isLoaded) {
    return (
      <div className="flex-1 flex flex-col h-full relative bg-white border-r border-slate-200 z-10 overflow-hidden">
        {/* Skeleton Header */}
        <div className="h-12 border-b border-slate-100 px-4 flex items-center gap-4 bg-white shrink-0">
          <div className="w-10 h-10 rounded-full bg-slate-100/80 animate-pulse shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-slate-100 rounded-md w-40 animate-pulse" />
            <div className="h-2.5 bg-slate-50 rounded-md w-24 animate-pulse" />
          </div>
        </div>
        
        {/* Skeleton Messages */}
        <div className="flex-1 p-6 space-y-6 bg-[#f8fafc] overflow-y-auto">
          {/* Incoming message: Greeting */}
          <div className="flex gap-3 max-w-[70%] animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-10 bg-slate-100 rounded-2xl rounded-tl-sm w-[60%]" />
            </div>
          </div>
          
          {/* Outgoing message: Response */}
          <div className="flex gap-3 max-w-[70%] ml-auto justify-end animate-pulse">
            <div className="space-y-1.5 flex-1 flex flex-col items-end">
              <div className="h-12 bg-blue-100/40 rounded-2xl rounded-tr-sm w-[80%]" />
            </div>
          </div>

          {/* Incoming message: Double consecutive text */}
          <div className="flex gap-3 max-w-[70%] animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-8 bg-slate-100 rounded-2xl rounded-tl-sm w-[45%]" />
              <div className="h-16 bg-slate-100 rounded-2xl w-[90%]" />
            </div>
          </div>

          {/* Outgoing message: Media preview placeholder */}
          <div className="flex gap-3 max-w-[70%] ml-auto justify-end animate-pulse">
            <div className="space-y-2 flex-1 flex flex-col items-end">
              {/* Box styling mimicking an image attachment */}
              <div className="h-32 w-52 bg-blue-100/30 rounded-2xl rounded-tr-sm flex items-center justify-center border border-blue-100/50">
                <svg className="w-8 h-8 text-blue-300/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Incoming message: Audio voice message mock */}
          <div className="flex gap-3 max-w-[70%] animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-11 bg-slate-100 rounded-2xl rounded-tl-sm w-[75%] flex items-center px-4 gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-200/80 shrink-0" />
                <div className="flex-1 flex gap-1 items-center h-2">
                  <div className="h-full bg-slate-200 w-full rounded" />
                  <div className="h-full bg-slate-200 w-3/4 rounded" />
                  <div className="h-full bg-slate-200 w-1/2 rounded" />
                  <div className="h-full bg-slate-200 w-full rounded" />
                  <div className="h-full bg-slate-200 w-2/3 rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Skeleton Input */}
        <div className="p-4 bg-white border-t border-slate-100 shrink-0">
          <div className="h-12 bg-slate-50 rounded-xl w-full border border-slate-100 animate-pulse" />
        </div>
      </div>
    )
  }

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white border-r border-slate-200 z-10">
        <p className="text-slate-500 font-medium">Select a conversation to start chatting</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full relative bg-[#F9FAFB] dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-10 overflow-hidden">
      {/* Header */}
      <div className="h-12 border-b border-slate-200/80 dark:border-[#222e35] flex justify-between items-center px-4 bg-white/95 backdrop-blur-md dark:bg-[#202c33] shrink-0 z-40 sticky top-0 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Mobile back button */}
          {onBackToList && (
            <button 
              onClick={onBackToList}
              className="md:hidden p-1.5 -ml-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
            >
              <ArrowLeft size={20} strokeWidth={2} />
            </button>
          )}
          <div className="flex items-center gap-2 group">
            {isEditingName ? (
              <div className="flex items-center gap-1.5">
                <input 
                  type="text" 
                  value={editedName} 
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-[16px] font-medium text-slate-900 dark:text-[#e9edef] border border-slate-300 dark:border-[#2a3942] rounded px-1.5 py-0.5 bg-white dark:bg-[#202c33] focus:outline-none focus:border-blue-500 w-[150px] md:w-[250px]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName()
                    if (e.key === 'Escape') {
                      setIsEditingName(false)
                      setEditedName(contactName)
                    }
                  }}
                />
                <button onClick={handleSaveName} className="text-emerald-600 hover:text-emerald-700 p-1"><Check size={16} strokeWidth={2.5} /></button>
                <button onClick={() => { setIsEditingName(false); setEditedName(contactName) }} className="text-slate-400 hover:text-slate-600 p-1"><X size={16} strokeWidth={2.5} /></button>
              </div>
            ) : (
              <div className="flex flex-col justify-center min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-medium text-[16px] text-slate-900 dark:text-[#e9edef] flex items-center gap-2 truncate">
                    {contactName}
                    {isCustomerOnline && (
                      <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)] shrink-0" title="Online now"></div>
                    )}
                  </h2>
                  <button 
                    onClick={() => setIsEditingName(true)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-600 shrink-0"
                    title="Edit Contact Name"
                  >
                    <Pencil size={14} strokeWidth={2.5} />
                  </button>
                </div>
                

              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 relative" ref={menuRef}>
          {isJoined ? (
            <button 
              onClick={() => handleThreadAction('leave')}
              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="Leave thread"
            >
              <LogOut size={18} strokeWidth={2} />
            </button>
          ) : null}

          {onToggleRightSidebar && (
            <button 
              onClick={onToggleRightSidebar}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-[#2a3942] rounded-md transition-colors"
              title={isRightSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
            >
              {isRightSidebarOpen ? <PanelRightClose size={18} strokeWidth={2} /> : <PanelRightOpen size={18} strokeWidth={2} />}
            </button>
          )}

          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-[#2a3942] rounded-md transition-colors"
          >
            <MoreVertical size={18} strokeWidth={2} />
          </button>


          
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg py-1 z-50">
              <button onClick={() => handleThreadAction('pin')} className="w-full text-left px-4 py-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2">
                <Pin size={14} className="opacity-50" /> {conversation?.is_pinned ? 'Unpin thread' : 'Pin thread'}
              </button>
              <button onClick={() => handleThreadAction('unread')} className="w-full text-left px-4 py-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2">
                <Mail size={14} className="opacity-50" /> {conversation?.is_unread ? 'Mark as read' : 'Mark as unread'}
              </button>
              <button onClick={() => handleThreadAction('mute')} className="w-full text-left px-4 py-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2">
                <BellOff size={14} className="opacity-50" /> {conversation?.is_muted ? 'Unmute' : 'Mute'}
              </button>
              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>
              <button 
                onClick={() => handleThreadAction('convert')} 
                disabled={isConverting}
                className="w-full text-left px-4 py-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 disabled:opacity-50"
              >
                {isConverting ? (
                  <Loader2 size={14} className="animate-spin shrink-0" />
                ) : (
                  <Database size={14} className="opacity-50 shrink-0" />
                )}
                Convert to Ticket
              </button>
              <button onClick={() => handleThreadAction('archive')} className="w-full text-left px-4 py-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2">
                <Archive size={14} className="opacity-50" /> {conversation?.is_archived ? 'Unarchive' : 'Archive'}
              </button>
              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>
              <button onClick={() => handleThreadAction('delete')} className="w-full text-left px-4 py-2 text-[13px] text-red-600 dark:red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 font-medium">
                <Trash2 size={14} className="opacity-70" /> Remove thread
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Background ticket conversion indicator */}
      {isConverting && (
        <div className="absolute top-[72px] left-0 right-0 h-1 bg-blue-50/50 dark:bg-slate-800/30 overflow-hidden z-50">
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes progress-slide {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(250%); }
            }
          `}} />
          <div 
            className="h-full bg-blue-600 dark:bg-[#0070f3] rounded-full" 
            style={{ 
              width: '40%', 
              animation: 'progress-slide 1.8s infinite ease-in-out' 
            }} 
          />
        </div>
      )}

      {/* Incoming Call Agent Dialog */}
      {callStatus === 'ringing' && incomingCall && (
        <div className="absolute top-[80px] left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 animate-in slide-in-from-top-6 duration-300">
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800 rounded-3xl shadow-2xl p-5 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/50 text-[#0070f3] rounded-full flex items-center justify-center mb-3 animate-bounce">
              <Phone size={22} strokeWidth={2.5} />
            </div>
            <h3 className="text-[15px] font-bold text-slate-800 dark:text-white">Incoming Voice Call</h3>
            <p className="text-[12px] text-slate-500 mt-1 leading-normal mb-5">
              Visitor <span className="font-semibold text-[#0070f3]">{callerName || contactName}</span> is calling...
            </p>
            <div className="flex gap-2 w-full">
              <button 
                onClick={handleDeclineVoiceCall}
                className="flex-1 py-2.5 text-[12.5px] font-semibold text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                Decline
              </button>
              <button 
                onClick={handleMuteRingtone}
                disabled={isRingtoneMuted}
                className={`px-3 py-2.5 text-[12.5px] font-semibold rounded-xl transition-all ${
                  isRingtoneMuted 
                    ? 'text-slate-400 bg-slate-100 cursor-not-allowed dark:bg-slate-800/40 dark:text-slate-500'
                    : 'text-amber-600 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:text-amber-400 cursor-pointer active:scale-95'
                }`}
                title={isRingtoneMuted ? 'Ringtone Muted' : 'Mute Ringtone'}
              >
                {isRingtoneMuted ? 'Muted' : 'Mute'}
              </button>
              <button 
                onClick={handleAnswerVoiceCall}
                className="flex-1 py-2.5 text-[12.5px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                Receive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active/Calling Call Panel Overlay for Agent */}
      {(callStatus === 'active' || callStatus === 'calling') && (
        <div className="bg-slate-900 border-b border-slate-850 px-4 py-3 flex items-center justify-between text-white shrink-0 z-30 animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2.5">
            {callStatus === 'calling' ? (
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
            ) : (
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
            )}
            <div className="flex flex-col">
              <span className="text-[12.5px] font-bold text-white tracking-tight">
                {callStatus === 'calling' ? `Calling ${callerName || contactName}...` : `Active Voice Call with ${callerName || contactName}`}
              </span>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                {callStatus === 'calling' ? 'Ringing' : formatCallDuration(callDuration)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {callStatus === 'active' && (
              <button 
                onClick={toggleMuteVoiceCall}
                className={`p-2 rounded-xl transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l6.02 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.34 3 3 3 .74 0 1.43-.16 2.05-.43l2.67 2.67c-1.18.9-2.67 1.43-4.32 1.43-3.66 0-6.62-2.96-6.62-6.62H4c0 4.08 3.05 7.47 7 7.93V22h2v-3.07c1.7-.2 3.28-.85 4.6-1.85L19.73 21 21 19.73 4.27 3z"/></svg>
                ) : (
                  <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3h-1.8c0 2.27-1.84 4.1-4.11 4.1S7.89 13.27 7.89 11H6.09c0 2.93 2.3 5.37 5.21 5.8v2.9c0 .17.14.3.31.3h.8c.17 0 .31-.13.31-.3v-2.9c2.91-.43 5.21-2.87 5.21-5.8z"/></svg>
                )}
              </button>
            )}
            <button 
              onClick={() => handleEndVoiceCall(true)}
              disabled={callStatus === 'active' && !canHangUpVoice}
              className={`font-bold text-[11px] px-3.5 py-2 rounded-xl transition-all uppercase tracking-wide shadow-sm flex items-center gap-1.5 ${
                callStatus === 'active' && !canHangUpVoice 
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-inner'
                  : 'bg-red-500 hover:bg-red-600 active:scale-95 text-white cursor-pointer'
              }`}
            >
              {callStatus === 'calling' ? 'Cancel' : (callStatus === 'active' && !canHangUpVoice) ? (
                <>
                  <Loader2 size={12} className="animate-spin text-slate-500" />
                  Connecting...
                </>
              ) : (
                "Hang Up"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-white dark:bg-[#0b141a]">
        
        {messages.length >= 50 && hasMoreMessages && (
          <div className="flex justify-center mb-6">
            <button 
              onClick={loadMoreMessages}
              disabled={isLoadingMore}
              className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full text-[12px] font-medium transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? "Loading..." : "Load previous messages"}
            </button>
          </div>
        )}
        
        {allMessages.length === 0 && !isCustomerTyping && (
          isFetching ? (
            <div className="flex-1 flex flex-col gap-3 p-6 mt-4 animate-pulse">
              <div className="flex justify-start"><div className="h-8 w-48 bg-slate-100 dark:bg-slate-800 rounded-2xl" /></div>
              <div className="flex justify-end"><div className="h-8 w-36 bg-blue-50 dark:bg-blue-900/20 rounded-2xl" /></div>
              <div className="flex justify-start"><div className="h-8 w-56 bg-slate-100 dark:bg-slate-800 rounded-2xl" /></div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-70 mt-10">
              <MessageSquare size={32} className="text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium text-[14px]">No messages yet</p>
              <p className="text-slate-400 text-[13px] mt-1">Send a message to start the conversation.</p>
            </div>
          )
        )}

        {allMessages.map((msg, idx) => {
          const prevMsg = idx > 0 ? allMessages[idx - 1] : null;
          const nextMsg = idx < allMessages.length - 1 ? allMessages[idx + 1] : null;

          const canGroup = (m1: any, m2: any) => {
            if (!m1 || !m2) return false;
            if (m1.sender_type === 'system' || m2.sender_type === 'system') return false;
            if (m1.content_type === 'system' || m2.content_type === 'system') return false;
            if (m1.content === 'Visitor continued conversation on WhatsApp' || m2.content === 'Visitor continued conversation on WhatsApp') return false;
            if (m1.content === 'Started a voice call' || m2.content === 'Started a voice call') return false;
            if (m1.content?.toLowerCase().includes("voice call") || m2.content?.toLowerCase().includes("voice call")) return false;
            if (m1.sender_type !== m2.sender_type) return false;
            if (m1.sender_type === 'agent' && m1.sender_id !== m2.sender_id) return false;
            
            const meta1 = typeof m1.metadata === 'string' ? (() => { try { return JSON.parse(m1.metadata) } catch(e) { return {} } })() : (m1.metadata || {});
            const meta2 = typeof m2.metadata === 'string' ? (() => { try { return JSON.parse(m2.metadata) } catch(e) { return {} } })() : (m2.metadata || {});
            
            if (meta1.participant_name !== meta2.participant_name) return false;
            if (!!m1.is_internal !== !!m2.is_internal) return false;
            
            const t1 = new Date(m1.created_at || new Date()).getTime();
            const t2 = new Date(m2.created_at || new Date()).getTime();
            return Math.abs(t2 - t1) < 5 * 60 * 1000;
          };

          const isGroupedWithPrev = canGroup(prevMsg, msg);
          const isGroupedWithNext = canGroup(msg, nextMsg);

          const safeMeta = typeof msg.metadata === 'string' 
            ? (() => { try { return JSON.parse(msg.metadata) } catch(e) { return {} } })() 
            : (msg.metadata || {});

          const isHandoff = msg.content === 'Visitor continued conversation on WhatsApp' || safeMeta.handoff === 'whatsapp';

          if (isHandoff) {
            const msgTime = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            return (
              <div key={msg.id || idx} className="flex justify-center my-3 select-none animate-in fade-in duration-300">
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 px-3 py-1  rounded-full text-slate-500 dark:text-slate-400 shadow-sm">
                  <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
                  </svg>
                  <span className="text-[11.5px] font-medium tracking-tight">Continued on WhatsApp</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1 font-normal">{msgTime}</span>
                </div>
              </div>
            );
          }
          
          const mediaUrl = (safeMeta.media_url || safeMeta.url) as string;
          // System messages: render as centered event label
          if (msg.sender_type === 'system' || msg.content_type === 'system') {
            const msgTime = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const agent = msg.sender_id ? teamMembers.find(t => t.id === msg.sender_id) : null;
            
            if (agent && msg.content.includes('joined')) {
              return (
                <div key={msg.id || idx} className="flex justify-center my-5">
                  <div className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 px-3 py-1.5 rounded-full shadow-sm">
                    <div className="w-5 h-5 rounded-full bg-slate-200 shrink-0 overflow-hidden flex items-center justify-center">
                      {agent.avatar_url ? (
                        <img src={agent.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-bold text-slate-600">{agent.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <span className="text-[12px] text-slate-700 dark:text-slate-300 font-medium">
                      {msg.content.replace('the conversation', 'the chat')}
                    </span>
                    <span className="text-[10.5px] text-slate-400 ml-1">{msgTime}</span>
                  </div>
                </div>
              )
            }

            if (msg.content === "Your ticket is created" || msg.content.includes("ticket is created")) {
              return (
                <div key={msg.id || idx} className="flex justify-center my-5">
                  <div className="flex items-center gap-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 px-3 py-1.5 rounded-full shadow-sm">
                    <span className="text-[12px] text-blue-700 dark:text-blue-300 font-semibold">
                      {msg.content}
                    </span>
                    <span className="text-[10.5px] text-blue-400 dark:text-blue-500/70 ml-1">{msgTime}</span>
                  </div>
                </div>
              )
            }

            if (agent && msg.content.includes('left')) {
              return (
                <div key={msg.id || idx} className="flex justify-center my-5">
                  <div className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-full shadow-sm">
                    <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0 overflow-hidden flex items-center justify-center">
                      {agent.avatar_url ? (
                        <img src={agent.avatar_url} alt="" className="w-full h-full object-cover opacity-80" />
                      ) : (
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{agent.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <span className="text-[12px] text-slate-500 dark:text-slate-400 font-medium">
                      {msg.content.replace('the conversation', 'the chat')}
                    </span>
                    <span className="text-[10.5px] text-slate-400 dark:text-slate-500/70 ml-1">{msgTime}</span>
                  </div>
                </div>
              )
            }

            if (safeMeta?.event === 'page_view' || msg.content.startsWith('Viewed:')) return null;

            if (msg.content === 'Started a voice call') return null;

            if (msg.content.toLowerCase().includes("voice call")) {
              if (msg.content === 'Voice call ended' && !safeMeta.duration) return null;
              
              const isMissed = msg.content.includes("Missed");
              const agent = msg.sender_id ? teamMembers.find(t => t.id === msg.sender_id) : null;
              return (
                <VoiceCallWidget
                  key={msg.id || idx}
                  msg={msg}
                  isMissed={isMissed}
                  agent={agent}
                  safeMeta={safeMeta}
                  msgTime={msgTime}
                />
              )
            }

            return (
              <div key={msg.id || idx} className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium px-2 shrink-0">
                  {msg.content}
                </span>
                <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
              </div>
            )
          }

          const isAgent = msg.sender_type === 'agent' || msg.sender_type === 'ai'
          const msgTime = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          
          if (isAgent) {
            // Find agent details from teamMembers
            let agent = msg.sender_id ? teamMembers.find(t => t.id === msg.sender_id) : null;
            
            // Fallback for messages sent from phone/webhook (null sender_id)
            if (!agent && msg.sender_type !== 'ai') {
              agent = currentUser ? teamMembers.find(t => t.id === currentUser.id) : teamMembers[0];
            }
            
            let agentName = agent?.name || "Hostnin Support";
            let agentInitial = agentName.charAt(0).toUpperCase();
            let agentAvatar = agent?.avatar_url;

            if (msg.sender_type === 'ai') {
              agentName = "Nina";
              agentInitial = "N";
              agentAvatar = "/team/h.jpg";
            }

            return (
              <div id={`msg-${msg.id}`} key={msg.id || idx} className={`flex flex-col items-end ${isGroupedWithNext ? 'mb-1' : 'mb-4'} ${msg.is_internal && !isGroupedWithPrev ? 'mt-2' : ''}`}>
                {/* Agent Name Banner */}
                {!isGroupedWithPrev && (
                  <div className="text-[11px] text-slate-500 mr-9 mb-0.5">{agentName}</div>
                )}
                
                <div className="flex items-end justify-end gap-2 max-w-[75%] min-w-0 relative group">
                  {/* Reply Button on Hover */}
                  <button 
                    onClick={() => setReplyToMessage(msg)}
                    className="opacity-0 group-hover:opacity-100 transition-all duration-150 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0 mb-1"
                    title="Reply"
                  >
                    <CornerUpLeft size={15} strokeWidth={2.5} />
                  </button>

                    <div 
                      onContextMenu={(e) => handleContextMenu(e, msg)}
                      className={`${
                        (msg.status === 'recalled' || msg.status === 'deleted')
                          ? 'bg-slate-100/60 dark:bg-[#202c33]/40 text-slate-400 dark:text-[#8696a0] border border-dashed border-slate-200 dark:border-[#222e35]/60 px-4 py-2.5 rounded-2xl rounded-br-sm text-[13.5px] italic flex items-center gap-1.5 select-none min-w-0'
                          : msg.is_internal 
                            ? msg.sender_id === currentUser?.id
                              ? 'bg-amber-100/90 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-800/50 px-4 py-2.5 shadow-sm rounded-2xl rounded-br-sm text-[14px] leading-relaxed whitespace-pre-wrap break-words font-normal min-w-0' 
                              : 'bg-yellow-50/80 dark:bg-yellow-950/25 text-yellow-800 dark:text-yellow-200 border border-yellow-200/50 dark:border-yellow-900/20 px-4 py-2.5 shadow-sm rounded-2xl rounded-br-sm text-[14px] leading-relaxed whitespace-pre-wrap break-words font-normal min-w-0'
                            : msg.content_type === 'audio' 
                              ? 'bg-transparent text-slate-900 dark:text-[#e9edef] p-0 shadow-none rounded-2xl rounded-br-sm text-[14px] leading-relaxed whitespace-pre-wrap break-words font-normal min-w-0' 
                              : 'bg-[#0070f3] dark:bg-[#005c4b] text-white dark:text-[#e9edef] px-4 py-2.5 rounded-2xl rounded-br-sm text-[14px] leading-relaxed whitespace-pre-wrap break-words font-normal min-w-0'
                      }`}
                    >
                      {(msg.status === 'recalled' || msg.status === 'deleted') ? (
                        <>
                          <Ban size={13} className="opacity-60 shrink-0" />
                          <span>This message was recalled</span>
                        </>
                      ) : (
                        <>
                          {/* Render Reply Preview if present */}
                          {(() => {
                            const replyTo = safeMeta.reply_to;
                            if (!replyTo) return null;
                            return (
                              <div 
                                onClick={() => {
                                  const element = document.getElementById(`msg-${replyTo.message_id}`);
                                  if (element) {
                                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    element.classList.add('bg-blue-50/50', 'dark:bg-blue-950/20', 'ring-2', 'ring-blue-400/50', 'transition-all', 'duration-500');
                                    setTimeout(() => {
                                      element.classList.remove('bg-blue-50/50', 'dark:bg-blue-950/20', 'ring-2', 'ring-blue-400/50');
                                    }, 2000);
                                  }
                                }}
                                className="mb-2 p-2 bg-black/10 dark:bg-white/10 border-l-[3px] border-white rounded-r-md text-left cursor-pointer hover:bg-black/20 dark:hover:bg-white/20 transition-colors max-w-full select-none"
                              >
                                <div className="text-[11px] font-bold text-white/90 truncate">
                                  {replyTo.sender_name}
                                </div>
                                <div className="text-[12.5px] text-white/80 truncate leading-relaxed">
                                  {replyTo.content_type === 'image' ? 'Image' : replyTo.content_type === 'video' ? 'Video' : replyTo.content_type === 'audio' ? 'Voice message' : replyTo.content}
                                </div>
                              </div>
                            );
                          })()}
                          {msg.content_type === 'image' && (mediaUrl) ? (
                            <div className="mb-2">
                              <div className="w-[240px] max-w-full">
                                <SafeImage 
                                  src={(mediaUrl) as string} 
                                  alt="Attachment" 
                                  className="w-full h-auto cursor-pointer hover:opacity-90 transition-opacity rounded-xl"
                                  onClick={() => setZoomedImage((mediaUrl) as string)}
                                />
                              </div>
                              {msg.content !== '[Attachment]' && msg.content !== '[Image]' && <div className="mt-1">{renderTextWithLinks(msg.content, true, teamMembers, safeMeta?.mentions)}</div>}
                            </div>
                          ) : msg.content_type === 'file' && (mediaUrl) ? (
                            <a href={(mediaUrl) as string} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-black/10 dark:bg-white/10 rounded-lg hover:bg-black/20 transition mb-1">
                              <Paperclip size={16} />
                              <span className="text-[13px] underline truncate max-w-[180px]">{safeMeta.filename || 'Download File'}</span>
                            </a>
                          ) : msg.content_type === 'audio' && (mediaUrl) ? (
                            <div className="flex flex-col gap-1">
                              <CustomAudioPlayer url={(mediaUrl || mediaUrl) as string} type={msg.is_internal ? 'internal' : 'agent'} messageId={msg.id} transcript={(msg.metadata as any)?.transcript} />
                              {msg.content !== '[Audio Voice Message]' && !msg.content.startsWith('[Audio]') && <div className="mt-1">{renderTextWithLinks(msg.content, true, teamMembers, safeMeta?.mentions)}</div>}
                            </div>
                          ) : msg.content_type === 'video' && (mediaUrl) ? (
                            <div className="mb-2">
                              <video controls className="max-w-[240px] rounded-lg border border-slate-100 dark:border-slate-700 bg-black">
                                <source src={(mediaUrl) as string} type={safeMeta.mimetype || 'video/mp4'} />
                                Your browser does not support the video tag.
                              </video>
                              {msg.content !== '[Video]' && <div className="mt-1">{renderTextWithLinks(msg.content, true, teamMembers, safeMeta?.mentions)}</div>}
                            </div>
                          ) : (
                            <div>{renderTextWithLinks(msg.content, true, teamMembers, safeMeta?.mentions)}</div>
                          )}
                        </>
                      )}
                    </div>
                  
                  {/* Agent Avatar */}
                  {!isGroupedWithNext ? (
                    <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-slate-200 text-slate-700 text-[11px] font-bold overflow-hidden">
                      {agentAvatar ? (
                        <img src={agentAvatar} alt={agentName} className="w-full h-full object-cover" />
                      ) : (
                        agentInitial
                      )}
                    </div>
                  ) : (
                    <div className="w-7 shrink-0"></div>
                  )}
                </div>
                
                {/* Time and Status (OUTSIDE the bubble and avatar stack) */}
                <div className={`flex justify-end items-center gap-1 mt-1 mr-9 ${isGroupedWithNext ? 'opacity-0 h-0 overflow-hidden' : ''}`}>
                  <span className="text-[11px] text-slate-400">{msgTime}</span>
                  {!msg.is_internal && (
                    <>
                      {msg.status === 'sending' ? (
                        <Check size={14} className="text-slate-400" />
                      ) : msg.status === 'failed' ? (
                        <span 
                          className="text-[10px] text-red-500 cursor-pointer hover:text-red-600 underline ml-1"
                          onClick={() => {
                            if (conversationId) removeOptimisticMessage(conversationId, msg.id)
                          }}
                          title="Failed - click to dismiss"
                        >
                          Failed
                        </span>
                      ) : msg.status === 'read' ? (
                        <CheckCheck size={14} className="text-blue-500" />
                      ) : msg.status === 'delivered' ? (
                        <CheckCheck size={14} className="text-slate-400" />
                      ) : (
                        <Check size={14} className="text-slate-400" />
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          } else {
            return (
              <div id={`msg-${msg.id}`} key={msg.id || idx} className={`flex flex-col ${isGroupedWithNext ? 'mb-1' : 'mb-4'} transition-all duration-300 rounded-xl`}>
                <div className="flex items-end gap-2.5 relative group">
                  {/* Customer / Participant Avatar */}
                  {!isGroupedWithNext ? (
                    msg.metadata?.participant_avatar ? (
                      <img 
                        src={msg.metadata.participant_avatar} 
                        alt={safeMeta.participant_name || contactName}
                        className="w-8 h-8 rounded-full object-cover shrink-0 mb-1"
                      />
                    ) : ((contact?.avatar_url) && !(contact?.platform_id?.endsWith('@g.us'))) ? (
                      <img 
                        src={contact.avatar_url} 
                        alt={contactName}
                        className="w-8 h-8 rounded-full object-cover shrink-0 mb-1 bg-slate-100"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <img 
                        src={`https://ui-avatars.com/api/?name=${encodeURIComponent(safeMeta.participant_name || contactName)}&background=random&color=fff&length=1`} 
                        alt={safeMeta.participant_name || contactName}
                        className="w-8 h-8 rounded-full object-cover shrink-0 mb-1 bg-slate-100 dark:bg-slate-800"
                      />
                    )
                  ) : (
                    <div className="w-8 shrink-0"></div>
                  )}
                  <div className="max-w-[75%] min-w-0 flex flex-col items-start gap-1">
                    {/* Participant Name Banner for Group Chats */}
                    {!isGroupedWithPrev && safeMeta.participant_name && (
                      <div className="text-[11px] text-slate-500 mb-0.5">{safeMeta.participant_name}</div>
                    )}
                    <div 
                      onContextMenu={(e) => handleContextMenu(e, msg)}
                      className={`${
                        (msg.status === 'recalled' || msg.status === 'deleted')
                          ? 'bg-slate-100/60 dark:bg-[#202c33]/40 text-slate-400 dark:text-[#8696a0] border border-dashed border-slate-200 dark:border-[#222e35]/60 px-4 py-2.5 rounded-2xl rounded-bl-sm text-[13.5px] italic flex items-center gap-1.5 select-none min-w-0 cursor-context-menu'
                          : msg.content_type === 'audio' 
                            ? 'bg-transparent text-slate-900 dark:text-[#e9edef] p-0 shadow-none rounded-2xl rounded-bl-sm text-[14px] leading-relaxed whitespace-pre-wrap break-words font-normal min-w-0 cursor-context-menu' 
                            : 'bg-slate-100 dark:bg-[#202c33] px-4 py-2.5 text-slate-900 dark:text-[#e9edef] rounded-2xl rounded-bl-sm text-[14px] leading-relaxed whitespace-pre-wrap break-words font-normal min-w-0 cursor-context-menu'
                      }`}
                    >
                      {(msg.status === 'recalled' || msg.status === 'deleted') ? (
                        <>
                          <Ban size={13} className="opacity-60 shrink-0" />
                          <span>This message was recalled</span>
                        </>
                      ) : (
                        <>
                          {/* Render Reply Preview if present */}
                          {(() => {
                            const replyTo = safeMeta.reply_to;
                            if (!replyTo) return null;
                            return (
                              <div 
                                onClick={() => {
                                  const element = document.getElementById(`msg-${replyTo.message_id}`);
                                  if (element) {
                                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    element.classList.add('bg-blue-50/50', 'dark:bg-blue-950/20', 'ring-2', 'ring-blue-400/50', 'transition-all', 'duration-500');
                                    setTimeout(() => {
                                      element.classList.remove('bg-blue-50/50', 'dark:bg-blue-950/20', 'ring-2', 'ring-blue-400/50');
                                    }, 2000);
                                  }
                                }}
                                className="mb-2 p-2 bg-black/5 dark:bg-white/5 border-l-[3px] border-[#0070f3] dark:border-[#00a884] rounded-r-md text-left cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors max-w-full select-none"
                              >
                                <div className="text-[11px] font-bold text-[#0070f3] dark:text-blue-400 truncate">
                                  {replyTo.sender_name}
                                </div>
                                <div className="text-[12.5px] text-slate-650 dark:text-slate-300 truncate leading-relaxed">
                                  {replyTo.content_type === 'image' ? 'Image' : replyTo.content_type === 'video' ? 'Video' : replyTo.content_type === 'audio' ? 'Voice message' : replyTo.content}
                                </div>
                              </div>
                            );
                          })()}
                          {msg.content_type === 'image' && (mediaUrl) ? (
                            <div className="mb-2">
                              <div className="w-[240px] max-w-full">
                                <SafeImage 
                                  src={(mediaUrl) as string} 
                                  alt="Attachment" 
                                  className="w-full h-auto cursor-pointer hover:opacity-90 transition-opacity rounded-xl"
                                  onClick={() => setZoomedImage((mediaUrl) as string)}
                                />
                              </div>
                              {msg.content !== '[Attachment]' && msg.content !== '[Image]' && <div className="mt-1">{renderTextWithLinks(msg.content, false, teamMembers, safeMeta?.mentions)}</div>}
                            </div>
                          ) : msg.content_type === 'file' && (mediaUrl) ? (
                            <a href={(mediaUrl) as string} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-lg hover:bg-black/10 transition mb-1">
                              <Paperclip size={16} />
                              <span className="text-[13px] underline truncate max-w-[180px]">{safeMeta.filename || 'Download File'}</span>
                            </a>
                          ) : msg.content_type === 'audio' && (mediaUrl) ? (
                            <div className="flex flex-col gap-1">
                              <CustomAudioPlayer url={(mediaUrl || mediaUrl) as string} type="customer" messageId={msg.id} transcript={(msg.metadata as any)?.transcript} />
                              {msg.content !== '[Audio Voice Message]' && !msg.content.startsWith('[Audio]') && <div className="mt-1">{renderTextWithLinks(msg.content, false, teamMembers, safeMeta?.mentions)}</div>}
                            </div>
                          ) : msg.content_type === 'video' && (mediaUrl) ? (
                            <div className="mb-2">
                              <video controls className="max-w-[240px] rounded-lg border border-slate-200 dark:border-slate-700 bg-black">
                                <source src={(mediaUrl) as string} type={safeMeta.mimetype || 'video/mp4'} />
                                Your browser does not support the video tag.
                              </video>
                              {msg.content !== '[Video]' && <div className="mt-1">{renderTextWithLinks(msg.content, false, teamMembers, safeMeta?.mentions)}</div>}
                            </div>
                          ) : (
                            <div>{renderTextWithLinks(msg.content, false, teamMembers, safeMeta?.mentions)}</div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Reply Button on Hover */}
                  <button 
                    onClick={() => setReplyToMessage(msg)}
                    className="opacity-0 group-hover:opacity-100 transition-all duration-150 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0 mb-1 align-bottom self-end"
                    title="Reply"
                  >
                    <CornerUpLeft size={15} strokeWidth={2.5} />
                  </button>
                </div>
                
                {/* Time (OUTSIDE the bubble and avatar stack) */}
                <div className={`flex items-center gap-1 mt-1 ml-11 ${isGroupedWithNext ? 'opacity-0 h-0 overflow-hidden' : ''}`}>
                  <span className="text-[11px] text-slate-400">{msgTime}</span>
                </div>
              </div>
            )
          }
        })}
        


        {isCustomerTyping && (
          <div className="flex flex-col mb-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-end gap-2.5">
              {contact?.avatar_url && !(contact?.platform_id?.endsWith('@g.us')) ? (
                <img src={contact.avatar_url} alt={contactName} className="w-8 h-8 rounded-full object-cover shrink-0 mb-1 bg-slate-100 dark:bg-slate-800" />
              ) : (
                <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(contactName)}&background=random&color=fff&length=1`} alt={contactName} className="w-8 h-8 rounded-full object-cover shrink-0 mb-1 bg-slate-100 dark:bg-slate-800" />
              )}
              <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-3 max-w-[70%]">
                <div className="flex gap-1.5 items-center h-4">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </div>
              </div>
            </div>
          </div>
        )}

        {isCustomerRecording && !isCustomerTyping && (
          <div className="flex flex-col mb-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-end gap-2.5">
              {contact?.avatar_url && !(contact?.platform_id?.endsWith('@g.us')) ? (
                <img src={contact.avatar_url} alt={contactName} className="w-8 h-8 rounded-full object-cover shrink-0 mb-1 bg-slate-100 dark:bg-slate-800" />
              ) : (
                <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(contactName)}&background=random&color=fff&length=1`} alt={contactName} className="w-8 h-8 rounded-full object-cover shrink-0 mb-1 bg-slate-100 dark:bg-slate-800" />
              )}
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-100/50 dark:border-red-900/30 rounded-2xl px-4 py-2.5 max-w-[70%] flex items-center gap-2.5">
                <div className="relative flex items-center justify-center w-5 h-5">
                  <div className="absolute inset-0 rounded-full bg-red-500/15 animate-ping" style={{ animationDuration: '1.5s' }} />
                  <svg className="w-3.5 h-3.5 text-red-500 relative z-10" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                </div>
                <span className="text-[12.5px] font-medium text-slate-600 dark:text-slate-300">Recording a voice message...</span>
                <div className="flex items-end gap-[3px] h-4 ml-0.5">
                  <span className="w-[3px] rounded-full bg-red-400" style={{ animation: 'tf-soundbar 0.8s ease-in-out infinite', height: '40%' }} />
                  <span className="w-[3px] rounded-full bg-red-400" style={{ animation: 'tf-soundbar 0.8s ease-in-out 0.15s infinite', height: '70%' }} />
                  <span className="w-[3px] rounded-full bg-red-400" style={{ animation: 'tf-soundbar 0.8s ease-in-out 0.3s infinite', height: '100%' }} />
                  <span className="w-[3px] rounded-full bg-red-400" style={{ animation: 'tf-soundbar 0.8s ease-in-out 0.45s infinite', height: '55%' }} />
                  <span className="w-[3px] rounded-full bg-red-400" style={{ animation: 'tf-soundbar 0.8s ease-in-out 0.6s infinite', height: '35%' }} />
                </div>
              </div>
            </div>
            <style>{`
              @keyframes tf-soundbar {
                0%, 100% { transform: scaleY(0.3); }
                50% { transform: scaleY(1); }
              }
            `}</style>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="px-6 pb-6 pt-2 bg-white dark:bg-[#0b141a] relative">
        {/* Agent Typing Bubble (Floating above composer) */}
        <div 
          className={`absolute bottom-[calc(100%+8px)] left-6 z-40 transition-all duration-300 ease-out flex items-center ${currentTypingAgents.length > 0 ? 'opacity-100 translate-y-0 visible' : 'opacity-0 translate-y-2 invisible'}`}
        >
          <div className="bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 shadow-md rounded-2xl rounded-bl-sm px-3.5 py-2 flex items-center gap-2.5">
            <div className="flex -space-x-1.5">
              {displayTypingAgents.slice(0, 3).map((agent, i) => {
                const matchedAgent = teamMembers.find(t => t.name === agent.name);
                const avatar = agent.avatar_url || matchedAgent?.avatar_url;
                return avatar ? (
                  <img key={i} src={avatar} alt={agent.name} className="w-5 h-5 rounded-full border border-white dark:border-slate-800 object-cover shrink-0" />
                ) : (
                  <div key={i} className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-white dark:border-slate-800 flex items-center justify-center text-[9px] font-bold overflow-hidden shrink-0">
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                );
              })}
            </div>
            <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300 tracking-tight truncate">
              {displayTypingAgents.map(a => a.name.split(' ')[0]).join(', ')} {displayTypingAgents.length > 1 ? 'are' : 'is'} typing
            </span>
            <div className="flex gap-[3px] items-center pr-1">
              <span className="w-1 h-1 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0ms", animationDuration: "1s" }}></span>
              <span className="w-1 h-1 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "150ms", animationDuration: "1s" }}></span>
              <span className="w-1 h-1 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "300ms", animationDuration: "1s" }}></span>
            </div>
          </div>
        </div>
        {/* Actual composer - always shown, locked to whisper if not picked up */}
        <div className={`relative ${!isPickedUp ? "mt-4" : ""}`}>
            {!isPickedUp && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/40 dark:bg-[#0b141a]/40 backdrop-blur-[3px] rounded-xl pointer-events-auto">
              <button
                onClick={handleJoinThread}
                disabled={isJoining}
                className="px-8 py-3 bg-[#0070f3] hover:bg-blue-600 text-white font-bold rounded-full shadow-[0_4px_14px_0_rgba(0,112,243,0.39)] hover:shadow-[0_6px_20px_rgba(0,112,243,0.23)] hover:bg-[rgba(0,112,243,0.9)] transition-all flex items-center gap-2 transform hover:scale-105 active:scale-95"
              >
                {isJoining ? <Loader2 size={18} className="animate-spin" /> : <MessageSquare size={18} />}
                Join Chat
              </button>
            </div>
          )}
          <div className={`transition-all duration-300 ${!isPickedUp ? 'opacity-40 blur-[2px] pointer-events-none select-none' : ''}`}>
        {/* Macro Menu */}
        {showMacroMenu && quickReplies.length > 0 && (
          <div className="absolute bottom-full left-6 right-6 mb-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden z-50 max-h-[300px] flex flex-col">
            <div className="overflow-y-auto p-1">
              {filteredMacros.length === 0 ? (
                <div className="p-3 text-center text-[13px] text-slate-500">No matching replies found.</div>
              ) : (
                filteredMacros.map((macro, i) => (
                  <div 
                    key={macro.id} 
                    id={`macro-item-${i}`}
                    onMouseEnter={() => setSelectedIndex(i)}
                    onClick={() => applyMacro(macro.content)}
                    className={`px-3 py-2 cursor-pointer rounded-lg flex flex-col gap-0.5 ${i === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-blue-600 dark:text-blue-400">{macro.shortcut}</span>
                    </div>
                    <span className="text-[13px] text-slate-600 dark:text-slate-300 line-clamp-1">{macro.content}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Mention Menu */}
        {showMentionMenu && isInternal && teamMembers.length > 0 && (
          <div className="absolute bottom-full left-6 right-6 mb-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden z-50 max-h-[300px] flex flex-col">
            <div className="overflow-y-auto p-1">
              {filteredMentions.length === 0 ? (
                <div className="p-3 text-center text-[13px] text-slate-500">No team members found.</div>
              ) : (
                filteredMentions.map((member, i) => (
                  <div 
                    key={member.id} 
                    id={`mention-item-${i}`}
                    onMouseEnter={() => setMentionIndex(i)}
                    onClick={() => applyMention(member)}
                    className={`px-3 py-2 cursor-pointer rounded-lg flex items-center gap-2.5 ${i === mentionIndex ? 'bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                  >
                    <div className="w-6 h-6 rounded-full bg-slate-200 shrink-0 overflow-hidden flex items-center justify-center">
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-bold text-slate-600">{member.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <span className="text-[13px] font-semibold text-amber-600 dark:text-amber-400">{member.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className={`flex flex-col border rounded-xl overflow-hidden transition-all shadow-sm ${(isAiDrafting || isAiStreaming) ? 'ai-composer-active ai-composer-shimmer bg-white dark:bg-[#2a3942]' : isInternal ? 'bg-amber-50 dark:bg-[#1f1d17] border-amber-300 dark:border-amber-900/40 focus-within:ring-1 focus-within:border-amber-400 focus-within:ring-amber-400/30' : 'bg-white dark:bg-[#2a3942] border-slate-300 dark:border-[#2a3942] focus-within:ring-1 focus-within:border-blue-500 focus-within:ring-blue-500'}`}>
          {/* AI shimmer overlay */}
          {(isAiDrafting || isAiStreaming) && <div className="ai-shimmer-overlay" />}
          {isRecording ? (
            <div className="flex items-center justify-between w-full p-4 min-h-[90px] bg-red-50/50 dark:bg-red-950/20">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-600 dark:text-red-400 font-medium font-mono">
                  {formatDuration(recordingDuration)}
                </span>
                <span className="text-sm text-red-600/70 dark:text-red-400/70">Recording audio...</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={cancelRecording}
                  className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-100 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
                <button 
                  onClick={stopRecording}
                  className="p-2 text-red-600 bg-red-100 hover:bg-red-200 rounded-full shadow-sm transition-colors"
                >
                  <Square size={20} strokeWidth={2.5} className="fill-red-600" />
                </button>
              </div>
            </div>
          ) : stagedAudio ? (
            <div className="flex items-center justify-between w-full p-4 min-h-[90px] bg-slate-50 dark:bg-[#202c33] gap-4">
              <div className="flex-1 w-full">
                <CustomAudioPlayer url={stagedAudio.url} type={isInternal ? 'internal' : 'agent'} fullWidth={true} />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button 
                  onClick={() => handleTranscribeAudio()}
                  disabled={isTranscribingAudio}
                  className="px-3 py-1.5 text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/20 disabled:opacity-50 disabled:hover:bg-transparent rounded-lg transition-colors flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm"
                >
                  {isTranscribingAudio ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-blue-500" />
                      <span>Transcribing...</span>
                    </>
                  ) : (
                    <span>Voice to Text</span>
                  )}
                </button>
                <button 
                  onClick={cancelRecording}
                  disabled={isTranscribingAudio}
                  className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-100 disabled:opacity-50 rounded-full transition-colors"
                >
                  <Trash2 size={20} />
                </button>
                <button 
                  onClick={sendRecording}
                  className="p-2 text-white bg-blue-500 hover:bg-blue-600 rounded-full shadow-sm transition-colors"
                >
                  <Check size={20} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          ) : (
            <div className="relative flex flex-col w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {stagedAttachments.length > 0 && (
                <div className="px-4 pt-3 pb-1 flex gap-2 flex-wrap">
                  {stagedAttachments.map((item, idx) => (
                    <div 
                      key={item.id} 
                      className={`relative inline-block border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden group bg-slate-50 dark:bg-slate-800 shrink-0 ${item.previewUrl && !item.type.startsWith('video/') ? 'cursor-zoom-in' : ''}`}
                      onClick={() => {
                        if (item.previewUrl && !item.type.startsWith('video/')) {
                          setZoomedImage(item.previewUrl)
                        }
                      }}
                    >
                      {item.previewUrl ? (
                        item.type.startsWith('video/') ? (
                          <div className="relative h-16 w-16 bg-slate-950 flex items-center justify-center select-none">
                            <video src={item.previewUrl} className="h-16 w-16 object-cover opacity-80" muted playsInline />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                              <div className="p-1 rounded-full bg-white/25 backdrop-blur-sm border border-white/10">
                                <svg className="w-2.5 h-2.5 text-white fill-current" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <img src={item.previewUrl} alt="Preview" className="h-16 w-16 object-cover" />
                        )
                      ) : (
                        <div className="h-16 w-16 flex flex-col items-center justify-center gap-1 px-1 select-none">
                          <Paperclip size={18} className="text-slate-400" />
                          <span className="text-[9px] text-slate-400 truncate w-full text-center leading-tight font-medium">{item.name.split('.').pop()?.toUpperCase()}</span>
                        </div>
                      )}
                      
                      {/* Premium progressive clear-out reveal overlay loader */}
                      {item.status === 'uploading' && (
                        <>
                          <div 
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-[0.5px] transition-all duration-300 ease-out z-10 pointer-events-none"
                            style={{ clipPath: `inset(0px 0px ${item.progress}% 0px)` }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                            <div className="p-1 rounded-full bg-slate-950/40 backdrop-blur-sm border border-white/10">
                              <Loader2 size={12} className="animate-spin text-white" />
                            </div>
                          </div>
                        </>
                      )}

                      {/* Red cross failure overlay */}
                      {item.status === 'failed' && (
                        <div className="absolute inset-0 bg-red-950/70 flex flex-col items-center justify-center backdrop-blur-[1px] text-white select-none z-10 transition-all">
                          <X size={16} className="text-red-300 font-bold" />
                          <span className="text-[9px] font-semibold text-red-200 mt-0.5">Failed</span>
                        </div>
                      )}

                      {/* Delete button */}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAttachment(idx);
                        }}
                        className={`absolute top-0.5 right-0.5 p-1 bg-black/60 rounded-full text-white transition-opacity ${item.status === 'uploading' ? 'hidden' : 'opacity-0 group-hover:opacity-100'}`}
                        disabled={item.status === 'uploading'}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {editingMessage && (
                <div className="mx-4 mt-3 mb-1 px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border-l-4 border-amber-500 dark:border-amber-500 rounded-r-lg flex items-center justify-between text-left select-none relative animate-in slide-in-from-bottom-2 duration-150">
                  <div className="flex flex-col gap-0.5 max-w-[90%]">
                    <span className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                      Editing message
                    </span>
                    <span className="text-[13px] text-slate-600 dark:text-slate-350 truncate font-normal leading-relaxed">
                      {editingMessage.content_type === 'image' ? 'Image' : editingMessage.content_type === 'video' ? 'Video' : editingMessage.content_type === 'audio' ? 'Voice message' : editingMessage.content}
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingMessage(null);
                      setInput("");
                    }}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 hover:bg-slate-200/50 dark:hover:bg-slate-700 rounded-full"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {replyToMessage && (
                <div className="mx-4 mt-3 mb-1 px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border-l-4 border-[#0070f3] dark:border-blue-500 rounded-r-lg flex items-center justify-between text-left select-none relative animate-in slide-in-from-bottom-2 duration-150">
                  <div className="flex flex-col gap-0.5 max-w-[90%]">
                    <span className="text-[12px] font-semibold text-blue-600 dark:text-blue-400">
                      Replying to {replyToMessage.sender_type === 'agent' || replyToMessage.sender_type === 'ai' ? 'You' : contactName}
                    </span>
                    <span className="text-[13px] text-slate-600 dark:text-slate-350 truncate font-normal leading-relaxed">
                      {replyToMessage.content_type === 'image' ? 'Image' : replyToMessage.content_type === 'video' ? 'Video' : replyToMessage.content_type === 'audio' ? 'Voice message' : replyToMessage.content}
                    </span>
                  </div>
                  <button 
                    onClick={() => setReplyToMessage(null)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 hover:bg-slate-200/50 dark:hover:bg-slate-700 rounded-full"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              
              {isWaitingForTranscript && (
                <div className="absolute left-0 right-0 bottom-4 flex items-center justify-center pointer-events-none z-10 animate-in fade-in duration-200">
                  <span className="text-[13px] font-medium text-blue-500/80 dark:text-blue-400/80 flex items-center gap-1.5 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-blue-100/50 dark:border-blue-500/20">
                    <Loader2 size={14} className="animate-spin" />
                    Transcribing<span className="animate-[pulse_1s_ease-in-out_infinite]">...</span>
                  </span>
                </div>
              )}

              <textarea 
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyUp={(e) => {
                  if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) return;
                  const target = e.target as HTMLTextAreaElement;
                  checkMacroTrigger(target.value, target.selectionStart);
                  checkMentionTrigger(target.value, target.selectionStart);
                }}
                onClick={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  checkMacroTrigger(target.value, target.selectionStart);
                  checkMentionTrigger(target.value, target.selectionStart);
                }}
                onPaste={(e) => {
                  if (e.clipboardData.files && e.clipboardData.files.length > 0) {
                    e.preventDefault();
                    const files = Array.from(e.clipboardData.files);
                    stageAttachments(files);
                  }
                }}
                onSelect={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  if (target.selectionStart !== target.selectionEnd) {
                    setSelectedText(target.value.substring(target.selectionStart, target.selectionEnd));
                  } else {
                    setSelectedText("");
                  }
                }}
              onKeyDown={(e) => {
                if (showMacroMenu && filteredMacros.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSelectedIndex(prev => (prev < filteredMacros.length - 1 ? prev + 1 : prev))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0))
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    applyMacro(filteredMacros[selectedIndex].content)
                  } else if (e.key === 'Escape') {
                    setShowMacroMenu(false)
                  }
                } else if (showMentionMenu && isInternal && filteredMentions.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setMentionIndex(prev => (prev < filteredMentions.length - 1 ? prev + 1 : prev))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setMentionIndex(prev => (prev > 0 ? prev - 1 : 0))
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    applyMention(filteredMentions[mentionIndex])
                  } else if (e.key === 'Escape') {
                    setShowMentionMenu(false)
                  }
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  if (e.nativeEvent.isComposing) return
                  e.preventDefault()
                  if (input.trim().startsWith('//t ') && input.trim().length > 4) {
                    const text = input.trim().substring(4).trim();
                    handleAiDraft(`Translate this exactly, auto-detecting language (Bangla <-> English): ${text}`, true);
                  } else if (input.trim().startsWith('//') && !input.trim().startsWith('//t ') && input.trim().length > 2) {
                    const instruction = input.trim().substring(2).trim();
                    handleAiDraft(instruction);
                  } else {
                    handleSend()
                  }
                }
              }}
                placeholder={isInternal ? "Add an internal whisper (customer won't see this)..." : "Reply to customer... Type '/' for quick replies"}
                className={`w-full bg-transparent p-4 text-[14px] focus:outline-none min-h-[90px] resize-none overflow-x-hidden overflow-y-auto [&::-webkit-scrollbar]:!hidden [&::-webkit-scrollbar]:!w-0 [&::-webkit-scrollbar]:!h-0 [-ms-overflow-style:none] [scrollbar-width:none] font-normal leading-relaxed relative z-[2] ${isInternal ? 'text-amber-950 dark:text-amber-100 placeholder:text-amber-700/55 dark:placeholder:text-amber-500/40' : 'text-slate-800 dark:text-[#d1d7db] placeholder:text-slate-400 dark:placeholder-[#8696a0]'} ${stagedAttachments.length > 0 ? 'pt-2 min-h-[60px]' : ''} ${isAiStreaming ? 'caret-blue-500' : ''}`}
              ></textarea>
              
              {/* Highlight Translation Menu */}
              {selectedText && textareaRef.current && (
                <div className="absolute top-2 right-4 z-[20] animate-in fade-in slide-in-from-bottom-1">
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      const textarea = textareaRef.current;
                      if (!textarea) return;
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const prefix = input.substring(0, start);
                      const suffix = input.substring(end);
                      handleAiDraft(`Translate this exactly, auto-detecting language (Bangla <-> English): ${selectedText}`, true, prefix, suffix);
                      setSelectedText("");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-xl text-[12px] font-medium transition-colors border border-slate-700/50"
                  >
                    <Bot size={14} className="text-blue-400" />
                    Translate
                  </button>
                </div>
              )}
            </div>
          )}
          


          <div className={`flex justify-between items-center px-3 py-2 border-t relative z-[2] ${isInternal ? 'border-amber-200/60 dark:border-amber-900/30 bg-amber-100/45 dark:bg-[#15130f]' : 'border-slate-100 dark:border-transparent bg-slate-50/50 dark:bg-[#202c33]'}`}>
            <div className="flex items-center gap-1">
              <input 
                type="file" 
                multiple
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                ref={fileInputRef}
                className="hidden" 
                onChange={handleFileUpload}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending || isRecording || stagedAudio !== null}
                className={`p-1.5 rounded-md transition-all disabled:opacity-50 ${isInternal ? 'text-amber-800 hover:bg-amber-100/50 dark:text-amber-400 dark:hover:bg-amber-950/40' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-[#8696a0] dark:hover:text-[#e9edef] dark:hover:bg-[#2a3942]'}`}
              >
                <Paperclip size={16} strokeWidth={2} />
              </button>
              <button 
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isSending || stagedAudio !== null}
                className={`p-1.5 rounded-md transition-all disabled:opacity-50 ${isRecording ? 'text-red-500 hover:bg-red-50' : isInternal ? 'text-amber-800 hover:bg-amber-100/50 dark:text-amber-400 dark:hover:bg-amber-950/40' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-[#8696a0] dark:hover:text-[#e9edef] dark:hover:bg-[#2a3942]'}`}
              >
                {isRecording ? <Square size={16} strokeWidth={2} /> : <Mic size={16} strokeWidth={2} />}
              </button>
              <button 
                onClick={() => handleAiDraft()}
                disabled={isSending || isAiDrafting || isAiStreaming || allMessages.length === 0}
                title="AI Auto-Reply Draft"
                className={`p-1.5 rounded-md transition-all disabled:opacity-50 ${aiDraftFailed ? 'text-red-500 hover:bg-red-50' : (isAiDrafting || isAiStreaming) ? 'text-blue-500' : isInternal ? 'text-amber-800 hover:bg-amber-100/50 dark:text-amber-400 dark:hover:bg-amber-950/40' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-[#8696a0] dark:hover:text-[#e9edef] dark:hover:bg-[#2a3942]'}`}
              >
                {(isAiDrafting || isAiStreaming) ? (
                  <Bot size={16} strokeWidth={2} className="text-blue-500 ai-bot-glow animate-pulse" />
                ) : aiDraftFailed ? (
                  <X size={16} strokeWidth={2} />
                ) : (
                  <Bot size={16} strokeWidth={2} />
                )}
              </button>
            </div>
            {/* Action buttons and toggle */}
            <div className="flex items-center gap-3">
              <div className="flex bg-slate-100 dark:bg-[#2a3942] p-0.5 rounded-lg border border-slate-200 dark:border-[#2a3942]">
                <button 
                  onClick={() => setIsInternal(false)}
                  className={`px-3.5 py-1 text-[12px] font-semibold rounded-md transition-all flex items-center gap-1.5 ${!isInternal ? 'bg-white dark:bg-[#111b21] text-slate-900 dark:text-[#e9edef] shadow-sm border border-slate-200/50 dark:border-slate-800' : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-700 dark:hover:text-[#e9edef]'}`}
                >
                  <MessageSquare size={13} strokeWidth={2.5} />
                  Reply
                </button>
                <button 
                  onClick={() => setIsInternal(true)}
                  className={`px-3.5 py-1 text-[12px] font-semibold rounded-md transition-all flex items-center gap-1.5 ${isInternal ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 shadow-sm border font-bold' : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-700 dark:hover:text-[#e9edef]'}`}
                >
                  <Lock size={13} strokeWidth={2.5} />
                  Whisper
                </button>
              </div>
              
              <button 
                onClick={handleSend}
                disabled={(!input.trim() && stagedAttachments.length === 0) || isSending || stagedAudio !== null}
                className={`px-5 py-1.5 text-[14px] font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm border ${
                  isInternal 
                    ? 'bg-slate-900 text-white border-slate-900 hover:bg-black dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100 dark:hover:bg-white disabled:opacity-40 disabled:bg-slate-900 disabled:text-white disabled:border-slate-900 dark:disabled:bg-slate-100 dark:disabled:text-slate-900 dark:disabled:border-slate-100'
                    : 'bg-[#0070f3] text-white border-[#0070f3] hover:bg-blue-600 disabled:opacity-50 disabled:bg-blue-300 disabled:text-white disabled:border-transparent'
                }`}
              >
                {isSending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  'Send'
                )}
              </button>
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>
      {/* Custom Context Menu */}
      {contextMenu && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[99998] cursor-default" 
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="absolute bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1.5 min-w-[175px] animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Add to Database - Available if email or phone is detected */}
            {(() => {
              const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
              const phoneRegex = /(?:\+?88)?01[3-9]\d{8}|\b\d{10,14}\b/i;
              
              const emailMatch = contextMenu.message.content?.match(emailRegex);
              const phoneMatch = contextMenu.message.content?.match(phoneRegex);
              
              const detectedEmail = emailMatch ? emailMatch[0] : null;
              const detectedPhone = !detectedEmail && phoneMatch ? phoneMatch[0] : null;

              if ((!detectedEmail && !detectedPhone) || !contact?.id) return null;

              const isEmail = !!detectedEmail;
              const detectedValue = detectedEmail || detectedPhone;

              return (
                <button 
                  onClick={async () => {
                    setContextMenu(null);
                    try {
                      let result;
                      if (isEmail) {
                        result = await updateContactEmail(contact.id, detectedValue as string);
                      } else {
                        result = await updateContactPhone(contact.id, detectedValue as string);
                      }

                      if (result.success) {
                        if (conversationId) {
                          const updatedContact = { ...contact };
                          if (isEmail) {
                            updatedContact.email = detectedValue;
                          } else {
                            updatedContact.phone = detectedValue;
                          }
                          updateConversation(conversationId, { contact: updatedContact });
                        }
                      } else {
                        setCustomAlert({ title: 'Error', message: "Failed to add to database: " + result.error, type: 'error' });
                      }
                    } catch (err: any) {
                      setCustomAlert({ title: 'Error', message: "Error updating contact " + (isEmail ? "email" : "phone") + ": " + err.message, type: 'error' });
                    }
                  }}
                  className="w-full text-left px-3.5 py-2 text-[13px] text-blue-600 dark:text-[#00a884] hover:bg-blue-50/50 dark:hover:bg-[#00a884]/10 flex items-center gap-2 font-semibold border-b border-slate-100 dark:border-slate-700/50"
                >
                  <Database size={14} className="text-blue-500 dark:text-[#00a884]" />
                  Add to Database
                </button>
              );
            })()}

            {/* Reply - ONLY available for text messages */}
            {contextMenu.message.content_type === 'text' && (
              <button 
                onClick={() => {
                setReplyToMessage(contextMenu.message);
                setContextMenu(null);
                setTimeout(() => {
                  textareaRef.current?.focus();
                }, 50);
              }}
              className="w-full text-left px-3.5 py-2 text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 font-medium"
            >
              <CornerUpLeft size={14} className="text-slate-400 dark:text-slate-500" />
              Reply
              </button>
            )}

            {/* Copy - ONLY available for text messages */}
            {contextMenu.message.content_type === 'text' && (
              <button 
                onClick={() => {
                navigator.clipboard.writeText(contextMenu.message.content).catch(() => {});
                setContextMenu(null);
              }}
              className="w-full text-left px-3.5 py-2 text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 font-medium"
            >
              <Copy size={14} className="text-slate-400 dark:text-slate-500" />
              Copy
              </button>
            )}

            {/* Edit - Available for all agent/AI text messages */}
            {contextMenu.message.content_type === 'text' && (contextMenu.message.sender_type === 'agent' || contextMenu.message.sender_type === 'ai') && (
              <button 
                onClick={() => triggerEditMessage(contextMenu.message)}
                className="w-full text-left px-3.5 py-2 text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 font-medium"
              >
                <Pencil size={14} className="text-slate-400 dark:text-slate-500" />
                Edit message
                </button>
            )}

            {/* Add shortcut - ONLY available for text messages */}
            {contextMenu.message.content_type === 'text' && (
              <button 
                onClick={() => {
                setQuickReplyContent(contextMenu.message.content);
                setQuickReplyShortcut("");
                setQuickReplyTitle("");
                setQuickReplyModalOpen(true);
                setContextMenu(null);
              }}
              className="w-full text-left px-3.5 py-2 text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 font-medium"
            >
              <Plus size={14} className="text-slate-400 dark:text-slate-500" />
              Add shortcut
              </button>
            )}

            {/* Delete - Available for all agent/AI messages */}
            {(contextMenu.message.sender_type === 'agent' || contextMenu.message.sender_type === 'ai') && (
              <button 
                onClick={async () => {
                  const msgId = contextMenu.message.id;
                  setContextMenu(null);
                  try {
                    // Optimistic delete
                    if (conversationId) {
                      const currentMsgs = useInboxStore.getState().messagesMap[conversationId] || [];
                      useInboxStore.getState().setMessages(conversationId, currentMsgs.filter(m => m.id !== msgId));
                    }
                    await recallMessage(msgId);
                  } catch (err: any) {
                    // Revert if it fails (optional, but alerts for now)
                    setCustomAlert({ title: 'Error', message: 'Failed to delete: ' + err.message, type: 'error' });
                  }
                }}
                className="w-full text-left px-3.5 py-2 text-[13px] text-red-650 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 flex items-center gap-2 font-medium border-t border-slate-100 dark:border-slate-700/50"
              >
                <Trash2 size={14} className="text-red-400 dark:text-red-500" />
                Delete message
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
      {/* Image Zoom Modal */}
      {zoomedImage && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-zoom-out"
          onClick={() => setZoomedImage(null)}
        >
          <img 
            src={zoomedImage} 
            alt="Zoomed attachment" 
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-md shadow-2xl" 
            onClick={(e) => e.stopPropagation()}
          />
          <button 
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors z-[100000]"
            onClick={() => setZoomedImage(null)}
          >
            <X size={24} />
          </button>
        </div>,
        document.body
      )}

      {/* Quick Reply Creation Modal */}
      {quickReplyModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div 
            className="bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200 relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              @keyframes tf-shake {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
                20%, 40%, 60%, 80% { transform: translateX(4px); }
              }
              .animate-tf-shake {
                animation: tf-shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
              }
            `}</style>
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <Plus size={18} />
                </div>
                <h3 className="text-[16px] font-bold text-slate-900 dark:text-slate-100">Add shortcut</h3>
              </div>
              <button 
                onClick={() => setQuickReplyModalOpen(false)}
                className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!quickReplyShortcut.trim() || !quickReplyTitle.trim() || !quickReplyContent.trim()) {
                setQuickReplyError(true);
                setTimeout(() => setQuickReplyError(false), 500);
                return;
              }
              
              const shortcut = quickReplyShortcut.toLowerCase().trim().replace(/^\//, ''); // strip leading slash if they typed it
              if (quickReplies.some(r => r.shortcut.toLowerCase() === shortcut)) {
                alert('Shortcut already exists! Please use a unique shortcut tag.');
                return;
              }

              setQuickReplySaving(true);
              try {
                const created = await createQuickReply(orgId, shortcut, quickReplyTitle.trim(), quickReplyContent.trim());
                if (created) {
                  setQuickReplies(prev => [...prev, created as QuickReplyItem].sort((a, b) => a.shortcut.localeCompare(b.shortcut)));
                  setQuickReplyModalOpen(false);
                }
              } catch (err: any) {
                setCustomAlert({ title: 'Error', message: 'Failed to save quick reply: ' + err.message, type: 'error' });
              } finally {
                setQuickReplySaving(false);
              }
            }} className="flex flex-col gap-4">
              
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Shortcut Tag</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-[14px]">/</span>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. wal"
                    value={quickReplyShortcut}
                    onChange={(e) => setQuickReplyShortcut(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    className={`w-full pl-6 pr-3.5 py-2 text-[14px] rounded-xl border bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0070f3]/50 focus:border-[#0070f3] focus:bg-white dark:focus:bg-slate-950 transition-all font-semibold ${quickReplyError && !quickReplyShortcut.trim() ? 'border-red-500 ring-1 ring-red-500 animate-tf-shake' : 'border-slate-200 dark:border-slate-800'}`}
                    disabled={quickReplySaving}
                    autoFocus
                  />
                </div>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block">Trigger abbreviation typed after / (e.g. typing /wal will insert this reply)</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Title / Description</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Wa-alaykum Assalam Greeting"
                  value={quickReplyTitle}
                  onChange={(e) => setQuickReplyTitle(e.target.value)}
                  className={`w-full px-3.5 py-2 text-[14px] rounded-xl border bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0070f3]/50 focus:border-[#0070f3] focus:bg-white dark:focus:bg-slate-950 transition-all ${quickReplyError && !quickReplyTitle.trim() ? 'border-red-500 ring-1 ring-red-500 animate-tf-shake' : 'border-slate-200 dark:border-slate-800'}`}
                  disabled={quickReplySaving}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Reply Message Content</label>
                <textarea 
                  required
                  placeholder="Type the message to send..."
                  value={quickReplyContent}
                  onChange={(e) => setQuickReplyContent(e.target.value)}
                  rows={4}
                  className={`w-full px-3.5 py-2.5 text-[14px] rounded-xl border bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0070f3]/50 focus:border-[#0070f3] focus:bg-white dark:focus:bg-slate-950 transition-all resize-none shadow-sm ${quickReplyError && !quickReplyContent.trim() ? 'border-red-500 ring-1 ring-red-500 animate-tf-shake' : 'border-slate-200 dark:border-slate-800'}`}
                  disabled={quickReplySaving}
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button 
                  type="button"
                  onClick={() => setQuickReplyModalOpen(false)}
                  className="px-4 py-2 text-[13px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  disabled={quickReplySaving}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-[13px] font-bold text-white bg-[#0070f3] hover:bg-blue-600 rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-1.5"
                  disabled={quickReplySaving}
                >
                  {quickReplySaving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Reply</span>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Beautiful Custom Alert Modal */}
      {customAlert && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div 
            className="bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Banner based on type */}
            <div className="p-6 flex flex-col items-center text-center border-b border-slate-100 dark:border-slate-800/40">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3.5 ${
                customAlert.type === 'error' 
                  ? 'bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400' 
                  : customAlert.type === 'success'
                    ? 'bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'bg-blue-50 text-[#0070f3] dark:bg-blue-500/10 dark:text-blue-400'
              }`}>
                {customAlert.type === 'error' && <Ban size={22} />}
                {customAlert.type === 'success' && <CheckCheck size={22} />}
                {customAlert.type === 'info' && <MessageSquare size={22} />}
              </div>
              
              <h3 className="text-[15px] font-extrabold text-slate-900 dark:text-slate-100">
                {customAlert.title}
              </h3>
              
              <p className="mt-2 text-[12.5px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                {customAlert.message}
              </p>
            </div>
            
            {/* Actions */}
            <div className="p-3 bg-slate-50 dark:bg-slate-900/30 flex justify-end">
              <button
                type="button"
                onClick={() => setCustomAlert(null)}
                className="px-4 py-2 text-[12px] font-bold text-white bg-[#0070f3] hover:bg-blue-650 rounded-xl transition active:scale-95 shadow-sm hover:shadow cursor-pointer"
              >
                Okay
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
