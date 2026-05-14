# Edge Functions — Convenciones y Patrones

## Inventario de funciones

| Función | Contexto builder | Propósito |
|---------|-----------------|-----------|
| `admin-users` | `buildAuthContext` | Router multipropósito: list, update_role, update_display_name, delete, delete_own_account |
| `admin-invite-user` | `buildActorContext` | Invitar nuevo usuario por email y asignarle rol inicial |
| `admin-reset-user-password` | `buildAdminContext` | Resetear contraseña de otro usuario |
| `admin-update-user-email` | `buildAdminContext` | Actualizar email de otro usuario |

## Convención de respuestas HTTP

> **Todas las Edge Functions de este proyecto retornan HTTP 200** para cualquier error de negocio o de servidor, usando el campo `success` para discriminar el resultado.

### Razón

El cliente Supabase JS (`supabase.functions.invoke`) lanza una excepción antes de leer el cuerpo de la respuesta cuando el status es 4xx o 5xx. Esto impide que el frontend muestre mensajes de error específicos al usuario.

### Formato de respuesta estándar

```typescript
// ✅ Éxito
json(200, { success: true, data: ... }, origin)

// ✅ Error de negocio o validación
json(200, { success: false, message: "Descripción del error para el usuario" }, origin)

// ✅ Error de servidor (DB no disponible, fallo de escritura, etc.)
json(200, { success: false, message: "Could not perform action" }, origin)
```

### Excepciones — status que SÍ usan HTTP no-200

Los siguientes errores ocurren **antes** de que el cliente pueda interpretar el body, por lo que usar 4xx/5xx es correcto:

| Caso | Status |
|------|--------|
| Origin no permitido (CORS) | `403` |
| Método no permitido | `405` |
| Falta o inválido el Bearer token | `401` |
| JWT inválido / sesión expirada | `401` |
| JSON body inválido | `400` |
| Variables de entorno del servidor faltantes | `500` |
| Actor profile no encontrado tras auth válida | `403` |

### Patrón de consumo en el frontend

```typescript
const { data, error } = await supabase.functions.invoke("admin-users", {
  body: { action: "delete", targetUserId: id },
})

// `error` solo se lanza en errores de red o status no-2xx del framework
if (error) return { error: error.message }

// Leer `success` para saber si la operación fue exitosa
const res = (data ?? {}) as { success?: boolean; message?: string }
if (!res.success) return { error: res.message ?? "Unknown error" }
```

## Contextos de autenticación

Los builders en `_shared/admin-handler.ts` encapsulan el scaffolding de auth:

| Builder | Cuándo usarlo |
|---------|--------------|
| `buildAuthContext` | Router pattern — cada action tiene su propio check de permisos |
| `buildActorContext` | Operaciones que sólo necesitan verificar al actor (ej. invite) |
| `buildAdminContext` | Operaciones sobre un usuario existente — verifica jerarquía actor > target |

## Límites conocidos

- `handleList` usa `auth.admin.listUsers()` sin paginación → máximo ~1000 usuarios por defecto de GoTrue. Refactorizar con `page`/`perPage` cuando el workspace supere ese umbral. Ver comentario TODO en `admin-users/index.ts:174`.
- `requirePermission` en `admin-users` usa un mapa estático de nivel mínimo en lugar de consultar `role_permissions` dinámicamente. Adecuado para los permisos actuales; revisar si se añaden permisos custom con niveles no estándar.
