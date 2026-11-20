import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(root, "tests", ".tmp-domain-external-dns-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

function mockPlugin(mocks) {
	return {
		name: "mock-deps",
		setup(builder) {
			const names = Object.keys(mocks).map((name) => name.replace(/[/.-]/g, "\\$&")).join("|");
			builder.onResolve({ filter: new RegExp(`^(${names})$`) }, (args) => ({ path: args.path, namespace: "mock" }));
			builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({ contents: mocks[args.path], loader: "js" }));
		},
	};
}

async function bundle(entry, name, mocks) {
	const outfile = join(outDir, `${name}.mjs`);
	await build({
		stdin: { contents: entry, resolveDir: root, loader: "ts" },
		outfile,
		bundle: true,
		platform: "node",
		format: "esm",
		packages: "external",
		alias: { "@": join(root, "src") },
		plugins: [mockPlugin(mocks)],
		logLevel: "silent",
	});
	return import(pathToFileURL(outfile).href);
}

const hostMocks = {
	"@/lib/cloudflare-api": "export async function findZoneByHostname(){if(globalThis.__zoneError)throw new Error(globalThis.__zoneError);return globalThis.__zone??null}",
	"@/lib/dns-query": "export async function queryDns(name,type){globalThis.__queries.push(name+' '+type);if(globalThis.__nsError)throw new Error('doh down');return globalThis.__ns[name]??[]}",
	"@/lib/runtime": "export const hasCloudflareCredentials=(env)=>!!env.CF_TOKEN;",
	"@/lib/domains/preflight": "export const manualDomainPreflight=(h)=>({hostname:h,zone:{id:'manual',name:h}});",
	"@/lib/domains/utils": "export const normalizeHostname=(h)=>h.toLowerCase().trim().replace(/\\.$/,'');",
};
const { checkDomainHosting, detectDnsHost } = await bundle("export { checkDomainHosting, detectDnsHost } from './src/lib/domains/dns-host';", "dns-host", hostMocks);
const env = { CF_TOKEN: "token" };

beforeEach(() => {
	globalThis.__zone = null;
	globalThis.__zoneError = null;
	globalThis.__ns = {};
	globalThis.__nsError = false;
	globalThis.__queries = [];
});

test("a zone this Cloudflare account can see is managed as before", async () => {
	globalThis.__zone = { id: "z1", name: "jmbtecnologia.com.br" };
	const result = await checkDomainHosting(env, "JMBtecnologia.com.br");
	assert.deepEqual(result, { hostname: "jmbtecnologia.com.br", zone: { id: "z1", name: "jmbtecnologia.com.br" }, external: false });
	assert.deepEqual(globalThis.__queries, [], "no NS lookup when the zone exists");
});

test("no zone and Registro.br nameservers make the domain external", async () => {
	globalThis.__ns = { "nexocartoes.com.br": ["b.sec.dns.br.", "a.sec.dns.br."] };
	const result = await checkDomainHosting(env, "nexocartoes.com.br");
	assert.equal(result.external, true);
	assert.deepEqual(result.zone, { id: "manual", name: "nexocartoes.com.br" });
	assert.deepEqual(result.dnsHost, { provider: "Registro.br", nameservers: ["a.sec.dns.br", "b.sec.dns.br"], cloudflare: false });
});

test("Cloudflare nameservers without a visible zone ask to fix the token instead of going external", async () => {
	globalThis.__ns = { "example.com": ["ada.ns.cloudflare.com.", "bob.ns.cloudflare.com."] };
	await assert.rejects(checkDomainHosting(env, "example.com"), /CF_TOKEN/);
});

test("a Cloudflare API error is reported, never turned into an external domain", async () => {
	globalThis.__zoneError = "Cloudflare API 401";
	await assert.rejects(checkDomainHosting(env, "example.com"), /401/);
	assert.deepEqual(globalThis.__queries, []);
});

test("a failed NS lookup still lets the domain be added as external with an unknown provider", async () => {
	globalThis.__nsError = true;
	const result = await checkDomainHosting(env, "example.com.br");
	assert.equal(result.external, true);
	assert.deepEqual(result.dnsHost, { provider: null, nameservers: [], cloudflare: false });
});

test("NS lookup walks up from a subdomain to the delegated domain", async () => {
	globalThis.__ns = { "example.com.br": ["ns1.umbler.com."] };
	const host = await detectDnsHost("mail.example.com.br");
	assert.equal(host.provider, "Umbler");
	assert.deepEqual(globalThis.__queries, ["mail.example.com.br NS", "example.com.br NS"]);
});

test("skipping DNS or running without Cloudflare credentials never calls Cloudflare", async () => {
	globalThis.__zoneError = "should not be called";
	assert.deepEqual(await checkDomainHosting(env, "example.com", { skipDns: true }), { hostname: "example.com", zone: { id: "manual", name: "example.com" }, external: false });
	assert.equal((await checkDomainHosting({}, "example.com")).external, false);
});

