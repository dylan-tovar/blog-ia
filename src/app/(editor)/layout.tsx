import type { ReactNode } from "react";

export default function EditorLayout({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
