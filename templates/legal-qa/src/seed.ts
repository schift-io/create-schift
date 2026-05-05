/**
 * Seed your LEGAL_BUCKET_ID with the public legal corpus shipped with this template.
 *
 * Usage:
 *   npm run seed -- --bucket-id <id>
 *
 * The seed data is a small sample (100+ laws + 30+ cases) for demo purposes.
 * Replace it with your firm's internal documents for production.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface LegalItem {
  id: string;
  kind: "law" | "case";
  title: string;
  text: string;
  cite?: string;
  source_url?: string;
  category?: string;
  tags?: string[];
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bucketId = args["bucket-id"] ?? process.env.LEGAL_BUCKET_ID;
  const apiUrl = args["api-url"] ?? process.env.SCHIFT_API_URL ?? "https://api.schift.io";
  const apiKey = process.env.SCHIFT_API_KEY;

  if (!apiKey) throw new Error("SCHIFT_API_KEY is required.");
  if (!bucketId) throw new Error("--bucket-id <id> or LEGAL_BUCKET_ID is required.");

  const seedPath = path.resolve(__dirname, "..", "data", "legal_seed.json");
  if (!fs.existsSync(seedPath)) {
    throw new Error(`seed file not found: ${seedPath}`);
  }
  const payload = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
  const items: LegalItem[] = payload.items ?? [];
  console.log(`Seeding ${items.length} items into bucket ${bucketId} (api: ${apiUrl})`);

  let ok = 0;
  let fail = 0;
  for (const [idx, item] of items.entries()) {
    const filename = `${item.id.replace(/[^a-zA-Z0-9가-힣_-]/g, "_")}.txt`;
    const body = [
      `[${item.kind.toUpperCase()}] ${item.title}`,
      item.cite ? `출처: ${item.cite}` : "",
      item.category ? `분야: ${item.category}` : "",
      (item.tags ?? []).length ? `태그: ${(item.tags ?? []).join(", ")}` : "",
      item.source_url ? `URL: ${item.source_url}` : "",
      "",
      item.text,
    ]
      .filter(Boolean)
      .join("\n");

    const form = new FormData();
    form.append("files", new Blob([body], { type: "text/plain" }), filename);

    try {
      const resp = await fetch(`${apiUrl}/v1/buckets/${bucketId}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (resp.ok) {
        ok++;
      } else {
        fail++;
        console.warn(`  [${idx + 1}/${items.length}] ${item.id}: ${resp.status}`);
      }
    } catch (err) {
      fail++;
      console.warn(`  [${idx + 1}/${items.length}] ${item.id}: ${(err as Error).message}`);
    }
    if ((idx + 1) % 20 === 0) console.log(`  ... ${idx + 1}/${items.length} (ok=${ok} fail=${fail})`);
  }
  console.log(`\nDone. ok=${ok} fail=${fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
