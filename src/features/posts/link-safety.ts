const SAFE_PROTOCOLS = /^(https?|mailto)$/i;
const INVISIBLE = /[\s​-‍⁠﻿]/u;

// Browsers ignore control characters and whitespace inside a URL scheme, so
// "java\tscript:" still executes; strip them before reading the protocol.
export function isSafeLinkHref(href: string | null | undefined): boolean {
  if (!href) {
    return true;
  }

  const compact = [...href]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 0x20 && !(code >= 0x7f && code <= 0xa0) && !INVISIBLE.test(char);
    })
    .join("");

  const protocol = compact.match(/^([a-z][a-z0-9+.-]*):/i)?.[1];
  return protocol ? SAFE_PROTOCOLS.test(protocol) : true;
}
