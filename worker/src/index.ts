import { processNextDispatch } from "./dispatch";
import { processNextExtraction } from "./extract";

const POLL_MS = Number(process.env.POLL_MS || 15000);

let busy = false;

async function tick() {
  if (busy) {
    console.log("[worker] tick skipped — ainda processando");
    return;
  }
  busy = true;
  try {
    const didExtract = await processNextExtraction();
    if (didExtract) return;
    await processNextDispatch();
  } catch (e) {
    console.error("[worker] tick error", e);
  } finally {
    busy = false;
  }
}

console.log("[worker] Levorato Prospect worker iniciado");
console.log(
  "[worker] POLL_MS=",
  POLL_MS,
  "HEADLESS=",
  process.env.HEADLESS ?? "true",
);

await tick();
setInterval(() => {
  tick().catch((e) => console.error(e));
}, POLL_MS);
