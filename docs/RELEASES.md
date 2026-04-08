# Guía de Releases y CI/CD

Cómo compilar, firmar y publicar releases con actualizaciones automáticas.

---

## Setup inicial (una sola vez)

### 1. Generar la clave de firma

```bash
pnpm tauri signer generate -w ~/.tauri/tu-app.key
```

La consola imprimirá algo como:

```
Public key: dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1...
Private key saved to: /Users/.../.tauri/tu-app.key
```

**Guarda la public key** — la necesitarás en `tauri.conf.json`.

### 2. Configurar `tauri.conf.json`

```json
"plugins": {
  "updater": {
    "pubkey": "PEGA_TU_PUBLIC_KEY_AQUÍ",
    "endpoints": [
      "https://github.com/TU_USUARIO/TU_REPO/releases/latest/download/latest.json"
    ],
    "windows": {
      "installMode": "passive"
    }
  }
}
```

### 3. Agregar secretos en GitHub

`Settings → Secrets and variables → Actions → New repository secret`

| Nombre | Valor |
|--------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contenido completo del archivo `.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Contraseña ingresada al generar la clave |

---

## Workflow de GitHub Actions

El archivo `.github/workflows/release.yml` ya está incluido en el repositorio. Se dispara automáticamente al hacer push de cualquier tag `v*`.

---

## Publicar una release

```bash
# 1. Actualizar la versión en ambos archivos
#    - src-tauri/tauri.conf.json  → "version": "X.Y.Z"
#    - src-tauri/Cargo.toml       → version = "X.Y.Z"

# 2. Commit y tag
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: bump version to X.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

El workflow se dispara automáticamente con el tag. En ~10 minutos tendrás el release publicado en GitHub con:

- `tauri-app_X.Y.Z_x64-setup.exe` — instalador NSIS
- `tauri-app_X.Y.Z_x64_en-US.msi` — instalador MSI
- `latest.json` — metadata para el updater

---

## Cómo funciona el updater

1. Al abrir la app, `use-updater.tsx` llama a `check()` del plugin updater
2. El plugin consulta el endpoint configurado en `tauri.conf.json`
3. Compara la versión del `latest.json` con la versión actual
4. Si hay una versión más nueva, muestra el `UpdateDialog`
5. El usuario puede descargar e instalar, o posponer
6. La descarga muestra progreso en tiempo real
7. Al terminar, `relaunch()` reinicia la app con la nueva versión

El check se repite automáticamente cada 4 horas mientras la app esté abierta.

---

## Notas

- **`installMode: "passive"`** — el instalador muestra una barra de progreso pero no requiere interacción del usuario
- El archivo `.key` nunca debe comitearse al repositorio — agrégalo al `.gitignore`
- Para builds de prueba sin actualización automática, no necesitas la clave (solo para producción)
