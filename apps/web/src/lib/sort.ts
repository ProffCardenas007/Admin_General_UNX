const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

/**
 * Copia ordenada alfabéticamente por el texto que se muestra (para listas desplegables).
 * Ignora acentos y mayúsculas, y trata los números como números: "Aula 2" va antes de "Aula 10".
 */
export function sortByLabel<T>(items: readonly T[], label: (item: T) => string): T[] {
  return [...items].sort((left, right) => collator.compare(label(left), label(right)));
}
