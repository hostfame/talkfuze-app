"use client"

import { useState, useEffect } from "react"
import { MessageCircle, MessageSquare, Camera, QrCode, X, Loader2, Unplug, ExternalLink } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"

export default function ChannelsSettingsPage() {
  const currentUser = useAuth()
  const ORG_ID = currentUser.org_id
  // WhatsApp State
  const [waStatus, setWaStatus] = useState<string>("disconnected")
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [isWaQrModalOpen, setIsWaQrModalOpen] = useState(false)
  const [isWaManageModalOpen, setIsWaManageModalOpen] = useState(false)
  const [waChannelId, setWaChannelId] = useState<string | null>(null)

  // Facebook State
  const [fbStatus, setFbStatus] = useState<string>("disconnected")
  const [fbPageName, setFbPageName] = useState<string | null>(null)
  const [fbChannelId, setFbChannelId] = useState<string | null>(null)
  const [isFbManageModalOpen, setIsFbManageModalOpen] = useState(false)

  // Loading States
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  useEffect(() => {
    // Initial fetch
    const fetchChannels = async () => {
      const { data } = await supabase
        .from('channels')
        .select('id, type, config')
        .eq('org_id', ORG_ID)
      
      if (data) {
        const wa = data.find(c => c.type === 'whatsapp')
        if (wa && wa.config) {
          setWaStatus(wa.config.status || "disconnected")
          setQrCodeUrl(wa.config.qr_code || null)
          setWaChannelId(wa.id)
        } else {
          setWaStatus("disconnected")
          setWaChannelId(null)
        }

        const fb = data.find(c => c.type === 'messenger')
        if (fb && fb.config) {
          setFbStatus("connected")
          setFbPageName(fb.config.page_name || "Facebook Page")
          setFbChannelId(fb.id)
        } else {
          setFbStatus("disconnected")
          setFbPageName(null)
          setFbChannelId(null)
        }
      }
    }
    
    fetchChannels()

    // Realtime subscription
    const channel = supabase
      .channel('public:channels')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'channels',
        filter: `org_id=eq.${ORG_ID}`
      }, (payload) => {
        fetchChannels() // Re-fetch on any channel change to keep it simple and accurate
        if (payload.new && (payload.new as any).type === 'whatsapp' && (payload.new as any).config?.status === "connected") {
          setIsWaQrModalOpen(false) // Auto close when connected
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const handleDisconnect = async (channelId: string | null, platform: string) => {
    if (!channelId) return;
    setIsDisconnecting(true);
    try {
      await supabase.from('channels').delete().eq('id', channelId);
      if (platform === 'whatsapp') {
        setIsWaManageModalOpen(false);
        setWaStatus("disconnected");
      } else if (platform === 'facebook') {
        setIsFbManageModalOpen(false);
        setFbStatus("disconnected");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsDisconnecting(false);
    }
  }

  const handleConnectFacebook = () => {
    // Use the backend oauth route directly
    // Add org_id to state
    const state = Buffer.from(JSON.stringify({ org_id: ORG_ID })).toString('base64');
    window.location.href = `/api/auth/facebook?state=${state}`;
  }

  return (
    <div className="space-y-6 relative">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Integrations & Channels</h1>
        <p className="text-sm text-slate-500 mt-1">Connect your social accounts to bring all messages into TalkFuze.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Facebook Messenger */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col h-full">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-xl flex items-center justify-center">
              <MessageSquare size={24} strokeWidth={2} />
            </div>
            {fbStatus === "connected" && (
              <span className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[11px] font-medium px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800/50">
                Connected
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Facebook Messenger</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6 flex-1">
            Reply to messages sent to your Facebook Page directly from your inbox.
          </p>
          {fbStatus === "connected" ? (
            <button 
              onClick={() => setIsFbManageModalOpen(true)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Manage Connection
            </button>
          ) : (
            <button 
              onClick={handleConnectFacebook}
              className="w-full py-2.5 bg-[#0070f3] hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              Connect Facebook
            </button>
          )}
        </div>

        {/* WhatsApp */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col h-full">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-green-50 dark:bg-green-900/20 text-green-600 rounded-xl flex items-center justify-center">
              <MessageCircle size={24} strokeWidth={2} />
            </div>
            {waStatus === "connected" && (
              <span className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[11px] font-medium px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800/50">
                Connected
              </span>
            )}
            {waStatus === "pending" && (
              <span className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[11px] font-medium px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/50 flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" /> Pairing
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">WhatsApp Web</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6 flex-1">
            Connect your personal or business WhatsApp instantly using QR code scanning. No API costs.
          </p>
          {waStatus === "connected" ? (
            <button 
              onClick={() => setIsWaManageModalOpen(true)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Manage Connection
            </button>
          ) : (
            <button 
              onClick={() => setIsWaQrModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0070f3] hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <QrCode size={16} /> {waStatus === "pending" ? "View QR Code" : "Scan QR Code"}
            </button>
          )}
        </div>

        {/* Instagram */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col h-full opacity-60 grayscale hover:grayscale-0 transition-all cursor-not-allowed">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-pink-50 dark:bg-pink-900/20 text-pink-600 rounded-xl flex items-center justify-center">
              <Camera size={24} strokeWidth={2} />
            </div>
            <span className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 text-[11px] font-medium px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
              Coming Soon
            </span>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Instagram DM</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6 flex-1">
            Manage direct messages, story replies, and comments from Instagram.
          </p>
          <button disabled className="w-full py-2.5 bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 rounded-lg text-sm font-medium">
            Connect Instagram
          </button>
        </div>
      </div>

      {/* WhatsApp QR Modal */}
      {isWaQrModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white">Connect WhatsApp</h3>
              <button 
                onClick={() => setIsWaQrModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex flex-col items-center text-center">
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
                Open WhatsApp on your phone, tap <strong>Menu</strong> or <strong>Settings</strong> and select <strong>Linked Devices</strong>. Tap on <strong>Link a device</strong> and point your phone to this screen.
              </p>
              
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 min-h-[250px] flex items-center justify-center w-full relative">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="WhatsApp QR Code" className="w-48 h-48 rounded-lg" />
                ) : (
                  <div className="flex flex-col items-center text-slate-400">
                    <Loader2 size={32} className="animate-spin mb-3 text-blue-500" />
                    <span className="text-sm">Waiting for WhatsApp Worker to generate QR...</span>
                    <span className="text-xs mt-2 text-slate-500">Ensure the backend worker is running.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Manage Modal */}
      {isWaManageModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <MessageCircle size={18} className="text-green-500" /> WhatsApp Web
              </h3>
              <button 
                onClick={() => setIsWaManageModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 text-green-500 rounded-full flex items-center justify-center mb-4">
                <MessageCircle size={32} />
              </div>
              <h4 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Device Connected</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Your WhatsApp account is successfully connected to TalkFuze and receiving messages in real-time.
              </p>

              <button 
                onClick={() => handleDisconnect(waChannelId, 'whatsapp')}
                disabled={isDisconnecting}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isDisconnecting ? <Loader2 size={16} className="animate-spin" /> : <Unplug size={16} />}
                Disconnect Device
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Facebook Manage Modal */}
      {isFbManageModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <MessageSquare size={18} className="text-blue-500" /> Messenger
              </h3>
              <button 
                onClick={() => setIsFbManageModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-full flex items-center justify-center mb-4">
                <MessageSquare size={32} />
              </div>
              <h4 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Page Connected</h4>
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 mb-6 flex items-center gap-2">
                {fbPageName || "Facebook Page"} 
                <ExternalLink size={14} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                TalkFuze is receiving messages from this Facebook Page.
              </p>

              <button 
                onClick={() => handleDisconnect(fbChannelId, 'facebook')}
                disabled={isDisconnecting}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isDisconnecting ? <Loader2 size={16} className="animate-spin" /> : <Unplug size={16} />}
                Disconnect Page
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
