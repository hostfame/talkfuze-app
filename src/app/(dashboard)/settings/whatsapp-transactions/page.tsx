"use client"

import { useCallback, useEffect, useState } from "react"
import { MessageSquare, Save, Loader2, Key, Code, HelpCircle, FileText, CheckCircle2, AlertCircle, Edit3, X, Eye, EyeOff } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"

// Definitive list of premium WHMCS notification events and descriptions
const DEFAULT_TEMPLATES = [
  {
    name: "InvoiceCreated",
    description: "Fires when a new invoice is generated in WHMCS.",
    variables: "{firstname}, {lastname}, {invoiceid}, {total}, {duedate}, {invoiceurl}",
    template: "Hi {firstname}, a new invoice (#{invoiceid}) for {total} is ready. It's due on {duedate}.\n\nWhenever you have a moment, please check your invoice to pay. Let us know if you need any help!\n\nPay here: {invoiceurl}"
  },
  {
    name: "InvoicePaymentReminder",
    description: "Fires for standard unpaid invoice payment reminders.",
    variables: "{firstname}, {lastname}, {invoiceid}, {total}, {duedate}, {invoiceurl}",
    template: "Hi {firstname}, just a quick reminder that invoice #{invoiceid} for {total} is due on {duedate}.\n\nPlease settle it when you get a chance to keep everything running smoothly!\n\nPay here: {invoiceurl}"
  },
  {
    name: "InvoiceFirstOverdueReminder",
    description: "Fires when an invoice becomes 1 day overdue.",
    variables: "{firstname}, {lastname}, {invoiceid}, {total}, {duedate}, {invoiceurl}",
    template: "Hi {firstname}, looks like invoice #{invoiceid} for {total} is now overdue.\n\nPlease clear the balance soon so your services aren't interrupted!\n\nPay here: {invoiceurl}"
  },
  {
    name: "InvoiceSecondOverdueReminder",
    description: "Fires when an invoice becomes 3 days overdue.",
    variables: "{firstname}, {lastname}, {invoiceid}, {total}, {duedate}, {invoiceurl}",
    template: "Hi {firstname}, this is our second reminder about your overdue invoice #{invoiceid} for {total}.\n\nPlease settle it as soon as possible to avoid any disruptions.\n\nPay here: {invoiceurl}"
  },
  {
    name: "InvoiceThirdOverdueReminder",
    description: "Fires when an invoice becomes 5 days overdue (final warning).",
    variables: "{firstname}, {lastname}, {invoiceid}, {total}, {duedate}, {invoiceurl}",
    template: "Hi {firstname}, your service is pending suspension due to unpaid invoice #{invoiceid} ({total}).\n\nPlease pay immediately to keep your services active.\n\nPay here: {invoiceurl}"
  },
  {
    name: "InvoicePaid",
    description: "Fires instantly when an invoice is fully paid.",
    variables: "{firstname}, {lastname}, {invoiceid}, {total}, {transid}",
    template: "Hi {firstname}, thank you! We received your payment of {total} for invoice #{invoiceid}. Your services are fully updated and active.\n\nAny questions? just reply!"
  },
  {
    name: "InvoiceRefunded",
    description: "Fires when an invoice is refunded.",
    variables: "{firstname}, {lastname}, {invoiceid}, {total}",
    template: "Hi {firstname}, your invoice #{invoiceid} for {total} has been successfully refunded to your account.\n\nLet us know if you need anything else!"
  },
  {
    name: "AfterModuleCreate",
    description: "Fires when a hosting plan or service is successfully activated.",
    variables: "{firstname}, {lastname}, {domain}, {productname}",
    template: "Welcome aboard, {firstname}! Your new service '{productname}' for '{domain}' is now up and running.\n\nWe've emailed you the setup details. Let us know if you need a hand getting started!"
  },
  {
    name: "AfterModuleSuspend",
    description: "Fires when a service is automatically suspended due to overdue invoices.",
    variables: "{firstname}, {lastname}, {domain}, {productname}, {suspendreason}",
    template: "Hi {firstname}, your service '{productname}' ({domain}) has been suspended. Reason: {suspendreason}.\n\nPlease resolve any outstanding invoices to get it back online."
  },
  {
    name: "AfterModuleUnsuspend",
    description: "Fires when a service is automatically unsuspended post-payment.",
    variables: "{firstname}, {lastname}, {domain}, {productname}",
    template: "Great news, {firstname}! Your service '{productname}' ({domain}) is back online and fully active.\n\nThanks for your payment, and let us know if you need any help!"
  },
  {
    name: "AfterModuleTerminate",
    description: "Fires when a suspended service is terminated and files deleted.",
    variables: "{firstname}, {lastname}, {domain}, {productname}",
    template: "Hi {firstname}, unfortunately your service '{productname}' for '{domain}' has been terminated due to non-payment.\n\nIf this was a mistake, please reach out to us right away."
  },
  {
    name: "TicketOpen",
    description: "Fires when a client opens a new support ticket.",
    variables: "{firstname}, {lastname}, {ticketid}, {ticketsubject}, {ticketdept}",
    template: "Hi {firstname}, we've got your message! Ticket #{ticketid} ('{ticketsubject}') is now open with our {ticketdept} team.\n\nWe'll get back to you shortly!"
  },
  {
    name: "TicketReply",
    description: "Fires when a staff member replies to a support ticket.",
    variables: "{firstname}, {lastname}, {ticketid}, {ticketsubject}, {ticketurl}",
    template: "Hi {firstname}, our team just replied to your ticket #{ticketid} ('{ticketsubject}').\n\nYou can view the response here: {ticketurl}"
  },
  {
    name: "TicketClose",
    description: "Fires when a support ticket is marked as closed.",
    variables: "{firstname}, {lastname}, {ticketid}, {ticketsubject}",
    template: "Hi {firstname}, we've closed your ticket #{ticketid} ('{ticketsubject}').\n\nThanks for reaching out, and let us know if you ever need help again!"
  },
  {
    name: "ClientLoginShare",
    description: "Fires upon successful client portal login.",
    variables: "{firstname}, {lastname}, {ipaddr}, {timestamp}",
    template: "Security Alert: A new login was detected for your account from IP {ipaddr} at {timestamp}.\n\nIf this wasn't you, please change your password immediately."
  },
  {
    name: "ClientPasswordChange",
    description: "Fires when a client portal password is reset or updated.",
    variables: "{firstname}, {lastname}",
    template: "Hi {firstname}, just letting you know your client area password was successfully updated.\n\nIf you didn't do this, please contact us immediately!"
  },
  {
    name: "ServicePasswordChange",
    description: "Fires when a service (e.g. cPanel/Virtualizor) password is changed.",
    variables: "{firstname}, {lastname}, {domain}, {username}",
    template: "Hi {firstname}, the password for your service user {username} ({domain}) was just updated.\n\nIf you didn't request this, please let us know!"
  },
  {
    name: "DomainRegistration",
    description: "Fires when a domain registration is completed.",
    variables: "{firstname}, {lastname}, {domain}, {expirydate}",
    template: "Woohoo! {firstname}, your domain {domain} is now officially registered until {expirydate}.\n\nThanks for choosing us for your web journey!"
  },
  {
    name: "DomainTransfer",
    description: "Fires when a domain transfer is successfully completed.",
    variables: "{firstname}, {lastname}, {domain}",
    template: "Great news, {firstname}! Your domain {domain} transfer is complete and now fully active in your account."
  },
  {
    name: "DomainRenewal",
    description: "Fires when a domain is renewed.",
    variables: "{firstname}, {lastname}, {domain}, {expirydate}",
    template: "Awesome! {firstname}, your domain {domain} has been successfully renewed until {expirydate}.\n\nThanks for sticking with us!"
  },
  {
    name: "DomainExpiration",
    description: "Fires when a domain registration expires.",
    variables: "{firstname}, {lastname}, {domain}",
    template: "Hi {firstname}, heads up! Your domain {domain} has expired.\n\nPlease renew it right away so you don't lose it."
  },
  {
    name: "ClientRegistration",
    description: "Fires when a new user signs up on your WHMCS portal.",
    variables: "{firstname}, {lastname}, {email}",
    template: "Welcome to Hostnin, {firstname}! We're thrilled to have you on board.\n\nYour account is all set up. Let us know if you need any help getting started!"
  }
]

