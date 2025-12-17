#!/bin/bash

# GitHub Action 发布脚本
# 使用方法: ./scripts/publish.sh <version>
# 例如: ./scripts/publish.sh v1.0.0

set -e

VERSION=$1

if [ -z "$VERSION" ]; then
    echo "错误: 请提供版本号"
    echo "使用方法: ./scripts/publish.sh <version>"
    echo "例如: ./scripts/publish.sh v1.0.0"
    exit 1
fi

echo "🚀 开始发布 GitHub Action 版本: $VERSION"

# 1. 检查是否有未提交的更改
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  警告: 检测到未提交的更改"
    read -p "是否继续? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 2. 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 3. 构建和打包
echo "🔨 构建代码..."
npm run build

echo "📦 打包 Action..."
npm run package

# 4. 检查 dist/index.js 是否存在
if [ ! -f "dist/index.js" ]; then
    echo "❌ 错误: dist/index.js 不存在，构建失败"
    exit 1
fi

echo "✅ 构建完成"

# 5. 提交更改
echo "📝 提交更改..."
git add dist/
git add package.json package-lock.json 2>/dev/null || true

# 检查是否有更改需要提交
if [ -n "$(git status --porcelain)" ]; then
    git commit -m "Build for release $VERSION" || echo "没有更改需要提交"
else
    echo "没有更改需要提交"
fi

# 6. 创建 tag
echo "🏷️  创建 tag: $VERSION"
if git rev-parse "$VERSION" >/dev/null 2>&1; then
    echo "⚠️  警告: Tag $VERSION 已存在"
    read -p "是否删除并重新创建? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git tag -d "$VERSION"
        git push origin ":refs/tags/$VERSION" 2>/dev/null || true
    else
        echo "跳过创建 tag"
        exit 0
    fi
fi

git tag -a "$VERSION" -m "Release $VERSION"

# 7. 推送代码和 tag
echo "📤 推送代码和 tag..."
read -p "是否推送到远程仓库? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git push origin main
    git push origin "$VERSION"
    echo "✅ 发布完成!"
    echo ""
    echo "📋 下一步:"
    echo "1. 访问 https://github.com/xiaokhkh/ai-pr-reviewer/releases"
    echo "2. 编辑 $VERSION release，添加发布说明"
    echo "3. 其他仓库现在可以使用: xiaokhkh/ai-pr-reviewer@$VERSION"
else
    echo "⏸️  已创建本地 tag，但未推送"
    echo "手动推送命令:"
    echo "  git push origin main"
    echo "  git push origin $VERSION"
fi
