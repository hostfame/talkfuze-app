import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

// Serve embed.js via API route to bypass Vercel CDN caching
// Static files in /public get CDN-cached by Vercel ignoring no-store headers
// API routes always run fresh through serverless functions
export async function GET() {
  try {
    const filePath = join(process.cwd(), 'public', 'embed.js')
    const content = readFileSync(filePath, 'utf-8')

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    })
  } catch (err) {
    console.error('[embed.js API]', err)
    return new NextResponse('// TalkFuze embed.js not found', { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  })
}
