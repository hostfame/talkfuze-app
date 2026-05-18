import { getClients } from "./src/lib/whmcs"
async function test() {
  const result = await getClients("imran");
  console.log(JSON.stringify(result, null, 2));
}
test();
