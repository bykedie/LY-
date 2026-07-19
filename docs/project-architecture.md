# LY控制台项目结构与交接文档

这份文档用于交接、二次开发和线上排查。项目主要由两部分组成：

```text
网页控制台：src/dashboard.js + public/*
Minecraft 执行端：src/index.js
```

用户在浏览器里修改配置，控制台保存到 `bot.config.json`，再由控制台启动 `src/index.js` 执行挂机逻辑。

## 一、目录结构

```text
LY控制台
├─ src/
│  ├─ dashboard.js                # Web 控制台后端：静态页面、配置 API、启动/停止机器人、日志转发、Basic Auth
│  └─ index.js                    # Minecraft 执行端：读取配置、批量登录、自动功能逻辑
├─ public/
│  ├─ index.html                  # 控制台页面结构
│  ├─ app.js                      # 控制台前端交互：导航、表单、保存配置、启动/停止、设置中心
│  ├─ styles.css                  # 控制台样式：侧边栏、布局、响应式、主题细节
│  └─ log-renderer.js             # Minecraft 颜色代码日志渲染
├─ deploy/
│  ├─ bootstrap.sh                # 首次部署脚本：安装基础工具、拉取仓库、打开管理菜单
│  └─ ly-afk-manager.sh           # Ubuntu 菜单脚本：安装、配置、启动、Nginx、HTTPS、日志、更新
├─ docs/
│  ├─ ubuntu-24.04-deploy.md      # Ubuntu 24.04 轻量云部署教程
│  └─ project-architecture.md     # 当前交接文档
├─ scripts/
│  ├─ smoke-test.js               # 控制台核心 API 和页面流程测试
│  ├─ dashboard-auth-test.js      # 控制台 Basic Auth 测试
│  ├─ dashboard-protocol-test.js  # 控制台启动执行端后的协议通路测试
│  └─ *-integration-test.js       # 自动登录、钓鱼、重生、移动等集成测试
├─ bot.config.example.json        # 控制台默认配置模板
├─ accounts.example.json          # 独立账号文件示例
├─ .env.example                   # 线上环境变量示例
├─ package.json                   # npm 脚本和依赖
└─ README.md                      # 项目入口说明
```

不会提交到 GitHub 的运行时文件：

```text
.env                 # 面板账号、密码、端口等环境变量
bot.config.json      # 控制台保存的真实配置
accounts.json        # 可选的真实账号列表
node_modules/        # npm 依赖
```

这些文件已在 `.gitignore` 中排除。

## 二、启动链路

本地开发：

```bash
npm run dashboard
```

后端入口：

```text
src/dashboard.js
```

默认监听：

```text
http://127.0.0.1:30123
```

线上推荐用 Nginx 反向代理：

```text
浏览器
  -> https://bot.你的域名.com
  -> Nginx
  -> http://127.0.0.1:30123
  -> src/dashboard.js
```

当用户在网页点击“启动”时：

```text
public/app.js
  -> POST /api/start
  -> src/dashboard.js
  -> spawn node src/index.js
  -> src/index.js 连接 Minecraft 服务器
```

停止流程：

```text
public/app.js
  -> POST /api/stop
  -> src/dashboard.js
  -> 结束当前机器人进程
```

日志流程：

```text
src/index.js stdout/stderr
  -> src/dashboard.js 收集
  -> GET /api/status
  -> public/app.js
  -> public/log-renderer.js 渲染 MC 颜色日志
```

## 三、配置流转

默认配置：

```text
bot.config.example.json
```

真实配置：

```text
bot.config.json
```

控制台后端逻辑：

```text
src/dashboard.js
  readConfig()      # 不存在真实配置时读取 example
  saveConfig()      # 保存前合并默认值并校验
  resetConfig()     # 重置为默认配置
  validateConfig()  # 校验服务器、账号和功能配置
```

执行端逻辑：

```text
src/index.js
  loadRuntimeConfig()
  loadAccounts()
  createBot()
  attachAutoLogin()
  attachCombat()
  attachFishing()
  attachMovement()
  attachChat()
  attachLobby()
  attachScheduler()
```

环境变量：

```text
DASHBOARD_PORT       # 面板端口，默认 30123
DASHBOARD_HOST       # 监听地址，线上反代推荐 127.0.0.1
DASHBOARD_USER       # Basic Auth 用户名，默认 admin
DASHBOARD_PASSWORD   # Basic Auth 密码，公网部署必须填写
BOT_CONFIG_PATH      # 可选，指定真实配置文件路径
```

## 四、前端结构

前端没有使用构建工具，浏览器直接加载静态文件：

```text
public/index.html
public/styles.css
public/app.js
public/log-renderer.js
```

主要 UI 区域在 `public/app.js` 中维护：

```text
sections             # 左侧导航分区
state.config         # 当前配置
state.status         # 后端运行状态
state.uiSettings     # 设置中心保存的界面偏好
render()             # 页面总渲染入口
renderConfig()       # 服务器配置页
renderAccounts()     # 批量账号页
renderSettings()     # 设置中心
```

