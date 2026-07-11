import { createServer } from "node:http";
import { createHmac, createPrivateKey, randomBytes, scryptSync, sign, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const host = process.env.ADMIN_API_HOST || "127.0.0.1";
const port = Number(process.env.ADMIN_API_PORT || 8787);
const appId = required("GITHUB_APP_ID");
const installationId = required("GITHUB_APP_INSTALLATION_ID");
const privateKey = createPrivateKey(readFileSync(required("GITHUB_APP_PRIVATE_KEY_PATH")));
const repository = required("GITHUB_REPOSITORY");
const [owner, repo] = repository.split("/");
const passwordSalt = required("ADMIN_PASSWORD_SALT");
const passwordHash = required("ADMIN_PASSWORD_HASH");
const sessionSecret = required("ADMIN_SESSION_SECRET");
const publicOrigin = process.env.ADMIN_PUBLIC_ORIGIN || "https://www.zuelhhb.top";
const sessionMaxAge = Number(process.env.ADMIN_SESSION_MAX_AGE || 43200);
const loginAttempts = new Map();
let installationToken = "";
let installationTokenExpiresAt = 0;
let deploymentTimer = null;
const deploymentRuntimeDir = process.env.DEPLOY_RUNTIME_DIR || "/run/mrbin-blog-deploy";

if (!owner || !repo) throw new Error("GITHUB_REPOSITORY must use owner/repo format");

function required(name) {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required environment variable: ${name}`);
	return value;
}

function json(response, status, body, headers = {}) {
	const payload = JSON.stringify(body);
	response.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(payload),
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
		...headers,
	});
	response.end(payload);
}

async function readJson(request) {
	let body = "";
	for await (const chunk of request) {
		body += chunk;
		if (body.length > 2_000_000) throw new Error("Request body too large");
	}
	return body ? JSON.parse(body) : {};
}

function encode(value) {
	return Buffer.from(value).toString("base64url");
}

function sessionCookie() {
	const payload = encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + sessionMaxAge, nonce: randomBytes(12).toString("hex") }));
	const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
	return `blog_admin_session=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionMaxAge}`;
}

function hasSession(request) {
	const match = (request.headers.cookie || "").match(/(?:^|;\s*)blog_admin_session=([^;]+)/);
	if (!match) return false;
	const [payload, signature] = match[1].split(".");
	if (!payload || !signature) return false;
	const expected = createHmac("sha256", sessionSecret).update(payload).digest();
	let actual;
	try { actual = Buffer.from(signature, "base64url"); } catch { return false; }
	if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
	try { return JSON.parse(Buffer.from(payload, "base64url")).exp > Date.now() / 1000; } catch { return false; }
}

function passwordMatches(value) {
	const actual = scryptSync(value, passwordSalt, 64);
	const expected = Buffer.from(passwordHash, "hex");
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sameOrigin(request) {
	const origin = request.headers.origin;
	return !origin || origin === publicOrigin || origin === publicOrigin.replace("www.", "");
}

function appJwt() {
	const now = Math.floor(Date.now() / 1000);
	const header = encode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const payload = encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
	const data = `${header}.${payload}`;
	return `${data}.${sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`;
}

async function getInstallationToken() {
	if (installationToken && Date.now() < installationTokenExpiresAt) return installationToken;
	const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
		method: "POST",
		headers: githubHeaders(`Bearer ${appJwt()}`),
	});
	if (!response.ok) throw new Error(`GitHub token request failed: ${response.status}`);
	const data = await response.json();
	installationToken = data.token;
	installationTokenExpiresAt = new Date(data.expires_at).getTime() - 60_000;
	return installationToken;
}

function githubHeaders(authorization) {
	return {
		Authorization: authorization,
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "MrBin-Blog-Admin",
	};
}

function scheduleDeployment() {
	if (deploymentTimer) clearTimeout(deploymentTimer);
	deploymentTimer = setTimeout(() => {
		try {
			mkdirSync(deploymentRuntimeDir, { recursive: true, mode: 0o750 });
			writeFileSync(
				`${deploymentRuntimeDir}/requested`,
				JSON.stringify({ requestedAt: new Date().toISOString(), repository }),
				{ mode: 0o640 },
			);
		} catch (error) {
			console.error("Unable to queue deployment:", error);
		}
		deploymentTimer = null;
	}, 15_000);
}

function deploymentStatus(response) {
	try {
		const status = JSON.parse(readFileSync(`${deploymentRuntimeDir}/status.json`, "utf8"));
		return json(response, 200, status);
	} catch {
		return json(response, 200, { state: "idle", message: "No deployment has run yet." });
	}
}

function allowedGithubPath(path) {
	if (typeof path !== "string" || path.startsWith("http") || path.includes("..")) return false;
	const clean = path.replace(/^\//, "").split("?")[0].replace(/\/$/, "");
	const root = `repos/${owner}/${repo}`;
	return clean === root || clean.startsWith(`${root}/`);
}

async function proxyGithub(response, request) {
	const input = request.method === "GET"
		? { path: new URL(request.url, publicOrigin).searchParams.get("path"), method: "GET" }
		: await readJson(request);
	if (!input.path) {
		return json(response, 200, { ok: true, status: "proxy-ready", serverAuth: true, hasAppId: true, appId });
	}
	if (!allowedGithubPath(input.path)) return json(response, 403, { error: "GitHub path is not allowed" });
	const method = String(input.method || request.method).toUpperCase();
	if (!["GET", "PUT", "DELETE"].includes(method)) return json(response, 405, { error: "GitHub method is not allowed" });
	const token = await getInstallationToken();
	const url = `https://api.github.com/${input.path.replace(/^\//, "")}`;
	const options = { method, headers: githubHeaders(`Bearer ${token}`) };
	if (method !== "GET") {
		options.headers["Content-Type"] = "application/json";
		options.body = JSON.stringify(input.body ?? {});
	}
	const upstream = await fetch(url, options);
	const body = Buffer.from(await upstream.arrayBuffer());
	if (upstream.ok && method !== "GET") scheduleDeployment();
	response.writeHead(upstream.status, {
		"Content-Type": upstream.headers.get("content-type") || "application/json",
		"Content-Length": body.length,
		"Cache-Control": "no-store",
	});
	response.end(body);
}

const server = createServer(async (request, response) => {
	try {
		const path = new URL(request.url, publicOrigin).pathname;
		if (!sameOrigin(request)) return json(response, 403, { error: "Invalid origin" });
		if (path === "/api/admin/login" && request.method === "POST") {
			const address = request.socket.remoteAddress || "unknown";
			const state = loginAttempts.get(address) || { count: 0, blockedUntil: 0 };
			if (state.blockedUntil > Date.now()) return json(response, 429, { error: "Too many login attempts" });
			const { password = "" } = await readJson(request);
			if (!passwordMatches(String(password))) {
				state.count += 1;
				if (state.count >= 5) { state.count = 0; state.blockedUntil = Date.now() + 300_000; }
				loginAttempts.set(address, state);
				return json(response, 401, { error: "Invalid credentials" });
			}
			loginAttempts.delete(address);
			return json(response, 200, { ok: true }, { "Set-Cookie": sessionCookie() });
		}
		if (path === "/api/admin/logout" && request.method === "POST") {
			return json(response, 200, { ok: true }, { "Set-Cookie": "blog_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
		}
		if (path === "/api/admin/session" && request.method === "GET") {
			return hasSession(request) ? json(response, 200, { ok: true }) : json(response, 401, { ok: false });
		}
		if (path === "/api/admin/deploy-status" && request.method === "GET") {
			return hasSession(request) ? deploymentStatus(response) : json(response, 401, { error: "Authentication required" });
		}
		if (path === "/api/github") {
			if (!hasSession(request)) return json(response, 401, { error: "Authentication required" });
			return await proxyGithub(response, request);
		}
		return json(response, 404, { error: "Not found" });
	} catch (error) {
		console.error(error);
		return json(response, 500, { error: "Internal server error" });
	}
});

server.listen(port, host, () => console.log(`Admin API listening on http://${host}:${port}`));
