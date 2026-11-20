// Gera manual/MANUAL.pdf a partir de manual/MANUAL.md. Uso: node manual/gerar-pdf.mjs (Node 22+, após npm install).
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const markdown = readFileSync(join(here, "MANUAL.md"), "utf8");
const body = micromark(markdown, { extensions: [gfm()], htmlExtensions: [gfmHtml()] });

const css = `
@page { size: A4; margin: 18mm 16mm 20mm; }
* { box-sizing: border-box; }
body { font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif; font-size: 10.5pt; line-height: 1.55; color: #1f2933; }
h1 { font-size: 26pt; color: #0b3d91; margin: 0 0 6pt; line-height: 1.2; }
h1 + p { font-size: 13pt; color: #3e4c59; margin-top: 0; }
h2 { font-size: 16pt; color: #0b3d91; border-bottom: 2px solid #d9e2ec; padding-bottom: 4pt; margin: 22pt 0 8pt; break-after: avoid; }
h3 { font-size: 12.5pt; color: #102a43; margin: 16pt 0 6pt; break-after: avoid; }
p, li { orphans: 3; widows: 3; }
ul, ol { padding-left: 18pt; }
li { margin: 2pt 0; }
a { color: #0b5cad; text-decoration: none; word-break: break-word; }
code { font-family: "DejaVu Sans Mono", "Liberation Mono", monospace; font-size: 9pt; background: #f0f4f8; border-radius: 3px; padding: 1px 4px; }
pre { background: #102a43; color: #f0f4f8; border-radius: 6px; padding: 9pt 11pt; white-space: pre-wrap; word-break: break-word; break-inside: avoid; }
pre code { background: none; color: inherit; padding: 0; font-size: 8.8pt; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0 12pt; font-size: 9.5pt; break-inside: auto; }
th, td { border: 1px solid #d9e2ec; padding: 5pt 7pt; text-align: left; vertical-align: top; }
th { background: #e6eef7; color: #102a43; }
tr { break-inside: avoid; }
blockquote { margin: 10pt 0; padding: 7pt 11pt; background: #fff8e6; border-left: 4px solid #f0b429; border-radius: 4px; color: #3e2c00; break-inside: avoid; }
blockquote p { margin: 3pt 0; }
hr { border: none; border-top: 1px solid #d9e2ec; margin: 16pt 0; }
`;

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Manual do JMB Tecnologia Mail</title><style>${css}</style></head><body>${body}</body></html>`;
const htmlPath = join(tmpdir(), `mailflare-manual-${process.pid}.html`);
writeFileSync(htmlPath, html);

const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
	await page.pdf({
		path: join(here, "MANUAL.pdf"),
		format: "A4",
		printBackground: true,
		displayHeaderFooter: true,
		headerTemplate: "<span></span>",
		footerTemplate: `<div style="width:100%;font-size:8px;color:#829ab1;padding:0 16mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>JMB Tecnologia Mail · Manual</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
		margin: { top: "18mm", bottom: "20mm", left: "16mm", right: "16mm" },
	});
} finally {
	await browser.close();
	rmSync(htmlPath, { force: true });
}
console.log("Gerado: manual/MANUAL.pdf");
