import re
import os

# Read globals.css
with open('apps/seller-dashboard/app/globals.css', 'r') as f:
    css = f.read()

# Replace `@layer base { :root {` with `@theme {`
css = css.replace('@layer base {\n  :root {', '@theme {')

# Find the matching closing brace for :root and remove it. 
# The block ends around line 120. We can just replace `--font-sans: ...; } }` with `--font-sans: ...; }`
css = re.sub(r"(--font-sans:[^;]+;\n  )\}\n\}", r"\1}", css)

# We need to add the missing `@source` directives
css = css.replace('@source "../../packages/ui";', '@source "../../packages/ui";\n@source "../../apps/seller-dashboard/components";\n@source "../../apps/seller-dashboard/app";')

# We don't need `@config` anymore
css = css.replace('@config "../tailwind.config.ts";\n', '')

# Rename z-index variables
css = css.replace('--z-sidebar', '--z-index-sidebar')
css = css.replace('--z-header', '--z-index-header')
css = css.replace('--z-bottom-nav', '--z-index-bottom-nav')
css = css.replace('--z-drawer', '--z-index-drawer')
css = css.replace('--z-modal', '--z-index-modal')
css = css.replace('--z-toast', '--z-index-toast')

# Add spacing and max-width directly to @theme
extras = """
    /* ── ADDED FROM TAILWIND.CONFIG.TS ──────────────────────── */
    --spacing-13: 3.25rem;
    --spacing-14: 3.5rem;
    --spacing-16: 4rem;
    --spacing-56: 14rem;
    --spacing-14-px: 56px;
    --spacing-screen-minus-header: calc(100vh - 64px);

    /* ── ANIMATIONS ─────────────────────────────────────────── */
    --animate-skeleton: skeleton-shimmer 1.5s infinite;
    --animate-toast-in: toast-in 200ms ease-out forwards;
    --animate-modal-in: modal-in 150ms ease-out forwards;
    --animate-sheet-up: sheet-up 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    --animate-badge-spring: badge-spring 200ms ease forwards;
    --animate-spin-fast: spin 700ms linear infinite;

    @keyframes skeleton-shimmer {
      from { background-position: -200% 0; }
      to { background-position: 200% 0; }
    }
    @keyframes toast-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes modal-in {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes sheet-up {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    @keyframes badge-spring {
      0% { transform: scale(1); }
      40% { transform: scale(1.3); }
      70% { transform: scale(0.9); }
      100% { transform: scale(1); }
    }
"""

css = css.replace('--font-sans: \'Inter\', -apple-system, BlinkMacSystemFont, \'Segoe UI\', system-ui, sans-serif;', '--font-sans: \'Inter\', -apple-system, BlinkMacSystemFont, \'Segoe UI\', system-ui, sans-serif;' + extras)

with open('apps/seller-dashboard/app/globals.css', 'w') as f:
    f.write(css)

print("globals.css updated successfully")

# Delete tailwind.config.ts
if os.path.exists('apps/seller-dashboard/tailwind.config.ts'):
    os.remove('apps/seller-dashboard/tailwind.config.ts')
    print("tailwind.config.ts removed successfully")

