#!/usr/bin/env bash
set -Eeuo pipefail

readonly REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
readonly BRANCH="${GITHUB_DEPLOY_BRANCH:-main}"
readonly LIVE_DIR="/www/wwwroot/zuelhhb.top"
readonly WORK_ROOT="/var/lib/mrbin-blog-deploy"
readonly RUNTIME_DIR="${DEPLOY_RUNTIME_DIR:-/run/mrbin-blog-deploy}"
readonly STAMP="$(date +%Y%m%d%H%M%S)"
readonly BUILD_DIR="${WORK_ROOT}/build-${STAMP}"
readonly ARCHIVE="${WORK_ROOT}/source-${STAMP}.tar.gz"
readonly BACKUP_ROOT="/www/wwwroot/.deploy-backups"
readonly BACKUP_DIR="${BACKUP_ROOT}/zuelhhb.top-${STAMP}-auto"
readonly STATUS_FILE="${RUNTIME_DIR}/status.json"

mkdir -p "${WORK_ROOT}" "${RUNTIME_DIR}" "${BACKUP_ROOT}"
rm -f "${RUNTIME_DIR}/requested"

status() {
	local state="$1"
	local message="$2"
	printf '{"state":"%s","message":"%s","updatedAt":"%s"}\n' \
		"${state}" "${message//\"/\\\"}" "$(date --iso-8601=seconds)" > "${STATUS_FILE}.tmp"
	mv "${STATUS_FILE}.tmp" "${STATUS_FILE}"
}

cleanup() {
	rm -f "${ARCHIVE}"
	if [[ -d "${BUILD_DIR}" ]]; then rm -rf --one-file-system "${BUILD_DIR}"; fi
}

fail() {
	local code=$?
	status "failed" "Deployment failed with exit code ${code}. Check journalctl -u mrbin-blog-deploy.service."
	cleanup
	exit "${code}"
}
trap fail ERR

status "building" "Downloading ${REPOSITORY}@${BRANCH}."
curl --fail --location --silent --show-error \
	--retry 3 --connect-timeout 15 --max-time 180 \
	"https://github.com/${REPOSITORY}/archive/refs/heads/${BRANCH}.tar.gz" \
	-o "${ARCHIVE}"

mkdir -p "${BUILD_DIR}"
tar -xzf "${ARCHIVE}" --strip-components=1 -C "${BUILD_DIR}"

status "building" "Installing dependencies and building the site."
cd "${BUILD_DIR}"
export PUBLIC_GITHUB_APP_ID="${GITHUB_APP_ID}"
export PUBLIC_GITHUB_OWNER="${REPOSITORY%%/*}"
export PUBLIC_GITHUB_REPO="${REPOSITORY##*/}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1400}"
if [[ -x /root/firefly-build/node_modules/.bin/astro ]]; then
	cp -al /root/firefly-build/node_modules "${BUILD_DIR}/node_modules"
	pnpm install --frozen-lockfile --offline
else
	pnpm install --frozen-lockfile --prefer-offline
fi
pnpm build
test -f "${BUILD_DIR}/dist/index.html"
test -f "${BUILD_DIR}/dist/admin/index.html"

status "deploying" "Switching the verified build into production."
chown -R www:www "${BUILD_DIR}/dist"
find "${BUILD_DIR}/dist" -type d -exec chmod 755 {} +
find "${BUILD_DIR}/dist" -type f -exec chmod 644 {} +

mv "${LIVE_DIR}" "${BACKUP_DIR}"
if ! mv "${BUILD_DIR}/dist" "${LIVE_DIR}"; then
	mv "${BACKUP_DIR}" "${LIVE_DIR}"
	false
fi

curl --fail --silent --show-error --max-time 20 \
	-H "Host: www.zuelhhb.top" "https://127.0.0.1/admin/" --insecure > /dev/null

status "succeeded" "Deployment completed from ${REPOSITORY}@${BRANCH}."
cleanup
trap - ERR
