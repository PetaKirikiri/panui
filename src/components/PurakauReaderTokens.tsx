/**
 * Read-only Pūrākau-style token line: POS colours + phrase-pattern underlines + connector ends.
 */

import type { ConnectorShapeConfig, ChunkPatternPresentation, SentenceToken } from '../db/schema'
import { getInterlockPaths } from '../lib/connectorShapes'
import { UNDERLINE_THICKNESS } from '../lib/tokenStyling'
import { splitWordAndPunctuation } from '../lib/tokenStyling'
import type { ChunkPatternInput } from '../lib/patternMatch'
import { findPatternRunsForDisplay, type PatternRunWithName } from '../lib/patternMatch'
import { resolveToken, isPunctuationOnlyToken, stripPunctuationFromWord } from '../lib/tokens'
import type { PosTypeLike } from '../lib/tokens'
import { normalizeWordRegistrySurface } from '../lib/miWordTokens'
import type { ConnectorDesignLike } from '../lib/purakauReaderTypes'
import { TokenUnderline } from './TokenUnderline'
import { TokenWord } from './TokenWord'

const BAR_W = 80
const BAR_H = UNDERLINE_THICKNESS
const BAR_Y = 0

type ChunkConfigs = {
  leftEnd?: ConnectorShapeConfig
  rightEnd?: ConnectorShapeConfig
  meetingRight?: ConnectorShapeConfig
  meetingLeft?: ConnectorShapeConfig
}

function tenseMarkerSlots(pres: ChunkPatternPresentation | null | undefined, len: number) {
  if (!pres || pres.layout !== 'tense_marker_wrap') return null
  const h = pres.head_slot ?? 0
  const c = pres.core_slot ?? 1
  const t = pres.tail_slot ?? 2
  if (h < 0 || c < 0 || t < 0 || h >= len || c >= len || t >= len) return null
  return { h, c, t }
}

type ChunkProps = {
  tokens: SentenceToken[]
  startIndex: number
  posTypes: PosTypeLike[]
  getConnectorConfig: (posTypeId: number | null, side: 'left' | 'right') => ConnectorShapeConfig | undefined
  connectorConfigs?: ChunkConfigs
  chunkPresentation?: ChunkPatternPresentation | null
  onOpenWordPopover: (args: { lemma: string; surfaceRaw: string; el: HTMLElement }) => void
  wordSpanClassResolver?: (lemma: string) => string
}

function ReadOnlyPhraseChunk({
  tokens,
  startIndex,
  posTypes,
  getConnectorConfig,
  connectorConfigs,
  chunkPresentation = null,
  onOpenWordPopover,
  wordSpanClassResolver,
}: ChunkProps) {
  const tenseSlots = tenseMarkerSlots(chunkPresentation, tokens.length)
  const meetingRightFirst =
    getConnectorConfig(tokens[0]?.pos_type_id ?? null, 'right') ?? connectorConfigs?.meetingRight
  const meetingLeftSecond =
    tokens.length >= 2
      ? getConnectorConfig(tokens[1]?.pos_type_id ?? null, 'left') ?? connectorConfigs?.meetingLeft
      : undefined
  const useChunkSvg =
    meetingRightFirst &&
    meetingLeftSecond &&
    meetingRightFirst.gender !== 'none' &&
    meetingLeftSecond.gender !== 'none'

  const meetingConfig: ConnectorShapeConfig = useChunkSvg
    ? {
        type: (meetingRightFirst!.type ?? 'koru') as ConnectorShapeConfig['type'],
        gender: meetingRightFirst!.gender,
      }
    : { type: 'koru', gender: 'none' }
  const { leftPathD, rightPathD } = getInterlockPaths(
    { barH: BAR_H, barY: BAR_Y, barW: BAR_W },
    meetingConfig,
  )

  const firstColor = resolveToken(tokens[0], posTypes).underlineColor
  const lastColor = resolveToken(tokens[tokens.length - 1], posTypes).underlineColor
  const leftColor = firstColor && /^#[0-9A-Fa-f]{6}$/.test(firstColor) ? firstColor : '#e5e7eb'
  const rightColor = lastColor && /^#[0-9A-Fa-f]{6}$/.test(lastColor) ? lastColor : '#e5e7eb'

  return (
    <span
      className="rounded"
      style={
        useChunkSvg
          ? { position: 'relative' as const, paddingBottom: BAR_H, display: 'inline-block' }
          : undefined
      }
    >
      {tokens.map((t, i) => {
        const wordIdx = startIndex + i
        const resolved = resolveToken(t, posTypes)
        const { leading, word, trailing } = splitWordAndPunctuation(t.text ?? '')
        const nextIsPunct = i < tokens.length - 1 && isPunctuationOnlyToken(tokens[i + 1])
        const addJoiningSpace = word && i < tokens.length - 1 && !nextIsPunct
        const wordWithSpace = addJoiningSpace ? word + ' ' : word
        const capStyle =
          tokens.length === 1 ? 'both' : i === 0 ? 'left' : i === tokens.length - 1 ? 'right' : 'flat'
        const pid = tokens[i]?.pos_type_id ?? null
        const designLeft = getConnectorConfig(pid, 'left')
        const designRight = getConnectorConfig(pid, 'right')
        const connectorLeft = useChunkSvg
          ? undefined
          : designLeft ?? (i === 0 ? connectorConfigs?.leftEnd : connectorConfigs?.meetingLeft)
        const connectorRight = useChunkSvg
          ? undefined
          : designRight ?? (i === tokens.length - 1 ? connectorConfigs?.rightEnd : connectorConfigs?.meetingRight)
        const tenseClass = tenseSlots
          ? i === tenseSlots.c
            ? 'font-semibold'
            : i === tenseSlots.h || i === tenseSlots.t
              ? 'opacity-[0.92]'
              : ''
          : ''
        const wordEl =
          word ? (
            useChunkSvg ? (
              <span className={[tenseClass].filter(Boolean).join(' ') || undefined}>
                <TokenWord text={wordWithSpace} inChunk interactive={false} />
              </span>
            ) : (
              <TokenUnderline
                underlineColor={resolved.underlineColor}
                capStyle={capStyle}
                connectorConfigLeft={connectorLeft}
                connectorConfigRight={connectorRight}
              >
                <span className={[tenseClass].filter(Boolean).join(' ') || undefined}>
                  <TokenWord text={wordWithSpace} inChunk interactive={false} />
                </span>
              </TokenUnderline>
            )
          ) : null
        const lemma = normalizeWordRegistrySurface(stripPunctuationFromWord(word || ''))
        const helpClass = wordSpanClassResolver?.(lemma) ?? ''
        const hoverClasses = ['cursor-help', helpClass].filter(Boolean).join(' ')
        const core =
          lemma.length >= 2 && word ? (
            <span className={hoverClasses} lang="mi" onMouseEnter={(e) => onOpenWordPopover({ lemma, surfaceRaw: word, el: e.currentTarget })}>
              {wordEl}
            </span>
          ) : (
            wordEl
          )
        return (
          <span key={`${wordIdx}-${i}`} className="inline">
            {leading}
            {core}
            {trailing}
          </span>
        )
      })}
      {useChunkSvg && (
        <svg
          viewBox={`${-BAR_W} 0 ${BAR_W * 2} ${BAR_Y + BAR_H}`}
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            height: BAR_H,
            pointerEvents: 'none',
          }}
        >
          <path d={leftPathD} fill={leftColor} />
          <path d={rightPathD} fill={rightColor} />
        </svg>
      )}
    </span>
  )
}

