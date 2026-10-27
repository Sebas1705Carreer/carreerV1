import { describe, expect, it, vi } from 'vitest';
import {
    PortfolioAssetsResolver,
    createLimiter,
    parsePortfolioMeta,
    portfolioFileUrl,
    resolveAssetRepo,
    toLocalizedText,
    type FetchLike,
} from './PortfolioAssetsResolver';

const RAW = 'https://raw.githubusercontent.com';

function response(status: number, body = '', contentType = 'image/png'): Response {
    return new Response(status === 204 || status === 304 ? null : body, {
        status,
        headers: { 'content-type': contentType },
    });
}

/** Fake raw.githubusercontent.com: `files` maps URL → [status, body, content-type]. */
function fakeFetch(files: Record<string, [number, string?, string?]>) {
    return vi.fn<FetchLike>(async (url) => {
        const hit = files[url];
        if (!hit) return response(404, '404: Not Found', 'text/plain; charset=utf-8');
        return response(hit[0], hit[1] ?? '', hit[2] ?? 'image/png');
    });
}

describe('resolveAssetRepo', () => {
    it('maps a repo link to owner/repo', () => {
        expect(resolveAssetRepo('https://github.com/Sebas1705/Owlsplit')).toEqual({ owner: 'Sebas1705', repo: 'Owlsplit' });
        expect(resolveAssetRepo('https://github.com/Sebas1705/Owlsplit/')).toEqual({ owner: 'Sebas1705', repo: 'Owlsplit' });
        expect(resolveAssetRepo('https://www.github.com/a/b.git')).toEqual({ owner: 'a', repo: 'b' });
        expect(resolveAssetRepo('https://github.com/a/b/tree/main/docs')).toEqual({ owner: 'a', repo: 'b' });
    });

    it('maps an org link to <org>/.github', () => {
        expect(resolveAssetRepo('https://github.com/AxiomNode')).toEqual({ owner: 'AxiomNode', repo: '.github' });
    });

    it('returns null for missing, invalid or non-GitHub links', () => {
        for (const v of [null, undefined, '', 'not a url', 'https://gitlab.com/a/b', 'https://github.com/', 'https://github.com/a%20b/c']) {
            expect(resolveAssetRepo(v)).toBeNull();
        }
    });

    it('builds raw URLs on HEAD', () => {
        expect(portfolioFileUrl({ owner: 'o', repo: 'r' }, 'icon.png')).toBe(`${RAW}/o/r/HEAD/.github/portfolio/icon.png`);
    });
});

describe('parsePortfolioMeta / toLocalizedText', () => {
    it('keeps valid fields', () => {
        expect(parsePortfolioMeta({
            accent: '#0F766E',
            icon_alt: { en: 'Owlsplit app icon', es: 'Icono de la app Owlsplit' },
            banner_alt: 'Owlsplit banner',
        })).toEqual({
            accent: '#0F766E',
            iconAlt: { en: 'Owlsplit app icon', es: 'Icono de la app Owlsplit' },
            bannerAlt: { en: 'Owlsplit banner' },
        });
    });

    it('drops malformed fields', () => {
        expect(parsePortfolioMeta({ accent: 'red', banner_alt: { en: 3, es: '  ' }, icon_alt: [] })).toEqual({});
        expect(parsePortfolioMeta(null)).toEqual({});
        expect(parsePortfolioMeta([1, 2])).toEqual({});
        expect(toLocalizedText('   ')).toBeUndefined();
    });
});

