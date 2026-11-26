"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_URL, authHeaders } from "../../lib/api";
import { extractErrorMessage } from "../../lib/http";
import type { ImportRow } from "./materialMath";
import type {
  KitItem,
  MaterialGroup,
  MaterialItem,
  MaterialPlanningData,
  MovementType,
  Program,
  ScheduleEntry,
  Supply,
} from "./types";

const BASE = `${API_URL}/material-planning`;

const EMPTY: MaterialPlanningData = {
  groups: [],
  items: [],
  kits: [],
  schedule: [],
  notes: [],
  courseStarts: [],
  supplies: [],
  supplyMovements: [],
};

type ItemPatch = Partial<
  Pick<MaterialItem, "kind" | "version" | "module" | "available" | "printQty" | "notes" | "doNotUse" | "disposition" | "reviewed">
>;

/**
 * Carga todo el módulo y expone acciones con guardado optimista: la pantalla
 * cambia al instante y, si el servidor rechaza el cambio, se vuelve a cargar.
 */
export function useMaterialPlanning() {
  const [data, setData] = useState<MaterialPlanningData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await axios.get<MaterialPlanningData>(BASE, { headers: authHeaders() });
      setData(response.data);
      setError("");
    } catch (caught) {
      setError(extractErrorMessage(caught, "No se pudo cargar la planeación de material"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Carga inicial: el estado se actualiza tras la respuesta de red, no de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** Aplica el cambio local, manda la petición y recarga si falla. */
  const mutate = useCallback(
    async (apply: (current: MaterialPlanningData) => MaterialPlanningData, request: () => Promise<unknown>, failure: string) => {
      setData(apply);
      try {
        await request();
        setError("");
      } catch (caught) {
        setError(extractErrorMessage(caught, failure));
        await load();
      }
    },
    [load],
  );

  const updateItem = useCallback(
    (id: string, patch: ItemPatch) =>
      mutate(
        (current) => ({
          ...current,
          items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        }),
        () => axios.patch(`${BASE}/items/${id}`, patch, { headers: authHeaders() }),
        "No se pudo guardar el material",
      ),
    [mutate],
  );

  const bulkUpdateItems = useCallback(
    (ids: string[], patch: { reviewed?: boolean; doNotUse?: boolean }) =>
      mutate(
        (current) => ({
          ...current,
          items: current.items.map((item) => (ids.includes(item.id) ? { ...item, ...patch } : item)),
        }),
        () => axios.patch(`${BASE}/items/bulk`, { ids, ...patch }, { headers: authHeaders() }),
        "No se pudieron actualizar los materiales",
      ),
    [mutate],
  );

  const setAssignment = useCallback(
    (itemIds: string[], groupId: string, assigned: boolean) =>
      mutate(
        (current) => ({
          ...current,
          items: current.items.map((item) => {
            if (!itemIds.includes(item.id)) return item;
            const has = item.groupIds.includes(groupId);
            if (assigned && !has) return { ...item, groupIds: [...item.groupIds, groupId] };
            if (!assigned && has) return { ...item, groupIds: item.groupIds.filter((id) => id !== groupId) };
            return item;
          }),
        }),
        () => axios.put(`${BASE}/assignments`, { itemIds, groupId, assigned }, { headers: authHeaders() }),
        "No se pudo guardar la asignación",
      ),
    [mutate],
  );

  const updateGroup = useCallback(
    (id: string, patch: Partial<Pick<MaterialGroup, "students" | "enrolled" | "counts" | "venue" | "courseLabel">>) =>
      mutate(
        (current) => {
          const target = current.groups.find((group) => group.id === id);
          return {
            ...current,
            groups: current.groups.map((group) => {
              if (group.id === id) return { ...group, ...patch };
              // Renombrar un curso lo renombra en todas sus sedes.
              if (patch.courseLabel && target && group.program === target.program && group.courseKey === target.courseKey) {
                return { ...group, courseLabel: patch.courseLabel };
              }
              return group;
            }),
          };
        },
        () => axios.patch(`${BASE}/groups/${id}`, patch, { headers: authHeaders() }),
        "No se pudo guardar el grupo",
      ),
    [mutate],
  );

  const createGroup = useCallback(
    async (input: { program: Program; courseLabel: string; venue?: string; students?: number; counts?: boolean }) => {
      try {
        const response = await axios.post<MaterialGroup>(`${BASE}/groups`, input, { headers: authHeaders() });
        setData((current) => ({ ...current, groups: [...current.groups, response.data] }));
        setError("");
        return true;
      } catch (caught) {
        setError(extractErrorMessage(caught, "No se pudo crear el grupo"));
        return false;
      }
    },
    [],
  );

  const removeGroup = useCallback(
    (id: string) =>
      mutate(
        (current) => ({
          ...current,
          groups: current.groups.filter((group) => group.id !== id),
          items: current.items.map((item) => ({ ...item, groupIds: item.groupIds.filter((groupId) => groupId !== id) })),
        }),
        () => axios.delete(`${BASE}/groups/${id}`, { headers: authHeaders() }),
        "No se pudo eliminar el grupo",
      ),
    [mutate],
  );

  const updateKit = useCallback(
    (id: string, patch: { qty?: number; item?: string; supplyId?: string | null }) =>
      mutate(
        (current) => {
          const target = current.kits.find((kit) => kit.id === id);
          return {
            ...current,
            kits: current.kits.map((kit: KitItem) => {
              if (kit.id === id) return { ...kit, ...patch };
              // El vínculo con un insumo vale para el mismo renglón de todos los cursos del programa.
              if (
                patch.supplyId !== undefined &&
                target &&
                kit.program === target.program &&
                kit.item.toLowerCase() === target.item.toLowerCase()
              ) {
                return { ...kit, supplyId: patch.supplyId };
              }
              return kit;
            }),
          };
        },
        () => axios.patch(`${BASE}/kits/${id}`, patch, { headers: authHeaders() }),
        "No se pudo guardar el paquete",
      ),
    [mutate],
  );

  const createKit = useCallback(
    async (input: { program: Program; courseKey: string; item: string; qty?: number }) => {
      try {
        const response = await axios.post<KitItem>(`${BASE}/kits`, input, { headers: authHeaders() });
        setData((current) => ({ ...current, kits: [...current.kits, response.data] }));
        setError("");
        return true;
      } catch (caught) {
        setError(extractErrorMessage(caught, "No se pudo agregar al paquete"));
        return false;
      }
    },
    [],
  );

  const removeKit = useCallback(
    (id: string) =>
      mutate(
        (current) => ({ ...current, kits: current.kits.filter((kit: KitItem) => kit.id !== id) }),
        () => axios.delete(`${BASE}/kits/${id}`, { headers: authHeaders() }),
        "No se pudo quitar del paquete",
      ),
    [mutate],
  );

  const createSupply = useCallback(async (input: { name: string; available?: number }) => {
    try {
      await axios.post<Supply>(`${BASE}/supplies`, input, { headers: authHeaders() });
      await load(); // el servidor también vincula renglones de paquete con el mismo nombre
      return true;
    } catch (caught) {
      setError(extractErrorMessage(caught, "No se pudo agregar el insumo"));
      return false;
    }
  }, [load]);

  const updateSupply = useCallback(
    (id: string, patch: { name?: string; minStock?: number | null }) =>
      mutate(
        (current) => ({
          ...current,
          supplies: current.supplies.map((supply) => (supply.id === id ? { ...supply, ...patch } : supply)),
        }),
        async () => {
          await axios.patch(`${BASE}/supplies/${id}`, patch, { headers: authHeaders() });
          if (patch.name !== undefined) await load();
        },
        "No se pudo guardar el insumo",
      ),
    [mutate, load],
  );

  const removeSupply = useCallback(
    (id: string) =>
      mutate(
        (current) => ({
          ...current,
          supplies: current.supplies.filter((supply) => supply.id !== id),
          supplyMovements: current.supplyMovements.filter((movement) => movement.supplyId !== id),
          kits: current.kits.map((kit) => (kit.supplyId === id ? { ...kit, supplyId: null } : kit)),
        }),
        () => axios.delete(`${BASE}/supplies/${id}`, { headers: authHeaders() }),
        "No se pudo eliminar el insumo",
      ),
    [mutate],
  );

  /** Registra una entrada, salida o conteo; devuelve el motivo si el servidor lo rechaza. */
  const createMovement = useCallback(
    async (
      supplyId: string,
      input: { type: MovementType; quantity: number; movementDate: string; detail?: string; unitCost?: number },
    ) => {
      try {
        await axios.post(`${BASE}/supplies/${supplyId}/movements`, input, { headers: authHeaders() });
        await load();
        return null;
      } catch (caught) {
        return extractErrorMessage(caught, "No se pudo registrar el movimiento");
      }
    },
    [load],
  );

  const removeMovement = useCallback(
    async (id: string) => {
      try {
        await axios.delete(`${BASE}/supply-movements/${id}`, { headers: authHeaders() });
        await load();
      } catch (caught) {
        setError(extractErrorMessage(caught, "No se pudo anular el movimiento"));
      }
    },
    [load],
  );

  /** Manda un .xlsx/.csv al servidor y devuelve su contenido como texto para la vista previa (no guarda nada). */
  const readImportFile = useCallback(async (file: File) => {
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await axios.post<{ text: string }>(`${BASE}/items/import/file`, form, { headers: authHeaders() });
      setError("");
      return response.data.text;
    } catch (caught) {
      setError(extractErrorMessage(caught, "No se pudo leer el archivo"));
      return null;
    }
  }, []);

  /** Importa materiales/inventario; devuelve cuántos se crearon y actualizaron (o null si falló). */
  const importItems = useCallback(
    async (input: { program: Program; mode: "replace" | "add"; rows: ImportRow[] }) => {
      try {
        const response = await axios.post<{ created: number; updated: number }>(`${BASE}/items/import`, input, {
          headers: authHeaders(),
        });
        await load();
        return response.data;
      } catch (caught) {
        setError(extractErrorMessage(caught, "No se pudo importar el material"));
        return null;
      }
    },
    [load],
  );

  const updateScheduleEntry = useCallback(
    (id: string, patch: { label?: string; weekStart?: string; kind?: "exam" | "none" | "break" }) =>
      mutate(
        (current) => ({
          ...current,
          schedule: current.schedule.map((entry: ScheduleEntry) => {
            if (entry.id !== id) return entry;
            // Igual que el servidor: "sin examen" fija el texto y "especial" trae uno por defecto.
            const label =
              patch.kind === "none"
                ? "Sin examen"
                : patch.kind === "break" && patch.label === undefined
                  ? "Situación especial"
                  : (patch.label ?? entry.label);
            return { ...entry, ...patch, label };
          }),
        }),
        () => axios.patch(`${BASE}/schedule/${id}`, patch, { headers: authHeaders() }),
        "No se pudo guardar el calendario",
      ),
    [mutate],
  );

  const createScheduleEntry = useCallback(
    async (input: {
      program: Program;
      courseKey: string;
      weekStart: string;
      kind: "exam" | "none" | "break";
      label?: string;
    }) => {
      try {
        const response = await axios.post<ScheduleEntry>(`${BASE}/schedule`, input, { headers: authHeaders() });
        setData((current) => ({ ...current, schedule: [...current.schedule, response.data] }));
        setError("");
        return true;
      } catch (caught) {
        setError(extractErrorMessage(caught, "No se pudo agregar la semana al calendario"));
        return false;
      }
    },
    [],
  );

  const removeScheduleEntry = useCallback(
    (id: string) =>
      mutate(
        (current) => ({ ...current, schedule: current.schedule.filter((entry: ScheduleEntry) => entry.id !== id) }),
        () => axios.delete(`${BASE}/schedule/${id}`, { headers: authHeaders() }),
        "No se pudo quitar la semana del calendario",
      ),
    [mutate],
  );

  /** Al fijar el inicio, el servidor recorre el calendario del curso; se recarga para verlo. */
  const setCourseStart = useCallback(
    async (program: Program, courseKey: string, startDate: string | null) => {
      try {
        await axios.put(`${BASE}/courses/${program}/${courseKey}/start`, { startDate }, { headers: authHeaders() });
        await load();
      } catch (caught) {
        setError(extractErrorMessage(caught, "No se pudo guardar el inicio de clases"));
        await load();
      }
    },
    [load],
  );

  const shiftSchedule = useCallback(
    async (program: Program, days: number, courseKey?: string) => {
      try {
        await axios.post(`${BASE}/schedule/shift`, { program, days, courseKey }, { headers: authHeaders() });
        await load();
      } catch (caught) {
        setError(extractErrorMessage(caught, "No se pudieron mover las fechas"));
      }
    },
    [load],
  );

  const createItem = useCallback(
    async (input: { program: Program; kind: string; version?: string; module?: string; available?: number }) => {
      try {
        const response = await axios.post<MaterialItem>(`${BASE}/items`, input, { headers: authHeaders() });
        setData((current) => ({ ...current, items: [...current.items, response.data] }));
        setError("");
        return true;
      } catch (caught) {
        setError(extractErrorMessage(caught, "No se pudo crear el material"));
        return false;
      }
    },
    [],
  );

  const removeItem = useCallback(
    (id: string) =>
      mutate(
        (current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }),
        () => axios.delete(`${BASE}/items/${id}`, { headers: authHeaders() }),
        "No se pudo eliminar el material",
      ),
    [mutate],
  );

  return {
    data,
    loading,
    error,
    setError,
    reload: load,
    updateItem,
    bulkUpdateItems,
    setAssignment,
    updateGroup,
    createGroup,
    removeGroup,
    updateKit,
    createKit,
    removeKit,
    importItems,
    readImportFile,
    createSupply,
    updateSupply,
    removeSupply,
    createMovement,
    removeMovement,
    updateScheduleEntry,
    createScheduleEntry,
    removeScheduleEntry,
    setCourseStart,
    shiftSchedule,
    createItem,
    removeItem,
  };
}
