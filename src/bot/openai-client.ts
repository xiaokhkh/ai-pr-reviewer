import { ChatGPTAPI, ChatMessage } from 'chatgpt'
import { LLMClient, LLMIds, LLMResponse } from './llm/types'

export class OpenAIClient implements LLMClient {
  private api: ChatGPTAPI

  constructor(apiKey: string, systemMessage: string) {
    this.api = new ChatGPTAPI({ apiKey, systemMessage })
  }

  supportsIds(): boolean {
    return true
  }

  async sendMessage(message: string, ids?: LLMIds): Promise<LLMResponse> {
    const res: ChatMessage = await this.api.sendMessage(message, {
      parentMessageId: ids?.parentMessageId
    })
    return {
      text: res.text,
      ids: { parentMessageId: res.id, conversationId: res.conversationId }
    }
  }
}
