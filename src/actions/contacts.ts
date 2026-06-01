"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"
import { createClient } from "@/lib/supabase/server"
import type { Contact } from "@/lib/types"
import { unstable_noStore as noStore } from "next/cache"

type ContactConversation = {
  id: string
  last_message_at: string | null
  channels?: { type?: string | null } | null
}

type ContactWithConversations = Contact & {
  conversations?: ContactConversation[] | null
  labels?: string[] | null
}

function isValidPhone(phone: string | null): boolean {
  if (!phone) return false
  return /^[+]?[0-9]{10,15}$/.test(phone.replace(/[\s\-\(\)]/g, ''))
}

function isValidEmail(email: string | null): boolean {
  if (!email) return false
  return /^[^@]+@[^@]+\.[^@]+$/.test(email)
}

function getDisplayPhone(contact: ContactWithConversations): string | null {
  // Only show phone if it's a real phone number, NOT a UUID or garbage
  if (isValidPhone(contact.phone)) return contact.phone
  // For WhatsApp, extract phone from platform_id (format: 8801234567890@s.whatsapp.net)
  if (contact.platform_type === 'whatsapp' && contact.platform_id) {
    const raw = contact.platform_id.split('@')[0]
    if (/^[0-9]{10,15}$/.test(raw)) return `+${raw}`
  }
  return null
}

async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const { data: profile } = await supabaseAdmin.from("users").select("org_id").eq("id", user.id).single()
  if (!profile) throw new Error("Profile not found")
  return profile.org_id
}

export async function getContacts(page: number = 1, pageSize: number = 100, search?: string, labelFilter?: string) {
  noStore()
  const org_id = await getOrgId()

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabaseAdmin
    .from('contacts')
    .select(`
      *,
      labels,
      conversations (id, last_message_at, channels (type))
    `, { count: 'exact' })
    .eq('org_id', org_id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (search && search.trim()) {
    const s = search.trim()
    query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`)
  }

  if (labelFilter && labelFilter !== 'all') {
    query = query.contains('labels', [labelFilter])
  }

  const { data, error, count } = await query

  if (error) {
    console.error('Error fetching contacts:', error)
    return { contacts: [], totalCount: 0 }
  }

  const now = Date.now()

  const contacts = (data as ContactWithConversations[]).map(contact => {
    const sortedConvs = [...(contact.conversations || [])].sort((a, b) => {
      const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
      const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
      return timeB - timeA
    })

    const latestConv = sortedConvs[0]
    const lastContactedAt = latestConv?.last_message_at || contact.created_at
    const hoursSinceContact = (now - new Date(lastContactedAt).getTime()) / 3600000

    // Contact score: 0-100 based on message count, recency, has phone+email
    const msgCount = contact.conversations?.length || 0
    const hasPhone = isValidPhone(contact.phone) || (contact.platform_type === 'whatsapp')
    const hasEmail = isValidEmail(contact.email)
    const recencyScore = Math.max(0, 100 - hoursSinceContact * 2)
    const engagementScore = Math.min(40, msgCount * 4)
    const dataScore = (hasPhone ? 10 : 0) + (hasEmail ? 10 : 0)
    const contactScore = Math.round(Math.min(100, recencyScore * 0.5 + engagementScore + dataScore))

    return {
      ...contact,
      labels: contact.labels || [],
      displayPhone: getDisplayPhone(contact),
      conversation_count: contact.conversations?.length || 0,
      last_contacted_at: lastContactedAt,
      channel_type: latestConv?.channels?.type || contact.platform_type || 'unknown',
      latest_conversation_id: latestConv?.id || null,
      is_at_risk: hoursSinceContact >= 24 && msgCount > 0,
      contact_score: contactScore,
    }
  })

  return { contacts, totalCount: count || 0 }
}

export async function createContact(data: {
  name: string
  phone?: string
  email?: string
  labels?: string[]
}) {
  const org_id = await getOrgId()

  const platform_id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  const { error } = await supabaseAdmin.from('contacts').insert({
    org_id,
    platform_id,
    platform_type: 'manual',
    name: data.name.trim(),
    phone: data.phone?.trim() || null,
    email: data.email?.trim() || null,
    labels: data.labels || [],
  })

  if (error) {
    console.error('Error creating contact:', error)
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function deleteContact(contactId: string) {
  await getOrgId() // auth check
  const { error } = await supabaseAdmin.from('contacts').delete().eq('id', contactId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function bulkDeleteContacts(contactIds: string[]) {
  await getOrgId()
  const { error } = await supabaseAdmin.from('contacts').delete().in('id', contactIds)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function updateContactLabels(contactId: string, labels: string[]) {
  await getOrgId()
  const { error } = await supabaseAdmin.from('contacts').update({ labels }).eq('id', contactId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function updateContactName(contactId: string, newName: string) {
  await getOrgId()
  const { error } = await supabaseAdmin.from('contacts').update({ name: newName }).eq('id', contactId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function updateContactPhone(contactId: string, newPhone: string) {
  await getOrgId()
  const { error } = await supabaseAdmin.from('contacts').update({ phone: newPhone || null }).eq('id', contactId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function updateContactEmail(contactId: string, newEmail: string) {
  await getOrgId()
  const { error } = await supabaseAdmin.from('contacts').update({ email: newEmail || null }).eq('id', contactId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function updateContactNotes(contactId: string, notes: string) {
  await getOrgId()

  const { data } = await supabaseAdmin.from('contacts').select('metadata').eq('id', contactId).single()
  const existingMeta = (data?.metadata as Record<string, any>) || {}
  const newMeta = { ...existingMeta, notes }

  const { error } = await supabaseAdmin.from('contacts').update({ metadata: newMeta }).eq('id', contactId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function importContacts(rows: Array<{ name: string; phone?: string; email?: string }>) {
  const org_id = await getOrgId()

  const inserts = rows
    .filter(r => r.name && (r.phone || r.email))
    .map(r => ({
      org_id,
      platform_id: `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      platform_type: 'manual' as const,
      name: r.name.trim(),
      phone: r.phone?.trim() || null,
      email: r.email?.trim() || null,
      labels: [] as string[],
    }))

  if (inserts.length === 0) return { success: false, error: 'No valid rows found' }

  const { error } = await supabaseAdmin.from('contacts').insert(inserts)
  if (error) return { success: false, error: error.message }
  return { success: true, imported: inserts.length }
}

