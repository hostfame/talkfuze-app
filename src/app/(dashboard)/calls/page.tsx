import CallsPage from "@/components/inbox/CallsPage"

export const metadata = {
  title: 'Calls History - TalkFuze',
}

export default function CallsRoute() {
  return (
    <div className="flex-1 flex w-full h-full overflow-hidden bg-white dark:bg-slate-900 pb-16 md:pb-0">
      <CallsPage />
    </div>
  )
}
