# LY 挂机控制台 Ubuntu 24.04 部署教程

这份教程按你的轻量云服务器信息编写：

- 公网 IP 示例：`116.62.191.104`
- 私有 IP 示例：`172.25.45.1`
- 系统镜像：`Ubuntu 24.04`
- 推荐部署目录：`/opt/pcl-afk-bot`
- 控制台默认端口：`30123`

> 重要区别：你买的域名用于访问“网页控制台”，Minecraft 服务器地址要在控制台里的“服务器配置”页面填写。两者不是同一个参数。

## 一、推荐访问方式

推荐最终效果：

```text
https://bot.你的域名.com
```

推荐结构：

```text
浏览器 -> 域名 HTTPS -> Nginx -> http://127.0.0.1:30123 -> LY 挂机控制台
```

这样 `30123` 不需要直接暴露到公网，只开放 `80` 和 `443` 即可，更适合长期放在服务器上运行。

如果是全新服务器，最省事的方式是直接执行：

```bash
curl -fL --progress-bar https://raw.githubusercontent.com/bykedie/LY-/main/deploy/bootstrap.sh | sudo bash
```

执行后会显示 `[1/5]`、`[2/5]` 这样的进度。完整日志在：

```text
/tmp/ly-console-bootstrap.log
```

如果卡在 `[2/5] 检查 GitHub 仓库是否可以访问`，通常不是权限问题，而是服务器访问 `github.com` 超时。新脚本会限制 GitHub 检查最多等待 20 秒，失败后自动尝试下载仓库压缩包继续安装。

如果压缩包下载也失败，可以先查看日志：

```bash
cat /tmp/ly-console-bootstrap.log
```

如果你看到类似 `脚本在第 77 行失败`，说明你运行的是较早版本脚本，那个版本没有显示真正失败的命令。重新执行最新一键命令后，报错里会多一行 `失败命令：...`，能直接看到是 `apt`、`git` 还是 `curl` 出问题。

如果提示 `/opt/ly-console` 已存在，通常是上一次失败留下了半成品目录。新版脚本会自动处理：

```text
空目录：自动删除后继续
完整项目目录：跳过下载，直接进入菜单
非空半成品目录：自动备份为 /opt/ly-console.backup.时间戳，然后继续安装
```

如果你想手动处理，也可以先查看目录：

```bash
ls -la /opt/ly-console
```

如果看到 `失败命令：./deploy/ly-afk-manager.sh`，通常是旧脚本在 `curl | sudo bash` 管道模式下打开交互菜单失败。新版脚本会自动把菜单输入切到 `/dev/tty`。如果你的服务器终端仍然不支持交互输入，可以手动进入菜单：

```bash
cd /opt/ly-console
sudo ./deploy/ly-afk-manager.sh
```

也可以手动测试服务器网络：

```bash
curl -I --connect-timeout 10 https://github.com
curl -I --connect-timeout 10 https://raw.githubusercontent.com
git ls-remote --heads https://github.com/bykedie/LY-.git main
```

如果确认是国内服务器访问 GitHub 不稳定，可以选择：

```text
1. 给服务器配置 https_proxy 后重新执行一键命令
2. 在本机下载项目压缩包上传到服务器，再运行 deploy/ly-afk-manager.sh
3. 把仓库同步到 Gitee 等国内 Git 平台，然后用 REPO_URL=国内仓库地址 覆盖
```

## 二、先在云服务商后台配置

### 1. 安全组 / 防火墙端口

在轻量云控制台放行：

```text
22/TCP     SSH 登录服务器
80/TCP     域名 HTTP 访问和申请证书
443/TCP    域名 HTTPS 访问
```

如果你暂时想用公网 IP 直连测试，再额外放行：

```text
30123/TCP  直接访问 http://116.62.191.104:30123
```

直连公网端口时，`.env` 里的 `DASHBOARD_HOST` 必须改成：

```env
DASHBOARD_HOST=0.0.0.0
```

如果使用域名反向代理，推荐保持：

```env
DASHBOARD_HOST=127.0.0.1
```

### 2. 域名解析

到你的域名 DNS 后台添加 A 记录：

```text
主机记录：bot
记录类型：A
记录值：116.62.191.104
TTL：默认即可
```

配置完成后，访问地址就是：

```text
http://bot.你的域名.com
```

DNS 生效通常需要几分钟到几十分钟。

## 三、上传项目到服务器

### 方法 A：用 FinalShell / Xftp 上传

把整个 `pcl-afk-bot` 文件夹上传到服务器：

```text
/opt/pcl-afk-bot
```

如果上传后路径变成 `/opt/pcl-afk-bot/pcl-afk-bot`，进入实际包含 `package.json` 的那一层即可。