const serviceMocks = {
	"drizzle-orm": "export const eq=(c,v)=>({eq:[c,v]});export const and=(...a)=>({and:a});export const ne=(c,v)=>({ne:[c,v]});export const inArray=(c,v)=>({inArray:[c,v]});",
	"@/db/schema": "export const domains={};export const mailboxes={};",
	"@/db": "const rows={from(){return rows},where(){return rows},limit(){return Promise.resolve([])}};export function getDb(){return {select(){return rows},insert(){return {values(v){globalThis.__inserted=v;throw new Error('stop')}}}}}",
	"@/lib/mailboxes/domain-addresses": "export async function ensureMailboxDomainRouting(){}",
	"@/lib/ids": "export const newId=(p)=>p",
	"@/lib/cloudflare-api": "export const disableEmailRouting=async()=>{},getEmailRoutingDns=async()=>{},getEmailRoutingSettings=async()=>{},getSendingSubdomainDns=async()=>{},deleteSendingSubdomain=async()=>{},listSendingSubdomains=async()=>{};",
	"@/lib/domains/cloudflare-cleanup": "export async function deleteEmailRoutingRulesForDomain(){}",
	"@/lib/domains/provision": "export const isManualZone=(id)=>id==='manual';export async function provisionDomainOnCloudflare(env,hostname,options){globalThis.__provisionOptions=options;return {hostname,zone:{id:'manual',name:hostname},routingEnabled:false,sendingEnabled:false,sendingRequested:false,routingStatus:null,sendingSubdomainTag:null}}",
	"@/lib/domains/manual-dns": "export const getManualDomainDns=()=>{}",
	"@/lib/domains/rollback": "export async function rollbackDomainProvisioning(){}",
	"@/lib/domains/sending-status": "export const findSendingSubdomain=()=>null",
	"@/lib/domains/dns-host": "export async function checkDomainHosting(){return globalThis.__hosting}",
	"@/lib/runtime": "export const hasCloudflareCredentials=(env)=>!!env.CF_TOKEN;export const isNodeRuntime=()=>false;",
};
const { addDomainForUser } = await bundle("export { addDomainForUser } from './src/lib/domains/service';", "service", serviceMocks);

test("an external domain is stored active on a manual zone with Resend, without the skipped-DNS warning", async () => {
	globalThis.__hosting = { hostname: "nexocartoes.com.br", zone: { id: "manual", name: "nexocartoes.com.br" }, external: true };
	await assert.rejects(addDomainForUser(env, "u1", "nexocartoes.com.br", { enableRouting: true, receivingProvider: "cloudflare", sendingProvider: "cloudflare" }), /stop/);
	assert.equal(globalThis.__provisionOptions.skipDns, true, "Cloudflare is not touched");
	assert.equal(globalThis.__provisionOptions.enableSending, false);
	assert.equal(globalThis.__provisionOptions.enableRouting, false);
	assert.equal(globalThis.__inserted.zoneId, "manual");
	assert.equal(globalThis.__inserted.status, "active", "inbound routing only accepts active domains");
	assert.equal(globalThis.__inserted.receivingProvider, "resend");
	assert.equal(globalThis.__inserted.sendingProvider, "resend");
	assert.equal(globalThis.__inserted.dnsSkipped, false);
});

test("the explicit skip switch keeps its old meaning", async () => {
	globalThis.__hosting = { external: true };
	await assert.rejects(addDomainForUser(env, "u1", "example.com", { skipDns: true }), /stop/);
	assert.equal(globalThis.__inserted.status, "pending");
	assert.equal(globalThis.__inserted.receivingProvider, "none");
	assert.equal(globalThis.__inserted.sendingProvider, "none");
	assert.equal(globalThis.__inserted.dnsSkipped, true);
});

const adoptMocks = {
	"drizzle-orm": "export const eq=(c,v)=>({eq:[c,v]});export const and=(...a)=>({and:a});export const ne=(c,v)=>({ne:[c,v]});",
	"@/db/schema": "export const domains={id:'id',zoneId:'zoneId',userId:'userId'};",
	"@/db": "const q={from(){return q},where(){return q},limit(){return Promise.resolve([])}};export function getDb(){return {select(){return q},update(){return {set(v){globalThis.__updates.push(v);return {where(){return Promise.resolve()}}}}}}}",
	"@/lib/domains/provision": "export const isManualZone=(id)=>id==='manual';",
	"@/lib/domains/dns-host": "export async function checkDomainHosting(){return globalThis.__hosting}",
	"@/lib/runtime": "export const hasCloudflareCredentials=(env)=>!!env.CF_TOKEN;",
};
const { adoptCloudflareZone } = await bundle("export { adoptCloudflareZone } from './src/lib/domains/adopt-zone';", "adopt-zone", adoptMocks);

test("a skipped domain whose DNS is elsewhere becomes external with a clear message instead of 'Zone not found'", async () => {
	globalThis.__updates = [];
	globalThis.__hosting = { external: true, zone: { id: "manual", name: "infinitytea.com.br" }, dnsHost: { provider: "Umbler", nameservers: [], cloudflare: false } };
	const domain = { id: "d1", userId: "u1", hostname: "infinitytea.com.br", zoneId: "manual", dnsSkipped: true, status: "pending" };
	await assert.rejects(adoptCloudflareZone(env, domain), /está em Umbler, fora da Cloudflare/);
	assert.deepEqual(globalThis.__updates, [{ dnsSkipped: false, status: "active" }]);
});

test("a skipped domain that is on this Cloudflare account is still adopted", async () => {
	globalThis.__updates = [];
	globalThis.__hosting = { external: false, zone: { id: "z9", name: "example.com" } };
	const adopted = await adoptCloudflareZone(env, { id: "d2", userId: "u1", hostname: "example.com", zoneId: "manual", dnsSkipped: true, status: "pending" });
	assert.equal(adopted.zoneId, "z9");
	assert.deepEqual(globalThis.__updates, [{ zoneId: "z9" }]);
});
