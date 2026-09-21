import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/format";

interface UserAvatarProps {
  name?: string | null;
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function UserAvatar({ name, size = "default", className }: UserAvatarProps) {
  return (
    <Avatar size={size} className={className}>
      <AvatarFallback>{getInitials(name)}</AvatarFallback>
    </Avatar>
  );
}
