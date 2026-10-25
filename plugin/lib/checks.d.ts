export interface CheckResult {
    name: "build" | "lint" | "test";
    command: string;
    ok: boolean;
    /** Sadece başarısızlıkta — son N satır. Faz 7.3 kırpma kuralını genişletecek. */
    output?: string;
}
/** Komut çalıştırıcı — gerçek üretimde `execSync`, testte enjekte edilebilir (mock). */
export type CommandRunner = (command: string, cwd: string) => {
    ok: boolean;
    output: string;
};
/** `scaffold.ts` (Faz 7.6) da aynı çalıştırıcıyı paylaşır — tek execSync sarmalayıcı. */
export declare const defaultRunner: CommandRunner;
/**
 * SPEC/roadmap 6.3 — Katman 1 (script, sıfır token). `config.yml`'deki `checks.*`
 * komutlarını SIRAYLA çalıştırır; agent'a hiçbir çağrı yapmaz. Başarısızlıkta sadece
 * son `MAX_OUTPUT_LINES` satırı döner — tüm log değil.
 *
 * Faz 7.3: kırpma `config.optimizations.log_trimming` ile açılıp kapatılabilir
 * (varsayılan açık — ablasyon dışında her zaman böyle kalmalı).
 */
export declare function runChecks(projectRoot: string, checks: {
    build?: string;
    lint?: string;
    test?: string;
}, runner?: CommandRunner, opts?: {
    trimOutput?: boolean;
}): CheckResult[];
export interface VerifyResult {
    command: string;
    ok: boolean;
    /** Sadece başarısızlıkta — `runChecks` ile aynı kırpma. */
    output?: string;
}
/**
 * Faz 14 O9 — görevin kendi `verify:` komutlarını sırayla çalıştırır (Katman 1'in görev
 * düzeyi). İlk başarısızlıkta durmaz: hangi komutların geçtiği de görünsün.
 */
export declare function runVerify(projectRoot: string, commands: string[], runner?: CommandRunner, opts?: {
    trimOutput?: boolean;
}): VerifyResult[];
