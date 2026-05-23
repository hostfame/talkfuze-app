"use server"

import { getClientByPhone, getClientsProducts, getClientsDomains, getTickets, getClientDetailsByEmailFast, getInvoices, getClientDetails } from "@/lib/whmcs"
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

      const matchedClient = exactMatch || phoneResult.clients[0]
      if (matchedClient && matchedClient.id) {
        try {
          const fullClient = await getClientDetails(matchedClient.id)
          if (fullClient && fullClient.result === 'success') {
            return fullClient
          }
        } catch (e) {
          console.error("Failed to fetch full client details by id:", e)
        }
      }
      return matchedClient
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
    // 1. Fetch last 60 minutes of messages from the latest message
    const { data: latestMsg } = await supabaseAdmin
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (!latestMsg) {
      return { success: false, error: "No messages found to convert." }
    }

    const sixtyMinutesBeforeLatest = new Date(new Date(latestMsg.created_at).getTime() - 60 * 60 * 1000).toISOString()

    const { data: messages, error } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .gte("created_at", sixtyMinutesBeforeLatest)
      .order("created_at", { ascending: false })

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

    // Helper function to download and convert media URLs to base64 for WHMCS attachments
    async function fetchMediaAsBase64(url: string): Promise<{ name: string; data: string } | null> {
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
        let filename = urlParts[urlParts.length - 1] || 'attachment.bin'
        // Clean query parameters from filename if any
        if (filename.includes('?')) {
          filename = filename.split('?')[0]
        }
        
        // If it doesn't have an extension but it's an audio file, add .ogg
        if (!filename.includes('.') && url.includes('audio')) {
          filename += '.ogg'
        } else if (!filename.includes('.')) {
          filename += '.jpg'
        }
        
        return {
          name: filename,
          data: base64Data
        }
      } catch (err) {
        console.error("Failed to fetch media for ticket attachment:", err)
        return null
      }
    }

    // Helper function to transcribe audio using OpenAI Whisper
    async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string | null> {
      try {
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
          console.warn('OPENAI_API_KEY is not set. Skipping transcription.')
          return null
        }

        const formData = new FormData()
        // Convert Buffer to File/Blob equivalent for FormData
        const blob = new Blob([new Uint8Array(audioBuffer)], { type: filename.endsWith('.mp3') ? 'audio/mp3' : 'audio/ogg' })
        formData.append('file', blob, filename)
        formData.append('model', 'whisper-1')

        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
          body: formData as any,
        })

        if (!res.ok) {
          const err = await res.text()
          console.error('Whisper transcription failed:', err)
          return null
        }

        const data = await res.json()
        return data.text || null
      } catch (err) {
        console.error('Failed to transcribe audio:', err)
        return null
      }
    }

    // Helper function to fetch multiple attachments and transcribe audio
    async function fetchAttachmentsAndTranscribe(mediaUrls: string[], texts: string[]): Promise<Array<{ name: string; data: string }>> {
      const attachments: Array<{ name: string; data: string }> = []
      
      for (let i = 0; i < mediaUrls.length; i++) {
        const url = mediaUrls[i]
        const attachment = await fetchMediaAsBase64(url)
        
        if (attachment) {
          attachments.push(attachment)
          
          // If it's an audio file, attempt transcription
          if (attachment.name.endsWith('.ogg') || attachment.name.endsWith('.mp3') || attachment.name.endsWith('.wav')) {
             const buffer = Buffer.from(attachment.data, 'base64')
             const transcription = await transcribeAudio(buffer, attachment.name)
             if (transcription) {
                // Find the placeholder and replace/append the transcription
                const listenPlaceholder = `(Listen: ${url})`
                const textIndex = texts.findIndex(t => t.includes(listenPlaceholder))
                if (textIndex !== -1) {
                  texts[textIndex] = texts[textIndex].replace(listenPlaceholder, `(Listen: ${url})\n🎤 **Transcription:** "${transcription}"`)
                }
             }
          }
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

      let safeMeta: any = {}
      if (typeof msg.metadata === 'string') {
        try { safeMeta = JSON.parse(msg.metadata) } catch (e) {}
      } else {
        safeMeta = msg.metadata || {}
      }

      // Extract the correct media URL from metadata.media_url if it's an image or audio
      const mediaUrl = (msg.content_type === 'image' || msg.content_type === 'audio')
        ? (safeMeta.media_url || safeMeta.url || (msg.content && msg.content.startsWith('http') ? msg.content : null))
        : null

      if (currentGroup && currentGroup.sender_type === senderType) {
        if (mediaUrl) {
          currentGroup.imageUrls.push(mediaUrl)
          currentGroup.texts.push(msg.content_type === 'audio' ? `[Audio Attachment] (Listen: ${mediaUrl})` : `[Image Attachment]`)
          // Preserve caption if any
          if (msg.content && msg.content !== '[Image]' && msg.content !== '[Audio Voice Message]') {
            currentGroup.texts.push(msg.content)
          }
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
        if (mediaUrl) {
          currentGroup.imageUrls.push(mediaUrl)
          currentGroup.texts.push(msg.content_type === 'audio' ? `[Audio Attachment] (Listen: ${mediaUrl})` : `[Image Attachment]`)
          // Preserve caption if any
          if (msg.content && msg.content !== '[Image]' && msg.content !== '[Audio Voice Message]') {
            currentGroup.texts.push(msg.content)
          }
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
    const firstGroupAttachments = await fetchAttachmentsAndTranscribe(firstGroup.imageUrls, firstGroup.texts)
    
    // texts array may have been modified by fetchAttachmentsAndTranscribe with transcription
    const firstGroupText = firstGroup.texts.join("\n")
    const firstGroupMessage = firstGroup.sender_type === 'agent'
      ? `👨‍💼 [Agent - ${firstGroup.sender_name}]:\n\n${firstGroupText}`
      : firstGroupText

    const result = await openTicket(clientId, deptId, subject, firstGroupMessage, undefined, firstGroupAttachments)
    if (!result || !result.id) {
      return { success: false, error: "Failed to open WHMCS ticket." }
    }

    const ticketId = result.id

    // 8. Add subsequent grouped messages as ticket replies in order
    for (const group of groups.slice(1)) {
      const groupAttachments = await fetchAttachmentsAndTranscribe(group.imageUrls, group.texts)
      
      const groupText = group.texts.join("\n")
      const groupMessage = group.sender_type === 'agent'
        ? `👨‍💼 [Agent - ${group.sender_name}]:\n\n${groupText}`
        : groupText
      
      // Post each reply sequentially to preserve order, and suppress email notifications to prevent customer inbox flooding.
      await addTicketReply(ticketId, groupMessage, clientId, groupAttachments, true)
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

    // 10. Tag the conversation as ticketed, but keep it open
    const { data: convData } = await supabaseAdmin.from('conversations').select('tags').eq('id', conversationId).single()
    const existingTags = convData?.tags || []
    const newTags = Array.from(new Set([...existingTags, 'ticketed']))

    await supabaseAdmin.from('conversations').update({
      tags: newTags
    }).eq('id', conversationId)

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

export async function generateWHMCSControlPanelSsoToken(clientId: number, serviceId: number) {
  try {
    const result = await createSsoToken(clientId, 'sso:custom_redirect', `clientarea.php?action=productdetails&id=${serviceId}&dosinglesignon=1`);
    return { success: true, redirect_url: result.redirect_url }
  } catch (error: any) {
    console.error("Failed to generate cPanel SSO token:", error)
    return { success: false, error: error.message || "Failed to generate token" }
  }
}

export async function unblockIP(ip: string, clientId: number) {
  try {
    const { unblockWhmcsIP } = await import('@/lib/whmcs')
    return await unblockWhmcsIP(ip, clientId)
  } catch (error: any) {
    console.error("Failed to unblock IP:", error)
    return { result: 'error', message: error.message || "Failed to unblock IP" }
  }
}
