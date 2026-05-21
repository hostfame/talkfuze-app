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

import { openTicket, addTicketReply } from "@/lib/whmcs"

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

export async function convertChatToTicket(conversationId: string, clientId: number, deptId: number = 1, agentId?: string) {
  try {
    // 1. Fetch last 20 messages to cover the full context of the active chat session
    const { data: messages, error } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20)

    if (error || !messages || messages.length === 0) {
      return { success: false, error: "No messages found to convert." }
    }

    // Sort back to chronological order
    messages.reverse()

    // 2. Fetch conversation with contact details to get the customer's name
    const { data: conversation, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("*, contact:contacts(*)")
      .eq("id", conversationId)
      .single()

    if (convErr) {
      console.error("Failed to fetch conversation details:", convErr)
    }

    const contactName = conversation?.contact?.name || "Customer"

    // 3. Filter out system messages and internal notes
    const publicMessages = messages.filter(m => !m.is_internal && m.sender_type !== 'system')
    if (publicMessages.length === 0) {
      return { success: false, error: "No public messages found to convert." }
    }

    // 4. Resolve agent names from the users table for agent messages
    const agentIds = Array.from(new Set(
      publicMessages
        .filter(m => m.sender_type === 'agent' && m.sender_id)
        .map(m => m.sender_id)
    ))

    const agentNames: Record<string, string> = {}
    if (agentIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, name')
        .in('id', agentIds)
      if (users) {
        users.forEach(u => {
          agentNames[u.id] = u.name
        })
      }
    }

    // Helper function to download and convert image URLs to base64 for WHMCS attachments
    async function fetchImageAsBase64(url: string): Promise<{ name: string; data: string } | null> {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout
        
        const res = await fetch(url, { signal: controller.signal })
        clearTimeout(timeoutId)
        
        if (!res.ok) return null
        const arrayBuffer = await res.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const base64Data = buffer.toString('base64')
        
        const urlParts = url.split('/')
        let filename = urlParts[urlParts.length - 1] || 'attachment.jpg'
        // Clean query parameters from filename if any
        if (filename.includes('?')) {
          filename = filename.split('?')[0]
        }
        
        return {
          name: filename,
          data: base64Data
        }
      } catch (err) {
        console.error("Failed to fetch image for ticket attachment:", err)
        return null
      }
    }

    // Helper function to fetch multiple attachments
    async function fetchAttachments(imageUrls: string[]): Promise<Array<{ name: string; data: string }>> {
      const attachments: Array<{ name: string; data: string }> = []
      for (const url of imageUrls) {
        const attachment = await fetchImageAsBase64(url)
        if (attachment) {
          attachments.push(attachment)
        }
      }
      return attachments
    }

    // 5. Group consecutive public messages from the same sender
    interface GroupedMessage {
      sender_type: 'contact' | 'agent';
      sender_name: string;
      texts: string[];
      imageUrls: string[];
      created_at: string;
    }

    const groups: GroupedMessage[] = []
    let currentGroup: GroupedMessage | null = null

    for (const msg of publicMessages) {
      const isAgent = msg.sender_type === 'agent'
      const senderType = isAgent ? 'agent' : 'contact'
      const senderName = isAgent ? (agentNames[msg.sender_id] || 'Agent') : contactName

      if (currentGroup && currentGroup.sender_type === senderType) {
        if (msg.content_type === 'image' && msg.content) {
          currentGroup.imageUrls.push(msg.content)
          currentGroup.texts.push(`[Image Attachment]`)
        } else if (msg.content) {
          currentGroup.texts.push(msg.content)
        }
      } else {
        currentGroup = {
          sender_type: senderType,
          sender_name: senderName,
          texts: [],
          imageUrls: [],
          created_at: msg.created_at
        }
        if (msg.content_type === 'image' && msg.content) {
          currentGroup.imageUrls.push(msg.content)
          currentGroup.texts.push(`[Image Attachment]`)
        } else if (msg.content) {
          currentGroup.texts.push(msg.content)
        }
        groups.push(currentGroup)
      }
    }

    if (groups.length === 0) {
      return { success: false, error: "No grouped messages generated." }
    }

    // 6. Generate the ticket subject from the oldest customer text message
    const firstCustomerMsg = publicMessages.find(m => m.sender_type !== 'agent' && m.content && m.content_type === 'text')
    const subjectText = firstCustomerMsg ? firstCustomerMsg.content : "WhatsApp Chat Escalation"
    const subject = subjectText.substring(0, 50) + (subjectText.length > 50 ? "..." : "")

    // 7. Open the ticket using the first grouped message
    const firstGroup = groups[0]
    const firstGroupText = firstGroup.texts.join("\n")
    const firstGroupMessage = firstGroup.sender_type === 'agent'
      ? `👨‍💼 [Agent - ${firstGroup.sender_name}]:\n\n${firstGroupText}`
      : firstGroupText

    const firstGroupAttachments = await fetchAttachments(firstGroup.imageUrls)

    const result = await openTicket(clientId, deptId, subject, firstGroupMessage, undefined, firstGroupAttachments)
    if (!result || !result.id) {
      return { success: false, error: "Failed to open WHMCS ticket." }
    }

    const ticketId = result.id

    // 8. Add subsequent grouped messages as ticket replies in order
    for (const group of groups.slice(1)) {
      const groupText = group.texts.join("\n")
      const groupMessage = group.sender_type === 'agent'
        ? `👨‍💼 [Agent - ${group.sender_name}]:\n\n${groupText}`
        : groupText

      const groupAttachments = await fetchAttachments(group.imageUrls)
      
      // Post each reply sequentially to preserve order
      await addTicketReply(ticketId, groupMessage, clientId, groupAttachments)
    }

    // 9. Auto-insert system message into the conversation
    await supabaseAdmin.from('messages').insert({
      conversation_id: conversationId,
      org_id: messages[0].org_id,
      sender_type: 'system',
      sender_id: agentId || null,
      content: `Your ticket is created: #${result.tid || ''}`,
      content_type: 'system',
      is_internal: false,
      status: 'delivered',
    })

    return { success: true, ticket: result }
  } catch (error: any) {
    console.error("Failed to convert chat to WHMCS ticket:", error)
    return { success: false, error: error.message || "Failed to convert ticket" }
  }
}

import { createSsoToken } from "@/lib/whmcs"

export async function generateWHMCSSsoToken(clientId: number) {
  try {
    const result = await createSsoToken(clientId);
    return { success: true, redirect_url: result.redirect_url }
  } catch (error: any) {
    console.error("Failed to generate SSO token:", error)
    return { success: false, error: error.message || "Failed to generate token" }
  }
}
