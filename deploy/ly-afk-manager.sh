#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="ly-afk-dashboard"
REPO_URL="${REPO_URL:-https://github.com/bykedie/LY-.git}"
BRANCH="${BRANCH:-main}"
ARCHIVE_URL="${ARCHIVE_URL:-https://github.com/bykedie/LY-/archive/refs/heads/${BRANCH}.tar.gz}"
CDN_PACKAGE_URL="${CDN_PACKAGE_URL:-https://data.jsdelivr.com/v1/package/gh/bykedie/LY-@${BRANCH}/flat}"
CDN_FILE_BASE_URL="${CDN_FILE_BASE_URL:-https://cdn.jsdelivr.net/gh/bykedie/LY-@${BRANCH}}"
PUBLIC_IP_CACHE=""
PRIVATE_IP_CACHE=""
PAUSE_AFTER_STEP=1

BLUE="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

cd "$PROJECT_DIR"

extract_ipv4() {
  local raw="$1"
  printf '%s' "$raw" | grep -Eo '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -n 1 || true
}

detect_public_ip() {
  if [[ -n "$PUBLIC_IP_CACHE" ]]; then
    echo "$PUBLIC_IP_CACHE"
    return 0
  fi

  if [[ -n "${PUBLIC_IP:-}" ]]; then
    PUBLIC_IP_CACHE="$(extract_ipv4 "$PUBLIC_IP")"
  fi

  if [[ -z "$PUBLIC_IP_CACHE" ]] && command -v curl >/dev/null 2>&1; then
    local url raw ip
    for url in \
      "https://api.ipify.org" \
      "https://ifconfig.me/ip" \
      "https://icanhazip.com" \
      "https://ident.me" \
      "https://myip.ipip.net" \
      "http://100.100.100.200/latest/meta-data/eipv4" \
      "http://100.100.100.200/latest/meta-data/public-ipv4" \
      "http://metadata.tencentyun.com/latest/meta-data/public-ipv4" \
      "http://169.254.169.254/latest/meta-data/public-ipv4"
    do
      raw="$(curl -4fsSL --noproxy '*' --connect-timeout 2 --max-time 5 "$url" 2>/dev/null || true)"
      ip="$(extract_ipv4 "$raw")"
      if [[ -n "$ip" ]]; then
        PUBLIC_IP_CACHE="$ip"
        break
      fi
    done
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
  echo "LY 挂机控制台一键管理脚本  v1.0.10"
  echo "快捷打开面板：j"
  echo "--------------------------------"
  echo "适配系统：Ubuntu 24.04"
  echo "当前公网 IP：${current_public_ip}"
  echo "当前私有 IP：${current_private_ip}"
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

progress() {
  printf "${BLUE}[%s]${RESET} %s\n" "$1" "$2"
}

read_with_note() {
  local var_name="$1"
  local prompt_text="$2"
  local note_text="$3"
  local example_text="$4"
  local default_text="$5"

  echo
  echo "说明：${note_text}"
  echo "示例：${example_text}"
  read -r -p "${prompt_text} [${default_text}]：" "$var_name"
}

set_env_value() {
  local key="$1"
  local value="$2"
  local tmp_file
  tmp_file="$(mktemp)"
  if [[ -f .env ]] && grep -q "^${key}=" .env; then
    awk -v key="$key" -v value="$value" 'BEGIN { prefix=key "=" } index($0, prefix) == 1 { print key "=" value; next } { print }' .env > "$tmp_file"
  else
    if [[ -f .env ]]; then
      cat .env > "$tmp_file"
    fi
    echo "${key}=${value}" >> "$tmp_file"
  fi
  mv "$tmp_file" .env
  chmod 600 .env
}

download_file() {
  local url="$1"
  local output="$2"
  local label="${3:-下载文件}"
  local timeout_seconds="${4:-300}"
  local elapsed=0
  local percent fill empty bar curl_pid exit_code

  echo "+ curl -fL ${url} -o ${output}"
  curl -fL --connect-timeout 15 --max-time "$timeout_seconds" --retry 2 --retry-delay 3 "$url" -o "$output" &
  curl_pid="$!"

  while kill -0 "$curl_pid" 2>/dev/null; do
    if [[ "$elapsed" -ge "$timeout_seconds" ]]; then
      kill "$curl_pid" 2>/dev/null || true
      wait "$curl_pid" 2>/dev/null || true
      printf "\r%s [##########] 超时\n" "$label"
      return 124
    fi

    percent=$((elapsed * 90 / timeout_seconds))
    if [[ "$percent" -lt 5 ]]; then
      percent=5
    fi
    fill=$((percent / 10))
    empty=$((10 - fill))
    bar="$(printf '%*s' "$fill" '' | tr ' ' '#')$(printf '%*s' "$empty" '' | tr ' ' '-')"
    printf "\r%s [%s] %s%%" "$label" "$bar" "$percent"
    sleep 1
    elapsed=$((elapsed + 1))
  done

  if wait "$curl_pid"; then
    printf "\r%s [##########] 100%%\n" "$label"
    return 0
  else
    exit_code="$?"
    printf "\r%s [##########] 失败\n" "$label"
    return "$exit_code"
  fi
}

download_project_from_cdn() {
  local target_dir="$1"
  local timeout_seconds="${2:-300}"
  echo "+ python3 jsDelivr sync ${CDN_PACKAGE_URL}"
  python3 - "$CDN_PACKAGE_URL" "$CDN_FILE_BASE_URL" "$target_dir" "$timeout_seconds" <<'PY'
import json
import os
import sys
import time
import urllib.request

package_url, file_base_url, target_dir, timeout_text = sys.argv[1:5]
timeout = int(timeout_text)
started = time.time()

def fetch(url):
    with urllib.request.urlopen(url, timeout=20) as response:
        return response.read()

def check_timeout():
    if time.time() - started > timeout:
        raise TimeoutError('下载项目文件超时')

print('正在读取 jsDelivr 项目文件列表...')
data = json.loads(fetch(package_url).decode('utf-8'))
files = []

def collect(entries, prefix=''):
    for item in entries or []:
        name = item.get('name', '')
        item_type = item.get('type')
        if item_type == 'directory':
            collect(item.get('files', []), prefix + name.rstrip('/') + '/')
        elif item_type == 'file' or 'files' not in item:
            files.append(prefix + name.lstrip('/'))

collect(data.get('files', []))
files = [name for name in files if name]
if not files:
    raise RuntimeError('jsDelivr 没有返回项目文件列表')

total = len(files)
for index, name in enumerate(files, 1):
    check_timeout()
    relative = name.lstrip('/')
    url = file_base_url.rstrip('/') + '/' + relative
    output = os.path.join(target_dir, relative)
    os.makedirs(os.path.dirname(output), exist_ok=True)
    for attempt in range(1, 4):
        try:
            content = fetch(url)
            with open(output, 'wb') as handle:
                handle.write(content)
            break
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2)
    percent = index * 100 // total
    print(f'下载项目文件 [{index}/{total}] {percent}% {relative}')
print('jsDelivr 项目文件同步完成。')
PY
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

get_env_value() {
  local key="$1"
  grep -E "^${key}=" .env 2>/dev/null | cut -d= -f2- || true
}

show_current_access_config() {
  local port host domain user password public_ip
  echo "当前访问配置"
  echo "--------------------------------"
  if [[ ! -f .env ]]; then
    echo ".env 不存在，请先执行 2 或 3 生成面板配置。"
    return 0
  fi
  port="$(get_env_value DASHBOARD_PORT)"
  host="$(get_env_value DASHBOARD_HOST)"
  domain="$(get_env_value DASHBOARD_DOMAIN)"
  user="$(get_env_value DASHBOARD_USER)"
  password="$(get_env_value DASHBOARD_PASSWORD)"
  port="${port:-30123}"
  host="${host:-127.0.0.1}"
  user="${user:-admin}"
  public_ip="$(detect_public_ip)"

  if [[ -n "$domain" ]]; then
    echo "域名访问：http://${domain}"
    echo "HTTPS 访问：https://${domain}"
  fi
  if [[ "$host" == "0.0.0.0" ]]; then
    echo "公网直连：http://${public_ip}:${port}"
  else
    echo "本机监听：http://127.0.0.1:${port}"
    if [[ -z "$domain" ]]; then
      echo "公网访问：未配置域名反代；如需公网端口直连，请把 DASHBOARD_HOST 设置为 0.0.0.0 并放行端口。"
    fi
  fi
  echo "登录用户名：${user}"
  if [[ -n "$password" ]]; then
    echo "登录密码：${password}"
  else
    echo "登录密码：未设置"
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
  show_current_access_config
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
  $SUDO apt install -y curl ca-certificates git python3 build-essential nginx ufw
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
  local port host user password domain access_mode

  echo "下面配置的是网页控制台本身，不是 Minecraft 服务器地址。"
  echo "Minecraft 服务器地址后面请在网页控制台的“服务器配置”里填写。"

  read_with_note port "面板端口" "网页控制台在服务器本机监听的端口。Nginx 域名反代和公网直连都会转到这个端口。" "30123；访问地址可能是 http://当前公网IP:30123" "30123"
  port="${port:-30123}"

  echo
  echo "访问方式选择："
  echo "1. 仅域名访问：推荐。监听 127.0.0.1，只能通过 Nginx/域名访问，30123 不直接暴露公网。"
  echo "2. 仅公网端口访问：监听 0.0.0.0，可用 http://当前公网IP:${port} 访问。"
  echo "3. 域名 + 公网端口共存：监听 0.0.0.0，同时可配置域名反代和 IP:${port} 直连。"
  read -r -p "请选择访问方式 [1]：" access_mode
  access_mode="${access_mode:-1}"
  case "$access_mode" in
    2|3) host="0.0.0.0" ;;
    *) host="127.0.0.1" ;;
  esac
  echo "已设置监听地址 DASHBOARD_HOST=${host}"
  echo "说明：127.0.0.1 表示只允许服务器本机访问，适合域名反代；0.0.0.0 表示允许公网端口直连。"

  read_with_note user "登录用户名" "打开网页控制台时浏览器弹窗里的用户名。" "admin 或 lyadmin" "admin"
  user="${user:-admin}"
  echo
  echo "说明：打开网页控制台时浏览器弹窗里的密码。公网部署必须设置强密码。"
  echo "示例：Ly_2026_Change_Me_123"
  read -r -s -p "登录密码 [留空自动生成]：" password
  echo
  if [[ -z "$password" ]]; then
    password="$(tr -dc A-Za-z0-9 </dev/urandom | head -c 24 || true)"
    if [[ -z "$password" ]]; then
      password="ChangeMe$(date +%s)"
    fi
    warn "已自动生成密码：${password}"
  fi

  read_with_note domain "控制台域名，可留空" "你购买的域名解析到当前公网 IP 后，可在这里填写完整子域名。留空也可以先用 IP 或稍后菜单 8 配置。" "bot.example.com 或 ly.example.com" "留空"
  if [[ "$domain" == "留空" ]]; then
    domain=""
  fi

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
  echo "访问方式：${access_mode}"
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
  npm install --omit=dev
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
  local SUDO port
  SUDO="$(need_sudo)"
  port="$(grep -E '^DASHBOARD_PORT=' .env 2>/dev/null | cut -d= -f2 || echo 30123)"
  $SUDO ufw allow OpenSSH
  $SUDO ufw allow 80/tcp
  $SUDO ufw allow 443/tcp
  echo "说明：80/443 用于域名访问，${port}/TCP 用于公网 IP 直连访问。"
  echo "这两种方式可以共存；如果同时开启，请确保面板密码足够强。"
  read -r -p "是否放行 ${port}/TCP 直连端口？[y/N]：" open_panel_port
  if [[ "${open_panel_port,,}" == "y" ]]; then
    local current_host
    current_host="$(grep -E '^DASHBOARD_HOST=' .env 2>/dev/null | cut -d= -f2 || echo 127.0.0.1)"
    if [[ "$current_host" != "0.0.0.0" ]]; then
      warn "公网端口直连需要 DASHBOARD_HOST=0.0.0.0，脚本将自动修改并重启控制台。"
      set_env_value "DASHBOARD_HOST" "0.0.0.0"
      if pm2 describe "$SERVICE_NAME" >/dev/null 2>&1; then
        pm2 restart "$SERVICE_NAME" --update-env
      fi
    fi
    $SUDO ufw allow "${port}/tcp"
  fi
  $SUDO ufw --force enable
  $SUDO ufw status
  pause
}

