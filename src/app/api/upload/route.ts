import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

export async function POST(req: Request) {
  try {
    // Auth check: try to get valid Supabase session (allow both authenticated agents and anonymous widget visitors)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }

    const fileExt = file.name ? file.name.split('.').pop() : 'png'
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = user ? `agent-uploads/${fileName}` : `widget-uploads/${fileName}`

    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },
    });

    const buffer = Buffer.from(await file.arrayBuffer());

    await s3Client.send(
      new PutObjectCommand({
        Bucket: "talkfuze-media",
        Key: filePath,
        Body: buffer,
        ContentType: file.type || "application/octet-stream",
      })
    );

    const publicUrl = `${process.env.R2_PUBLIC_DOMAIN}/${filePath}`;

    return NextResponse.json({ 
      success: true, 
      url: publicUrl, 
      type: file.type, 
      name: file.name 
    })
  } catch (error: any) {
    console.error('API Upload exception:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
