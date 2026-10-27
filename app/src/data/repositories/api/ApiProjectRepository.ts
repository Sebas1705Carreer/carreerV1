import type { IProjectRepository, Project, Translations } from '@/domain';
import { apiGet } from '@/data/datasources/api/CareerApiClient';
import { portfolioAssetsResolver, mergeProjectVisuals, type PortfolioAssetsResolver } from '@/data/portfolio-assets';

type LocalizedString = Record<string, string>;

interface ApiProject {
    id: string;
    name: string;
    context: 'work' | 'academic' | 'personal';
    desc: LocalizedString;
    long_desc?: LocalizedString;
    tags: string[];
    github: string | null;
    demo: string | null;
    // Optional explicit visual override (may not be present in the API yet)
    image_url?: string | null;
    image_alt?: string | LocalizedString | null;
    // Older camelCase variant, still honoured
    imageUrl?: string | null;
}

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const LOCAL_IMAGES = new Set(['agedi', 'sisley', 'youknow', 'iberext', 'epdm', 'vpsorchestrator', 'portfolio', 'codewars']);

function legacyImageUrl(id: string): string | undefined {
    return LOCAL_IMAGES.has(id) ? `${BASE}projects/${id}.webp` : undefined;
}

function fill(en: string): Translations {
    return { en, es: en, fr: en, de: en, it: en, pt: en, nl: en, pl: en, ru: en, ja: en } as Translations;
}

function fillLs(ls: LocalizedString): Translations {
    const base = ls['en'] || ls['es'] || '';
    return {
        en: ls['en'] || base, es: ls['es'] || base,
        fr: base, de: base, it: base, pt: base, nl: base, pl: base, ru: base, ja: base,
    } as Translations;
}

export class ApiProjectRepository implements IProjectRepository {
    constructor(private readonly assets: PortfolioAssetsResolver = portfolioAssetsResolver) {}

    async getAll(): Promise<Project[]> {
        const projects = await apiGet<ApiProject[]>('/projects');
        return Promise.all(projects.map(async (p): Promise<Project> => {
            const visuals = mergeProjectVisuals({
                name: p.name,
                imageUrl: p.image_url ?? p.imageUrl,
                imageAlt: p.image_alt,
                legacyImageUrl: legacyImageUrl(p.id),
            }, await this.assets.resolve(p.github));
            return {
                id: p.id,
                title: fill(p.name),
                description: fillLs(p.desc),
                technologies: p.tags,
                type: p.context,
                repoUrl: p.github ?? undefined,
                demoUrl: p.demo ?? undefined,
                ...visuals,
                startDate: new Date('2024-01-01'),
            };
        }));
    }

    async getById(id: string): Promise<Project | null> {
        const all = await this.getAll();
        return all.find(p => p.id === id) ?? null;
    }

    async getByType(type: 'work' | 'academic' | 'personal'): Promise<Project[]> {
        const all = await this.getAll();
        return all.filter(p => p.type === type);
    }

    async getByRelatedTo(_relatedId: string): Promise<Project[]> {
        return [];
    }
}
