"use client"

import { useState, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import { updateProfile, uploadAvatar } from "@/actions/team"
import { getErrorMessage } from "@/lib/utils"
import { User, Camera, Mail, Loader2, Volume2, Play, Check } from "lucide-react"
import { SOUND_PRESETS, getSelectedSound, setSelectedSound, getSoundVolume, setSoundVolume, previewSound, type SoundPreset } from "@/lib/sounds"

export default function ProfileSettingsPage() {
  const currentUser = useAuth()
  
  const [name, setName] = useState(currentUser?.name || "")
  const [email] = useState(currentUser?.email || "")
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar_url || "")
  
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sound settings (localStorage-based, no server needed)
  const [soundPreset, setSoundPresetState] = useState<SoundPreset>(() => getSelectedSound())
  const [volume, setVolumeState] = useState<number>(() => getSoundVolume())
  const [playingPreset, setPlayingPreset] = useState<SoundPreset | null>(null)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await updateProfile({ name, email, avatar_url: avatarUrl })
      if (res.success) {
        alert("Profile updated successfully")
        // Force refresh to update the global auth context
        window.location.reload()
      } else {
        alert("Failed to update profile: " + res.error)
      }
    } catch {
      alert("An error occurred")
    } finally {
      setIsSaving(false)
    }
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file")
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be less than 5MB")
      return
    }

    setIsUploading(true)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const uploadResult = await uploadAvatar(formData)

      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || "Failed to upload avatar")
      }

      const publicUrl = uploadResult.url
      setAvatarUrl(publicUrl)
      
      // Auto-save the profile after successful upload
      const res = await updateProfile({ avatar_url: publicUrl })
      if (res.success) {
        alert("Profile picture updated!")
        window.location.reload()
      } else {
        alert("Failed to save profile picture")
      }
    } catch (error: unknown) {
      alert("Error uploading image: " + getErrorMessage(error))
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handlePresetChange = (preset: SoundPreset) => {
    setSoundPresetState(preset)
    setSelectedSound(preset)
    // Auto-preview on selection
    setPlayingPreset(preset)
    previewSound(preset)
    setTimeout(() => setPlayingPreset(null), 600)
  }

  const handleVolumeChange = (newVol: number) => {
    setVolumeState(newVol)
    setSoundVolume(newVol)
  }

  const handlePreviewClick = (preset: SoundPreset) => {
    setPlayingPreset(preset)
    previewSound(preset)
    setTimeout(() => setPlayingPreset(null), 600)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">My Profile</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your personal settings and profile picture.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden mb-6">
        <div className="p-6 md:p-8">
          
          <div className="flex flex-col md:flex-row items-start md:items-center gap-8 mb-8">
            <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
              <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border-4 border-white dark:border-slate-950 shadow-sm flex items-center justify-center">
                {isUploading ? (
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                ) : avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-slate-400">
                    {name ? name.charAt(0).toUpperCase() : <User size={32} />}
                  </span>
                )}
              </div>
              <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-6 h-6 text-white" />
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Profile Picture</h3>
              <p className="text-sm text-slate-500 mb-3">
                Upload a picture to help your team and customers recognize you.
              </p>
              <button 
                onClick={handleAvatarClick}
                disabled={isUploading}
                className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                {isUploading ? "Uploading..." : "Change picture"}
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={16} className="text-slate-400" />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none focus:border-blue-500 dark:focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-900 dark:text-white"
                  placeholder="Your full name"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail size={16} className="text-slate-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none text-slate-500 dark:text-slate-400 cursor-not-allowed opacity-70"
                  placeholder="you@example.com"
                />
              </div>
              <p className="text-[12px] text-slate-500 mt-1.5">Email address cannot be changed. Contact admin for updates.</p>
            </div>
          </div>
        </div>
        
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving || isUploading || name === currentUser?.name}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2"
          >
            {isSaving && <Loader2 size={16} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* ─── Notification Sound Settings ─── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden mb-6">
        <div className="p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <Volume2 size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white">Notification Sound</h3>
              <p className="text-[13px] text-slate-500">Choose a sound and volume for incoming messages.</p>
            </div>
          </div>

          {/* Volume Slider */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Volume</label>
              <span className="text-[12px] font-mono text-slate-400">{Math.round(volume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-blue-600 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>

          {/* Sound Preset Grid */}
          <div className="space-y-2">
            {SOUND_PRESETS.map((preset) => {
              const isSelected = soundPreset === preset.id
              const isPlaying = playingPreset === preset.id
              return (
                <div
                  key={preset.id}
                  onClick={() => handlePresetChange(preset.id)}
                  className={`flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all duration-150 border ${
                    isSelected 
                      ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 ring-1 ring-blue-500/20' 
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {/* Selection indicator */}
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                    isSelected 
                      ? 'border-blue-600 bg-blue-600' 
                      : 'border-slate-300 dark:border-slate-600'
                  }`}>
                    {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                  </div>

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13.5px] font-medium ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-slate-200'}`}>
                      {preset.name}
                    </div>
                    <div className="text-[12px] text-slate-500 dark:text-slate-400">
                      {preset.description}
                    </div>
                  </div>

                  {/* Preview button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handlePreviewClick(preset.id)
                    }}
                    className={`p-2 rounded-lg shrink-0 transition-all ${
                      isPlaying 
                        ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 scale-110' 
                        : 'hover:bg-slate-200/70 dark:hover:bg-slate-700/50 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                    title={`Preview ${preset.name}`}
                  >
                    <Play size={14} className={isPlaying ? 'animate-pulse' : ''} fill={isPlaying ? 'currentColor' : 'none'} />
                  </button>
                </div>
              )
            })}
          </div>

          <p className="text-[11.5px] text-slate-400 dark:text-slate-500 mt-4">
            Sound preference is saved locally on this device. If you are missing messages, try "Loud Ping" or increase the volume.
          </p>
        </div>
      </div>
    </div>
  )
}
