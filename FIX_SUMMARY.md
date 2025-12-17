# 评论与代码不匹配问题修复总结

## 修复内容

### 1. 严格验证行号范围 (`src/review.ts`)

**修改前的问题**：
- 当 LLM 返回的行号不在 patch 范围内时，代码会强制映射到第一个 patch
- 导致评论内容与代码完全不匹配

**修改后的逻辑**：

1. **完全无效的行号**：如果行号与所有 patch 都没有重叠，直接丢弃评论
   ```typescript
   if (!isValidLineRange && maxIntersection === 0) {
     warning(`Skipped review comment with invalid line range...`)
     return  // 直接丢弃，不添加到 reviews
   }
   ```

2. **部分重叠的行号**：只有当重叠度 ≥ 50% 时才接受，并添加警告说明
   ```typescript
   if (overlapRatio < 0.5) {
     warning(`Skipped review comment with insufficient overlap...`)
     return  // 重叠度不够，丢弃
   }
   ```

3. **有效的行号**：完全在 patch 范围内的行号，正常处理

**改进点**：
- ✅ 无效行号时，评论作为一般性评论发布（不标记到代码块）
- ✅ 评论中包含说明，指出原始行号无效
- ✅ 添加详细的警告日志，便于调试
- ✅ 部分重叠时添加明确的说明注释并映射到最佳位置
- ✅ 在 debug 模式下输出完整评论内容

### 2. 改进 Prompt (`src/prompts.ts`)

**新增的关键要求**：

```
## CRITICAL: Line Number Requirements

- You MUST only reference line numbers that are explicitly shown in the ---new_hunk--- sections above
- The line numbers in your response MUST exactly match the line numbers shown in the ---new_hunk--- blocks
- DO NOT reference line numbers from other parts of the file that are not in the new_hunk sections
- DO NOT reference line numbers from old_hunk sections - only use new_hunk line numbers
- If you see code that needs review but is NOT in the ---new_hunk--- sections, DO NOT comment on it
- Each comment MUST start with a line range in the format: START_LINE-END_LINE:
- START_LINE and END_LINE must be within the same hunk's line number range shown in ---new_hunk---
- Before writing a comment, verify that the line numbers you're using exist in the ---new_hunk--- sections
```

**改进点**：
- ✅ 明确要求只使用 `---new_hunk---` 中的行号
- ✅ 禁止引用文件其他部分的代码
- ✅ 禁止使用 `old_hunk` 的行号
- ✅ 要求验证行号是否存在

## 修复效果

### 修复前
- ❌ LLM 返回错误行号（如 372-395）时，评论被强制映射到第一个 patch（10-24）
- ❌ 评论内容与实际代码完全不匹配
- ❌ 用户看到混淆的评论

### 修复后
- ✅ LLM 返回错误行号时，评论作为一般性评论发布（不标记到代码块）
- ✅ 评论中包含说明，指出原始行号无效
- ✅ 有效的行号正常生成行内评论
- ✅ 部分重叠时会有明确说明并映射到最佳匹配位置
- ✅ 通过改进的 Prompt，减少 LLM 返回错误行号的概率

## 测试建议

1. **启用 debug 模式**：
   ```yaml
   with:
     debug: true
   ```

2. **观察日志**：
   - 查看是否有 "Skipped review comment with invalid line range" 警告
   - 查看是否有 "Skipped review comment with insufficient overlap" 警告
   - 这些警告说明系统正确识别并丢弃了无效评论

3. **验证评论准确性**：
   - 检查评论是否只出现在实际变更的代码行上
   - 确认评论内容与代码变更相关

## 后续优化建议

1. **监控无效评论率**：
   - 统计被丢弃的评论数量
   - 如果无效评论率较高，可能需要进一步优化 Prompt

2. **考虑重试机制**：
   - 如果检测到无效行号，可以要求 LLM 重新生成（但会增加成本）

3. **增强上下文管理**：
   - 考虑只传递 patch 相关的上下文，而不是整个文件
   - 减少 LLM 混淆的可能性

## 相关文件

- `src/review.ts`: 行号验证逻辑
- `src/prompts.ts`: Prompt 改进
- `ISSUE_ANALYSIS.md`: 问题分析文档
- `REVIEW_LOGIC.md`: Review 逻辑文档
