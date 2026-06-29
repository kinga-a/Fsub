# Fsub - 分布式云资产全周期托管

一个基于 EdgeOne Pages + Cloudflare Workers 构建的轻量级订阅管理应用，支持多维度通知（钉钉、飞书、企业微信、邮件），帮助你追踪和管理各类云资产与订阅服务的到期时间。

---

## 功能特性

### 核心功能
- **订阅管理**：支持增删改查，记录服务名称、类型、价格、周期、到期日等
- **到期提醒**：可设置提前 N 天提醒，支持自定义提醒时间
- **一键续订**：到期后一键续订，自动计算下次到期日
- **多视图切换**：列表视图 / 卡片视图 / 仪表盘 / 日历视图 / 支出分析

### 通知渠道
- **钉钉机器人**（支持加签密钥）
- **飞书机器人**（支持加签密钥）
- **企业微信**（Webhook / Key）
- **邮件通知**（SMTP，需 Cloud Functions 支持）
- 支持按订阅单独指定通知渠道，或全局默认推送所有已启用渠道
- 支持手动发送测试消息验证配置

### 定时通知
- 通过 EdgeOne Pages 的 Cron 触发器（`schedules`）定时执行
- 支持漏发补发：若某天 Cron 未触发，下次执行时会自动补发
- 防重复发送：同一天内已通知过的订阅不会重复发送

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 原生 HTML + CSS + JavaScript（无框架依赖） |
| 后端 | Cloudflare Workers Functions |
| 存储 | Cloudflare Workers KV |
| 部署 | EdgeOne Pages |
| 定时任务 | EdgeOne Pages Cron Schedules |

---

## 项目结构

```
.
├── index.html              # 前端主页面（单文件应用）
├── [[default]].js          # 订阅 API：PUT/DELETE/PATCH（续订）
├── subscriptions.js        # 订阅 API：GET/POST
├── auth.js                 # 登录鉴权（访问码 + Token Cookie）
├── verify.js               # Token 验证
├── middleware.js           # 中间件：未登录拦截返回登录页
├── notify.js               # 通知配置 & 定时通知逻辑
├── edgeone.json            # EdgeOne Pages 构建配置 & Cron 定时任务
└── README.md               # 本文件
```

---

## 快速部署

### 1. 准备工作

- 一个 Cloudflare 账号
- 一个 EdgeOne Pages 项目
- 创建 Workers KV Namespace，绑定名称为 `SUB_KV`

### 2. 环境变量配置

在 EdgeOne Pages 项目设置中，添加以下环境变量：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `ACCESS_CODE` | 登录访问码 | `your-secret-code` |
| `CRON_TOKEN` | Cron 触发 API Key | `your-cron-secret-key` |

### 3. 部署步骤

1. 将所有文件上传至 EdgeOne Pages 项目根目录
2. 确保 `edgeone.json` 中的 `schedules` 配置正确：
   ```json
   {
     "schedules": [
       {
         "name": "notify-cron",
         "cron": "0 19 * * *",
         "path": "/api/notify-cron",
         "method": "POST",
         "timezone": "Asia/Shanghai"
       }
     ]
   }
   ```
3. 部署后访问页面，输入访问码即可登录

### 4. Cron 配置说明

`edgeone.json` 中的 `schedules` 定义了定时通知任务：
- `cron`: Cron 表达式，默认 `0 19 * * *`（每天 19:00）
- `path`: 触发路径，对应 `notify.js` 中的 `onRequestPost`
- `timezone`: 时区，建议设为 `Asia/Shanghai`

---

## API 接口

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth` | 验证访问码，返回 Token Cookie |
| GET | `/api/verify` | 验证当前 Token 是否有效 |

### 订阅管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/subscriptions` | 获取所有订阅 |
| POST | `/api/subscriptions` | 创建订阅 |
| PUT | `/api/subscriptions/{id}` | 更新订阅 |
| DELETE | `/api/subscriptions/{id}` | 删除订阅 |
| PATCH | `/api/subscriptions/renew/{id}` | 续订订阅（自动计算下次到期日） |

### 通知配置
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notify` | 获取通知配置（脱敏） |
| POST | `/api/notify` | 保存通知配置 |
| PUT | `/api/notify` | 发送测试通知 |

### Cron 触发（内部使用）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/notify-cron` | 定时扫描并发送到期提醒（需 `X-API-Key` Header） |

