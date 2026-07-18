#!/usr/bin/env bash

set -Eeuo pipefail

# 这个脚本用于“第一次部署”：
# 1. 在 Ubuntu 服务器上安装 git / curl 等基础工具
# 2. 从 GitHub 拉取 LY 控制台项目
# 3. 进入项目目录并启动一键管理菜单

# 你的 GitHub 仓库地址。
# 推送到真实仓库后，可以把这里改成你的最终地址。
# 也可以运行时覆盖，例如：
# REPO_URL=https://github.com/bykedie/LY-.git bash deploy/bootstrap.sh
REPO_URL="${REPO_URL:-https://github.com/bykedie/LY-.git}"

# 项目安装目录。
# 推荐放到 /opt/ly-console，便于后续用 pm2 / nginx 管理。
INSTALL_DIR="${INSTALL_DIR:-/opt/ly-console}"

# 默认分支。
# 如果你的 GitHub 仓库默认分支是 master，可以运行时加：
# BRANCH=master bash deploy/bootstrap.sh
BRANCH="${BRANCH:-main}"
ARCHIVE_URL="${ARCHIVE_URL:-https://github.com/bykedie/LY-/archive/refs/heads/${BRANCH}.tar.gz}"
LOG_FILE="${LOG_FILE:-/tmp/ly-console-bootstrap.log}"
GIT_CHECK_TIMEOUT="${GIT_CHECK_TIMEOUT:-20}"
GIT_CLONE_TIMEOUT="${GIT_CLONE_TIMEOUT:-300}"
ARCHIVE_DOWNLOAD_TIMEOUT="${ARCHIVE_DOWNLOAD_TIMEOUT:-300}"
export DEBIAN_FRONTEND="${DEBIAN_FRONTEND:-noninteractive}"
export GIT_HTTP_LOW_SPEED_LIMIT="${GIT_HTTP_LOW_SPEED_LIMIT:-1}"
export GIT_HTTP_LOW_SPEED_TIME="${GIT_HTTP_LOW_SPEED_TIME:-20}"

GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
BLUE="\033[36m"
RESET="\033[0m"
LAST_COMMAND="尚未执行命令"

exec > >(tee -a "$LOG_FILE") 2>&1

on_error() {
  local line="$1"
  local code="$2"
  fail "脚本在第 ${line} 行失败，退出码：${code}"
  echo
  echo "失败命令：${LAST_COMMAND}"
  echo
  echo "你可以把下面这个日志文件发给接手的人排查："
  echo "$LOG_FILE"
  echo
  echo "常见原因："
  echo "1. 服务器无法访问 GitHub raw.githubusercontent.com"
  echo "2. apt 正在被其他进程占用"
  echo "3. GitHub 仓库不是公开仓库，或仓库地址写错"
  echo "4. /opt 目录已有同名文件夹但不是本项目仓库"
  exit "$code"
}

trap 'on_error "$LINENO" "$?"' ERR

info() {
  printf "${GREEN}[OK]${RESET} %s\n" "$1"
}

warn() {
  printf "${YELLOW}[提示]${RESET} %s\n" "$1"
}

fail() {
  printf "${RED}[错误]${RESET} %s\n" "$1"
}

step() {
  printf "\n${BLUE}[%s]${RESET} %s\n" "$1" "$2"
}

run() {
  LAST_COMMAND="$*"
  echo "+ $*"
  "$@"
}

run_with_timeout() {
  local seconds="$1"
  shift
  LAST_COMMAND="timeout ${seconds}s $*"
  if command -v timeout >/dev/null 2>&1; then
    echo "+ timeout ${seconds}s $*"
    timeout "${seconds}s" "$@"
  else
    echo "+ $*"
    "$@"
  fi
}

run_interactive() {
  LAST_COMMAND="$* < /dev/tty"
  echo "+ $* < /dev/tty"
  if [[ -r /dev/tty ]]; then
    "$@" < /dev/tty
  else
    warn "当前会话没有可用的交互终端，无法自动打开菜单。"
    echo "项目已经下载完成，请手动执行："
    echo "cd ${INSTALL_DIR}"
    echo "sudo ./deploy/ly-afk-manager.sh"
  fi
}

