import { createClient } from '@/app/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id;
    const supabase = await createClient();

    // Fetch form with fields
    const { data: form, error: formError } = await supabase
        .from('forms')
        .select('*')
        .eq('id', id)
        .single();

    if (formError) {
        return NextResponse.json({ error: formError.message }, { status: 500 });
    }

    const { data: fields, error: fieldsError } = await supabase
        .from('form_fields')
        .select('*')
        .eq('form_id', id)
        .order('display_order', { ascending: true });

    if (fieldsError) {
        return NextResponse.json({ error: fieldsError.message }, { status: 500 });
    }

    return NextResponse.json({ ...form, fields });
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id;
    const supabase = await createClient();

    try {
        const body = await request.json();
        const { title, description, pipeline_stage_id, page_id, settings, fields } = body;

        // 1. Update Form Details
        const { error: formError } = await supabase
            .from('forms')
            .update({ title, description, pipeline_stage_id, page_id, settings })
            .eq('id', id);

        if (formError) {
            return NextResponse.json({ error: formError.message }, { status: 500 });
        }

        // 2. Handle Fields update if provided
        if (fields && Array.isArray(fields)) {
            // Delete existing fields (simple strategy: replace all)
            // Or upsert. Upsert is better if preserving IDs is important, but replace is simpler for drag-drop reordering.
            // For now, let's try upserting/deleting. But simplest is delete all and re-insert for this MVP.
            // HOWEVER, that changes IDs.
            // Let's use upsert.

            // Actually, for a builder, typically we send the whole state.
            // Let's delete all fields for this form and re-create them.

            const { error: deleteError } = await supabase
                .from('form_fields')
                .delete()
                .eq('form_id', id);

            if (deleteError) {
                return NextResponse.json({ error: deleteError.message }, { status: 500 });
            }

            // Prepare fields for insertion
            const fieldsToInsert = fields.map((field: any, index: number) => ({
                form_id: id,
                label: field.label,
                field_type: field.field_type,
                is_required: field.is_required,
                options: field.options,
                placeholder: field.placeholder,
                mapping_field: field.mapping_field,
                step_number: field.step_number || 1,
                display_order: index // Ensure order is saved based on array order
            }));

            if (fieldsToInsert.length > 0) {
                const { error: insertError } = await supabase
                    .from('form_fields')
                    .insert(fieldsToInsert);

                if (insertError) {
                    return NextResponse.json({ error: insertError.message }, { status: 500 });
                }
            }
        }

        // Fetch updated data to return
        const { data: updatedForm } = await supabase.from('forms').select('*').eq('id', id).single();
        const { data: updatedFields } = await supabase.from('form_fields').select('*').eq('form_id', id).order('display_order');

        return NextResponse.json({ ...updatedForm, fields: updatedFields });

    } catch (error) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id;
    const supabase = await createClient();

    const { error } = await supabase
        .from('forms')
        .delete()
        .eq('id', id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