### 方法 B：用 scp 上传

在你 Windows 本机 PowerShell 里执行，路径按你的本机实际目录：

```powershell
scp -r "C:\Users\Administrator\Documents\IE智能体\pcl-afk-bot" root@116.62.191.104:/opt/pcl-afk-bot
```

如果服务器禁止 root 登录，就把 `root` 换成你的 Ubuntu 用户名。

## 四、登录服务器

```bash
ssh root@116.62.191.104
```

进入项目目录：

```bash
cd /opt/pcl-afk-bot
```

确认当前目录里有 `package.json`：

```bash
ls
```

## 五、使用一键管理脚本

给脚本执行权限：

```bash
chmod +x deploy/ly-afk-manager.sh
```

打开菜单：

```bash
sudo ./deploy/ly-afk-manager.sh
```

推荐第一次选择：

```text
2. 一键安装环境 + 配置 + 启动
```

它会依次完成：

```text
安装 Node.js / npm / nginx / ufw
安装 pm2
生成 .env 配置
安装项目依赖
后台启动 LY 挂机控制台
```

填写 `.env` 参数时可以参考：

```text
面板端口：30123
监听地址：127.0.0.1
登录用户名：admin
登录密码：自己设置一个强密码
控制台域名：bot.你的域名.com
```

如果你还没有域名，可以先把“控制台域名”留空。

## 六、配置域名反向代理

菜单里选择：

```text
8. 配置 Nginx 域名反代
```

输入你的控制台域名，例如：

```text
bot.你的域名.com
```

配置完成后先访问：

```text
http://bot.你的域名.com
```

浏览器会弹出登录框：

```text
用户名：你在 .env 里设置的 DASHBOARD_USER
密码：你在 .env 里设置的 DASHBOARD_PASSWORD
```

## 七、申请 HTTPS

确认域名已经能用 HTTP 打开后，菜单里选择：

```text
9. 申请 HTTPS 证书
```

输入同一个域名：

```text
bot.你的域名.com
```

完成后访问：

```text
https://bot.你的域名.com
```

## 八、控制台里的服务器配置怎么填

控制台里的“服务器配置”指的是 Minecraft 服务器，不是你的网页域名。

如果 Minecraft 服务端也运行在这台轻量云上：

```text
服务器地址：127.0.0.1
服务器端口：25565
服务器版本：false 或具体版本，例如 1.20.1
登录模式：offline 或 microsoft
```

如果 Minecraft 服务端在另一台机器：

```text
服务器地址：Minecraft 服务器公网 IP 或域名，例如 play.example.com
服务器端口：实际端口，例如 25565
服务器版本：false 或具体版本
登录模式：按服务器要求选择 offline / microsoft
```

账号在“批量账号”里添加。每个账号可以单独开关，也可以复制配置到其他账号。

## 九、常用运维命令

查看控制台状态：

```bash
pm2 status ly-afk-dashboard
```

查看实时日志：

```bash
pm2 logs ly-afk-dashboard
```

重启控制台：

```bash
pm2 restart ly-afk-dashboard --update-env
```

停止控制台：

```bash
pm2 stop ly-afk-dashboard
```

修改环境变量：

```bash
nano /opt/pcl-afk-bot/.env
pm2 restart ly-afk-dashboard --update-env
```

## 十、常见问题

### 访问域名显示 502

通常是控制台进程没有启动。执行：

```bash
pm2 status ly-afk-dashboard
pm2 logs ly-afk-dashboard
```

如果没有进程，重新启动：

```bash
cd /opt/pcl-afk-bot
pm2 start src/dashboard.js --name ly-afk-dashboard
pm2 save
```

### 访问公网 IP:30123 打不开

检查三处：

```text
1. 云服务商安全组是否放行 30123/TCP
2. Ubuntu 防火墙是否放行 30123/TCP
3. .env 里的 DASHBOARD_HOST 是否为 0.0.0.0
```

如果你使用域名访问，不需要开放 `30123`。

### 浏览器弹出登录框但密码不对

查看服务器上的 `.env`：

```bash
cd /opt/pcl-afk-bot
cat .env
```

确认：

```env
DASHBOARD_USER=admin
DASHBOARD_PASSWORD=你的密码
```

修改后重启：

```bash
pm2 restart ly-afk-dashboard --update-env
```

### 机器人进不了 Minecraft 服务器

先确认控制台域名和 Minecraft 地址没有填反。网页控制台域名类似：

```text
bot.你的域名.com
```

Minecraft 服务器地址类似：

```text
127.0.0.1
play.example.com
116.62.191.104
```

再检查 Minecraft 端口、版本、登录模式，以及服务器规则是否允许这类自动挂机账号进入。
