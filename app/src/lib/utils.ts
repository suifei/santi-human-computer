import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** public/ 资源。GitHub Pages 的 BASE_URL 是 `/santi-human-computer/`，不能写死 `/xxx`。 */
export function asset(path: string): string {
  const file = path.replace(/^\//, '')
  const base = import.meta.env.BASE_URL
  if (!base || base === './') return `/${file}`
  return `${base.endsWith('/') ? base : `${base}/`}${file}`
}
