/** SPEC §3: yaklaşık token sayacı — karakter/4. Kesin sayaç gerekmiyor (Faz 1 kararı). */
export function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
