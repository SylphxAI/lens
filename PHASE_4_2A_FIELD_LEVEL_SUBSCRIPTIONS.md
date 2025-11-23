# Phase 4.2a: Field-Level Subscriptions (Framework-Agnostic) - Complete

**日期**: 2025-01-23
**狀態**: ✅ Implemented
**測試**: 218/218 passing (+26 new tests)

---

## 🎯 目標達成

實現 framework-agnostic 的 field-level subscription API，解決：
- ✅ 統一處理不同粒度的更新（model level、field level、streaming level）
- ✅ Streaming fields 支持（onStart/onDelta/onEnd）
- ✅ Regular fields 支持（onChange）
- ✅ 自動路由事件到對應 handlers
- ✅ 完整的類型推斷和錯誤處理

---

## 📦 新增功能

### 1. Field-Level Subscription Types

提供兩種 field subscription 模式：

#### Streaming Field Handlers（用於 AI 生成內容）

```typescript
import { type StreamingFieldHandlers } from '@sylphx/lens-core';

const streamingHandler: StreamingFieldHandlers<string> = {
  onStart: (value) => {
    // 開始 streaming
    console.log('Started:', value);  // value = ""
  },

  onDelta: (delta) => {
    // 增量更新
    console.log('Delta:', delta);
    // delta = { op: 'insert', pos: 0, text: 'Hello' }
  },

  onEnd: (value) => {
    // Streaming 完成
    console.log('Completed:', value);  // value = "Hello World"
  },

  onError: (error) => {
    // 錯誤處理
    console.error('Error:', error);
  },
};
```

#### Regular Field Handlers（用於一般欄位）

```typescript
import { type FieldHandlers } from '@sylphx/lens-core';

const regularHandler: FieldHandlers<string> = {
  onChange: (value, oldValue) => {
    // 值變更
    console.log('Changed:', oldValue, '→', value);
  },

  onError: (error) => {
    // 錯誤處理
    console.error('Error:', error);
  },
};
```

---

### 2. Delta Operations

定義增量更新操作：

```typescript
import { type DeltaOperation, applyDelta } from '@sylphx/lens-core';

// Insert operation
const delta1: DeltaOperation = {
  op: 'insert',
  pos: 5,
  text: ' World'
};
applyDelta('Hello', delta1);  // "Hello World"

// Delete operation
const delta2: DeltaOperation = {
  op: 'delete',
  pos: 5,
  deleteCount: 6
};
applyDelta('Hello World', delta2);  // "Hello"

// Replace operation
const delta3: DeltaOperation = {
  op: 'replace',
  text: 'Goodbye'
};
applyDelta('Hello', delta3);  // "Goodbye"
```

---

### 3. Field Subscription Options

擴展 Resource API 支持 field-level subscriptions：

```typescript
import { defineResource } from '@sylphx/lens-core';
import { z } from 'zod';

const Session = defineResource({
  name: 'session',
  fields: z.object({
    id: z.string(),
    title: z.string(),
    status: z.enum(['active', 'completed']),
    messageCount: z.number(),
  }),
  updateStrategy: {
    mode: 'auto',
    streamingFields: ['title'],  // 標記 streaming fields
  },
});

// 🆕 Field-level subscription
Session.api.get.subscribe(
  { id: '1' },
  {
    fields: {
      // Streaming field
      title: {
        onStart: (title) => console.log('Title started:', title),
        onDelta: (delta) => {
          currentTitle = applyDelta(currentTitle, delta);
          console.log('Current title:', currentTitle);
        },
        onEnd: (title) => console.log('Title completed:', title),
      },

      // Regular field
      status: {
        onChange: (status, oldStatus) => {
          console.log('Status changed:', oldStatus, '→', status);
        },
      },

      // Another regular field
      messageCount: {
        onChange: (count) => console.log('Message count:', count),
      },
    },
  },
  undefined,
  ctx
);
```

---

### 4. Field Subscription Manager

自動管理 field subscriptions 和事件分發：

