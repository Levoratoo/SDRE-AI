import { generateKeyPairSync } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import ChromeExtension from "crx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const extDir = path.join(root, "extension");
const publicDir = path.join(root, "public");
const downloadsDir = path.join(publicDir, "downloads");
const keyPath = path.join(root, "extension.pem");
const outCrx = path.join(publicDir, "levorato-prospect.crx");
const outZip = path.join(publicDir, "levorato-prospect-extension.zip");
const outDownloadsZip = path.join(downloadsDir, "levorato-prospect-extension.zip");

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

if (!fs.existsSync(keyPath)) {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  fs.writeFileSync(keyPath, privateKey);
  console.log("Gerado extension.pem (não commitar)");
}

const privateKey = fs.readFileSync(keyPath);
const crx = new ChromeExtension({
  codebase: "/levorato-prospect.crx",
  privateKey,
  version: 3,
});

await crx.load(extDir);
const crxBuffer = await crx.pack();
fs.writeFileSync(outCrx, crxBuffer);
console.log("CRX:", outCrx, `(${crxBuffer.length} bytes)`);

const zipStaging = path.join(root, ".ext-zip-staging");
fs.rmSync(zipStaging, { recursive: true, force: true });
fs.cpSync(extDir, zipStaging, { recursive: true });
if (fs.existsSync(outZip)) fs.unlinkSync(outZip);
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${zipStaging}\\*' -DestinationPath '${outZip}' -Force"`,
  { stdio: "inherit" },
);
fs.rmSync(zipStaging, { recursive: true, force: true });
console.log("ZIP:", outZip, `(${fs.statSync(outZip).size} bytes)`);

fs.copyFileSync(outZip, outDownloadsZip);
console.log("Downloads:", outDownloadsZip, `(${fs.statSync(outDownloadsZip).size} bytes)`);
