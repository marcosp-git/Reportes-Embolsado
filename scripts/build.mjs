import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(root, "public");
const distDir = join(root, "dist");
const serverDir = join(distDir, "server");

const files = [
  ["index.html", "text/html; charset=utf-8"],
  ["styles.css", "text/css; charset=utf-8"],
  ["data.js", "application/javascript; charset=utf-8"],
  ["caba-zones.js", "application/javascript; charset=utf-8"],
  ["umap-data.js", "application/javascript; charset=utf-8"],
  ["app.js", "application/javascript; charset=utf-8"]
];

await rm(distDir, { recursive: true, force: true });
await mkdir(serverDir, { recursive: true });
await mkdir(join(distDir, ".openai"), { recursive: true });

const assets = {};
for (const [file, contentType] of files) {
  const body = await readFile(join(publicDir, file), "utf8");
  assets[`/${file}`] = { contentType, body };
}
assets["/"] = assets["/index.html"];

const worker = `const assets = ${JSON.stringify(assets)};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const asset = assets[pathname];

    if (asset) {
      return new Response(asset.body, {
        headers: {
          "content-type": asset.contentType,
          "cache-control": "no-store, max-age=0"
        }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};
`;

await writeFile(join(serverDir, "index.js"), worker);
await writeFile(
  join(distDir, ".openai", "hosting.json"),
  await readFile(join(root, ".openai", "hosting.json"), "utf8")
);
