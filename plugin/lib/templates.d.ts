/** `gp new`'in yazdığı iskelet dosya içerikleri — agent'lar format hatası yapmaz. */
export declare function renderEpicTemplate(id: string, name: string, summary: string, dependsOn?: string[]): string;
export declare function renderFeatureTemplate(id: string, name: string, summary: string, dependsOn?: string[]): string;
export declare function renderTaskTemplate(id: string, name: string, summary: string, dependsOn?: string[], reads?: string[], touches?: string[]): string;
export declare function renderKnowledgeTemplate(id: string, summary: string, scope: "epic" | "shared"): string;
