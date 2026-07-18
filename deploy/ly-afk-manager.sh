#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="ly-afk-dashboard"
PUBLIC_IP_CACHE=""
PRIVATE_IP_CACHE=""
PAUSE_AFTER_STEP=1

BLUE="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

cd "$PROJECT_DIR"

detect_public_ip() {
  if [[ -n "$PUBLIC_IP_CACHE" ]]; then
    echo "$PUBLIC_IP_CACHE"
    return 0
  fi

  if command -v curl >/dev/null 2>&1; then
    PUBLIC_IP_CACHE="$(curl -fsS --max-time 3 https://api.ipify.org 2>/dev/null || true)"
  fi

  if [[ -z "$PUBLIC_IP_CACHE" ]]; then
    PUBLIC_IP_CACHE="未检测到"
  fi
  echo "$PUBLIC_IP_CACHE"
}

detect_private_ip() {
  if [[ -n "$PRIVATE_IP_CACHE" ]]; then
    echo "$PRIVATE_IP_CACHE"
    return 0
  fi

  PRIVATE_IP_CACHE="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  if [[ -z "$PRIVATE_IP_CACHE" ]] && command -v ip >/dev/null 2>&1; then
    PRIVATE_IP_CACHE="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}' || true)"
  fi

  if [[ -z "$PRIVATE_IP_CACHE" ]]; then
    PRIVATE_IP_CACHE="未检测到"
  fi
  echo "$PRIVATE_IP_CACHE"
}

install_j_shortcut() {
  local SUDO shortcut_file
  SUDO="$(need_sudo)"
  shortcut_file="/usr/local/bin/j"

  $SUDO tee "$shortcut_file" >/dev/null <<EOF
#!/usr/bin/env bash
cd "${PROJECT_DIR}"
if [[ "\${EUID}" -eq 0 ]]; then
  exec ./deploy/ly-afk-manager.sh "\$@"
fi
exec sudo ./deploy/ly-afk-manager.sh "\$@"
EOF
  $SUDO chmod +x "$shortcut_file"
  info "快捷命令已安装：以后在终端输入 j 可直接打开本界面。"
}

ensure_interactive_terminal() {
  if [[ ! -t 0 && ! -r /dev/tty ]]; then
    echo "当前没有可用的交互终端，无法打开菜单。"
    echo "请登录服务器后手动执行："
    echo "cd ${PROJECT_DIR}"
    echo "sudo ./deploy/ly-afk-manager.sh"
    exit 0
  fi
}

print_header() {
  local current_public_ip current_private_ip
  current_public_ip="$(detect_public_ip)"
  current_private_ip="$(detect_private_ip)"
  clear || true
  printf "${BLUE}"
  cat <<'LOGO'
 _      __   __    _    _____ _  __
| |     \ \ / /   / \  |  ___| |/ /
| |      \ V /   / _ \ | |_  | ' / 
| |___    | |   / ___ \|  _| | . \ 
|_____|   |_|  /_/   \_\_|   |_|\_\
LOGO
  printf "${RESET}"
  echo "LY 挂机控制台一键管理脚本  v1.0.0"
  echo "适配系统：Ubuntu 24.04"
  echo "当前公网 IP：${current_public_ip}"
  echo "当前私有 IP：${current_private_ip}"
  echo "快捷命令：j"
  echo "项目目录：${PROJECT_DIR}"
  echo "--------------------------------"
}

pause() {
  if [[ "${PAUSE_AFTER_STEP}" != "1" ]]; then
    return 0
  fi
  echo
  read -r -p "按回车返回菜单..."
}

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

detect_os() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    source /etc/os-release
    echo "${PRETTY_NAME:-Unknown Linux}"
  else
    echo "Unknown Linux"
  fi
}

show_system_info() {
  print_header
  echo "系统信息"
  echo "--------------------------------"
  echo "系统：$(detect_os)"
  echo "当前用户：$(whoami)"
  echo "当前公网 IP：$(detect_public_ip)"
  echo "当前私有 IP：$(detect_private_ip)"
  echo "Node：$(node -v 2>/dev/null || echo '未安装')"
  echo "npm：$(npm -v 2>/dev/null || echo '未安装')"
  echo "pm2：$(pm2 -v 2>/dev/null || echo '未安装')"
  echo
  echo "面板环境变量"
  echo "--------------------------------"
  if [[ -f .env ]]; then
    grep -E '^(DASHBOARD_HOST|DASHBOARD_PORT|DASHBOARD_USER)=' .env || true
    if grep -q '^DASHBOARD_PASSWORD=.\+' .env; then
      echo "DASHBOARD_PASSWORD=已设置"
    else
      echo "DASHBOARD_PASSWORD=未设置"
    fi
  else
    echo ".env 不存在，请先执行 2 或 3。"
  fi
  echo
  pm2 status "$SERVICE_NAME" 2>/dev/null || true
  pause
}

