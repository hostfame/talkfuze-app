"use server"

import { getClients, getClientsProducts, getClientsDomains, getTickets, getInvoice, getClientDetailsByEmailFast } from "@/lib/whmcs"

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

    const cleanPhone = cleanSearch.startsWith('+') ? cleanSearch.substring(1) : cleanSearch
    const data = await getClients(cleanPhone)
    
    if (data.clients && data.clients.length > 0) {
      // Find exact match or use the first one
      const exactMatch = data.clients.find(c => 
        (c.phonenumber && c.phonenumber.includes(cleanPhone)) || 
        (c.email && c.email.toLowerCase() === cleanSearch.toLowerCase())
      )
      return exactMatch || data.clients[0]
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
      products: productsRes.products,
      domains: domainsRes.domains
    }
  } catch (error) {
    console.error("Failed to fetch WHMCS services:", error)
    return { products: [], domains: [] }
  }
}

export async function fetchWhmcsTickets(clientId: number) {
  try {
    const ticketsRes = await getTickets(clientId, 0, 5)
    return ticketsRes.tickets
  } catch (error) {
    console.error("Failed to fetch WHMCS tickets:", error)
    return []
  }
}
