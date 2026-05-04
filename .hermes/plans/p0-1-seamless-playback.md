# P0-1: 播放无缝衔接 — 自动预加载下一批歌单

## 涉及文件
1. `hooks/useAudioPlayer.ts` — 新增 onPlaylistNearEnd 回调
2. `app/player/page.tsx` — 监听回调，后台预加载新歌单
3. `lib/types.ts` — 新增类型（如需）

## 开发步骤

### Step 1: useAudioPlayer 新增 onPlaylistNearEnd 回调
- 当前已有 `onTrackNearEnd`（剩余15s触发），用于播放 djIntro
- 新增 `onPlaylistNearEnd`：当播放到**最后一首**的剩余 30s 时触发
- 逻辑：在 `handleTimeUpdate` 中检测 `currentIndex === playlist.length - 1 && duration - currentTime <= 30`

### Step 2: player/page.tsx 预加载逻辑
- 在 `handleTrackNearEnd` 之后新增 `handlePlaylistNearEnd` 回调
- 触发时：调用 `/api/plan` 获取下一批歌单
- 新歌单通过 `player.appendPlaylist()` 追加到当前队列末尾
- 同时播放 TTS 播报："接下来我为你准备了..."

### Step 3: 异常处理
- 预加载失败（LLM超时/网络错误）：不中断播放，显示友好提示
- 防止重复触发：用 useRef 记录已触发的批次

### Step 4: 测试用例
- `hooks/__tests__/useAudioPlayer.test.ts` — 测试 onPlaylistNearEnd 触发时机
- `app/api/__tests__/plan.test.ts` — 测试 plan API 正常返回

## 风险点
- 并发调用 /api/plan 时可能重复生成（需要加锁）
- TTS 播报和 DJ intro 可能重叠（需要队列管理）
- 最后一首歌曲如果很短（<30s），触发时机可能不精准
