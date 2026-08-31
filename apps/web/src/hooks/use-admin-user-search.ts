"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { adminUserKeys } from "@/lib/query-keys";

/** `GET /admin/users` liste satırı (docs/03_API_CONTRACTS.md §5.8). */
export interface AdminUserRow {
  id: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
}

/** En az bu kadar karakter girilmeden arama tetiklenmez (gereksiz istek önlemi). */
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

/**
 * Bir değeri `delayMs` kadar geciktirir — kullanıcı yazarken her tuş vuruşunda
 * değil, durduğunda sorgu tetiklensin diye. Ekstra bir kütüphane eklenmez
 * (`.claude/rules/01` over-engineering yasağı).
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * S-ADMIN-MINT kullanıcı arama alanı (Faz 4 §4.4c, docs/06 S-ADMIN-MINT).
 * `GET /admin/users?email=` — kısmi, case-insensitive eşleşme; yanıt envelope'u
 * `{ data, pagination }` olduğundan `apiClient.get` yalnızca `data` dizisini döner.
 * `pageSize=20` — arama sonucu bir seçim listesidir, sayfalanmaz; kullanıcı
 * eşleşme çoksa aramayı daraltır.
 *
 * `enabled`: terim `MIN_QUERY_LENGTH` altındayken sorgu yapılmaz (boş/çok kısa
 * arama tüm kullanıcıları çekmesin).
 */
export function useAdminUserSearch(email: string) {
  const trimmed = email.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const active = debounced.length >= MIN_QUERY_LENGTH;

  const query = useQuery({
    queryKey: adminUserKeys.search(debounced),
    queryFn: () =>
      apiClient.get<AdminUserRow[]>(
        `/admin/users?email=${encodeURIComponent(debounced)}&pageSize=20`,
      ),
    enabled: active,
  });

  return { ...query, active, term: debounced };
}
