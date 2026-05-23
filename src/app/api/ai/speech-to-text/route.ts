import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as Blob | null;

    if (!file) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not set" }, { status: 500 });
    }

    const buffer = await file.arrayBuffer();
    const base64Data = Buffer.from(buffer).toString("base64");
    const mimeType = file.type || "audio/webm";

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

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(geminiPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini error:", errText);
      return NextResponse.json({ error: "Gemini transcription failed", details: errText }, { status: 500 });
    }

    const data = await res.json();
    const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!transcript) {
      return NextResponse.json({ error: "No transcript returned from Gemini" }, { status: 500 });
    }

    return NextResponse.json({ transcript: transcript.trim() });
  } catch (err: any) {
    console.error("Speech to text error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
