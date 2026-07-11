<script lang="ts">
import { onMount } from "svelte";
import AdminLogin from "@/components/admin/AdminLogin.svelte";
import WriteEditor from "@/components/edit/WriteEditor.svelte";
import {
	checkProxyConfigured,
	getDraftCount,
	hasValidCredentials,
	onDraftsChanged,
} from "@/utils/editMode";
import {
	clearAdminAuthenticated,
	isAdminAuthenticated,
} from "@/utils/adminAuth";

type AdminModule = {
	title: string;
	label: string;
	href: string;
	icon: string;
	count?: number;
	tone: "green" | "blue" | "amber" | "rose" | "violet" | "slate";
};

let {
	modules,
	metrics,
}: {
	modules: AdminModule[];
	metrics: { label: string; value: number | string; icon: string }[];
} = $props();

let adminReady = $state(false);
let adminAuthed = $state(false);
let authState = $state<"checking" | "ready" | "local" | "missing">("checking");
let draftCount = $state(0);
let activeView = $state<"overview" | "write" | "modules">("overview");
let selectedScope = $state<"all" | "content" | "site">("all");
let unsubscribeDrafts: (() => void) | null = null;

const contentTitles = new Set([
	"文章管理",
	"说说动态",
	"相册",
	"番组收藏",
	"笔记本",
	"日常规划",
	"足迹地图",
	"更新日志",
]);

const filteredModules = $derived.by(() => {
	if (selectedScope === "content") {
		return modules.filter((item) => contentTitles.has(item.title));
	}
	if (selectedScope === "site") {
		return modules.filter((item) => !contentTitles.has(item.title));
	}
	return modules;
});

const totalEntries = $derived(
	metrics.reduce((sum, item) => sum + Number(item.value || 0), 0),
);

const authLabel = $derived.by(() => {
	if (authState === "checking") return "检测中";
	if (authState === "ready") return "服务端认证";
	if (authState === "local") return "本机认证";
	return "未配置认证";
});

const authIcon = $derived(
	authState === "missing"
		? "material-symbols:key-off-outline"
		: "material-symbols:verified-user-outline",
);

const authTone = $derived(authState === "missing" ? "warning" : "success");

const primaryModules = $derived(modules.slice(0, 4));

async function refreshPublishAuth() {
	const proxyOk = await checkProxyConfigured();
	if (proxyOk) {
		authState = "ready";
	} else if (hasValidCredentials()) {
		authState = "local";
	} else {
		authState = "missing";
	}
}

function openModule(item: AdminModule, event: MouseEvent) {
	if (item.title === "文章管理") {
		event.preventDefault();
		activeView = "write";
		return;
	}
}

async function handleLogout() {
	await clearAdminAuthenticated();
	adminAuthed = false;
}

onMount(async () => {
	adminAuthed = await isAdminAuthenticated();
	adminReady = true;
	if (!adminAuthed) return;

	const params = new URLSearchParams(window.location.search);
	if (params.get("view") === "write") activeView = "write";
	if (params.get("view") === "modules") activeView = "modules";

	draftCount = getDraftCount();
	unsubscribeDrafts = onDraftsChanged(() => {
		draftCount = getDraftCount();
	});
	await refreshPublishAuth();
	return () => {
		if (unsubscribeDrafts) unsubscribeDrafts();
	};
});
</script>

