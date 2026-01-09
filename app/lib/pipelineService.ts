import OpenAI from 'openai';
import { supabase } from './supabase';
import { supabaseAdmin } from './supabaseAdmin';

// Constants
const MESSAGES_BEFORE_ANALYSIS = 5;
const DEBOUNCE_MS = 3000; // 3 second debounce for stage analysis

// Expanded keyword triggers with variations in English and Filipino
const TRIGGER_KEYWORDS = [
    // English - purchase intent
    'buy', 'buying', 'purchase', 'purchased', 'order', 'ordering',
    // English - price inquiry
    'price', 'pricing', 'cost', 'how much', 'rate', 'rates',
    // English - payment
    'payment', 'pay', 'paying', 'paid', 'checkout',
    // English - interest
    'interested', 'interest', 'inquire', 'inquiry', 'want to get',
    // Tagalog/Filipino
    'magkano', 'bili', 'bayad', 'presyo', 'gusto ko', 'pabili', 'paorder',
    'interesado', 'oorder', 'bibili',
    // Booking-related
    'book', 'booking', 'appointment', 'schedule', 'reserve',
];

// Debounce map to prevent rapid analysis triggers
const stageAnalysisDebounce = new Map<string, NodeJS.Timeout>();

// Confidence threshold - only change stage if above this
const CONFIDENCE_THRESHOLD = 0.7;
const LOW_CONFIDENCE_LOG_THRESHOLD = 0.5;

// Adaptive debounce configuration
const MIN_DEBOUNCE_MS = 2000;
const MAX_DEBOUNCE_MS = 15000;
const MESSAGE_VELOCITY_WINDOW_MS = 60000; // 1 minute

// Lead scoring weights
const SCORING_WEIGHTS = {
    engagement: 0.3,
    intent: 0.4,
    qualification: 0.3,
};

// Message velocity tracking for adaptive debounce
const messageVelocityTracker = new Map<string, number[]>(); // leadId -> timestamps

// LLM Classification response interface
interface LLMClassification {
    stage: string;
    confidence: number;
    reason: string;
    alternative_stage?: string;
    alternative_confidence?: number;
    detected_signals?: string[];
}

// Lead score breakdown interface
interface LeadScore {
    engagement: number;
    intent: number;
    qualification: number;
    total: number;
}

// Helper function to log pipeline events for debugging and analytics
async function logPipelineEvent(
    leadId: string | null,
    userId: string | null,
    eventType: 'stage_change' | 'analysis_triggered' | 'workflow_triggered' | 'profile_fetched' | 'lead_created',
    eventData: Record<string, unknown> = {}
): Promise<void> {
    try {
        await supabaseAdmin.from('pipeline_events').insert({
            lead_id: leadId,
            user_id: userId,
            event_type: eventType,
            event_data: eventData,
        });
    } catch (error) {
        // Non-critical - just log and continue
        console.error('[PipelineEvent] Failed to log event:', error);
    }
}

// Initialize OpenAI client for NVIDIA
const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

// Types
interface Lead {
    id: string;
    sender_id: string;
    name: string | null;
    current_stage_id: string | null;
    message_count: number;
    last_analyzed_at: string | null;
    email: string | null;
    phone: string | null;
    goal_met_at: string | null;
    receipt_image_url?: string | null;
    receipt_detected_at?: string | null;
    profile_pic?: string | null;
}

interface PipelineStage {
    id: string;
    name: string;
    display_order: number;
    color: string;
}

