const SESSION_ENDPOINT = "/api/admin/session";

async function request(path: string, options?: RequestInit): Promise<Response | null> {
	try {
		return await fetch(path, {
			credentials: "same-origin",
			cache: "no-store",
			...options,
		});
	} catch {
		return null;
	}
}

export async function isAdminAuthenticated(): Promise<boolean> {
	const response = await request(SESSION_ENDPOINT);
	return response?.ok === true;
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
	if (!password) return false;
	const response = await request("/api/admin/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ password }),
	});
	return response?.ok === true;
}

export function setAdminAuthenticated(): void {
	// The server creates the HttpOnly session cookie after a successful login.
}

export async function clearAdminAuthenticated(): Promise<void> {
	await request("/api/admin/logout", { method: "POST" });
}
