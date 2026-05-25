"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { Phone, Check, X, CreditCard, ChevronDown, Save, Loader2, Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { upsertUnpaidInvoiceCall } from "@/actions/unpaid-calls"
import { useInboxStore } from "@/lib/store"
import { format, isToday, isYesterday, addDays, subDays, parseISO } from "date-fns"
import { DayPicker } from "react-day-picker"
import "react-day-picker/dist/style.css"

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
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const calendarRef = useRef<HTMLDivElement>(null)

  // Handle click outside to close calendar
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleClickOutside = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setIsCalendarOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedDateStr = useMemo(() => {
    return format(selectedDate, 'yyyy-MM-dd')
  }, [selectedDate])

  const formattedDateDisplay = useMemo(() => {
    if (isToday(selectedDate)) return "Today"
    if (isYesterday(selectedDate)) return "Yesterday"
    return format(selectedDate, 'MMM d, yyyy')
  }, [selectedDate])

  // Filter invoices created exactly on the selected date (daily cron run date)
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => inv.date === selectedDateStr)
  }, [invoices, selectedDateStr])

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

  const getStatusColor = (status: string | null) => {
    if (status === 'Answered') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    if (status === 'Not Answered') return 'bg-amber-50 text-amber-700 border-amber-200'
    if (status === 'Unreachable') return 'bg-rose-50 text-rose-700 border-rose-200'
    return 'bg-white text-slate-500 border-slate-200'
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0b141a]/50">
        <div className="flex items-center gap-4">
          
          {/* Premium Date Navigator */}
          <div className="flex items-center bg-white dark:bg-[#111b21] border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-1">
            <button 
              onClick={() => setSelectedDate(prev => subDays(prev, 1))}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="relative flex items-center" ref={calendarRef}>
              <button 
                onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-semibold transition-colors rounded-md ${isCalendarOpen ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                <Calendar className={`w-4 h-4 ${isCalendarOpen ? 'text-blue-500' : 'text-slate-400'}`} />
                {formattedDateDisplay}
              </button>

              {/* Custom Popover Calendar */}
              {isCalendarOpen && (
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-200">
                  <DayPicker
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date)
                        setIsCalendarOpen(false)
                      }
                    }}
                    showOutsideDays
                    className="p-1 custom-day-picker"
                    classNames={{
                      selected: "bg-[#0070f3] text-white hover:bg-[#0070f3] hover:text-white rounded-lg font-bold",
                      day: "hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-800 dark:text-slate-200 p-2 w-9 h-9 flex items-center justify-center transition-colors text-sm font-medium",
                      today: "bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white rounded-lg",
                      weekday: "text-slate-400 dark:text-slate-500 font-medium text-[11px] uppercase tracking-wider",
                      nav: "flex items-center gap-1",
                      caption_label: "text-sm font-bold text-slate-800 dark:text-slate-200"
                    }}
                  />
                  
                  {/* Global CSS override for react-day-picker to remove default ugly outlines */}
                  <style>{`
                    .custom-day-picker .rdp-button:focus:not([disabled]) {
                      border: none;
                      background-color: transparent;
                    }
                    .custom-day-picker .rdp-selected:focus:not([disabled]) {
                      background-color: #0070f3;
                    }
                    .custom-day-picker .rdp-day:focus-visible {
                      outline: 2px solid #0070f3;
                      outline-offset: 2px;
                    }
                  `}</style>
                </div>
              )}
            </div>

            <button 
              onClick={() => setSelectedDate(prev => addDays(prev, 1))}
              disabled={isToday(selectedDate)}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            
            {!isToday(selectedDate) && (
              <button 
                onClick={() => setSelectedDate(new Date())}
                className="ml-1 px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-lg transition-colors border border-blue-100/50 dark:border-blue-500/20"
              >
                Today
              </button>
            )}
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700/50"></div>

          <span className="text-xs font-semibold text-slate-500 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            {filteredInvoices.length} {filteredInvoices.length === 1 ? 'Invoice' : 'Invoices'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50/30 dark:bg-transparent">
        <table className="w-full text-sm text-left">
          <thead className="sticky top-0 bg-white dark:bg-[#111b21] border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold tracking-wider text-[11px] shadow-sm z-10">
            <tr>
              <th className="px-6 py-3.5">Action</th>
              <th className="px-6 py-3.5">Client</th>
              <th className="px-6 py-3.5">Invoice</th>
              <th className="px-6 py-3.5">Amount</th>
              <th className="px-6 py-3.5 w-40">Status</th>
              <th className="px-6 py-3.5 text-center">Will Renew</th>
              <th className="px-6 py-3.5 w-72">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 bg-white dark:bg-[#0b141a]">
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-20 text-center text-slate-500 dark:text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <CreditCard className="w-6 h-6 text-slate-400" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-200">No unpaid invoices found</p>
                      <p className="text-xs mt-1">Try selecting a different date from the calendar above.</p>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              filteredInvoices.map((inv) => {
                const record = records[inv.id]
                const clientName = [inv.firstname, inv.lastname].filter(Boolean).join(" ") || inv.companyname || `Client #${inv.userid}`
                const isPhoneValid = inv.phonenumber && inv.phonenumber.replace(/\D/g, '').length >= 10
                
                return (
                  <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4">
                      <button 
                        disabled={!isPhoneValid}
                        onClick={() => {
                          if (isPhoneValid) {
                              const digits = inv.phonenumber.replace(/\D/g, '')
                              triggerDial(digits)
                          }
                        }}
                        className={`inline-flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ${
                          isPhoneValid 
                            ? 'bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white hover:shadow-md dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500 dark:hover:text-white' 
                            : 'bg-slate-50 text-slate-300 cursor-not-allowed dark:bg-slate-800/50 dark:text-slate-600'
                        }`}
                        title={isPhoneValid ? "Call Customer" : "No Valid Phone Number"}
                      >
                        <Phone className="w-4 h-4" strokeWidth={2.5} />
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{clientName}</div>
                      <div className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5 font-mono">{inv.phonenumber || 'No Phone'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <a href={`https://my.hostnin.com/root/invoices.php?action=edit&id=${inv.id}`} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1.5">
                        #{inv.id}
                      </a>
                      <div className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5 whitespace-nowrap">Due: {inv.duedate}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{inv.total} {inv.currencycode}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative w-full max-w-[140px]">
                        <select 
                          value={record?.status || ""} 
                          onChange={(e) => handleUpdate(inv.id, inv.userid, 'status', e.target.value)}
                          className={`appearance-none w-full border text-[11.5px] font-medium rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer shadow-sm ${getStatusColor(record?.status || null)} dark:bg-[#111b21] dark:border-slate-700 dark:text-slate-200`}
                        >
                          <option value="" disabled className="text-slate-400">Select Status...</option>
                          <option value="Answered">Answered</option>
                          <option value="Not Answered">Not Answered</option>
                          <option value="Unreachable">Unreachable</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-50 pointer-events-none" />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1.5 bg-slate-50 dark:bg-[#111b21] p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm w-max mx-auto">
                        <button
                          onClick={() => handleUpdate(inv.id, inv.userid, 'will_renew', 'Yes')}
                          className={`px-3 py-1.5 rounded-md text-[11.5px] font-semibold transition-all ${record?.will_renew === 'Yes' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-800'}`}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => handleUpdate(inv.id, inv.userid, 'will_renew', 'No')}
                          className={`px-3 py-1.5 rounded-md text-[11.5px] font-semibold transition-all ${record?.will_renew === 'No' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-800'}`}
                        >
                          No
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          defaultValue={record?.notes || ""}
                          placeholder="Add conversation notes..."
                          onBlur={(e) => handleNoteBlur(inv.id, inv.userid, e.target.value)}
                          className="w-full bg-white dark:bg-[#111b21] border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-sm rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 shadow-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur()
                            }
                          }}
                        />
                        {savingId === inv.id && (
                          <div className="absolute right-2.5 flex items-center justify-center">
                            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
