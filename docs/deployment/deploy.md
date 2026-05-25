# ChaosRadio Vercel 部署指南

## 前置条件

- GitHub 仓库已创建
- Vercel 账号（免费 Plan 即可）
- DeepSeek API Key
- Edge-TTS 服务部署（可选但建议）

---

## 一、部署步骤

### 1. 推送代码到 GitHub

```bash
git init
git add .
git commit -m "v1.0 release"
git remote add origin https://github.com/<your-username>/chaos-radio.git
git push -u origin main
```

### 2. 在 Vercel 导入项目

1. 打开 [vercel.com/new](https://vercel.com/new)
2. 选择 GitHub 仓库 `chaos-radio`
3. 框架自动识别为 **Next.js**
4. 点击 **Deploy** — 但先别急，往下配置环境变量

---

## 二、环境变量配置

> ⚠️ **第一次部署前必须配好所有 Required 变量，否则应用无法工作。**

在 Vercel Dashboard → 项目 → **Settings → Environment Variables** 中添加：

### 必填变量

| Key | 值 | 说明 |
|-----|-----|------|
| `ACCESS_KEY` | 你自定义的密码 | 登录用的密钥，建议用随机字符串 |
| `DEEPSEEK_API_KEY` | `sk-xxxxxxxx` | DeepSeek API Key，[在这里申请](https://platform.deepseek.com/api_keys) |
| `EDGE_TTS_URL` | `https://你的tts.vercel.app` | Edge-TTS 服务地址，部署方案见下方 |

### 推荐配置的变量

| Key | 值 | 说明 |
|-----|-----|------|
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | 默认就是这个，一般不用改 |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 默认就是这个 |
| `WEATHER_CITY` | `Shanghai` | 天气城市，DJ 会根据天气选歌 |
| `OPENWEATHER_API_KEY` | 你的 OpenWeather Key | 不配也行，DJ 只是少了天气上下文 |

### 网易云音乐（可选）

| Key | 值 | 说明 |
|-----|-----|------|
| `NCM_USER_ID` | 你的网易云 UID | 用于收藏同步 |
| `NCM_COOKIE` | 浏览器 Cookie | 从 music.163.com 登录后取 |

> **怎么获取 NCM_COOKIE？** 用 Chrome 登录 music.163.com → F12 → Application → Cookies → 复制 `MUSIC_U` 的完整值。

### 汇总清单

```env
# === 必填 ===
ACCESS_KEY=你的秘密密码
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxx
EDGE_TTS_URL=https://your-edge-tts.vercel.app

# === 推荐 ===
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
WEATHER_CITY=Shanghai
OPENWEATHER_API_KEY=你的key

# === 可选 ===
NCM_USER_ID=你的UID
NCM_COOKIE=你的cookie
```

---

## 三、Edge-TTS 服务部署

ChaosRadio 依赖 Edge-TTS 做 DJ 语音播报。可以用以下方案之一：

### 方案 A：用现成的（推荐）

Fork 部署 [edge-tts](https://github.com/search?q=edge-tts+vercel) 项目到 Vercel，得到 URL（如 `https://ms-edge-tts.vercel.app`），填入 `EDGE_TTS_URL`。

### 方案 B：自己搭

```bash
git clone https://github.com/xxx/edge-tts
# 部署到 Vercel
```

---

## 四、部署后验证

### 1. 检查 Vercel Build 日志

部署完成后，Vercel Dashboard 应显示：
```
✓ Compiled successfully
✓ Generating static pages (15/15)
```

### 2. 访问应用

打开 `https://你的项目.vercel.app`，用 `ACCESS_KEY` 登录。

### 3. 功能检查

- [ ] 能正常登录
- [ ] 点击 Generate 能生成播放列表
- [ ] 歌曲能播放
- [ ] DJ 能说话（TTS）
- [ ] Chat 对话正常
- [ ] 打开 HTTPS 地址（不是 HTTP）

---

## 五、Vercel 注意事项

| 事项 | 说明 |
|------|------|
| **Serverless 超时** | Hobby Plan 10s，Pro Plan 15s。LLM 调用已设置 12s 超时 |
| **冷启动** | 首次请求可能慢 2-3 秒，NeteaseCloudMusicApi 动态导入 |
| **Favorites 缓存** | 存在 `/tmp`，冷启动后丢失（设计如此，云音乐 API 随时拉取） |
| **安全头** | 已配置 X-Frame-Options、HSTS、CSP 等 |
| **域名** | Vercel 自带 `.vercel.app` 域名，生产环境建议绑定自定义域名 |
