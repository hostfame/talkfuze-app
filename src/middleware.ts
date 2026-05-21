import { NextResponse, type NextRequest } from 'next/server'
import { proxy } from './proxy'

// Bangladesh-only IP geo-lock for dashboard access
const ALLOWED_COUNTRIES = ['BD']

export async function middleware(request: NextRequest) {
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

  // For allowed countries, proceed with auth proxy
  return proxy(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|wav|ico)$).*)',
  ],
}
