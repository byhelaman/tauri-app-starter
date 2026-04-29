import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Limitador de frecuencia del lado del cliente para mejorar la UX (throttling de envío de formularios).
 *
 * IMPORTANTE: esto no es un control de seguridad. El usuario puede borrar localStorage
 * para saltarse el bloqueo. El rate limiting real lo aplica en el servidor Supabase Auth
 * y los RPCs de la base de datos. Usar este hook únicamente para dar feedback inmediato
 * al usuario ante fallos repetidos.
 */
interface UseRateLimitOptions {
  maxAttempts?: number
  lockoutSeconds?: number
  /** Persist state across modal closes and page reloads via localStorage. */
  storageKey?: string
}

interface StoredState {
  attempts: number
  lockedUntil: number | null  // Unix ms timestamp
}

interface UseRateLimitReturn {
  attempts: number
  isLocked: boolean
  lockoutRemaining: number
  recordFailure: () => void
  reset: () => void
}

function readStorage(key: string): StoredState {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { attempts: 0, lockedUntil: null }
    return JSON.parse(raw) as StoredState
  } catch {
    return { attempts: 0, lockedUntil: null }
  }
}

function writeStorage(key: string, state: StoredState) {
  try {
    localStorage.setItem(key, JSON.stringify(state))
  } catch { /* storage unavailable */ }
}

function clearStorage(key: string) {
  try { localStorage.removeItem(key) } catch { /* noop */ }
}

export function useRateLimit({
  maxAttempts = 5,
  lockoutSeconds = 30,
  storageKey,
}: UseRateLimitOptions = {}): UseRateLimitReturn {
  const [attempts, setAttempts] = useState(() => {
    if (!storageKey) return 0
    return readStorage(storageKey).attempts
  })
  const [lockoutRemaining, setLockoutRemaining] = useState(() => {
    if (!storageKey) return 0
    const stored = readStorage(storageKey)
    if (stored.lockedUntil && stored.lockedUntil > Date.now()) {
      return Math.ceil((stored.lockedUntil - Date.now()) / 1000)
    }
    if (stored.lockedUntil) clearStorage(storageKey)
    return 0
  })
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCountdown = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer.current!)
          setAttempts(0)
          if (storageKey) clearStorage(storageKey)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [storageKey])

  // Resume countdown if app reloaded mid-lockout
  useEffect(() => {
    if (lockoutRemaining > 0) startCountdown()
    return () => { if (timer.current) clearInterval(timer.current) }
  // startCountdown is stable (useCallback with stable storageKey dep)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recordFailure = useCallback(() => {
    setAttempts((prev) => {
      const next = prev + 1
      if (next >= maxAttempts) {
        const lockedUntil = Date.now() + lockoutSeconds * 1000
        if (storageKey) writeStorage(storageKey, { attempts: next, lockedUntil })
        setLockoutRemaining(lockoutSeconds)
        startCountdown()
      } else {
        if (storageKey) writeStorage(storageKey, { attempts: next, lockedUntil: null })
      }
      return next
    })
  }, [maxAttempts, lockoutSeconds, storageKey, startCountdown])

  const reset = useCallback(() => {
    setAttempts(0)
    setLockoutRemaining(0)
    if (timer.current) clearInterval(timer.current)
    if (storageKey) clearStorage(storageKey)
  }, [storageKey])

  return {
    attempts,
    isLocked: lockoutRemaining > 0,
    lockoutRemaining,
    recordFailure,
    reset,
  }
}
