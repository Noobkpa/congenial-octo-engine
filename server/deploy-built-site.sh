#!/usr/bin/env bash
set -Eeuo pipefail

readonly REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
readonly ARTIFACT_BRANCH="gh-pages"
readonly LIVE_DIR="/www/wwwroot/zuelhhb.top"
readonly WORK_ROOT="/var/lib/mrbin-blog-dist-deploy"
readonly RUNTIME_DIR="${DEPLOY_RUNTIME_DIR:-/run/mrbin-blog-deploy}"
readonly BACKUP_ROOT="/www/wwwroot/.deploy-backups"
readonly STATUS_FILE="${RUNTIME_DIR}/status.json"

mkdir -p "${WORK_ROOT}" "${RUNTIME_DIR}" "${BACKUP_ROOT}"

status() {
	local state="$1"
	local message="$2"
	printf '{"state":"%s","message":"%s","updatedAt":"%s"}\n' \
		"${state}" "${message//\"/\\\"}" "$(date --iso-8601=seconds)" > "${STATUS_FILE}.tmp"
	mv "${STATUS_FILE}.tmp" "${STATUS_FILE}"
}

remote_sha="$(curl --fail --silent --show-error --max-time 30 \
	-H 'Accept: application/vnd.github+json' \
	-H 'User-Agent: MrBin-Blog-Deployer' \
	"https://api.github.com/repos/${REPOSITORY}/commits/${ARTIFACT_BRANCH}" \
	| /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["sha"])' 2>/dev/null || true)"

if [[ -z "${remote_sha}" ]]; then
	status "waiting" "Waiting for the first GitHub Actions build."
	exit 0
fi

if [[ -f "${WORK_ROOT}/last-sha" ]] && [[ "$(cat "${WORK_ROOT}/last-sha")" == "${remote_sha}" ]]; then
	exit 0
fi

readonly STAMP="$(date +%Y%m%d%H%M%S)"
readonly ARCHIVE="${WORK_ROOT}/site-${STAMP}.tar.gz"
readonly RELEASE_DIR="${WORK_ROOT}/release-${STAMP}"
readonly BACKUP_DIR="${BACKUP_ROOT}/zuelhhb.top-${STAMP}-auto-dist"

cleanup() {
	rm -f "${ARCHIVE}"
	if [[ -d "${RELEASE_DIR}" ]]; then rm -rf --one-file-system "${RELEASE_DIR}"; fi
}

fail() {
	local code=$?
	status "failed" "Static artifact deployment failed with exit code ${code}."
	cleanup
	exit "${code}"
}
trap fail ERR

status "deploying" "Downloading verified static build ${remote_sha:0:12}."
curl --fail --location --silent --show-error --retry 3 \
	--connect-timeout 15 --max-time 300 \
	"https://github.com/${REPOSITORY}/archive/refs/heads/${ARTIFACT_BRANCH}.tar.gz" \
	-o "${ARCHIVE}"

mkdir -p "${RELEASE_DIR}"
tar -xzf "${ARCHIVE}" --strip-components=1 -C "${RELEASE_DIR}"
test -f "${RELEASE_DIR}/index.html"
test -f "${RELEASE_DIR}/admin/index.html"
chown -R www:www "${RELEASE_DIR}"
find "${RELEASE_DIR}" -type d -exec chmod 755 {} +
find "${RELEASE_DIR}" -type f -exec chmod 644 {} +

mv "${LIVE_DIR}" "${BACKUP_DIR}"
if ! mv "${RELEASE_DIR}" "${LIVE_DIR}"; then
	mv "${BACKUP_DIR}" "${LIVE_DIR}"
	false
fi

curl --fail --silent --show-error --max-time 20 --insecure \
	-H "Host: www.zuelhhb.top" "https://127.0.0.1/admin/" > /dev/null
printf '%s\n' "${remote_sha}" > "${WORK_ROOT}/last-sha"
status "succeeded" "Deployed static build ${remote_sha:0:12}."

mapfile -t old_backups < <(
	find "${BACKUP_ROOT}" -maxdepth 1 -mindepth 1 -type d \
		-name 'zuelhhb.top-*-auto-dist' -printf '%T@ %p\n' \
		| sort -nr | tail -n +6 | cut -d' ' -f2-
)
for backup in "${old_backups[@]}"; do
	[[ "${backup}" == "${BACKUP_ROOT}/zuelhhb.top-"*"-auto-dist" ]] || continue
	rm -rf --one-file-system "${backup}"
done

cleanup
trap - ERR
