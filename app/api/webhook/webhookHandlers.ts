import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { startOrRefreshTakeover } from '@/app/lib/humanTakeoverService';
import { getSettings, getPageTokenAndUser } from './config';
import { handleImageMessage, handleMessage, handlePostback, handleReferral } from './messageHandlers';
import { checkAndMarkProcessed } from '@/app/lib/webhookDeduplication';

// In-memory cache as fast first-pass filter (reduces DB calls for immediate retries)
// The distributed Supabase deduplication handles cross-instance cases
const recentMessages = new Set<string>();
const MAX_RECENT_CACHE = 500;

function addToRecentCache(messageId: string) {
    recentMessages.add(messageId);
    if (recentMessages.size > MAX_RECENT_CACHE) {
        const first = recentMessages.values().next().value;
        if (first) recentMessages.delete(first);
    }
}

export async function handleGetWebhook(req: Request) {
    const settings = await getSettings();
    const VERIFY_TOKEN = settings.facebook_verify_token || process.env.FACEBOOK_VERIFY_TOKEN || 'TEST_TOKEN';
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            return new NextResponse(challenge, { status: 200 });
        } else {
            return new NextResponse('Forbidden', { status: 403 });
        }
    }

    return new NextResponse('Bad Request', { status: 400 });
}

export async function handlePostWebhook(req: Request) {
    try {
        const body = await req.json();

        console.log('Webhook POST received:', JSON.stringify(body, null, 2));

        if (body.object === 'page') {
            for (const entry of body.entry) {
                const webhook_event = entry.messaging?.[0];
                if (!webhook_event) {
                    console.log('No messaging event found in entry:', entry);
                    continue;
                }


                const sender_psid = webhook_event.sender?.id;
                const recipient_psid = webhook_event.recipient?.id; // This is the page ID

                // Get the user ID that owns this page - CRITICAL for multi-user
                let userId: string | null = null;
                if (recipient_psid) {
                    const pageInfo = await getPageTokenAndUser(recipient_psid);
                    userId = pageInfo.userId;
                    if (userId) {
                        console.log(`[Webhook] Page ${recipient_psid} owned by user ${userId}`);
                    } else {
                        console.warn(`[Webhook] No user found for page ${recipient_psid}`);
                    }
                }

                // Handle Referral (m.me links with ref param)
                if (webhook_event.referral) {
                    console.log('Referral event received:', webhook_event.referral);
                    waitUntil(
                        handleReferral(sender_psid, webhook_event.referral, recipient_psid, userId).catch(err => {
                            console.error('Error handling referral:', err);
                        })
                    );
                    continue;
                }

                if (webhook_event.postback) {
                    console.log('Postback event received:', webhook_event.postback);
                    const handled = await handlePostback(webhook_event.postback, sender_psid, recipient_psid, userId, waitUntil);
                    if (handled) {
                        continue;
                    }
                }

                const messageId = webhook_event.message?.mid;

                // Distributed deduplication: first check in-memory cache (fast), then distributed DB
                if (messageId) {
                    // Fast first-pass: check in-memory cache for immediate retries
                    if (recentMessages.has(messageId)) {
                        console.log('Skipping duplicate message (cache hit):', messageId);
                        continue;
                    }

                    // Distributed check-and-mark: atomically claim this message
                    // Returns true if already processed by another instance
                    const alreadyProcessed = await checkAndMarkProcessed(messageId);
                    if (alreadyProcessed) {
                        console.log('Skipping duplicate message (distributed):', messageId);
                        continue;
                    }

                    // Add to local cache for fast filtering of immediate retries
                    addToRecentCache(messageId);
                }

                console.log('Processing message from:', sender_psid, 'to:', recipient_psid, 'mid:', messageId, 'userId:', userId);

                // Check if this is a message echo (page/human agent sent a message)
                const isEchoMessage = webhook_event.message?.is_echo === true;

                if (isEchoMessage) {
                    // This is a message sent BY the page (human agent) TO a customer
                    // For echo messages:
                    //   - sender.id = Page ID (who sent the message)  
                    //   - recipient.id = Customer PSID (who received the message)
                    const customerPsid = webhook_event.recipient?.id;
                    const pageId = webhook_event.sender?.id;

                    // Look up user from the page that sent the message
                    let echoUserId: string | null = null;
                    if (pageId) {
                        const pageInfo = await getPageTokenAndUser(pageId);
                        echoUserId = pageInfo.userId;
                    }

                    console.log('📢 MESSAGE ECHO detected! Human agent sent message to:', customerPsid, 'from page:', pageId, 'userId:', echoUserId);

                    if (customerPsid) {
                        waitUntil(
                            startOrRefreshTakeover(customerPsid, echoUserId).catch(err => {
                                console.error('Error starting takeover:', err);
                            })
                        );
                    }
                    continue;
                }

                if (webhook_event.message) {
                    const hasImageAttachment = webhook_event.message.attachments?.some(
                        (att: { type: string }) => att.type === 'image'
                    );
                    const messageText = webhook_event.message.text;

                    // Handle image attachments - pass any accompanying text to the image handler
                    if (webhook_event.message.attachments) {
                        for (const attachment of webhook_event.message.attachments) {
                            if (attachment.type === 'image' && attachment.payload?.url) {
                                console.log('Image attachment detected:', attachment.payload.url.substring(0, 100));
                                waitUntil(
                                    handleImageMessage(
                                        sender_psid,
                                        attachment.payload.url,
                                        recipient_psid,
                                        userId,
                                        messageText // Pass accompanying text
                                    ).catch(err => {
                                        console.error('Error handling image message:', err);
                                    })
                                );
                            }
                        }
                    }

                    // Handle text messages ONLY if there's no image attachment
                    // (if there's an image, the image handler already processes the text)
                    if (messageText && !hasImageAttachment) {
                        console.log('Message text:', messageText);
                        waitUntil(
                            handleMessage(sender_psid, messageText, recipient_psid, userId).catch(err => {
                                console.error('Error handling message:', err);
                            })
                        );
                    }
                }
            }
            return new NextResponse('EVENT_RECEIVED', { status: 200 });
        } else {
            console.log('Not a page event:', body.object);
            return new NextResponse('Not Found', { status: 404 });
        }
    } catch (error) {
        console.error('Webhook error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
