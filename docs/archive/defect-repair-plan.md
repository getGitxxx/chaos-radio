# ChaosRadio 缺陷修复计划

---

## 文档信息

| 项目 | 内容 |
|------|------|
| **文档版本** | v1.0 |
| **创建日期** | 2026-05-12 |
| **适用版本** | ChaosRadio v2.0 |
| **作者** | Architecture Analysis |

---

## 一、缺陷清单汇总

### 1.1 架构层面缺陷

| ID | 缺陷描述 | 位置 | 风险等级 |
|----|----------|------|----------|
| **ARC-001** | Serverless 内存缓存不可靠，全局变量 `memoryCache` 在函数实例销毁/复用时状态不一致 | `lib/taste-profile.ts:48` | **高** |
| **ARC-002** | 缓存策略不完善，收藏缓存和品味画像缓存没有过期时间限制 | `lib/ncm.ts:497-507` | **高** |

### 1.2 安全层面缺陷

| ID | 缺陷描述 | 位置 | 风险等级 |
|----|----------|------|----------|
| **SEC-001** | 所有 API 路由缺少请求限流机制，可能被恶意攻击耗尽资源 | 所有 `app/api/*/route.ts` | **高** |
| **SEC-002** | LLM Prompt 完整输出到日志，可能泄露用户敏感信息（收藏歌曲列表） | `lib/llm.ts:57-60` | **高** |
| **SEC-003** | API 请求缺少来源验证，攻击者可伪造请求 | 所有 `app/api/*/route.ts` | **中** |

### 1.3 代码质量缺陷

| ID | 缺陷描述 | 位置 | 风险等级 |
|----|----------|------|----------|
| **COD-001** | `app/api/plan/route.ts` 重复实现 DJService 逻辑 | `app/api/plan/route.ts` vs `lib/services/dj-service.ts` | **中** |
| **COD-002** | `lib/ncm.ts` 大量使用 `any` 类型处理 NCM API 返回 | `lib/ncm.ts:50-63` | **中** |
| **COD-003** | `lib/llm.ts` 使用类型断言绕过类型检查 | `lib/llm.ts:69` | **中** |
| **COD-004** | 部分 catch 块静默失败，错误信息不够详细 | `lib/ncm.ts:103`, `lib/taste-profile.ts:154` | **中** |

### 1.4 性能层面缺陷

| ID | 缺陷描述 | 位置 | 风险等级 |
|----|----------|------|----------|
| **PERF-001** | 收藏同步时歌单获取串行执行，同步时间过长（最多 45s） | `lib/ncm.ts:404-416` | **中** |
| **PERF-002** | 缺少性能监控工具，无法追踪关键路径性能瓶颈 | 全局 | **中** |

### 1.5 用户体验缺陷

| ID | 缺陷描述 | 位置 | 风险等级 |
|----|----------|------|----------|
| **UX-001** | 移动端键盘遮挡问题处理不完善 | `app/player/page.tsx:287-299` | **低** |
| **UX-002** | 部分操作缺少加载状态指示 | `app/player/page.tsx` | **低** |

### 1.6 测试覆盖缺陷

| ID | 缺陷描述 | 位置 | 风险等级 |
|----|----------|------|----------|
| **TEST-001** | 核心模块测试覆盖不足 | `lib/services/dj-service.ts`, `lib/context.ts` | **中** |

---

## 二、修复优先级排序

| 优先级 | 缺陷 ID | 缺陷描述 | 风险等级 | 修复难度 | 预计工时 |
|--------|---------|----------|----------|----------|----------|
| **P0** | SEC-001 | 缺少请求限流机制 | 高 | 低 | 2h |
| **P0** | SEC-002 | LLM Prompt 日志泄露 | 高 | 低 | 1h |
| **P0** | ARC-001 | Serverless 内存缓存不可靠 | 高 | 中 | 4h |
| **P1** | ARC-002 | 缓存缺少过期时间 | 高 | 低 | 2h |
| **P1** | COD-001 | 代码重复 | 中 | 中 | 4h |
| **P1** | COD-002 | NCM API 类型不安全 | 中 | 中 | 3h |
| **P1** | PERF-001 | 串行请求性能问题 | 中 | 中 | 3h |
| **P2** | COD-003 | LLM 类型断言 | 中 | 低 | 2h |
| **P2** | COD-004 | 错误处理不一致 | 中 | 低 | 2h |
| **P2** | PERF-002 | 缺少性能监控 | 中 | 高 | 6h |
| **P2** | SEC-003 | 缺少请求来源验证 | 中 | 低 | 2h |
| **P3** | TEST-001 | 测试覆盖不足 | 中 | 高 | 8h |
| **P3** | UX-001 | 移动端键盘问题 | 低 | 中 | 3h |
| **P3** | UX-002 | 加载状态指示不足 | 低 | 低 | 2h |

