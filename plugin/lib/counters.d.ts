/**
 * SPEC §2: "ID'ler asla yeniden kullanılmaz (silinen düğümün ID'si boşta kalır)".
 * Sadece mevcut dosyaları taramak bunu garanti edemez — bir düğüm silinirse onun
 * numarası, sadece dosyalara bakan bir sayaç için "boş" görünür ve yanlışlıkla
 * yeniden verilebilir. Bu yüzden kalıcı bir yüksek-su-işareti (high-water mark)
 * dosyası tutulur: `.graph/_meta/counters.json` — `_runtime/`'ın aksine git'te izlenir.
 *
 * `scopeKey` örnekleri: epic için `"E"`, feature için epic id'si (`"E01"`),
 * task için feature id'si (`"E01-F01"`).
 */
export declare function nextCounterValue(graphRootDir: string, scopeKey: string, existingMax: number): number;