type PurakauReaderTokensProps = {
  tokens: SentenceToken[]
  posTypes: PosTypeLike[]
  chunkPatterns: ChunkPatternInput[]
  connectorDesigns?: ConnectorDesignLike[]
  connectorConfigs?: ChunkConfigs
  className?: string
  /** English chunk aligned with this Māori paragraph (sentence tab / sense suggest). */
  alignedEnText: string
  onOpenWordPopover: (args: { lemma: string; surfaceRaw: string; el: HTMLElement }) => void
  /** Optional registry presence styling (parallel to unstructured Mi spans). */
  wordSpanClassResolver?: (lemma: string) => string
}

export function PurakauReaderTokens({
  tokens,
  posTypes,
  chunkPatterns,
  connectorDesigns = [],
  connectorConfigs,
  className,
  alignedEnText: _alignedEnText,
  onOpenWordPopover,
  wordSpanClassResolver,
}: PurakauReaderTokensProps) {
  const runs = findPatternRunsForDisplay(tokens, chunkPatterns)
  const runByStart = new Map<number, PatternRunWithName>()
  for (const r of runs) {
    runByStart.set(r.start, r)
  }
  const inRun = new Set(
    runs.flatMap((r) => Array.from({ length: r.end - r.start }, (_, j) => r.start + j)),
  )

  const getConfig = (posTypeId: number | null, side: 'left' | 'right'): ConnectorShapeConfig | undefined => {
    if (posTypeId == null) return undefined
    const d = connectorDesigns.find((c) => c.pos_type_id === posTypeId && c.side === side)
    const sc = d?.shape_config
    if (sc && typeof sc === 'object') return sc as ConnectorShapeConfig
    return undefined
  }

  return (
    <span className={className}>
      {tokens.map((token, i) => {
        const run = runByStart.get(i)
        if (run) {
          const chunkTokens = tokens.slice(run.start, run.end)
          return (
            <span key={i}>
              <ReadOnlyPhraseChunk
                tokens={chunkTokens}
                startIndex={run.start}
                posTypes={posTypes}
                getConnectorConfig={getConfig}
                connectorConfigs={connectorConfigs}
                chunkPresentation={run.presentation ?? null}
                onOpenWordPopover={onOpenWordPopover}
                wordSpanClassResolver={wordSpanClassResolver}
              />
              {run.end < tokens.length && !isPunctuationOnlyToken(tokens[run.end]) ? ' ' : ''}
            </span>
          )
        }
        if (inRun.has(i)) return null
        const resolved = resolveToken(token, posTypes)
        const lemma = normalizeWordRegistrySurface(stripPunctuationFromWord(token.text ?? ''))
        const wordInner = (
          <span className="inline">
            <TokenWord
              text={token.text ?? ''}
              underlineColor={resolved.underlineColor}
              interactive={false}
            />
          </span>
        )
        const regClass = wordSpanClassResolver?.(lemma) ?? ''
        const wrapClass = ['cursor-help', 'inline', regClass].filter(Boolean).join(' ')
        const wrapper =
          lemma.length >= 2 && !isPunctuationOnlyToken(token) ? (
            <span
              className={wrapClass}
              lang="mi"
              onMouseEnter={(e) =>
                onOpenWordPopover({
                  lemma,
                  surfaceRaw: stripPunctuationFromWord(token.text ?? '') || token.text || '',
                  el: e.currentTarget,
                })
              }
            >
              {wordInner}
            </span>
          ) : (
            wordInner
          )
        return (
          <span key={i} className="inline">
            {wrapper}
            {i < tokens.length - 1 && !isPunctuationOnlyToken(tokens[i + 1]) ? ' ' : ''}
          </span>
        )
      })}
    </span>
  )
}
