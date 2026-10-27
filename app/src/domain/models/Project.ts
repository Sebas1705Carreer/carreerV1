import type { Translations } from "./Language";

// Domain Entity: Project
export interface Project {
    id: string;
    title: Translations;
    description: Translations;
    technologies: string[]; // List of technology IDs used
    imageUrl?: string; // Legacy bundled image (in-memory datasource)
    // Portfolio assets standard (.github/portfolio/ in the project's repo), resolved at build time
    iconUrl?: string;          // 512x512 PNG icon/logo
    bannerUrl?: string;        // 2:1 banner; when absent the UI renders a generated fallback
    bannerAlt?: Translations;  // Banner alt text per language
    accent?: string;           // Hex colour (#RGB / #RRGGBB) for the card and the fallback
    demoUrl?: string;
    repoUrl?: string;
    startDate: Date;
    endDate?: Date;
    type: 'work' | 'academic' | 'personal';
    relatedTo?: string[]; // ID of work or academic experience (optional for personal projects)
}