---

## 数据模型

### 订阅（Subscription）

```json
{
  "id": "string",
  "name": "string",
  "type": "string",
  "tags": ["string"],
  "price": 0.00,
  "currency": "CNY",
  "mode": "recurring",
  "cycleValue": 1,
  "cycleUnit": "month",
  "startDate": "2024-01-01",
  "lastRenewDate": "2024-01-01",
  "nextDate": "2024-02-01",
  "notifyDays": 3,
  "notifyTime": "11:00",
  "notifyChannels": ["dingtalk", "feishu"],
  "enabled": true,
  "autoRenew": false,
  "expiredRenewDays": 3,
  "note": "string",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### 模式说明
- `recurring`: 循环订阅（到期后自动按周期续期）
- `reset`: 到期重置（到期后手动重置）
- `fixed`: 固定重复（固定周期重复）

### 通知配置（NotifyConfig）

```json
{
  "dingtalk": {
    "enabled": false,
    "webhook": "https://oapi.dingtalk.com/robot/send?access_token=xxx",
    "secret": "SECxxx"
  },
  "feishu": {
    "enabled": false,
    "webhook": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
    "secret": "xxx"
  },
  "wecom": {
    "enabled": false,
    "webhook": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx",
    "key": "xxx"
  },
  "email": {
    "enabled": false,
    "smtpHost": "smtp.gmail.com",
    "smtpPort": 587,
    "username": "your@email.com",
    "password": "app-password",
    "to": "notify@email.com"
  }
}
```

---

## 通知逻辑

### 提醒窗口计算
```
提醒开始日 = 到期日 - notifyDays
提醒结束日 = 到期日
```

### 发送条件
1. 订阅已启用（`enabled === true`）
2. 当前日期在提醒窗口内
3. 今天未发送过通知（通过 KV 标记 `notified_{subId}_{date}` 判断）
4. 若存在漏发日期，自动补发

### 防重复机制
- 每次发送成功后，在 KV 中写入 `notified_{subId}_{YYYY-MM-DD} = 1`
- KV 记录 TTL 为 7 天，自动过期清理

---

## 本地开发

由于项目依赖 Cloudflare Workers KV 和 EdgeOne Pages 环境，本地开发需要：

1. 安装 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
2. 配置本地 KV 绑定
3. 使用 `wrangler dev` 启动本地开发服务器

```bash
# 安装 wrangler
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 启动本地开发
wrangler pages dev .
```

---

## 常见问题

### Q: 为什么定时通知没有触发？
A: 检查以下几点：
1. `edgeone.json` 中的 `schedules` 配置是否正确
2. 环境变量 `CRON_TOKEN` 是否已设置
3. Cron 请求是否携带了正确的 `X-API-Key` Header
4. 订阅的 `enabled` 是否为 `true`
5. 当前日期是否在提醒窗口内

### Q: 如何修改定时通知时间？
A: 修改 `edgeone.json` 中 `schedules.cron` 的 Cron 表达式，例如：
- `0 9 * * *`：每天上午 9 点
- `0 9,18 * * *`：每天上午 9 点和下午 6 点
- `0 9 * * 1`：每周一上午 9 点

### Q: 邮件通知无法发送？
A: 邮件发送功能需要在 Cloud Functions 环境中实现 SMTP 客户端。当前版本仅预留了配置接口，实际发送逻辑需自行接入邮件服务（如 SendGrid、Resend 等）。

### Q: 如何重置访问码？
A: 在 EdgeOne Pages 项目设置中修改 `ACCESS_CODE` 环境变量，重新部署即可生效。

---

## 更新日志

### v2.0
- UI 界面全面优化：蓝色系配色、更现代的深色侧边栏、更精致的卡片阴影
- 手机端移除底部导航栏，统一使用侧边栏操作
- 新增支出分析视图（月度趋势、分类占比、TOP10 排行）
- 新增日历视图
- 支持按订阅单独指定通知渠道
- 新增漏发补发机制

### v1.0
- 基础订阅管理功能
- 支持钉钉、飞书、企业微信通知
- 定时 Cron 通知

---

## License

MIT