{#if !adminReady}
	<div class="admin-loading">加载后台...</div>
{:else if !adminAuthed}
	<AdminLogin redirectTo="/admin/" />
{:else}
	<div class="admin-app">
		<aside class="admin-sidebar" aria-label="后台导航">
			<a class="brand" href="/admin/">
				<span class="brand-mark">
					<iconify-icon icon="material-symbols:dashboard-outline"></iconify-icon>
				</span>
				<span>
					<strong>Blog Admin</strong>
					<small>fqzlr console</small>
				</span>
			</a>

			<nav class="side-nav" aria-label="管理分区">
				<button class:active={activeView === "overview"} type="button" on:click={() => (activeView = "overview")}>
					<iconify-icon icon="material-symbols:space-dashboard-outline"></iconify-icon>
					<span>工作台</span>
				</button>
				<button class:active={activeView === "write"} type="button" on:click={() => (activeView = "write")}>
					<iconify-icon icon="material-symbols:edit-note-outline"></iconify-icon>
					<span>文章发布</span>
				</button>
				<button class:active={activeView === "modules"} type="button" on:click={() => (activeView = "modules")}>
					<iconify-icon icon="material-symbols:table-view-outline"></iconify-icon>
					<span>模块管理</span>
				</button>
			</nav>

			<div class="side-status" data-tone={authTone}>
				<iconify-icon icon={authIcon}></iconify-icon>
				<div>
					<strong>{authLabel}</strong>
					<span>{draftCount} 个暂存项</span>
				</div>
			</div>
		</aside>

		<div class="admin-main">
			<header class="admin-topbar">
				<div>
					<p>Control Center</p>
					<h1>{activeView === "write" ? "文章发布" : activeView === "modules" ? "模块管理" : "后台管理系统"}</h1>
				</div>
				<div class="topbar-actions">
					<a href="/" class="ghost-action">
						<iconify-icon icon="material-symbols:home-outline"></iconify-icon>
						<span>前台</span>
					</a>
					<button type="button" class="ghost-action" on:click={handleLogout}>
						<iconify-icon icon="material-symbols:logout-rounded"></iconify-icon>
						<span>退出</span>
					</button>
					<button type="button" class="solid-action" on:click={() => (activeView = "write")}>
						<iconify-icon icon="material-symbols:add-circle-outline"></iconify-icon>
						<span>新建</span>
					</button>
				</div>
			</header>

			{#if activeView === "write"}
				<section class="write-admin-panel">
					<div class="write-admin-head">
						<div>
							<h2>文章编辑器</h2>
							<span>填写标题、正文和发布信息后，可直接提交到仓库</span>
						</div>
						<span class="auth-pill" data-tone={authTone}>{authLabel}</span>
					</div>
					<div class="write-editor-wrapper admin-write-editor">
						<WriteEditor />
					</div>
				</section>
			{:else}
				{#if activeView === "overview"}
					<section class="overview-grid" aria-label="概览">
						<div class="overview-card primary">
							<div class="overview-head">
								<span>内容资产</span>
								<iconify-icon icon="material-symbols:database-outline"></iconify-icon>
							</div>
							<strong>{totalEntries}</strong>
							<small>文章、说说、相册、友链合计</small>
						</div>
						{#each metrics as metric}
							<div class="overview-card">
								<div class="overview-head">
									<span>{metric.label}</span>
									<iconify-icon icon={metric.icon}></iconify-icon>
								</div>
								<strong>{metric.value}</strong>
								<small>当前可见数量</small>
							</div>
						{/each}
					</section>

					<section class="workspace-grid">
						<div class="panel quick-panel">
							<div class="panel-title">
								<h2>快捷工作区</h2>
								<span>{authLabel}</span>
							</div>
							<div class="quick-actions">
								{#each primaryModules as item}
									<a href={item.href} on:click={(event) => openModule(item, event)}>
										<iconify-icon icon={item.icon}></iconify-icon>
										<span>{item.title}</span>
									</a>
								{/each}
							</div>
						</div>

						<div class="panel queue-panel">
							<div class="panel-title">
								<h2>发布队列</h2>
								<span>{draftCount === 0 ? "空闲" : `${draftCount} 项`}</span>
							</div>
							<div class="queue-list">
								<div>
									<span class="queue-dot done"></span>
									<strong>构建状态</strong>
									<small>最近一次构建通过</small>
								</div>
								<div>
									<span class="queue-dot" class:warn={draftCount > 0}></span>
									<strong>暂存草稿</strong>
									<small>{draftCount} 个待提交更改</small>
								</div>
								<div>
									<span class="queue-dot" class:warn={authState === "missing"}></span>
									<strong>提交认证</strong>
									<small>{authLabel}</small>
								</div>
							</div>
						</div>
					</section>
				{/if}

				<section class="panel module-panel">
					<div class="panel-title">
						<h2>模块管理</h2>
						<div class="scope-tabs">
							<button type="button" class:active={selectedScope === "all"} on:click={() => (selectedScope = "all")}>全部</button>
							<button type="button" class:active={selectedScope === "content"} on:click={() => (selectedScope = "content")}>内容</button>
							<button type="button" class:active={selectedScope === "site"} on:click={() => (selectedScope = "site")}>站点</button>
						</div>
						<span>{filteredModules.length} 个模块</span>
					</div>
					<div class="module-table" role="table" aria-label="模块管理">
						<div class="table-row table-head" role="row">
							<span>模块</span>
							<span>说明</span>
							<span>数量</span>
							<span>操作</span>
						</div>
						{#each filteredModules as item}
							<a class="table-row" href={item.href} role="row" on:click={(event) => openModule(item, event)}>
								<span class="module-name">
									<span class="table-icon" data-tone={item.tone}>
										<iconify-icon icon={item.icon}></iconify-icon>
									</span>
									<strong>{item.title}</strong>
								</span>
								<span class="module-label">{item.label}</span>
								<span class="module-number">{item.count ?? "-"}</span>
								<span class="module-open">
									进入
									<iconify-icon icon="material-symbols:arrow-forward"></iconify-icon>
								</span>
							</a>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	</div>
{/if}

<style>
	.admin-loading {
		display: grid;
		place-items: center;
		min-height: 50vh;
		color: var(--content-meta);
		font-weight: 800;
	}

	.admin-app {
		min-height: 72vh;
		display: grid;
		grid-template-columns: 15.5rem minmax(0, 1fr);
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		background: color-mix(in srgb, var(--card-bg) 92%, #000 0%);
	}

	.admin-sidebar {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		border-right: 1px solid var(--border);
		background: color-mix(in srgb, var(--card-bg) 88%, var(--btn-regular-bg));
	}

	.brand,
	.side-nav button,
	.side-status,
	.admin-topbar,
	.topbar-actions,
	.ghost-action,
	.solid-action,
	.overview-head,
	.quick-actions a,
	.table-row,
	.module-name,
	.module-open,
	.scope-tabs {
		display: flex;
		align-items: center;
	}

	.brand {
		gap: 0.75rem;
		padding: 0.7rem;
		color: var(--content);
		text-decoration: none;
	}

	.brand-mark,
	.table-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
	}

	.brand-mark {
		width: 2.45rem;
		height: 2.45rem;
		border-radius: 8px;
		color: white;
		background: var(--primary);
		font-size: 1.35rem;
	}

	.brand strong,
	.brand small {
		display: block;
	}

	.brand strong {
		font-size: 0.95rem;
		line-height: 1.2;
	}

	.brand small,
	.side-status span,
	.overview-card small,
	.queue-list small,
	.module-label,
	.write-admin-head span {
		color: var(--content-meta);
	}

	.brand small {
		margin-top: 0.15rem;
		font-size: 0.72rem;
	}

	.side-nav {
		display: grid;
		gap: 0.35rem;
	}

	.side-nav button {
		width: 100%;
		gap: 0.65rem;
		min-height: 2.65rem;
		padding: 0 0.75rem;
		border: 0;
		border-radius: 8px;
		color: var(--content);
		background: transparent;
		font: inherit;
		font-size: 0.9rem;
		font-weight: 700;
		text-align: left;
		cursor: pointer;
	}

	.side-nav button:hover,
	.side-nav button.active {
		background: var(--btn-regular-bg);
	}

	.side-nav button.active {
		color: var(--primary);
	}

	.side-status {
		margin-top: auto;
		gap: 0.65rem;
		padding: 0.85rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--card-bg);
	}

	.side-status > iconify-icon {
		font-size: 1.35rem;
	}

	.side-status[data-tone="success"] > iconify-icon,
	.auth-pill[data-tone="success"] {
		color: #059669;
	}

	.side-status[data-tone="warning"] > iconify-icon,
	.auth-pill[data-tone="warning"] {
		color: #d97706;
	}

	.side-status strong,
	.side-status span {
		display: block;
		font-size: 0.78rem;
	}

	.admin-main {
		min-width: 0;
		padding: 1rem;
		background: color-mix(in srgb, var(--page-bg) 82%, var(--card-bg));
	}

	.admin-topbar {
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.admin-topbar p {
		margin: 0 0 0.2rem;
		color: var(--primary);
		font-size: 0.74rem;
		font-weight: 800;
		text-transform: uppercase;
	}

	h1,
	h2 {
		margin: 0;
		letter-spacing: 0;
	}

	h1 {
		font-size: 1.45rem;
		line-height: 1.2;
	}

	h2 {
		font-size: 0.98rem;
	}

	.topbar-actions {
		gap: 0.5rem;
	}

	.ghost-action,
	.solid-action {
		justify-content: center;
		gap: 0.4rem;
		min-height: 2.4rem;
		padding: 0 0.85rem;
		border-radius: 8px;
		font: inherit;
		font-size: 0.86rem;
		font-weight: 800;
		text-decoration: none;
		cursor: pointer;
	}

	.ghost-action {
		border: 1px solid var(--border);
		color: var(--content);
		background: var(--card-bg);
	}

	.solid-action {
		border: 0;
		color: white;
		background: var(--primary);
	}

	.overview-grid {
		display: grid;
		grid-template-columns: 1.25fr repeat(4, minmax(0, 1fr));
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.overview-card,
	.panel,
	.write-admin-panel {
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--card-bg);
	}

	.overview-card {
		min-height: 6rem;
		padding: 0.9rem;
	}

	.overview-card.primary {
		color: white;
		background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 68%, #111827));
	}

	.overview-head {
		justify-content: space-between;
		gap: 0.5rem;
		color: var(--content-meta);
		font-size: 0.78rem;
		font-weight: 800;
	}

	.overview-card.primary .overview-head,
	.overview-card.primary small {
		color: rgb(255 255 255 / 78%);
	}

	.overview-head iconify-icon {
		font-size: 1.2rem;
	}

	.overview-card strong {
		display: block;
		margin-top: 0.8rem;
		font-size: 1.6rem;
		line-height: 1;
	}

	.overview-card small {
		display: block;
		margin-top: 0.45rem;
		font-size: 0.73rem;
	}

	.workspace-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(17rem, 0.8fr);
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.panel,
	.write-admin-panel {
		padding: 1rem;
	}

	.panel-title,
	.write-admin-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.85rem;
	}

	.panel-title span,
	.write-admin-head span {
		font-size: 0.78rem;
		font-weight: 800;
	}

	.scope-tabs {
		gap: 0.25rem;
		padding: 0.2rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--btn-regular-bg);
	}

	.scope-tabs button {
		min-height: 1.85rem;
		padding: 0 0.65rem;
		border: 0;
		border-radius: 6px;
		color: var(--content-meta);
		background: transparent;
		font: inherit;
		font-size: 0.78rem;
		font-weight: 900;
		cursor: pointer;
	}

	.scope-tabs button.active {
		color: var(--content);
		background: var(--card-bg);
	}

	.quick-actions {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.quick-actions a {
		justify-content: center;
		gap: 0.45rem;
		min-height: 3.1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--content);
		background: var(--btn-regular-bg);
		text-decoration: none;
		font-size: 0.82rem;
		font-weight: 800;
	}

	.quick-actions a:hover,
	.table-row:hover {
		border-color: color-mix(in srgb, var(--primary) 42%, var(--border));
		background: color-mix(in srgb, var(--primary) 7%, var(--card-bg));
	}

	.queue-list {
		display: grid;
		gap: 0.55rem;
	}

	.queue-list div {
		position: relative;
		display: grid;
		gap: 0.1rem;
		padding-left: 1.2rem;
	}

	.queue-list strong,
	.queue-list small {
		font-size: 0.78rem;
	}

	.queue-dot {
		position: absolute;
		left: 0;
		top: 0.35rem;
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: #94a3b8;
	}

	.queue-dot.done {
		background: #10b981;
	}

	.queue-dot.warn {
		background: #f59e0b;
	}

	.module-panel {
		padding-bottom: 0.75rem;
	}

	.module-table {
		display: grid;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 8px;
	}

	.table-row {
		display: grid;
		grid-template-columns: minmax(12rem, 1.2fr) minmax(12rem, 1.4fr) 5rem 5.5rem;
		gap: 1rem;
		min-height: 3.45rem;
		padding: 0 0.85rem;
		border-bottom: 1px solid var(--border);
		color: var(--content);
		text-decoration: none;
	}

	.table-row:last-child {
		border-bottom: 0;
	}

	.table-head {
		min-height: 2.5rem;
		color: var(--content-meta);
		background: var(--btn-regular-bg);
		font-size: 0.76rem;
		font-weight: 900;
	}

	.module-name {
		gap: 0.65rem;
		min-width: 0;
	}

	.module-name strong,
	.module-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.module-name strong,
	.module-number,
	.module-open {
		font-size: 0.84rem;
		font-weight: 800;
	}

	.table-icon {
		width: 2rem;
		height: 2rem;
		border-radius: 8px;
		font-size: 1.1rem;
	}

	.table-icon[data-tone="green"] {
		color: #047857;
		background: color-mix(in srgb, #10b981 14%, transparent);
	}

	.table-icon[data-tone="blue"] {
		color: #2563eb;
		background: color-mix(in srgb, #3b82f6 14%, transparent);
	}

	.table-icon[data-tone="amber"] {
		color: #b45309;
		background: color-mix(in srgb, #f59e0b 16%, transparent);
	}

	.table-icon[data-tone="rose"] {
		color: #be123c;
		background: color-mix(in srgb, #f43f5e 14%, transparent);
	}

	.table-icon[data-tone="violet"] {
		color: #7c3aed;
		background: color-mix(in srgb, #8b5cf6 14%, transparent);
	}

	.table-icon[data-tone="slate"] {
		color: #475569;
		background: color-mix(in srgb, #64748b 14%, transparent);
	}

	.module-label {
		font-size: 0.78rem;
	}

	.module-open {
		justify-content: flex-end;
		gap: 0.25rem;
		color: var(--primary);
	}

	.write-admin-panel {
		padding: 0;
		overflow: hidden;
	}

	.write-admin-head {
		margin: 0;
		padding: 1rem;
		border-bottom: 1px solid var(--border);
	}

	.auth-pill {
		padding: 0.4rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--btn-regular-bg);
		white-space: nowrap;
	}

	.admin-write-editor {
		--editor-theme-hue: var(--theme-hue);
		min-height: 70vh;
	}

	@media (max-width: 1100px) {
		.admin-app {
			grid-template-columns: 1fr;
		}

		.admin-sidebar {
			border-right: 0;
			border-bottom: 1px solid var(--border);
		}

		.side-nav {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		.side-status {
			margin-top: 0;
		}

		.overview-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 760px) {
		.admin-main {
			padding: 0.75rem;
		}

		.admin-topbar,
		.panel-title,
		.write-admin-head {
			align-items: flex-start;
			flex-direction: column;
		}

		.topbar-actions {
			flex-wrap: wrap;
		}

		.overview-grid,
		.workspace-grid,
		.quick-actions {
			grid-template-columns: 1fr;
		}

		.side-nav {
			grid-template-columns: 1fr;
		}

		.table-head {
			display: none;
		}

		.table-row {
			grid-template-columns: 1fr;
			gap: 0.35rem;
			padding: 0.85rem;
		}

		.module-open {
			justify-content: flex-start;
		}
	}
</style>
