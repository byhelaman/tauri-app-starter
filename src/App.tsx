import { lazy, Suspense, type ReactNode } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { isSupabaseConfigured } from "@/lib/supabase"
import { AuthProvider } from "@/contexts/auth-context"
import { ConnectivityProvider } from "@/contexts/connectivity-context"
import { AuthGuard } from "@/components/auth-guard"
import { ThemeProvider } from "@/components/theme-provider"
import { UpdaterProvider } from "@/components/updater-context"
import { UpdateDialog } from "@/components/update-dialog"
import { ErrorBoundary } from "@/components/error-boundary"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
import { AppLayout } from "@/components/app-layout"
import { Shell } from "@/components/window-controls"

const SignInPage = lazy(() =>
  import("@/features/auth/components/SignInPage").then((module) => ({ default: module.SignInPage }))
)
const DashboardPage = lazy(() => import("@/pages/dashboard").then((module) => ({ default: module.DashboardPage })))
const ProjectsPage = lazy(() => import("@/pages/projects").then((module) => ({ default: module.ProjectsPage })))
const OrdersPage = lazy(() => import("@/pages/orders").then((module) => ({ default: module.OrdersPage })))
const SetupPage = lazy(() => import("@/pages/setup").then((module) => ({ default: module.SetupPage })))

function RouteFallback() {
  return (
    <div className="flex min-h-[calc(100svh-3rem)] items-center justify-center">
      <Spinner />
    </div>
  )
}

function lazyRoute(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>
}

function App() {
  if (!isSupabaseConfigured) {
    return (
      <ErrorBoundary>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <Shell>
            {lazyRoute(<SetupPage />)}
          </Shell>
          <Toaster />
        </ThemeProvider>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <UpdaterProvider>
      <BrowserRouter>
        <ConnectivityProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Shell>{lazyRoute(<SignInPage />)}</Shell>} />
            <Route element={<AuthGuard />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={lazyRoute(<DashboardPage />)} />
                <Route path="/projects" element={lazyRoute(<ProjectsPage />)} />
                <Route path="/orders" element={lazyRoute(<OrdersPage />)} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
          <UpdateDialog />
        </AuthProvider>
        </ConnectivityProvider>
      </BrowserRouter>
    </UpdaterProvider>
    </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
