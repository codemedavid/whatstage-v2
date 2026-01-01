import { createClient } from '@/app/lib/supabaseServer';
import { NextResponse } from 'next/server';

// This is a public route, potentially.
// But createClient() uses cookies.
// For public access, we might need a service role client or ensure RLS allows anon.
// We'll rely on RLS allowing anon access as configured in migration.
// createClient() with no cookies will fall back to anon key which is fine if RLS allows.

export async function POST(request: Request) {
    const supabase = await createClient();

    try {
        const body = await request.json();
        const { form_id, data: submissionData, digital_product_id, user_id } = body;

        if (!form_id || !submissionData) {
            return NextResponse.json({ error: 'Missing form_id or data' }, { status: 400 });
        }

        // 1. Fetch Form configuration to know mapping
        const { data: form, error: formError } = await supabase
            .from('forms')
            .select('*')
            .eq('id', form_id)
            .single();

        if (formError || !form) {
            return NextResponse.json({ error: 'Form not found' }, { status: 404 });
        }

        const { data: fields, error: fieldsError } = await supabase
            .from('form_fields')
            .select('*')
            .eq('form_id', form_id);

        if (fieldsError) {
            return NextResponse.json({ error: 'Error loading fields' }, { status: 500 });
        }

        // 2. Prepare Lead Data
        // We need to identify if lead exists (by email/phone) or create new.
        // However, leads usually use sender_id (from FB usually).
        // For web forms, we might generate a sender_id or allow null sender_id?
        // Looking at schema: `sender_id TEXT NOT NULL UNIQUE`.
        // This is a constraint. We need a sender_id.
        // For web leads, we can generate a unique ID, e.g. "web:uuid".

        // Check if email or phone exists to deduplicate?
        // Current schema enforces UNIQUE on sender_id.
        // It DOES NOT enforce unique email/phone (just indexes).

        // Strategy:
        // Extract Email/Phone from submissionData based on mapping.
        let email = null;
        let phone = null;
        let name = null;
        const customData: Record<string, any> = {};

        fields.forEach((field: any) => {
            const value = submissionData[field.id]; // data keyed by field_id
            if (value) {
                if (field.mapping_field === 'email') email = value;
                else if (field.mapping_field === 'phone') phone = value;
                else if (field.mapping_field === 'name') name = value;
                else {
                    // Add to custom data using Label as key (or field id?)
                    // Label is human readable, Field ID is stable.
                    // Let's use Label for readability in UI for now, or maybe Field ID is safer?
                    // `custom_data` is JSONB. Let's use label for now so it's readable.
                    customData[field.label] = value;
                }
            }
        });

        // Try to find existing lead
        let leadId = null;

        // First priority: Check for existing Facebook lead by sender_id (PSID)
        // This ensures Messenger users are linked to their existing lead
        if (user_id) {
            const { data: fbLead } = await supabase
                .from('leads')
                .select('id')
                .eq('sender_id', user_id)
                .single();
            if (fbLead) {
                leadId = fbLead.id;
                console.log(`[FormSubmit] Found existing Facebook lead: ${leadId} for PSID: ${user_id}`);
            }
        }

        // Fallback: Try to find by email
        if (!leadId && email) {
            const { data: existingLead } = await supabase
                .from('leads')
                .select('id')
                .eq('email', email)
                .limit(1)
                .single();
            if (existingLead) leadId = existingLead.id;
        }

        // Fallback: Try to find by phone
        if (!leadId && phone) {
            const { data: existingLead } = await supabase
                .from('leads')
                .select('id')
                .eq('phone', phone)
                .limit(1)
                .single();
            if (existingLead) leadId = existingLead.id;
        }

        // Track if we found by Facebook PSID (to preserve original Messenger name)
        const isFromMessenger = !!user_id && leadId !== null;

        // 3. Create or Update Lead
        if (leadId) {
            // Update existing lead
            // Store form name in custom_data to preserve original Messenger name
            if (name && isFromMessenger) {
                customData['form_name'] = name; // Store form-submitted name separately
            }

            const updates: any = { custom_data: customData };

            // Only update name if NOT from Messenger (preserve original FB profile name)
            if (name && !isFromMessenger) {
                updates.name = name;
            }

            // Always update phone/email if provided (these are more reliable from forms)
            if (phone) updates.phone = phone;
            if (email) updates.email = email;

            console.log(`[FormSubmit] Updating lead ${leadId}, isFromMessenger: ${isFromMessenger}, preserving original name: ${isFromMessenger}`);

            await supabase
                .from('leads')
                .update(updates)
                .eq('id', leadId);
        } else {
            // Create New Lead
            // Generate pseudo sender_id
            const newSenderId = `web_form_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const newLead = {
                sender_id: newSenderId,
                name: name || 'Form Lead',
                email,
                phone,
                current_stage_id: form.pipeline_stage_id, // Default to form's stage
                custom_data: customData,
                message_count: 0
            };

            const { data: createdLead, error: createError } = await supabase
                .from('leads')
                .insert([newLead])
                .select()
                .single();

            if (createError) {
                console.error('Lead create error', createError);
                // If error (e.g. sender_id collision), maybe retry? 
                return NextResponse.json({ error: 'Failed to create lead: ' + createError.message }, { status: 500 });
            }
            leadId = createdLead.id;
        }

        // 4. Record Submission
        const { data: submission, error: matchError } = await supabase
            .from('form_submissions')
            .insert([{
                form_id: form_id,
                lead_id: leadId,
                submitted_data: {
                    ...submissionData,
                    ...(user_id ? { _messenger_user_id: user_id } : {})
                },
                digital_product_id: digital_product_id || null
            }])
            .select()
            .single();

        if (matchError) {
            console.error('Submission log error', matchError);
        }

        // 5. If this is a digital product checkout, create a purchase record
        if (digital_product_id && submission) {
            try {
                // Fetch digital product details for price and notification settings
                const { data: digitalProduct } = await supabase
                    .from('digital_products')
                    .select('title, price, access_duration_days, notification_title, notification_greeting, notification_button_text, notification_button_url')
                    .eq('id', digital_product_id)
                    .single();

                let accessExpiresAt = null;
                if (digitalProduct?.access_duration_days) {
                    const expiryDate = new Date();
                    expiryDate.setDate(expiryDate.getDate() + digitalProduct.access_duration_days);
                    accessExpiresAt = expiryDate.toISOString();
                }

                await supabase
                    .from('digital_product_purchases')
                    .insert([{
                        digital_product_id: digital_product_id,
                        lead_id: leadId,
                        form_submission_id: submission.id,
                        facebook_psid: user_id || null,
                        amount_paid: digitalProduct?.price || 0,
                        access_expires_at: accessExpiresAt,
                        status: 'pending'
                    }])
                    .select()
                    .single()
                    .then(async ({ data: purchaseRecord }) => {
                        if (purchaseRecord) {
                            // Trigger workflows for digital product purchase
                            try {
                                const { triggerWorkflowsForDigitalPurchase } = await import('@/app/lib/workflowEngine');
                                await triggerWorkflowsForDigitalPurchase(
                                    purchaseRecord.id,
                                    user_id || null,
                                    digital_product_id,
                                    leadId
                                );
                            } catch (workflowError) {
                                console.error('[FormSubmit] Error triggering digital product workflows:', workflowError);
                            }

                            // Send Messenger notification if user_id (PSID) is available
                            if (user_id && digitalProduct) {
                                try {
                                    // Get lead's page_id to ensure we can send message
                                    const { data: lead } = await supabase
                                        .from('leads')
                                        .select('page_id')
                                        .eq('id', leadId)
                                        .single();

                                    // Fallback to bot_settings page_id if lead doesn't have one
                                    let pageId = lead?.page_id;
                                    if (!pageId) {
                                        const { data: botSettings } = await supabase
                                            .from('bot_settings')
                                            .select('page_id')
                                            .limit(1)
                                            .single();
                                        pageId = botSettings?.page_id || null;
                                        console.log(`[FormSubmit] Lead has no page_id, using bot_settings page_id: ${pageId}`);
                                    }

                                    if (pageId) {
                                        const { callSendAPI } = await import('@/app/api/webhook/facebookClient');

                                        // Build notification message
                                        const notificationTitle = digitalProduct.notification_title || `🎉 Thank You for Your Purchase!`;
                                        const notificationGreeting = digitalProduct.notification_greeting ||
                                            `Thank you for purchasing "${digitalProduct.title}"! Your order has been received and is being processed.`;

                                        const hasButton = digitalProduct.notification_button_text && digitalProduct.notification_button_url;

                                        if (hasButton) {
                                            // Send as button template
                                            await callSendAPI(user_id, {
                                                attachment: {
                                                    type: 'template',
                                                    payload: {
                                                        template_type: 'button',
                                                        text: `${notificationTitle}\n\n${notificationGreeting}`,
                                                        buttons: [
                                                            {
                                                                type: 'web_url',
                                                                url: digitalProduct.notification_button_url,
                                                                title: digitalProduct.notification_button_text,
                                                                webview_height_ratio: 'tall'
                                                            }
                                                        ]
                                                    }
                                                }
                                            }, pageId);
                                        } else {
                                            // Send as plain text
                                            await callSendAPI(user_id, {
                                                text: `${notificationTitle}\n\n${notificationGreeting}`
                                            }, pageId);
                                        }

                                        console.log(`[FormSubmit] Sent digital product purchase notification to PSID: ${user_id}`);
                                    } else {
                                        console.log(`[FormSubmit] Cannot send notification - no page_id available for lead ${leadId}`);
                                    }
                                } catch (notificationError) {
                                    console.error('[FormSubmit] Error sending purchase notification:', notificationError);
                                    // Don't fail the submission if notification fails
                                }
                            }
                        }
                    });

                console.log(`[FormSubmit] Created digital product purchase for product ${digital_product_id}, lead ${leadId}, PSID: ${user_id || 'none'}`);
            } catch (purchaseError) {
                console.error('Error creating purchase record:', purchaseError);
                // Don't fail the submission if purchase record fails
            }
        }

        return NextResponse.json({ success: true, lead_id: leadId });

    } catch (error) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
