import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";

import App from "./App";

const queryClient = new QueryClient();

if (import.meta.env.PROD) {
  window.addEventListener("contextmenu", (e) => e.preventDefault());
}

async function enableMocking() {
  if (import.meta.env.DEV) {
    const { worker } = await import("./mocks/browser");
    return worker.start({
      onUnhandledRequest: "bypass" // Don't warn on unhandled requests like Vite HMR
    });
  }
}

enableMocking().then(() => {
  createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
});
