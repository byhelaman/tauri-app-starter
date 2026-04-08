import { useEffect, useRef, useState } from "react"

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
  function getInitialState(): { attempts: number; lockoutRemaining: number } {
    if (!storageKey) return { attempts: 0, lockoutRemaining: 0 }
    const stored = readStorage(storageKey)
    if (stored.lockedUntil && stored.lockedUntil > Date.now()) {
      return {
        attempts: stored.attempts,
        lockoutRemaining: Math.ceil((stored.lockedUntil - Date.now()) / 1000),
      }
    }
    // Lockout expired — clear storage
    if (stored.lockedUntil) clearStorage(storageKey)
    return { attempts: stored.attempts, lockoutRemaining: 0 }
  }

  const initial = getInitialState()
  const [attempts, setAttempts] = useState(initial.attempts)
  const [lockoutRemaining, setLockoutRemaining] = useState(initial.lockoutRemaining)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Resume countdown if app reloaded mid-lockout
  useEffect(() => {
    if (lockoutRemaining > 0) startCountdown()
    return () => { if (timer.current) clearInterval(timer.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function startCountdown() {
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
  }

  function recordFailure() {
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
  }

  function reset() {
    setAttempts(0)
    setLockoutRemaining(0)
    if (timer.current) clearInterval(timer.current)
    if (storageKey) clearStorage(storageKey)
  }

  return {
    attempts,
    isLocked: lockoutRemaining > 0,
    lockoutRemaining,
    recordFailure,
    reset,
  }
}
