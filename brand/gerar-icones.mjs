// Gera os ícones do app em public/ a partir de brand/icone.svg. Uso: node brand/gerar-icones.mjs (Node 22+, após npm install).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "public");
const rounded = readFileSync(join(here, "icone.svg"), "utf8");
// Maskable and Apple icons need a full-bleed square: the platform applies its own mask.
const fullBleed = rounded.replaceAll('rx="112"', 'rx="0"');

const targets = [
	{ file: "icon-48.png", size: 48, svg: rounded },
	{ file: "icon-96.png", size: 96, svg: rounded },
	{ file: "icon-192.png", size: 192, svg: rounded },
	{ file: "icon-512.png", size: 512, svg: rounded },
	{ file: "icon-maskable-192.png", size: 192, svg: fullBleed },
	{ file: "icon-maskable-512.png", size: 512, svg: fullBleed },
	{ file: "apple-touch-icon.png", size: 180, svg: fullBleed },
];
const icoSizes = [16, 32, 48];

const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	async function render(svg, size) {
		await page.setViewportSize({ width: size, height: size });
		const sized = svg.replace('width="512" height="512"', `width="${size}" height="${size}"`);
		await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${sized}</body></html>`);
		return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
	}
	for (const target of targets) {
		writeFileSync(join(pub, target.file), await render(target.svg, target.size));
		console.log(`public/${target.file}`);
	}
	const pngs = [];
	for (const size of icoSizes) pngs.push({ size, data: await render(rounded, size) });
	writeFileSync(join(pub, "favicon.ico"), buildIco(pngs));
	console.log("public/favicon.ico");
} finally {
	await browser.close();
}

// ICO container with embedded PNG images (supported by every current browser).
function buildIco(images) {
	const header = Buffer.alloc(6 + images.length * 16);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);
	let offset = header.length;
	images.forEach(({ size, data }, index) => {
		const entry = 6 + index * 16;
		header.writeUInt8(size >= 256 ? 0 : size, entry);
		header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
		header.writeUInt8(0, entry + 2);
		header.writeUInt8(0, entry + 3);
		header.writeUInt16LE(1, entry + 4);
		header.writeUInt16LE(32, entry + 6);
		header.writeUInt32LE(data.length, entry + 8);
		header.writeUInt32LE(offset, entry + 12);
		offset += data.length;
	});
	return Buffer.concat([header, ...images.map((image) => image.data)]);
}
