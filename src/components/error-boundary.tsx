import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangleIcon } from "lucide-react"
import { Shell } from "@/components/window-controls"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state

    if (error) {
      return (
        <Shell>
          <div className="flex min-h-full items-center justify-center p-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <AlertTriangleIcon className="text-destructive" />
                </EmptyMedia>
                <EmptyTitle>Something went wrong</EmptyTitle>
                <EmptyDescription>
                  An unexpected error occurred. You can try again or restart the app.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Textarea
                  readOnly
                  value={error.message}
                  aria-label="Error details"
                  className="min-h-0 max-h-45 resize-none text-xs scrollbar mb-2"
                />
                <div className="flex flex-row justify-center gap-2">
                  <Button onClick={this.reset}>Try again</Button>
                  <Button variant="outline" onClick={() => window.location.reload()}>Reload</Button>
                </div>
              </EmptyContent>
            </Empty>
          </div>
        </Shell>
      )
    }

    return this.props.children
  }
}
