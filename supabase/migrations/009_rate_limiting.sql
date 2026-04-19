-- ============================================================
-- 009: Rate limiting genérico + gates en RPCs sensibles
-- ============================================================
-- Introduce una infraestructura de rate-limiting reutilizable
-- (tabla rate_limits + función check_rate_limit) y la aplica a:
--   - verify_user_password: 5 intentos / 15 min
--   - ai.chat (consumida por el edge function ai-chat): 30 / 60s
--
-- Diseño:
--   - Tabla con clave compuesta (bucket, user_id) — un bucket por
--     RPC o flujo a proteger.
--   - Ventana deslizante simple (no token bucket): se resetea el
--     contador cuando ha pasado window_seconds desde window_start.
--   - SECURITY DEFINER + SET search_path = '' — sigue el patrón
--     del resto de RPCs.

-- ============================================================
-- 1. TABLA Y POLÍTICAS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
    bucket       TEXT        NOT NULL,
    user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempts     INT         NOT NULL DEFAULT 1,
    PRIMARY KEY (bucket, user_id)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits(window_start);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits FORCE ROW LEVEL SECURITY;

-- Sin políticas SELECT/INSERT/UPDATE — el acceso es exclusivamente
-- via la función SECURITY DEFINER check_rate_limit.

-- ============================================================
-- 2. CHECK_RATE_LIMIT
-- ============================================================

-- Devuelve TRUE si el usuario está bajo el límite (y registra el intento),
-- FALSE si lo ha excedido. Atómica: usa FOR UPDATE para evitar race conditions.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_bucket          TEXT,
    p_max_attempts    INT,
    p_window_seconds  INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_row  RECORD;
BEGIN
    IF v_user IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Garantiza fila idempotentemente — evita race en INSERT concurrente.
    -- attempts=0 para que el path normal de abajo lo suba a 1 en el primer intento.
    INSERT INTO public.rate_limits (bucket, user_id, attempts, window_start)
    VALUES (p_bucket, v_user, 0, now())
    ON CONFLICT (bucket, user_id) DO NOTHING;

    -- Lock pesimista: evita que dos requests concurrentes pasen el check
    SELECT * INTO v_row
    FROM public.rate_limits
    WHERE bucket = p_bucket AND user_id = v_user
    FOR UPDATE;

    -- Reset si la ventana expiró
    IF v_row.window_start < now() - (p_window_seconds || ' seconds')::INTERVAL THEN
        UPDATE public.rate_limits
        SET attempts = 1, window_start = now()
        WHERE bucket = p_bucket AND user_id = v_user;
        RETURN TRUE;
    END IF;

    IF v_row.attempts >= p_max_attempts THEN
        RETURN FALSE;
    END IF;

    UPDATE public.rate_limits
    SET attempts = attempts + 1
    WHERE bucket = p_bucket AND user_id = v_user;

    RETURN TRUE;
END;
$$;

-- Helper interno — no se expone a clientes para reducir superficie de uso indebido
-- (creación de buckets arbitrarios, fingerprinting, etc.). Sólo se llama desde
-- otras funciones SECURITY DEFINER del schema public.
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;

-- Wrapper específico para el edge function ai-chat — sin parámetros, límite hardcoded.
CREATE OR REPLACE FUNCTION public.check_ai_chat_rate_limit()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.check_rate_limit('ai_chat', 30, 60);
$$;

REVOKE ALL ON FUNCTION public.check_ai_chat_rate_limit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_ai_chat_rate_limit() TO authenticated;

-- ============================================================
-- 3. VERIFY_USER_PASSWORD CON GATE
-- ============================================================

-- Reemplaza la versión de migración 001 añadiendo throttling.
-- 5 intentos por ventana de 15 minutos por usuario.
CREATE OR REPLACE FUNCTION public.verify_user_password(p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id            UUID;
    v_encrypted_password TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    -- Throttle: bloquea brute-force de la contraseña actual del propio user.
    IF NOT public.check_rate_limit('verify_password', 5, 900) THEN
        RAISE EXCEPTION 'Demasiados intentos. Espera 15 minutos antes de reintentar.';
    END IF;

    SELECT encrypted_password INTO v_encrypted_password
    FROM auth.users
    WHERE id = v_user_id;

    IF v_encrypted_password IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN v_encrypted_password = extensions.crypt(p_password, v_encrypted_password);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_user_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_user_password(text) TO authenticated;
