import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import OpenAI from "openai"

const WEBHOOK_SECRET = process.env.WHMCS_BRIDGE_SECRET || ''

// Background processor to handle audio download, Whisper transcription, and DeepSeek summarization
async function processCallRecording(
  orgId: string,
  recordingUrl: string,
  durationSeconds: number,
  direction: string,
  fromNum: string,
  toNum: string,
  agentName: string
) {
  try {
    console.log(`[Call AI] Starting background processing for recording: ${recordingUrl}`);
    
    // 1. Resolve contact and conversation_id
    let conversationId: string | null = null;
    const searchPhone = direction === 'inbound' ? fromNum : toNum;
    const cleanDigits = searchPhone.replace(/\D/g, '');
    const last9Digits = cleanDigits.slice(-9);

    if (last9Digits) {
      const { data: contactData } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('org_id', orgId)
        .like('phone', `%${last9Digits}`)
        .limit(1);

      if (contactData && contactData.length > 0) {
        const { data: convData } = await supabaseAdmin
          .from('conversations')
          .select('id')
          .eq('contact_id', contactData[0].id)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (convData && convData.length > 0) {
          conversationId = convData[0].id;
        }
      }
    }

    if (!conversationId) {
      console.warn(`[Call AI] Could not find an active conversation for phone suffix: ${last9Digits}. Skipping summary.`);
      return;
    }

    // 2. Download audio file from recording URL
    const response = await fetch(recordingUrl);
    if (!response.ok) {
      throw new Error(`Failed to download recording audio. Status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let transcriptText = "";
    let summary: string[] = [];
    let follow_up_draft = "";

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (GEMINI_API_KEY) {
      try {
        console.log(`[Call AI] Gemini API Key found. Using Gemini 1.5 Flash for unified audio-native transcription and analysis.`);
        const base64Data = buffer.toString('base64');
        const isMp3 = recordingUrl.toLowerCase().endsWith('.mp3');
        const mimeType = isMp3 ? 'audio/mp3' : 'audio/wav';

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const payload = {
          contents: [
            {
              parts: [
                {
                  text: `You are an elite customer support quality auditor and AI manager for Hostnin, a leading Bangladeshi hosting company.
Listen to the attached telephone call audio recording between our support agent and a customer.
Perform the following tasks:
1. Provide a highly accurate transcription of the conversation in the 'transcript' field. Since it is a support call, it will likely be a mix of English and Bengali (Benglish) or pure Bengali. Keep the transcription highly faithful.
2. In the 'summary' field, provide a concise bullet-point summary (3-4 points max) in English outlining:
   - What issue the customer reported.
   - What the agent checked or resolved.
   - Any next actions or pending tasks.
3. In the 'follow_up_draft' field, write a warm, highly professional WhatsApp follow-up message in BENGALI SCRIPT (বাংলা) or ENGLISH (depending on what language the customer spoke) to send to the customer.
   - Acknowledge the call.
   - Summarize what we agreed/did.
   - Close politely without honorifics like "Bhai/Bhaiya/Apu". Address them directly or neutrally as "আপনি / আপনার".`
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
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                transcript: { type: "STRING" },
                summary: {
                  type: "ARRAY",
                  items: { type: "STRING" }
                },
                follow_up_draft: { type: "STRING" }
              },
              required: ["transcript", "summary", "follow_up_draft"]
            }
          }
        };

        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!geminiRes.ok) {
          throw new Error(`Gemini API returned error status: ${geminiRes.status} - ${await geminiRes.text()}`);
        }

        const geminiData = await geminiRes.json();
        const rawJsonText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawJsonText) {
          throw new Error("Empty response parts from Gemini API");
        }

        const parsed = JSON.parse(rawJsonText);
        transcriptText = parsed.transcript || "";
        summary = parsed.summary || [];
        follow_up_draft = parsed.follow_up_draft || "";
        console.log(`[Call AI] Gemini analysis succeeded natively!`);
      } catch (geminiErr) {
        console.error(`[Call AI] Gemini native audio pipeline failed. Falling back to Whisper + GPT-4o-mini. Error:`, geminiErr);
      }
    }

    // Fallback: If Gemini was not executed or failed, run the standard Whisper + GPT-4o-mini pipeline
    if (!transcriptText) {
      console.log(`[Call AI] Running fallback Whisper + GPT-4o-mini pipeline.`);
      
      // 3. Transcribe via OpenAI Whisper
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const isMp3 = recordingUrl.toLowerCase().endsWith('.mp3');
      const file = await OpenAI.toFile(buffer, isMp3 ? 'recording.mp3' : 'recording.wav');
      
      console.log(`[Call AI] Sending to Whisper...`);
      const transcription = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file: file,
      });
      
      const parsedTranscriptText = transcription.text?.trim();
      if (!parsedTranscriptText) {
        console.log(`[Call AI] Empty transcription in fallback. Skipping summary.`);
        return;
      }
      transcriptText = parsedTranscriptText;
      console.log(`[Call AI] Whisper transcription succeeded: "${transcriptText.substring(0, 100)}..."`);

      // 4. Generate summary and follow-up draft using OpenAI GPT-4o-mini
      console.log(`[Call AI] Requesting AI Summary and WhatsApp Draft from fallback GPT-4o-mini...`);
      const aiResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `You are an elite customer support quality auditor and AI manager for Hostnin, a leading Bangladeshi hosting company.
Analyze this telephone call transcript between our support agent and a customer.
Output valid JSON containing:
1. 'summary': A concise bullet-point summary (3-4 points max) in English outlining:
   - What issue the customer reported.
   - What the agent checked or resolved.
   - Any next actions or pending tasks.
2. 'follow_up_draft': A warm, highly professional WhatsApp follow-up message in BENGALI SCRIPT (বাংলা) or ENGLISH (depending on what language the customer spoke in the transcript) to send to the customer. 
   - Acknowledge the call.
   - Summarize what we agreed/did.
   - Close politely without honorifics like "Bhai/Bhaiya/Apu". Address them directly or neutrally as "আপনি / আপনার".
   - Wrap the output in clean JSON keys: 'summary' and 'follow_up_draft'.`
          },
          {
            role: 'user',
            content: `Call Details:
- Agent Name: ${agentName || 'TalkFuze Agent'}
- Duration: ${durationSeconds} seconds
- Direction: ${direction}

Transcript:
"${transcriptText}"`
          }
        ],
        response_format: { type: 'json_object' }
      });

      const resultText = aiResponse.choices[0]?.message?.content?.trim();
      if (!resultText) throw new Error('Empty completion result from AI summarizer');
      
      const parsedRes = JSON.parse(resultText);
      summary = parsedRes.summary || [];
      follow_up_draft = parsedRes.follow_up_draft || "";
    }

    // 5. Save call summary as an internal note (whisper) in messages table
    const { error: insertError } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        org_id: orgId,
        sender_type: 'system',
        content: `📞 **Call AI Summary & WhatsApp Follow-up**`,
        content_type: 'text',
        is_internal: true, // Internal whisper note!
        status: 'delivered',
        metadata: {
          is_call_summary: true,
          duration_seconds: durationSeconds,
          transcript: transcriptText,
          summary: summary,
          follow_up_draft: follow_up_draft,
          recording_url: recordingUrl,
          agent_name: agentName || 'TalkFuze Agent'
        }
      });

    if (insertError) {
      console.error('[Call AI] Failed to insert summary message:', insertError);
    } else {
      console.log('[Call AI] Call summary message successfully saved as internal whisper!');
    }
  } catch (err) {
    console.error('[Call AI] Background process error:', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret to prevent unauthorized call log injection
    const secret = req.headers.get('x-webhook-secret')
    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { org_id, direction, from, to, duration, status, recording, agent_name } = body

    if (!org_id || !direction || !from || !to) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const recording_url = recording ? `https://sip.talkfuze.com/recordings/${recording}` : null
    
    // Delay slightly to prevent race conditions where PBX webhook arrives before the frontend logs the final SIP call leg
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Check if the frontend already logged this call (within the last 5 minutes)
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    
    let matchQuery = supabaseAdmin
      .from('call_logs')
      .select('id, conversation_id')
      .eq('org_id', org_id)
      .is('recording_url', null)
      .gte('created_at', fiveMinsAgo)
      .order('created_at', { ascending: false })

    if (direction === 'outbound') {
      const cleanTo = to.replace(/\D/g, '')
      const last10To = cleanTo.slice(-10)
      matchQuery = matchQuery.like('to_number', `%${last10To}`)
    } else {
      const cleanFrom = from.replace(/\D/g, '')
      const last10From = cleanFrom.slice(-10)
      matchQuery = matchQuery.like('from_number', `%${last10From}`)
    }

    const { data: existingLogs } = await matchQuery

    if (existingLogs && existingLogs.length > 0) {
      // Update ALL existing browser-initiated logs with recording (handles transfers where multiple legs exist)
      const idsToUpdate = existingLogs.map(log => log.id)
      const { error } = await supabaseAdmin.from('call_logs').update({
        recording_url,
        call_type: 'pbx',
        duration_seconds: parseInt(duration) || 0,
        status: status || 'UNKNOWN'
      }).in('id', idsToUpdate)
      
      if (error) {
        console.error("Failed to update call log:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Also attach the recording_url to the UI message metadata
      const convIds = [...new Set(existingLogs.map(log => log.conversation_id).filter(Boolean))]
      for (const convId of convIds) {
        const { data: recentMsgs } = await supabaseAdmin
          .from('messages')
          .select('id, metadata')
          .eq('conversation_id', convId)
          .in('content', ['Voice call', 'Missed voice call'])
          .gte('created_at', fiveMinsAgo)
          .order('created_at', { ascending: false })
          .limit(1);

        if (recentMsgs && recentMsgs.length > 0) {
          const msg = recentMsgs[0];
          const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : (msg.metadata || {});
          if (!meta.recording_url) {
            meta.recording_url = recording_url;
            await supabaseAdmin.from('messages').update({ metadata: JSON.stringify(meta) }).eq('id', msg.id);
          }
        }
      }
    } else {
      // Insert new log if not found (e.g., standard PBX call)
      const { error } = await supabaseAdmin.from('call_logs').insert({
        org_id,
        direction,
        from_number: from,
        to_number: to,
        duration_seconds: parseInt(duration) || 0,
        status: status || 'UNKNOWN',
        recording_url,
        agent_name: agent_name || null,
        call_type: 'pbx'
      })

      if (error) {
        console.error("Failed to insert call log:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    // Fire background call recording processing if recording URL is present and duration > 5 seconds
    if (recording_url && parseInt(duration) > 5) {
      processCallRecording(
        org_id,
        recording_url,
        parseInt(duration) || 0,
        direction,
        from,
        to,
        agent_name || ''
      ).catch(err => console.error("Error in background call recording processor:", err));
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Webhook Error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
