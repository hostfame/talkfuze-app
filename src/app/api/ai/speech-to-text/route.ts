import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as Blob | null;

    if (!file) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
    }

    const openaiFormData = new FormData();
    // OpenAI Whisper requires a filename with an extension
    openaiFormData.append("file", file, "audio.webm");
    openaiFormData.append("model", "whisper-1");

    // Using transcriptions endpoint to preserve original language (Bangla/English)
    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: openaiFormData as any,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error("Whisper error:", errText);
      return NextResponse.json({ error: "Whisper transcription failed", details: errText }, { status: 500 });
    }

    const whisperData = await whisperRes.json();
    const transcript = whisperData.text;

    if (!transcript) {
      return NextResponse.json({ error: "No transcript returned" }, { status: 500 });
    }

    return NextResponse.json({ transcript });
  } catch (err: any) {
    console.error("Speech to text error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
