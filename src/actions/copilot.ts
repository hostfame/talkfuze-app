"use server"

import OpenAI from 'openai'
import { getMessages } from './dashboard'
import type { AppMessage } from '@/lib/types'

let openai: OpenAI | null = null;

function getOpenAIClient() {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "dummy_key_to_prevent_crash"
    })
  }
  return openai;
}

export async function summarizeThread(conversationId: string) {
  try {
    const client = getOpenAIClient();
    const messages = await getMessages(conversationId)
    
    if (!messages || messages.length === 0) {
      return "No messages to summarize."
    }

    const conversationText = (messages as AppMessage[]).map((m) => 
      `${m.sender_type === 'agent' ? 'Agent' : 'Customer'}: ${m.content}`
    ).join("\n")

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert customer support summarizer. Summarize the following customer support thread in 1-2 concise bullet points. Focus on what the customer wants and the current status. Do not include pleasantries."
        },
        {
          role: "user",
          content: conversationText
        }
      ],
      temperature: 0.3,
      max_tokens: 150
    })

    return response.choices[0].message.content || "Could not generate summary."

  } catch (error) {
    console.error("Summarize Error:", error)
    return "Error generating summary."
  }
}

export async function draftReply(conversationId: string, customPrompt?: string) {
  try {
    const client = getOpenAIClient();
    const messages = await getMessages(conversationId)
    
    if (!messages || messages.length === 0) {
      return "No context to draft a reply."
    }

    const conversationText = (messages as AppMessage[]).map((m) => 
      `${m.sender_type === 'agent' ? 'Agent' : 'Customer'}: ${m.content}`
    ).join("\n")

    let systemPrompt = "You are an expert support agent for Hostnin. Draft a professional, empathetic, and highly concise reply to the customer's last message. Use Bengali if the customer is speaking Bengali, otherwise use English. Do not include placeholders like [Your Name]. Just write the message itself. IMPORTANT: DO NOT use markdown formatting like **bold** or *italics*. Do not use any asterisks. Use plain text only."
    
    if (customPrompt) {
      systemPrompt += `\n\nAdditional instructions from the agent: ${customPrompt}`
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: conversationText
        }
      ],
      temperature: 0.5,
      max_tokens: 300
    })

    let draft = response.choices[0].message.content || "Could not generate draft."
    
    // Strip any markdown asterisks just in case the AI ignores instructions
    draft = draft.replace(/\*\*/g, '').replace(/\*/g, '')
    
    return draft

  } catch (error) {
    console.error("Draft Reply Error:", error)
    return "Error generating draft."
  }
}
