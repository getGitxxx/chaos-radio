# ChaosRadio v2.0 开发规约

> 本文档是 v2.0 迭代的编码约束，所有新代码必须遵守。违反规约的代码不会被接受。

---

## 1. 错误处理 — 永不静默失败

### 1.1 所有外部调用必须有明确错误处理

```typescript
// ❌ 错误 — 静吞异常
try {
  await doSomething()
} catch {
  // 什么都不做
}

// ✅ 正确 — 记录 + 降级
try {
  await doSomething()
} catch (error) {
  console.error('[Feature] Action failed:', error instanceof Error ? error.message : String(error))
  return fallbackValue
}
```

### 1.2 API Route 必须返回结构化响应

```typescript
// 所有 API route 的响应格式：
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// 错误时必须返回 HTTP 状态码
return NextResponse.json({ success: false, error: '具体错误原因' }, { status: 400 })
// 不要只返回 500，区分 400（客户端错误）、401（未授权）、404（未找到）、500（服务端错误）
```

### 1.3 禁止裸 `catch`，必须记录上下文

```typescript
// ❌ 错误 — 丢失错误信息
catch (e) { setDjMessage('Signal lost') }

// ✅ 正确 — 保留错误上下文
catch (error) {
  console.error('[Player] Generate playlist failed:', error)
  setDjMessage('Signal lost. Try again.')
}
```

---

## 2. 类型安全 — 零 `any`

### 2.1 禁止使用 `any` 类型

```typescript
// ❌ 错误
const result = (completion as any).choices

// ✅ 正确 — 定义明确的接口
interface LLMChoice {
  message: { content: string }
}
const result = (completion as { choices: LLMChoice[] })
```

### 2.2 所有 `import` 的第三方模块必须有类型声明

- 如果模块缺少类型，在 `types/` 下创建 `.d.ts` 声明
- 不使用 `// @ts-ignore` 跳过类型检查

### 2.3 函数签名必须声明返回类型

```typescript
// ❌ 错误 — 依赖类型推断
export async function getTrack(id: number) { ... }

// ✅ 正确 — 明确返回类型
export async function getTrack(id: number): Promise<Track | null> { ... }
```

---

## 3. API Route 规范

### 3.1 请求体验证 — 永远不要信任客户端输入

```typescript
// 每个 API route 开头必须验证输入
export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // 验证必填字段
    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json({ success: false, error: 'message is required' }, { status: 400 })
    }
    
    // 限制长度
    if (body.message.length > 500) {
      return NextResponse.json({ success: false, error: 'message too long' }, { status: 400 })
    }
    
    // ... 业务逻辑
  } catch (error) {
    // ...
  }
}
```

### 3.2 每个外部调用必须有超时

```typescript
// LLM 调用：最多 12 秒
// NCM 调用：最多 8 秒  
// Weather 调用：最多 5 秒
// TTS 调用：最多 10 秒

// 使用 AbortController 实现超时
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 8000)
try {
  const result = await fetch(url, { signal: controller.signal })
} finally {
  clearTimeout(timeoutId)
}
```

### 3.3 外部调用必须有重试（最多 2 次）

```typescript
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === retries) throw error
      await new Promise(r => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw new Error('unreachable')
}
```

---

## 4. 前端组件规范

### 4.1 所有 props 必须有类型定义

```typescript
// ✅ 正确 — 使用 interface
interface TrackCardProps {
  track: Track
  isActive: boolean
  onClick: () => void
}

export function TrackCard({ track, isActive, onClick }: TrackCardProps) {
  // ...
}
```

### 4.2 事件处理器必须处理加载/禁用状态

```typescript
// 按钮在加载时必须禁用，防止重复提交
<button 
  onClick={handleAction} 
  disabled={isLoading}
>
  {isLoading ? 'Loading...' : 'Action'}
</button>
```

### 4.3 列表渲染必须使用稳定的 key

```typescript
// ❌ 错误 — 使用 index 作为 key（列表会重排序）
{items.map((item, idx) => <div key={idx}>{item.name}</div>)}

// ✅ 正确 — 使用唯一 ID
{items.map(item => <div key={item.id}>{item.name}</div>)}
```

