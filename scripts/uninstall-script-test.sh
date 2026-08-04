#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${PROJECT_ROOT}/deploy/uninstall.sh"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

# Git Bash on NTFS cannot apply install(1)'s Unix mode bits; production keeps the real command.
install() {
  if [[ "${1:-}" == "-d" ]]; then
    mkdir -p "${@: -1}"
    return
  fi
  command install "$@"
}

expect_failure() {
  local message="$1"
  shift
  if ("$@") >/dev/null 2>&1; then
    echo "${message}" >&2
    exit 1
  fi
}

INSTALL_DIR="${TEST_ROOT}/plain"
mkdir -p "$INSTALL_DIR"
expect_failure "普通目录不应被识别为 LY 控制台。" validate_install_dir

INSTALL_DIR="${TEST_ROOT}/missing"
expect_failure "不存在的安装目录不应触发系统资源清理。" validate_install_dir

INSTALL_DIR="${TEST_ROOT}/ly-console"
mkdir -p "${INSTALL_DIR}/deploy"
printf '{"name":"ly-console"}\n' > "${INSTALL_DIR}/package.json"
touch "${INSTALL_DIR}/deploy/ly-afk-manager.sh"
validate_install_dir

SHORTCUT_FILE="${TEST_ROOT}/j"
cat > "$SHORTCUT_FILE" <<EOF
#!/usr/bin/env bash
cd "${INSTALL_DIR}"
exec sudo bash ./deploy/ly-afk-manager.sh
EOF
INSTALL_DIR_WAS_SET=0
INSTALL_DIR="${TEST_ROOT}/missing-default"
detect_install_dir_from_shortcut >/dev/null
[[ "$INSTALL_DIR" == "${TEST_ROOT}/ly-console" ]]
shortcut_belongs_to_ly_console
printf '#!/usr/bin/env bash\ncd "%s"\nexec sudo bash ./deploy/ly-afk-manager.sh\n' "${TEST_ROOT}/other-install" > "$SHORTCUT_FILE"
expect_failure "不属于本次安装目录的 j 快捷命令不应被删除。" shortcut_belongs_to_ly_console
printf '#!/usr/bin/env bash\ncd "%s"\nexec sudo bash ./deploy/ly-afk-manager.sh\n' "$INSTALL_DIR" > "$SHORTCUT_FILE"

BACKUP_ROOT="${TEST_ROOT}/backups"
validate_backup_root
printf 'DASHBOARD_PORT=30123\n' > "${INSTALL_DIR}/.env"
printf '{"server":{}}\n' > "${INSTALL_DIR}/bot.config.json"
BACKUP_DIR=""
backup_runtime_data >/dev/null
[[ -f "${BACKUP_DIR}/.env" ]]
[[ -f "${BACKUP_DIR}/bot.config.json" ]]
[[ -f "${BACKUP_DIR}/UNINSTALL_INFO.txt" ]]

run_as_user() {
  shift
  "$@"
}
mkdir -p "${TEST_ROOT}/pm2-home/.pm2"
cat > "${TEST_ROOT}/pm2-home/.pm2/dump.pm2" <<'EOF'
[
  {"name": "ly-afk-dashboard", "pm2_env": {"name": "ly-afk-dashboard"}},
  {"name": "keep-service", "pm2_env": {"name": "keep-service"}}
]
EOF
remove_service_from_pm2_dump_file test-user "${TEST_ROOT}/pm2-home" "${TEST_ROOT}/pm2-home/.pm2/dump.pm2" >/dev/null
grep -Fq 'keep-service' "${TEST_ROOT}/pm2-home/.pm2/dump.pm2"
if grep -Fq 'ly-afk-dashboard' "${TEST_ROOT}/pm2-home/.pm2/dump.pm2"; then
  echo "PM2 持久化清单仍包含待卸载服务。" >&2
  exit 1
fi

BACKUP_ROOT="${INSTALL_DIR}/backups"
expect_failure "备份目录不应位于待删除项目目录内。" validate_backup_root

BACKUP_ROOT="/etc"
expect_failure "系统关键路径不应直接作为备份目录。" validate_backup_root

ln -s "$INSTALL_DIR" "${TEST_ROOT}/ly-console-link"
if [[ -L "${TEST_ROOT}/ly-console-link" ]]; then
  INSTALL_DIR="${TEST_ROOT}/ly-console-link"
  expect_failure "符号链接安装路径不应被接受。" validate_install_dir
else
  echo "symlink guard skipped: current filesystem does not create POSIX symbolic links"
fi

INSTALL_DIR="/opt"
expect_failure "系统关键路径不应被接受。" validate_install_dir

echo "uninstall script test ok"
