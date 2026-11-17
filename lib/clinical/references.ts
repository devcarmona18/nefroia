import type { ClinicalReference } from "./types";

/**
 * Referencias bibliográficas de las fórmulas y umbrales. La discusión de por
 * qué se eligió cada umbral está en docs/arquitectura-clinica.md.
 */
export const REFERENCES = {
  daugirdas1993: {
    citation:
      "Daugirdas JT. Second generation logarithmic estimates of single-pool variable volume Kt/V: an analysis of error. J Am Soc Nephrol. 1993;4(5):1205-1213. Objetivos: KDOQI Clinical Practice Guideline for Hemodialysis Adequacy: 2015 Update. Am J Kidney Dis. 2015;66(5):884-930 (guía 3).",
    id: "daugirdas-1993-kdoqi-2015",
  },
  fluidBalance: {
    citation:
      "Balance hídrico = ingresos − egresos (registro de enfermería). Sin umbral normativo: se interpreta frente al objetivo de la sesión y el peso seco.",
    id: "balance-hidrico",
  },
  idwg: {
    citation:
      "Umbral de uso habitual (no es una recomendación graduada): ganancia interdialítica > 4 % del peso seco. Véase KDOQI Hemodialysis Adequacy 2015, guía 4 (control de volumen), y Wong MM et al. Am J Kidney Dis. 2017;69(3):367-379 (DOPPS).",
    id: "idwg-4pct",
  },
  ufRate: {
    citation:
      "Flythe JE, Kimmel SE, Brunelli SM. Rapid fluid removal during dialysis is associated with cardiovascular morbidity and mortality. Kidney Int. 2011;79(2):250-257. Discutido en KDOQI Hemodialysis Adequacy 2015, guía 4 (minimizar la tasa de ultrafiltración).",
    id: "uf-13-flythe-2011-kdoqi-2015",
  },
  urr: {
    citation:
      "Owen WF et al. N Engl J Med. 1993;329(14):1001-1006. Mínimo URR 65 % (objetivo 70 %): NKF-KDOQI Hemodialysis Adequacy 2006; la actualización KDOQI 2015 mantiene la dosis mínima equivalente (spKt/V 1,2).",
    id: "urr-kdoqi",
  },
} as const satisfies Record<string, ClinicalReference>;
