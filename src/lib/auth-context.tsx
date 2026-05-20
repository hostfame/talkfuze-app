"use client"

import { createContext, useContext, ReactNode } from "react"

export type UserContextType = {
  id: string
  org_id: string
  name: string
  email: string
  role: string
  avatar_url: string | null
  sip_extension: string | null
  sip_password: string | null
}

const AuthContext = createContext<UserContextType | null>(null)

export function AuthProvider({ 
  user, 
  children 
}: { 
  user: UserContextType | null
  children: ReactNode 
}) {
  return (
    <AuthContext.Provider value={user}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined || context === null) {
    throw new Error("useAuth must be used within an AuthProvider and have a valid user")
  }
  return context
}
