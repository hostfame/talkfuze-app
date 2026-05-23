import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use admin client to bypass RLS for background transcription
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { messageId } = await req.json();
    if (!messageId) {
      return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not set" }, { status: 500 });
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

    const base64Data = buffer.toString("base64");
    const mimeType = filename.endsWith('.mp3') ? 'audio/mp3' : 'audio/ogg';

    const geminiPayload = {
      contents: [
        {
          parts: [
            {
              text: "Transcribe the following audio accurately in Bengali or English. If it is in Bangladeshi Bengali dialect, fix any phonetic or spelling mistakes to match how a Bangladeshi would naturally write it in the Bengali script. Return ONLY the transcribed text. Do not add any conversational filler, quotation marks, or explanations."
            },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1
      }
    };

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(geminiPayload),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error:", errText);
      return NextResponse.json({ error: "Gemini transcription failed", details: errText }, { status: 500 });
    }

    const data = await geminiRes.json();
    const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!transcript) {
      return NextResponse.json({ error: "No transcript returned from Gemini" }, { status: 500 });
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