设置中心数据保存在浏览器 `localStorage`，只影响当前浏览器看到的 UI 名称、导航位置、提示文案等，不会改变服务器端运行配置。

## 五、部署脚本结构

首次部署命令：

```bash
tmp=/tmp/ly-console-bootstrap.sh; err=/tmp/ly-console-bootstrap-download.err; urls=("https://raw.githubusercontent.com/bykedie/LY-/main/deploy/bootstrap.sh?cache=$(date +%s)" "https://cdn.jsdelivr.net/gh/bykedie/LY-@main/deploy/bootstrap.sh?cache=$(date +%s)"); echo "[0/5] 下载启动脚本"; ok=0; for url in "${urls[@]}"; do echo "下载源：$url"; rm -f "$tmp" "$err"; curl -fL --connect-timeout 10 --max-time 90 --retry 1 --retry-delay 2 "$url" -o "$tmp" >"$err" 2>&1 & pid=$!; i=0; while kill -0 "$pid" 2>/dev/null; do p=$((i * 6 + 5)); [ "$p" -gt 95 ] && p=95; f=$((p / 10)); e=$((10 - f)); bar="$(printf "%${f}s" | tr " " "#")$(printf "%${e}s" | tr " " "-")"; printf "\r下载启动脚本 [%s] %s%%，仍在下载..." "$bar" "$p"; sleep 1; i=$((i + 1)); done; if wait "$pid"; then printf "\r下载启动脚本 [##########] 100%%，下载完成。        \n"; ok=1; break; else code=$?; printf "\n当前下载源失败，退出码：%s\n" "$code"; sed -n "1,5p" "$err" 2>/dev/null || true; echo "尝试备用源。"; fi; done; if [ "$ok" = "1" ]; then sudo bash "$tmp"; else echo "[错误] 启动脚本下载失败，请检查服务器网络或稍后重试。"; exit 1; fi
```

`deploy/bootstrap.sh` 负责：

```text
1. 打印状态和日志路径
2. 安装 git / curl / ca-certificates
3. 检查 GitHub 仓库和分支是否可访问
4. 克隆或更新项目到 /opt/ly-console
5. 打开 deploy/ly-afk-manager.sh 菜单
```

安装日志：

```text
/tmp/ly-console-bootstrap.log
```

菜单脚本：

```text
deploy/ly-afk-manager.sh
```

它负责：

```text
安装 Node.js / npm / nginx / ufw / pm2
安装或修复快捷命令 j
生成 .env
安装 npm 依赖
pm2 后台启动控制台
配置 Nginx 域名反向代理
申请 HTTPS 证书
查看状态和日志
带进度更新项目并重启
```

快捷命令安装后位于：

```text
/usr/local/bin/j
```

以后 SSH 登录服务器后，直接输入 `j` 即可进入 `deploy/ly-afk-manager.sh` 管理菜单。

更新逻辑：

```text
Git 安装：菜单 13 使用 git fetch --progress + ff-only merge 更新。
压缩包安装：菜单 13 下载 GitHub 分支压缩包更新，并保留 .env / bot.config.json / accounts.json。
```

## 六、常见开发位置

修改侧边栏导航：

```text
public/app.js
public/styles.css
```

修改服务器配置字段说明：

```text
public/app.js
bot.config.example.json
```

修改后端 API：

```text
src/dashboard.js
scripts/smoke-test.js
scripts/dashboard-auth-test.js
```

修改 Minecraft 自动功能：

```text
src/index.js
scripts/*-integration-test.js
```

修改部署流程：

```text
deploy/bootstrap.sh
deploy/ly-afk-manager.sh
docs/ubuntu-24.04-deploy.md
README.md
```

## 七、测试

快速语法检查：

```bash
npm run check
```

完整测试：

```bash
npm test
```

当前测试覆盖：

```text
前端页面 smoke
控制台配置保存/重置
启动/停止流程
Basic Auth
本地 Minecraft 协议模拟
自动登录
关键词回复
定时任务
自动钓鱼
自动重生
防挂机移动
批量账号校验
```

## 八、线上排查顺序

网页打不开：

```bash
pm2 status ly-afk-dashboard
pm2 logs ly-afk-dashboard
curl -i http://127.0.0.1:30123/api/status
sudo nginx -t
sudo systemctl status nginx
```

一键部署卡住：

```bash
tail -n 120 /tmp/ly-console-bootstrap.log
ps aux | grep -E "apt|git|npm|node|pm2"
```

域名打不开：

```bash
nslookup bot.你的域名.com
sudo ufw status
sudo nginx -t
```

机器人进不了 Minecraft：

```text
1. 确认控制台域名和 Minecraft 服务器地址没有填反
2. 确认 Minecraft 服务器端口是否正确
3. 确认版本、登录模式和服务器规则
4. 查看网页控制台实时日志
```

## 九、交接备注

当前仓库地址：

```text
https://github.com/bykedie/LY-.git
```

线上推荐安装目录：

```text
/opt/ly-console
```

默认控制台端口：

```text
30123
```

推荐公网访问方式：

```text
Nginx + HTTPS + DASHBOARD_HOST=127.0.0.1
```
