import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { isSupabaseConfigured } from "@/lib/supabase"
import { AuthProvider } from "@/contexts/auth-context"
import { AuthGuard } from "@/components/auth-guard"
import { ThemeProvider } from "@/components/theme-provider"
import { UpdaterProvider } from "@/components/updater-context"
import { UpdateDialog } from "@/components/update-dialog"
import { ErrorBoundary } from "@/components/error-boundary"
import { Toaster } from "@/components/ui/sonner"
import { SignInPage } from "@/features/auth/components/SignInPage"
import { DashboardPage } from "@/pages/dashboard"
import { ProjectsPage } from "@/pages/projects"
import { TeamPage } from "@/pages/team"
import { AnalyticsPage } from "@/pages/analytics"
import { OrdersPage } from "@/pages/orders"
import { AppLayout } from "@/components/app-layout"
import { SetupPage } from "@/pages/setup"
import { Shell } from "@/components/window-controls"

function App() {
  if (!isSupabaseConfigured) {
    return (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <Shell>
          <SetupPage />
        </Shell>
        <Toaster />
      </ThemeProvider>
    )
  }

  return (
    <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <UpdaterProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Shell><SignInPage /></Shell>} />
            <Route element={<AuthGuard />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/team" element={<TeamPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/orders" element={<OrdersPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
          <UpdateDialog />
        </AuthProvider>
      </BrowserRouter>
    </UpdaterProvider>
    </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
