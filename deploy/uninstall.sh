#!/usr/bin/env bash

set -Eeuo pipefail

UNINSTALL_VERSION="v1.0.43"
INSTALL_DIR_WAS_SET=0
if [[ -n "${INSTALL_DIR:-}" ]]; then
  INSTALL_DIR_WAS_SET=1
fi
INSTALL_DIR="${INSTALL_DIR:-/opt/ly-console}"
SERVICE_NAME="ly-afk-dashboard"
NGINX_SITE_NAME="ly-afk-dashboard"
SHORTCUT_FILE="/usr/local/bin/j"
BOOTSTRAP_LOG="/tmp/ly-console-bootstrap.log"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/ly-console}"
CONFIRM_UNINSTALL="${CONFIRM_UNINSTALL:-0}"

BLUE="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

info() {
  printf "${GREEN}[OK]${RESET} %s\n" "$1"
}

warn() {
  printf "${YELLOW}[提示]${RESET} %s\n" "$1"
}

fail() {
  printf "${RED}[错误]${RESET} %s\n" "$1" >&2
}

progress() {
  printf "${BLUE}[%s]${RESET} %s\n" "$1" "$2"
}

on_error() {
  local exit_code=$?
  fail "卸载脚本在第 ${BASH_LINENO[0]} 行失败。"
  fail "失败命令：${BASH_COMMAND}"
  exit "$exit_code"
}
trap on_error ERR

open_input_terminal() {
  if [[ -r /dev/tty ]]; then
    exec 3</dev/tty
  elif [[ "$CONFIRM_UNINSTALL" == "1" ]]; then
    exec 3</dev/null
  else
    fail "当前没有可用的交互终端，已拒绝执行卸载。"
    fail "请登录服务器后重试，或在自动化场景显式设置 CONFIRM_UNINSTALL=1。"
    exit 1
  fi
}

read_answer() {
  local prompt_text="$1"
  local answer
  read -r -p "${prompt_text}" answer <&3
  printf '%s' "$answer"
}

confirm_yes() {
  local prompt_text="$1"
  local default_answer="${2:-no}"
  local answer

  if [[ "$CONFIRM_UNINSTALL" == "1" ]]; then
    [[ "$default_answer" == "yes" ]]
    return
  fi

  answer="$(read_answer "$prompt_text")"
  if [[ -z "$answer" ]]; then
    [[ "$default_answer" == "yes" ]]
    return
  fi
  [[ "${answer,,}" == "y" || "${answer,,}" == "yes" ]]
}

