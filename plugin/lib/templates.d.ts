/** `gp new`'in yazdığı iskelet dosya içerikleri — agent'lar format hatası yapmaz. */
export declare function renderEpicTemplate(id: string, name: string, summary: string, dependsOn?: string[]): string;
export declare function renderFeatureTemplate(id: string, name: string, summary: string, dependsOn?: string[]): string;
/** Faz 14 B7b — `gp new task`/`gp apply` ile verilebilen alanlar (eskiden hep feature/med). */
export interface TaskTemplateExtras {
    type?: string;
    complexity?: string;
    risk?: string;
    context_size?: string;
    tags?: string[];
    verify?: string[];
}
export declare function renderTaskTemplate(id: string, name: string, summary: string, dependsOn?: string[], reads?: string[], touches?: string[], extra?: TaskTemplateExtras): string;
export declare function renderKnowledgeTemplate(id: string, summary: string, scope: "epic" | "shared"): string;
