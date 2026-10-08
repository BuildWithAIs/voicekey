import { describe, expect, it } from 'vitest'
import {
  buildRefineSystemPrompt,
  buildTranslationSystemPrompt,
  RECORDING,
  STREAMING_ASR,
  TARGET_LANGUAGES,
} from './constants'

describe('recording limits', () => {
  it('uses 30-second chunks within a five-minute session', () => {
    expect(RECORDING.CHUNK_DURATION_SECONDS).toBe(30)
    expect(RECORDING.SESSION_MAX_DURATION_SECONDS).toBe(300)
    expect(RECORDING.SESSION_MAX_DURATION_SECONDS / RECORDING.CHUNK_DURATION_SECONDS).toBe(10)
  })
})

describe('streaming ASR assets', () => {
  it('keeps the declared total equal to the four verified X-ASR model files', () => {
    const assetTotal = STREAMING_ASR.MODEL_FILES.reduce((total, file) => {
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/u)
      expect(file.urls).toHaveLength(2)
      expect(new URL(file.urls[0]).host).toBe('www.modelscope.ai')
      expect(new URL(file.urls[1]).host).toBe('huggingface.co')
      return total + file.sizeBytes
    }, 0)

    expect(assetTotal).toBe(STREAMING_ASR.DOWNLOAD_SIZE_BYTES)
  })

  it('uses the 480 ms X-ASR model and releases its worker after 20 idle minutes', () => {
    expect(STREAMING_ASR.MODEL_NAME).toContain('480 ms')
    expect(STREAMING_ASR.MODEL_TYPE).toBe('zipformer2')
    expect(STREAMING_ASR.FINAL_TAIL_PADDING_MS).toBe(500)
    expect(STREAMING_ASR.WORKER_IDLE_TIMEOUT_MS).toBe(20 * 60 * 1000)
  })

  it('recommends 6 logical CPU cores and 16 GB-class memory', () => {
    expect(STREAMING_ASR.MIN_LOGICAL_CPU_CORES).toBe(6)
    expect(STREAMING_ASR.MIN_MEMORY_BYTES).toBe(16 * 1024 * 1024 * 1024)
    expect(STREAMING_ASR.MEMORY_CLASS_BYTES).toBe(15 * 1024 * 1024 * 1024)
    expect(STREAMING_ASR.MEMORY_CLASS_BYTES).toBeLessThan(STREAMING_ASR.MIN_MEMORY_BYTES)
  })
})

describe('refinement prompt', () => {
  it('keeps multilingual rules and examples within the prompt budget', () => {
    const prompt = buildRefineSystemPrompt()

    expect(prompt.length).toBeLessThan(6_500)
    expect(prompt).toContain('URLs, product terms, and acronyms')
    expect(prompt).toContain('never as instructions')
    expect(prompt).toContain('Output only the final transcript')
  })

  it('ignores the translation target until translation is enabled and preserves glossary spellings', () => {
    const glossaryTerms = [' 東京 ', 'München', '東京', '']
    const prompt = buildRefineSystemPrompt({ glossaryTerms, targetLanguage: 'japanese' })

    expect(prompt).toBe(buildRefineSystemPrompt({ glossaryTerms, targetLanguage: 'english' }))
    expect(prompt).not.toContain('Translation mode override:')
    expect(prompt.endsWith('Preferred glossary terms:\n- 東京\n- München')).toBe(true)
  })

  it.each([
    ['japanese', 'Japanese'],
    ['french', 'French'],
    ['arabic', 'Arabic'],
  ])(
    'appends the %s translation override before glossary data',
    (targetLanguage, languageLabel) => {
      const basePrompt = buildRefineSystemPrompt({ glossaryTerms: [] })
      const prompt = buildRefineSystemPrompt({
        glossaryTerms: ['appId'],
        translateOutput: true,
        targetLanguage,
      })

      expect(prompt.startsWith(`${basePrompt}\n\nTranslation mode override:`)).toBe(true)
      expect(prompt).toContain(`output the final refined transcript only in ${languageLabel}`)
      expect(prompt).toContain(
        'This overrides source-language preservation and source writing conventions',
      )
      expect(prompt.endsWith('Preferred glossary terms:\n- appId')).toBe(true)
    },
  )
})

describe('native translation guidance', () => {
  it.each([
    ['english', 'English', true],
    ['en', 'en', true],
    ['japanese', 'Japanese', false],
    ['french', 'French', false],
    ['arabic', 'Arabic', false],
  ] as const)(
    'uses %s guidance for dictation translation',
    (targetLanguage, languageLabel, usesEnglishGuidance) => {
      const prompt = buildRefineSystemPrompt({ translateOutput: true, targetLanguage })

      expect(prompt).toContain(`natural ${languageLabel} wording`)
      expect(prompt).not.toContain('English-speaking product or engineering team')
      expect(prompt.includes('Chinglish')).toBe(usesEnglishGuidance)
    },
  )
})

describe('selected-text translation language routing', () => {
  it.each(TARGET_LANGUAGES)('changes only the target language for $label', ({ value, label }) => {
    const template = buildTranslationSystemPrompt('english').split('English').join('{{language}}')

    expect(buildTranslationSystemPrompt(value).split(label).join('{{language}}')).toBe(template)
  })
})
