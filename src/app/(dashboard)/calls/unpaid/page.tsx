import { fetchAllWhmcsUnpaidInvoices } from "@/actions/whmcs"
import { getUnpaidInvoiceCalls } from "@/actions/unpaid-calls"
import { UnpaidInvoicesTable } from "./UnpaidInvoicesTable"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function UnpaidCallsPage() {
  // Fetch invoices and call records in parallel
  const [invoices, callRecords] = await Promise.all([
    fetchAllWhmcsUnpaidInvoices(),
    getUnpaidInvoiceCalls()
  ])

  return (
    <div className="flex flex-col w-full h-full bg-white dark:bg-[#0b141a]">
      <div className="flex items-center px-6 py-4 border-b border-slate-100 dark:border-slate-800">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 tracking-tight">Daily Unpaid Calls</h1>
      </div>
      
      <div className="flex-1 overflow-hidden">
        <UnpaidInvoicesTable invoices={invoices} callRecords={callRecords} />
      </div>
    </div>
  )
}
