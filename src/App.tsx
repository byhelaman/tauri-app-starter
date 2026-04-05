import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { isSupabaseConfigured } from "@/lib/supabase"
import { AuthProvider } from "@/contexts/auth-context"
import { AuthGuard } from "@/components/auth-guard"
import { UpdaterProvider } from "@/components/updater-context"
import { UpdateDialog } from "@/components/update-dialog"
import { Toaster } from "@/components/ui/sonner"
import { SignInPage } from "@/features/auth/components/SignInPage"
import { DashboardPage } from "@/pages/dashboard"
import { SetupPage } from "@/pages/setup"

function App() {
  if (!isSupabaseConfigured) {
    return (
      <>
        <SetupPage />
        <Toaster />
      </>
    )
  }

  return (
    <UpdaterProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<SignInPage />} />
            <Route element={<AuthGuard />}>
              <Route path="/" element={<DashboardPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
          <UpdateDialog />
        </AuthProvider>
      </BrowserRouter>
    </UpdaterProvider>
  )
}

export default App
