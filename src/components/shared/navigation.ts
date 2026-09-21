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
  post: "Post",
  author: "Autor",
};

export function getPageTitle(pathname: string) {
  const [firstSegment] = pathname.split("/").filter(Boolean);
  return (firstSegment && PAGE_TITLES[firstSegment]) || "Inicio";
}

export function isNavItemActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/profile" && (pathname.startsWith("/author/") || pathname === "/profile")) {
    return true;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
