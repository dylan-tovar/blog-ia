"use client";

import Link from "next/link";
import { FileText, Hash, Loader2 } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import type { SearchResults as SearchResultsData } from "@/features/discovery/queries";

interface SearchResultsProps {
  query: string;
  results: SearchResultsData | null;
  isPending: boolean;
  onNavigate: () => void;
}

export function SearchResults({ query, results, isPending, onNavigate }: SearchResultsProps) {
  if (!query) {
    return null;
  }

  if (isPending && !results) {
    return (
      <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        <span>Buscando...</span>
      </div>
    );
  }

  if (!results) {
    return null;
  }

  const { people, posts, tags } = results;
  const isEmpty = people.length === 0 && posts.length === 0 && tags.length === 0;

  if (isEmpty) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No encontramos resultados para &ldquo;{query}&rdquo;.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      {people.length > 0 && (
        <section aria-labelledby="search-people-heading">
          <h3 id="search-people-heading" className="px-2 text-xs font-semibold text-muted-foreground">
            Personas
          </h3>
          <ul className="mt-1 flex flex-col gap-1">
            {/* username is nullable in the type but NOT NULL in the DB once
                onboarded — filtering is just a defensive guard against a
                broken /null link, not an expected real-world case. */}
            {people
              .filter((person) => person.username)
              .map((person) => (
              <li key={person.id}>
                <Link
                  href={`/${person.username}`}
                  onClick={onNavigate}
                  className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-muted/70"
                >
                  <UserAvatar
                    name={person.displayName}
                    avatarUrl={person.avatarUrl}
                    className="size-9 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {person.displayName || "Usuario"}
                    </span>
                    {person.username && (
                      <span className="block truncate text-xs text-muted-foreground">@{person.username}</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {posts.length > 0 && (
        <section aria-labelledby="search-posts-heading">
          <h3 id="search-posts-heading" className="px-2 text-xs font-semibold text-muted-foreground">
            Publicaciones
          </h3>
          <ul className="mt-1 flex flex-col gap-1">
            {posts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/p/${post.id}`}
                  onClick={onNavigate}
                  className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted/70"
                >
                  <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-neutral-800 text-muted-foreground">
                    <FileText className="size-4" />
                  </div>
                  <span className="truncate flex-1 font-medium">{post.title || "Sin título"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tags.length > 0 && (
        <section aria-labelledby="search-tags-heading">
          <h3 id="search-tags-heading" className="px-2 text-xs font-semibold text-muted-foreground">
            Temas
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-2 px-2">
            {tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/explore?tag=${encodeURIComponent(tag.name)}`}
                onClick={onNavigate}
                className="flex items-center gap-1.5 rounded-lg bg-neutral-800/80 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-foreground"
              >
                <Hash className="size-3.5 text-muted-foreground" />
                <span>{tag.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
