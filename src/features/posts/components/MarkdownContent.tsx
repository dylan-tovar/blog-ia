import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ARTICLE_PROSE_CLASS } from "@/features/posts/components/markdown-styles";
import { cn } from "@/lib/utils";

const EXTERNAL_URL = /^https?:\/\//i;

// Raw HTML is never rendered (no rehype-raw), images are dropped and unsafe URL
// protocols are stripped by react-markdown's default urlTransform.
export function MarkdownContent({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn(ARTICLE_PROSE_CLASS, className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={["img"]}
        components={{
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
