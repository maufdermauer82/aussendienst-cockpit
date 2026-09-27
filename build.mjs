// Baut die fertigen Dateien für web/assets aus den npm-Paketen:
// Bibliotheken, Schriften, App-Icons und das CSS. Aufruf: npm ci && npm run build
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";

const A = "web/assets";
mkdirSync(`${A}/fonts`, { recursive: true });

cpSync("node_modules/react/umd/react.production.min.js", `${A}/react.production.min.js`);
cpSync("node_modules/react-dom/umd/react-dom.production.min.js", `${A}/react-dom.production.min.js`);
cpSync("node_modules/htm/dist/htm.umd.js", `${A}/htm.umd.js`);
const umd = "node_modules/@supabase/supabase-js/dist/umd";
for (const f of readdirSync(umd)) if (f.endsWith(".js")) cpSync(`${umd}/${f}`, `${A}/${f}`);

for (const w of [400, 500, 600, 700]) cpSync(`node_modules/@fontsource/barlow/files/barlow-latin-${w}-normal.woff2`, `${A}/fonts/barlow-${w}.woff2`);
for (const w of [600, 700]) cpSync(`node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-${w}-normal.woff2`, `${A}/fonts/barlow-semi-condensed-${w}.woff2`);

const svg = readFileSync(`${A}/icon.svg`);
for (const s of [180, 192, 512]) writeFileSync(`${A}/icon-${s}.png`, new Resvg(svg, { fitTo: { mode: "width", value: s } }).render().asPng());

execSync(`npx tailwindcss -c tailwind.config.js -i src/styles.css -o ${A}/app.css --minify`, { stdio: "inherit" });
console.log("Build fertig: web/assets ist vollständig.");
