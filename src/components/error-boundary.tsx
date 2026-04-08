import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
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
        <div className="flex min-h-svh items-center justify-center p-6">
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
              <div className="w-full">
                <div className="max-h-45 overflow-y-auto rounded-md border bg-muted/50">
                  <pre className="px-3 py-2 whitespace-pre-wrap text-wrap text-xs text-left">
                    {error.message}
                  </pre>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={this.reset}>Try again</Button>
                <Button variant="outline" onClick={this.reset}>Reload</Button>
              </div>
            </EmptyContent>
          </Empty>
        </div>
      )
    }

    return this.props.children
  }
}
