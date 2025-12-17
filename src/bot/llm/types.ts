// llm/types.ts
export interface LLMIds {
  parentMessageId?: string
  conversationId?: string
}

export interface LLMResponse {
  text: string
  ids: LLMIds
}

export interface SendOptions {
  timeoutMs?: number
}

export interface LLMClient {
  // 发送消息
  sendMessage(
    message: string,
    ids?: LLMIds,
    options?: SendOptions
  ): Promise<LLMResponse>

  // 可选：返回是否支持会话 ID
  supportsIds?(): boolean
}
