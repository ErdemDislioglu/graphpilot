import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { ConfigSchema, DEFAULT_EFFICIENCY, DEFAULT_OPTIMIZATIONS } from "../schema/index.js";
/**
 * Faz 7.3 (ADR-005) — hook'lar **her** tool çağrısında ateşlenir (research.md § Plugin
 * hook'ları ne zaman ateşlenir), `/gp:run` beklemez. Bu yüzden burada TAM `parseGraph`
 * (fast-glob ile tüm markdown dosyalarını tarayan) KULLANILMAZ — sadece `config.yml`
 * okunur, tek dosya okuma + küçük bir YAML parse. Hızlı kalmak kritik (research.md:
 * "script hızlı olmalı, her Bash çağrısına gecikme eklemez").
 *
 * Varsayılan graph kökü `<cwd>/.graph` — `--graph-root` ile özelleştirilmiş projelerde
 * hook bunu bilemez (hook'lara CLI argümanı gelmez) ve sessizce varsayılanları döner;
 * bilinen bir sınırlama, güvenli taraf (no-op) seçildi.
 */
export function loadFastConfig(cwd) {
    const graphDir = join(cwd, ".graph");
    if (!existsSync(graphDir)) {
        return { graphDirExists: false, optimizations: DEFAULT_OPTIMIZATIONS, efficiency: DEFAULT_EFFICIENCY };
    }
    const configPath = join(graphDir, "config.yml");
    if (!existsSync(configPath)) {
        return { graphDirExists: true, optimizations: DEFAULT_OPTIMIZATIONS, efficiency: DEFAULT_EFFICIENCY };
    }
    try {
        const raw = parseYaml(readFileSync(configPath, "utf-8"));
        const result = ConfigSchema.safeParse(raw);
        return {
            graphDirExists: true,
            optimizations: result.success ? result.data.optimizations : DEFAULT_OPTIMIZATIONS,
            efficiency: result.success ? result.data.efficiency : DEFAULT_EFFICIENCY,
        };
    }
    catch {
        return { graphDirExists: true, optimizations: DEFAULT_OPTIMIZATIONS, efficiency: DEFAULT_EFFICIENCY };
    }
}
/** Hook'ların ortak kök yolu: hook girdisindeki `cwd` alanı (research.md — evrensel alan). */
export function graphDirFor(cwd) {
    return join(cwd, ".graph");
}
