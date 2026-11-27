"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL, authHeaders, getStoredToken } from "./api";
import { LEAD_SPECIALTIES, specialtyLabels } from "./specialties";
import { sortByLabel } from "./sort";

export type SpecialtyOption = { code: string; name: string };

/** Las especialidades originales: se muestran mientras responde la API o si falla. */
const FALLBACK: SpecialtyOption[] = sortByLabel(
  LEAD_SPECIALTIES.map((code) => ({ code: code as string, name: specialtyLabels[code] })),
  (item) => item.name,
);

/** Especialidades activas de la base de datos (incluye las creadas en "Cargar datos"). */
export function useSpecialtyOptions() {
  const [options, setOptions] = useState<SpecialtyOption[]>(FALLBACK);

  useEffect(() => {
    if (!getStoredToken()) return;
    let cancelled = false;
    axios
      .get<SpecialtyOption[]>(`${API_URL}/specialties`, { headers: authHeaders() })
      .then((response) => {
        if (!cancelled) setOptions(sortByLabel(response.data, (item) => item.name));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return options;
}
