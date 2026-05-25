"use client"

import { useState, useTransition } from "react"
import { Phone, Check, X, CreditCard, ChevronDown, Save, Loader2 } from "lucide-react"
import { upsertUnpaidInvoiceCall } from "@/actions/unpaid-calls"
import { useInboxStore } from "@/lib/store"

type Invoice = {
  id: number
  userid: number
  firstname: string
  lastname: string
  companyname: string
  phonenumber: string
  email: string
  total: string
  currencycode: string
  date: string
  duedate: string
}

type CallRecord = {
  invoice_id: number
  client_id: number
  status: string | null
  will_renew: string | null
  notes: string | null
}

interface Props {
  invoices: Invoice[]
  callRecords: CallRecord[]
}

export function UnpaidInvoicesTable({ invoices, callRecords }: Props) {
  const { triggerDial } = useInboxStore()
  
  const [records, setRecords] = useState<Record<number, CallRecord>>(
    callRecords.reduce((acc, cr) => {
      acc[cr.invoice_id] = cr
      return acc
    }, {} as Record<number, CallRecord>)
  )

  const [savingId, setSavingId] = useState<number | null>(null)

  const handleUpdate = async (invoiceId: number, clientId: number, field: string, value: string) => {
    const prev = records[invoiceId] || { invoice_id: invoiceId, client_id: clientId, status: null, will_renew: null, notes: null }
    const updated = { ...prev, [field]: value }
    
    // Optimistic update
    setRecords(curr => ({ ...curr, [invoiceId]: updated }))
    
    // Server update
    setSavingId(invoiceId)
    await upsertUnpaidInvoiceCall({
      invoice_id: invoiceId,
      client_id: clientId,
      [field]: value
    })
    setSavingId(null)
  }

  const handleNoteBlur = async (invoiceId: number, clientId: number, value: string) => {
    const prev = records[invoiceId]
    if (prev?.notes === value) return // No change

    handleUpdate(invoiceId, clientId, 'notes', value)
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">Daily Unpaid Calls</h1>
        <div className="text-sm text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-sm">
          {invoices.length} Unpaid Invoices
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase font-medium tracking-wider text-[11px]">
              <tr>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Invoice</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Will Renew</th>
                <th className="px-6 py-4 w-64">Notes</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <CreditCard className="w-8 h-8 text-slate-300" />
                      <p>No unpaid invoices found for today.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const record = records[inv.id]
                  const clientName = [inv.firstname, inv.lastname].filter(Boolean).join(" ") || inv.companyname || `Client #${inv.userid}`
                  
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{clientName}</div>
                        <div className="text-slate-500 text-xs mt-0.5 font-mono">{inv.phonenumber || 'No Phone'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <a href={`https://my.hostnin.com/admin/invoices.php?action=edit&id=${inv.id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">
                          #{inv.id}
                        </a>
                        <div className="text-slate-500 text-[11px] mt-0.5">Due: {inv.duedate}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{inv.total} {inv.currencycode}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="relative">
                          <select 
                            value={record?.status || ""} 
                            onChange={(e) => handleUpdate(inv.id, inv.userid, 'status', e.target.value)}
                            className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-full cursor-pointer"
                          >
                            <option value="" disabled>Select...</option>
                            <option value="Answered">Answered</option>
                            <option value="Not Answered">Not Answered</option>
                            <option value="Unreachable">Unreachable</option>
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleUpdate(inv.id, inv.userid, 'will_renew', 'Yes')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${record?.will_renew === 'Yes' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => handleUpdate(inv.id, inv.userid, 'will_renew', 'No')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${record?.will_renew === 'No' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                          >
                            No
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="relative">
                          <input
                            type="text"
                            defaultValue={record?.notes || ""}
                            placeholder="Add note..."
                            onBlur={(e) => handleNoteBlur(inv.id, inv.userid, e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur()
                              }
                            }}
                          />
                          {savingId === inv.id && (
                            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          disabled={!inv.phonenumber}
                          onClick={() => {
                            if (inv.phonenumber) {
                                const digits = inv.phonenumber.replace(/\D/g, '')
                                triggerDial(digits)
                            }
                          }}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group-hover:shadow-sm"
                          title={inv.phonenumber ? "Call Customer" : "No Phone Number"}
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
