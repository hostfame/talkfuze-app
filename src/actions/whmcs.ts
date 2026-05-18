"use server"

import { getClients, getClientsProducts, getClientsDomains, getTickets, getInvoice } from "@/lib/whmcs"

export async function fetchWhmcsClient(phoneOrEmail: string) {
  try {
    const cleanSearch = phoneOrEmail.startsWith('+') ? phoneOrEmail.substring(1) : phoneOrEmail
    const data = await getClients(cleanSearch)
    
    if (data.clients && data.clients.length > 0) {
      // Find exact match or use the first one
      const exactMatch = data.clients.find(c => c.phonenumber.includes(cleanSearch) || c.email === phoneOrEmail)
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