---

## 三、详细修复方案

### 3.1 P0 级修复

#### SEC-001: 请求限流机制

**修复目标**：防止恶意请求耗尽 API 资源

**修复方案**：
```typescript
// 新增 lib/middleware/rate-limit.ts
export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

export function createRateLimit(options: RateLimitOptions) {
  const store = new Map<string, { count: number; resetAt: number }>();
  
  return async function rateLimit(request: Request): Promise<{ allowed: boolean; retryAfter?: number }> {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();
    
    const entry = store.get(ip);
    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + options.windowMs });
      return { allowed: true };
    }
    
    if (entry.count >= options.maxRequests) {
      return { 
        allowed: false, 
        retryAfter: Math.ceil((entry.resetAt - now) / 1000) 
      };
    }
    
    entry.count++;
    return { allowed: true };
  };
}
```

**实施位置**：所有 API 路由入口

**验收标准**：
- 单 IP 每分钟最多 60 次请求
- 超过限制返回 429 状态码
- `Retry-After` 响应头正确设置

---

#### SEC-002: LLM Prompt 日志脱敏

**修复目标**：防止用户敏感信息泄露到日志

**修复方案**：
```typescript
// 修改 lib/llm.ts
// 删除完整 Prompt 输出，改为仅记录关键指标

// 替换原有日志代码
// console.log('--- [LLM FULL PROMPT START] ---');
// messages.forEach((m, i) => {
//   console.log(`[${i}] ${m.role.toUpperCase()}:\n${m.content}\n`);
// });
// console.log('--- [LLM FULL PROMPT END] ---');

// 改为：
console.log('[LLM] Calling model:', model);
console.log('[LLM] Prompt tokens:', systemPrompt.length + userMessage.length);
console.log('[LLM] History messages:', history.length);
```

**实施位置**：`lib/llm.ts:57-60`

**验收标准**：
- 生产环境不再输出完整 Prompt
- 日志仅包含模型名称、Token 数量、历史消息数

---

#### ARC-001: Serverless 内存缓存修复

**修复目标**：确保缓存状态在 Serverless 环境中可靠

**修复方案**：
```typescript
// 修改 lib/taste-profile.ts
// 移除全局 memoryCache，只依赖文件缓存

// 删除：let memoryCache: CachedProfile | null = null;

// 修改 getCachedTasteProfile 和 generateTasteProfile
// 移除所有 memoryCache 相关代码
// 只保留 /tmp 文件缓存逻辑
```

**实施位置**：`lib/taste-profile.ts`

**验收标准**：
- 移除全局变量缓存
- 多次请求间缓存状态一致
- 缓存失效逻辑正确

---

### 3.2 P1 级修复

#### ARC-002: 缓存过期机制

**修复目标**：防止缓存无限期有效

**修复方案**：
```typescript
// 修改 lib/ncm.ts 和 lib/taste-profile.ts

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

function isCacheValid(cached: CachedProfile): boolean {
  if (!cached.generatedAt) return false;
  return Date.now() - cached.generatedAt < CACHE_TTL;
}
```

**实施位置**：`lib/ncm.ts`, `lib/taste-profile.ts`

**验收标准**：
- 缓存 24 小时后自动过期
- 过期后自动重新生成

---

#### COD-001: 代码去重

**修复目标**：统一 DJService 使用，消除重复代码

**修复方案**：
```typescript
// 修改 app/api/plan/route.ts
// 删除重复的 buildContext 和 callLLM 调用
// 改为调用 DJService.generatePlaylist()
// 将 SSE 流式处理逻辑整合到 DJService 中

// 新增 DJService 方法
async *generatePlaylistStream(options: GeneratePlaylistOptions): AsyncGenerator<StreamEvent> {
  // 流式生成逻辑
}
```

**实施位置**：`app/api/plan/route.ts`, `lib/services/dj-service.ts`

**验收标准**：
- `app/api/plan` 不再重复实现 DJService 逻辑
- 所有 DJ 操作统一通过 DJService
- 功能行为保持不变

