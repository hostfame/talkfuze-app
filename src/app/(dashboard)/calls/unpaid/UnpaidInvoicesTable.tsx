"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { Phone, Check, X, CreditCard, ChevronDown, Save, Loader2, Calendar, ChevronLeft, ChevronRight, Zap } from "lucide-react"
import { upsertUnpaidInvoiceCall, triggerAsteriskRobocall } from "@/actions/unpaid-calls"
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
  client_phone: string
  client_email: string
  phonenumber?: string
  email?: string
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
  duration_seconds?: number | null
  recording_url?: string | null
  pressed_digit?: string | null
  agent_talked?: string | null
}

interface Props {
  invoices: Invoice[]
  callRecords: CallRecord[]
}

const getInvoiceType = (dateStr: string, duedateStr: string): 'renewal' | 'new-order' => {
  try {
    const date = new Date(dateStr)
    const duedate = new Date(duedateStr)
    const diffTime = Math.abs(duedate.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays <= 7 ? 'new-order' : 'renewal'
  } catch (e) {
    return 'renewal'
  }
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
  const [robocallingId, setRobocallingId] = useState<number | null>(null)

  const handleRobocall = async (invoiceId: number, phone: string, clientId: number) => {
    setRobocallingId(invoiceId)
    const prev = records[invoiceId] || { invoice_id: invoiceId, client_id: clientId, status: null, will_renew: null, notes: null }
    setRecords(curr => ({ ...curr, [invoiceId]: { ...prev, status: "Dialing" } }))

    const result = await triggerAsteriskRobocall({ invoice_id: invoiceId, phone, client_id: clientId })
    if (!result.success) {
      alert("Failed to initiate robocall: " + result.error)
      setRecords(curr => ({ ...curr, [invoiceId]: prev }))
    }
    setRobocallingId(null)
  }
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const calendarRef = useRef<HTMLDivElement>(null)

  const [activeTab, setActiveTab] = useState<'all' | 'renewals' | 'new-orders'>('all')

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

  const { renewals, newOrders } = useMemo(() => {
    const renewals: Invoice[] = []
    const newOrders: Invoice[] = []
    filteredInvoices.forEach(inv => {
      if (getInvoiceType(inv.date, inv.duedate) === 'new-order') {
        newOrders.push(inv)
      } else {
        renewals.push(inv)
      }
    })
    return { renewals, newOrders }
  }, [filteredInvoices])

  const displayedInvoices = useMemo(() => {
    if (activeTab === 'renewals') return renewals
    if (activeTab === 'new-orders') return newOrders
    return filteredInvoices
  }, [activeTab, filteredInvoices, renewals, newOrders])

  const handleUpdate = async (invoiceId: number, clientId: number, field: string, value: string | null) => {
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
    if (status === 'Dialing') return 'bg-blue-50 text-blue-700 border-blue-200'
    if (status === 'Scheduled') return 'bg-purple-50 text-purple-700 border-purple-200'
    if (status === 'Paid') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
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

          {/* Premium iOS-style Minimalist Tab Switcher */}
          <div className="flex bg-slate-100/80 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200/20 shadow-inner">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 ${activeTab === 'all' ? 'bg-white text-slate-800 dark:bg-[#111b21] dark:text-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              All ({filteredInvoices.length})
            </button>
            <button
              onClick={() => setActiveTab('renewals')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 ${activeTab === 'renewals' ? 'bg-white text-[#0070f3] dark:bg-[#111b21] dark:text-blue-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              Renewals ({renewals.length})
            </button>
            <button
              onClick={() => setActiveTab('new-orders')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 ${activeTab === 'new-orders' ? 'bg-white text-[#0070f3] dark:bg-[#111b21] dark:text-blue-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              New Orders ({newOrders.length})
            </button>
          </div>
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
              <th className="px-6 py-3.5">History</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 bg-white dark:bg-[#0b141a]">
            {displayedInvoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-20 text-center text-slate-500 dark:text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <CreditCard className="w-6 h-6 text-slate-400" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-200">
                        {activeTab === 'renewals' ? 'No unpaid renewals found' : activeTab === 'new-orders' ? 'No unpaid new orders found' : 'No unpaid invoices found'}
                      </p>
                      <p className="text-xs mt-1">Try selecting a different date from the calendar above.</p>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              displayedInvoices.map((inv) => {
                const record = records[inv.id]
                const clientName = [inv.firstname, inv.lastname].filter(Boolean).join(" ") || inv.companyname || `Client #${inv.userid}`
                const phone = inv.client_phone || inv.phonenumber || ''
                const isPhoneValid = phone && phone.replace(/\D/g, '').length >= 10
                
                return (
                  <InvoiceRow key={inv.id} inv={inv} record={record} clientName={clientName} phone={phone} isPhoneValid={isPhoneValid} onUpdate={handleUpdate} onNoteBlur={handleNoteBlur} savingId={savingId} triggerDial={triggerDial} robocallingId={robocallingId} onRobocall={handleRobocall} />
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function InvoiceRow({ inv, record, clientName, phone, isPhoneValid, onUpdate, onNoteBlur, savingId, triggerDial, robocallingId, onRobocall }: any) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [callLogs, setCallLogs] = useState<any[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  
  const fetchLogs = async () => {
    if (isExpanded) {
      setIsExpanded(false)
      return
    }
    
    setIsExpanded(true)
    if (callLogs.length === 0) {
      setLoadingLogs(true)
      try {
        const { getCallHistoryForPhone } = await import('@/actions/unpaid-calls')
        const logs = await getCallHistoryForPhone(phone)
        setCallLogs(logs || [])
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingLogs(false)
      }
    }
  }

  return (
    <>
      <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors group">
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <button 
              disabled={!isPhoneValid}
              onClick={() => {
                if (isPhoneValid) {
                    const digits = phone.replace(/\D/g, '')
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

          </div>
        </td>
        <td className="px-6 py-4">
          <div className="font-semibold text-slate-900 dark:text-slate-100">{clientName}</div>
          <div className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5 font-mono">{phone || 'No Phone'}</div>
          {record && (record.pressed_digit || (record.duration_seconds && record.duration_seconds > 0) || record.agent_talked) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
              {record.pressed_digit === '1' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Pressed 1 (Bridged)
                </span>
              )}
              {record.agent_talked && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200/50 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700/50">
                  Talked: {record.agent_talked.replace('agent_', '')}
                </span>
              )}
              {record.duration_seconds && record.duration_seconds > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200/50 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700/50">
                  {record.duration_seconds}s
                </span>
              )}
              {record.recording_url && (
                <a href={record.recording_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-[#0070f3] border border-blue-100 hover:bg-[#0070f3] hover:text-white transition-colors dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Play Rec
                </a>
              )}
            </div>
          )}
        </td>
        <td className="px-6 py-4">
          <a href={`https://my.hostnin.com/root/invoices.php?action=edit&id=${inv.id}`} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1.5">
            #{inv.id}
          </a>
          <div className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5 whitespace-nowrap">Due: {inv.duedate}</div>
          <div className="mt-1">
            {getInvoiceType(inv.date, inv.duedate) === 'new-order' ? (
              <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-[#0070f3] border border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20">
                New Order
              </span>
            ) : (
              <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200/50 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700/50">
                Renewal
              </span>
            )}
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{inv.total} {inv.currencycode}</div>
        </td>
        <td className="px-6 py-4">
          <CustomStatusDropdown 
            value={record?.status || null}
            onChange={(val) => onUpdate(inv.id, inv.userid, 'status', val)}
          />
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center justify-center gap-1 bg-slate-50 dark:bg-[#111b21] p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm w-max mx-auto">
            <button
              onClick={() => onUpdate(inv.id, inv.userid, 'will_renew', 'Yes')}
              className={`px-3 py-1.5 rounded-md text-[11.5px] font-semibold transition-all ${record?.will_renew === 'Yes' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-800'}`}
            >
              Yes
            </button>
            <button
              onClick={() => onUpdate(inv.id, inv.userid, 'will_renew', 'No')}
              className={`px-3 py-1.5 rounded-md text-[11.5px] font-semibold transition-all ${record?.will_renew === 'No' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-800'}`}
            >
              No
            </button>
            {record?.will_renew && (
              <button
                onClick={() => onUpdate(inv.id, inv.userid, 'will_renew', null)}
                className="px-1.5 py-1.5 ml-0.5 rounded-md text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                title="Clear Selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="relative flex items-center">
            <input
              type="text"
              defaultValue={record?.notes || ""}
              placeholder="Add conversation notes..."
              onBlur={(e) => onNoteBlur(inv.id, inv.userid, e.target.value)}
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
        <td className="px-6 py-4">
          <button
            disabled={!isPhoneValid}
            onClick={fetchLogs}
            className={`p-2 rounded-lg transition-colors ${isExpanded ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:text-slate-300'} disabled:opacity-30 disabled:cursor-not-allowed`}
            title="View Call History"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m16 13-3.5 3.5-2-2"/></svg>
          </button>
        </td>
      </tr>
      
      {isExpanded && (
        <tr>
          <td colSpan={8} className="p-0 border-b-0">
            <div className="bg-slate-50/50 dark:bg-slate-900/30 border-y border-slate-100 dark:border-slate-800 p-4">
              <div className="max-w-4xl mx-auto space-y-3">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                    <Phone className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Call History</h4>
                </div>
                
                {loadingLogs ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading records...
                  </div>
                ) : callLogs.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-2">No call records found for {phone}</p>
                ) : (
                  <div className="bg-white dark:bg-[#111b21] rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Date</th>
                          <th className="px-4 py-3 font-semibold">Agent</th>
                          <th className="px-4 py-3 font-semibold">Direction</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold">Duration</th>
                          <th className="px-4 py-3 font-semibold">Recording</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {callLogs.map(log => (
                          <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {new Date(log.created_at).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                              {log.agent_name || 'Unknown'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${log.direction === 'outbound' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>
                                {log.direction}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[11px] font-semibold ${log.status === 'ANSWERED' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                {log.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-mono text-[12px]">
                              {log.duration_seconds >= 60 ? `${Math.floor(log.duration_seconds / 60)}m ${log.duration_seconds % 60}s` : `${log.duration_seconds}s`}
                            </td>
                            <td className="px-4 py-3">
                              {log.recording_url ? (
                                <audio controls className="h-8 max-w-[200px]" src={log.recording_url} preload="none">
                                  Your browser does not support the audio element.
                                </audio>
                              ) : (
                                <span className="text-xs text-slate-400 italic">No recording</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}


function CustomStatusDropdown({ value, onChange }: { value: string | null, onChange: (val: string | null) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState<'down' | 'up'>('down')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      
      // Calculate remaining space below trigger to decide between drop-down and drop-up
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        // Menu height is ~140px. Use 160px buffer for flawless rendering.
        if (spaceBelow < 160) {
          setDropdownPosition('up')
        } else {
          setDropdownPosition('down')
        }
      }
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const getStatusColor = (status: string | null) => {
    if (status === 'Answered') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
    if (status === 'Not Answered') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
    if (status === 'Unreachable') return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'
    if (status === 'Dialing') return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'
    if (status === 'Scheduled') return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20'
    if (status === 'Paid') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
    return 'bg-white text-slate-500 border-slate-200 dark:bg-[#111b21] dark:border-slate-700 dark:text-slate-200'
  }

  const options = ['Answered', 'Not Answered', 'Unreachable', 'Dialing', 'Scheduled', 'Paid', 'Clear Status']

  return (
    <div className="relative w-full max-w-[140px]" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between w-full border text-[11.5px] font-medium rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm ${getStatusColor(value)}`}
      >
        <span>{value || 'Status'}</span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className={`absolute left-0 w-full z-50 bg-white dark:bg-[#182229] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden animate-in fade-in duration-150 ${
          dropdownPosition === 'up' 
            ? 'bottom-full mb-1.5 slide-in-from-bottom-2' 
            : 'top-full mt-1.5 slide-in-from-top-2'
        }`}>
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                onChange(opt === 'Clear Status' ? null : opt)
                setIsOpen(false)
              }}
              className={`w-full text-left px-3 py-2 text-[11.5px] font-medium transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${value === opt ? 'bg-slate-50 text-blue-600 dark:bg-slate-800 dark:text-blue-400' : opt === 'Clear Status' ? 'text-rose-500 dark:text-rose-400 border-t border-slate-100 dark:border-slate-700/50 mt-1' : 'text-slate-700 dark:text-slate-300'}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
