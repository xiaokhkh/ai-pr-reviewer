# 使用指南

## 在其他仓库中使用此 GitHub Action

### 1. 配置 Secret

在目标仓库的 **Settings → Secrets and variables → Actions** 中添加：

- `GLM_API_KEY`: 你的 GLM API Key

### 2. 创建 Workflow 文件

在目标仓库创建 `.github/workflows/ai-pr-review.yml`：

```yaml
name: AI PR Review

permissions:
  contents: read
  pull-requests: write

on:
  pull_request_target:
    types: [opened, synchronize, reopened]
  pull_request_review_comment:
    types: [created]

concurrency:
  group:
    ${{ github.repository }}-${{ github.event.number || github.head_ref ||
    github.sha }}-${{ github.workflow }}-${{ github.event_name ==
    'pull_request_review_comment' && 'pr_comment' || 'pr' }}
  cancel-in-progress: ${{ github.event_name != 'pull_request_review_comment' }}

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          repository: ${{github.event.pull_request.head.repo.full_name}}
          ref: ${{github.event.pull_request.head.ref}}
          submodules: false
      - uses: xiaokhkh/ai-pr-reviewer@v1.0.0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GLM_API_KEY: ${{ secrets.GLM_API_KEY }}
        with:
          debug: false
          review_comment_lgtm: false
          openai_heavy_model: glm-4.6
          openai_light_model: glm-4.5-flash
          path_filters: |
            !dist/**
            !**/*.lock
```

### 3. 版本说明

- `@v1.0.0`: 使用特定版本（推荐用于生产环境）
- `@v1`: 使用 v1 的最新版本
- `@latest`: 使用最新版本（不推荐，可能不稳定）
- `@main`: 使用 main 分支的最新代码（仅用于测试）

### 4. 配置选项

主要配置参数：

- `debug`: 启用调试模式（默认: `false`）
- `review_comment_lgtm`: 即使代码看起来很好也发表评论（默认: `false`）
- `openai_heavy_model`: 用于代码审查的重型模型（默认: `glm-4.6`）
- `openai_light_model`: 用于摘要的轻型模型（默认: `glm-4.5-flash`）
- `path_filters`: 文件路径过滤规则
- `max_files`: 最大审查文件数（默认: `150`）

更多配置选项请参考 `action.yml`。

### 5. 支持的 GLM 模型

**重型模型**（用于代码审查）：
- `glm-4.6`
- `glm-4.5`
- `glm-4.5-x`

**轻型模型**（用于摘要）：
- `glm-4.5-flash`
- `glm-4.5-air`
- `glm-4-plus`

### 6. 示例

#### 基础使用

```yaml
- uses: xiaokhkh/ai-pr-reviewer@v1.0.0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GLM_API_KEY: ${{ secrets.GLM_API_KEY }}
```

#### 自定义模型

```yaml
- uses: xiaokhkh/ai-pr-reviewer@v1.0.0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GLM_API_KEY: ${{ secrets.GLM_API_KEY }}
  with:
    openai_heavy_model: glm-4.5
    openai_light_model: glm-4.5-air
```

#### 自定义路径过滤

```yaml
- uses: xiaokhkh/ai-pr-reviewer@v1.0.0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GLM_API_KEY: ${{ secrets.GLM_API_KEY }}
  with:
    path_filters: |
      src/**
      !dist/**
      !**/*.test.ts
      !**/*.spec.ts
```

#### 启用调试模式

```yaml
- uses: xiaokhkh/ai-pr-reviewer@v1.0.0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GLM_API_KEY: ${{ secrets.GLM_API_KEY }}
  with:
    debug: true
```

### 7. 故障排除

**问题**: Action 没有运行
- 检查 workflow 文件语法是否正确
- 检查是否配置了正确的触发事件
- 检查仓库的 Actions 是否已启用

**问题**: API Key 错误
- 确认 `GLM_API_KEY` secret 已正确配置
- 确认 secret 名称拼写正确（区分大小写）

**问题**: 没有生成评论
- 检查 PR 是否有代码变更
- 检查路径过滤规则是否排除了所有文件
- 启用 `debug: true` 查看详细日志

### 8. 获取帮助

如有问题，请访问：
- 仓库 Issues: https://github.com/xiaokhkh/ai-pr-reviewer/issues
- 仓库 Discussions: https://github.com/xiaokhkh/ai-pr-reviewer/discussions