---

#### COD-002: NCM API 类型安全

**修复目标**：消除 `any` 类型，确保类型安全

**修复方案**：
```typescript
// 新增 lib/types/ncm.ts
export interface NCMSearchResult {
  id: number;
  name: string;
  artists: Array<{ id: number; name: string }>;
  album: { id: number; name: string; picUrl: string };
  duration: number;
}

export interface NCMSearchResponse {
  body: {
    result: {
      songs: NCMSearchResult[];
    };
  };
}

export function isNCMSearchResponse(data: unknown): data is NCMSearchResponse {
  if (typeof data !== 'object' || data === null) return false;
  const response = data as NCMSearchResponse;
  return (
    typeof response.body === 'object' &&
    typeof response.body.result === 'object' &&
    Array.isArray(response.body.result.songs)
  );
}
```

**实施位置**：`lib/ncm.ts`

**验收标准**：
- 移除所有 `any` 类型
- 使用类型守卫进行运行时验证
- TypeScript 编译无错误

---

#### PERF-001: 并行化歌单获取

**修复目标**：减少收藏同步时间

**修复方案**：
```typescript
// 修改 lib/ncm.ts:404-416
// 将串行获取改为并行获取

// 替换原有代码
// for (let i = 0; i < ownPlaylists.length; i += batchSize) {
//   checkDeadline();
//   const batch = ownPlaylists.slice(i, i + batchSize);
//   const results = await Promise.allSettled(
//     batch.map((p) => getPlaylistTracks(p.id, 200))
//   );
//   // ...
// }

// 改为：
const promises = ownPlaylists.map(p => getPlaylistTracks(p.id, 200));
const results = await Promise.allSettled(promises);

for (const r of results) {
  if (r.status === 'fulfilled') {
    allTracks.push(...r.value);
  }
}
```

**实施位置**：`lib/ncm.ts`

**验收标准**：
- 歌单获取并行执行
- 同步时间从 O(n) 优化为 O(1)
- 保持软超时保护

---

### 3.3 P2 级修复

#### COD-003: LLM 类型断言

**修复目标**：消除不安全的类型断言

**修复方案**：
```typescript
// 修改 lib/llm.ts
// 定义完整接口替代类型断言

interface DeepSeekCompletion {
  choices: Array<{
    message: { content: string | null };
  }>;
}

// 使用类型守卫
function isDeepSeekCompletion(data: unknown): data is DeepSeekCompletion {
  if (typeof data !== 'object' || data === null) return false;
  const completion = data as DeepSeekCompletion;
  return (
    Array.isArray(completion.choices) &&
    completion.choices.length > 0 &&
    typeof completion.choices[0].message === 'object'
  );
}
```

**实施位置**：`lib/llm.ts`

---

#### COD-004: 统一错误处理

**修复目标**：确保所有 catch 块都有适当的错误处理

**修复方案**：
```typescript
// 新增 lib/utils/error-handler.ts
export function logError(module: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(`[${module}] Error:`, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: Date.now(),
    ...context,
  });
}
```

**实施位置**：全局替换

---

#### PERF-002: 性能监控

**修复目标**：添加关键路径性能监控

**修复方案**：
```typescript
// 新增 lib/utils/performance.ts
export interface PerformanceMetric {
  operation: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
}

export async function trackPerformance<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    console.log(`[Perf] ${operation}: ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    console.log(`[Perf] ${operation} failed: ${Date.now() - start}ms`);
    throw error;
  }
}
```

**实施位置**：关键路径（LLM 调用、NCM API 调用）

---

#### SEC-003: 请求来源验证

**修复目标**：防止伪造请求

**修复方案**：
```typescript
// 新增 lib/middleware/origin-verify.ts
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
];

export function verifyOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const referrer = request.headers.get('referer');
  
  // 允许 API 请求来自允许的域名
  if (origin && ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
    return true;
  }
  
  // 允许来自自身的请求
  if (referrer && ALLOWED_ORIGINS.some(o => referrer.startsWith(o))) {
    return true;
  }
  
  return false;
}
```

**实施位置**：middleware.ts

---

### 3.4 P3 级修复

#### TEST-001: 测试覆盖

**修复目标**：增加核心模块测试覆盖率

**修复方案**：
```typescript
// 新增测试文件
// lib/__tests__/dj-service.test.ts
// lib/__tests__/context.test.ts
// lib/__tests__/ncm.test.ts
```

**验收标准**：
- DJService 核心方法测试覆盖率 ≥ 80%
- Context 构建逻辑测试覆盖率 ≥ 70%
- NCM API 封装测试覆盖率 ≥ 60%

---

#### UX-001: 移动端键盘处理

**修复目标**：优化移动端键盘弹出体验

**修复方案**：
```typescript
// 修改 app/player/page.tsx
// 优化键盘处理逻辑

