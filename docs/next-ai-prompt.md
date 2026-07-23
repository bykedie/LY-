# 下一位 AI 续接提示语

开启新对话后，可直接发送下面这段话：

```text
请接手本地项目 C:\Users\Administrator\Documents\MCLY\pcl-afk-bot。

不要依赖上一段聊天内容，也不要先问我项目做到哪里。请严格按仓库根目录 AGENTS.md 的顺序恢复上下文：先读 docs/current-status.md，再执行 git status --short --branch 和 git log --oneline -5，然后阅读 docs/project-architecture.md、docs/decisions.md、docs/work-log.md 最近记录；需要追溯历史时再读 docs/conversation-handoff.md。

以实际代码和 Git 状态为准。如果文档与代码不一致，先修正文档。按照 current-status 的“下一步明确动作”直接继续开发；如果当前没有指定功能需求，就主动审计可复现 bug，先写失败测试、再做最小根因修复。关键动作后立即更新 current-status 和 work-log。允许创建本地里程碑提交，但未经我明确说“同意推送”，禁止 git push、远端分支、标签、发布或合并到远端 main。

开始工作前先向我简短汇报：当前稳定版本、本地开发版本、分支、最近提交、当前目标、下一步、最近测试结果和推送许可，然后直接继续执行。
```

如果要追加新需求，在上述提示语末尾补充：

```text
本轮新需求：<填写需求>。
验收标准：<填写可验证结果>。
```

不要把“继续开发”“完成了”或“测试通过”理解为推送许可。只有项目所有者明确说“同意推送”后，才能准备远端变更，并且推送前仍需汇报提交、差异、测试和版本。
