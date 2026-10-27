import { describe, expect, it } from 'vitest';
import { NEUTRAL_FALLBACK_COLOR, isHexColor, projectFallback, projectInitials, readableTextColor } from './projectFallback';

describe('projectInitials', () => {
    it('uses the first letter of the first two words', () => {
        expect(projectInitials('Omni Impostor')).toBe('OI');
        expect(projectInitials('KMP native base')).toBe('KN');
        expect(projectInitials('ad-skipper')).toBe('AS');
    });

    it('uses the first two letters of a single word', () => {
        expect(projectInitials('Owlsplit')).toBe('OW');
        expect(projectInitials('x')).toBe('X');
    });

    it('ignores punctuation and handles empty names', () => {
        expect(projectInitials('  (Enigma)  ')).toBe('EN');
        expect(projectInitials('')).toBe('?');
        expect(projectInitials('---')).toBe('?');
    });

    it('keeps non-latin letters', () => {
        expect(projectInitials('Ñandú app')).toBe('ÑA');
    });
});

describe('isHexColor', () => {
    it('accepts #RGB and #RRGGBB', () => {
        expect(isHexColor('#0F766E')).toBe(true);
        expect(isHexColor('#abc')).toBe(true);
    });

    it('rejects anything else (prevents CSS injection via style attributes)', () => {
        for (const v of ['0F766E', '#12345', 'red', '#0F766E; background:url(x)', '', null, undefined, 42]) {
            expect(isHexColor(v)).toBe(false);
        }
    });
});

describe('readableTextColor', () => {
    it('picks white on dark and near-black on light backgrounds', () => {
        expect(readableTextColor('#0F766E')).toBe('#ffffff');
        expect(readableTextColor('#000')).toBe('#ffffff');
        expect(readableTextColor('#FDE68A')).toBe('#111827');
        expect(readableTextColor('#fff')).toBe('#111827');
    });

    it('defaults to white for invalid colours', () => {
        expect(readableTextColor('nope')).toBe('#ffffff');
    });
});

describe('projectFallback', () => {
    it('uses the accent colour when valid', () => {
        expect(projectFallback('Owlsplit', '#0F766E')).toEqual({ initials: 'OW', background: '#0F766E', foreground: '#ffffff' });
    });

    it('falls back to a neutral tone without a valid accent', () => {
        expect(projectFallback('Haltera').background).toBe(NEUTRAL_FALLBACK_COLOR);
        expect(projectFallback('Haltera', 'javascript:alert(1)').background).toBe(NEUTRAL_FALLBACK_COLOR);
    });
});
