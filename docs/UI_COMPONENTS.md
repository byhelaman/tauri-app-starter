# Auditoría de Componentes UI (`shadcn/ui`)

**Fecha de la última auditoría:** 2026-05-14

Este proyecto utiliza `shadcn/ui` como base para los componentes de interfaz,
ubicados en `src/components/ui`. Sin embargo, para adaptar la librería a un
entorno de escritorio (Tauri) y a las necesidades específicas de la aplicación,
se han realizado modificaciones directas sobre el código fuente de los
componentes generados.

Este documento sirve como advertencia y guía para futuras actualizaciones. **Si
actualizas componentes mediante el CLI de shadcn (`pnpm dlx shadcn add ...`),
ten cuidado de no sobrescribir estas modificaciones.**

## 1. Componentes Base Modificados

Estos componentes fueron generados originalmente por el CLI pero han sufrido
alteraciones locales significativas:

| Componente          | Modificación                                                                                                                                                                                         | Impacto en Upgrade                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `dialog.tsx`        | **Crítico.** Se añadió el componente custom `DialogBody` para manejar `overflow` y scroll interno fluido. El componente `DialogContent` se convirtió en un contenedor `flex-col` con `max-h-[85vh]`. | Sobrescribirlo romperá el layout de modales largos (Profile, Settings) que usan `DialogBody`. **No actualizar ciegamente**. |
| `input-group.tsx`   | Ajustes de márgenes, utilidades y clases sobre su preset original.                                                                                                                                   | Precaución al actualizar.                                                                                                   |
| `calendar.tsx`      | Se eliminó `"use client"`.                                                                                                                                                                           | Inofensivo (es una directiva exclusiva de Server Components).                                                               |
| `checkbox.tsx`      | Se eliminó `"use client"`.                                                                                                                                                                           | Inofensivo.                                                                                                                 |
| `command.tsx`       | Se eliminó `"use client"`.                                                                                                                                                                           | Inofensivo.                                                                                                                 |
| `context-menu.tsx`  | Se eliminó `"use client"`.                                                                                                                                                                           | Inofensivo.                                                                                                                 |
| `popover.tsx`       | Se eliminó `"use client"`.                                                                                                                                                                           | Inofensivo.                                                                                                                 |
| `sheet.tsx`         | Se eliminó `"use client"`.                                                                                                                                                                           | Inofensivo.                                                                                                                 |
| `dropdown-menu.tsx` | Mantiene `"use client"`.                                                                                                                                                                             | Inofensivo.                                                                                                                 |
| `table.tsx`         | Cambios mínimos en utilidades de Tailwind.                                                                                                                                                           | Inofensivo.                                                                                                                 |
| `label.tsx`         | Modificaciones menores en clases de estado (`has-checked` o utilidades).                                                                                                                             | Revisar visualmente.                                                                                                        |
| `sonner.tsx`        | Ajuste en configuración y clases de toast.                                                                                                                                                           | Revisar visualmente.                                                                                                        |

## 2. Componentes Completamente Personalizados (Custom Primitives)

Los siguientes componentes existen dentro de la carpeta `src/components/ui/`
pero **fueron creados desde cero**. No pertenecen a `shadcn/ui` y el CLI
fallaría si intentas instalarlos:

- `autocomplete.tsx`: Autocompletado server-side/client-side híbrido sobre
  Command.
- `date-picker.tsx`: Selectores de fecha simples y de rangos integrados con
  `InputGroup`.
- `empty.tsx`: Componentes para estados vacíos de listas y tablas.
- `field-skeleton.tsx`: Loaders genéricos (esqueletos) orientados a layout
  vertical y horizontal.
- `field.tsx`: Motor de layout de formularios (`Field`, `FieldGroup`,
  `FieldLabel`, etc.) que reemplaza al `Form` genérico de react-hook-form para
  mayor flexibilidad.

## 3. Componentes Intactos (Pristine)

Los siguientes componentes son 1:1 iguales a los emitidos por `shadcn` y
**pueden ser actualizados sin riesgo**:

`alert-dialog.tsx`, `avatar.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`,
`collapsible.tsx`, `input.tsx`, `progress.tsx`, `select.tsx`, `separator.tsx`,
`skeleton.tsx`, `switch.tsx`, `tabs.tsx`, `textarea.tsx`.
