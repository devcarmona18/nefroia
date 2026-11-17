/**
 * Reciprocal Rank Fusion (Cormack, Clarke y Büttcher, SIGIR 2009):
 *   score(d) = Σ_i  w_i / (k + rank_i(d))
 * con rank empezando en 1. Combina listas ordenadas de naturaleza distinta
 * (similitud coseno y ts_rank) sin normalizar sus puntuaciones, que no son
 * comparables entre sí. k = 60 es el valor del artículo original.
 */

export type FusedItem = {
  id: string;
  score: number;
  /** Posición (1..n) en cada lista de entrada, o null si no aparece. */
  ranks: (number | null)[];
};

export function reciprocalRankFusion(
  lists: string[][],
  { k = 60, weights }: { k?: number; weights?: number[] } = {}
): FusedItem[] {
  if (k <= 0) {
    throw new Error("k debe ser positivo");
  }
  const fused = new Map<string, FusedItem>();

  lists.forEach((list, listIndex) => {
    const weight = weights?.[listIndex] ?? 1;
    const seen = new Set<string>();
    list.forEach((id, position) => {
      // Un duplicado dentro de la misma lista solo cuenta la primera vez.
      if (seen.has(id)) {
        return;
      }
      seen.add(id);
      const rank = position + 1;
      const item = fused.get(id) ?? {
        id,
        ranks: lists.map(() => null),
        score: 0,
      };
      item.ranks[listIndex] = rank;
      item.score += weight / (k + rank);
      fused.set(id, item);
    });
  });

  const bestRank = (item: FusedItem) =>
    Math.min(...item.ranks.map((rank) => rank ?? Number.POSITIVE_INFINITY));

  return [...fused.values()].sort(
    (a, b) =>
      b.score - a.score || bestRank(a) - bestRank(b) || a.id.localeCompare(b.id)
  );
}
