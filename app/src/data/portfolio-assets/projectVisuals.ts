import type { Project, Translations } from '@/domain';
import { supportedLanguages } from '@/domain';
import { isHexColor } from '@/core';
import { toLocalizedText, type LocalizedText, type PortfolioAssets } from './PortfolioAssetsResolver';

export type ProjectVisuals = Pick<Project, 'iconUrl' | 'bannerUrl' | 'bannerAlt' | 'accent'>;

export interface ProjectVisualsInput {
    name: string;
    /** API `image_url`: explicit override, wins over the repo banner. */
    imageUrl?: string | null;
    /** API `image_alt`: string or `{ en, es, ... }`. */
    imageAlt?: unknown;
    /** Image bundled with V1 (public/projects), used only when nothing else exists. */
    legacyImageUrl?: string;
}

function isHttpUrl(value: unknown): value is string {
    return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim());
}

/** Fills every supported language: exact → en → es → fallback. */
export function toTranslations(text: LocalizedText | undefined, fallback: string): Translations {
    const out = {} as Translations;
    for (const lang of supportedLanguages) {
        out[lang] = text?.[lang] || text?.en || text?.es || fallback;
    }
    return out;
}

/**
 * Applies the precedence of the portfolio assets standard:
 * banner = API image_url → repo banner.png → legacy bundled image → none (UI fallback);
 * icon = repo icon.png → none; alt = API image_alt → portfolio.json banner_alt → project name.
 */
export function mergeProjectVisuals(input: ProjectVisualsInput, assets: PortfolioAssets): ProjectVisuals {
    const override = isHttpUrl(input.imageUrl) ? input.imageUrl.trim() : undefined;
    const visuals: ProjectVisuals = {
        bannerAlt: toTranslations(toLocalizedText(input.imageAlt) ?? assets.bannerAlt, input.name),
    };
    const bannerUrl = override ?? assets.bannerUrl ?? input.legacyImageUrl;
    if (bannerUrl) visuals.bannerUrl = bannerUrl;
    if (assets.iconUrl) visuals.iconUrl = assets.iconUrl;
    if (isHexColor(assets.accent)) visuals.accent = assets.accent;
    return visuals;
}
