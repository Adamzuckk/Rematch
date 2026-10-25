import { useCallback, useRef, useState } from 'react'
import { askOrchestrator } from '../services/orchestrator/orchestratorClient'

type AskLanguage = 'en' | 'ar'

export type AskCrewTurn = {
  id: string
  question: string
  eventId: string | null
  reply: string | null
  error: string | null
  createdAt: number
}

export type AskCrewState =
  | { status: 'idle'; turns: AskCrewTurn[] }
  | { status: 'loading'; turns: AskCrewTurn[]; pendingQuestion: string }
  | { status: 'ready'; turns: AskCrewTurn[] }
  | {
      status: 'error'
      turns: AskCrewTurn[]
      message: string
      lastQuestion: string
    }

function newId(): string {
  return `ask-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Sends Ask-the-Crew questions to the Foundry Orchestrator Function.
 * Prevents duplicate in-flight submits and supports clear/retry.
 */
export function useAskCrew(matchId: string | undefined) {
  const [turns, setTurns] = useState<AskCrewTurn[]>([])
  const [loading, setLoading] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [error, setError] = useState<{
    message: string
    lastQuestion: string
  } | null>(null)
  const inFlightRef = useRef(false)
  const requestSeqRef = useRef(0)

  const ask = useCallback(
    async (input: {
      question: string
      eventId?: string | null
      language?: AskLanguage
    }) => {
      const question = input.question.trim()
      if (!matchId || !question || inFlightRef.current) return

      inFlightRef.current = true
      const seq = ++requestSeqRef.current
      setLoading(true)
      setPendingQuestion(question)
      setError(null)

      try {
        const reply = await askOrchestrator({
          message: question,
          matchId,
          ...(input.eventId ? { eventId: input.eventId } : {}),
        })
        if (seq !== requestSeqRef.current) return
        setTurns((current) => [
          ...current,
          {
            id: newId(),
            question,
            eventId: input.eventId ?? null,
            reply,
            error: null,
            createdAt: Date.now(),
          },
        ])
        setError(null)
      } catch (cause) {
        if (seq !== requestSeqRef.current) return
        const message = cause instanceof Error ? cause.message : 'Ask the crew failed'
        setError({ message, lastQuestion: question })
      } finally {
        if (seq === requestSeqRef.current) {
          inFlightRef.current = false
          setLoading(false)
          setPendingQuestion(null)
        }
      }
    },
    [matchId],
  )

  const retry = useCallback(
    async (eventId?: string | null, language?: AskLanguage) => {
      if (!error?.lastQuestion) return
      await ask({
        question: error.lastQuestion,
        eventId,
        language,
      })
    },
    [ask, error],
  )

  const clear = useCallback(() => {
    requestSeqRef.current += 1
    inFlightRef.current = false
    setTurns([])
    setLoading(false)
    setPendingQuestion(null)
    setError(null)
  }, [])

  let state: AskCrewState
  if (loading && pendingQuestion) {
    state = { status: 'loading', turns, pendingQuestion }
  } else if (error) {
    state = {
      status: 'error',
      turns,
      message: error.message,
      lastQuestion: error.lastQuestion,
    }
  } else if (turns.length > 0) {
    state = { status: 'ready', turns }
  } else {
    state = { status: 'idle', turns }
  }

  return { state, ask, retry, clear, loading }
}