useEffect(() => {
  const handleResize = () => {
    const isKeyboard = window.innerHeight - window.visualViewport?.height > 150;
    setIsKeyboardVisible(isKeyboard);
    
    if (isKeyboard && chatInputRef.current) {
      chatInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  
  window.visualViewport?.addEventListener('resize', handleResize);
  return () => window.visualViewport?.removeEventListener('resize', handleResize);
}, []);
```

---

#### UX-002: 统一加载状态

**修复目标**：确保所有操作都有加载状态指示

**修复方案**：
```typescript
// 修改 app/player/page.tsx
// 使用统一的加载状态管理

const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

function withLoading<T>(key: string, fn: () => Promise<T>): Promise<T> {
  setLoadingStates(prev => ({ ...prev, [key]: true }));
  return fn().finally(() => {
    setLoadingStates(prev => ({ ...prev, [key]: false }));
  });
}
```

---

## 四、实施计划

### 4.1 时间线

| 阶段 | 时间 | 修复内容 |
|------|------|----------|
| **Phase 1** | 第 1 周 | P0 级修复（SEC-001, SEC-002, ARC-001） |
| **Phase 2** | 第 2 周 | P1 级修复（ARC-002, COD-001, COD-002, PERF-001） |
| **Phase 3** | 第 3 周 | P2 级修复（COD-003, COD-004, PERF-002, SEC-003） |
| **Phase 4** | 第 4 周 | P3 级修复（TEST-001, UX-001, UX-002） |

### 4.2 资源分配

| 角色 | 职责 |
|------|------|
| **后端开发** | SEC-001, SEC-002, ARC-001, ARC-002, COD-001, COD-002, COD-003, COD-004, PERF-001, PERF-002, SEC-003 |
| **前端开发** | UX-001, UX-002 |
| **测试工程师** | TEST-001 |

### 4.3 测试计划

| 阶段 | 测试类型 | 覆盖范围 |
|------|----------|----------|
| 开发中 | 单元测试 | 新增工具函数、修改的模块 |
| Phase 1-4 | 集成测试 | API 路由、核心服务 |
| Phase 4 | E2E 测试 | 完整用户流程 |

---

## 五、验收标准

### 5.1 功能验收

| 缺陷 ID | 验收标准 |
|----------|----------|
| SEC-001 | 单 IP 每分钟最多 60 次请求，超出返回 429 |
| SEC-002 | 日志中不包含用户敏感信息 |
| ARC-001 | 缓存状态在多次请求间一致 |
| ARC-002 | 缓存 24 小时后自动过期 |
| COD-001 | 代码重复率降低，无重复逻辑 |
| COD-002 | TypeScript 编译无 `any` 错误 |
| PERF-001 | 收藏同步时间减少 50% 以上 |
| PERF-002 | 关键路径有性能日志输出 |
| TEST-001 | 核心模块测试覆盖率 ≥ 70% |
| UX-001 | 移动端键盘弹出时输入框可见 |
| UX-002 | 所有操作都有加载状态指示 |

### 5.2 非功能验收

| 指标 | 要求 |
|------|------|
| **构建** | `npm run build` 通过 |
| **Lint** | `npm run lint` 无错误 |
| **测试** | `npm run test` 通过 |
| **性能** | 首屏加载时间 < 3s |

---

## 六、风险评估

| 风险 | 描述 | 缓解策略 |
|------|------|----------|
| **回归风险** | 修改核心模块可能引入新问题 | 完善单元测试，CI/CD 自动测试 |
| **兼容性风险** | 缓存机制变更可能影响现有用户 | 保留向后兼容的缓存格式 |
| **性能影响** | 限流可能影响正常用户 | 设置合理的限流阈值 |
| **测试覆盖** | 部分模块测试难度大 | 优先测试核心路径 |

---

## 七、变更日志

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-05-12 | 初始版本 | Architecture Analysis |

---

*文档版本: v1.0*  
*生成时间: 2026-05-12*  
*适用项目: ChaosRadio*
