import { supabase } from './supabase';

export interface MessengerSendOptions {
    messagingType?: 'RESPONSE' | 'UPDATE' | 'MESSAGE_TAG';
    tag?: 'ACCOUNT_UPDATE' | 'CONFIRMED_EVENT_UPDATE' | 'POST_PURCHASE_UPDATE';
}

export async function sendMessengerMessage(
    psid: string,
    text: string,
    options: MessengerSendOptions = {}
): Promise<boolean> {
    try {
        // Get page access token
        const { data: settings } = await supabase
            .from('bot_settings')
            .select('facebook_page_access_token')
            .limit(1)
            .single();

        const PAGE_ACCESS_TOKEN = settings?.facebook_page_access_token || process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

        if (!PAGE_ACCESS_TOKEN) {
            console.error('No Facebook Page Access Token available');
            return false;
        }

        const requestBody: any = {
            recipient: { id: psid },
            message: { text },
        };

        // Add messaging_type and tag for messages outside 24hr window
        if (options.messagingType) {
            requestBody.messaging_type = options.messagingType;
        }
        if (options.tag) {
            requestBody.tag = options.tag;
        }

        console.log('Sending Messenger message:', { psid, messagingType: options.messagingType, tag: options.tag });

        const res = await fetch(
            `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            }
        );

        const resData = await res.json();

        if (!res.ok) {
            console.error('Failed to send Messenger message:', resData);
            return false;
        }

        console.log('Messenger message sent successfully:', resData);
        return true;
    } catch (error) {
        console.error('Error sending Messenger message:', error);
        return false;
    }
}

export async function sendWithAccountUpdateTag(psid: string, text: string): Promise<boolean> {
    return sendMessengerMessage(psid, text, {
        messagingType: 'MESSAGE_TAG',
        tag: 'ACCOUNT_UPDATE',
    });
}

export async function canUseBotForLead(leadId: string): Promise<boolean> {
    const { data: lead } = await supabase
        .from('leads')
        .select('bot_disabled')
        .eq('id', leadId)
        .single();

    return !lead?.bot_disabled;
}

export async function disableBotForLead(leadId: string, reason?: string): Promise<void> {
    await supabase
        .from('leads')
        .update({ bot_disabled: true, bot_disabled_reason: reason })
        .eq('id', leadId);
}

export async function enableBotForLead(leadId: string): Promise<void> {
    await supabase
        .from('leads')
        .update({ bot_disabled: false, bot_disabled_reason: null })
        .eq('id', leadId);
}
