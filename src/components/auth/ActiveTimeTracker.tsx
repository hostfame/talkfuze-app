"use client"

import { useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import { createClient } from "@/lib/supabase/client"

export default function ActiveTimeTracker() {
  const user = useAuth()
  const lastActivity = useRef<number>(Date.now())
  const isTracking = useRef<boolean>(true)
  const supabase = createClient()

  useEffect(() => {
    if (!user || !user.id || !user.org_id) return

    // Throttle helper: only allow recording activity once every 10 seconds to protect CPU
    let lastRecorded = 0
    const recordActivity = () => {
      const now = Date.now()
      if (now - lastRecorded > 10 * 1000) {
        lastActivity.current = now
        isTracking.current = true
        lastRecorded = now
      }
    }

    // Register silent high-fidelity micro-interaction listeners
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"]
    events.forEach(event => {
      window.addEventListener(event, recordActivity, { passive: true })
    })

    // Periodic Heartbeat loop (every 60 seconds)
    const interval = setInterval(async () => {
      const now = Date.now()
      const isVisible = document.visibilityState === "visible"
      const hasFocus = document.hasFocus()
      const isIdle = now - lastActivity.current > 3 * 60 * 1000 // 3 minutes idle limit

      if (isVisible && hasFocus && !isIdle && isTracking.current) {
        try {
          // Perform silent heartbeat insert
          await supabase
            .from("agent_activity_heartbeats")
            .insert({
              agent_id: user.id,
              org_id: user.org_id
            })
        } catch (err) {
          console.error("Error inserting active heartbeat:", err)
        }
      } else {
        // Stop tracking until next active interaction occurs
        isTracking.current = false
      }
    }, 60 * 1000)

    // Clean up on component unmount
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, recordActivity)
      })
      clearInterval(interval)
    }
  }, [user?.id, user?.org_id])

  return null
}
