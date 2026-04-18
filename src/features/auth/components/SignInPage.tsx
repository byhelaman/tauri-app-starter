import { useState } from "react"
import { SignInForm } from "./SignInForm"
import { SignupForm } from "./SignupForm"
import { RecoveryForm } from "./RecoveryForm"
import { InviteAcceptForm } from "./InviteAcceptForm"

type View = "signin" | "signup" | "recovery" | "invite"

export function SignInPage() {
  const [view, setView] = useState<View>("signin")

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        {view === "signin" && (
          <SignInForm
            onSignUp={() => setView("signup")}
            onForgotPassword={() => setView("recovery")}
            onInvite={() => setView("invite")}
          />
        )}
        {view === "signup" && (
          <SignupForm onSignIn={() => setView("signin")} />
        )}
        {view === "recovery" && (
          <RecoveryForm onSignIn={() => setView("signin")} />
        )}
        {view === "invite" && (
          <InviteAcceptForm onSignIn={() => setView("signin")} />
        )}
      </div>
    </div>
  )
}