install_runtime() {
  print_header
  echo "安装基础运行环境"
  echo "--------------------------------"
  local SUDO
  SUDO="$(need_sudo)"
  $SUDO apt update
  $SUDO apt install -y curl ca-certificates git build-essential nginx ufw
  if ! command -v node >/dev/null 2>&1; then
    $SUDO apt install -y nodejs npm
  fi
  local node_major
  node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  if [[ "$node_major" -lt 18 ]]; then
    fail "当前 Node.js 版本低于 18，请先升级 Node.js 后再继续。"
    echo "推荐安装 NodeSource 20.x："
    echo "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "sudo apt install -y nodejs"
    pause
    return
  fi
  if ! command -v pm2 >/dev/null 2>&1; then
    $SUDO npm install -g pm2
  fi
  install_j_shortcut
  info "基础环境已准备完成。"
  pause
}

configure_env() {
  print_header
  echo "配置控制台环境变量"
  echo "--------------------------------"
  local port host user password domain
  read -r -p "面板端口 [30123]：" port
  port="${port:-30123}"
  read -r -p "监听地址 [127.0.0.1]：" host
  host="${host:-127.0.0.1}"
  read -r -p "登录用户名 [admin]：" user
  user="${user:-admin}"
  read -r -s -p "登录密码 [留空自动生成]：" password
  echo
  if [[ -z "$password" ]]; then
    password="$(tr -dc A-Za-z0-9 </dev/urandom | head -c 24 || true)"
    if [[ -z "$password" ]]; then
      password="ChangeMe$(date +%s)"
    fi
    warn "已自动生成密码：${password}"
  fi
  read -r -p "控制台域名，可留空，例如 bot.example.com：" domain

  cat > .env <<EOF
DASHBOARD_PORT=${port}
DASHBOARD_HOST=${host}
DASHBOARD_USER=${user}
DASHBOARD_PASSWORD=${password}
EOF

  if [[ -n "$domain" ]]; then
    cat >> .env <<EOF
DASHBOARD_DOMAIN=${domain}
EOF
  fi

  chmod 600 .env
  info ".env 已写入。"
  echo "访问用户名：${user}"
  echo "访问密码：${password}"
  pause
}

install_project_deps() {
  print_header
  echo "安装项目依赖"
  echo "--------------------------------"
  npm install
  info "项目依赖安装完成。"
  pause
}

start_dashboard() {
  print_header
  echo "启动 / 重启 LY 挂机控制台"
  echo "--------------------------------"
  if [[ ! -f .env ]]; then
    warn ".env 不存在，先进入配置流程。"
    configure_env
  fi
  npm install
  if pm2 describe "$SERVICE_NAME" >/dev/null 2>&1; then
    pm2 restart "$SERVICE_NAME" --update-env
  else
    pm2 start src/dashboard.js --name "$SERVICE_NAME"
  fi
  pm2 save
  info "控制台已启动。"
  show_access_hint
  pause
}

stop_dashboard() {
  print_header
  echo "停止控制台"
  echo "--------------------------------"
  if pm2 describe "$SERVICE_NAME" >/dev/null 2>&1; then
    pm2 stop "$SERVICE_NAME"
    info "控制台已停止。"
  else
    warn "没有找到正在运行的 ${SERVICE_NAME}。"
  fi
  pause
}

restart_dashboard() {
  print_header
  echo "重启控制台"
  echo "--------------------------------"
  if pm2 describe "$SERVICE_NAME" >/dev/null 2>&1; then
    pm2 restart "$SERVICE_NAME" --update-env
  else
    pm2 start src/dashboard.js --name "$SERVICE_NAME"
  fi
  pm2 save
  info "控制台已重启。"
  show_access_hint
  pause
}

show_logs() {
  print_header
  echo "实时日志"
  echo "--------------------------------"
  echo "按 Ctrl+C 退出日志查看。"
  sleep 1
  pm2 logs "$SERVICE_NAME"
}

configure_firewall() {
  print_header
  echo "配置 Ubuntu 防火墙"
  echo "--------------------------------"
  local SUDO
  SUDO="$(need_sudo)"
  $SUDO ufw allow OpenSSH
  $SUDO ufw allow 80/tcp
  $SUDO ufw allow 443/tcp
  warn "如果你使用 Nginx/Caddy 域名反代，不建议把 30123 直接暴露到公网。"
  read -r -p "是否放行 30123/TCP 直连端口？[y/N]：" open_panel_port
  if [[ "${open_panel_port,,}" == "y" ]]; then
    $SUDO ufw allow 30123/tcp
  fi
  $SUDO ufw --force enable
  $SUDO ufw status
  pause
}

