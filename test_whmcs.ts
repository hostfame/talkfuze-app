import { getClientDetailsByEmailFast, getClients } from "./src/lib/whmcs";
async function test() {
  console.log("Testing getClientDetailsByEmailFast...");
  const res1 = await getClientDetailsByEmailFast("emon3082@gmail.com");
  console.log("Email Result:", JSON.stringify(res1, null, 2));

  console.log("Testing getClients...");
  const res2 = await getClients("emon3082@gmail.com");
  console.log("Search Result:", JSON.stringify(res2, null, 2));
}
test();
