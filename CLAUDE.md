# GraphPilot — Geliştirme Kuralları

## Proje
Claude Code plugin'i + TypeScript CLI (`gp`). Spesifikasyon: `docs/SPEC.md`. Yol haritası: `roadmap/`.

## Kurallar
- Tek oturumda tek görev. Kapsam dışına çıkma; fark ettiğin ek işleri "Açık Sorular"a yaz.
- TypeScript strict mode. Her yeni fonksiyon için Vitest testi.
- Dosyayı baştan yazma, düzenle (edit).
- Bağımlılık eklemeden önce sor.
- Commit mesajı: `faz-XX(Y.Z): kısa açıklama`.
- Hafızadan Claude Code bilgisi yazma. Her teknik iddianın yanında resmi doküman linki olsun;
  doğrulanamayanı `DOĞRULANMADI` diye işaretle.

## Komutlar
- Test: `npm test`
- Lint: `npm run lint`
- CLI'ı yerelde çalıştır: `npm run gp -- <komut>`
- Push öncesi (plugin/ değiştiyse sürüm artmış mı): `scripts/check-plugin-version.sh`

## Klasörler
- `cli/` TypeScript CLI kaynak kodu
- `plugin/` Claude Code plugin dosyaları (agents, commands, skills, hooks)
- `docs/` SPEC ve kararlar
- `bench/` benchmark senaryoları ve sonuçları
- `roadmap/` yol haritası (faz dosyaları — ilerleme buraya işlenir)

## Faz akışı
Bir görev bitince: testleri çalıştır → ilgili faz dosyasında checkbox'ı `- [x]` yap →
o dosyanın sonundaki **Faz Günlüğü** tablosuna bir satır ekle. Başka göreve geçme.
