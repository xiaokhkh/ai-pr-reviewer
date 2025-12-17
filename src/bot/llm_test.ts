import { Bot } from "../bot"
import { Options } from "../options"
import { GLMClient } from "./glm-client"

const options = new Options(
    false, // debug
    false, // disableReview
    false, // disableReleaseNotes
    '0', // maxFiles
    false, // reviewSimpleChanges
    false, // reviewCommentLGTM
    null, // pathFilters
    '', // systemMessage
    'gpt-3.5-turbo', // openaiLightModel
    'gpt-4', // openaiHeavyModel
    '0.0', // openaiModelTemperature
    '3', // openaiRetries
    '120000', // openaiTimeoutMS
    '6', // openaiConcurrencyLimit
    '6', // githubConcurrencyLimit
    'https://api.openai.com/v1', // apiBaseUrl
    'en-US' // language
  )


const flashBot = new Bot(new GLMClient('', 'glm-4.5-flash'), options)
const heavyBot = new Bot(new GLMClient('', 'glm-4.6'), options)

// 测试1: 简单对话测试
console.log('=== Test 1: Simple Chat ===')
flashBot.chat('say this is a test').then(result => {
  console.log('Result:', result)
  console.log('\n')

  // 测试2: 代码审查格式测试
  console.log('=== Test 2: Code Review Format Test ===')
  const reviewPrompt = `## GitHub PR Title

\`Fix bug in calculator\` 

## Description

\`\`\`
Fixed a typo in the add function
\`\`\`

## Summary of changes

\`\`\`
Fixed typo in add function
\`\`\`

## IMPORTANT Instructions

Input: New hunks annotated with line numbers and old hunks (replaced code). Hunks represent incomplete code fragments.
Additional Context: PR title, description, summaries and comment chains.
Task: Review new hunks for substantive issues using provided context and respond with comments if necessary.
Output: Review comments in markdown with exact line number ranges in new hunks. Start and end line numbers must be within the same hunk. For single-line comments, start=end line number. Must use example response format below.
Use fenced code blocks using the relevant language identifier where applicable.
Don't annotate code snippets with line numbers. Format and indent code correctly.
Do not use \`suggestion\` code blocks.
For fixes, use \`diff\` code blocks, marking changes with \`+\` or \`-\`. The line number range for comments with fix snippets must exactly match the range to replace in the new hunk.

- Do NOT provide general feedback, summaries, explanations of changes, or praises 
  for making good additions. 
- Focus solely on offering specific, objective insights based on the 
  given context and refrain from making broad comments about potential impacts on 
  the system or question intentions behind the changes.

If there are no issues found on a line range, you MUST respond with the 
text \`LGTM!\` for that line range in the review section. 

## Example

### Example changes

---new_hunk---
\`\`\`
  z = x / y
    return z

20: def add(x, y):
21:     z = x + y
22:     retrn z
23: 
24: def multiply(x, y):
25:     return x * y

def subtract(x, y):
  z = x - y
\`\`\`
  
---old_hunk---
\`\`\`
  z = x / y
    return z

def add(x, y):
    return x + y

def subtract(x, y):
  z = x - y
\`\`\`

---comment_chains---
\`\`\`
Please review this change.
\`\`\`

---end_change_section---

### Example response

22-22:
There's a syntax error in the add function.
\`\`\`diff
-    retrn z
+    return z
\`\`\`
---
24-25:
LGTM!
---

## Changes made to \`test.py\` for your review

---new_hunk---
\`\`\`
10: def calculate(x, y):
11:     result = x + y
12:     retun result
13: 
14: def divide(a, b):
15:     return a / b
\`\`\`
  
---old_hunk---
\`\`\`
def calculate(x, y):
    return x + y

def divide(a, b):
    return a / b
\`\`\`

---end_change_section---`

  return heavyBot.chat(reviewPrompt)
}).then(result => {
  console.log('Review Result:', result[0])
  console.log('\n')
  console.log('=== Format Check ===')
  const response = result[0]
  
  // 检查是否符合格式要求
  const hasLineRange = /\d+-\d+:/m.test(response)
  const hasLGTM = /LGTM!/m.test(response)
  const hasComment = response.length > 0
  
  console.log('Has line range format (数字-数字:):', hasLineRange)
  console.log('Has LGTM format:', hasLGTM)
  console.log('Has comment content:', hasComment)
  console.log('\n')
  
  if (hasLineRange || hasLGTM) {
    console.log('✅ Response format looks good for code review!')
  } else {
    console.log('⚠️  Response may not match expected code review format')
  }
})