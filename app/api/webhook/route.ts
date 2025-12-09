export async function GET(req: Request) {
    const { handleGetWebhook } = await import('./webhookHandlers');
    return handleGetWebhook(req);
}

export async function POST(req: Request) {
    const { handlePostWebhook } = await import('./webhookHandlers');
    return handlePostWebhook(req);
}
