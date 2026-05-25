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
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Telephony</h2>
        <p className="text-slate-600 text-sm">
          Manage and track daily outbound calls for unpaid invoices.
        </p>
      </div>

      <UnpaidInvoicesTable invoices={invoices} callRecords={callRecords} />
    </div>
  )
}
