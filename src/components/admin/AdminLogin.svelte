<script lang="ts">
import { onMount } from "svelte";
import {
	isAdminAuthenticated,
	setAdminAuthenticated,
	verifyAdminPassword,
} from "@/utils/adminAuth";

let { redirectTo = "/admin/" }: { redirectTo?: string } = $props();

let password = $state("");
let loading = $state(false);
let error = $state("");

onMount(async () => {
	if (await isAdminAuthenticated()) {
		window.location.href = redirectTo;
	}
});

async function handleSubmit() {
	error = "";
	loading = true;
	try {
		const ok = await verifyAdminPassword(password);
		if (!ok) {
			error = "密码不正确或登录服务暂不可用";
			return;
		}
		setAdminAuthenticated();
		window.location.href = redirectTo;
	} finally {
		loading = false;
	}
}
</script>

<section class="login-shell">
	<form class="login-panel" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
		<div class="login-mark">
			<iconify-icon icon="material-symbols:admin-panel-settings-outline"></iconify-icon>
		</div>
		<p>Blog Admin</p>
		<h1>登录后台管理系统</h1>
		<div class="field">
			<label for="admin-password">管理密码</label>
			<input
				id="admin-password"
				type="password"
				bind:value={password}
				autocomplete="current-password"
				placeholder="输入后台密码"
			/>
		</div>
		{#if error}<span class="error">{error}</span>{/if}
		<button type="submit" disabled={loading || !password}>
			<iconify-icon icon={loading ? "material-symbols:progress-activity-rounded" : "material-symbols:login-rounded"}></iconify-icon>
			<span>{loading ? "登录中" : "进入后台"}</span>
		</button>
		<a href="/">返回前台</a>
	</form>
</section>

<style>
	.login-shell {
		display: grid;
		place-items: center;
		min-height: calc(100vh - 11rem);
		padding: 2rem 1rem;
	}

	.login-panel {
		width: min(100%, 25rem);
		display: grid;
		gap: 1rem;
		padding: 1.5rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--card-bg);
		box-shadow: 0 24px 70px rgb(0 0 0 / 10%);
	}

	.login-mark {
		width: 3rem;
		height: 3rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		color: white;
		background: var(--primary);
		font-size: 1.55rem;
	}

	p,
	h1 {
		margin: 0;
		letter-spacing: 0;
	}

	p {
		color: var(--primary);
		font-size: 0.78rem;
		font-weight: 900;
		text-transform: uppercase;
	}

	h1 {
		font-size: 1.35rem;
		line-height: 1.25;
	}

	.field {
		display: grid;
		gap: 0.45rem;
	}

	label {
		color: var(--content-meta);
		font-size: 0.82rem;
		font-weight: 800;
	}

	input {
		width: 100%;
		min-height: 2.75rem;
		padding: 0 0.85rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--content);
		background: var(--page-bg);
		font: inherit;
		outline: none;
	}

	input:focus {
		border-color: var(--primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent);
	}

	button {
		min-height: 2.75rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		border: 0;
		border-radius: 8px;
		color: white;
		background: var(--primary);
		font: inherit;
		font-weight: 900;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	a {
		justify-self: center;
		color: var(--content-meta);
		font-size: 0.82rem;
		font-weight: 800;
		text-decoration: none;
	}

	.error {
		color: #dc2626;
		font-size: 0.82rem;
		font-weight: 800;
	}
</style>
