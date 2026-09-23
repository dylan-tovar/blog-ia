"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
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
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        Buscando...
      </p>
    );
  }

  if (!results) {
    return null;
  }

  const { people, posts, tags } = results;
  const isEmpty = people.length === 0 && posts.length === 0 && tags.length === 0;

  if (isEmpty) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No encontramos resultados para &ldquo;{query}&rdquo;.
      </p>
    );
  }

  return (
    <div className="flex max-h-[60svh] flex-col gap-4 overflow-y-auto py-2">
      {people.length > 0 && (
        <section aria-labelledby="search-people-heading">
          <h3 id="search-people-heading" className="px-1 text-xs font-semibold text-muted-foreground">
            Personas
          </h3>
          <ul className="mt-1">
            {people.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/author/${person.id}`}
                  onClick={onNavigate}
                  className="flex min-h-11 flex-col justify-center rounded-md px-1 transition-colors hover:bg-muted/60"
                >
                  <span className="truncate text-sm font-medium text-foreground">
                    {person.displayName || "Usuario"}
                  </span>
                  {person.username && (
                    <span className="truncate text-xs text-muted-foreground">@{person.username}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {posts.length > 0 && (
        <section aria-labelledby="search-posts-heading">
          <h3 id="search-posts-heading" className="px-1 text-xs font-semibold text-muted-foreground">
            Publicaciones
          </h3>
          <ul className="mt-1">
            {posts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/post/${post.id}`}
                  onClick={onNavigate}
                  className="flex min-h-11 items-center truncate rounded-md px-1 text-sm text-foreground transition-colors hover:bg-muted/60"
                >
                  {post.title || "Sin título"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tags.length > 0 && (
        <section aria-labelledby="search-tags-heading">
          <h3 id="search-tags-heading" className="px-1 text-xs font-semibold text-muted-foreground">
            Temas
          </h3>
          <div className="mt-1 flex flex-wrap gap-2 px-1">
            {tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/explore?tag=${encodeURIComponent(tag.name)}`}
                onClick={onNavigate}
                className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                #{tag.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
