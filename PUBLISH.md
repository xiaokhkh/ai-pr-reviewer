# GitHub Action 发布指南

本指南将帮助你将此仓库发布为 GitHub Action，供其他仓库使用。

## 前置条件

1. 确保你已登录 GitHub 账号：`xiaokhkh`
2. 确保代码已构建完成（`dist/index.js` 存在）

## 发布步骤

### 1. 准备仓库

如果还没有在 `xiaokhkh` 账号下创建仓库，需要先创建：

```bash
# 在 GitHub 上创建新仓库（通过网页或 GitHub CLI）
# 仓库名建议：ai-pr-reviewer 或 glm-pr-reviewer
```

### 2. 更新远程仓库地址

```bash
# 添加新的远程仓库（如果还没有）
git remote add xiaokhkh https://github.com/xiaokhkh/ai-pr-reviewer.git

# 或者更新 origin
git remote set-url origin https://github.com/xiaokhkh/ai-pr-reviewer.git
```

### 3. 确保代码已构建

```bash
# 安装依赖
npm install

# 构建代码
npm run build

# 打包 Action（这会生成 dist/index.js）
npm run package
```

### 4. 提交代码

```bash
# 确保所有更改已提交
git add .
git commit -m "Prepare for GitHub Action release"

# 推送到远程仓库
git push origin main
# 或推送到 xiaokhkh 远程
git push xiaokhkh main
```

### 5. 创建 Release

发布 GitHub Action 需要创建 Release（带 tag）：

#### 方法 1: 通过 GitHub 网页界面

1. 访问 `https://github.com/xiaokhkh/ai-pr-reviewer`
2. 点击右侧 "Releases" → "Create a new release"
3. 选择或创建新 tag（例如：`v1.0.0`）
4. 填写 Release 标题和描述
5. 点击 "Publish release"

#### 方法 2: 通过命令行

```bash
# 创建并推送 tag
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
# 或
git push xiaokhkh v1.0.0
```

然后在 GitHub 网页上创建对应的 Release。

### 6. 验证发布

发布后，其他仓库可以通过以下方式使用：

```yaml
name: AI PR Review

on:
  pull_request_target:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: xiaokhkh/ai-pr-reviewer@v1.0.0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GLM_API_KEY: ${{ secrets.GLM_API_KEY }}
        with:
          debug: false
          review_comment_lgtm: false
```

## 重要注意事项

1. **每次更新后需要重新发布**：
   - 修改代码后，需要重新运行 `npm run build && npm run package`
   - 提交更改并创建新的 release/tag

2. **版本号建议**：
   - 使用语义化版本号：`v1.0.0`, `v1.0.1`, `v1.1.0` 等
   - 使用 `@latest` 或 `@v1` 可以让用户自动获取最新版本

3. **action.yml 配置**：
   - 确保 `action.yml` 中的 `runs.main` 指向正确的文件（`dist/index.js`）
   - 确保 `runs.using` 设置为 `node16` 或 `node20`

4. **测试**：
   - 在发布前，建议在自己的测试仓库中先测试 Action 是否正常工作

## 快速发布命令

```bash
# 1. 构建和打包
npm run build && npm run package

# 2. 提交更改
git add dist/
git commit -m "Build for release v1.0.0"

# 3. 创建 tag
git tag -a v1.0.0 -m "Release v1.0.0"

# 4. 推送代码和 tag
git push origin main
git push origin v1.0.0
```

## 后续更新

每次更新 Action 时：

1. 修改代码
2. 运行 `npm run build && npm run package`
3. 提交更改
4. 创建新的 tag（如 `v1.0.1`）
5. 推送代码和 tag

用户可以通过更新 workflow 中的版本号来使用新版本。
