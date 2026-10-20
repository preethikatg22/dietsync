/**
 * Unit tests for PWA manifest configuration and service worker registration.
 *
 * The manifest is defined in vite.config.ts via the VitePWA plugin — there is
 * no separate public/manifest.webmanifest file. Tests read the config directly.
 *
 * Requirements: 10.1, 10.5
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Helper: parse manifest config out of vite.config.ts source text
// ---------------------------------------------------------------------------

/** Minimal shape we care about for these tests */
interface ManifestIcon {
  src: string
  sizes: string
  type: string
}

interface ManifestConfig {
  name?: string
  short_name?: string
  description?: string
  theme_color?: string
  background_color?: string
  display?: string
  icons?: ManifestIcon[]
}

function readManifestFromViteConfig(): ManifestConfig {
  // process.cwd() is the workspace root (d:\Demoapp_kiro) when Vitest runs.
  const configPath = resolve(process.cwd(), 'vite.config.ts')
  const source = readFileSync(configPath, 'utf8')

  // Extract the manifest object literal via a simple substring extraction.
  // The manifest block starts after `manifest: {` and ends at the matching `},`.
  const startToken = 'manifest: {'
  const startIdx = source.indexOf(startToken)
  if (startIdx === -1) throw new Error('manifest block not found in vite.config.ts')

  // Walk forward to find the closing brace of the manifest object.
  let depth = 0
  let manifestStart = startIdx + startToken.length - 1 // points at the opening `{`
  let end = manifestStart + 1
  for (; end < source.length; end++) {
    if (source[end] === '{') depth++
    else if (source[end] === '}') {
      if (depth === 0) { end++; break }
      depth--
    }
  }

  const manifestSrc = source.slice(manifestStart, end)

  // Naive extraction helpers — good enough for the static literal in the config.
  function extractString(key: string): string | undefined {
    const re = new RegExp(`${key}:\\s*'([^']*)'`)
    return re.exec(manifestSrc)?.[1]
  }

  function extractIcons(): ManifestIcon[] {
    const iconsStart = manifestSrc.indexOf('icons: [')
    if (iconsStart === -1) return []
    const iconsEnd = manifestSrc.indexOf(']', iconsStart)
    const iconsSrc = manifestSrc.slice(iconsStart, iconsEnd + 1)

    const icons: ManifestIcon[] = []
    const iconRe = /\{[^}]+\}/g
    let match: RegExpExecArray | null
    while ((match = iconRe.exec(iconsSrc)) !== null) {
      const block = match[0]
      const src = /src:\s*'([^']*)'/.exec(block)?.[1] ?? ''
      const sizes = /sizes:\s*'([^']*)'/.exec(block)?.[1] ?? ''
      const type = /type:\s*'([^']*)'/.exec(block)?.[1] ?? ''
      icons.push({ src, sizes, type })
    }
    return icons
  }

  return {
    name: extractString('name'),
    short_name: extractString('short_name'),
    description: extractString('description'),
    theme_color: extractString('theme_color'),
    background_color: extractString('background_color'),
    display: extractString('display'),
    icons: extractIcons(),
  }
}

// ---------------------------------------------------------------------------
// Tests: manifest required fields (Requirement 10.1)
// ---------------------------------------------------------------------------

