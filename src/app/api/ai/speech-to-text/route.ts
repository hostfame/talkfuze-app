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
    // Extract extension or default to webm
    const fileName = (file as File).name || "audio.webm";
    openaiFormData.append("file", file, fileName);
    openaiFormData.append("model", "whisper-1");
    openaiFormData.append("temperature", "0");
    openaiFormData.append("prompt", "এটি একটি বাংলা কাস্টমার সাপোর্ট মেসেজ। ডোমেইন, হোস্টিং, ওয়েবসাইট, সমস্যা, পেমেন্ট সংক্রান্ত।");

    // Using transcriptions endpoint to preserve original language
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

    // Post-process with GPT-4o-mini to fix dialect/spelling errors
    const correctionRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert in Bangladeshi Bengali dialect. The user will provide a raw, slightly hallucinated speech-to-text transcription from Whisper (e.g., it might say 'ভাইষ্টা' instead of 'ভয়েসটা', 'প্রপালি' instead of 'প্রপারলি', 'কম্পাট' instead of 'কনভার্ট', 'কুডিতশি' instead of 'করতেছি'). Fix the spelling, grammar, and phonetic mistakes to match how a Bangladeshi would naturally write this. Return ONLY the corrected text. Do not add any quotes or conversational filler."
          },
          {
            role: "user",
            content: transcript
          }
        ],
        temperature: 0.2
      })
    });

    let finalTranscript = transcript;
    if (correctionRes.ok) {
      const correctionData = await correctionRes.json();
      if (correctionData.choices?.[0]?.message?.content) {
        finalTranscript = correctionData.choices[0].message.content.trim();
      }
    }

    return NextResponse.json({ transcript: finalTranscript });
  } catch (err: any) {
    console.error("Speech to text error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
