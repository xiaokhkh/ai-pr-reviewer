import { LLMClient, LLMIds, LLMResponse, SendOptions } from './llm/types'

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class GLMClient implements LLMClient {
  private conversationHistory: Message[] = []
  private endpoint: string

  constructor(
    private token: string,
    private model: 
      | 'glm-4.6'
      | 'glm-4.5'
      | 'glm-4.5-air'
      | 'glm-4.5-x'
      | 'glm-4.5-airx'
      | 'glm-4.5-flash'
      | 'glm-4-plus'
      | 'glm-4-air-250414'
      | 'glm-4-airx'
      | 'glm-4-flashx'
      | 'glm-4-flashx-250414' = 'glm-4.6',
    private readonly systemMessage?: string,
    endpoint: string = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
  ) {
    this.endpoint = endpoint
    if (this.systemMessage) {
      this.conversationHistory.push({
        role: 'system',
        content: this.systemMessage
      })
    }
  }

  supportsIds(): boolean {
    return false
  }

  async sendMessage(
    message: string,
    ids?: LLMIds,
    options?: SendOptions
  ): Promise<LLMResponse> {
    // 保存历史快照，用于错误回滚
    const historySnapshot = [...this.conversationHistory]
    const isHistoryFormat = this.isHistoryFormat(message)

    // 检测消息格式：如果是 Bot 拼接的历史消息格式（user: xxx\nassistant: yyy），则解析它
    // 否则当作新消息处理
    if (isHistoryFormat) {
      this.parseAndUpdateHistory(message)
    } else {
      // 添加用户消息到历史
      this.conversationHistory.push({
        role: 'user',
        content: message
      })
    }

    const requestBody = {
      model: this.model,
      messages: this.conversationHistory,
      stream: false,
      thinking: {
        type: 'enabled' as const
      },
      do_sample: true,
      temperature: 1,
      top_p: 0.95,
      tool_stream: false,
      response_format: {
        type: 'text' as const
      }
    }

    const controller = new AbortController()
    const timeoutId = options?.timeoutMs
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : null

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),  
        signal: controller.signal
      })
      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`API request failed: ${res.status} ${res.statusText} - ${errorText}`)
      }

      const data = await res.json()

      // Parse response - handle OpenAI-compatible format
      let responseText: string
      if (data.choices && data.choices[0]?.message?.content) {
        responseText = data.choices[0].message.content
      } else if (data.text) {
        responseText = data.text
      } else if (typeof data === 'string') {
        responseText = data
      } else {
        throw new Error(`Unexpected response format: ${JSON.stringify(data)}`)
      }

      // Add assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: responseText
      })

      return { text: responseText, ids: {} }
    } catch (error: any) {
      // 如果请求失败，回滚历史到请求前的状态
      this.conversationHistory = historySnapshot
      throw error
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  /**
   * 检测消息是否是 Bot 拼接的历史格式
   * 格式示例: "user: xxx\nassistant: yyy\nuser: zzz"
   */
  private isHistoryFormat(message: string): boolean {
    // 检查是否以 "user:" 或 "assistant:" 开头，并且包含换行符
    // 这表示是 Bot 拼接的多轮对话历史
    const lines = message.split('\n').filter(line => line.trim())
    if (lines.length < 2) return false // 至少需要两行
    
    // 检查前两行是否都符合 "role: content" 格式
    const rolePattern = /^(user|assistant):\s*.+$/i
    return lines.slice(0, 2).every(line => rolePattern.test(line.trim()))
  }

  /**
   * 解析 Bot 拼接的历史消息并更新内部历史
   * 格式: "user: xxx\nassistant: yyy\nuser: zzz"
   */
  private parseAndUpdateHistory(historyText: string): void {
    // 清空当前历史（保留 system message）
    const systemMsg = this.conversationHistory.find(m => m.role === 'system')
    this.conversationHistory = systemMsg ? [systemMsg] : []

    // 解析历史消息
    const lines = historyText.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // 匹配 "user: content" 或 "assistant: content" 格式
      const match = trimmed.match(/^(user|assistant):\s*(.+)$/i)
      if (match) {
        const role = match[1].toLowerCase() as 'user' | 'assistant'
        const content = match[2].trim()
        if (content) {
          this.conversationHistory.push({ role, content })
        }
      }
    }
  }

  /**
   * 清空对话历史（保留 system message）
   */
  clearHistory(): void {
    const systemMsg = this.conversationHistory.find(m => m.role === 'system')
    this.conversationHistory = systemMsg ? [systemMsg] : []
  }

  /**
   * 获取当前对话历史（用于调试）
   */
  getHistory(): ReadonlyArray<Message> {
    return [...this.conversationHistory]
  }
}
