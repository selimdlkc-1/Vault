---
name: write-adr
description: Step-by-step procedure for recording a new or changed architectural decision that is not yet covered in docs/mimari-kararlar.md — e.g. a new library, a new pattern deviation, a scope change. Use when the user proposes something that conflicts with or extends an existing decision. Do NOT use for a decision already fully specified in docs/ (just cite the doc) or for routine implementation choices with no lasting architectural weight.
---

# Mimari Karar Kaydı Prosedürü

Doküman yaşam döngüsü tek yönlüdür (bkz. `docs/10_IMPLEMENTATION_ROADMAP.md` §8): karar önce `docs/mimari-kararlar.md`'a işlenir, sonra etkilenen teknik dokümanlar, sonra kod kuralları güncellenir. Bu sıra tersine çevrilmez.

## 1. Karar ID'si ata

`docs/mimari-kararlar.md` ilgili bölümüne `[KATEGORI-SIRA]` formatında yeni bir karar ekle (ör. `[TS-008]`). Kategori mevcut listeyle tutarlı olmalı (P, S, A, AUTH, R, W, AP, SEC, AUD, I, N, TS, INF, TEST, CODE).

## 2. Açık madde mi, kapalı karar mı?

Karar kesinleşmediyse §18'e `[KATEGORI-OPEN-N]` olarak öncelik etiketiyle (🔴/🟠/🟢) ekle; kapandığında listeden silinir.

## 3. Versiyon geçmişi

Dokümanın sonundaki Versiyon Geçmişi tablosuna bir satır ekle; versiyon numarasını artır.

## 4. Etkilenen teknik dokümanı güncelle

İlgili `docs/0N_*.md` dosyasını güncelle, yeni karar ID'sine referans ver.

## 5. Etkilenen rule/skill'i güncelle

Bu talimat mimarisindeki (`.claude/rules/`, `.claude/skills/`) ilgili dosyayı güncelle — spec'i kopyalama, yalnızca yeni docs bölümüne referans ver.

## 6. Dokümantasyon

- [ ] `docs/mimari-kararlar.md` yeni karar ID'si ile güncellendi
- [ ] İlgili `docs/0N_*.md` güncellendi

---
Detay: `docs/mimari-kararlar.md` "Nasıl Kullanılır?"; `docs/10_IMPLEMENTATION_ROADMAP.md` §8
