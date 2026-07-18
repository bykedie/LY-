# LY控制台

LY控制台 是一个面向 Minecraft Java 版服务器的网页化挂机与批量账号管理面板。它使用 `mineflayer` 作为执行端，提供浏览器控制台、批量账号、自动登录、自动钓鱼、自动走路、防挂机走动、关键词回复、定时消息、远程命令、实时日志和服务器部署辅助。

它适合你自己的服务器、LAN 服务器，或明确允许批量挂机的服务器。请先确认服务器规则允许，不要把它用于绕过封禁、刷资源、挤占服务器名额，或违反他人服务器规则。

## 一键拉取部署

Ubuntu 24.04 服务器推荐使用下面这条命令。执行后会自动拉取 GitHub 仓库到 `/opt/ly-console`，然后打开一键管理菜单：

```bash
curl -fL --progress-bar https://raw.githubusercontent.com/bykedie/LY-/main/deploy/bootstrap.sh | sudo bash
```

如果你想安装到其他目录，例如 `/opt/pcl-afk-bot`：

```bash
curl -fL --progress-bar https://raw.githubusercontent.com/bykedie/LY-/main/deploy/bootstrap.sh | sudo INSTALL_DIR=/opt/pcl-afk-bot bash
```

执行后会看到 `[1/5]`、`[2/5]` 这样的状态提示。完整安装日志会写到服务器：

```text
/tmp/ly-console-bootstrap.log
```

如果服务器访问 `github.com` 超时，脚本会先等 20 秒，然后自动改用 GitHub 压缩包下载方式继续安装；如果压缩包下载也失败，基本就是服务器到 GitHub 网络不通，需要配置代理、换网络，或把仓库同步到国内 Git 平台后用 `REPO_URL` 覆盖。

第一次进入菜单建议选择：

```text
2. 一键安装环境 + 配置 + 启动
```

## 功能介绍

- 网页控制台：手机、电脑、平板都可以通过浏览器管理。
- 批量账号：支持多个账号统一启动、单独开关、复制配置和同步配置。
- 服务器配置：可填写 Minecraft 服务器地址、端口、版本、登录模式，并带有中文说明和示例。
- 自动登录：匹配登录提示后自动发送密码或命令。
- 战斗挂机：支持自动攻击、目标范围、攻击间隔、黑白名单和自动重生。
- 自动钓鱼：支持自动抛竿收竿。
- 移动辅助：支持自动走路、防挂机随机移动、潜行和切换手持物品。
- 智能交互：支持关键词自动回复、预设消息、远程发送聊天和命令。
- 大厅功能：进入大厅后自动切换手持物品并使用。
- 定时任务：支持登录后执行和按间隔循环执行。
- 实时日志：网页内查看运行日志，支持 Minecraft 颜色渲染。
- 设置中心：可调整控制台名称、导航位置、提示文案和界面偏好。
- 部署管理：内置 Ubuntu 24.04 一键菜单，支持安装、启动、停止、重启、日志、Nginx 反代和 HTTPS 证书。

## 项目结构文档

交接、二次开发和排查问题可以先看：

```text
docs/project-architecture.md
```

## 推荐方式：打开管理面板

现在已经加入本地 Web 控制台，效果不只是登录页，而是可以直接管理配置、账号、启动和日志。

```powershell
cd C:\Users\Administrator\Documents\IE智能体\pcl-afk-bot
npm.cmd run dashboard
```

然后打开：

```text
http://127.0.0.1:30123
```

面板会保存真实配置到 `bot.config.json`。这个文件已加入 `.gitignore`，不会误提交。

## 部署到轻量云服务器并绑定域名

下面是通用流程，腾讯云、阿里云、华为云等轻量云服务器都类似。

如果你的服务器是 Ubuntu 24.04，可以优先使用一键管理脚本：

```bash
cd /opt/pcl-afk-bot
chmod +x deploy/ly-afk-manager.sh
sudo ./deploy/ly-afk-manager.sh
```

第一次进入菜单建议选择 `2. 一键安装环境 + 配置 + 启动`。你的服务器公网 IP 示例是 `116.62.191.104`，域名只需要在 DNS 后台添加 A 记录指向这个公网 IP。更详细的逐步教程见 [docs/ubuntu-24.04-deploy.md](docs/ubuntu-24.04-deploy.md)。

