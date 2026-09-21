"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

type PasswordFieldProps = Omit<ComponentProps<typeof Input>, "type"> & {
  showLabel: string;
  hideLabel: string;
};

export function PasswordField({
  showLabel,
  hideLabel,
  className,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        autoComplete="new-password"
        {...props}
        type={visible ? "text" : "password"}
        // Revealed, the field is a plain text input: stop iOS/Chrome from
        // capitalizing, autocorrecting or spellchecking the password.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn("pr-11 md:pr-9", className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={visible ? hideLabel : showLabel}
        onClick={() => setVisible((v) => !v)}
        className="absolute top-0 right-0 size-11 text-muted-foreground md:size-9"
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
}