// Get or create a lead record for a sender
// Uses supabaseAdmin to bypass RLS since webhooks don't have user auth context
// Uses atomic upsert to prevent race conditions when concurrent messages arrive
export async function getOrCreateLead(senderId: string, pageAccessToken?: string, userId?: string | null): Promise<Lead | null> {
    try {
        // Helper function to fetch Facebook profile using parallel methods with timeout
        // This is faster than sequential fallback as we race all methods
        const fetchFacebookProfile = async (): Promise<{ name: string | null; profilePic: string | null }> => {
            if (!pageAccessToken) {
                return { name: null, profilePic: null };
            }

            const PROFILE_TIMEOUT_MS = 3000;

            // Method 1: Standard Graph API (fastest, most common)
            const method1 = async (): Promise<{ name: string; profilePic: string | null }> => {
                const url = `https://graph.facebook.com/v21.0/${senderId}?fields=first_name,last_name,name,profile_pic&access_token=${pageAccessToken}`;
                const profileRes = await fetch(url);
                if (!profileRes.ok) throw new Error('Graph API failed');
                const profile = await profileRes.json();
                const name = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
                if (!name) throw new Error('No name in profile');
                return { name, profilePic: profile.profile_pic || null };
            };

            // Method 2: Conversations API (slower fallback, delay to give Method 1 priority)
            const method2 = async (): Promise<{ name: string; profilePic: null }> => {
                await new Promise(r => setTimeout(r, 500)); // Give Method 1 a head start
                const convUrl = `https://graph.facebook.com/v21.0/me/conversations?fields=participants,senders&access_token=${pageAccessToken}`;
                const convRes = await fetch(convUrl);
                if (!convRes.ok) throw new Error('Conversations API failed');
                const convData = await convRes.json();
                for (const conv of convData.data || []) {
                    const participants = conv.participants?.data || conv.senders?.data || [];
                    for (const p of participants) {
                        if (p.id === senderId && p.name) {
                            return { name: p.name, profilePic: null };
                        }
                    }
                }
                throw new Error('Not found in conversations');
            };

            // Method 3: Thread lookup (slowest fallback)
            const method3 = async (): Promise<{ name: string; profilePic: null }> => {
                await new Promise(r => setTimeout(r, 800)); // Give other methods priority
                const threadUrl = `https://graph.facebook.com/v21.0/t_${senderId}?fields=participants&access_token=${pageAccessToken}`;
                const threadRes = await fetch(threadUrl);
                if (!threadRes.ok) throw new Error('Thread API failed');
                const threadData = await threadRes.json();
                const participants = threadData.participants?.data || [];
                for (const p of participants) {
                    if (p.id === senderId && p.name) {
                        return { name: p.name, profilePic: null };
                    }
                }
                throw new Error('Not found in thread');
            };

            // Race all methods with timeout - first success wins
            try {
                const timeoutPromise = new Promise<{ name: null; profilePic: null }>((resolve) => {
                    setTimeout(() => resolve({ name: null, profilePic: null }), PROFILE_TIMEOUT_MS);
                });

                const result = await Promise.race([
                    Promise.any([method1(), method2(), method3()]),
                    timeoutPromise,
                ]);

                return result;
            } catch {
                // All methods failed
                return { name: null, profilePic: null };
            }
        };

        // Run independent queries in parallel for better performance
        const [existingResult, defaultStageResult, profileResult] = await Promise.all([
            // Check if lead exists
            (async () => {
                let query = supabaseAdmin
                    .from('leads')
                    .select('*')
                    .eq('sender_id', senderId);
                if (userId) {
                    query = query.eq('user_id', userId);
                }
                return query.single();
            })(),
            // Get default stage
            (async () => {
                let query = supabaseAdmin
                    .from('pipeline_stages')
                    .select('id')
                    .eq('is_default', true);
                if (userId) {
                    query = query.eq('user_id', userId);
                }
                return query.single();
            })(),
            // Fetch Facebook profile (only if we have token)
            pageAccessToken ? fetchFacebookProfile() : Promise.resolve({ name: null, profilePic: null })
        ]);

        const existing = existingResult.data;
        const defaultStage = defaultStageResult.data;
        const { name: userName, profilePic } = profileResult;

        if (existing) {
            // If lead exists but has no name, update it
            if (!existing.name && userName) {
                await supabaseAdmin
                    .from('leads')
                    .update({ name: userName, profile_pic: profilePic })
                    .eq('id', existing.id);
                return { ...existing, name: userName, profile_pic: profilePic } as Lead;
            }
            return existing as Lead;
        }

        // ===========================================
        // ATOMIC INSERT with ON CONFLICT DO NOTHING
        // ===========================================
        // This approach guarantees that we can deterministically know if we created 
        // a new lead or if it already existed:
        // - If INSERT succeeds: we get back the new row (isNewLead = true)
        // - If INSERT conflicts: we get back null/empty (isNewLead = false)
        // This eliminates the race condition where multiple concurrent requests 
        // could both see message_count === 0 and trigger duplicate workflows.

        const { data: insertedLead, error: insertError } = await supabaseAdmin
            .from('leads')
            .insert({
                sender_id: senderId,
                user_id: userId || null,
                name: userName,
                profile_pic: profilePic,
                current_stage_id: defaultStage?.id || null,
                message_count: 0,
                last_message_at: new Date().toISOString(),
            })
            .select()
            .single();

        // Determine if this was a new lead creation or if a conflict occurred
        let lead: Lead | null = null;
        let isNewLead = false;

        if (!insertError && insertedLead) {
            // INSERT succeeded - this is a new lead
            lead = insertedLead as Lead;
            isNewLead = true;
            console.log(`[getOrCreateLead] Created new lead ${lead.id} for sender ${senderId}`);
        } else if (insertError?.code === '23505') {
            // Unique constraint violation - lead was created by another concurrent request
            // Fetch the existing lead
            console.log('[getOrCreateLead] Conflict detected (23505), fetching existing lead');
            let query = supabaseAdmin
                .from('leads')
                .select('*')
                .eq('sender_id', senderId);
            if (userId) {
                query = query.eq('user_id', userId);
            }
            const { data: existingLead, error: fetchError } = await query.single();

            if (fetchError || !existingLead) {
                console.error('Error fetching existing lead after conflict:', fetchError);
                return null;
            }

            lead = existingLead as Lead;
            isNewLead = false;

            // For existing leads, perform targeted updates only for fields that were 
            // previously empty (name, profile_pic)
            const updates: Record<string, unknown> = {};

            if (!lead.name && userName) {
                updates.name = userName;
            }
            if (!lead.profile_pic && profilePic) {
                updates.profile_pic = profilePic;
            }

            if (Object.keys(updates).length > 0) {
                const { data: updatedLead, error: updateError } = await supabaseAdmin
                    .from('leads')
                    .update(updates)
                    .eq('id', lead.id)
                    .select()
                    .single();

                if (!updateError && updatedLead) {
                    return updatedLead as Lead;
                }
            }
        } else {
            // Some other error occurred
            console.error('Error inserting lead:', insertError);
            return null;
        }

        // Trigger workflows ONLY for genuinely new leads
        // Since we used atomic INSERT with conflict detection, we can be certain 
        // that isNewLead is true only when our INSERT actually created the row
        if (isNewLead && lead && defaultStage?.id) {
            try {
                console.log(`🚀 New lead ${lead.id} created, triggering workflows for default stage`);
                const { triggerWorkflowsForStage } = await import('./workflowEngine');
                // Fire and forget - don't block lead creation
                triggerWorkflowsForStage(defaultStage.id, lead.id).catch(err => {
                    console.error('Error triggering workflows for new lead:', err);
                });
            } catch (workflowError) {
                console.error('Error importing workflow engine:', workflowError);
            }
        }

        return lead;
    } catch (error) {
        console.error('Error in getOrCreateLead:', error);
        return null;
    }
}


