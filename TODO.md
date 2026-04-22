# TODO

当前 v1.0.1 是 **完整商业化版骨架**（全 mock 可跑，真服务凭证就绪即可切）。以下是剩余工作，按优先级排序。

## 🔴 P0 — 上线前必做

### 企业资质 + 备案（纯业务，代码不动）
- [ ] 营业执照（如没有）
- [ ] 对公账户
- [ ] 域名（阿里云/腾讯云皆可）
- [ ] **ICP 备案**（15-30 工作日，卡所有真服务）

### 真服务接入
- [ ] **微信支付**
  - [ ] 商户号申请（需备案号 + 网站截图，3-7 工作日）
  - [ ] 下载 `apiclient_cert.pem` + `apiclient_key.pem` → `scp` 到服务器 `/opt/ai-creative-tool/certs/`
  - [ ] 设置 APIv3 密钥，记 serial_no
  - [ ] **补全 `WechatPayClient` V3 真实现**（当前是 stub，`web/src/lib/clients/pay/wechat.ts`）
    - 装 `wechatpay-node-v3` SDK
    - 实现 `createNativeOrder`：V3 RSA 签名下单 → 返回 `code_url`
    - 实现 `verifyCallback`：V3 回调验签 + AES-GCM 解密
    - 回调 URL 必须 HTTPS + 备案域名（所以要先 Nginx + 证书）
    - 联调：`MOCK_PAY=false` + 填 env → 真扫码 → 观察 /api/order/status 切换到 paid
  - [ ] 写 WechatPayClient 集成测试（mock 服务器模拟微信 API）

- [ ] **腾讯云 SMS**（如决定恢复手机号登录）
  - [ ] 短信签名审核（需备案号）
  - [ ] 模板 ID 审核
  - [ ] 填 `TENCENT_SMS_*` env + `MOCK_SMS=false`
  - [ ] 真实发送一条验证码验证通路

- [ ] **OpenAI Whisper**（真文案转写）
  - [ ] 申请 OpenAI API Key
  - [ ] 填 `OPENAI_API_KEY` + `WHISPER_MODE=openai`
  - [ ] 国内服务器走代理 or 用支持中国访问的供应商
  - [ ] 监控成本（$0.006/min）

### 登录恢复
- [ ] 当前是匿名自动登录（skip login）。选一种正式方案：
  - **A. 用户名密码登录**（admin 手工建号）— 需要 User.password_hash migration + 登录页改造
  - **B. 手机号 + SMS**（原设计）— 等 Tencent SMS 就绪后直接翻 `MOCK_SMS=false`
  - **C. 三方 OAuth**（微信/GitHub 登录）— 需要额外对接

### 安全
- [ ] 改 admin 默认密码（登录后强制改密页 → 设为 ≥16 位强密码）
- [ ] **Nginx 反代 + Let's Encrypt HTTPS**（备案域名下来后）
  - [ ] 80/443 对外，3000 仅 localhost
  - [ ] 配 HSTS + gzip + 基本 rate limit
- [ ] CSRF Token（当前只靠 SameSite=Lax cookie，生产建议加 double-submit token）
- [ ] 生产 DB 密码 + JWT secret rotation 流程
- [ ] 把 ytdlp-service 的 `:8000` 从 docker-compose `ports:` 里去掉（只走内网）
- [ ] 关闭 dev 模式：`docker-compose.yml` 的 web service `target: dev` 改 `target: prod`
- [ ] 移除 `/api/dev/grant-points` 路由（或加生产环境拒绝，已有 `NODE_ENV=production` 检查但确认一下）

---

## 🟡 P1 — 稳定性 & 可观测性

- [ ] **监控 / 错误追踪**
  - [ ] Sentry 或自建日志（web + ytdlp 都需要）
  - [ ] 业务指标：DAU / 付费转化 / 积分消耗 / 失败率
- [ ] **备份**
  - [ ] Postgres 每日备份（pg_dump + 异地）
  - [ ] 微信商户证书备份
