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
LOG_FILE="${LOG_FILE:-/tmp/ly-console-bootstrap.log}"
export DEBIAN_FRONTEND="${DEBIAN_FRONTEND:-noninteractive}"

GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
BLUE="\033[36m"
RESET="\033[0m"

exec > >(tee -a "$LOG_FILE") 2>&1

on_error() {
  local line="$1"
  local code="$2"
  fail "脚本在第 ${line} 行失败，退出码：${code}"
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
  echo "+ $*"
  "$@"
}

need_sudo() {
  if [[ "${EUID}" -eq 0 ]]; then
    echo ""
  else
    echo "sudo"
  fi
}

install_base_tools() {
  local SUDO
  SUDO="$(need_sudo)"
  step "1/5" "检查并安装基础工具：git / curl / ca-certificates"
  run $SUDO apt update
  run $SUDO apt install -y git curl ca-certificates
  info "基础工具已准备完成。"
}

check_repo_access() {
  step "2/5" "检查 GitHub 仓库是否可以访问"
  echo "仓库地址：${REPO_URL}"
  echo "目标分支：${BRANCH}"
  if git ls-remote --exit-code --heads "$REPO_URL" "$BRANCH" >/dev/null 2>&1; then
    info "仓库和分支可以访问。"
  else
    fail "无法访问仓库分支：${REPO_URL} ${BRANCH}"
    echo "请确认仓库是公开仓库，或者服务器已配置 GitHub 私有仓库凭据。"
    echo "也可以手动测试：git ls-remote --heads ${REPO_URL} ${BRANCH}"
    exit 1
  fi
}

clone_or_update_project() {
  local SUDO
  SUDO="$(need_sudo)"
  step "3/5" "拉取或更新项目代码"

  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    warn "检测到项目已存在，开始更新：${INSTALL_DIR}"
    run $SUDO git -C "$INSTALL_DIR" fetch origin "$BRANCH"
    run $SUDO git -C "$INSTALL_DIR" checkout "$BRANCH"
    run $SUDO git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
    return
  fi

  if [[ -e "$INSTALL_DIR" ]]; then
    fail "安装目录已存在但不是 Git 仓库：${INSTALL_DIR}"
    echo "请先备份或删除这个目录，或者指定新的 INSTALL_DIR。"
    exit 1
  fi

  run $SUDO mkdir -p "$(dirname "$INSTALL_DIR")"
  run $SUDO git clone --progress --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  info "项目代码已拉取到：${INSTALL_DIR}"
}

run_manager() {
  local SUDO
  SUDO="$(need_sudo)"
  step "4/5" "准备一键管理脚本"
  cd "$INSTALL_DIR"
  run $SUDO chmod +x deploy/ly-afk-manager.sh
  info "项目已准备完成，正在打开 LY 控制台一键管理菜单。"
  step "5/5" "进入菜单，请根据提示选择功能"
  run $SUDO ./deploy/ly-afk-manager.sh
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
  check_repo_access
  clone_or_update_project
  run_manager
}

main