// Increment message count for a lead
export async function incrementMessageCount(leadId: string): Promise<number> {
    try {
        // Use supabaseAdmin to bypass RLS since this is called from webhook context
        const { data, error } = await supabaseAdmin
            .rpc('increment_lead_message_count', { lead_id: leadId });

        if (error) {
            // Fallback: fetch and update manually
            const { data: lead } = await supabaseAdmin
                .from('leads')
                .select('message_count')
                .eq('id', leadId)
                .single();

            const newCount = (lead?.message_count || 0) + 1;

            await supabaseAdmin
                .from('leads')
                .update({
                    message_count: newCount,
                    last_message_at: new Date().toISOString()
                })
                .eq('id', leadId);

            // Trigger score recalculation in background
            calculateLeadScore(leadId).catch(err => {
                console.error('Error recalculating lead score:', err);
            });

            return newCount;
        }

        // Trigger score recalculation in background after RPC success
        calculateLeadScore(leadId).catch(err => {
            console.error('Error recalculating lead score:', err);
        });

        return data || 1;
    } catch (error) {
        console.error('Error incrementing message count:', error);
        return 0;
    }
}

// Helper to increment message count by sender_id
export async function incrementMessageCountForSender(senderId: string, userId?: string | null): Promise<void> {
    try {
        let query = supabaseAdmin
            .from('leads')
            .select('id')
            .eq('sender_id', senderId);

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data: lead } = await query.single();

        if (lead) {
            await incrementMessageCount(lead.id);
        }
    } catch (error) {
        console.error('Error in incrementMessageCountForSender:', error);
    }
}

// Check if we should analyze the lead's stage
// Includes debouncing to prevent rapid duplicate LLM calls
export function shouldAnalyzeStage(lead: Lead, latestMessage: string): boolean {
    // Check if already debouncing for this lead
    if (stageAnalysisDebounce.has(lead.id)) {
        console.log(`[Debounce] Stage analysis for lead ${lead.id} is debounced, skipping`);
        return false;
    }

    let shouldTrigger = false;

    // Trigger after every N messages
    if (lead.message_count > 0 && lead.message_count % MESSAGES_BEFORE_ANALYSIS === 0) {
        shouldTrigger = true;
    }

    // Trigger on keywords
    if (!shouldTrigger) {
        const lowerMessage = latestMessage.toLowerCase();
        for (const keyword of TRIGGER_KEYWORDS) {
            if (lowerMessage.includes(keyword)) {
                shouldTrigger = true;
                break;
            }
        }
    }

    // If triggering, set debounce timer to prevent rapid triggers
    if (shouldTrigger) {
        const debounceMs = getAdaptiveDebounceMs(lead.id);
        const timeoutId = setTimeout(() => {
            stageAnalysisDebounce.delete(lead.id);
        }, debounceMs);
        stageAnalysisDebounce.set(lead.id, timeoutId);
    }

    return shouldTrigger;
}

