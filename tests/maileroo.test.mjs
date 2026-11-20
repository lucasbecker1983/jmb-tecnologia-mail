import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(root, "tests", ".tmp-maileroo-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

async function bundle(entry, name, mocks = {}) {
	const outfile = join(outDir, `${name}.mjs`);
	await build({
		stdin: { contents: entry, resolveDir: root, loader: "ts" },
		outfile,
		bundle: true,
		platform: "node",
		format: "esm",
		packages: "external",
		alias: { "@": join(root, "src") },
		plugins: [{
			name: "mock-deps",
			setup(builder) {
				const names = Object.keys(mocks).map((value) => value.replace(/[/.-]/g, "\\$&")).join("|");
				if (!names) return;
				builder.onResolve({ filter: new RegExp(`^(${names})$`) }, (args) => ({ path: args.path, namespace: "mock" }));
				builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({ contents: mocks[args.path], loader: "js" }));
			},
		}],
		logLevel: "silent",
	});
	return import(pathToFileURL(outfile).href);
}

const maileroo = await bundle("export * from './src/lib/email/maileroo';", "maileroo");
const { ProviderHttpError, isFallbackStatus, getMailerooKey, mailerooPayload, sendWithMailerooFallback } = maileroo;

const realFetch = globalThis.fetch;
let fetchCalls;
let fetchReply;
beforeEach(() => {
	fetchCalls = [];
	fetchReply = () => new Response(JSON.stringify({ success: true, data: { reference_id: "abc" } }), { status: 200 });
	globalThis.fetch = async (url, init) => { fetchCalls.push({ url: String(url), init }); return fetchReply(String(url), init); };
});
after(() => { globalThis.fetch = realFetch; });

const message = { from: '"JMB" <contato@jmbtecnologia.com.br>', to: ["a@x.com"], subject: "Oi", html: "<p>Oi</p>", text: "Oi", headers: { "Message-ID": "<id@jmbtecnologia.com.br>" } };
const env = { MAILEROO_API_KEY: "default-key", MAILEROO_SENDING_KEYS: JSON.stringify({ "jmbtecnologia.com.br": "jmb-key" }) };

test("only provider outages, rate limits and rejected keys trigger the fallback", () => {
	for (const status of [429, 401, 403, 500, 502, 503]) assert.equal(isFallbackStatus(status), true, String(status));
	for (const status of [400, 404, 409, 413, 422]) assert.equal(isFallbackStatus(status), false, String(status));
});

test("the sending key is chosen per domain, then the account default", () => {
	assert.equal(getMailerooKey(env, "contato@jmbtecnologia.com.br"), "jmb-key");
	assert.equal(getMailerooKey(env, '"N" <x@nexocartoes.com.br>'), "default-key");
	assert.equal(getMailerooKey({ MAILEROO_SENDING_KEYS: "{bad" }, "a@b.com"), null);
	assert.equal(getMailerooKey({}, "a@b.com"), null);
});

test("the payload uses Maileroo's address objects, drops Message-ID and trims long references", () => {
	const refs = Array.from({ length: 40 }, (_, index) => `<ref-${index}-${"x".repeat(20)}@example.com>`).join(" ");
	const payload = mailerooPayload({
		...message,
		cc: ["Ana <ana@x.com>"],
		headers: { "Message-ID": "<drop@x>", "In-Reply-To": "<ref-39@example.com>", References: refs },
		attachments: [
			{ filename: "a.txt", type: "text/plain", content: new TextEncoder().encode("hi").buffer, disposition: "attachment" },
			{ filename: "logo.png", type: "image/png", content: new Uint8Array([1, 2]).buffer, disposition: "inline", contentId: "logo" },
		],
	});
	assert.deepEqual(payload.from, { address: "contato@jmbtecnologia.com.br", display_name: "JMB" });
	assert.deepEqual(payload.to, [{ address: "a@x.com" }]);
	assert.deepEqual(payload.cc, [{ address: "ana@x.com", display_name: "Ana" }]);
	assert.equal(payload.plain, "Oi");
	assert.equal("Message-ID" in payload.headers, false);
	assert.ok(payload.headers.References.length <= 768);
	assert.ok(payload.headers.References.startsWith("<ref-0-"), "keeps the thread root");
	assert.ok(payload.headers.References.endsWith("<ref-39-" + "x".repeat(20) + "@example.com>"), "keeps the newest reference");
	assert.deepEqual(payload.attachments[0], { file_name: "a.txt", content_type: "text/plain", content: "aGk=", inline: false });
	assert.equal(payload.attachments[1].inline, true);
});

test("a working Resend never touches Maileroo", async () => {
	const result = await sendWithMailerooFallback(env, message, async () => ({ messageId: "<resend@x>" }));
	assert.equal(result.messageId, "<resend@x>");
	assert.equal(fetchCalls.length, 0);
});

test("a Resend quota error sends through Maileroo with the domain key", async () => {
	const result = await sendWithMailerooFallback(env, message, async () => { throw new ProviderHttpError("Resend: daily quota", 429); });
	assert.equal(fetchCalls.length, 1);
	assert.equal(fetchCalls[0].url, "https://smtp.maileroo.com/api/v2/emails");
	assert.equal(fetchCalls[0].init.headers["X-Api-Key"], "jmb-key");
	assert.equal(result.messageId, "<id@jmbtecnologia.com.br>");
});

