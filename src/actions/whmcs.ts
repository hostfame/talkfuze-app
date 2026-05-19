"use server"

import { getClientByPhone, getClientsProducts, getClientsDomains, getTickets, getClientDetailsByEmailFast, getInvoices } from "@/lib/whmcs"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function fetchWhmcsClient(phoneOrEmail: string) {
  try {
    const cleanSearch = phoneOrEmail.trim()
    
    // If it's an email, use direct email lookup first for accuracy
    if (cleanSearch.includes('@')) {
      const emailResult = await getClientDetailsByEmailFast(cleanSearch)
      if (emailResult && emailResult.id) {
        return emailResult
      }
    }

    // Extract digits only
    const digits = cleanSearch.replace(/\D/g, '')
    if (!digits) return null

    // Call custom action to search by phone
    const phoneResult = await getClientByPhone(digits)
    if (phoneResult && phoneResult.clients && phoneResult.clients.length > 0) {
      // Find exact match by comparing digits-only representations
      const exactMatch = phoneResult.clients.find(c => {
        if (!c.phonenumber) return false
        const clientDigits = c.phonenumber.replace(/\D/g, '')
        
        // Exact match of all digits
        if (clientDigits === digits) return true

        // Match if suffix of last 9 digits matches (e.g. 01868123428 vs 8801868123428)
        if (clientDigits.length >= 9 && digits.length >= 9) {
          const clientSuffix = clientDigits.substring(clientDigits.length - 9)
          const searchSuffix = digits.substring(digits.length - 9)
          if (clientSuffix === searchSuffix) return true
        }

        return false
      })

      return exactMatch || phoneResult.clients[0]
    }
    return null
  } catch (error) {
    console.error("Failed to fetch WHMCS client:", error)
    return null
  }
}

export async function fetchWhmcsServices(clientId: number) {
  try {
    const productsRes = await getClientsProducts(clientId, 0, 100)
    const domainsRes = await getClientsDomains(clientId, 0, 100)
    
    return {
      products: productsRes.products || [],
      domains: domainsRes.domains || []
    }
  } catch (error) {
    console.error("Failed to fetch WHMCS services:", error)
    return { products: [], domains: [] }
  }
}

export async function fetchWhmcsTickets(clientId: number) {
  try {
    const ticketsRes = await getTickets(clientId, 0, 50) // fetch more to allow expanding
    return ticketsRes.tickets || []
  } catch (error) {
    console.error("Failed to fetch WHMCS tickets:", error)
    return []
  }
}

import { openTicket } from "@/lib/whmcs"

export async function createWhmcsTicket(clientId: number, deptId: number, subject: string, message: string) {
  try {
    const result = await openTicket(clientId, deptId, subject, message)
    return { success: true, ticket: result }
  } catch (error: any) {
    console.error("Failed to create WHMCS ticket:", error)
    return { success: false, error: error.message || "Failed to create ticket" }
  }
}

export async function fetchWhmcsUnpaidInvoices(clientId: number) {
  try {
    const invoicesRes = await getInvoices(clientId, 0, 100, 'Unpaid')
    return invoicesRes.invoices || []
  } catch (error) {
    console.error("Failed to fetch WHMCS unpaid invoices:", error)
    return []
  }
}

export async function convertChatToTicket(conversationId: string, clientId: number, deptId: number = 1) {
  try {
    // Fetch last 15 messages
    const { data: messages, error } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(15)

    if (error || !messages || messages.length === 0) {
      return { success: false, error: "No messages found to convert." }
    }

    // Sort back to chronological order
    messages.reverse()

    const subjectMsg = messages.find(m => m.sender_type !== 'agent' && m.content)
    const subject = subjectMsg ? subjectMsg.content.substring(0, 50) + "..." : "WhatsApp Chat Escalation"

    const transcript = messages.map(m => 
      `[${new Date(m.created_at).toLocaleString()}] ${m.sender_type === 'agent' ? 'Agent' : 'Customer'}: ${m.content}`
    ).join("\n\n")

    const finalMessage = `This ticket was automatically generated from a TalkFuze chat escalation.\n\n=== CHAT TRANSCRIPT ===\n\n${transcript}`

    const result = await openTicket(clientId, deptId, subject, finalMessage)
    return { success: true, ticket: result }
  } catch (error: any) {
    console.error("Failed to convert chat to WHMCS ticket:", error)
    return { success: false, error: error.message || "Failed to convert ticket" }
  }
}
