export type CampusInchargeSeries = {
  id: string;
  name: string;
  sectionCount: number;
};

export type CampusInchargeMonthlyCollection = {
  incharges: CampusInchargeSeries[];
  chartRows: Array<Record<string, string | number>>;
  totals: Array<{ id: string; name: string; amount: number }>;
};

function monthKey(date: string): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function recentMonthKeys(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (count - 1 - index));
    return monthKey(d.toISOString());
  });
}

export function buildCampusInchargeMonthlyCollection(params: {
  incharges: CampusInchargeSeries[];
  sectionToInchargeIds: Map<string, string[]>;
  studentSectionById: Map<string, string | null>;
  payments: { student_id: string; amount: number; paid_at: string }[];
  monthCount?: number;
}): CampusInchargeMonthlyCollection {
  const monthCount = params.monthCount ?? 12;
  const months = recentMonthKeys(monthCount);
  const inchargeIds = new Set(params.incharges.map((row) => row.id));

  const totals = new Map<string, number>();
  for (const id of inchargeIds) totals.set(id, 0);

  const matrix = new Map<string, Map<string, number>>();
  for (const month of months) {
    matrix.set(month, new Map(Array.from(inchargeIds, (id) => [id, 0])));
  }

  for (const payment of params.payments) {
    const sectionId = params.studentSectionById.get(payment.student_id);
    if (!sectionId) continue;

    const inchargeList = params.sectionToInchargeIds.get(sectionId) ?? [];
    if (!inchargeList.length) continue;

    const key = monthKey(payment.paid_at);
    if (!matrix.has(key)) continue;

    const amount = Number(payment.amount ?? 0);
    if (amount <= 0) continue;

    const row = matrix.get(key)!;
    for (const inchargeId of inchargeList) {
      if (!inchargeIds.has(inchargeId)) continue;
      row.set(inchargeId, (row.get(inchargeId) ?? 0) + amount);
      totals.set(inchargeId, (totals.get(inchargeId) ?? 0) + amount);
    }
  }

  const chartRows = months.map((month) => {
    const row: Record<string, string | number> = { name: monthLabel(month) };
    const values = matrix.get(month)!;
    for (const incharge of params.incharges) {
      row[incharge.id] = values.get(incharge.id) ?? 0;
    }
    return row;
  });

  return {
    incharges: params.incharges,
    chartRows,
    totals: params.incharges
      .map((incharge) => ({
        id: incharge.id,
        name: incharge.name,
        amount: totals.get(incharge.id) ?? 0,
      }))
      .sort((a, b) => b.amount - a.amount),
  };
}