test("a message Resend rejects as invalid is not retried elsewhere", async () => {
	await assert.rejects(sendWithMailerooFallback(env, message, async () => { throw new ProviderHttpError("Resend: invalid to", 422); }), /invalid to/);
	assert.equal(fetchCalls.length, 0);
});

test("a network error retries Resend once before falling back", async () => {
	let attempts = 0;
	const ok = await sendWithMailerooFallback(env, message, async () => { attempts++; if (attempts === 1) throw new TypeError("fetch failed"); return { messageId: "<second@x>" }; });
	assert.equal(ok.messageId, "<second@x>");
	assert.equal(attempts, 2);
	assert.equal(fetchCalls.length, 0);
	attempts = 0;
	await sendWithMailerooFallback(env, message, async () => { attempts++; throw new TypeError("fetch failed"); });
	assert.equal(attempts, 2);
	assert.equal(fetchCalls.length, 1, "falls back after the second network failure");
});

test("without a Maileroo key the Resend error is kept; when both fail both reasons are reported", async () => {
	await assert.rejects(sendWithMailerooFallback({}, message, async () => { throw new ProviderHttpError("Resend: down", 503); }), /Resend: down$/);
	fetchReply = () => new Response(JSON.stringify({ success: false, message: "domain not verified" }), { status: 403 });
	await assert.rejects(sendWithMailerooFallback(env, message, async () => { throw new ProviderHttpError("Resend: down", 503); }), /Resend: down; Maileroo: domain not verified/);
});

const routeMocks = {
	"next/server": "export const NextResponse={json:(body,init)=>({status:init?.status??200,body})};",
	"@/lib/cloudflare": "export const getEnv=()=>globalThis.__env;",
	"@/lib/aws/ses-notification": "export const safeEqual=(a,b)=>a===b;",
	"@/lib/email/provider-intake": "export const MAX_PROVIDER_MESSAGE_BYTES=25*1024*1024;export async function intakeProviderMail(env,input){globalThis.__intake.push(input);globalThis.__order.push('intake');return {delivered:input.recipients.length,dropped:null}}",
};
const route = await bundle("export { POST } from './src/app/api/inbound/maileroo/route';", "route", routeMocks);
const inbound = (token, body) => new Request(`https://webmail.example/api/inbound/maileroo${token === null ? "" : `?token=${token}`}`, { method: "POST", body: JSON.stringify(body) });
const payload = {
	envelope_sender: "sender@gmail.com",
	recipients: ["contato@nexocartoes.com.br"],
	body: { raw_mime: { url: "https://files.maileroo-storage.example/raw.eml", size: 120 } },
	validation_url: "https://inbound.maileroo.com/validate/1",
	deletion_url: "https://inbound.maileroo.com/delete/1",
};

beforeEach(() => {
	globalThis.__env = { MAILEROO_WEBHOOK_TOKEN: "s3cret" };
	globalThis.__intake = [];
	globalThis.__order = [];
	fetchReply = (url) => {
		globalThis.__order.push(url.includes("validate") ? "validate" : url.includes("delete") ? "delete" : "download");
		return new Response(url.includes("raw.eml") ? "Subject: hi\r\n\r\nbody" : JSON.stringify({ success: true }), { status: 200 });
	};
});

test("the inbound webhook needs the configured token", async () => {
	globalThis.__env = {};
	assert.equal((await route.POST(inbound("s3cret", payload))).status, 503);
	globalThis.__env = { MAILEROO_WEBHOOK_TOKEN: "s3cret" };
	assert.equal((await route.POST(inbound("wrong", payload))).status, 401);
	assert.equal((await route.POST(inbound(null, payload))).status, 401);
	assert.equal(globalThis.__intake.length, 0);
});

test("a valid delivery is downloaded, taken in, then validated and deleted at Maileroo", async () => {
	const response = await route.POST(inbound("s3cret", payload));
	assert.equal(response.status, 200);
	assert.deepEqual(response.body, { delivered: 1, dropped: null });
	assert.equal(globalThis.__intake[0].from, "sender@gmail.com");
	assert.deepEqual(globalThis.__intake[0].recipients, ["contato@nexocartoes.com.br"]);
	assert.deepEqual(globalThis.__order, ["download", "intake", "validate", "delete"]);
});

test("oversized, non-https or non-Maileroo links are not followed", async () => {
	const big = await route.POST(inbound("s3cret", { ...payload, body: { raw_mime: { url: payload.body.raw_mime.url, size: 30 * 1024 * 1024 } } }));
	assert.equal(big.status, 200);
	assert.match(big.body.dropped, /25 MiB/);
	const plain = await route.POST(inbound("s3cret", { ...payload, body: { raw_mime: { url: "http://evil.example/raw.eml", size: 1 } } }));
	assert.equal(plain.body.delivered, 0);
	globalThis.__order = [];
	await route.POST(inbound("s3cret", { ...payload, validation_url: "https://evil.example/validate", deletion_url: "https://evil.example/delete" }));
	assert.deepEqual(globalThis.__order, ["download", "intake"]);
});

test("a failed download asks Maileroo to retry", async () => {
	fetchReply = () => new Response("nope", { status: 500 });
	assert.equal((await route.POST(inbound("s3cret", payload))).status, 502);
	assert.equal(globalThis.__intake.length, 0);
});
