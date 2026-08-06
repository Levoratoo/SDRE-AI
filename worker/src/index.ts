import { processNextDispatch } from "./dispatch";
import { processNextExtraction } from "./extract";

const POLL_MS = Number(process.env.POLL_MS || 15000);

async function tick() {
  try {
    const didExtract = await processNextExtraction();
    if (didExtract) return;
    await processNextDispatch();
  } catch (e) {
    console.error("[worker] tick error", e);
  }
}

console.log("[worker] Levorato Prospect worker iniciado");
console.log("[worker] POLL_MS=", POLL_MS, "HEADLESS=", process.env.HEADLESS ?? "true");

await tick();
setInterval(() => {
  tick().catch((e) => console.error(e));
}, POLL_MS);
