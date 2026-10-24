import type { Graph } from "./types.js";
/**
 * SPEC §1 — `.graph/` altındaki tüm md'leri okur, frontmatter + body ayırır,
 * `Graph` nesnesini (düğümler + kenarlar) kurar.
 *
 * Kasıtlı olarak Zod doğrulaması YAPMAZ — sadece `kind`'ın dört bilinen değerden biri
 * olup olmadığına bakar (dağıtım için gerekli minimum). Tam şema doğrulaması `validate.ts`'in
 * işi; parser bir dosya bozuksa tüm süreci düşürmez, `parseErrors`'a ekler ve devam eder.
 */
export declare function parseGraph(graphRootDir: string): Graph;
