import { getClients } from "./src/lib/whmcs"
async function run() {
  const data = await getClients("imran@hostnin.com")
  console.log(JSON.stringify(data, null, 2))
}
run()