```typescript
import {
  FieldSubscriptionManager,
  getFieldSubscriptionManager,
  type FieldUpdateEvent,
} from '@sylphx/lens-core';

// 使用全局 manager
const manager = getFieldSubscriptionManager();

// 訂閱
const unsubscribe = manager.subscribe('session-1', {
  title: {
    onStart: (title) => { /* ... */ },
    onDelta: (delta) => { /* ... */ },
    onEnd: (title) => { /* ... */ },
  },
});

// 分發事件（通常由 server 觸發）
manager.dispatch({
  entityId: 'session-1',
  fieldName: 'title',
  type: 'start',
  value: '',
});

manager.dispatch({
  entityId: 'session-1',
  fieldName: 'title',
  type: 'delta',
  delta: { op: 'insert', pos: 0, text: 'Hello' },
});

manager.dispatch({
  entityId: 'session-1',
  fieldName: 'title',
  type: 'end',
  value: 'Hello World',
});

// 取消訂閱
unsubscribe();
```

---

## 🚀 實際應用：解決 Code 項目的問題

### 問題：Session Title Streaming 混亂

**Before (tRPC + Manual Event Handling)**:
```typescript
// ❌ 分散的事件處理，容易出錯
socket.on('session:title:start', (data) => {
  setTitle('');
  setIsStreaming(true);
});

socket.on('session:title:delta', (delta) => {
  setTitle(prev => prev + delta);  // 手動拼接，容易出錯
});

socket.on('session:title:end', (final) => {
  setTitle(final);
  setIsStreaming(false);
});

socket.on('session:status:updated', (status) => {
  setStatus(status);  // 不同粒度，不一致
});

socket.on('session:usage:updated', (usage) => {
  setUsage(usage);  // 又是另一個粒度
});

// 不同粒度、不同事件、容易遺漏、難以維護
```

**After (Lens - Framework-Agnostic API)**:
```typescript
// ✅ 統一的 field-level subscription
import { Session, applyDelta } from '@/resources';

let currentTitle = '';

Session.api.get.subscribe(
  { id: sessionId },
  {
    fields: {
      // Streaming field - 自動處理 start/delta/end
      title: {
        onStart: (title) => {
          currentTitle = title;
          setTitle(title);
          setIsStreaming(true);
        },
        onDelta: (delta) => {
          currentTitle = applyDelta(currentTitle, delta);
          setTitle(currentTitle);
        },
        onEnd: (title) => {
          currentTitle = title;
          setTitle(title);
          setIsStreaming(false);
        },
      },

      // Regular fields - 直接值更新
      status: {
        onChange: (status) => setStatus(status),
      },

      usage: {
        onChange: (usage) => setUsage(usage),
      },
    },
  },
  undefined,
  ctx
);

// ✅ 統一粒度、統一 API、類型安全、不會遺漏
```

**Future (Lens React - High-Level API)**:
```typescript
// 🚀 將來的 lens-react 會自動處理所有細節
import { useSession } from '@sylphx/lens-react';

function SessionView({ sessionId }: { sessionId: string }) {
  const { data: session, isStreaming } = useSession({ id: sessionId });

  // ✅ 完全自動！
  // - title 自動應用 delta operations
  // - status, usage 自動更新
  // - isStreaming 自動追蹤
  // - 完整的類型推斷

  return (
    <div>
      <h1>{session.title} {isStreaming.title && <Spinner />}</h1>
      <p>Status: {session.status}</p>
      <p>Usage: {session.usage}</p>
    </div>
  );
}
```

---

## 🔧 Event Pattern Matching

Field subscription 使用 pattern matching 來路由事件：

```typescript
// Event pattern: `${resourceName}:${entityId}:field:${fieldName}`

// 示例事件
eventStream.publish('session:1:field:title', {
  entityId: '1',
  fieldName: 'title',
  type: 'delta',
  delta: { op: 'insert', pos: 0, text: 'Hello' },
});

eventStream.publish('session:1:field:status', {
  entityId: '1',
  fieldName: 'status',
  type: 'change',
  value: 'completed',
  oldValue: 'active',
});

// Pattern matching (在 Resource API 內部自動處理)
const pattern = new RegExp(`^session:${entityId}:field:`);
eventStream.subscribePattern(pattern, {
  next: (event: FieldUpdateEvent) => {
    manager.dispatch(event);  // 路由到對應的 field handler
  }
});
```