// Calculate adaptive debounce based on message velocity
function getAdaptiveDebounceMs(leadId: string): number {
    const now = Date.now();
    const timestamps = messageVelocityTracker.get(leadId) || [];

    // Clean old timestamps outside window
    const recentTimestamps = timestamps.filter(t => now - t < MESSAGE_VELOCITY_WINDOW_MS);

    // Track this message
    recentTimestamps.push(now);
    messageVelocityTracker.set(leadId, recentTimestamps);

    // Calculate velocity (messages per minute)
    const velocity = recentTimestamps.length;

    // Scale debounce: more messages = longer debounce
    // 1-2 messages: MIN_DEBOUNCE, 10+ messages: MAX_DEBOUNCE
    const scale = Math.min(1, (velocity - 1) / 9);
    const debounceMs = MIN_DEBOUNCE_MS + scale * (MAX_DEBOUNCE_MS - MIN_DEBOUNCE_MS);

    console.log(`[AdaptiveDebounce] Lead ${leadId}: ${velocity} msgs/min -> ${Math.round(debounceMs)}ms debounce`);

    return debounceMs;
}

// Clean up old velocity data periodically (every 60 seconds)
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [leadId, timestamps] of messageVelocityTracker.entries()) {
            const recent = timestamps.filter(t => now - t < MESSAGE_VELOCITY_WINDOW_MS * 2);
            if (recent.length === 0) {
                messageVelocityTracker.delete(leadId);
            } else {
                messageVelocityTracker.set(leadId, recent);
            }
        }
    }, 60000);
}

