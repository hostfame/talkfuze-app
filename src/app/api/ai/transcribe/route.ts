import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use admin client to bypass RLS for background transcription
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { messageId } = await req.json();
    if (!messageId) {
      return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
    }

    // 1. Fetch message
    const { data: msg, error: fetchErr } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("id", messageId)
      .single();

    if (fetchErr || !msg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (msg.content_type !== "audio") {
      return NextResponse.json({ error: "Message is not an audio file" }, { status: 400 });
    }

    const metadata = (msg.metadata as Record<string, any>) || {};
    if (metadata.transcript) {
      // Already transcribed
      return NextResponse.json({ transcript: metadata.transcript });
    }

    const mediaUrl = metadata.media_url || metadata.url || (msg.content?.startsWith("http") ? msg.content : null);
    if (!mediaUrl) {
      return NextResponse.json({ error: "No media URL found in message" }, { status: 400 });
    }

    // 2. Download audio
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const audioRes = await fetch(mediaUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!audioRes.ok) {
      return NextResponse.json({ error: "Failed to download audio file" }, { status: 500 });
    }

    const arrayBuffer = await audioRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Send to Whisper
    const urlParts = mediaUrl.split("/");
    let filename = urlParts[urlParts.length - 1] || "audio.ogg";
    if (filename.includes("?")) filename = filename.split("?")[0];
    if (!filename.includes(".")) filename += ".ogg";

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: filename.endsWith('.mp3') ? 'audio/mp3' : 'audio/ogg' });
    formData.append("file", blob, filename);
    formData.append("model", "whisper-1");
    formData.append("prompt", "This is a customer support message in either Bengali or English. Do not transcribe in Hindi.");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData as any,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error("Whisper error:", errText);
      return NextResponse.json({ error: "Whisper transcription failed" }, { status: 500 });
    }

    const whisperData = await whisperRes.json();
    const transcript = whisperData.text;

    if (!transcript) {
      return NextResponse.json({ error: "No transcript returned" }, { status: 500 });
    }

    // 4. Update message in Supabase
    metadata.transcript = transcript;
    
    // Also update content if it's currently generic so the widget/list view sees it
    let newContent = msg.content;
    if (newContent === "[Audio Voice Message]" || newContent === "[Voice Message]") {
      newContent = `[Audio] ${transcript}`;
    }

    const { error: updateErr } = await supabaseAdmin
      .from("messages")
      .update({ metadata, content: newContent })
      .eq("id", messageId);

    if (updateErr) {
      console.error("Failed to update message with transcript:", updateErr);
      return NextResponse.json({ error: "Failed to save transcript" }, { status: 500 });
    }

    return NextResponse.json({ transcript });
  } catch (err: any) {
    console.error("Transcription endpoint error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
