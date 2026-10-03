// Salin web/control → android/www (webDir Capacitor). Sumber UI tetap satu: web/control.
import { cpSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "web", "control");
const dst = join(here, "..", "www");
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true, filter: (p) => !p.endsWith("sw.js") });
console.log("web/control →", dst);