describe('createLimiter', () => {
    it('never runs more than `limit` tasks at once and preserves results', async () => {
        const run = createLimiter(2);
        let active = 0;
        let peak = 0;
        const task = (n: number) => run(async () => {
            active++;
            peak = Math.max(peak, active);
            await new Promise(r => setTimeout(r, 5));
            active--;
            return n * 2;
        });
        expect(await Promise.all([1, 2, 3, 4, 5].map(task))).toEqual([2, 4, 6, 8, 10]);
        expect(peak).toBe(2);
    });

    it('propagates rejections and keeps going', async () => {
        const run = createLimiter(1);
        await expect(run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
        await expect(run(async () => 'ok')).resolves.toBe('ok');
    });
});

describe('PortfolioAssetsResolver', () => {
    const base = `${RAW}/Sebas1705/Owlsplit/HEAD/.github/portfolio`;

    it('returns the URLs that exist plus portfolio.json metadata', async () => {
        const fetchImpl = fakeFetch({
            [`${base}/icon.png`]: [200],
            [`${base}/banner.png`]: [200],
            [`${base}/portfolio.json`]: [200, JSON.stringify({ accent: '#0F766E', banner_alt: { en: 'Banner', es: 'Banner ES' } }), 'text/plain'],
        });
        const resolver = new PortfolioAssetsResolver({ fetchImpl });
        expect(await resolver.resolve('https://github.com/Sebas1705/Owlsplit')).toEqual({
            iconUrl: `${base}/icon.png`,
            bannerUrl: `${base}/banner.png`,
            accent: '#0F766E',
            bannerAlt: { en: 'Banner', es: 'Banner ES' },
        });
        expect(fetchImpl.mock.calls.find(([u]) => u.endsWith('icon.png'))?.[1]?.method).toBe('HEAD');
        expect(fetchImpl.mock.calls.find(([u]) => u.endsWith('.json'))?.[1]?.method).toBe('GET');
    });

    it('omits missing files (404), non-image responses and invalid JSON', async () => {
        const fetchImpl = fakeFetch({
            [`${base}/banner.png`]: [200, '', 'text/html'],
            [`${base}/portfolio.json`]: [200, '{not json', 'text/plain'],
        });
        const resolver = new PortfolioAssetsResolver({ fetchImpl });
        expect(await resolver.resolve('https://github.com/Sebas1705/Owlsplit')).toEqual({});
    });

    it('treats network errors and timeouts as missing', async () => {
        const fetchImpl = vi.fn<FetchLike>(async (_url, init) => new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }));
        const resolver = new PortfolioAssetsResolver({ fetchImpl, timeoutMs: 10 });
        expect(await resolver.resolve('https://github.com/Sebas1705/Owlsplit')).toEqual({});

        const failing = new PortfolioAssetsResolver({ fetchImpl: async () => { throw new Error('offline'); } });
        expect(await failing.resolve('https://github.com/Sebas1705/Owlsplit')).toEqual({});
    });

    it('falls back to GET when HEAD is not allowed', async () => {
        const fetchImpl = vi.fn<FetchLike>(async (url, init) => {
            if (!url.endsWith('icon.png')) return response(404);
            return init?.method === 'HEAD' ? response(405) : response(200);
        });
        const resolver = new PortfolioAssetsResolver({ fetchImpl });
        expect(await resolver.resolve('https://github.com/Sebas1705/Owlsplit')).toEqual({ iconUrl: `${base}/icon.png` });
    });

    it('memoises per repo (case-insensitive) so repeated page builds do not refetch', async () => {
        const fetchImpl = fakeFetch({});
        const resolver = new PortfolioAssetsResolver({ fetchImpl });
        await resolver.resolve('https://github.com/Sebas1705/Owlsplit');
        await resolver.resolve('https://github.com/sebas1705/owlsplit/');
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it('skips the network for null links, non-GitHub links and when disabled', async () => {
        const fetchImpl = fakeFetch({});
        expect(await new PortfolioAssetsResolver({ fetchImpl }).resolve(null)).toEqual({});
        expect(await new PortfolioAssetsResolver({ fetchImpl }).resolve('https://example.com')).toEqual({});
        expect(await new PortfolioAssetsResolver({ fetchImpl, enabled: false }).resolve('https://github.com/a/b')).toEqual({});
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('respects the concurrency limit across projects', async () => {
        let active = 0;
        let peak = 0;
        const fetchImpl = vi.fn<FetchLike>(async () => {
            active++;
            peak = Math.max(peak, active);
            await new Promise(r => setTimeout(r, 2));
            active--;
            return response(404);
        });
        const resolver = new PortfolioAssetsResolver({ fetchImpl, concurrency: 3 });
        await Promise.all(['a', 'b', 'c', 'd'].map(r => resolver.resolve(`https://github.com/o/${r}`)));
        expect(fetchImpl).toHaveBeenCalledTimes(12);
        expect(peak).toBe(3);
    });
});
