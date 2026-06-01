const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function run() {
  const query = "https://growspace.agency/"; // Or whatever the last query is
  const embeddingRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: "can you call via whatsapp please.. there is an network issue in home https://growspace.agency/",
    dimensions: 1536
  });
  const query_embedding = embeddingRes.data[0].embedding;
  
  const { data: vectorDocs, error } = await supabase.rpc('match_knowledge', {
    query_embedding,
    match_threshold: 0.50,
    match_count: 6
  });
  
  if (error) {
    console.error(error);
  } else {
    console.log(vectorDocs.map(d => d.rule_short || d.question));
  }
}
run();