install_j_shortcut() {
  local SUDO shortcut_file
  SUDO="$(need_sudo)"
  shortcut_file="/usr/local/bin/j"

  step "4/5" "安装快捷命令 j"
  run $SUDO tee "$shortcut_file" >/dev/null <<EOF
#!/usr/bin/env bash
cd "${INSTALL_DIR}"
if [[ "\${EUID}" -eq 0 ]]; then
  exec ./deploy/ly-afk-manager.sh "\$@"
fi
exec sudo ./deploy/ly-afk-manager.sh "\$@"
EOF
  run $SUDO chmod +x "$shortcut_file"
  info "快捷命令已安装：以后在终端输入 j 可直接打开 LY 管理界面。"
}

command_missing() {
  ! command -v "$1" >/dev/null 2>&1
}

package_missing() {
  ! dpkg -s "$1" >/dev/null 2>&1
}

dir_is_empty() {
  [[ -d "$1" ]] && [[ -z "$(find "$1" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]
}

dir_has_project_files() {
  [[ -f "$1/package.json" ]] && [[ -f "$1/deploy/ly-afk-manager.sh" ]]
}

prepare_existing_install_dir() {
  local SUDO backup_dir
  SUDO="$(need_sudo)"

  if [[ ! -e "$INSTALL_DIR" ]]; then
    return 0
  fi

  if dir_has_project_files "$INSTALL_DIR"; then
    warn "安装目录已存在，并且看起来已经是 LY 控制台项目：${INSTALL_DIR}"
    echo "跳过下载，直接进入一键管理菜单。"
    return 2
  fi

  if dir_is_empty "$INSTALL_DIR"; then
    warn "安装目录已存在但为空，自动清理：${INSTALL_DIR}"
    run $SUDO rmdir "$INSTALL_DIR"
    return 0
  fi

  backup_dir="${INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
  warn "安装目录已存在但不是完整项目，自动备份后继续安装。"
  echo "原目录：${INSTALL_DIR}"
  echo "备份到：${backup_dir}"
  run $SUDO mv "$INSTALL_DIR" "$backup_dir"
}

apt_update_with_retry() {
  local SUDO attempt
  SUDO="$(need_sudo)"
  for attempt in 1 2 3; do
    if run $SUDO apt update; then
      return 0
    fi
    warn "apt update 第 ${attempt} 次失败，10 秒后重试。"
    echo "如果一直失败，通常是系统软件源访问异常，或 apt 被其他进程占用。"
    sleep 10
  done
  return 1
}

need_sudo() {
  if [[ "${EUID}" -eq 0 ]]; then
    echo ""
  else
    echo "sudo"
  fi
}

install_base_tools() {
  local SUDO missing_packages=()
  SUDO="$(need_sudo)"
  step "1/5" "检查并安装基础工具：git / curl / ca-certificates"

  command_missing git && missing_packages+=(git)
  command_missing curl && missing_packages+=(curl)
  command_missing tar && missing_packages+=(tar)
  package_missing ca-certificates && missing_packages+=(ca-certificates)

  if [[ "${#missing_packages[@]}" -eq 0 ]]; then
    info "基础工具已存在，跳过 apt 安装。"
    return 0
  fi

  echo "需要安装的软件包：${missing_packages[*]}"
  if ! apt_update_with_retry; then
    warn "apt update 失败，继续尝试直接安装缺失软件包。"
  fi
  run $SUDO apt install -y "${missing_packages[@]}"
  info "基础工具已准备完成。"
}

check_repo_access() {
  step "2/5" "检查 GitHub 仓库是否可以访问"
  echo "仓库地址：${REPO_URL}"
  echo "目标分支：${BRANCH}"
  echo "最长等待：${GIT_CHECK_TIMEOUT} 秒"
  if run_with_timeout "$GIT_CHECK_TIMEOUT" git ls-remote --exit-code --heads "$REPO_URL" "$BRANCH" >/dev/null 2>&1; then
    info "仓库和分支可以访问。"
    return 0
  else
    warn "无法通过 git 访问仓库分支，常见原因是国内服务器访问 github.com 超时。"
    echo "脚本会继续尝试用 GitHub 压缩包下载方式安装。"
    echo
    echo "如果后续仍失败，可以使用下面几种方式处理："
    echo "1. 给服务器配置代理后重试，例如：export https_proxy=http://你的代理IP:端口"
    echo "2. 在本机下载项目压缩包上传到服务器，再运行 deploy/ly-afk-manager.sh"
    echo "3. 把仓库同步到 Gitee 等国内 Git 平台，然后这样运行："
    echo "   curl -fL --progress-bar 你的国内脚本地址 | sudo REPO_URL=你的国内仓库.git bash"
    echo
    return 1
  fi
}

clone_or_update_with_git() {
  local SUDO tmp_clone_dir
  SUDO="$(need_sudo)"
  step "3/5" "使用 Git 拉取或更新项目代码"

  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    warn "检测到项目已存在，开始更新：${INSTALL_DIR}"
    run_with_timeout "$GIT_CLONE_TIMEOUT" $SUDO git -C "$INSTALL_DIR" fetch origin "$BRANCH"
    run $SUDO git -C "$INSTALL_DIR" checkout "$BRANCH"
    run $SUDO git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
    return
  fi

  if [[ -e "$INSTALL_DIR" ]]; then
    if prepare_existing_install_dir; then
      :
    else
      return 0
    fi
  fi

  run $SUDO mkdir -p "$(dirname "$INSTALL_DIR")"
  tmp_clone_dir="$(mktemp -d)"
  if run_with_timeout "$GIT_CLONE_TIMEOUT" git clone --progress --branch "$BRANCH" "$REPO_URL" "$tmp_clone_dir/project"; then
    run $SUDO mv "$tmp_clone_dir/project" "$INSTALL_DIR"
    run rm -rf "$tmp_clone_dir"
  else
    warn "Git 克隆失败，准备尝试压缩包下载。"
    run rm -rf "$tmp_clone_dir"
    return 1
  fi
  info "项目代码已拉取到：${INSTALL_DIR}"
}

download_archive_project() {
  local SUDO tmp_dir archive_file extracted_dir
  SUDO="$(need_sudo)"
  step "3/5" "Git 访问失败，改用压缩包下载项目代码"
  echo "压缩包地址：${ARCHIVE_URL}"
  echo "最长等待：${ARCHIVE_DOWNLOAD_TIMEOUT} 秒"

  if [[ -e "$INSTALL_DIR" ]]; then
    if prepare_existing_install_dir; then
      :
    else
      return 0
    fi
  fi

  tmp_dir="$(mktemp -d)"
  archive_file="${tmp_dir}/ly-console.tar.gz"
  run_with_timeout "$ARCHIVE_DOWNLOAD_TIMEOUT" curl -fL --progress-bar "$ARCHIVE_URL" -o "$archive_file"
  run tar -xzf "$archive_file" -C "$tmp_dir"
  extracted_dir="$(find "$tmp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  if [[ -z "$extracted_dir" ]]; then
    fail "压缩包已下载，但没有找到解压后的项目目录。"
    exit 1
  fi
  run $SUDO mkdir -p "$(dirname "$INSTALL_DIR")"
  run $SUDO mv "$extracted_dir" "$INSTALL_DIR"
  run rm -rf "$tmp_dir"
  info "项目代码已通过压缩包安装到：${INSTALL_DIR}"
}

clone_or_update_project() {
  if check_repo_access; then
    if clone_or_update_with_git; then
      return 0
    fi
    download_archive_project
  else
    download_archive_project
  fi
}

run_manager() {
  local SUDO
  SUDO="$(need_sudo)"
  cd "$INSTALL_DIR"
  run $SUDO chmod +x deploy/ly-afk-manager.sh
  install_j_shortcut
  info "项目已准备完成，正在打开 LY 控制台一键管理菜单。"
  step "5/5" "进入菜单，请根据提示选择功能，也可以以后直接输入 j 打开"
  run_interactive $SUDO ./deploy/ly-afk-manager.sh
}

main() {
  echo "LY 控制台一键拉取与配置脚本"
  echo "--------------------------------"
  echo "仓库地址：${REPO_URL}"
  echo "安装目录：${INSTALL_DIR}"
  echo "默认分支：${BRANCH}"
  echo "日志文件：${LOG_FILE}"
  echo

  install_base_tools
  clone_or_update_project
  run_manager
}

main
