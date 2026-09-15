import { getMessages, getTranslations } from 'next-intl/server'
import type {
  GeneratedMessageKey,
  GeneratedMessageValues,
  GeneratedTranslator,
  GeneratedValueTranslator,
} from './generated'
import { generatedMessageKey } from './generated-key'

export async function getGeneratedTranslations(): Promise<GeneratedTranslator> {
  const translate = await getTranslations('Generated')
  return (key: GeneratedMessageKey, values?: GeneratedMessageValues): string =>
    translate(key, values as never)
}

export async function getGeneratedValueTranslations(): Promise<GeneratedValueTranslator> {
  const [messages, translate] = await Promise.all([
    getMessages() as Promise<{ Generated?: Record<string, unknown> }>,
    getGeneratedTranslations(),
  ])
  return <Value>(value: Value): Value => {
    if (typeof value !== 'string') return value
    const key = generatedMessageKey(value) as GeneratedMessageKey
    return (messages.Generated?.[key] === undefined ? value : translate(key)) as Value
  }
}
