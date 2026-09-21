"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, LogOut } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { SettingsForm } from "@/features/profile/components/SettingsForm";
import { signOut } from "@/features/auth/actions";

interface AccountSettingsProps {
  user: {
    id: string;
    email?: string | null;
    phone?: string | null;
  };
  profile: {
    id: string;
    display_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  } | null;
  postCount?: number;
}

export function AccountSettings({ user, profile, postCount = 0 }: AccountSettingsProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSection, setDrawerSection] = useState<"profile" | "email" | "phone" | "handle">("profile");

  const displayName = profile?.display_name || "Usuario";
  const username = profile?.username || "usuario";
  const email = user.email || "No registrado";
  const phone = user.phone || "+584123847815";

  function openEdit(section: "profile" | "email" | "phone" | "handle") {
    setDrawerSection(section);
    setDrawerOpen(true);
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      {/* ACCOUNT SECTION */}
      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Account
        </h2>

        <div className="flex flex-col gap-6 rounded-2xl border border-neutral-800 bg-[#161618] p-4 shadow-sm sm:p-5">
          {/* Row 1: Profile */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <UserAvatar
                name={displayName}
                className="size-14 rounded-full ring-1 ring-border/50 text-base font-semibold"
              />
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-foreground">Profile</p>
                <p className="truncate text-sm text-muted-foreground">{displayName}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openEdit("profile")}
              className="shrink-0 rounded-lg bg-neutral-800 px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-neutral-700 cursor-pointer"
            >
              Edit
            </button>
          </div>

          {/* Row 2: Email */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-foreground">Email</p>
              <p className="truncate text-sm text-muted-foreground">{email}</p>
            </div>
            <button
              type="button"
              onClick={() => openEdit("email")}
              className="shrink-0 rounded-lg bg-neutral-800 px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-neutral-700 cursor-pointer"
            >
              Edit
            </button>
          </div>

          {/* Row 3: Phone */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-foreground">Phone</p>
              <p className="truncate text-sm text-muted-foreground">{phone}</p>
            </div>
            <button
              type="button"
              onClick={() => openEdit("phone")}
              className="shrink-0 rounded-lg bg-neutral-800 px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-neutral-700 cursor-pointer"
            >
              Edit
            </button>
          </div>

          {/* Row 4: Handle */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-foreground">Handle</p>
              <p className="truncate text-sm text-muted-foreground">@{username}</p>
            </div>
            <button
              type="button"
              onClick={() => openEdit("handle")}
              className="shrink-0 rounded-lg bg-neutral-800 px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-neutral-700 cursor-pointer"
            >
              Edit
            </button>
          </div>
        </div>
      </section>

      {/* PUBLICATIONS SECTION */}
      <section className="mt-8">
        <h2 className="mb-2 px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Publications
        </h2>

        <div className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-[#161618] p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-neutral-800 text-primary">
                <BookOpen className="size-5" />
              </div>
              <div>
                <p className="text-[15px] font-medium text-foreground">Mis artículos</p>
                <p className="text-xs text-muted-foreground">
                  {postCount} {postCount === 1 ? "publicación" : "publicaciones"}
                </p>
              </div>
            </div>
            <Link
              href="/posts"
              className="shrink-0 rounded-lg bg-neutral-800 px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-neutral-700"
            >
              Ver posts
            </Link>
          </div>
        </div>
      </section>

      {/* SIGN OUT */}
      <div className="mt-8 px-1">
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-transparent py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-neutral-900 hover:text-red-400 cursor-pointer"
          >
            <LogOut className="size-4" />
            Cerrar sesión
          </button>
        </form>
      </div>

      {/* EDIT DRAWER */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} showSwipeHandle>
        <DrawerContent className="mx-2 mb-2 max-w-lg pb-6 pt-1 sm:mx-auto [--drawer-inset:0.5rem] data-[swipe-direction=down]:rounded-2xl data-[swipe-direction=down]:border border-border/80 shadow-2xl after:hidden">
          <DrawerHeader className="px-5 pt-3">
            <DrawerTitle>
              {drawerSection === "profile" && "Editar perfil"}
              {drawerSection === "handle" && "Editar nombre de usuario"}
              {drawerSection === "email" && "Correo electrónico"}
              {drawerSection === "phone" && "Número de teléfono"}
            </DrawerTitle>
            <DrawerDescription>
              {drawerSection === "profile" || drawerSection === "handle"
                ? "Actualizá tu información pública para la comunidad."
                : "Información de contacto asociada a tu cuenta."}
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-5 py-4">
            {drawerSection === "profile" || drawerSection === "handle" ? (
              <SettingsForm
                initialDisplayName={displayName}
                initialUsername={username}
              />
            ) : drawerSection === "email" ? (
              <div className="flex flex-col gap-4 text-sm">
                <p className="text-muted-foreground">
                  Tu correo actual es <strong className="text-foreground">{email}</strong>.
                </p>
                <p className="text-xs text-muted-foreground">
                  El correo se gestiona a través de la autenticación segura.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 text-sm">
                <p className="text-muted-foreground">
                  Tu teléfono registrado es <strong className="text-foreground">{phone}</strong>.
                </p>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
