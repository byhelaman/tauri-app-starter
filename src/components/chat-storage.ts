// Claves de localStorage del chat namespaced por userId.
// Evitan que credenciales/configuración de un usuario queden disponibles
// para otra cuenta que use la misma instalación.

export function apiKeyStorageKey(userId: string): string {
    return `ai_api_key:${userId}`
}

export function modelStorageKey(userId: string): string {
    return `ai_model:${userId}`
}