---

## 📊 架構設計

### Two-Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│  Layer 2: Framework-Specific (lens-react)           │
│  - useSession, useMutation hooks                    │
│  - 自動處理 onStart/onDelta/onEnd                    │
│  - 返回 reactive values                              │
│  - 開箱即用，零配置                                   │
└─────────────────────────────────────────────────────┘
                        ↓ uses
┌─────────────────────────────────────────────────────┐
│  Layer 1: Framework-Agnostic (lens-core) ✅         │
│  - Field subscription types                         │
│  - FieldSubscriptionManager                         │
│  - Event routing and dispatch                       │
│  - 完整控制，手動處理                                 │
└─────────────────────────────────────────────────────┘
```

### Event Flow

```
Server
  │
  ├─ AI generates: "H"
  ├─ AI generates: "e"
  ├─ AI generates: "llo"
  │
  ↓
EventStream
  │
  ├─ Publish: session:1:field:title (type: start, value: "")
  ├─ Publish: session:1:field:title (type: delta, delta: {op: insert, pos: 0, text: "H"})
  ├─ Publish: session:1:field:title (type: delta, delta: {op: insert, pos: 1, text: "e"})
  ├─ Publish: session:1:field:title (type: delta, delta: {op: insert, pos: 2, text: "llo"})
  ├─ Publish: session:1:field:title (type: end, value: "Hello")
  │
  ↓
Pattern Matching (^session:1:field:)
  │
  ↓
FieldSubscriptionManager
  │
  ├─ Get subscriptions for entity:session:1
  ├─ Route to title handlers
  │
  ↓
User Handlers
  │
  ├─ onStart("") → currentTitle = ""
  ├─ onDelta({op: insert, pos: 0, text: "H"}) → currentTitle = "H"
  ├─ onDelta({op: insert, pos: 1, text: "e"}) → currentTitle = "He"
  ├─ onDelta({op: insert, pos: 2, text: "llo"}) → currentTitle = "Hello"
  ├─ onEnd("Hello") → currentTitle = "Hello"
  │
  ↓
UI Update (React/Vue/etc)
```

---

## 🔧 API Reference

### Types

```typescript
// Delta operation
interface DeltaOperation {
  op: "insert" | "delete" | "replace";
  pos?: number;
  text?: string;
  deleteCount?: number;
}

// Streaming field handlers
interface StreamingFieldHandlers<TValue = any> {
  onStart?: (value: TValue) => void;
  onDelta?: (delta: DeltaOperation) => void;
  onEnd?: (value: TValue) => void;
  onError?: (error: Error) => void;
}

// Regular field handlers
interface FieldHandlers<TValue = any> {
  onChange?: (value: TValue, oldValue?: TValue) => void;
  onError?: (error: Error) => void;
}

// Combined handlers
type FieldSubscriptionHandlers<TValue = any> =
  | StreamingFieldHandlers<TValue>
  | FieldHandlers<TValue>;

// Field subscriptions
type FieldSubscriptions<TEntity = any> = {
  [K in keyof TEntity]?: FieldSubscriptionHandlers<TEntity[K]>;
};

// Subscription options
interface FieldSubscriptionOptions<TEntity = any> {
  fields?: FieldSubscriptions<TEntity>;
  select?: any;  // Legacy mode
  include?: any;
}

// Field update event
interface FieldUpdateEvent {
  entityId: string;
  fieldName: string;
  type: "start" | "delta" | "end" | "change" | "error";
  value?: any;
  delta?: DeltaOperation;
  error?: Error;
  oldValue?: any;
}
```

### Functions

```typescript
// Apply delta to string value
function applyDelta(currentValue: string, delta: DeltaOperation): string;

// Type guards
function isStreamingHandlers(handlers: FieldSubscriptionHandlers): handlers is StreamingFieldHandlers;
function isFieldHandlers(handlers: FieldSubscriptionHandlers): handlers is FieldHandlers;

