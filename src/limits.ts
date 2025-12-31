export class TokenLimits {
  maxTokens: number
  requestTokens: number
  responseTokens: number
  knowledgeCutOff: string

  constructor(model = 'gpt-3.5-turbo') {
    this.knowledgeCutOff = '2021-09-01'
    // Set unlimited tokens (using a very large number)
    this.maxTokens = Number.MAX_SAFE_INTEGER
    this.responseTokens = Number.MAX_SAFE_INTEGER
    this.requestTokens = Number.MAX_SAFE_INTEGER
  }

  string(): string {
    return `max_tokens=${this.maxTokens}, request_tokens=${this.requestTokens}, response_tokens=${this.responseTokens}`
  }
}
