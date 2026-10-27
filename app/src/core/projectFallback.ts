// Generated fallback for projects without a banner/icon (portfolio assets standard):
// the project's initials on its accent colour, or on a neutral tone.

export const NEUTRAL_FALLBACK_COLOR = '#475569';

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: unknown): value is string {
    return typeof value === 'string' && HEX_COLOR.test(value.trim());
}

/** Up to two initials: first letter of the first two words, or the first two letters of a single word. */
export function projectInitials(name: string): string {
    const words = (name || '')
        .split(/[\s\-_./]+/)
        .map(w => w.replace(/[^\p{L}\p{N}]/gu, ''))
        .filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

function expandHex(hex: string): string {
    const h = hex.trim().slice(1);
    return h.length === 3 ? h.split('').map(c => c + c).join('') : h;
}

/** White or near-black, whichever reads better on the given background (WCAG relative luminance). */
export function readableTextColor(background: string): '#ffffff' | '#111827' {
    if (!isHexColor(background)) return '#ffffff';
    const h = expandHex(background);
    const [r, g, b] = [0, 2, 4].map(i => {
        const c = parseInt(h.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Contrast vs white = 1.05 / (L + 0.05); vs black = (L + 0.05) / 0.05. Pick the larger.
    return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? '#ffffff' : '#111827';
}

export interface ProjectFallback {
    initials: string;
    background: string;
    foreground: string;
}

export function projectFallback(name: string, accent?: string | null): ProjectFallback {
    const background = isHexColor(accent) ? accent.trim() : NEUTRAL_FALLBACK_COLOR;
    return {
        initials: projectInitials(name),
        background,
        foreground: readableTextColor(background),
    };
}