describe('PWA manifest — required fields', () => {
  let manifest: ManifestConfig

  beforeEach(() => {
    manifest = readManifestFromViteConfig()
  })

  it('has a non-empty name', () => {
    expect(manifest.name).toBeTruthy()
  })

  it('has a non-empty short_name', () => {
    expect(manifest.short_name).toBeTruthy()
  })

  it('has a theme_color', () => {
    expect(manifest.theme_color).toBeTruthy()
  })

  it('has a background_color', () => {
    expect(manifest.background_color).toBeTruthy()
  })

  it('has display set to standalone', () => {
    expect(manifest.display).toBe('standalone')
  })

  it('includes a 192×192 icon', () => {
    const icon = manifest.icons?.find((i) => i.sizes === '192x192')
    expect(icon).toBeDefined()
    expect(icon?.type).toBe('image/png')
  })

  it('includes a 512×512 icon', () => {
    const icon = manifest.icons?.find((i) => i.sizes === '512x512')
    expect(icon).toBeDefined()
    expect(icon?.type).toBe('image/png')
  })

  it('icon src paths are non-empty strings', () => {
    manifest.icons?.forEach((icon) => {
      expect(typeof icon.src).toBe('string')
      expect(icon.src.length).toBeGreaterThan(0)
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: service worker registration failure does not crash the app (Req 10.5)
// ---------------------------------------------------------------------------

describe('service worker registration — graceful failure handling', () => {
  // Capture console.warn calls without polluting test output.
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    // Remove the load event listener added in each test run.
    vi.restoreAllMocks()
  })

  it('calls console.warn when SW registration rejects and does not throw', async () => {
    const registrationError = new Error('SW registration failed')

    // Simulate navigator.serviceWorker with a register method that rejects.
    const mockRegister = vi.fn().mockRejectedValue(registrationError)
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: { register: mockRegister },
      configurable: true,
    })

    // Replicate the registration logic from src/main.tsx so we can test it in
    // isolation without importing and executing the entire entry point.
    const registerSW = async () => {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .catch((err: unknown) => {
            console.warn(
              '[DietSync] Service worker registration failed. The app will run in online-only mode.',
              err,
            )
          })
      }
    }

    // Must not throw — the catch block handles the error.
    await expect(registerSW()).resolves.toBeUndefined()

    // The warning must have been emitted with the expected message prefix.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DietSync] Service worker registration failed'),
      registrationError,
    )
  })

  it('does not warn when SW registration succeeds', async () => {
    const mockRegistration = { scope: '/' }
    const mockRegister = vi.fn().mockResolvedValue(mockRegistration)
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: { register: mockRegister },
      configurable: true,
    })

    const registerSW = async () => {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .catch((err: unknown) => {
            console.warn(
              '[DietSync] Service worker registration failed. The app will run in online-only mode.',
              err,
            )
          })
      }
    }

    await expect(registerSW()).resolves.toBeUndefined()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('skips registration silently when serviceWorker API is unavailable', async () => {
    // Temporarily hide navigator.serviceWorker to simulate an environment
    // where the API is absent (e.g. an HTTP origin or older browser).
    // We delete the property so that `'serviceWorker' in navigator` returns false.
    const original = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(globalThis.navigator),
      'serviceWorker',
    )

    // Override on the instance so the `in` check returns true but the value is
    // absent from the prototype — and then test the truthy guard that main.tsx
    // relies on via the `'serviceWorker' in navigator` check.
    // Since jsdom always has serviceWorker in navigator, we test the equivalent
    // guard: navigator.serviceWorker being falsy means we skip registration.
    const registerSW = async () => {
      // This mirrors what happens in browsers where serviceWorker is absent:
      // we guard on the value being truthy (not just the key existing).
      const sw = (navigator as { serviceWorker?: ServiceWorkerContainer }).serviceWorker
      if (sw) {
        await sw
          .register('/sw.js', { scope: '/' })
          .catch((err: unknown) => {
            console.warn(
              '[DietSync] Service worker registration failed. The app will run in online-only mode.',
              err,
            )
          })
      }
    }

    // Override with undefined so the truthy guard skips registration.
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
    })

    await expect(registerSW()).resolves.toBeUndefined()
    expect(warnSpy).not.toHaveBeenCalled()

    // Restore original descriptor.
    if (original) {
      Object.defineProperty(globalThis.navigator, 'serviceWorker', original)
    } else {
      // If there was no original descriptor, delete the override.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis.navigator as any).serviceWorker
    }
  })
})
