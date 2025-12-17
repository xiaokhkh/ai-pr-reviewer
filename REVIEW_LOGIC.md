# Review 逻辑详解

本文档详细阐述 AI PR Reviewer 的代码审查逻辑和工作流程。

## 整体架构

项目采用**双 Bot 架构**：
- **Light Bot** (`glm_light_model`): 用于快速摘要任务，如文件变更摘要
- **Heavy Bot** (`glm_heavy_model`): 用于深度代码审查任务

## 核心流程

### 1. 初始化阶段 (`src/main.ts`)

```typescript
// 1. 读取配置参数
const options = new Options(...)

// 2. 创建两个 Bot 实例
const lightBot = new Bot(new GLMClient(apiKey, lightModel, systemMessage, endpoint))
const heavyBot = new Bot(new GLMClient(apiKey, heavyModel, systemMessage, endpoint))

// 3. 根据事件类型执行不同逻辑
if (pull_request || pull_request_target) {
  await codeReview(lightBot, heavyBot, options, prompts)
} else if (pull_request_review_comment) {
  await handleReviewComment(heavyBot, options, prompts)
}
```

### 2. PR Review 主流程 (`src/review.ts`)

#### 2.1 前置检查

1. **事件类型验证**: 确保是 `pull_request` 或 `pull_request_target` 事件
2. **忽略关键词检查**: 如果 PR 描述包含 `@coderabbitai: ignore`，跳过审查
3. **查找已有评论**: 查找是否已存在摘要评论（`SUMMARIZE_TAG`）

#### 2.2 增量审查机制

这是项目的核心特性之一：**只审查新增的变更，避免重复审查**。

```typescript
// 1. 获取所有提交的 commit IDs
const allCommitIds = await commenter.getAllCommitIds()

// 2. 找到已审查的最高 commit ID
let highestReviewedCommitId = commenter.getHighestReviewedCommitId(...)

// 3. 如果没有已审查的 commit，从 base commit 开始
if (highestReviewedCommitId === '') {
  highestReviewedCommitId = context.payload.pull_request.base.sha
}

// 4. 获取增量 diff（从已审查的 commit 到最新 commit）
const incrementalDiff = await octokit.repos.compareCommits({
  base: highestReviewedCommitId,
  head: context.payload.pull_request.head.sha
})
```

**优势**：
- 每次 PR 更新时，只审查新增的提交
- 节省 API 调用成本
- 减少重复审查的噪音

#### 2.3 文件过滤

```typescript
// 1. 路径过滤（根据 path_filters 配置）
const filterSelectedFiles = files.filter(file => 
  options.checkPath(file.filename)
)

// 2. 文件数量限制（根据 max_files 配置）
if (options.maxFiles > 0 && files.length > options.maxFiles) {
  // 只处理前 maxFiles 个文件
}
```

#### 2.4 文件内容提取

对每个选中的文件：
1. 获取文件在 base commit 中的完整内容
2. 解析 diff，提取每个 hunk（代码块）的：
   - 起始行号
   - 结束行号
   - 新旧代码片段

```typescript
const patches: Array<[number, number, string]> = []
for (const patch of splitPatch(file.patch)) {
  const patchLines = patchStartEndLine(patch)  // 获取行号范围
  const hunks = parsePatch(patch)              // 解析新旧代码
  patches.push([startLine, endLine, hunksStr])
}
```

### 3. 摘要生成阶段（Light Bot）

#### 3.1 文件级摘要

对每个文件，使用 **Light Bot** 生成摘要：

```typescript
const doSummary = async (filename, fileContent, fileDiff) => {
  // 1. 构建摘要提示词
  const summarizePrompt = prompts.renderSummarizeFileDiff(inputs, ...)
  
  // 2. 检查 token 限制
  if (tokens > options.lightTokenLimits.requestTokens) {
    return null  // 跳过
  }
  
  // 3. 调用 Light Bot
  const [summarizeResp] = await lightBot.chat(summarizePrompt)
  
  // 4. 解析分类结果（如果启用）
  // 格式: [TRIAGE]: <NEEDS_REVIEW or APPROVED>
  const triageMatch = summarizeResp.match(/\[TRIAGE\]:\s*(NEEDS_REVIEW|APPROVED)/)
  
  return [filename, summary, needsReview]
}
```

**关键特性**：
- 如果 `review_simple_changes = false`，会进行智能分类
- 简单变更（如 typo 修复）会被标记为 `APPROVED`，跳过深度审查
- 复杂变更会被标记为 `NEEDS_REVIEW`，进入深度审查