### 4.4 禁止在组件中直接操作 DOM

- 使用 React refs 和事件系统
- 特殊情况（如 canvas、音频）除外，但必须注释说明原因

---

## 5. 状态管理

### 5.1 相关状态必须组合使用

```typescript
// ❌ 错误 — 16 个独立的 useState
const [a, setA] = useState()
const [b, setB] = useState()
const [c, setC] = useState()
// ...

// ✅ 正确 — 相关的状态组合在一起
interface PlayerState {
  isPlaying: boolean
  currentTrack: Track | null
  currentTime: number
  duration: number
}
const [state, setState] = useState<PlayerState>({ ... })
```

### 5.2 异步操作必须有明确的加载状态

```typescript
const [loading, setLoading] = useState(false)

async function handleAction() {
  setLoading(true)
  try {
    await doSomething()
  } finally {
    // finally 确保即使出错也重置状态
    setLoading(false)
  }
}
```

### 5.3 localStorage 操作必须包装在 try-catch 中

```typescript
// 私有模式或存储满时会抛出异常
try {
  localStorage.setItem('key', value)
} catch (error) {
  console.warn('[Storage] Failed to save:', error)
}
```

---

## 6. 音频处理规范

### 6.1 所有 Audio 元素必须在 useEffect 中清理

```typescript
useEffect(() => {
  const audio = new Audio()
  
  // 添加事件监听
  const onEnded = () => { /* ... */ }
  audio.addEventListener('ended', onEnded)
  
  // 清理函数必须移除所有监听器
  return () => {
    audio.removeEventListener('ended', onEnded)
    audio.pause()
    audio.src = ''
  }
}, [])
```

### 6.2 播放 Promise 必须处理

```typescript
// 浏览器可能在用户未交互时拒绝播放
const playPromise = audio.play()
if (playPromise !== undefined) {
  playPromise.catch(error => {
    console.warn('[Audio] Play interrupted:', error.message)
  })
}
```

### 6.3 TTS 和音乐音频必须保持隔离

- 音乐：`audioRef.current`
- TTS：`ttsAudioRef.current`
- 永远不要混用两个音频元素的 src

---

## 7. 安全性

### 7.1 敏感信息永远不输出到日志

```typescript
// ❌ 错误 — 泄露 API Key
console.log('Using key:', process.env.DEEPSEEK_API_KEY)

// ✅ 正确 — 只记录是否存在
console.log('[LLM] API key configured:', !!process.env.DEEPSEEK_API_KEY)
```

### 7.2 认证比较必须使用常量时间

```typescript
// 已实现 timingSafeEquals，所有 token 比较必须使用它
// 不要使用 === 或 !== 比较认证 token
```

### 7.3 用户输入必须转义后再显示

- 所有用户输入的内容在渲染到 HTML 前，确保不包含可执行脚本
- React 默认转义，但如果使用 `dangerouslySetInnerHTML` 必须经过净化

---

## 8. LLM 交互规范

### 8.1 所有 LLM 输出必须验证

```typescript
// LLM 可能返回格式错误的 JSON
function parseLLMResponse(raw: string): DJResponse {
  try {
    const data = JSON.parse(raw)
    // 验证每个字段
    if (!Array.isArray(data.play)) {
      throw new Error('play must be an array')
    }
    return normalizeResponse(data)
  } catch (error) {
    console.error('[LLM] Parse error:', error)
    return fallbackResponse
  }
}
```

### 8.2 Prompt 组装必须控制 token 数量

- 最近播放：最多 10 首
- 收藏歌单：最多 30 首（随机采样）
- 所有 prompt 总长度不超过 4000 字符

### 8.3 降级策略必须优雅

```typescript
// LLM 失败时不要返回空，提供合理的默认响应
return {
  say: '让我再想想...',
  play: [],
  reason: 'LLM unavailable',
  segue: 'warm',
}
```

---

## 9. Git 提交规范

### 9.1 提交信息格式

```
type(scope): description

type: feat | fix | refactor | docs | style | test | chore
scope: 影响的模块（player | api | lib | components | hooks）
```