configure_nginx() {
  print_header
  echo "配置 Nginx 域名反向代理"
  echo "--------------------------------"
  local domain port saved_domain
  port="$(grep -E '^DASHBOARD_PORT=' .env 2>/dev/null | cut -d= -f2 || echo 30123)"
  saved_domain="$(grep -E '^DASHBOARD_DOMAIN=' .env 2>/dev/null | cut -d= -f2 || true)"
  echo "说明：这里配置的是网页控制台域名，不是 Minecraft 服务器地址。"
  echo "示例：bot.example.com，需要先在 DNS 后台把 A 记录指向当前公网 IP：$(detect_public_ip)"
  read -r -p "请输入你的控制台域名 [${saved_domain:-bot.example.com}]：" domain
  domain="${domain:-$saved_domain}"
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
    proxy_pass http://127.0.0.1:${port};
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

configure_access_methods() {
  print_header
  echo "配置访问方式"
  echo "--------------------------------"
  local open_port setup_domain setup_https domain current_port current_host
  current_port="$(grep -E '^DASHBOARD_PORT=' .env 2>/dev/null | cut -d= -f2 || echo 30123)"
  current_host="$(grep -E '^DASHBOARD_HOST=' .env 2>/dev/null | cut -d= -f2 || echo 127.0.0.1)"
  domain="$(grep -E '^DASHBOARD_DOMAIN=' .env 2>/dev/null | cut -d= -f2 || true)"

  echo "说明：公网端口访问和域名访问可以共存。"
  echo "公网端口访问示例：http://$(detect_public_ip):${current_port}"
  echo "域名访问示例：http://${domain:-bot.example.com}"
  echo
  echo "如果要公网端口访问，请确认 .env 里的 DASHBOARD_HOST 是 0.0.0.0。"
  echo "如果只用域名访问，DASHBOARD_HOST 保持 127.0.0.1 更合适。"
  echo

  read -r -p "是否开放 ${current_port}/TCP 公网端口直连？[y/N]：" open_port
  if [[ "${open_port,,}" == "y" ]]; then
    if [[ "$current_host" != "0.0.0.0" ]]; then
      warn "公网端口直连需要 DASHBOARD_HOST=0.0.0.0，脚本将自动修改并重启控制台。"
      set_env_value "DASHBOARD_HOST" "0.0.0.0"
      if pm2 describe "$SERVICE_NAME" >/dev/null 2>&1; then
        pm2 restart "$SERVICE_NAME" --update-env
      fi
    fi
    configure_firewall
  else
    echo "跳过公网端口直连，仅保留 SSH/80/443 等基础端口。"
  fi

  read -r -p "是否现在配置域名访问 Nginx 反代？[y/N]：" setup_domain
  if [[ "${setup_domain,,}" == "y" ]]; then
    configure_nginx
    read -r -p "是否继续申请 HTTPS 证书？[y/N]：" setup_https
    if [[ "${setup_https,,}" == "y" ]]; then
      enable_https
    fi
  fi
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
  local SUDO tmp_dir archive_file extracted_dir backup_dir parent_dir current_name
  SUDO="$(need_sudo)"
  echo "当前正在更新 LY 控制台，请不要关闭 SSH 窗口。"
  echo "更新过程中会保留 .env、bot.config.json、accounts.json 等运行配置。"
  echo
  if [[ -d .git ]]; then
    progress "1/5" "当前正在连接 GitHub 仓库并下载更新..."
    git fetch --progress origin "$BRANCH"
    info "远程更新下载完成。"
    progress "2/5" "当前正在合并最新代码..."
    git merge --ff-only "origin/${BRANCH}"
    info "代码合并完成。"
  else
    progress "1/5" "当前不是 Git 仓库，正在使用压缩包方式下载最新代码..."
    tmp_dir="$(mktemp -d)"
    archive_file="${tmp_dir}/ly-console.tar.gz"
    if download_file "$ARCHIVE_URL" "$archive_file" "下载项目压缩包" 300; then
      info "压缩包下载完成，当前正在解压。"
      tar -xzf "$archive_file" -C "$tmp_dir"
      extracted_dir="$(find "$tmp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
      if [[ -z "$extracted_dir" ]]; then
        fail "压缩包已下载，但没有找到解压后的项目目录。"
        rm -rf "$tmp_dir"
        pause
        return
      fi
    else
      warn "GitHub 压缩包下载失败，正在改用 jsDelivr 逐文件同步最新项目代码。"
      extracted_dir="${tmp_dir}/project"
      mkdir -p "$extracted_dir"
      download_project_from_cdn "$extracted_dir" 300
    fi
    progress "2/5" "当前正在备份旧项目并替换为新代码..."
    parent_dir="$(dirname "$PROJECT_DIR")"
    current_name="$(basename "$PROJECT_DIR")"
    backup_dir="${parent_dir}/${current_name}.backup.$(date +%Y%m%d%H%M%S)"
    cd "$parent_dir"
    $SUDO mv "$PROJECT_DIR" "$backup_dir"
    $SUDO mv "$extracted_dir" "$PROJECT_DIR"
    for runtime_file in .env bot.config.json accounts.json bot.config.profiles; do
      if [[ -f "${backup_dir}/${runtime_file}" ]]; then
        $SUDO cp "${backup_dir}/${runtime_file}" "${PROJECT_DIR}/${runtime_file}"
      fi
      if [[ -d "${backup_dir}/${runtime_file}" ]]; then
        $SUDO cp -a "${backup_dir}/${runtime_file}" "${PROJECT_DIR}/${runtime_file}"
      fi
    done
    rm -rf "$tmp_dir"
    cd "$PROJECT_DIR"
    echo "旧项目已备份到：${backup_dir}"
    info "代码替换完成。"
  fi
  progress "3/5" "当前正在安装/更新 npm 依赖..."
  npm install --progress=true
  info "npm 依赖安装完成。"
  progress "4/5" "当前正在安装/修复快捷命令 j..."
  install_j_shortcut
  info "快捷命令 j 已处理完成。"
  progress "5/5" "当前正在重启 LY 控制台服务..."
  if pm2 describe "$SERVICE_NAME" >/dev/null 2>&1; then
    pm2 restart "$SERVICE_NAME" --update-env
  else
    pm2 start src/dashboard.js --name "$SERVICE_NAME"
  fi
  pm2 save
  info "控制台服务已重启。"
  info "更新流程已结束，可以刷新网页控制台或重新输入 j 查看菜单。"
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
  configure_access_methods
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
