export const NAV_ITEMS = [
  { href: "/", label: "Inicio" },
  { href: "/explore", label: "Explorar" },
  { href: "/activity", label: "Actividad" },
  { href: "/profile", label: "Perfil" },
] as const;

const PAGE_TITLES: Record<string, string> = {
  posts: "Mis posts",
  explore: "Explorar",
  activity: "Actividad",
  settings: "Settings",
  profile: "Perfil",
};

export function getPageTitle(pathname: string) {
  const [firstSegment] = pathname.split("/").filter(Boolean);
  return (firstSegment && PAGE_TITLES[firstSegment]) || "Inicio";
}

// `/[username]` is a bare top-level segment indistinguishable from any other
// by prefix alone — unlike the old `/author/[id]`, there's no static
// "author" prefix to match against. The viewer's own username has to be
// passed in to recognize "I'm looking at my own profile" as active.
export function isNavItemActive(pathname: string, href: string, viewerUsername?: string | null) {
  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/profile") {
    return pathname === "/profile" || (!!viewerUsername && pathname === `/${viewerUsername}`);
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