### 1. 上传项目

把整个 `pcl-afk-bot` 文件夹上传到你的服务器，例如放到：

```text
/opt/pcl-afk-bot
```

Windows 可以用 FinalShell、MobaXterm、Xftp、宝塔面板文件管理器上传；Linux/macOS 可以用：

```bash
scp -r pcl-afk-bot root@你的服务器IP:/opt/pcl-afk-bot
```

### 2. 安装 Node.js 和依赖

服务器上需要 Node.js 18 或更高版本。进入项目目录后安装依赖：

```bash
cd /opt/pcl-afk-bot
npm install
```

### 3. 启动控制台

公网部署时一定设置访问密码。推荐先复制环境变量模板：

```bash
cp .env.example .env
nano .env
```

至少修改这一项：

```text
DASHBOARD_PASSWORD=换成你的强密码
```

然后启动：

```bash
npm run dashboard
```

如果你不想用 `.env`，也可以临时用命令行环境变量启动：

```bash
export DASHBOARD_USER=admin
export DASHBOARD_PASSWORD='换成你的强密码'
export DASHBOARD_PORT=30123
npm run dashboard
```

Windows 服务器 PowerShell 写法：

```powershell
$env:DASHBOARD_USER='admin'
$env:DASHBOARD_PASSWORD='换成你的强密码'
$env:DASHBOARD_PORT='30123'
npm.cmd run dashboard
```

如果你只是本机调试，不设置 `DASHBOARD_PASSWORD` 也能直接打开；但放到公网服务器时不要裸奔。

### 4. 放行端口

在轻量云服务器控制台的安全组/防火墙里放行端口：

```text
30123/TCP
```

然后可以先用下面地址测试：

```text
http://你的服务器公网IP:30123
```

浏览器会弹出登录框，用户名默认 `admin`，密码就是 `DASHBOARD_PASSWORD`。

### 5. 域名解析

在域名 DNS 后台添加 A 记录：

```text
主机记录：bot
记录类型：A
记录值：你的服务器公网IP
```

解析生效后，`bot.你的域名.com` 就会指向你的轻量云服务器。

### 6. 推荐用 Nginx 或 Caddy 反向代理

如果你想用下面这种更正式的地址：

```text
https://bot.你的域名.com
```

推荐用 Nginx/Caddy 把域名反代到本机端口：

```text
http://127.0.0.1:30123
```

Nginx 示例：

