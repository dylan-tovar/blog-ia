import { ViewTransition, type ReactNode } from "react"

export function FadeOut({ children }: { children: ReactNode }) {
  return (
    <ViewTransition exit="fade-out" default="none">
      {children}
    </ViewTransition>
  )
}

export function FadeIn({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="fade-in" default="none">
      {children}
    </ViewTransition>
  )
}