- [ ] **健康检查端点**
  - [ ] `/api/health` 返回 DB + Redis 连通性
  - [ ] 给 Docker healthcheck 用的内部 URL
- [ ] **日志**
  - [ ] 所有 API 请求日志（user_id / IP / 耗时 / 状态）
  - [ ] 敏感字段脱敏（phone / token）
  - [ ] 日志轮转
- [ ] **ytdlp-service 健壮性**
  - [ ] yt-dlp 对抖音/小红书经常断 → 接 MediaCrawler fallback（spec §13 已备注）
  - [ ] cookie 池 / IP 代理（如果流量大）
  - [ ] 失败重试（目前直接抛错）

---

## 🟢 P2 — 优化 & 新功能

### 功能补全
- [ ] VideoTrimmer：>200MB 视频的提示做得更友好（目前硬拦截）
- [ ] 视频下载支持指定分辨率（720p / 1080p）
- [ ] 文案提取支持多语言（当前 mock 写死中文）
- [ ] 批量提取（队列 + 后台处理）
- [ ] 用户昵称 / 头像上传
- [ ] 手机号绑定（匿名用户升级成实名）

### 外部服务
- [ ] `LocalWhisperClient`：装 whisper.cpp + 模型文件 → subprocess 调用（省钱，现在是 stub）
- [ ] `OssStorageClient`：阿里云 OSS 上传 + 签名 URL（流量大了再切，现在是 stub）

### UX
- [ ] 工作台加"最近 5 次提取"快捷入口
- [ ] 积分明细可以按类型筛选（消耗/充值/调整）
- [ ] Recharge 页加充值记录展示（当前只有套餐选择）
- [ ] 404 / 500 页面美化
- [ ] 移动端二次适配（当前响应式但还有细节）
- [ ] 国际化（i18n）结构预留

### 后台
- [ ] 后台 dashboard：DAU / 总消费积分 / 付费转化率图表
- [ ] 管理员操作日志（谁什么时候改了哪个用户的积分）
- [ ] 超管 vs 普通管理员权限区分（表已有 `role` 字段未启用）
- [ ] 订单明细页（目前只在 orders 表，没有后台展示页）
- [ ] 批量操作（批量封禁 / 批量加积分）

---

## ⚪ P3 — 锦上添花

- [ ] 开放 API（供第三方调用）+ API Key 管理
- [ ] Agent-friendly：暴露 structured MCP endpoint，用户可用 Claude 直接调
- [ ] 微信小程序 / H5 版本
- [ ] 订阅制（月卡/年卡）+ 套餐组合
- [ ] 邀请返利
- [ ] 视频 AI 摘要（基于已提取文案）

---

## 🐛 已知风险 / 观察项

- [ ] yt-dlp 更新频繁，需要定期升级（或锁版本 + 监控失败率）
- [ ] OpenAI Whisper 在国内调用网络不稳（已预留 local / mock 两个 fallback）
- [ ] ffmpeg.wasm 在低端移动端性能差，>200MB 视频可能 OOM
- [ ] Prisma 6.x 最新，有小概率 breaking change（锁在 `^6`）
- [ ] 匿名用户会无限累积（每次清 cookie 都建一个），后台可能要加"清理 N 天无活动匿名用户"脚本

---

## 📦 部署操作清单（上线时跟着走）

1. [ ] 代码部署：rsync 或 git pull 到服务器
2. [ ] `.env` 切真服务（MOCK_* 全改 false + 填真 key）
3. [ ] Docker Compose web target 改 prod
4. [ ] `docker compose up -d --build`
5. [ ] Nginx 反代 + HTTPS 证书
6. [ ] 防火墙：仅对外开 80/443，其他内网
7. [ ] admin 首次登录改密码
8. [ ] 真微信支付联调（小额 1 分钱）
9. [ ] 真短信发一条验证码
10. [ ] 真视频 extract + download 真实跑
11. [ ] 备案号挂底部 + 用户协议 / 隐私政策
12. [ ] 监控告警配置
