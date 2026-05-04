# P1-3: LLM 流式输出优化

## 需求描述
当前 LLM 一次性返回完整 JSON，用户等待时间长。改为 streaming 输出，先返回 say 字段让 DJ 说话，后台异步 resolve tracks，减少等待焦虑。

## 开发步骤

### Step 1: lib/llm.ts 支持 stream 模式
- 新增 `callLLMStream()` 函数，返回 ReadableStream
- 使用 DeepSeek 的 stream 能力
- 先解析 say 字段，立即返回给前端

### Step 2: /api/plan route 改为 SSE 流式响应
- 使用 `new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })`
- 事件类型：
  - `say` — DJ 说辞（第一时间返回）
  - `tracks` — 解析完成的歌曲列表
  - `done` — 完成信号

### Step 3: 前端适配
- player/page.tsx 中 `handleGeneratePlaylist` 改为 fetch SSE
- 收到 say 事件 → 立即播放 TTS
- 收到 tracks 事件 → 更新播放队列

## 风险点
- DeepSeek 的 stream 支持需要确认
- 前端 SSE 解析需要处理连接中断
- 降级方案：流中断时返回已生成的内容
