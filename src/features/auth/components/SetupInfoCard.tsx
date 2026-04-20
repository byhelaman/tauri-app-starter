import { GlobeIcon, KeyRoundIcon, ClipboardCheckIcon, FileCodeIcon, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"

interface Step {
  icon: LucideIcon
  title: string
  description: React.ReactNode
}

const STEPS: Step[] = [
  {
    icon: GlobeIcon,
    title: "Create a free project",
    description: (
      <>
        Sign up at{" "}
        <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-4">
          supabase.com
        </a>{" "}
        and create a new project.
      </>
    ),
  },
  {
    icon: KeyRoundIcon,
    title: "Copy your credentials",
    description: <>Go to <span className="text-foreground">Project Settings → API Keys</span> and copy the URL and anon key.</>,
  },
  {
    icon: ClipboardCheckIcon,
    title: "Paste them in the form",
    description: "Come back here and enter both values to connect the app.",
  },
  {
    icon: FileCodeIcon,
    title: "Developer shortcut",
    description: (
      <>
        Set <code className="font-mono">VITE_SUPABASE_URL</code> and{" "}
        <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> in a{" "}
        <code className="font-mono">.env</code> file to skip this screen.
      </>
    ),
  },
]

interface SetupInfoCardProps {
  onBack: () => void
}

export function SetupInfoCard({ onBack }: SetupInfoCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Get started with Supabase</CardTitle>
        <CardDescription>Follow these steps to get your project credentials.</CardDescription>
        <CardAction>
          <Button variant="link" onClick={onBack}>Back to setup</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ItemGroup>
          {STEPS.map(({ icon: Icon, title, description }) => (
            <Item key={title} size="sm">
              <ItemMedia variant="icon"><Icon /></ItemMedia>
              <ItemContent>
                <ItemTitle>{title}</ItemTitle>
                <ItemDescription className="line-clamp-3">{description}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-center text-muted-foreground">
          Need help?{" "}
          <a href="https://supabase.com/docs" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-4">
            Read the docs
          </a>.
        </p>
      </CardFooter>
    </Card>
  )
} 
