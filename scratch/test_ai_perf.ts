require('dotenv').config({path: '.env.local'});
global.WebSocket = require('ws');
import { generateAiDraft } from '../src/actions/ai';

async function test() {
  console.time('Full Execution');
  const res = await generateAiDraft("Customer: My domain is not working", "John", "some-org");
  console.timeEnd('Full Execution');
  console.log(res);
}
test();
