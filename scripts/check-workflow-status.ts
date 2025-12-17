
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load env vars manually
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach((line) => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^['"]|['"]$/g, ''); // simple quote removal
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkExecutions() {
    const now = new Date().toISOString();
    console.log('Current time (ISO):', now);

    const { data, error } = await supabase
        .from('workflow_executions')
        .select('*')
        .eq('status', 'pending');

    if (error) {
        console.error('Error fetching executions:', error);
        return;
    }

    console.log(`Found ${data.length} pending executions.`);

    data.forEach(exec => {
        console.log(`- ID: ${exec.id}`);
        console.log(`  Lead ID: ${exec.lead_id}`);
        console.log(`  Scheduled For: ${exec.scheduled_for}`);
        console.log(`  Is Scheduled <= Now? ${exec.scheduled_for <= now}`);
    });
}

checkExecutions();
