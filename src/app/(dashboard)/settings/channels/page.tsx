import { MessageCircle, Facebook, Instagram, QrCode } from "lucide-react"

export default function ChannelsSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Integrations & Channels</h1>
        <p className="text-sm text-slate-500 mt-1">Connect your social accounts to bring all messages into TalkFuze.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Facebook Messenger */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col h-full">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-xl flex items-center justify-center">
              <Facebook size={24} strokeWidth={2} />
            </div>
            <span className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[11px] font-medium px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800/50">
              Connected
            </span>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Facebook Messenger</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6 flex-1">
            Reply to messages sent to your Facebook Page directly from your inbox.
          </p>
          <button className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors">
            Manage Connection
          </button>
        </div>

        {/* WhatsApp */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col h-full">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-green-50 dark:bg-green-900/20 text-green-600 rounded-xl flex items-center justify-center">
              <MessageCircle size={24} strokeWidth={2} />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">WhatsApp Web</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6 flex-1">
            Connect your personal or business WhatsApp instantly using QR code scanning. No API costs.
          </p>
          <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0070f3] hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">
            <QrCode size={16} /> Scan QR Code
          </button>
        </div>

        {/* Instagram */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col h-full opacity-60 grayscale hover:grayscale-0 transition-all cursor-not-allowed">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-pink-50 dark:bg-pink-900/20 text-pink-600 rounded-xl flex items-center justify-center">
              <Instagram size={24} strokeWidth={2} />
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
    </div>
  )
}
