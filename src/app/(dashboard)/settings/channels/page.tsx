"use client"

import { useState, useEffect, useCallback } from "react"
import { MessageCircle, MessageSquare, Camera, QrCode, X, Loader2, Unplug, RefreshCw } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"

type Channel = {
  id: string
  type: string
  is_active: boolean
  config: {
    page_id?: string
    page_name?: string
    access_token?: string
    status?: string
    qr_code?: string
    facebook_page_id?: string
  }
  created_at: string
}

export default function ChannelsSettingsPage() {
  const currentUser = useAuth()
  const ORG_ID = currentUser.org_id

  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // WhatsApp Modal
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [isWaQrModalOpen, setIsWaQrModalOpen] = useState(false)
  const [isWaManageModalOpen, setIsWaManageModalOpen] = useState(false)
  const [waChannelId, setWaChannelId] = useState<string | null>(null)
  const [waStatus, setWaStatus] = useState("disconnected")
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const fetchChannels = useCallback(async () => {
    const { data } = await supabase
      .from('channels')
      .select('id, type, is_active, config, created_at')
      .eq('org_id', ORG_ID)
      .order('created_at', { ascending: true })

    if (data) {
      setChannels(data as Channel[])
      const wa = data.find(c => c.type === 'whatsapp')
      if (wa) {
        setWaStatus(wa.config?.status || "disconnected")
        setQrCodeUrl(wa.config?.qr_code || null)
        setWaChannelId(wa.id)
      } else {
        setWaStatus("disconnected")
        setWaChannelId(null)
      }
    }
    setLoading(false)
  }, [ORG_ID])

  useEffect(() => {
    fetchChannels()
    const realtimeChannel = supabase
      .channel('channels-settings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'channels',
        filter: `org_id=eq.${ORG_ID}`
      }, () => fetchChannels())
      .subscribe()
    return () => { supabase.removeChannel(realtimeChannel) }
  }, [ORG_ID, fetchChannels])

  const handleToggle = async (channel: Channel) => {
    setTogglingId(channel.id)
    await supabase
      .from('channels')
      .update({ is_active: !channel.is_active })
      .eq('id', channel.id)
    await fetchChannels()
    setTogglingId(null)
  }

  const handleConnectFacebook = () => {
    const state = btoa(JSON.stringify({ org_id: ORG_ID }))
    window.location.href = `/api/auth/facebook?state=${state}`
  }

  const handleDisconnect = async (channelId: string) => {
    setIsDisconnecting(true)
    try {
      await supabase.from('channels').delete().eq('id', channelId)
      setIsWaManageModalOpen(false)
      setWaStatus("disconnected")
      await fetchChannels()
    } finally {
      setIsDisconnecting(false)
    }
  }

  const messengerChannels = channels.filter(c => c.type === 'messenger')
  const instagramChannels = channels.filter(c => c.type === 'instagram')
  const waChannel = channels.find(c => c.type === 'whatsapp')

  const Toggle = ({ channel }: { channel: Channel }) => (
    <button
      onClick={() => handleToggle(channel)}
      disabled={togglingId === channel.id}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        channel.is_active ? 'bg-[#0070f3]' : 'bg-slate-200 dark:bg-slate-700'
      } ${togglingId === channel.id ? 'opacity-50' : ''}`}
      role="switch"
      aria-checked={channel.is_active}
    >
      {togglingId === channel.id ? (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform">
          <Loader2 size={10} className="animate-spin text-slate-400" />
        </span>
      ) : (
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            channel.is_active ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      )}
    </button>
  )

  return (
    <div className="space-y-8 relative">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Integrations & Channels</h1>
        <p className="text-sm text-slate-500 mt-1">Connect social accounts and control which pages receive messages in TalkFuze.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {/* WhatsApp Section */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-green-50 dark:bg-green-900/20 text-green-600 rounded-lg flex items-center justify-center">
                <MessageCircle size={16} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">WhatsApp</h2>
                <p className="text-xs text-slate-500">Connected via QR code scan</p>
              </div>
              {waChannel && (
                <span className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800/50">
                  {waStatus === 'connected' ? 'Connected' : 'Disconnected'}
                </span>
              )}
            </div>

            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              {waChannel ? (
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                      <MessageCircle size={16} className="text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">WhatsApp Web</p>
                      <p className="text-xs text-slate-500">{waStatus === 'connected' ? 'Device linked' : 'Not connected'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsWaManageModalOpen(true)}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Manage
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <MessageCircle size={16} className="text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">No WhatsApp device connected</p>
                  </div>
                  <button
                    onClick={() => setIsWaQrModalOpen(true)}
                    className="flex items-center gap-1.5 text-xs bg-[#0070f3] hover:bg-blue-600 text-white rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <QrCode size={12} /> Scan QR
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Facebook Messenger Section */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg flex items-center justify-center">
                <MessageSquare size={16} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Facebook Messenger</h2>
                <p className="text-xs text-slate-500">
                  {messengerChannels.length > 0
                    ? `${messengerChannels.filter(c => c.is_active).length} of ${messengerChannels.length} pages active`
                    : 'No pages connected'}
                </p>
              </div>
              <button
                onClick={handleConnectFacebook}
                className="ml-auto flex items-center gap-1.5 text-xs bg-[#0070f3] hover:bg-blue-600 text-white rounded-lg px-3 py-1.5 transition-colors"
              >
                <RefreshCw size={12} /> Reconnect / Add Pages
              </button>
            </div>

            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {messengerChannels.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  No Facebook Pages connected.{' '}
                  <button onClick={handleConnectFacebook} className="text-[#0070f3] hover:underline">
                    Connect now
                  </button>
                </div>
              ) : (
                messengerChannels.map(channel => (
                  <div key={channel.id} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                        <MessageSquare size={14} className="text-blue-500" />
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${channel.is_active ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
                          {channel.config?.page_name || 'Facebook Page'}
                        </p>
                        <p className="text-xs text-slate-400">{channel.config?.page_id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-medium ${channel.is_active ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
                        {channel.is_active ? 'Active' : 'Paused'}
                      </span>
                      <Toggle channel={channel} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Instagram Section */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-pink-50 dark:bg-pink-900/20 text-pink-600 rounded-lg flex items-center justify-center">
                <Camera size={16} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Instagram DM</h2>
                <p className="text-xs text-slate-500">
                  {instagramChannels.length > 0
                    ? `${instagramChannels.filter(c => c.is_active).length} of ${instagramChannels.length} accounts active`
                    : 'No accounts connected'}
                </p>
              </div>
              <button
                onClick={handleConnectFacebook}
                className="ml-auto flex items-center gap-1.5 text-xs bg-[#0070f3] hover:bg-blue-600 text-white rounded-lg px-3 py-1.5 transition-colors"
              >
                <RefreshCw size={12} /> Reconnect / Add Accounts
              </button>
            </div>

            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {instagramChannels.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  No Instagram accounts connected.{' '}
                  <button onClick={handleConnectFacebook} className="text-[#0070f3] hover:underline">
                    Connect via Facebook
                  </button>
                </div>
              ) : (
                instagramChannels.map(channel => (
                  <div key={channel.id} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-pink-50 dark:bg-pink-900/20 flex items-center justify-center shrink-0">
                        <Camera size={14} className="text-pink-500" />
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${channel.is_active ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
                          @{channel.config?.page_name || 'Instagram Account'}
                        </p>
                        <p className="text-xs text-slate-400">via {channel.config?.facebook_page_id ? `FB Page ${channel.config.facebook_page_id}` : 'Facebook'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-medium ${channel.is_active ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
                        {channel.is_active ? 'Active' : 'Paused'}
                      </span>
                      <Toggle channel={channel} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}

      {/* WhatsApp QR Modal */}
      {isWaQrModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white">Connect WhatsApp</h3>
              <button onClick={() => setIsWaQrModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center text-center">
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
                Open WhatsApp on your phone, tap <strong>Menu</strong> or <strong>Settings</strong> and select <strong>Linked Devices</strong>. Tap <strong>Link a device</strong> and point your phone to this screen.
              </p>
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 min-h-[250px] flex items-center justify-center w-full">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="WhatsApp QR Code" className="w-48 h-48 rounded-lg" />
                ) : (
                  <div className="flex flex-col items-center text-slate-400">
                    <Loader2 size={32} className="animate-spin mb-3 text-blue-500" />
                    <span className="text-sm">Waiting for QR code...</span>
                    <span className="text-xs mt-2 text-slate-500">Make sure the WhatsApp worker is running.</span>
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <MessageCircle size={18} className="text-green-500" /> WhatsApp Web
              </h3>
              <button onClick={() => setIsWaManageModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 text-green-500 rounded-full flex items-center justify-center mb-4">
                <MessageCircle size={32} />
              </div>
              <h4 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Device Connected</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Your WhatsApp is linked to TalkFuze and receiving messages in real-time.
              </p>
              <button
                onClick={() => handleDisconnect(waChannelId!)}
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
    </div>
  )
}
