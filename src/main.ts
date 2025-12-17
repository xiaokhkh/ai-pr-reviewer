import {
  getBooleanInput,
  getInput,
  getMultilineInput,
  setFailed,
  warning
} from '@actions/core'
import {Bot} from './bot'
import {Options} from './options'
import {Prompts} from './prompts'
import {codeReview} from './review'
import {handleReviewComment} from './review-comment'
import {GLMClient} from './bot/glm-client'

async function run(): Promise<void> {
  const options: Options = new Options(
    getBooleanInput('debug'),
    getBooleanInput('disable_review'),
    getBooleanInput('disable_release_notes'),
    getInput('max_files'),
    getBooleanInput('review_simple_changes'),
    getBooleanInput('review_comment_lgtm'),
    getMultilineInput('path_filters'),
    getInput('system_message'),
    getInput('glm_light_model'),
    getInput('glm_heavy_model'),
    getInput('openai_model_temperature'),
    getInput('openai_retries'),
    getInput('openai_timeout_ms'),
    getInput('openai_concurrency_limit'),
    getInput('github_concurrency_limit'),
    getInput('llm_endpoint'),
    getInput('language')
  )

  // print options
  options.print()

  const prompts: Prompts = new Prompts(
    getInput('summarize'),
    getInput('summarize_release_notes')
  )

  // Get API key
  const apiKey = process.env.GLM_API_KEY
  if (!apiKey) {
    setFailed('Please set GLM_API_KEY environment variable')
    return
  }

  // Create two bots, one for summary and one for review

  let lightBot: Bot | null = null
  try {
    lightBot = new Bot(
      new GLMClient(
        apiKey,
        options.openaiLightModel as any,
        options.systemMessage,
        options.apiBaseUrl
      ),
      options
    )
  } catch (e: any) {
    warning(
      `Skipped: failed to create summary bot, please check your GLM_API_KEY: ${e}, backtrace: ${e.stack}`
    )
    return
  }

  let heavyBot: Bot | null = null
  try {
    heavyBot = new Bot(
      new GLMClient(
        apiKey,
        options.openaiHeavyModel as any,
        options.systemMessage,
        options.apiBaseUrl
      ),
      options
    )
  } catch (e: any) {
    warning(
      `Skipped: failed to create review bot, please check your GLM_API_KEY: ${e}, backtrace: ${e.stack}`
    )
    return
  }

  try {
    // check if the event is pull_request
    if (
      process.env.GITHUB_EVENT_NAME === 'pull_request' ||
      process.env.GITHUB_EVENT_NAME === 'pull_request_target'
    ) {
      await codeReview(lightBot, heavyBot, options, prompts)
    } else if (
      process.env.GITHUB_EVENT_NAME === 'pull_request_review_comment'
    ) {
      await handleReviewComment(heavyBot, options, prompts)
    } else {
      warning('Skipped: this action only works on push events or pull_request')
    }
  } catch (e: any) {
    if (e instanceof Error) {
      setFailed(`Failed to run: ${e.message}, backtrace: ${e.stack}`)
    } else {
      setFailed(`Failed to run: ${e}, backtrace: ${e.stack}`)
    }
  }
}

process
  .on('unhandledRejection', (reason, p) => {
    warning(`Unhandled Rejection at Promise: ${reason}, promise is ${p}`)
  })
  .on('uncaughtException', (e: any) => {
    warning(`Uncaught Exception thrown: ${e}, backtrace: ${e.stack}`)
  })

await run()