// Manager
class FieldSubscriptionManager {
  subscribe(entityId: string, fields: FieldSubscriptions): () => void;
  dispatch(event: FieldUpdateEvent): void;
  clear(): void;
}

// Global manager
function getFieldSubscriptionManager(): FieldSubscriptionManager;
function setFieldSubscriptionManager(manager: FieldSubscriptionManager): void;
```

### Resource API

```typescript
// Field-level subscription
Resource.api.get.subscribe(
  input: { id: string },
  options?: {
    fields?: FieldSubscriptions<Entity>;
    select?: any;
    include?: any;
  },
  handlers?: {
    onData?: (data: Entity) => void;
    onError?: (error: Error) => void;
    onComplete?: () => void;
  },
  ctx?: QueryContext
): { unsubscribe: () => void };
```

---

## 🧪 測試覆蓋

```
✅ 26 new field subscription tests:

applyDelta utility (8 tests)
  ✅ insert operation
  ✅ delete operation
  ✅ replace operation
  ✅ insert at beginning/middle
  ✅ delete at beginning
  ✅ error handling (invalid operations)

FieldSubscriptionManager (12 tests)
  ✅ subscribes to field updates
  ✅ subscribes to streaming field updates
  ✅ handles errors in streaming/regular fields
  ✅ unsubscribes correctly
  ✅ isolates subscriber errors
  ✅ handles multiple subscribers
  ✅ handles onChange with oldValue
  ✅ clears all subscriptions

Resource API Integration (5 tests)
  ✅ subscribes to fields with streaming support
  ✅ subscribes to regular field changes
  ✅ subscribes to multiple fields simultaneously
  ✅ pattern matching works correctly
  ✅ unsubscribe stops receiving events

Real-world Scenarios (1 test)
  ✅ simulates AI-generated title streaming

Total: 218/218 tests passing (100%)
```

---

## 📝 實現細節

### 1. Subscriber Error Isolation

```typescript
// FieldSubscriptionManager.dispatch() 中的錯誤隔離
dispatch(event: FieldUpdateEvent): void {
  const handlers = this.subscriptions.get(`entity:${event.entityId}`)?.[event.fieldName];
  if (!handlers) return;

  try {
    switch (event.type) {
      case 'start':
        if (isStreamingHandlers(handlers) && handlers.onStart) {
          handlers.onStart(event.value);
        }
        break;
      // ... other cases
    }
  } catch (error) {
    // ✅ 隔離 subscriber errors，不影響其他 subscriptions
    console.error(`Error in field subscription handler:`, error);
  }
}
```

### 2. Pattern Matching Integration

```typescript
// api-generator.ts 中的 subscribeFields() 實現
subscribeFields(entityId: string, fields: any, ctx: QueryContext) {
  const manager = getFieldSubscriptionManager();

  // 訂閱到 manager
  const unsubscribe = manager.subscribe(entityId, fields);

  // 訂閱到 event stream (pattern matching)
  const eventPattern = new RegExp(`^${resource.name}:${entityId}:field:`);
  const subscription = ctx.eventStream!.subscribePattern(eventPattern, {
    next: (event: FieldUpdateEvent) => manager.dispatch(event)
  });

  // 返回綜合的 unsubscribe
  return {
    unsubscribe: () => {
      unsubscribe();
      subscription.unsubscribe();
    }
  };
}
```

### 3. Update Strategy Integration

Field subscriptions 和 update strategies 完美整合：

```typescript
const Session = defineResource({
  name: 'session',
  fields: z.object({
    title: z.string(),
    status: z.enum(['active', 'completed']),
  }),
  updateStrategy: {
    mode: 'auto',
    streamingFields: ['title'],  // ✅ 標記為 streaming field
  },
});

// 🎯 Server 端自動選擇策略
// - title: Delta strategy (因為 streamingFields)
// - status: Value strategy (因為 enum)

