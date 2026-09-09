import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Conditional className helper. Accepts strings, arrays, and condition objects
 * (`cn('base', { 'text-red-500': isError })`), then merges the result with
 * tailwind-merge so later/overriding Tailwind classes win over earlier ones
 * (e.g. a `className` prop can override a component's base utilities).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
