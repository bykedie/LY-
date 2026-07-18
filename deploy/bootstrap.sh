#!/usr/bin/env bash

set -Eeuo pipefail

# 这个脚本用于“第一次部署”：
# 1. 在 Ubuntu 服务器上安装 git / curl 等基础工具
# 2. 从 GitHub 拉取 LY 控制台项目
# 3. 进入项目目录并启动一键管理菜单

# 你的 GitHub 仓库地址。
# 推送到真实仓库后，可以把这里改成你的最终地址。
# 也可以运行时覆盖，例如：
# REPO_URL=https://github.com/你的用户名/LY控制台.git bash deploy/bootstrap.sh
REPO_URL="${REPO_URL:-https://github.com/你的GitHub用户名/LY控制台.git}"

# 项目安装目录。
# 推荐放到 /opt/ly-console，便于后续用 pm2 / nginx 管理。
INSTALL_DIR="${INSTALL_DIR:-/opt/ly-console}"

# 默认分支。
# 如果你的 GitHub 仓库默认分支是 master，可以运行时加：
# BRANCH=master bash deploy/bootstrap.sh
BRANCH="${BRANCH:-main}"

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
  printf "${RED}[错误]${RESET} %s\n" "$1"
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
  $SUDO apt update
  $SUDO apt install -y git curl ca-certificates
}

clone_or_update_project() {
  local SUDO
  SUDO="$(need_sudo)"

  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    warn "检测到项目已存在，开始更新：${INSTALL_DIR}"
    git -C "$INSTALL_DIR" fetch origin "$BRANCH"
    git -C "$INSTALL_DIR" checkout "$BRANCH"
    git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
    return
  fi

  if [[ -e "$INSTALL_DIR" ]]; then
    fail "安装目录已存在但不是 Git 仓库：${INSTALL_DIR}"
    echo "请先备份或删除这个目录，或者指定新的 INSTALL_DIR。"
    exit 1
  fi

  $SUDO mkdir -p "$(dirname "$INSTALL_DIR")"
  $SUDO git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
}

run_manager() {
  local SUDO
  SUDO="$(need_sudo)"
  cd "$INSTALL_DIR"
  chmod +x deploy/ly-afk-manager.sh
  info "项目已准备完成，正在打开 LY 控制台一键管理菜单。"
  $SUDO ./deploy/ly-afk-manager.sh
}

main() {
  echo "LY 控制台一键拉取与配置脚本"
  echo "--------------------------------"
  echo "仓库地址：${REPO_URL}"
  echo "安装目录：${INSTALL_DIR}"
  echo "默认分支：${BRANCH}"
  echo

  install_base_tools
  clone_or_update_project
  run_manager
}

main