configure_nginx() {
  print_header
  echo "配置 Nginx 域名反向代理"
  echo "--------------------------------"
  local domain
  read -r -p "请输入你的控制台域名，例如 bot.example.com：" domain
  if [[ -z "$domain" ]]; then
    fail "域名不能为空。"
    pause
    return
  fi

  local SUDO
  SUDO="$(need_sudo)"
  $SUDO apt update
  $SUDO apt install -y nginx

  local nginx_file="/etc/nginx/sites-available/ly-afk-dashboard"
  $SUDO tee "$nginx_file" >/dev/null <<EOF
server {
  listen 80;
  server_name ${domain};

  location / {
    proxy_pass http://127.0.0.1:30123;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
  $SUDO ln -sf "$nginx_file" /etc/nginx/sites-enabled/ly-afk-dashboard
  $SUDO nginx -t
  $SUDO systemctl reload nginx
  info "Nginx 已配置完成。"
  echo "请确认 DNS A 记录已指向 $(detect_public_ip)。"
  echo "现在可以先访问：http://${domain}"
  pause
}

enable_https() {
  print_header
  echo "申请 HTTPS 证书"
  echo "--------------------------------"
  local domain
  read -r -p "请输入已经解析到 $(detect_public_ip) 的域名：" domain
  if [[ -z "$domain" ]]; then
    fail "域名不能为空。"
    pause
    return
  fi
  local SUDO
  SUDO="$(need_sudo)"
  $SUDO apt update
  $SUDO apt install -y certbot python3-certbot-nginx
  $SUDO certbot --nginx -d "$domain"
  info "HTTPS 配置流程已结束。"
  pause
}

health_check() {
  print_header
  echo "运行状态检查"
  echo "--------------------------------"
  pm2 status "$SERVICE_NAME" 2>/dev/null || true
  echo
  local port host user password curl_auth
  port="$(grep -E '^DASHBOARD_PORT=' .env 2>/dev/null | cut -d= -f2 || echo 30123)"
  user="$(grep -E '^DASHBOARD_USER=' .env 2>/dev/null | cut -d= -f2 || echo admin)"
  password="$(grep -E '^DASHBOARD_PASSWORD=' .env 2>/dev/null | cut -d= -f2- || true)"
  host="127.0.0.1"
  echo "本机检测：http://${host}:${port}/api/status"
  if command -v curl >/dev/null 2>&1; then
    curl_auth=()
    if [[ -n "$password" ]]; then
      curl_auth=(-u "${user}:${password}")
    fi
    curl -i --max-time 5 "${curl_auth[@]}" "http://${host}:${port}/api/status" || true
  else
    warn "curl 未安装，无法发起 HTTP 检测。"
  fi
  pause
}

update_project() {
  print_header
  echo "更新项目并重启"
  echo "--------------------------------"
  if [[ -d .git ]]; then
    git pull
  else
    warn "当前目录不是 Git 仓库，跳过 git pull。"
  fi
  npm install
  if pm2 describe "$SERVICE_NAME" >/dev/null 2>&1; then
    pm2 restart "$SERVICE_NAME" --update-env
  fi
  info "更新流程已结束。"
  pause
}

show_access_hint() {
  local port host domain
  port="$(grep -E '^DASHBOARD_PORT=' .env 2>/dev/null | cut -d= -f2 || echo 30123)"
  host="$(grep -E '^DASHBOARD_HOST=' .env 2>/dev/null | cut -d= -f2 || echo 127.0.0.1)"
  domain="$(grep -E '^DASHBOARD_DOMAIN=' .env 2>/dev/null | cut -d= -f2 || true)"
  echo
  echo "访问提示"
  echo "--------------------------------"
  if [[ -n "$domain" ]]; then
    echo "推荐访问：http://${domain}"
    echo "配置 HTTPS 后访问：https://${domain}"
  elif [[ "$host" == "0.0.0.0" ]]; then
    echo "直连访问：http://$(detect_public_ip):${port}"
  else
    echo "当前仅监听本机：http://127.0.0.1:${port}"
    echo "如需域名访问，请执行菜单 8 配置 Nginx。"
  fi
}

quick_install() {
  PAUSE_AFTER_STEP=0
  install_runtime
  configure_env
  install_project_deps
  start_dashboard
  PAUSE_AFTER_STEP=1
  echo
  info "一键安装流程已完成。"
  pause
}

main_menu() {
  ensure_interactive_terminal
  while true; do
    print_header
    echo "1.  系统信息查询"
    echo "2.  一键安装环境 + 配置 + 启动"
    echo "3.  配置 .env 面板账号/密码/端口"
    echo "4.  安装项目依赖"
    echo "5.  启动控制台"
    echo "6.  停止控制台"
    echo "7.  重启控制台"
    echo "8.  配置 Nginx 域名反代"
    echo "9.  申请 HTTPS 证书"
    echo "10. 配置 Ubuntu 防火墙"
    echo "11. 查看运行状态"
    echo "12. 查看实时日志"
    echo "13. 更新项目并重启"
    echo "14. 安装/修复快捷命令 j"
    echo
    echo "0.  退出脚本"
    echo "--------------------------------"
    read -r -p "请输入你的选择：" choice
    case "$choice" in
      1) show_system_info ;;
      2) quick_install ;;
      3) configure_env ;;
      4) install_project_deps ;;
      5) start_dashboard ;;
      6) stop_dashboard ;;
      7) restart_dashboard ;;
      8) configure_nginx ;;
      9) enable_https ;;
      10) configure_firewall ;;
      11) health_check ;;
      12) show_logs ;;
      13) update_project ;;
      14) install_j_shortcut; pause ;;
      0) exit 0 ;;
      *) warn "无效选择，请重新输入。"; sleep 1 ;;
    esac
  done
}

main_menu
