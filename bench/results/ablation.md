<!-- Faz 7.10 — gp ablation tarafından üretilir; bkz. cli/src/ablation.ts -->

# Ablasyon Tablosu — Faz 7 Token Optimizasyon Teknikleri

| Teknik | Durum | Detay |
|---|---|---|
| Cache dostu sıralama (7.1) | yapısal | açık: sıra sabit (6 parça); kapalı: alfabetik sıraya düşer — iki hâlde de gerçekten ≈894 token (byte boyutu AYNI, doğrulandı). Gerçek cache-isabet oranı farkı Faz 8.1'in tekrarlı-çağrı ölçümünü bekliyor. |
| Repo haritası (7.2) | yapısal | hedef proje kökü için gerçek repo-map üretildi: 133 dosya, ≈1963 token. "Kaç arama çağrısı önlendi" Faz 8'in hook sayaçlarından (tool-use.jsonl) gelecek canlı veriyi bekliyor. |
| Log/çıktı kırpma (7.3) | ölçüldü | temsili 300 satırlık build logu: kırpılmamış ≈1773 token → kırpılmış ≈300 token (%83 azalma). |
| Araç kısıtlama (7.4) | yapısal | 5 agent tanımı, toplam tool-listesi ≈25 token (checker:1, coder:6, docs:6, planner:6, tester:6). Kısıtlamasız bir varyant YOK (ADR-002) — karşılaştırma yapılamaz, sadece mevcut durum ölçüldü. |
| Küçük düğüm birleştirme (7.5) | ölçüldü | açık: 2 ready task → 2 agent çağrısı (0 batch + 2 tekil); kapalı (varsayılan, her task ayrı): 2 çağrı. |
| Deterministik iskelet (7.6) | n/a | örnek graph'ta (bookstore) 'type: scaffold' task'ı yok — ölçülemedi. Mekanizma scaffold.test.ts'te gerçek execSync ile doğrulandı. |
| Tur limiti / döngü tespiti (7.7) | yapısal | Aynı dosya/komut 3. kez kullanıldığında additionalContext uyarısı üretildiği trackToolUse.test.ts + hookCli.test.ts'te gerçek hook süreciyle doğrulandı. Bu bir token tasarrufu değil, davranışsal bir erken-uyarı — sayısal 'tasarruf' iddiası yok. |