export async function getAllContactsForExport() {
  noStore()
  const org_id = await getOrgId()

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('name, phone, email, platform_type, labels, created_at')
    .eq('org_id', org_id)
    .order('created_at', { ascending: false })

  if (error) return []
  return data || []
}

export async function getContactTimeline(contactId: string) {
  noStore()
  await getOrgId()

  const { data: conversations } = await supabaseAdmin
    .from('conversations')
    .select(`
      id, status, created_at, last_message_at,
      channels (type),
      messages (id, content, content_type, sender_type, created_at, is_internal)
    `)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(10)

  return conversations || []
}

export async function detectDuplicateContacts() {
  noStore()
  const org_id = await getOrgId()

  // Find contacts with same phone number
  const { data } = await supabaseAdmin
    .from('contacts')
    .select('id, name, phone, email, platform_type, created_at')
    .eq('org_id', org_id)
    .not('phone', 'is', null)
    .order('created_at', { ascending: true })

  if (!data) return []

  const phoneMap: Record<string, typeof data> = {}
  for (const c of data) {
    if (!c.phone) continue
    const digits = c.phone.replace(/\D/g, '').slice(-9)
    if (!phoneMap[digits]) phoneMap[digits] = []
    phoneMap[digits].push(c)
  }

  return Object.values(phoneMap).filter(group => group.length > 1)
}

export async function mergeContacts(keepId: string, mergeId: string) {
  await getOrgId()

  // Re-point all conversations from mergeId to keepId
  await supabaseAdmin
    .from('conversations')
    .update({ contact_id: keepId })
    .eq('contact_id', mergeId)

  // Delete the duplicate
  await supabaseAdmin.from('contacts').delete().eq('id', mergeId)

  return { success: true }
}
