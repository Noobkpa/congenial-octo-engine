import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

const repoRoot = process.cwd();
const exportRoot = path.resolve(repoRoot, "..", "output", "mrbin-export");
const exportJsonPath = path.join(exportRoot, "mrbin-posts.json");
const sourceUploads = path.join(exportRoot, "wp-content", "uploads");
const sourceThemeImages = path.join(
	exportRoot,
	"wp-content",
	"themes",
	"boxmoeUPimg",
	"assets",
	"images",
);
const targetPostDir = path.join(repoRoot, "src", "content", "posts", "mrbin");
const targetAssetDir = path.join(repoRoot, "public", "assets", "mrbin");
const targetUploadDir = path.join(targetAssetDir, "uploads");
const targetThemeDir = path.join(targetAssetDir, "theme");

const OLD_DOMAINS = new Set(["www.zuelhhb.top", "zuelhhb.top"]);
const gbkDecoder = new TextDecoder("gbk");

function assertInside(parent, child) {
	const relative = path.relative(parent, child);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(`Refusing to write outside ${parent}: ${child}`);
	}
}

function ensureCleanDir(dir) {
	assertInside(repoRoot, dir);
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(dir, { recursive: true });
}

function walkFiles(dir) {
	if (!fs.existsSync(dir)) return [];
	const output = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			output.push(...walkFiles(fullPath));
		} else if (entry.isFile()) {
			output.push(fullPath);
		}
	}
	return output;
}

function normalizeSlashes(value) {
	return value.replace(/\\/g, "/");
}

