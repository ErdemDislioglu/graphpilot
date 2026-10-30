import type { EfficiencyConfig, Optimizations } from "../schema/index.js";
export interface FastConfigResult {
    /** `.graph/` dizini hiç yoksa `false` — hook'un en hızlı çıkış yolu. */
    graphDirExists: boolean;
    optimizations: Optimizations;
    efficiency: EfficiencyConfig;
}
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
export declare function loadFastConfig(cwd: string): FastConfigResult;
/** Hook'ların ortak kök yolu: hook girdisindeki `cwd` alanı (research.md — evrensel alan). */
export declare function graphDirFor(cwd: string): string;
