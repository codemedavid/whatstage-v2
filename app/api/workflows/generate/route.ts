import { NextRequest, NextResponse } from 'next/server';
import { generateWorkflow } from '@/app/lib/workflowGenerator';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { prompt, stageId } = body;

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json(
                { error: 'Prompt is required' },
                { status: 400 }
            );
        }

        if (prompt.length < 10) {
            return NextResponse.json(
                { error: 'Prompt is too short. Please provide more details.' },
                { status: 400 }
            );
        }

        if (prompt.length > 2000) {
            return NextResponse.json(
                { error: 'Prompt is too long. Please keep it under 2000 characters.' },
                { status: 400 }
            );
        }

        console.log('[Workflow Generator] Generating workflow for prompt:', prompt.substring(0, 100));

        const workflow = await generateWorkflow(prompt, stageId);

        console.log('[Workflow Generator] Generated workflow:', workflow.name, 'with', workflow.nodes.length, 'nodes');

        return NextResponse.json(workflow);

    } catch (error) {
        console.error('[Workflow Generator] Error:', error);

        if (error instanceof SyntaxError) {
            return NextResponse.json(
                { error: 'AI generated invalid response. Please try again with a clearer prompt.' },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to generate workflow. Please try again.' },
            { status: 500 }
        );
    }
}
