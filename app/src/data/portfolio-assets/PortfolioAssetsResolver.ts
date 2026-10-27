// Build-time resolver for the portfolio assets standard:
// each project's repo carries `.github/portfolio/{icon.png,banner.png,portfolio.json}`.
// Files are checked over HTTP during `astro build` (short timeout, bounded concurrency);
// anything missing, slow or invalid is simply omitted so the UI falls back.

import { isHexColor } from '@/core';

export type LocalizedText = Record<string, string>;

export interface AssetRepo {
    owner: string;
    repo: string;
}

export interface PortfolioMeta {
    accent?: string;
    iconAlt?: LocalizedText;
    bannerAlt?: LocalizedText;
}

export interface PortfolioAssets {
    iconUrl?: string;
    bannerUrl?: string;
    accent?: string;
    iconAlt?: LocalizedText;
    bannerAlt?: LocalizedText;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PortfolioAssetsResolverOptions {
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    concurrency?: number;
    enabled?: boolean;
}

const RAW_BASE = 'https://raw.githubusercontent.com';
const SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * Maps a project's `github` link to the repo holding its portfolio assets:
 * `github.com/<owner>/<repo>` → `<owner>/<repo>`, `github.com/<org>` → `<org>/.github`, otherwise null.
 */
export function resolveAssetRepo(github: string | null | undefined): AssetRepo | null {
    if (!github) return null;
    let url: URL;
    try {
        url = new URL(github.trim());
    } catch {
        return null;
    }
    if (!/^(www\.)?github\.com$/i.test(url.hostname)) return null;
    const [owner, rawRepo] = url.pathname.split('/').filter(Boolean);
    if (!owner || !SEGMENT.test(owner)) return null;
    if (!rawRepo) return { owner, repo: '.github' };
    const repo = rawRepo.replace(/\.git$/i, '');
    if (!SEGMENT.test(repo)) return null;
    return { owner, repo };
}

export function portfolioFileUrl({ owner, repo }: AssetRepo, file: string): string {
    return `${RAW_BASE}/${owner}/${repo}/HEAD/.github/portfolio/${file}`;
}

/** Runs at most `limit` tasks at once; extra tasks wait in FIFO order. */
export function createLimiter(limit: number) {
    const max = Math.max(1, Math.floor(limit));
    let active = 0;
    const queue: Array<() => void> = [];
    const next = () => {
        if (active >= max || queue.length === 0) return;
        active++;
        queue.shift()!();
    };
    return function run<T>(task: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            queue.push(() => {
                task().then(resolve, reject).finally(() => {
                    active--;
                    next();
                });
            });
            next();
        });
    };
}

export function toLocalizedText(value: unknown): LocalizedText | undefined {
    if (typeof value === 'string') return value.trim() ? { en: value.trim() } : undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const out: LocalizedText = {};
    for (const [lang, text] of Object.entries(value as Record<string, unknown>)) {
        if (typeof text === 'string' && text.trim()) out[lang] = text.trim();
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

/** Validates the optional `portfolio.json`; unknown or malformed fields are dropped. */
export function parsePortfolioMeta(raw: unknown): PortfolioMeta {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const data = raw as Record<string, unknown>;
    const meta: PortfolioMeta = {};
    if (isHexColor(data.accent)) meta.accent = (data.accent as string).trim();
    const iconAlt = toLocalizedText(data.icon_alt);
    if (iconAlt) meta.iconAlt = iconAlt;
    const bannerAlt = toLocalizedText(data.banner_alt);
    if (bannerAlt) meta.bannerAlt = bannerAlt;
    return meta;
}

export class PortfolioAssetsResolver {
    private readonly fetchImpl: FetchLike;
    private readonly timeoutMs: number;
    private readonly enabled: boolean;
    private readonly limit: ReturnType<typeof createLimiter>;
    private readonly cache = new Map<string, Promise<PortfolioAssets>>();

    constructor(options: PortfolioAssetsResolverOptions = {}) {
        this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
        this.timeoutMs = options.timeoutMs ?? 4000;
        this.enabled = options.enabled ?? true;
        this.limit = createLimiter(options.concurrency ?? 6);
    }

    /** Resolves (and memoises per repo) the assets for a project's `github` link. Never throws. */
    resolve(github: string | null | undefined): Promise<PortfolioAssets> {
        const repo = resolveAssetRepo(github);
        if (!repo || !this.enabled) return Promise.resolve({});
        const key = `${repo.owner}/${repo.repo}`.toLowerCase();
        let pending = this.cache.get(key);
        if (!pending) {
            pending = this.load(repo).catch(() => ({}));
            this.cache.set(key, pending);
        }
        return pending;
    }

    private async load(repo: AssetRepo): Promise<PortfolioAssets> {
        const iconUrl = portfolioFileUrl(repo, 'icon.png');
        const bannerUrl = portfolioFileUrl(repo, 'banner.png');
        const [hasIcon, hasBanner, meta] = await Promise.all([
            this.imageExists(iconUrl),
            this.imageExists(bannerUrl),
            this.fetchMeta(portfolioFileUrl(repo, 'portfolio.json')),
        ]);
        const assets: PortfolioAssets = { ...meta };
        if (hasIcon) assets.iconUrl = iconUrl;
        if (hasBanner) assets.bannerUrl = bannerUrl;
        return assets;
    }

    private request(url: string, method: 'HEAD' | 'GET'): Promise<Response> {
        return this.limit(() => this.fetchImpl(url, {
            method,
            redirect: 'follow',
            signal: AbortSignal.timeout(this.timeoutMs),
        }));
    }

    /** HEAD first (cheap); falls back to GET when the server rejects HEAD. */
    async imageExists(url: string): Promise<boolean> {
        try {
            let res = await this.request(url, 'HEAD');
            if (res.status === 405 || res.status === 501) res = await this.request(url, 'GET');
            if (!res.ok) return false;
            const type = res.headers.get('content-type') ?? '';
            return type === '' || type.startsWith('image/');
        } catch {
            return false;
        }
    }

    async fetchMeta(url: string): Promise<PortfolioMeta> {
        try {
            const res = await this.request(url, 'GET');
            if (!res.ok) return {};
            return parsePortfolioMeta(JSON.parse(await res.text()));
        } catch {
            return {};
        }
    }
}

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

/** Shared build-time instance; set PORTFOLIO_ASSETS_CHECK=0 to skip network checks (offline builds). */
export const portfolioAssetsResolver = new PortfolioAssetsResolver({
    enabled: env.PORTFOLIO_ASSETS_CHECK !== '0',
    timeoutMs: Number(env.PORTFOLIO_ASSETS_TIMEOUT_MS) || 4000,
});
