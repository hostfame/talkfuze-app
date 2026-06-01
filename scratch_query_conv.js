global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data: convs, error } = await supabase
        .from('conversations')
        .select(`id, messages(id)`);
        
    if (error) {
        console.error("Error:", error);
        return;
    }
    
    const emptyConvs = convs.filter(c => !c.messages || c.messages.length === 0);
    console.log(`Found ${emptyConvs.length} empty conversations`);
    
    if (emptyConvs.length > 0) {
        const ids = emptyConvs.map(c => c.id);
        const { error: delErr } = await supabase
            .from('conversations')
            .delete()
            .in('id', ids);
            
        if (delErr) {
            console.error("Error deleting:", delErr);
        } else {
            console.log("Deleted successfully.");
        }
    }
}
main();
