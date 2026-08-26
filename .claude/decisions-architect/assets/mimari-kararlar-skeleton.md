# {{PROJE_ADI}} — Mimari Kararlar Dokümanı

> **Versiyon:** 0.1 (Taslak)
> **Son güncelleme:** {{TARIH}}
> **Durum:** İlk taslak — kararlar netleştikçe güncellenecektir.
> **Amaç:** Bu doküman `docs/` ve `.claude/` altındaki tüm dosyaların referans alacağı tek doğruluk kaynağıdır. Tüm mimari ve iş kuralı kararları buraya işlenir.

---

## İçindekiler

- [1. Proje Kimliği ve Kapsam](#1-proje-kimliği-ve-kapsam)
- [2. Kullanıcı Havuzu ve Ölçek](#2-kullanıcı-havuzu-ve-ölçek)
- [3. Kimlik Doğrulama ve Kullanıcı Yapısı](#3-kimlik-doğrulama-ve-kullanıcı-yapısı)
- [4. Yetkilendirme Mimarisi](#4-yetkilendirme-mimarisi)
- [5. Roller ve Yetki Yönetimi](#5-roller-ve-yetki-yönetimi)
- [6. Süreç (Workflow) Mimarisi](#6-süreç-workflow-mimarisi)
- [7. Görev Yönetimi](#7-görev-yönetimi)
- [8. Doküman Yönetimi](#8-doküman-yönetimi)
- [9. Admin Panelleri](#9-admin-panelleri)
- [10. Güvenlik ve KVKK](#10-güvenlik-ve-kvkk)
- [11. Denetim (Audit Log)](#11-denetim-audit-log)
- [12. Entegrasyonlar](#12-entegrasyonlar)
- [13. Bildirim Sistemi](#13-bildirim-sistemi)
- [14. Tech Stack](#14-tech-stack)
- [15. Altyapı ve Operasyon](#15-altyapı-ve-operasyon)
- [16. Test Stratejisi](#16-test-stratejisi)
- [17. Kod Organizasyonu ve Agent Kuralları](#17-kod-organizasyonu-ve-agent-kuralları)
- [18. Açık Kararlar — Tamamlanması Gerekenler](#18-açık-kararlar--tamamlanması-gerekenler)

---

## 1. Proje Kimliği ve Kapsam

<!-- [P-NNN] kararları buraya -->

---

## 2. Kullanıcı Havuzu ve Ölçek

<!-- [S-NNN] -->

---

## 3. Kimlik Doğrulama ve Kullanıcı Yapısı

<!-- [A-NNN] -->

---

## 4. Yetkilendirme Mimarisi

<!-- [AUTH-NNN] -->

---

## 5. Roller ve Yetki Yönetimi

<!-- [R-NNN] -->

---

## 6. Süreç (Workflow) Mimarisi

<!-- [W-NNN] -->

---

## 7. Görev Yönetimi

<!-- [T-NNN] -->

---

## 8. Doküman Yönetimi

<!-- [D-NNN] -->

---

## 9. Admin Panelleri

<!-- [AP-NNN] -->

---

## 10. Güvenlik ve KVKK

<!-- [SEC-NNN] -->

---

## 11. Denetim (Audit Log)

<!-- [AUD-NNN] -->

---

## 12. Entegrasyonlar

<!-- [I-NNN] -->

---

## 13. Bildirim Sistemi

<!-- [N-NNN] -->

---

## 14. Tech Stack

<!-- [TS-NNN] -->

---

## 15. Altyapı ve Operasyon

<!-- [INF-NNN] -->

---

## 16. Test Stratejisi

<!-- [TEST-NNN] -->

---

## 17. Kod Organizasyonu ve Agent Kuralları

<!-- [CODE-NNN] -->

---

## 18. Açık Kararlar — Tamamlanması Gerekenler

Aşağıdaki kararlar henüz alınmamıştır. **Bu kararlar tamamlanmadan ilgili kod parçalarının geliştirilmesine başlanmamalıdır.**

<!-- [KATEGORI-OPEN-N] maddeleri öncelik etiketiyle (🔴 Kritik / 🟠 Yüksek / 🟢 Düşük) -->

---

## Versiyon Geçmişi

| Versiyon | Tarih      | Açıklama      |
| -------- | ---------- | ------------- |
| 0.1      | {{TARIH}}  | İlk taslak.   |

---

## Nasıl Kullanılır?

Bu doküman **canlı bir dokümandır** — kararlar netleştikçe güncellenecektir. Her yeni karar için:

1. İlgili bölüme karar eklenir (Karar ID formatı: `[KATEGORI-SIRA]`).
2. Karar açıksa Bölüm 18'e `[KATEGORI-OPEN-N]` olarak öncelik etiketiyle yazılır; kapandığında listeden silinir.
3. Versiyon geçmişine not düşülür.

`docs/` dokümanları ve `.claude/rules/` kuralları oluşturulurken bu dokümandaki karar ID'leri **referans** olarak kullanılır. Böylece hiçbir kural boşlukta kalmaz, her kural bir mimari karara bağlıdır.

Pipeline: bu doküman → `project-doc-architect` (11 doküman) → `rules-architect` (`.claude/rules/` + `CLAUDE.md`) → `phase-creator` (faz skill'leri) → `phase-controller` (audit).