// 🎯 Client 端自動處理
Session.api.get.subscribe({ id: '1' }, {
  fields: {
    title: {
      onDelta: (delta) => { /* Delta strategy events */ },
    },
    status: {
      onChange: (value) => { /* Value strategy events */ },
    },
  },
});
```

---

## 🎯 解決的核心問題

### 1. ✅ 粒度不一致問題

**Before**: 不同事件使用不同粒度
- `session.update` - model level
- `session.title.start` - field level
- `session.title.delta` - streaming level
- `session.status.updated` - field level

**After**: 統一的 field-level API
- 所有更新都是 field-level
- Streaming fields 用 onStart/onDelta/onEnd
- Regular fields 用 onChange
- 完全一致的粒度

### 2. ✅ 事件處理分散問題

**Before**: 每個事件需要單獨處理
```typescript
socket.on('session:title:start', handleStart);
socket.on('session:title:delta', handleDelta);
socket.on('session:title:end', handleEnd);
socket.on('session:status:updated', handleStatus);
// 容易遺漏、難以維護
```

**After**: 統一的訂閱點
```typescript
Session.api.get.subscribe({ id: '1' }, {
  fields: {
    title: { onStart, onDelta, onEnd },
    status: { onChange },
  },
});
// 一個地方管理所有 field subscriptions
```

### 3. ✅ 類型安全問題

**Before**: Socket events 沒有類型推斷
```typescript
socket.on('session:title:delta', (delta) => {
  // delta 是 any，沒有類型安全
  setTitle(prev => prev + delta);
});
```

**After**: 完整的類型推斷
```typescript
Session.api.get.subscribe({ id: '1' }, {
  fields: {
    title: {
      onDelta: (delta: DeltaOperation) => {
        // ✅ delta 有完整的類型推斷
        currentTitle = applyDelta(currentTitle, delta);
      },
    },
  },
});
```

### 4. ✅ 錯誤處理問題

**Before**: 錯誤處理分散在各處
```typescript
socket.on('session:title:delta', (delta) => {
  try {
    setTitle(prev => prev + delta);
  } catch (error) {
    // 每個地方都要處理錯誤
  }
});
```

**After**: 統一的錯誤處理
```typescript
Session.api.get.subscribe({ id: '1' }, {
  fields: {
    title: {
      onDelta: (delta) => { /* ... */ },
      onError: (error) => {
        // ✅ 統一的錯誤處理點
        console.error('Title streaming error:', error);
      },
    },
  },
});
```

---

## 📈 下一步

Phase 4.2a 完成！接下來：

### Phase 4.2b: lens-react Package

創建高層次的 React hooks：

```typescript
// @sylphx/lens-react
import { useSession } from '@sylphx/lens-react';

function SessionView({ sessionId }: { sessionId: string }) {
  const { data, isStreaming, error } = useSession({ id: sessionId });

  // ✅ 完全自動：
  // - data.title 自動應用 delta operations
  // - isStreaming.title 追蹤 streaming 狀態
  // - error 統一錯誤處理
  // - 完整的類型推斷

  return (
    <div>
      <h1>
        {data.title}
        {isStreaming.title && <Spinner />}
      </h1>
      <p>Status: {data.status}</p>
    </div>
  );
}
```

### Phase 4.3: Transport Integration

整合 update strategies 到 transport layer：

```typescript
// 自動壓縮和編碼
transport.send({
  type: 'session.update',
  id: '1',
  data: encodeUpdate(Session, oldSession, newSession),
  // ✅ 自動使用最小 payload
});
```

### Phase 4.4: Code Project Integration

將 Lens 整合到實際 Code 項目：
- 定義 Session, Message resources
- 遷移 session.router.ts
- 遷移 message.router.ts
- 更新前端使用 Lens hooks
- 測試和驗證

---

## 🎉 成就解鎖

✅ **Framework-Agnostic Field Subscriptions** - 低層次 API 完成
✅ **Streaming Fields Support** - onStart/onDelta/onEnd 完整實現
✅ **Delta Operations** - 增量更新工具完成
✅ **Pattern Matching** - 事件路由完成
✅ **Error Isolation** - Subscriber 錯誤隔離
✅ **Type Safety** - 完整的類型推斷
✅ **Test Coverage** - 26 個新測試，100% 通過

**總測試數**: 218/218 passing (192 → 218, +26)
**代碼質量**: Zero TypeScript errors
**架構完整性**: Two-layer architecture ready
