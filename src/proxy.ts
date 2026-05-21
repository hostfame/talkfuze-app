import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Bangladesh-only IP geo-lock for dashboard access
const ALLOWED_COUNTRIES = ['BD']

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value || value === '""' || value === "''") return null
  return value
}

function isDashboardPath(pathname: string) {
  return pathname.startsWith('/inbox') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/contacts') ||
    pathname.startsWith('/analytics') ||
    pathname === '/'
}

async function handleAuth(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })
  const isDashboardRoute = isDashboardPath(request.nextUrl.pathname)
  const supabaseUrl = readRequiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseAnonKey = readRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isDashboardRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If the user is NOT logged in and trying to access a dashboard route, redirect to /login
  if (!user && isDashboardRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // If the user IS logged in and trying to access /login, redirect to /inbox
  if (user && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/inbox'
    return NextResponse.redirect(url)
  }

  // If user visits root / redirect to /inbox
  if (user && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/inbox'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Public paths: webhooks, API v1, cron, widget, auth, and static assets
  // These must be globally accessible (called by Meta, Evolution API, WHMCS, etc.)
  const isPublicPath = pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/v1') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/widget') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/talkfuze-widget.js') ||
    pathname.startsWith('/widget')

  if (isPublicPath) {
    return NextResponse.next()
  }

  // Geo-block non-BD IPs for login and dashboard routes
  const country = request.geo?.country || 'XX'
  if (!ALLOWED_COUNTRIES.includes(country)) {
    // For API routes, return JSON error
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Access restricted to Bangladesh only.' },
        { status: 403 }
      )
    }
    // For page routes, return a human-readable block page
    return new NextResponse(
      `<!DOCTYPE html>
<html><head><title>Access Restricted</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0b141a;color:#e9edef;}
.card{text-align:center;padding:3rem;border-radius:1rem;border:1px solid #222e35;max-width:400px;}
h1{font-size:1.5rem;margin-bottom:0.5rem;color:#ef4444;}
p{color:#8696a0;font-size:0.9rem;line-height:1.6;}</style></head>
<body><div class="card">
<h1>Access Restricted</h1>
<p>TalkFuze dashboard is only accessible from Bangladesh for security purposes.<br/>
If you believe this is an error, contact your administrator.</p>
</div></body></html>`,
      { status: 403, headers: { 'Content-Type': 'text/html' } }
    )
  }

  // For allowed countries, proceed with Supabase auth
  return handleAuth(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|wav|ico|avif)$).*)',
  ],
}
