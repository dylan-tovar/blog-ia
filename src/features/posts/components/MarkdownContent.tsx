import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ARTICLE_PROSE_CLASS } from "@/features/posts/components/markdown-styles";
import { isAllowedImageUrl, parseImageSize } from "@/features/posts/images/image-utils";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

const EXTERNAL_URL = /^https?:\/\//i;

// Raw HTML is never rendered (no rehype-raw) and unsafe URL protocols are stripped by
// react-markdown's default urlTransform. Images render only when they come from our own
// public post-images bucket, so a post cannot embed (or track readers through) foreign hosts.
export function MarkdownContent({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn(ARTICLE_PROSE_CLASS, className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          img({ src, alt }) {
            if (typeof src !== "string" || !isAllowedImageUrl(src, env.NEXT_PUBLIC_SUPABASE_URL)) {
              // Never load a foreign image, but keep its alt text so the content does not vanish.
              return alt ? <span>{alt}</span> : null;
            }
            // Dimensions are encoded in the file name at upload time, so the browser can
            // reserve the space before the image loads (no layout shift).
            const size = parseImageSize(src);
            return (
              // eslint-disable-next-line @next/next/no-img-element -- already compressed to WebP <= 1600px at upload; skips the host's image optimizer quota
              <img
                src={src}
                alt={alt ?? ""}
                width={size?.width}
                height={size?.height}
                loading="lazy"
                decoding="async"
                className="h-auto max-w-full rounded-md"
              />
            );
          },
          table({ children: tableChildren }) {
            return (
              <div className="table-scroll">
                <table>{tableChildren}</table>
              </div>
            );
          },
          a({ href, children: linkChildren }) {
            const isExternal = href ? EXTERNAL_URL.test(href) : false;
            return (
              <a
                href={href}
                {...(isExternal ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
              >
                {linkChildren}
              </a>
            );
          },
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