示例：
```
feat(player): add lyrics poster generation
fix(api): add timeout to LLM calls
refactor(lib): extract DJService from route handlers
```

### 9.2 每个提交必须是完整的

- 不要提交破坏 build 的代码
- 相关改动放在同一个提交中
- 大的改动分成多个小提交，每个提交都能独立运行

---

## 10. 开发流程 — 每次编码必须遵守

### Step 0: 接任务 → 理解上下文

1. **读相关代码** — 不要凭记忆写代码，先找到涉及的文件，用 `read_file` 读一遍
2. **检查是否有既有约定** — 查看 `AGENTS.md` 的 Gotchas 和 Extension points
3. **确认依赖影响范围** — 改 API route → 检查 middleware 是否要放行；改类型 → 检查所有引用处

### Step 1: 规划 → 写计划再动手

1. **大改动先写计划**（>50 行改动）— 在 `.hermes/plans/` 写 markdown 计划，列出：
   - 要改哪些文件
   - 每个文件改什么
   - 可能的风险点
2. **小改动可以直接干**（<50 行）— 但在动手前先在脑子里过一遍步骤

### Step 2: 编码 → 小步快跑

1. **一次只做一件事** — 不要同时重构 + 加新功能
2. **每改完一个文件就验证** — `npm run build` 能通过才继续下一个
3. **写代码时对照规约检查** — 特别是：有没有裸 `catch`、有没有 `any`、超时设了没

### Step 3: 验证 → 自己先过一遍

每次提交前必须完成以下检查：

```bash
npm run build   # 构建必须通过
npm run lint    # 不能有新的 lint 错误
```

然后**手动验证核心流程**：
- 改了播放相关 → 确认能播放、切歌、暂停
- 改了 API → 确认返回格式正确
- 改了 UI → 确认移动端不崩

### Step 4: 提交 → 完整的提交信息

- 提交信息说明"改了什么 + 为什么改"
- 如果有破坏性变更（API 格式变了、localStorage key 变了），在提交信息中写明迁移方案
- 不要一次提交里混入不相关的改动

### Step 5: 文档 → 保持同步

- 新增了 API route → 更新 `AGENTS.md` 的架构概览
- 新增了 env var → 更新 `AGENTS.md` 的环境变量表
- 发现了新的坑 → 更新 `DEV_CONVENTIONS.md` 的反模式表

### ⚡ 流程速查卡

```
接任务 → 读代码 → 定计划 → 编码 → build通过 → lint通过 → 手动验证 → 提交 → 更新文档
                                    ↑ 失败就停下来修                     ↑ 不完整就重写
```

### 🚨 红旗 — 遇到这些情况立即停止

| 情况 | 为什么 | 应该怎么做 |
|------|--------|-----------|
| 改了 3 个文件还没 build 通过 | 越积越难修 | 停下来先让 build 通过 |
| 凭记忆写代码没读源文件 | 代码可能已经变了 | 先 `read_file` 确认 |
| 发现要改的地方比预期多 3 倍 | 说明没理解清楚 | 退回 Step 1 重新规划 |
| 用了 `as any` 或裸 `catch` | 违反规约 | 立即改回来 |

---

## 反模式清单 — 绝对不要这样做

| 反模式 | 为什么不行 | 正确做法 |
|--------|-----------|---------|
| 裸 `catch {}` | 错误被隐藏，调试困难 | 记录错误 + 降级 |
| `as any` | 失去类型安全 | 定义接口 |
| `setTimeout` 不 `clearTimeout` | 内存泄漏 | 在 cleanup 中清除 |
| 事件监听器不移除 | 内存泄漏 | useEffect cleanup |
| 不处理 Play Promise | 未捕获的 Promise rejection | `.catch()` 处理 |
| 直接 `request.json()` 不验证 | 可能崩溃 | 检查字段存在性 |
| `localStorage` 不 try-catch | 私有模式会崩溃 | 包装在 try-catch 中 |
| LLM 调用不设超时 | 请求永远挂起 | AbortController + 超时 |

---

*本文档随项目演进持续更新。发现新的规约需求时，及时补充。*