// Analyze conversation and update stage
// Uses AI to classify the lead's current stage based on conversation context
export async function analyzeAndUpdateStage(lead: Lead, senderId: string, userId?: string | null): Promise<void> {
    try {
        // Fetch recent conversation history with user_id filtering for multi-tenant safety
        let messagesQuery = supabaseAdmin
            .from('conversations')
            .select('role, content')
            .eq('sender_id', senderId);

        if (userId) {
            messagesQuery = messagesQuery.eq('user_id', userId);
        }

        const { data: messages, error: historyError } = await messagesQuery
            .order('created_at', { ascending: true })
            .limit(20);

        if (historyError || !messages || messages.length === 0) {
            console.log('No conversation history to analyze');
            return;
        }

        // Fetch all pipeline stages with user_id filtering
        let stagesQuery = supabaseAdmin
            .from('pipeline_stages')
            .select('id, name, description');

        if (userId) {
            stagesQuery = stagesQuery.eq('user_id', userId);
        }

        const { data: stages, error: stagesError } = await stagesQuery
            .order('display_order', { ascending: true });

        if (stagesError || !stages || stages.length === 0) {
            console.error('Error fetching stages:', stagesError);
            return;
        }

        // Build conversation summary
        const conversationSummary = messages
            .map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content}`)
            .join('\n');

        // Build stages list for prompt
        const stagesList = stages.map(s => `- ${s.name}: ${s.description || 'No description'}`).join('\n');

        // Call LLM to classify with confidence scoring
        const prompt = `You are a sales pipeline classifier. Based on the conversation below, determine which pipeline stage this lead should be in.

AVAILABLE STAGES:
${stagesList}

CONVERSATION HISTORY:
${conversationSummary}

Respond with ONLY a JSON object in this exact format:
{
  "stage": "Stage Name",
  "confidence": 0.85,
  "reason": "Brief reason for classification",
  "alternative_stage": "Second best stage or null",
  "alternative_confidence": 0.10,
  "detected_signals": ["keyword1", "intent signal"]
}

CONFIDENCE GUIDELINES:
- 0.9-1.0: Very clear intent/action taken (payment sent, appointment booked)
- 0.7-0.89: Strong signals present (pricing questions, product comparison)
- 0.5-0.69: Moderate signals (general interest, browsing behavior)
- Below 0.5: Uncertain, keep in current stage

Choose the most appropriate stage based on the customer's intent, interest level, and conversation progress.`;

        const completion = await client.chat.completions.create({
            model: "deepseek-ai/deepseek-v3.1",
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 200,
        });

        const responseText = completion.choices[0]?.message?.content || '';
        console.log('Pipeline classification response:', responseText);

        // Robust JSON parsing with multiple fallback strategies
        let classification: { stage?: string; reason?: string } | undefined;

        // Strategy 1: Direct JSON parse (cleanest response)
        try {
            classification = JSON.parse(responseText.trim());
        } catch {
            // Strategy 2: Extract JSON from markdown code block
            try {
                const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (codeBlockMatch) {
                    classification = JSON.parse(codeBlockMatch[1].trim());
                }
            } catch {
                // Strategy 3: Find JSON object with stage key anywhere in text
                try {
                    const fullMatch = responseText.match(/\{[^{}]*"stage"\s*:\s*"[^"]+"[^{}]*\}/);
                    if (fullMatch) {
                        classification = JSON.parse(fullMatch[0]);
                    }
                } catch {
                    // Strategy 4: Text-based extraction as last resort
                    const stageMatch = responseText.match(/["']?stage["']?\s*[:\s]+["']?([^"'\n,}]+)/i);
                    if (stageMatch) {
                        classification = {
                            stage: stageMatch[1].trim(),
                            reason: 'Extracted from non-JSON response',
                        };
                        console.log('[LLM Parse] Used fallback text extraction for stage:', classification.stage);
                    }
                }
            }
        }

        if (!classification?.stage) {
            console.log('No stage classification returned');
            return;
        }

        // Cast to LLMClassification for confidence data
        const typedClassification = classification as LLMClassification;
        const classifiedStageName = typedClassification.stage;
        const confidence = typedClassification.confidence ?? 0.5; // Default if not provided

        // Check confidence threshold
        if (confidence < CONFIDENCE_THRESHOLD) {
            console.log(`[LowConfidence] ${confidence.toFixed(2)} below threshold ${CONFIDENCE_THRESHOLD}, keeping current stage`);

            // Log for analytics if confidence is notably low
            if (confidence < LOW_CONFIDENCE_LOG_THRESHOLD) {
                await logPipelineEvent(lead.id, userId || null, 'analysis_triggered', {
                    outcome: 'low_confidence',
                    confidence: confidence,
                    suggested_stage: classifiedStageName,
                    reason: typedClassification.reason,
                });
            }

            // Still update last_analyzed_at and store confidence data
            await supabaseAdmin
                .from('leads')
                .update({
                    last_analyzed_at: new Date().toISOString(),
                    ai_confidence: confidence,
                    ai_alternative_stage: typedClassification.alternative_stage || null,
                })
                .eq('id', lead.id);

            return;
        }

        // Find the matching stage
        const matchedStage = stages.find(s =>
            s.name.toLowerCase() === classifiedStageName.toLowerCase()
        );

        if (!matchedStage) {
            console.log('Stage not found:', classifiedStageName);
            return;
        }

        // Check if transition is allowed (regression prevention)
        const transitionCheck = await isStageTransitionAllowed(
            lead.current_stage_id,
            matchedStage.id,
            userId || null
        );

        if (!transitionCheck.allowed) {
            console.log(`[StageTransition] Blocked: ${transitionCheck.reason}`);
            await logPipelineEvent(lead.id, userId || null, 'analysis_triggered', {
                outcome: 'transition_blocked',
                reason: transitionCheck.reason,
                confidence: confidence,
                suggested_stage: classifiedStageName,
            });

            // Update confidence data even if transition blocked
            await supabaseAdmin
                .from('leads')
                .update({
                    last_analyzed_at: new Date().toISOString(),
                    ai_confidence: confidence,
                    ai_alternative_stage: typedClassification.alternative_stage || null,
                })
                .eq('id', lead.id);

            return;
        }

        // Update lead if stage changed
        if (matchedStage.id !== lead.current_stage_id) {
            // Record stage change history
            await supabaseAdmin
                .from('lead_stage_history')
                .insert({
                    lead_id: lead.id,
                    from_stage_id: lead.current_stage_id,
                    to_stage_id: matchedStage.id,
                    reason: typedClassification.reason || 'AI classification',
                    changed_by: 'ai',
                });

            // Update lead's current stage with confidence data
            await supabaseAdmin
                .from('leads')
                .update({
                    current_stage_id: matchedStage.id,
                    last_analyzed_at: new Date().toISOString(),
                    ai_classification_reason: typedClassification.reason,
                    ai_confidence: confidence,
                    ai_alternative_stage: typedClassification.alternative_stage || null,
                })
                .eq('id', lead.id);

            console.log(`Lead ${lead.id} moved to stage: ${matchedStage.name} (confidence: ${confidence.toFixed(2)})`);

            // Log stage change event
            await logPipelineEvent(lead.id, userId || null, 'stage_change', {
                from_stage_id: lead.current_stage_id,
                to_stage_id: matchedStage.id,
                confidence: confidence,
                reason: typedClassification.reason,
            });

            // Trigger workflows for this stage change
            try {
                const { triggerWorkflowsForStage } = await import('./workflowEngine');
                await triggerWorkflowsForStage(matchedStage.id, lead.id);
            } catch (workflowError) {
                console.error('Error triggering workflows:', workflowError);
            }
        } else {
            // Just update last analyzed timestamp and confidence
            await supabaseAdmin
                .from('leads')
                .update({
                    last_analyzed_at: new Date().toISOString(),
                    ai_confidence: confidence,
                    ai_alternative_stage: typedClassification.alternative_stage || null,
                })
                .eq('id', lead.id);
        }
    } catch (error) {
        console.error('Error in analyzeAndUpdateStage:', error);
    }
}

// Check if stage transition is allowed (prevent regression)
async function isStageTransitionAllowed(
    currentStageId: string | null,
    newStageId: string,
    userId: string | null
): Promise<{ allowed: boolean; reason: string }> {
    if (!currentStageId) {
        return { allowed: true, reason: 'No current stage' };
    }

    // Same stage - not an error, just skip
    if (currentStageId === newStageId) {
        return { allowed: false, reason: 'Already in this stage' };
    }

    // Fetch both stages with priority order
    let query = supabaseAdmin
        .from('pipeline_stages')
        .select('id, name, priority_order')
        .in('id', [currentStageId, newStageId]);

    if (userId) {
        query = query.eq('user_id', userId);
    }

    const { data: stagesData } = await query;

    if (!stagesData || stagesData.length < 2) {
        // Can't determine priority - allow by default
        return { allowed: true, reason: 'Could not fetch stage priorities' };
    }

    const currentStage = stagesData.find(s => s.id === currentStageId);
    const newStage = stagesData.find(s => s.id === newStageId);

    if (!currentStage || !newStage) {
        return { allowed: true, reason: 'Stage not found in results' };
    }

    // If priority_order is not set (0), allow the transition
    if (currentStage.priority_order === 0 || newStage.priority_order === 0) {
        return { allowed: true, reason: 'Priority order not configured' };
    }

    // Prevent regression (moving to lower priority stage)
    if (newStage.priority_order < currentStage.priority_order) {
        return {
            allowed: false,
            reason: `Regression blocked: ${currentStage.name} (${currentStage.priority_order}) -> ${newStage.name} (${newStage.priority_order})`
        };
    }

    return { allowed: true, reason: 'Forward progression' };
}

// Get all leads grouped by stage
export async function getLeadsByStage(): Promise<Record<string, Lead[]>> {
    try {
        const { data: leads, error } = await supabase
            .from('leads')
            .select(`
                *,
                pipeline_stages (
                    id,
                    name,
                    display_order,
                    color
                )
            `)
            .order('last_message_at', { ascending: false });

        if (error) {
            console.error('Error fetching leads:', error);
            return {};
        }

        // Group by stage
        const grouped: Record<string, Lead[]> = {};
        for (const lead of leads || []) {
            const stageName = (lead as unknown as { pipeline_stages?: { name: string } }).pipeline_stages?.name || 'Unassigned';
            if (!grouped[stageName]) {
                grouped[stageName] = [];
            }
            grouped[stageName].push(lead);
        }

        return grouped;
    } catch (error) {
        console.error('Error in getLeadsByStage:', error);
        return {};
    }
}

// Get all pipeline stages
export async function getPipelineStages(): Promise<PipelineStage[]> {
    try {
        const { data, error } = await supabase
            .from('pipeline_stages')
            .select('*')
            .order('display_order', { ascending: true });

        if (error) {
            console.error('Error fetching stages:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error in getPipelineStages:', error);
        return [];
    }
}

// Move a lead to the "Payment Sent" stage when a receipt is detected
export async function moveLeadToReceiptStage(leadId: string, receiptImageUrl: string, reason: string, userId?: string | null): Promise<boolean> {
    try {
        // Find the "Payment Sent" stage (must be scoped to user_id for multi-tenancy)
        let stageQuery = supabaseAdmin
            .from('pipeline_stages')
            .select('id')
            .eq('name', 'Payment Sent');

        if (userId) {
            stageQuery = stageQuery.eq('user_id', userId);
        }

        let { data: paymentStage } = await stageQuery.single();

        // If "Payment Sent" stage doesn't exist for this user, create it
        if (!paymentStage) {
            const insertData: Record<string, unknown> = {
                name: 'Payment Sent',
                display_order: 3, // After "Qualified" typically
                color: '#22c55e', // Green color
                description: 'Customer sent proof of payment',
            };
            if (userId) {
                insertData.user_id = userId;
            }

            const { data: newStage, error: createError } = await supabaseAdmin
                .from('pipeline_stages')
                .insert(insertData)
                .select()
                .single();

            if (createError) {
                console.error('Error creating Payment Sent stage:', createError);
                return false;
            }
            paymentStage = newStage;
        }

        // Get current lead info
        const { data: lead } = await supabaseAdmin
            .from('leads')
            .select('current_stage_id')
            .eq('id', leadId)
            .single();

        if (!lead) {
            console.error('Lead not found:', leadId);
            return false;
        }

        if (!paymentStage) {
            console.error('Payment stage not available');
            return false;
        }

        // Only update if not already in Payment Sent stage
        if (lead.current_stage_id === paymentStage.id) {
            console.log('Lead already in Payment Sent stage');
            return true;
        }

        // Record stage change history
        await supabaseAdmin
            .from('lead_stage_history')
            .insert({
                lead_id: leadId,
                from_stage_id: lead.current_stage_id,
                to_stage_id: paymentStage.id,
                reason: reason,
                changed_by: 'ai_receipt_detection',
            });

        // Update lead's current stage and receipt info
        const { error: updateError } = await supabaseAdmin
            .from('leads')
            .update({
                current_stage_id: paymentStage.id,
                receipt_image_url: receiptImageUrl,
                receipt_detected_at: new Date().toISOString(),
                ai_classification_reason: reason,
            })
            .eq('id', leadId);

        if (updateError) {
            console.error('Error updating lead stage:', updateError);
            return false;
        }

        console.log(`Lead ${leadId} moved to Payment Sent stage`);

        // Trigger workflows for this stage change
        try {
            const { triggerWorkflowsForStage } = await import('./workflowEngine');
            await triggerWorkflowsForStage(paymentStage.id, leadId);
        } catch (workflowError) {
            console.error('Error triggering workflows:', workflowError);
        }

        return true;
    } catch (error) {
        console.error('Error in moveLeadToReceiptStage:', error);
        return false;
    }
}

// Move a lead to the "Appointment Scheduled" stage when an appointment is booked
export async function moveLeadToAppointmentStage(
    senderId: string,
    appointmentDetails: { appointmentId: string; appointmentDate: string; startTime: string },
    userId?: string | null
): Promise<boolean> {
    try {
        // Get lead by sender_id with user_id filtering for multi-tenancy
        let leadQuery = supabaseAdmin
            .from('leads')
            .select('id, current_stage_id')
            .eq('sender_id', senderId);

        if (userId) {
            leadQuery = leadQuery.eq('user_id', userId);
        }

        const { data: lead } = await leadQuery.single();

        if (!lead) {
            console.log('Lead not found for sender:', senderId);
            return false;
        }

        // Find the "Appointment Scheduled" stage (scoped to user_id)
        let stageQuery = supabaseAdmin
            .from('pipeline_stages')
            .select('id')
            .eq('name', 'Appointment Scheduled');

        if (userId) {
            stageQuery = stageQuery.eq('user_id', userId);
        }

        let { data: appointmentStage } = await stageQuery.single();

        // If "Appointment Scheduled" stage doesn't exist for this user, create it
        if (!appointmentStage) {
            const insertData: Record<string, unknown> = {
                name: 'Appointment Scheduled',
                display_order: 2,
                color: '#8b5cf6', // Purple color
                description: 'Customer has booked an appointment',
            };
            if (userId) {
                insertData.user_id = userId;
            }

            const { data: newStage, error: createError } = await supabaseAdmin
                .from('pipeline_stages')
                .insert(insertData)
                .select()
                .single();

            if (createError) {
                console.error('Error creating Appointment Scheduled stage:', createError);
                return false;
            }
            appointmentStage = newStage;
        }

        if (!appointmentStage) {
            console.error('Appointment Scheduled stage not available');
            return false;
        }

        // Only update if not already in Appointment Scheduled stage
        if (lead.current_stage_id === appointmentStage.id) {
            console.log('Lead already in Appointment Scheduled stage');
            return true;
        }

        // Record stage change history
        await supabaseAdmin
            .from('lead_stage_history')
            .insert({
                lead_id: lead.id,
                from_stage_id: lead.current_stage_id,
                to_stage_id: appointmentStage.id,
                reason: `Booked appointment for ${appointmentDetails.appointmentDate} at ${appointmentDetails.startTime}`,
                changed_by: 'appointment_booking',
            });

        // Update lead's current stage and mark goal as met
        const { error: updateError } = await supabaseAdmin
            .from('leads')
            .update({
                current_stage_id: appointmentStage.id,
                ai_classification_reason: `Booked appointment (ID: ${appointmentDetails.appointmentId})`,
                goal_met_at: new Date().toISOString(),
            })
            .eq('id', lead.id);

        if (updateError) {
            console.error('Error updating lead stage:', updateError);
            return false;
        }

        console.log(`📅 Lead ${lead.id} moved to Appointment Scheduled stage`);

        // Trigger workflows for this stage change
        try {
            const { triggerWorkflowsForStage } = await import('./workflowEngine');
            await triggerWorkflowsForStage(appointmentStage.id, lead.id);
        } catch (workflowError) {
            console.error('Error triggering workflows:', workflowError);
        }

        return true;
    } catch (error) {
        console.error('Error in moveLeadToAppointmentStage:', error);
        return false;
    }
}

// Calculate and update lead score based on engagement, intent, and qualification
export async function calculateLeadScore(leadId: string, userId?: string | null): Promise<LeadScore> {
    try {
        // Fetch lead data
        const { data: lead } = await supabaseAdmin
            .from('leads')
            .select('message_count, created_at, last_message_at, goal_met_at, sender_id')
            .eq('id', leadId)
            .single();

        if (!lead) {
            return { engagement: 0, intent: 0, qualification: 0, total: 0 };
        }

        // Fetch recent messages for intent analysis
        let messagesQuery = supabaseAdmin
            .from('conversations')
            .select('content, role, created_at')
            .eq('sender_id', lead.sender_id)
            .order('created_at', { ascending: false })
            .limit(30);

        if (userId) {
            messagesQuery = messagesQuery.eq('user_id', userId);
        }

        const { data: messages } = await messagesQuery;

        // ENGAGEMENT SCORE (0-100)
        // Based on message count and recency
        const messageScore = Math.min(100, (lead.message_count || 0) * 5);
        const daysSinceLastMessage = lead.last_message_at
            ? (Date.now() - new Date(lead.last_message_at).getTime()) / (1000 * 60 * 60 * 24)
            : 30;
        const recencyScore = Math.max(0, 100 - daysSinceLastMessage * 10);
        const engagementScore = Math.round((messageScore + recencyScore) / 2);

        // INTENT SCORE (0-100)
        // Based on high-intent keywords in messages
        const HIGH_INTENT_KEYWORDS = [
            'buy', 'purchase', 'order', 'price', 'payment', 'book', 'schedule', 'interested',
            'magkano', 'bili', 'bayad', 'presyo', 'pabili', 'oorder'
        ];
        const MEDIUM_INTENT_KEYWORDS = [
            'how much', 'available', 'when', 'details', 'info', 'ano', 'paano', 'meron'
        ];

        let intentHits = 0;
        let mediumIntentHits = 0;

        for (const msg of messages || []) {
            if (msg.role === 'user') {
                const lower = (msg.content || '').toLowerCase();
                for (const kw of HIGH_INTENT_KEYWORDS) {
                    if (lower.includes(kw)) intentHits++;
                }
                for (const kw of MEDIUM_INTENT_KEYWORDS) {
                    if (lower.includes(kw)) mediumIntentHits++;
                }
            }
        }

        const intentScore = Math.min(100, intentHits * 15 + mediumIntentHits * 5);

        // QUALIFICATION SCORE (0-100)
        // Based on goal completion and stage progression
        let qualificationScore = 0;
        if (lead.goal_met_at) {
            qualificationScore = 100;
        } else {
            // Partial score based on engagement patterns
            qualificationScore = Math.round((engagementScore + intentScore) / 4);
        }

        // TOTAL SCORE (weighted)
        const total = Math.round(
            engagementScore * SCORING_WEIGHTS.engagement +
            intentScore * SCORING_WEIGHTS.intent +
            qualificationScore * SCORING_WEIGHTS.qualification
        );

        // Update lead with scores
        await supabaseAdmin
            .from('leads')
            .update({
                engagement_score: engagementScore,
                intent_score: intentScore,
                qualification_score: qualificationScore,
                lead_score: total,
                last_activity_at: new Date().toISOString(),
            })
            .eq('id', leadId);

        console.log(`[LeadScore] Lead ${leadId}: E=${engagementScore} I=${intentScore} Q=${qualificationScore} Total=${total}`);

        return {
            engagement: engagementScore,
            intent: intentScore,
            qualification: qualificationScore,
            total,
        };
    } catch (error) {
        console.error('Error calculating lead score:', error);
        return { engagement: 0, intent: 0, qualification: 0, total: 0 };
    }
}
