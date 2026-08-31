import https from "node:https";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "assets", "img");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [slug, width, height, keywords, lock]
const ITEMS = [
  ["hero", 1400, 900, "coffee,beans", 7],
  ["cat-monorigine", 800, 800, "coffee,beans", 11],
  ["cat-miscela", 800, 800, "espresso", 1],
  ["cat-capsule", 800, 800, "coffee,machine", 2],
  ["cat-decaf", 800, 800, "coffee,cup", 3],
  ["p-etiopia", 800, 800, "coffee,beans", 21],
  ["p-brasile", 800, 800, "coffee,beans,roasted", 22],
  ["p-colombia", 800, 800, "coffee,beans,macro", 23],
  ["p-guatemala", 800, 800, "coffee,beans", 24],
  ["p-oro", 800, 800, "espresso", 5],
  ["p-nera", 800, 800, "coffee,cup", 6],
  ["p-kenya", 800, 800, "coffee,beans", 25],
  ["p-costarica", 800, 800, "coffee,bag", 26],
  ["p-sumatra", 800, 800, "coffee,plantation", 27],
  ["p-okinawa", 800, 800, "latte,art", 28],
  ["p-yunnan", 800, 800, "coffee,ground", 29],
  ["p-casa", 800, 800, "espresso,cup", 8],
  ["p-capsule-etiopia", 800, 800, "coffee,machine", 9],
  ["p-capsule-oro", 800, 800, "espresso,machine", 10],
  ["p-macinacaffe", 800, 800, "coffee,grinder", 12],
  ["o-etiopia", 900, 700, "coffee,farm", 31],
  ["o-brasile", 900, 700, "coffee,plantation", 32],
  ["o-colombia", 900, 700, "coffee,farm", 33],
  ["o-kenya", 900, 700, "coffee,plantation", 34],
  ["o-guatemala", 900, 700, "coffee,farm", 35],
  ["o-costarica", 900, 700, "coffee,plantation", 36],
  ["o-indonesia", 900, 700, "coffee,plantation", 37],
  ["o-giappone", 900, 700, "coffee,shop", 38],
  ["o-cina", 900, 700, "coffee,plantation", 39],
];

function download(url, file) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "CaffeNobile/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(res.headers.location, file).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      const stream = fs.createWriteStream(file);
      res.pipe(stream);
      stream.on("finish", () => { stream.close(); resolve(); });
    }).on("error", reject);
  });
}

async function fetchOne(slug, w, h, kw, lock) {
  const url = `https://loremflickr.com/${w}/${h}/${kw}?lock=${lock}`;
  const file = path.join(OUT, `${slug}.jpg`);
  if (fs.existsSync(file) && fs.statSync(file).size > 10000) return { slug, status: "skip" };
  for (let a = 0; a < 3; a++) {
    try {
      await download(url, file);
      const size = fs.statSync(file).size;
      if (size < 10000) throw new Error("too small: " + size);
      return { slug, status: "ok", kb: Math.round(size / 1024) };
    } catch (e) {
      if (a === 2) return { slug, status: "fail", err: e.message };
      await sleep(1200 * (a + 1));
    }
  }
}

let ok = 0, fail = 0;
for (const [slug, w, h, kw, lock] of ITEMS) {
  const r = await fetchOne(slug, w, h, kw, lock);
  if (r.status === "ok") { console.log(`OK ${r.slug} (${r.kb} KB)`); ok++; }
  else if (r.status === "skip") { console.log(`SKIP ${r.slug}`); ok++; }
  else { console.log(`FAIL ${r.slug}: ${r.err}`); fail++; }
  await sleep(300);
}
console.log(`\nDone: ${ok} ok, ${fail} failed`);
