import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { setupDesktopSessionRefresh } from "@/lib/supabase";

import App from "./App";

setupDesktopSessionRefresh()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Evita refetch en cada montaje para datos que no cambian con frecuencia.
      // Los componentes que necesiten datos frescos pueden sobrescribir con staleTime: 0.
      staleTime: 1000 * 60, // 1 minuto
    },
  },
});

if (import.meta.env.PROD) {
  window.addEventListener("contextmenu", (e) => {
    const target = e.target as HTMLElement
    // Permitir menú contextual nativo en elementos de texto interactivos
    if (
      target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "A"
    ) return
    e.preventDefault()
  })
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
