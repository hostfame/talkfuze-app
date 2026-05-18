import { Loader2 } from "lucide-react"

export default function SettingsLoading() {
  return (
    <div className="flex items-center justify-center w-full h-[60vh] animate-in fade-in duration-300">
      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
    </div>
  )
}
