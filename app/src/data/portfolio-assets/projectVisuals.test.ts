import { describe, expect, it } from 'vitest';
import { mergeProjectVisuals, toTranslations } from './projectVisuals';

const repoAssets = {
    iconUrl: 'https://raw.githubusercontent.com/o/r/HEAD/.github/portfolio/icon.png',
    bannerUrl: 'https://raw.githubusercontent.com/o/r/HEAD/.github/portfolio/banner.png',
    accent: '#0F766E',
    bannerAlt: { en: 'Repo banner', es: 'Banner del repo' },
};

describe('mergeProjectVisuals', () => {
    it('uses the repo assets and portfolio.json alt text', () => {
        const v = mergeProjectVisuals({ name: 'Owlsplit' }, repoAssets);
        expect(v.bannerUrl).toBe(repoAssets.bannerUrl);
        expect(v.iconUrl).toBe(repoAssets.iconUrl);
        expect(v.accent).toBe('#0F766E');
        expect(v.bannerAlt?.en).toBe('Repo banner');
        expect(v.bannerAlt?.es).toBe('Banner del repo');
        expect(v.bannerAlt?.fr).toBe('Repo banner');
    });

    it('lets the API image_url / image_alt override the repo banner and alt', () => {
        const v = mergeProjectVisuals({
            name: 'Owlsplit',
            imageUrl: 'https://cdn.example.com/owlsplit.png',
            imageAlt: { en: 'API alt', es: 'Alt API' },
        }, repoAssets);
        expect(v.bannerUrl).toBe('https://cdn.example.com/owlsplit.png');
        expect(v.bannerAlt?.en).toBe('API alt');
        expect(v.bannerAlt?.es).toBe('Alt API');
        expect(v.iconUrl).toBe(repoAssets.iconUrl);
    });

    it('accepts a plain-string image_alt and ignores non-http image_url values', () => {
        const v = mergeProjectVisuals({ name: 'X', imageUrl: 'javascript:alert(1)', imageAlt: 'Plain alt' }, {});
        expect(v.bannerUrl).toBeUndefined();
        expect(v.bannerAlt?.es).toBe('Plain alt');
    });

    it('falls back to the legacy bundled image, then to nothing', () => {
        expect(mergeProjectVisuals({ name: 'AGEDI', legacyImageUrl: '/projects/agedi.webp' }, {}).bannerUrl).toBe('/projects/agedi.webp');
        const none = mergeProjectVisuals({ name: 'Haltera', imageUrl: null }, {});
        expect(none.bannerUrl).toBeUndefined();
        expect(none.iconUrl).toBeUndefined();
        expect(none.accent).toBeUndefined();
        expect(none.bannerAlt?.en).toBe('Haltera');
        expect(none.bannerAlt?.ja).toBe('Haltera');
    });

    it('prefers the repo banner over the legacy bundled image', () => {
        expect(mergeProjectVisuals({ name: 'P', legacyImageUrl: '/projects/p.webp' }, repoAssets).bannerUrl).toBe(repoAssets.bannerUrl);
    });

    it('drops an invalid accent', () => {
        expect(mergeProjectVisuals({ name: 'P' }, { accent: 'red' }).accent).toBeUndefined();
    });
});

describe('toTranslations', () => {
    it('fills every language with exact → en → es → fallback', () => {
        const t = toTranslations({ es: 'Hola' }, 'Fallback');
        expect(t.es).toBe('Hola');
        expect(t.en).toBe('Hola');
        expect(toTranslations(undefined, 'Name').pl).toBe('Name');
    });
});
