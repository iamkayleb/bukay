/**
 * Tailwind preset for the shared design system.
 *
 * The sibling of `ds_streamlit.py`: that adapter lets Streamlit apps consume
 * the presentation patterns, this one lets Tailwind apps consume the same
 * tokens through the utilities they already write.
 *
 * Why this exists
 * ===============
 * A design system is only adopted if using it is easier than not using it. The
 * CSS layer (`tokens.css` + `components.css`) assumes a project writes classes
 * like `.panel` and `.kpi`. A Tailwind project does not; it writes
 * `bg-slate-900 border-slate-800 text-slate-400`, and when nothing connects
 * those to the tokens, the design system sits in the repo unreferenced while
 * every component invents its own greys. That is not hypothetical -- it is
 * exactly what happened in the first consumer to receive it.
 *
 * This preset makes the tokens reachable as ordinary utilities:
 *
 *     bg-surface  text-ink  text-muted  border-default  accent  rounded-card
 *
 * Each resolves to `var(--token)`, so switching `theme-air` to `theme-paper`,
 * or adding `density-compact`, restyles the app without touching a component.
 *
 * Use
 * ===
 *     // tailwind.config.js
 *     module.exports = {
 *       presets: [require('./design-system/tailwind-preset.js')],
 *       content: ['./app/**\/*.{ts,tsx}'],
 *     };
 *
 *     // and load the tokens once, in the root layout:
 *     import './design-system/tokens.css';
 *     // <body class="theme-air">
 *
 * What it deliberately does not do
 * ================================
 * It does not touch Tailwind's spacing scale. `p-4` already means 16px, which
 * matches `--space-4`, and redefining the numeric scale would silently change
 * every existing layout. Fragmentation happens in colour, not in padding, so
 * that is what this governs.
 *
 * Per-project customisation is the same model as the CSS layer: override the
 * token in a stylesheet loaded after `tokens.css`. Do not fork this preset.
 *
 *     .theme-air { --accent: #0f6f6a; }
 */

'use strict';

/** `var(--x)` with an optional fallback, written once. */
const t = (name, fallback) =>
  fallback ? `var(--${name}, ${fallback})` : `var(--${name})`;

module.exports = {
  theme: {
    extend: {
      colors: {
        // Surfaces, back to front.
        bg: t('bg'),
        surface: t('surface'),
        panel: t('panel'),

        // Text. Named `ink` rather than `text`, because a colour called
        // `text` would read as `text-text`.
        ink: t('text'),
        muted: t('muted'),

        // Lines.
        default: t('border'),
        row: t('row-border'),
        zebra: t('zebra'),

        // Controls.
        input: t('input-bg'),

        // Accent and its pairings. `accent` alone is the fill; `accent-contrast`
        // is what stays legible on top of it.
        accent: {
          DEFAULT: t('accent'),
          contrast: t('accent-contrast'),
          weak: t('accent-weak'),
          line: t('accent-line'),
        },

        // Status. Each has a weak variant for backgrounds, so a notice never
        // needs a hand-mixed tint.
        // tokens.css defines --neg-border but no positive/warn/info equivalent,
        // so those fall back to the base status colour. A var() with no fallback
        // and no definition resolves to nothing and the border silently vanishes.
        pos: { DEFAULT: t('pos'), weak: t('pos-weak'), border: t('pos-border', `var(--pos)`) },
        neg: { DEFAULT: t('neg'), weak: t('neg-weak'), border: t('neg-border') },
        warn: { DEFAULT: t('warn'), weak: t('warn-weak'), border: t('warn-border', `var(--warn)`) },
        info: { DEFAULT: t('info'), weak: t('info-weak'), border: t('info-border', `var(--info)`) },
      },

      borderColor: {
        DEFAULT: t('border'),
        row: t('row-border'),
        accent: t('accent-line'),
      },

      borderRadius: {
        card: t('radius'),
        control: t('radius-sm'),
        btn: t('btn-radius'),
        input: t('input-radius'),
      },

      fontFamily: {
        body: t('font-body'),
        heading: t('font-heading'),
      },

      fontSize: {
        // Named, not numeric, so they sit beside Tailwind's scale rather than
        // replacing it. `text-ds-base` is the design system's body size.
        'ds-base': t('fs-base'),
        'ds-sm': t('fs-sm'),
        'ds-xs': t('fs-xs'),
        'ds-kpi': t('kpi-size'),
      },

      fontWeight: {
        heading: t('heading-weight'),
      },

      padding: {
        card: t('card-pad'),
        'control-x': t('control-pad-x'),
        'control-y': t('control-pad-y'),
        'row-x': t('row-pad-x'),
        'row-y': t('row-pad-y'),
      },
    },
  },
};