#### 3.2 批量摘要聚合

将多个文件的摘要分批聚合（每批 10 个文件）：

```typescript
const batchSize = 10
for (let i = 0; i < summaries.length; i += batchSize) {
  const summariesBatch = summaries.slice(i, i + batchSize)
  // 将文件摘要添加到 inputs.rawSummary
  // 使用 Heavy Bot 聚合摘要
  const [summarizeResp] = await heavyBot.chat(
    prompts.renderSummarizeChangesets(inputs)
  )
  inputs.rawSummary = summarizeResp
}
```

#### 3.3 最终摘要生成

使用 **Heavy Bot** 生成：
1. **完整摘要** (`renderSummarize`): 包含概览、变更表格、诗歌
2. **简短摘要** (`renderSummarizeShort`): 用于快速查看
3. **发布说明** (`renderSummarizeReleaseNotes`): 如果未禁用

### 4. 代码审查阶段（Heavy Bot）

#### 4.1 文件筛选

只审查被标记为 `NEEDS_REVIEW` 的文件：

```typescript
const filesAndChangesReview = filesAndChanges.filter(([filename]) => {
  const needsReview = summaries.find(
    ([summaryFilename]) => summaryFilename === filename
  )?.[2] ?? true
  return needsReview
})
```

#### 4.2 代码块审查

对每个需要审查的文件：

```typescript
const doReview = async (filename, fileContent, patches) => {
  // 1. Token 限制管理
  // 计算基础 prompt tokens
  let tokens = getTokenCount(prompts.renderReviewFileDiff(ins))
  
  // 2. 打包多个 patch（在 token 限制内）
  let patchesToPack = 0
  for (const [, , patch] of patches) {
    const patchTokens = getTokenCount(patch)
    if (tokens + patchTokens > options.heavyTokenLimits.requestTokens) {
      break  // 超出限制，停止打包
    }
    tokens += patchTokens
    patchesToPack += 1
  }
  
  // 3. 获取已有评论链（用于上下文）
  const commentChains = await commenter.getCommentChainsWithinRange(
    prNumber, filename, startLine, endLine
  )
  
  // 4. 构建审查提示词
  ins.patches += patch
  if (commentChain !== '') {
    ins.patches += `---comment_chains---\n${commentChain}\n`
  }
  
  // 5. 调用 Heavy Bot 进行审查
  const [response] = await heavyBot.chat(
    prompts.renderReviewFileDiff(ins)
  )
  
  // 6. 解析审查结果
  const reviews = parseReview(response, patches, options.debug)
}
```

#### 4.3 评论解析和发布

```typescript
// 解析审查响应，提取：
// - 行号范围
// - 评论内容
// - 建议的代码修改
const reviews = parseReview(response, patches, options.debug)

// 对每个审查结果：
for (const review of reviews) {
  // 1. LGTM 检查（如果启用 review_comment_lgtm = false）
  if (review.comment.includes('LGTM')) {
    lgtmCount += 1
    continue  // 跳过 LGTM 评论
  }
  
  // 2. 发布评论到 GitHub
  await commenter.comment(
    review.comment,
    COMMENT_REPLY_TAG,
    'create'
  )
  
  // 3. 如果有代码建议，创建代码块评论
  if (review.suggestions.length > 0) {
    await commenter.codeReview(
      filename,
      review.startLine,
      review.endLine,
      review.comment
    )
  }
}
```

### 5. 评论管理 (`src/commenter.ts`)

#### 5.1 评论标签系统

使用 HTML 注释标签来标识不同类型的评论：

- `SUMMARIZE_TAG`: 摘要评论
- `COMMENT_REPLY_TAG`: 代码审查评论
- `RAW_SUMMARY_START_TAG` / `RAW_SUMMARY_END_TAG`: 原始摘要
- `SHORT_SUMMARY_START_TAG` / `SHORT_SUMMARY_END_TAG`: 简短摘要
- `COMMIT_ID_START_TAG` / `COMMIT_ID_END_TAG`: 已审查的 commit IDs

#### 5.2 评论更新策略

- **摘要评论**: 使用 `replace` 模式，更新已有评论
- **代码审查评论**: 使用 `create` 模式，创建新评论
- **评论链**: 支持在已有评论下回复，形成对话链

### 6. 并发控制

