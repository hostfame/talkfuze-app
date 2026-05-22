const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/run_sql';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function check() {
  const sql = `
    SELECT pol.polname, pol.polcmd, pol.polqual 
    FROM pg_policy pol 
    JOIN pg_class tbl ON pol.polrelid = tbl.oid 
    WHERE tbl.relname = 'messages';
  `;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': 'Bearer ' + key
    },
    body: JSON.stringify({ sql_query: sql })
  });
  const data = await res.text();
  console.log(data);
}
check();