normalize_install_dir() {
  local lexical_path resolved_path
  if [[ "$INSTALL_DIR" != /* ]]; then
    fail "INSTALL_DIR 必须是绝对路径：${INSTALL_DIR}"
    exit 1
  fi
  lexical_path="$(realpath -m -s -- "$INSTALL_DIR")"
  resolved_path="$(realpath -m -- "$INSTALL_DIR")"
  if [[ "$lexical_path" != "$resolved_path" ]]; then
    fail "拒绝卸载包含符号链接的路径：${lexical_path}"
    exit 1
  fi
  INSTALL_DIR="$lexical_path"
}

refuse_unsafe_install_dir() {
  local current_path="" path_part
  local path_parts=()
  case "$INSTALL_DIR" in
    /|/bin|/boot|/dev|/etc|/home|/lib|/lib64|/media|/mnt|/opt|/proc|/root|/run|/sbin|/srv|/sys|/tmp|/usr|/var)
      fail "拒绝卸载：安装目录是系统关键路径 ${INSTALL_DIR}"
      exit 1
      ;;
  esac


  IFS='/' read -r -a path_parts <<< "${INSTALL_DIR#/}"
  for path_part in "${path_parts[@]}"; do
    current_path="${current_path}/${path_part}"
    if [[ -L "$current_path" ]]; then
      fail "拒绝卸载包含符号链接的路径：${current_path}"
      exit 1
    fi
  done

  if [[ -e "$INSTALL_DIR" ]] && command -v mountpoint >/dev/null 2>&1 && mountpoint -q "$INSTALL_DIR"; then
    fail "拒绝卸载挂载点目录：${INSTALL_DIR}"
    exit 1
  fi
}

dir_is_ly_console() {
  [[ -f "${INSTALL_DIR}/package.json" ]] \
    && grep -Eq '"name"[[:space:]]*:[[:space:]]*"ly-console"' "${INSTALL_DIR}/package.json"
}

dir_has_ly_markers() {
  { dir_is_ly_console && [[ -f "${INSTALL_DIR}/deploy/ly-afk-manager.sh" ]]; } \
    || [[ -f "${INSTALL_DIR}/deploy/ly-afk-manager.sh" \
      && -f "${INSTALL_DIR}/src/dashboard.js" \
      && -f "${INSTALL_DIR}/public/index.html" ]] \
    || {
      [[ -f "${INSTALL_DIR}/.git/config" ]] \
        && grep -Fq 'bykedie/LY-' "${INSTALL_DIR}/.git/config" \
        && dir_is_ly_console
    }
}

validate_backup_root() {
  local lexical_path resolved_path
  if [[ "$BACKUP_ROOT" != /* ]]; then
    fail "BACKUP_ROOT 必须是绝对路径：${BACKUP_ROOT}"
    exit 1
  fi
  lexical_path="$(realpath -m -s -- "$BACKUP_ROOT")"
  resolved_path="$(realpath -m -- "$BACKUP_ROOT")"
  if [[ "$lexical_path" != "$resolved_path" ]]; then
    fail "备份目录不能包含符号链接：${lexical_path}"
    exit 1
  fi
  BACKUP_ROOT="$lexical_path"
  case "$BACKUP_ROOT" in
    /|/bin|/boot|/dev|/etc|/home|/lib|/lib64|/media|/mnt|/opt|/proc|/root|/run|/sbin|/srv|/sys|/tmp|/usr|/var)
      fail "备份目录不能直接使用系统关键路径：${BACKUP_ROOT}"
      exit 1
      ;;
  esac
  if [[ -e "$BACKUP_ROOT" && ! -d "$BACKUP_ROOT" ]]; then
    fail "备份路径存在但不是目录：${BACKUP_ROOT}"
    exit 1
  fi
  if [[ "$BACKUP_ROOT" == "$INSTALL_DIR" || "$BACKUP_ROOT" == "${INSTALL_DIR}/"* ]]; then
    fail "备份目录不能位于即将删除的项目目录内：${BACKUP_ROOT}"
    exit 1
  fi
}

validate_install_dir() {
  normalize_install_dir
  refuse_unsafe_install_dir

  if [[ ! -e "$INSTALL_DIR" ]]; then
    fail "安装目录不存在，已拒绝继续清理系统资源：${INSTALL_DIR}"
    fail "请确认 INSTALL_DIR，或先从现有 j 快捷命令打开菜单执行卸载。"
    exit 1
  fi
  if [[ ! -d "$INSTALL_DIR" ]]; then
    fail "安装路径存在但不是目录：${INSTALL_DIR}"
    exit 1
  fi
  if ! dir_has_ly_markers; then
    fail "拒绝删除：${INSTALL_DIR} 未识别为 LY 控制台项目。"
    fail "请确认 INSTALL_DIR 是否正确；脚本不会删除来源不明的目录。"
    exit 1
  fi
}

detect_install_dir_from_shortcut() {
  local shortcut_cd candidate
  if [[ "$INSTALL_DIR_WAS_SET" == "1" || -e "$INSTALL_DIR" || -L "$INSTALL_DIR" ]]; then
    return
  fi

  if [[ -f "$SHORTCUT_FILE" ]] && grep -Fq 'deploy/ly-afk-manager.sh' "$SHORTCUT_FILE"; then
    shortcut_cd="$(grep -m1 -E '^cd "/.+"$' "$SHORTCUT_FILE" || true)"
    candidate="${shortcut_cd#cd \"}"
    candidate="${candidate%\"}"
    if [[ -n "$shortcut_cd" && "$candidate" == /* ]]; then
      INSTALL_DIR="$candidate"
      warn "默认目录不存在，已从 j 快捷命令识别安装目录：${INSTALL_DIR}"
      return
    fi
  fi

  fail "默认安装目录不存在，也无法从 j 快捷命令识别实际目录。"
  fail "请重新执行并显式指定：sudo INSTALL_DIR=/实际/目录 bash"
  exit 1
}

get_env_value() {
  local key="$1"
  if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
    return 0
  fi
  grep -E "^${key}=" "${INSTALL_DIR}/.env" | tail -n 1 | cut -d= -f2- || true
}

runtime_data_exists() {
  local runtime_file
  for runtime_file in .env bot.config.json accounts.json bot.config.profiles bot.config.automations.json; do
    if [[ -e "${INSTALL_DIR}/${runtime_file}" ]]; then
      return 0
    fi
  done
  return 1
}

backup_runtime_data() {
  local backup_dir runtime_file
  if [[ ! -d "$BACKUP_ROOT" ]]; then
    install -d -m 700 "$BACKUP_ROOT"
  fi
  backup_dir="$(mktemp -d "${BACKUP_ROOT}/$(date +%Y%m%d%H%M%S).XXXXXX")"
  chmod 700 "$backup_dir"

  for runtime_file in .env bot.config.json accounts.json bot.config.profiles bot.config.automations.json; do
    if [[ -e "${INSTALL_DIR}/${runtime_file}" ]]; then
      cp -a "${INSTALL_DIR}/${runtime_file}" "${backup_dir}/${runtime_file}"
    fi
  done

  cat > "${backup_dir}/UNINSTALL_INFO.txt" <<EOF
LY 控制台卸载备份
卸载脚本版本：${UNINSTALL_VERSION}
原安装目录：${INSTALL_DIR}
备份时间：$(date '+%Y-%m-%d %H:%M:%S %z')
EOF
  chmod -R go-rwx "$backup_dir"
  BACKUP_DIR="$backup_dir"
  info "运行配置已备份到：${backup_dir}"
}

user_home() {
  getent passwd "$1" | cut -d: -f6
}

run_as_user() {
  local user_name="$1"
  shift
  if [[ "$user_name" == "root" ]]; then
    "$@"
  elif command -v runuser >/dev/null 2>&1; then
    runuser -u "$user_name" -- "$@"
  else
    sudo -u "$user_name" -H "$@"
  fi
}

remove_service_from_pm2_dump_file() {
  local user_name="$1"
  local home_dir="$2"
  local dump_file="$3"
  local python_path result

  if [[ ! -f "$dump_file" ]] || ! grep -Fq "$SERVICE_NAME" "$dump_file"; then
    return
  fi
  python_path="$(command -v python3 || command -v python || true)"
  if [[ -z "$python_path" ]]; then
    fail "无法清理 ${dump_file}：系统缺少 Python。"
    return 1
  fi

  result="$(
    run_as_user "$user_name" env \
      HOME="$home_dir" \
      SERVICE_NAME="$SERVICE_NAME" \
      DUMP_FILE="$dump_file" \
      "$python_path" - <<'PY'
import json
import os
import stat

path = os.environ['DUMP_FILE']
service_name = os.environ['SERVICE_NAME']
with open(path, 'r', encoding='utf-8') as handle:
    data = json.load(handle)
if not isinstance(data, list):
    raise RuntimeError('PM2 dump root must be an array')

filtered = []
removed = False
for item in data:
    if not isinstance(item, dict):
        filtered.append(item)
        continue
    pm2_env = item.get('pm2_env')
    nested_name = pm2_env.get('name') if isinstance(pm2_env, dict) else None
    if item.get('name') == service_name or nested_name == service_name:
        removed = True
    else:
        filtered.append(item)

if not removed:
    print('unchanged')
    raise SystemExit(0)

file_stat = os.stat(path)
temp_path = path + '.ly-uninstall.tmp'
with open(temp_path, 'w', encoding='utf-8', newline='\n') as handle:
    json.dump(filtered, handle, ensure_ascii=False, indent=2)
    handle.write('\n')
os.chmod(temp_path, stat.S_IMODE(file_stat.st_mode))
os.replace(temp_path, path)
print('removed')
PY
  )"

  if [[ "$result" == "removed" ]]; then
    info "已从 ${user_name} 用户的 PM2 持久化清单删除：${SERVICE_NAME}"
  fi
}

remove_service_from_pm2_dumps_for_user() {
  local user_name="$1"
  local home_dir="$2"
  local dump_name
  for dump_name in dump.pm2 dump.pm2.bak; do
    remove_service_from_pm2_dump_file "$user_name" "$home_dir" "${home_dir}/.pm2/${dump_name}"
  done
}

remove_pm2_runtime_files() {
  local home_dir="$1"
  find "${home_dir}/.pm2/logs" -maxdepth 1 -type f -name "${SERVICE_NAME}-*.log" -delete 2>/dev/null || true
  find "${home_dir}/.pm2/pids" -maxdepth 1 -type f -name "${SERVICE_NAME}-*.pid" -delete 2>/dev/null || true
}

pm2_daemon_running() {
  local home_dir="$1"
  local pid_file="${home_dir}/.pm2/pm2.pid"
  local daemon_pid
  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi
  daemon_pid="$(tr -dc '0-9' < "$pid_file")"
  [[ -n "$daemon_pid" ]] && kill -0 "$daemon_pid" 2>/dev/null
}

remove_pm2_service_for_user() {
  local user_name="$1"
  local home_dir pm2_path
  if ! id "$user_name" >/dev/null 2>&1; then
    return
  fi
  home_dir="$(user_home "$user_name")"
  if [[ -z "$home_dir" ]]; then
    return
  fi
  if [[ ! -d "${home_dir}/.pm2" ]]; then
    return
  fi

  remove_service_from_pm2_dumps_for_user "$user_name" "$home_dir"
  remove_pm2_runtime_files "$home_dir"
  pm2_path="$(run_as_user "$user_name" env HOME="$home_dir" PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sh -c 'command -v pm2' 2>/dev/null || true)"
  if [[ -z "$pm2_path" ]]; then
    if pm2_daemon_running "$home_dir"; then
      fail "${user_name} 用户的 PM2 守护进程仍在运行，但系统找不到 pm2 命令，已停止卸载。"
      return 1
    fi
    return
  fi
  if ! pm2_daemon_running "$home_dir"; then
    return
  fi

  if run_as_user "$user_name" env HOME="$home_dir" PM2_HOME="${home_dir}/.pm2" "$pm2_path" describe "$SERVICE_NAME" >/dev/null 2>&1; then
    run_as_user "$user_name" env HOME="$home_dir" PM2_HOME="${home_dir}/.pm2" "$pm2_path" delete "$SERVICE_NAME"
    run_as_user "$user_name" env HOME="$home_dir" PM2_HOME="${home_dir}/.pm2" "$pm2_path" save --force >/dev/null 2>&1 || true
    info "已删除 ${user_name} 用户下的 PM2 服务：${SERVICE_NAME}"
  fi
  if run_as_user "$user_name" env HOME="$home_dir" PM2_HOME="${home_dir}/.pm2" "$pm2_path" describe "$SERVICE_NAME" >/dev/null 2>&1; then
    fail "${user_name} 用户下的 PM2 服务仍然存在：${SERVICE_NAME}"
    return 1
  fi
  remove_pm2_runtime_files "$home_dir"

}

remove_pm2_service() {
  local pm2_users=(root)
  local user_name candidate known_user
  for candidate in "${SUDO_USER:-}" "${PROJECT_OWNER:-}"; do
    if [[ -z "$candidate" || "$candidate" == "root" ]]; then
      continue
    fi
    known_user=0
    for user_name in "${pm2_users[@]}"; do
      if [[ "$user_name" == "$candidate" ]]; then
        known_user=1
        break
      fi
    done
    if [[ "$known_user" == "0" ]]; then
      pm2_users+=("$candidate")
    fi
  done
  for user_name in "${pm2_users[@]}"; do
    remove_pm2_service_for_user "$user_name"
  done
}

shortcut_belongs_to_ly_console() {
  [[ -f "$SHORTCUT_FILE" ]] \
    && grep -Fqx "cd \"${INSTALL_DIR}\"" "$SHORTCUT_FILE" \
    && grep -Fq 'deploy/ly-afk-manager.sh' "$SHORTCUT_FILE"
}

remove_shortcut() {
  if [[ ! -e "$SHORTCUT_FILE" ]]; then
    return
  fi
  if shortcut_belongs_to_ly_console; then
    rm -f -- "$SHORTCUT_FILE"
    info "已删除快捷命令：${SHORTCUT_FILE}"
  else
    warn "${SHORTCUT_FILE} 不像 LY 控制台创建的快捷命令，已保留。"
  fi
}

remove_nginx_site() {
  local available_file="/etc/nginx/sites-available/${NGINX_SITE_NAME}"
  local enabled_file="/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"
  local changed=0

  if [[ -e "$enabled_file" || -L "$enabled_file" ]]; then
    rm -f -- "$enabled_file"
    changed=1
  fi
  if [[ -e "$available_file" ]]; then
    rm -f -- "$available_file"
    changed=1
  fi

  if [[ "$changed" == "1" ]]; then
    if command -v nginx >/dev/null 2>&1 && nginx -t; then
      systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true
    else
      warn "Nginx 配置已删除，但自动重载未执行，请稍后手动检查 nginx -t。"
    fi
    info "已删除 LY 控制台 Nginx 站点。"
  fi
}

ufw_has_panel_rule() {
  [[ -n "${PANEL_PORT:-}" ]] \
    && command -v ufw >/dev/null 2>&1 \
    && ufw status 2>/dev/null | grep -Eq "(^|[[:space:]])${PANEL_PORT}/tcp([[:space:]]|$)"
}

remove_panel_firewall_rule() {
  if ! ufw_has_panel_rule; then
    return
  fi
  ufw --force delete allow "${PANEL_PORT}/tcp"
  info "已删除 UFW 面板端口规则：${PANEL_PORT}/tcp"
}

remove_certificate_if_requested() {
  if [[ -z "${DASHBOARD_DOMAIN:-}" ]] || ! command -v certbot >/dev/null 2>&1; then
    return
  fi
  if ! certbot certificates --cert-name "$DASHBOARD_DOMAIN" 2>/dev/null | grep -Fq "Certificate Name: ${DASHBOARD_DOMAIN}"; then
    return
  fi
  if confirm_yes "检测到 ${DASHBOARD_DOMAIN} 的证书，是否同时删除？[y/N]：" no; then
    certbot delete --cert-name "$DASHBOARD_DOMAIN" --non-interactive
    info "已删除 HTTPS 证书：${DASHBOARD_DOMAIN}"
  else
    warn "已保留 HTTPS 证书：${DASHBOARD_DOMAIN}"
  fi
}

verify_uninstall() {
  local failed=0
  local available_file="/etc/nginx/sites-available/${NGINX_SITE_NAME}"
  local enabled_file="/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"

  if [[ -e "$INSTALL_DIR" || -L "$INSTALL_DIR" ]]; then
    fail "项目目录仍然存在：${INSTALL_DIR}"
    failed=1
  fi
  if [[ -e "$available_file" || -e "$enabled_file" || -L "$enabled_file" ]]; then
    fail "LY 控制台 Nginx 站点仍然存在。"
    failed=1
  fi
  if shortcut_belongs_to_ly_console; then
    fail "LY 控制台快捷命令仍然存在：${SHORTCUT_FILE}"
    failed=1
  fi
  if [[ "${REMOVE_PANEL_RULE:-0}" == "1" ]] && ufw_has_panel_rule; then
    fail "UFW 面板端口规则仍然存在：${PANEL_PORT}/tcp"
    failed=1
  fi

  if [[ "$failed" == "1" ]]; then
    return 1
  fi
  info "项目专属文件和规则核对通过。"
}

print_summary() {
  echo
  echo "LY 控制台一键卸载  ${UNINSTALL_VERSION}"
  echo "--------------------------------"
  echo "安装目录：${INSTALL_DIR}"
  echo "PM2 服务：${SERVICE_NAME}"
  echo "快捷命令：${SHORTCUT_FILE}"
  echo "Nginx 站点：${NGINX_SITE_NAME}"
  if [[ -n "${PANEL_PORT:-}" ]]; then
    echo "面板端口：${PANEL_PORT}/tcp"
  else
    echo "面板端口：未从 .env 识别"
  fi
  if [[ -n "${DASHBOARD_DOMAIN:-}" ]]; then
    echo "控制台域名：${DASHBOARD_DOMAIN}"
  fi
  echo "--------------------------------"
  echo "会删除：项目目录、LY 的 PM2 服务、专属 Nginx 站点和 j 快捷命令。"
  echo "会保留：Node.js、npm、PM2、Nginx、UFW、Certbot、22/80/443 规则和历史项目备份。"
  echo "云厂商安全组无法自动修改，如曾开放面板端口请在云控制台确认关闭。"
}

confirm_uninstall() {
  local answer
  if [[ "$CONFIRM_UNINSTALL" == "1" ]]; then
    warn "CONFIRM_UNINSTALL=1，跳过手动确认。"
    return
  fi
  answer="$(read_answer '请输入 UNINSTALL 确认卸载，其他输入将取消：')"
  if [[ "$answer" != "UNINSTALL" ]]; then
    warn "已取消卸载，没有修改服务器。"
    exit 0
  fi
}

main() {
  if [[ "${EUID}" -ne 0 ]]; then
    fail "请使用 root 权限运行，例如：curl -fL <卸载脚本地址> | sudo bash"
    exit 1
  fi

  open_input_terminal
  detect_install_dir_from_shortcut
  validate_install_dir
  validate_backup_root
  PROJECT_OWNER="$(stat -c '%U' "$INSTALL_DIR" 2>/dev/null || true)"
  PANEL_PORT="$(get_env_value DASHBOARD_PORT)"
  DASHBOARD_DOMAIN="$(get_env_value DASHBOARD_DOMAIN)"
  if [[ -n "$PANEL_PORT" ]] && ! [[ "$PANEL_PORT" =~ ^[0-9]+$ && "$PANEL_PORT" -ge 1 && "$PANEL_PORT" -le 65535 ]]; then
    warn ".env 中的 DASHBOARD_PORT 无效，已跳过防火墙规则处理：${PANEL_PORT}"
    PANEL_PORT=""
  fi

  print_summary
  confirm_uninstall

  BACKUP_DIR=""
  REMOVE_PANEL_RULE=0
  if [[ -d "$INSTALL_DIR" ]] && runtime_data_exists; then
    if confirm_yes "是否先备份账号和运行配置？[Y/n]：" yes; then
      backup_runtime_data
    else
      warn "你选择不备份，账号和运行配置将随项目目录永久删除。"
    fi
  fi
  if ufw_has_panel_rule && confirm_yes "是否删除 UFW 的 ${PANEL_PORT}/tcp 放行规则？[Y/n]：" yes; then
    REMOVE_PANEL_RULE=1
  fi

  progress "1/5" "停止并删除 LY 控制台 PM2 服务..."
  remove_pm2_service
  progress "2/5" "删除项目专属 Nginx 配置..."
  remove_nginx_site
  remove_certificate_if_requested
  progress "3/5" "删除快捷命令和面板防火墙规则..."
  remove_shortcut
  if [[ "$REMOVE_PANEL_RULE" == "1" ]]; then
    remove_panel_firewall_rule
  fi
  rm -f -- "$BOOTSTRAP_LOG"
  progress "4/5" "删除 LY 控制台项目目录..."
  cd /
  if [[ -d "$INSTALL_DIR" ]]; then
    validate_install_dir
    rm -rf --one-file-system -- "$INSTALL_DIR"
    info "已删除项目目录：${INSTALL_DIR}"
  fi
  progress "5/5" "核对卸载结果..."
  verify_uninstall

  echo
  info "LY 控制台卸载完成。"
  if [[ -n "$BACKUP_DIR" ]]; then
    echo "运行配置备份：${BACKUP_DIR}"
  fi
  echo "共享依赖和历史项目备份未删除。"
  echo "如不再使用域名，请自行删除 DNS 记录；如曾开放云安全组面板端口，也请在云控制台关闭。"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