```nginx
server {
  listen 80;
  server_name bot.你的域名.com;

  location / {
    proxy_pass http://127.0.0.1:30123;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

更省心的 HTTPS 方式可以用 Caddy：

```caddyfile
bot.你的域名.com {
  reverse_proxy 127.0.0.1:30123
}
```

### 7. 让它后台常驻

Linux 服务器推荐用 `pm2`：

```bash
npm install -g pm2
cd /opt/pcl-afk-bot
cp .env.example .env
nano .env
pm2 start src/dashboard.js --name ly-afk-dashboard
pm2 save
```

以后查看日志：

```bash
pm2 logs ly-afk-dashboard
```

重启：

```bash
pm2 restart ly-afk-dashboard
```

### 8. 面板里的“服务器配置”怎么填

注意：面板里的 `服务器地址` 是 Minecraft 服务器地址，不是控制台域名。

如果你的 Minecraft 服务端也跑在同一台轻量云服务器上：

```text
服务器地址：127.0.0.1
服务器端口：25565
服务器版本：false 或你的具体版本，比如 1.20.1
登录模式：offline 或 microsoft
```

如果你的 Minecraft 服务端在另一台机器上：

```text
服务器地址：MC 服务器的公网 IP 或域名，例如 play.example.com
服务器端口：MC 服务端实际端口，例如 25565
服务器版本：false 或具体版本
登录模式：按服务器要求选择 offline/microsoft
```

## 也可以直接改脚本

打开：

```text
C:\Users\Administrator\Documents\IE智能体\pcl-afk-bot\src\index.js
```

如果不用管理面板，只看文件最上面的两块：

- `USER_CONFIG`：服务器地址、端口、版本、登录模式、重连、挂机动作。
- `ACCOUNTS`：批量账号列表。

默认不会发送任何进服消息，也不会提示“我是挂机机器人”。
默认会把死亡后自动重生作为可见配置项开启；如果服务器规则或玩法不允许，可以在面板的“战斗挂机”里关闭。

## 配置示例

```js
const USER_CONFIG = {
  host: '127.0.0.1',
  port: 25565,
  version: false,
  auth: 'offline',
  useAccountsFile: false,
  accountsFile: 'accounts.json',
  connectIntervalMs: 15000,
  reconnect: true,
  reconnectDelayMs: 30000,
  idleActions: false,
  idleIntervalMs: 45000,
  messageCooldownMs: 1000,
  chatOnJoin: ''
};
```

`messageCooldownMs` 参考 MCC 的 `MessageCooldown`，控制同一个账号连续发送聊天/指令的最小间隔。自动登录、关键词回复、定时任务、防挂机命令、网页远程发送都会走这个队列。

防挂机支持两种方式：填写 `antiAfkCommand` 时按命令保活；留空时可启用 `antiAfkWalk`，让角色在 `antiAfkWalkRange` 范围内随机走动。

账号示例：

```js
const ACCOUNTS = [
  {
    username: 'Account_01',
    enabled: true,
    chatOnJoin: ''
  },
  {
    username: 'Account_02',
    enabled: true,
    chatOnJoin: ''
  }
];
```

后面如果要写服务器注册/登录插件，可以继续在账号里加预留字段：

```js
{
  username: 'Account_01',
  enabled: true,
  chatOnJoin: '',
  registerPassword: '你的注册密码'
}
```

## MCC 参考映射

这个项目不是直接套壳运行 MCC，而是参考 MCC 的配置思路，用 `mineflayer` 做了一个更适合网页批量管理的执行端：

- MCC `MessageCooldown` -> 本项目 `runtime.messageCooldownMs`，统一限制自动登录、自动回复、定时任务和网页指令的发送频率。
- MCC `ChatBot.AntiAFK` -> 本项目“移动辅助”，支持命令保活、潜行、随机走动和走动范围。
- MCC `ChatBot.AutoAttack` -> 本项目“战斗挂机”，支持单目标/多目标、攻击范围、攻击间隔、黑白名单和敌对/被动生物开关。
- MCC `ChatBot.AutoRespond` -> 本项目“智能交互”，支持关键词匹配和 `{player}` 占位回复。
- MCC `ChatBot.ScriptScheduler` -> 本项目“定时任务”，支持登录后执行和按间隔执行聊天/指令。
- MCC `AutoRespawn` -> 本项目“自动重生”，可在战斗挂机里开关。
- MCC `AccountList` -> 本项目“批量账号”，支持网页批量维护、复制账号和同步账号配置。

网页保存配置和执行端直接启动都会校验账号列表：账号名不能为空、不能重复，至少要启用一个账号。

## 安装

```powershell
cd C:\Users\Administrator\Documents\IE智能体\pcl-afk-bot
npm.cmd install
```

## 启动

命令行直接启动挂机：

```powershell
npm.cmd start
```

停止时在终端按 `Ctrl+C`。

## 验证

运行完整检查：

```powershell
npm.cmd test
```

它会执行两类验证：

- 主控流程：检查管理面板页面、配置保存、配置重置、启动/停止挂机进程、网页发送指令。
- 协议流程：启动一个本地测试 Minecraft 协议服务端，验证机器人能进服、自动注册、关键词回复、登录后定时任务、网页指令通道、防挂机命令、切换手持、自动走路启动和大厅使用物品。

测试服务端只用于验证流程，不会连接外部服务器。

## 可选：使用 accounts.json

默认账号直接写在 `src/index.js` 顶部的 `ACCOUNTS` 里，最方便集中填写。

如果账号很多，也可以把 `USER_CONFIG.useAccountsFile` 改成 `true`，然后复制示例文件：

```powershell
Copy-Item accounts.example.json accounts.json
```

再编辑 `accounts.json`。

## 和 PCL 的关系

PCL 负责启动你的 Minecraft 客户端；这个项目是单独运行的脚本，不需要通过 PCL 启动。
