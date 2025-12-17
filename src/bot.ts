import { info, warning } from '@actions/core'
import pRetry from 'p-retry'
import { LLMClient, LLMIds } from './bot/llm/types'
import { Options } from './options'

export class Bot {
  // 本地会话缓存，用于不返回 ID 的模型
  private localHistory: { role: 'user' | 'assistant'; text: string }[] = []

  constructor(
    private readonly client: LLMClient,
    private readonly options: Options
  ) {}

  chat = async (message: string, ids?: LLMIds): Promise<[string, LLMIds]> => {
    if (!message) return ['', {}]

    const start = Date.now()

    try {
      let response

      // 如果模型不支持 ID，用本地历史管理
      if (this.client.supportsIds && !this.client.supportsIds()) {
        // 拼接历史消息到 prompt
        const context = this.localHistory
          .map(m => `${m.role}: ${m.text}`)
          .join('\n')
        const fullPrompt = context ? context + `\nuser: ${message}` : message

        response = await pRetry(
          () => this.client.sendMessage(fullPrompt, {}, { timeoutMs: this.options.openaiTimeoutMS }),
          { retries: this.options.openaiRetries }
        )
        // 更新本地历史
        this.localHistory.push({ role: 'user', text: message })
        this.localHistory.push({ role: 'assistant', text: response.text })
      } else {
        // 支持 ID 的模型，直接传递
        response = await pRetry(
          () => this.client.sendMessage(message, ids, { timeoutMs: this.options.openaiTimeoutMS }),
          { retries: this.options.openaiRetries }
        )
      }

      info(`response time: ${Date.now() - start} ms`)

      return [this.normalize(response.text), response.ids ?? {}]
    } catch (e) {
      warning(`Failed to chat: ${String(e)}`)
      return ['', {}]
    }
  }

  private normalize(text: string): string {
    if (text.startsWith('with ')) return text.slice(5)
    return text
  }
}
