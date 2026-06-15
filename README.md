# Labs ELN

自托管分子生物实验记录与库存管理 PWA，部署在 `labs.heyrickishere.com`。

这个项目面向个人/小组实验记录场景，优先把“实验记录 + 事件流 + 库存 + 存放位置 + 附件 + 导出备份”做成一个轻量闭环。它借鉴成熟 ELN/LIMS 的信息结构，但保持实现简单、可自托管、可备份。

## Features

- 单管理员密码登录
- 登录失败限速，防止暴力破解
- 实验记录：标题、正文、标签、状态、时间
- 实验事件：观察、待办、样本变更、异常
- 库存管理：样本、试剂、耗材、质粒、细胞系、抗体、设备等
- 存放位置：房间、冰箱、层架、盒子、格位等树形结构
- 附件上传：图片、表格、PDF、原始实验文件
- 云盘外链：OneDrive / Google Drive / 普通链接
- 导出备份：JSON manifest 和库存 CSV
- PWA 前端：桌面和移动端共用一套界面

## Persistent Data

所有持久数据都放在数据盘 `/www`，避免占用系统盘：

```text
/www/labs-data/postgres
/www/labs-data/uploads
/www/labs-data/exports
/www/labs-data/backups
/www/labs-data/logs
```

应用代码默认位于：

```text
/root/labs
```

重要：不要提交 `.env`。仓库只提交 `.env.example`。

## Tech Stack

- Node.js 20
- Express 5
- PostgreSQL 16 via Docker Compose
- Native JavaScript modules
- HTML/CSS/vanilla JS PWA frontend
- systemd + nginx + Let's Encrypt

## Login Protection

管理员密码登录带内存限速保护：

- 同一来源 10 分钟内最多失败 5 次
- 第 6 次开始锁定 15 分钟
- 锁定时返回 HTTP `429`
- 成功登录后清空该来源的失败记录
- 支持 Cloudflare 的 `CF-Connecting-IP`

## Local Setup

```bash
npm install
cp .env.example .env
npm run set-password
docker compose up -d postgres
npm start
```

把 `npm run set-password` 生成的 hash 填入 `.env` 的 `ADMIN_PASSWORD_HASH`。

## Useful Commands

```bash
npm test
npm start
npm run set-password
docker compose up -d postgres
docker compose ps
systemctl status labs-eln.service
journalctl -u labs-eln.service -n 100
```

## API Overview

Health:

```text
GET /api/health
```

Authentication:

```text
POST /api/login
POST /api/logout
```

Core resources:

```text
GET  /api/dashboard
GET  /api/entries
POST /api/entries
PUT  /api/entries/:id
GET  /api/events
POST /api/events
GET  /api/locations
POST /api/locations
GET  /api/inventory
POST /api/inventory
POST /api/inventory/:id/adjust
POST /api/attachments
POST /api/external-links
```

Export:

```text
POST /api/export/manifest
GET  /api/export/inventory.csv
```

## Backups

Manual JSON export files are written to:

```text
/www/labs-data/exports
```

Database and attachment backup jobs should write to:

```text
/www/labs-data/backups
```

## Deploy Notes

```bash
cp ops/labs-eln.service /etc/systemd/system/labs-eln.service
cp ops/nginx-labs.conf /etc/nginx/sites-available/labs.heyrickishere.com
ln -s /etc/nginx/sites-available/labs.heyrickishere.com /etc/nginx/sites-enabled/labs.heyrickishere.com
nginx -t
systemctl daemon-reload
systemctl enable --now labs-eln.service
systemctl reload nginx
```

Issue or renew the certificate with certbot after DNS points `labs.heyrickishere.com` to this server.

```bash
certbot certonly --webroot -w /var/www/html -d labs.heyrickishere.com
```

The production service expects:

```text
/root/labs/.env
/www/labs-data
/etc/systemd/system/labs-eln.service
/etc/nginx/sites-available/labs.heyrickishere.com
```

## Repository

GitHub remote:

```text
git@github.com:XYR-star/labs-docs-records.git
```