export default function WhatsAppTransactionsPage() {
  const currentUser = useAuth()
  const ORG_ID = currentUser.org_id

  const [isLoading, setIsLoading] = useState(true)
  const [isSavingToken, setIsSavingToken] = useState(false)
  const [isPopulating, setIsPopulating] = useState(false)
  const [whmcsToken, setWhmcsToken] = useState("")
  const [showToken, setShowToken] = useState(false)

  // Template management states
  const [templates, setTemplates] = useState<any[]>([])
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null)
  const [editBody, setEditBody] = useState("")
  const [editActive, setEditActive] = useState(true)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)

  // Load organization settings & templates
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    
    // 1. Fetch WHMCS Token from organization settings
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", ORG_ID)
      .single()

    if (org?.settings) {
      setWhmcsToken(org.settings.whmcs_token || "")
    }

    // 2. Fetch Active templates
    const { data: dbTemplates } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("org_id", ORG_ID)
      .order("name", { ascending: true })

    if (dbTemplates) {
      setTemplates(dbTemplates)
    }

    setIsLoading(false)
  }, [ORG_ID])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // Generate a premium cryptographically secure token
  const handleGenerateToken = async () => {
    setIsSavingToken(true)
    const randomBytes = new Uint8Array(24)
    window.crypto.getRandomValues(randomBytes)
    const newToken = "tk_" + Array.from(randomBytes, byte => byte.toString(16).padStart(2, "0")).join("")

    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", ORG_ID)
      .single()

    const updatedSettings = {
      ...(org?.settings || {}),
      whmcs_token: newToken
    }

    const { error } = await supabase
      .from("organizations")
      .update({ settings: updatedSettings })
      .eq("id", ORG_ID)

    if (error) {
      alert("Failed to update API Token.")
    } else {
      setWhmcsToken(newToken)
      setShowToken(true)
    }
    setIsSavingToken(false)
  }

  // Pre-seed the DB templates
  const handlePreSeedTemplates = async () => {
    setIsPopulating(true)
    
    const insertPayload = DEFAULT_TEMPLATES.map(t => ({
      org_id: ORG_ID,
      name: t.name,
      description: t.description,
      variables: t.variables,
      template: t.template,
      active: true
    }))

    const { error } = await supabase
      .from("whatsapp_templates")
      .upsert(insertPayload, { onConflict: "org_id,name" })

    if (error) {
      console.error(error)
      alert("Failed to pre-populate templates.")
    } else {
      alert("Standard Hostnin templates pre-populated successfully!")
      void fetchData()
    }
    setIsPopulating(false)
  }

  // Quick toggle active state
  const handleToggleTemplate = async (templateId: string, currentActive: boolean) => {
    const { error } = await supabase
      .from("whatsapp_templates")
      .update({ active: !currentActive, updated_at: new Date().toISOString() })
      .eq("id", templateId)

    if (error) {
      alert("Failed to toggle template status.")
    } else {
      setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, active: !currentActive } : t))
    }
  }

  // Open edit modal
  const handleOpenEdit = (template: any) => {
    setEditingTemplate(template)
    setEditBody(template.template)
    setEditActive(template.active)
  }

  // Save template edit
  const handleSaveTemplate = async () => {
    if (!editingTemplate) return
    setIsSavingTemplate(true)

    const { error } = await supabase
      .from("whatsapp_templates")
      .update({
        template: editBody,
        active: editActive,
        updated_at: new Date().toISOString()
      })
      .eq("id", editingTemplate.id)

    if (error) {
      alert("Failed to save template edits.")
    } else {
      setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? { ...t, template: editBody, active: editActive } : t))
      setEditingTemplate(null)
    }
    setIsSavingTemplate(false)
  }

  // Raw display for the PHP WHMCS Hooks script
  const phpScriptContent = `<?php
/**
 * TalkFuze Native WhatsApp Transactional Notifications hook
 * Place in: WHMCS_PATH/includes/hooks/talkfuze_hooks.php
 */

if (!defined("WHMCS")) {
    die("This file cannot be accessed directly");
}

function talkfuze_dispatch_whatsapp($eventName, $recipientPhone, $params = []) {
    $apiToken = "${whmcsToken || 'YOUR_API_TOKEN_HERE'}";
    $apiUrl = "https://app.talkfuze.com/api/v1/whatsapp/send";

    if (empty($apiToken) || empty($recipientPhone)) {
        return false;
    }

    $payload = [
        "to" => $recipientPhone,
        "event" => $eventName,
        "params" => $params
    ];

    $ch = curl_init($apiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "POST");
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Content-Type: application/json",
        "Authorization: Bearer " . $apiToken
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ($httpCode === 200);
}

// 1. Invoice Hooks
add_hook('InvoiceCreated', 1, function($vars) {
    $invoiceId = $vars['invoiceid'];
    $data = localAPI("GetInvoice", ["invoiceid" => $invoiceId]);
    if ($data['result'] == 'success') {
        $client = localAPI("GetClientsDetails", ["clientid" => $data['userid']]);
        talkfuze_dispatch_whatsapp("InvoiceCreated", $client['phonenumber'], [
            "firstname" => $client['firstname'],
            "lastname" => $client['lastname'],
            "invoiceid" => $invoiceId,
            "total" => $data['total'],
            "duedate" => date("jS F", strtotime($data['duedate'])),
            "invoiceurl" => "https://yourwhmcs.com/viewinvoice.php?id=" . $invoiceId
        ]);
    }
});

add_hook('InvoicePaid', 1, function($vars) {
    $invoiceId = $vars['invoiceid'];
    $data = localAPI("GetInvoice", ["invoiceid" => $invoiceId]);
    if ($data['result'] == 'success') {
        $client = localAPI("GetClientsDetails", ["clientid" => $data['userid']]);
        talkfuze_dispatch_whatsapp("InvoicePaid", $client['phonenumber'], [
            "firstname" => $client['firstname'],
            "lastname" => $client['lastname'],
            "invoiceid" => $invoiceId,
            "total" => $data['total']
        ]);
    }
});

// 2. Module Activation/Suspension Hooks
add_hook('AfterModuleCreate', 1, function($vars) {
    $params = $vars['params'];
    $client = localAPI("GetClientsDetails", ["clientid" => $params['userid']]);
    talkfuze_dispatch_whatsapp("AfterModuleCreate", $client['phonenumber'], [
        "firstname" => $client['firstname'],
        "lastname" => $client['lastname'],
        "domain" => $params['domain'],
        "productname" => $params['packageproperties']['name'] ?? 'Service'
    ]);
});

add_hook('AfterModuleSuspend', 1, function($vars) {
    $params = $vars['params'];
    $client = localAPI("GetClientsDetails", ["clientid" => $params['userid']]);
    talkfuze_dispatch_whatsapp("AfterModuleSuspend", $client['phonenumber'], [
        "firstname" => $client['firstname'],
        "lastname" => $client['lastname'],
        "domain" => $params['domain'],
        "productname" => $params['packageproperties']['name'] ?? 'Service',
        "suspendreason" => $vars['suspendreason'] ?? 'Overdue Invoices'
    ]);
});

add_hook('AfterModuleUnsuspend', 1, function($vars) {
    $params = $vars['params'];
    $client = localAPI("GetClientsDetails", ["clientid" => $params['userid']]);
    talkfuze_dispatch_whatsapp("AfterModuleUnsuspend", $client['phonenumber'], [
        "firstname" => $client['firstname'],
        "lastname" => $client['lastname'],
        "domain" => $params['domain'],
        "productname" => $params['packageproperties']['name'] ?? 'Service'
    ]);
});

// 3. Support Ticket Hooks
add_hook('TicketOpen', 1, function($vars) {
    $client = localAPI("GetClientsDetails", ["clientid" => $vars['userid']]);
    talkfuze_dispatch_whatsapp("TicketOpen", $client['phonenumber'], [
        "firstname" => $client['firstname'],
        "lastname" => $client['lastname'],
        "ticketid" => $vars['ticketmask'],
        "ticketsubject" => $vars['subject'],
        "ticketdept" => $vars['deptname']
    ]);
});

add_hook('TicketStaffReply', 1, function($vars) {
    $client = localAPI("GetClientsDetails", ["clientid" => $vars['userid']]);
    talkfuze_dispatch_whatsapp("TicketReply", $client['phonenumber'], [
        "firstname" => $client['firstname'],
        "lastname" => $client['lastname'],
        "ticketid" => $vars['ticketmask'],
        "ticketsubject" => $vars['subject'],
        "ticketurl" => "https://yourwhmcs.com/viewticket.php?tid=" . $vars['ticketmask'] . "&c=" . $vars['ticketcode']
    ]);
});
`;

  return (
    <div className="space-y-6 relative animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="text-blue-500" /> WhatsApp Transactional Alerts
          </h1>
          <p className="text-sm text-slate-500 mt-1">Connect WHMCS natively to send beautiful automated billing, support, and account notifications directly to customers.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Left Column: API Token and Integration Hook Instructions */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Secure Token Box */}
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Key className="text-slate-400" size={18} /> API Access Credentials
              </h3>
              <p className="text-xs text-slate-500">Generate a unique authorization key to link your WHMCS billing systems securely to this TalkFuze instance.</p>
              
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showToken ? "text" : "password"}
                    value={whmcsToken}
                    readOnly
                    placeholder="No token active..."
                    className="w-full pl-3 pr-8 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {whmcsToken && (
                    <button
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                </div>
                <button
                  onClick={handleGenerateToken}
                  disabled={isSavingToken}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shrink-0 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSavingToken ? <Loader2 size={14} className="animate-spin" /> : "Regen"}
                </button>
              </div>

              {whmcsToken && (
                <div className="pt-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg">
                  <CheckCircle2 size={16} /> Token active & operational.
                </div>
              )}
            </div>

            {/* Instruction Guide & File Code */}
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Code className="text-slate-400" size={18} /> WHMCS Hook Integration
              </h3>
              <p className="text-xs text-slate-500">To implement, create a new PHP hooks file named <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-700 dark:text-slate-300">talkfuze_hooks.php</code> and upload it to WHMCS directory: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-700 dark:text-slate-300">/includes/hooks/</code>.</p>
              
              <div className="bg-slate-900 text-slate-300 p-3 rounded-lg overflow-x-auto max-h-56 text-xs font-mono border border-slate-800 custom-scrollbar">
                <pre>{phpScriptContent}</pre>
              </div>

              <button
                onClick={() => {
                  const blob = new Blob([phpScriptContent], { type: "text/plain" })
                  const url = URL.createObjectURL(blob)
                  const link = document.createElement("a")
                  link.href = url
                  link.download = "talkfuze_hooks.php"
                  link.click()
                }}
                className="w-full py-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <FileText size={14} /> Download Hooks File
              </button>
            </div>

          </div>

          {/* Right Column: Templates Management list */}
          <div className="lg:col-span-2 space-y-6">
            
            {templates.length === 0 ? (
              <div className="bg-white dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-8 text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full flex items-center justify-center">
                  <MessageSquare size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white text-base">No templates initialized</h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-sm">Create and map WhatsApp alert event templates matching WHMCS triggers to start auto-messaging.</p>
                </div>
                <button
                  onClick={handlePreSeedTemplates}
                  disabled={isPopulating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {isPopulating && <Loader2 size={16} className="animate-spin" />}
                  Pre-populate 22 Hostnin Alerts
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Active Alerts ({templates.length})</h2>
                  <button
                    onClick={handlePreSeedTemplates}
                    disabled={isPopulating}
                    className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-semibold flex items-center gap-1"
                  >
                    Reset to Default Templates
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates.map(t => (
                    <div key={t.id} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4.5 shadow-sm flex flex-col justify-between space-y-3 relative hover:shadow-md transition-shadow">
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="font-semibold text-slate-900 dark:text-white text-sm break-all pr-2">{t.name}</span>
                          <label className="relative inline-flex items-center cursor-pointer scale-75 shrink-0">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={t.active}
                              onChange={() => handleToggleTemplate(t.id, t.active)}
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{t.description}</p>
                        
                        <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-xs text-slate-600 dark:text-slate-300 font-mono italic break-words border border-slate-100 dark:border-slate-800 line-clamp-3">
                          {t.template}
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-900">
                        <span className="text-[10px] text-slate-400 font-mono">
                          Vars: {t.variables.split(',').length} total
                        </span>
                        <button
                          onClick={() => handleOpenEdit(t)}
                          className="text-xs text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 size={12} /> Edit Template
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            )}

          </div>

        </div>
      )}

      {/* Editing Drawer / Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-end animate-in fade-in duration-300">
          <div className="w-full max-w-xl h-full bg-white dark:bg-slate-950 p-6 flex flex-col justify-between shadow-2xl relative animate-in slide-in-from-right duration-300 border-l border-slate-200 dark:border-slate-800">
            
            <div className="space-y-6">
              
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingTemplate.name} Notification</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{editingTemplate.description}</p>
                </div>
                <button
                  onClick={() => setEditingTemplate(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Toggle Status */}
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <div>
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Alert Status</h4>
                  <p className="text-[10px] text-slate-400">Toggle whether this automated alert is active.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Message Body Field */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Message Body Template</label>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
                  placeholder="Enter message template text here..."
                />
              </div>

              {/* Available shortcode variables */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <HelpCircle size={14} className="text-slate-400" /> Supported Shortcodes (Variables)
                </h4>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {editingTemplate.variables.split(',').map((variable: string) => (
                    <button
                      key={variable}
                      onClick={() => {
                        setEditBody(prev => prev + " " + variable.trim())
                      }}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-300 rounded font-mono text-[10px] border border-slate-200 dark:border-slate-800 transition-colors"
                      title="Click to insert"
                    >
                      {variable.trim()}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Copy and wrap these tags in curly braces (e.g. <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded">{"{firstname}"}</code>) inside the template text.</p>
              </div>

            </div>

            <div className="flex gap-3 pt-6 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setEditingTemplate(null)}
                className="flex-1 py-2.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={isSavingTemplate}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isSavingTemplate && <Loader2 size={14} className="animate-spin" />}
                Save Changes
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