function decodePathname(value) {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function makeMojibakeCandidate(value) {
	return gbkDecoder.decode(Buffer.from(value, "utf8"));
}

function removeWpSizeSuffix(fileName) {
	return fileName.replace(/-\d+x\d+(?=\.[^.]+$)/, "");
}

function fileKey(value) {
	return normalizeSlashes(value).toLowerCase();
}

function buildFileIndex(baseDir) {
	const exact = new Map();
	const byBase = new Map();
	const byBaseNoSize = new Map();
	for (const filePath of walkFiles(baseDir)) {
		const relative = normalizeSlashes(path.relative(baseDir, filePath));
		const base = path.basename(relative);
		exact.set(fileKey(relative), filePath);
		if (!byBase.has(fileKey(base))) byBase.set(fileKey(base), filePath);
		const noSize = removeWpSizeSuffix(base);
		if (!byBaseNoSize.has(fileKey(noSize))) byBaseNoSize.set(fileKey(noSize), filePath);
	}
	return { exact, byBase, byBaseNoSize };
}

const uploadIndex = buildFileIndex(sourceUploads);

function parseWpUploadRelative(rawUrl) {
	if (!rawUrl || typeof rawUrl !== "string") return "";
	let pathname = rawUrl.trim();
	try {
		const parsed = new URL(pathname);
		if (!OLD_DOMAINS.has(parsed.hostname)) return "";
		pathname = parsed.pathname;
	} catch {
		// Keep relative paths.
	}

	const match = pathname.match(/\/wp-content\/uploads\/(.+)$/i);
	return match ? decodePathname(match[1]) : "";
}

function findUpload(relativePath) {
	if (!relativePath) return "";
	const normalized = normalizeSlashes(relativePath).replace(/^\/+/, "");
	const candidates = new Set([
		normalized,
		removeWpSizeSuffix(normalized),
		makeMojibakeCandidate(normalized),
		removeWpSizeSuffix(makeMojibakeCandidate(normalized)),
	]);

	const baseName = path.basename(normalized);
	const mojibakeBase = makeMojibakeCandidate(baseName);
	const baseCandidates = new Set([
		baseName,
		removeWpSizeSuffix(baseName),
		mojibakeBase,
		removeWpSizeSuffix(mojibakeBase),
	]);

	for (const candidate of candidates) {
		const exact = uploadIndex.exact.get(fileKey(candidate));
		if (exact) return exact;
	}
	for (const candidate of baseCandidates) {
		const exactBase = uploadIndex.byBase.get(fileKey(candidate));
		if (exactBase) return exactBase;
		const noSizeBase = uploadIndex.byBaseNoSize.get(fileKey(candidate));
		if (noSizeBase) return noSizeBase;
	}
	return "";
}

function copyAsset(sourcePath, targetFileName) {
	if (!sourcePath || !fs.existsSync(sourcePath)) return "";
	const targetPath = path.join(targetUploadDir, targetFileName);
	assertInside(targetAssetDir, targetPath);
	fs.copyFileSync(sourcePath, targetPath);
	return `/assets/mrbin/uploads/${targetFileName}`;
}

function extractUploadUrls(content) {
	const urls = new Set();
	const re = /(?:src|href)=["']([^"']*\/wp-content\/uploads\/[^"']+)["']/gi;
	let match;
	while ((match = re.exec(content || ""))) {
		urls.add(match[1]);
	}
	return [...urls];
}

function stripWpBlocks(content) {
	return (content || "")
		.replace(/<!--\s*\/?wp:[\s\S]*?-->/g, "")
		.replace(/\r\n/g, "\n")
		.trim();
}

function stripHtml(content) {
	return stripWpBlocks(content)
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();
}

function toDescription(post) {
	const text = stripHtml(post.post_content);
	if (text) return text.slice(0, 140);
	return "旧 WordPress 文章正文为空，已保留原始标题、分类、日期和封面。";
}

function quoteFrontmatter(value) {
	return JSON.stringify(value ?? "");
}

function slugDate(value) {
	return String(value || "").slice(0, 10) || "1970-01-01";
}

function assetExt(sourcePath) {
	const ext = path.extname(sourcePath).toLowerCase();
	return ext || ".jpg";
}

function rewriteContentAssets(post, content, assetMap) {
	let output = content;
	for (const [oldUrl, newUrl] of assetMap) {
		output = output.split(oldUrl).join(newUrl);
		try {
			output = output.split(encodeURI(oldUrl)).join(newUrl);
		} catch {
			// Ignore malformed URLs.
		}
	}
	return output;
}

function copyThemeAssets() {
	if (!fs.existsSync(sourceThemeImages)) return;
	const themeFiles = [
		"logo.jpg",
		"user.jpg",
		"lolisister1.gif",
		"avatar.png",
		"linkspic.jpg",
	];
	for (const name of themeFiles) {
		const source = path.join(sourceThemeImages, name);
		if (fs.existsSync(source)) fs.copyFileSync(source, path.join(targetThemeDir, name));
	}
	const randDir = path.join(sourceThemeImages, "rand");
	const targetRand = path.join(targetThemeDir, "rand");
	if (fs.existsSync(randDir)) {
		fs.mkdirSync(targetRand, { recursive: true });
		for (const source of walkFiles(randDir)) {
			const rel = path.relative(randDir, source);
			const target = path.join(targetRand, rel);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.copyFileSync(source, target);
		}
	}
}

if (!fs.existsSync(exportJsonPath)) {
	throw new Error(`Missing export JSON: ${exportJsonPath}`);
}

const exported = JSON.parse(fs.readFileSync(exportJsonPath, "utf8"));
const posts = Array.isArray(exported.posts) ? exported.posts : [];

ensureCleanDir(targetPostDir);
ensureCleanDir(targetAssetDir);
fs.mkdirSync(targetUploadDir, { recursive: true });
fs.mkdirSync(targetThemeDir, { recursive: true });
copyThemeAssets();

const manifest = [];

for (const post of posts) {
	const postId = String(post.ID);
	const date = slugDate(post.post_date);
	const slug = `${date}-${postId}`;
	const assetMap = new Map();
	let assetIndex = 1;

	const urls = new Set(extractUploadUrls(post.post_content));
	if (post.thumbnail) urls.add(post.thumbnail);

	for (const url of urls) {
		const relative = parseWpUploadRelative(url);
		const source = findUpload(relative);
		if (!source) continue;
		const targetFileName = `post-${postId}-${String(assetIndex).padStart(2, "0")}${assetExt(source)}`;
		const newUrl = copyAsset(source, targetFileName);
		if (newUrl) {
			assetMap.set(url, newUrl);
			assetIndex += 1;
		}
	}

	const thumbRelative = parseWpUploadRelative(post.thumbnail);
	const thumbSource = findUpload(thumbRelative);
	const image = post.thumbnail
		? (assetMap.get(post.thumbnail) ||
			(thumbSource
				? copyAsset(thumbSource, `post-${postId}-cover${assetExt(thumbSource)}`)
				: ""))
		: "";

	const cleanBody = stripWpBlocks(post.post_content);
	const body = cleanBody
		? rewriteContentAssets(post, cleanBody, assetMap)
		: "> 原 WordPress 正文为空，已保留原始标题、日期、分类和封面。";
	const category = Array.isArray(post.categories) && post.categories.length > 0
		? post.categories[0]
		: "";
	const tags = Array.isArray(post.tags) ? post.tags : [];
	const published = `${post.post_date.replace(" ", "T")}+08:00`;
	const updated = post.post_modified ? `${post.post_modified.replace(" ", "T")}+08:00` : "";
	const frontmatter = [
		"---",
		`title: ${quoteFrontmatter(post.post_title)}`,
		`published: ${published}`,
		updated ? `updated: ${updated}` : "",
		`description: ${quoteFrontmatter(toDescription(post))}`,
		`image: ${quoteFrontmatter(image)}`,
		`tags: ${JSON.stringify(tags)}`,
		`category: ${quoteFrontmatter(category)}`,
		`author: ${quoteFrontmatter("Mr.B1N")}`,
		"draft: false",
		`sourceLink: ${quoteFrontmatter(post.post_name ? `/archives/${post.post_name}` : "")}`,
		`comment: ${post.comment_status !== "closed"}`,
		"---",
		"",
	].filter(Boolean).join("\n");

	const mdPath = path.join(targetPostDir, `${slug}.md`);
	assertInside(repoRoot, mdPath);
	fs.writeFileSync(mdPath, `${frontmatter}\n\n${body}\n`, "utf8");
	manifest.push({
		id: post.ID,
		title: post.post_title,
		file: normalizeSlashes(path.relative(repoRoot, mdPath)),
		assets: assetIndex - 1,
		image,
	});
}

fs.writeFileSync(
	path.join(targetAssetDir, "manifest.json"),
	`${JSON.stringify({ generatedAt: new Date().toISOString(), posts: manifest }, null, 2)}\n`,
	"utf8",
);

console.log(`Imported ${manifest.length} Mr.B1N posts.`);
console.log(`Wrote ${targetPostDir}`);
console.log(`Wrote ${targetAssetDir}`);