```typescript
// OpenAI API 并发限制
const openaiConcurrencyLimit = pLimit(options.openaiConcurrencyLimit)  // 默认 6

// GitHub API 并发限制
const githubConcurrencyLimit = pLimit(options.githubConcurrencyLimit)  // 默认 6

// 使用并发限制包装异步操作
await Promise.all(
  files.map(file =>
    openaiConcurrencyLimit(async () => await doSummary(file))
  )
)
```

### 7. 错误处理和重试

```typescript
// Bot 类中的重试逻辑
response = await pRetry(
  () => this.client.sendMessage(prompt, ids, { timeoutMs: options.openaiTimeoutMS }),
  { retries: options.openaiRetries }  // 默认 5 次
)
```

## 关键配置参数

### 审查控制

- `review_simple_changes`: 是否审查简单变更（默认 `false`）
- `review_comment_lgtm`: 是否发布 LGTM 评论（默认 `false`）
- `disable_review`: 是否禁用代码审查（默认 `false`）
- `max_files`: 最大审查文件数（默认 `150`，0 表示无限制）

### 模型配置

- `glm_light_model`: 轻型模型（默认 `glm-4.5-flash`）
- `glm_heavy_model`: 重型模型（默认 `glm-4.6`）
- `llm_endpoint`: GLM API 端点（默认官方端点）

### 性能配置

- `openai_concurrency_limit`: OpenAI API 并发数（默认 `6`）
- `github_concurrency_limit`: GitHub API 并发数（默认 `6`）
- `openai_timeout_ms`: API 超时时间（默认 `360000` ms）
- `openai_retries`: 重试次数（默认 `5`）

## Review 提示词系统 (`src/prompts.ts`)

### System Message

定义 AI 的角色和审查重点（在 `action.yml` 中配置）：

- **Logic**: 检查冗余逻辑、条件语句、循环、异步调用
- **Component Design**: 组件命名、Props/State 设计、生命周期管理
- **Functions/Methods**: 函数逻辑简洁性、代码复用
- **Events/Interactions**: 事件处理清晰性和安全性
- **Data Flow/State Management**: 状态管理清晰性、数据竞争
- **Performance and Security**: 性能瓶颈、内存泄漏、安全性
- **Optimization/Refactoring**: TODO/FIXME 标记、改进建议
- **Best Practices**: DRY、SOLID、KISS 原则

### 提示词模板

1. **`renderSummarizeFileDiff`**: 文件变更摘要
2. **`renderSummarizeChangesets`**: 批量摘要聚合
3. **`renderSummarize`**: 最终完整摘要
4. **`renderSummarizeShort`**: 简短摘要
5. **`renderSummarizeReleaseNotes`**: 发布说明
6. **`renderReviewFileDiff`**: 代码审查

## 交互式审查 (`src/review-comment.ts`)

当用户回复评论时，触发 `pull_request_review_comment` 事件：

```typescript
const handleReviewComment = async (heavyBot, options, prompts) => {
  // 1. 获取评论上下文
  const comment = context.payload.comment
  const prNumber = context.payload.pull_request.number
  
  // 2. 获取相关代码 diff
  const diff = await commenter.getDiffForComment(comment)
  
  // 3. 构建对话提示词（包含历史对话）
  const prompt = prompts.renderReviewComment(inputs, comment, diff)
  
  // 4. 调用 Heavy Bot 生成回复
  const [response] = await heavyBot.chat(prompt)
  
  // 5. 发布回复评论
  await commenter.comment(response, COMMENT_REPLY_TAG, 'create')
}
```

## 总结

### 核心优势

1. **增量审查**: 只审查新增变更，节省成本和时间
2. **智能分类**: 自动识别简单变更，跳过不必要的深度审查
3. **双模型架构**: 轻量模型处理摘要，重量模型处理深度审查
4. **上下文感知**: 考虑已有评论链，支持对话式审查
5. **并发优化**: 通过并发控制提高处理效率
6. **错误恢复**: 重试机制和错误处理确保稳定性

### 工作流程总结

```
PR 事件触发
  ↓
检查忽略关键词
  ↓
查找已审查的 commit
  ↓
获取增量 diff
  ↓
文件过滤（路径、数量限制）
  ↓
【并行】文件摘要（Light Bot）
  ↓
批量聚合摘要（Heavy Bot）
  ↓
生成最终摘要和发布说明（Heavy Bot）
  ↓
筛选需要审查的文件
  ↓
【并行】代码审查（Heavy Bot）
  ↓
解析并发布评论
  ↓
更新摘要评论（包含已审查的 commit IDs）
```

这个设计既保证了审查质量，又优化了成本和性能。
