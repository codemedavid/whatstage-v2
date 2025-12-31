import OpenAI from 'openai';
import { supabase } from './supabase';

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface PriorityAnalysisResult {
    priority: PriorityLevel;
    reason: string;
    confidence: number;
}

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

const SYSTEM_PROMPT = `
You are an expert customer service supervisor. Your job is to analyze the recent conversation history and assign a priority level for human intervention.

Analyze the user's latest messages and sentiment. Avoid false positives.

PRIORITY LEVELS:

🔴 CRITICAL (Immediate Action)
- Legal threats or "report to DTI/authorities"
- Explicit safety concerns
- Severe accusations of fraud/scam with intent to escalate
- extremely abusive language directed at the agent/brand

🟠 HIGH (Urgent)
- Clear frustration or anger (but not abusive)
- Refund requests or money disputes
- Repeated failures to resolve an issue
- "Talk to a person" requests after AI failed
- Complaints about service quality

🟡 MEDIUM (Needs Review)
- Complex questions the AI might have missed
- User seems confused but calm
- Specific account-related queries needing manual check
- Questions about order status that seem unresolved

🟢 LOW (Standard)
- General inquiries
- Happy or neutral sentiment
- User is just chatting or saying thanks

OUTPUT FORMAT:
Return ONLY a JSON object:
{
  "priority": "critical" | "high" | "medium" | "low",
  "reason": "Short explanation of why",
  "confidence": 0.0 to 1.0
}
`;

export async function analyzePriority(
    messages: { role: 'user' | 'assistant'; content: string }[]
): Promise<PriorityAnalysisResult> {
    try {
        // Format conversation for context
        const conversationText = messages
            .map(m => `${m.role.toUpperCase()}: ${m.content}`)
            .join('\n');

        const completion = await client.chat.completions.create({
            model: 'meta/llama-3.1-70b-instruct', // Using Llama 3 on NVIDIA API for good reasoning
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: `Analyze this conversation:\n\n${conversationText}` }
            ],
            temperature: 0.1,
            max_tokens: 200,
        });

        const text = completion.choices[0]?.message?.content || '{}';

        // Clean and parse JSON
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        let result;
        try {
            result = JSON.parse(cleanText);
        } catch (e) {
            // Fallback if JSON parsing fails - try to extract JSON from text
            const match = cleanText.match(/\{[\s\S]*\}/);
            if (match) {
                result = JSON.parse(match[0]);
            } else {
                throw new Error('Invalid JSON response');
            }
        }

        return {
            priority: (result.priority || 'low').toLowerCase() as PriorityLevel,
            reason: result.reason || 'No reason provided',
            confidence: result.confidence || 0,
        };

    } catch (error) {
        console.error('[PriorityService] Analysis failed:', error);
        // Fail safe to LOW
        return {
            priority: 'low',
            reason: 'Analysis failed, defaulting to low',
            confidence: 0,
        };
    }
}

export async function updateLeadPriority(senderId: string, result: PriorityAnalysisResult) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {
            attention_priority: result.priority,
            priority_analyzed_at: new Date().toISOString(),
        };

        // If Critical/High, we ensure it's flagged for human attention
        if (result.priority === 'critical' || result.priority === 'high') {
            updateData.needs_human_attention = true;
            updateData.smart_passive_reason = `[${result.priority.toUpperCase()}] ${result.reason}`;
            updateData.smart_passive_activated_at = new Date().toISOString();
        }

        const { error } = await supabase
            .from('leads')
            .update(updateData)
            .eq('sender_id', senderId);

        if (error) throw error;

        console.log(`[PriorityService] Updated ${senderId} to ${result.priority}`);

    } catch (error) {
        console.error('[PriorityService] Error updating lead:', error);
    }
}
