import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchCampusInchargeMonthlyCollection } from "@/lib/campus-incharge-analytics-api";
import { formatCurrency } from "@/lib/finance";
import { Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const INCHARGE_COLORS = ["#2563eb", "#06b6d4", "#f59e0b", "#22c55e", "#a855f7", "#ef4444", "#ec4899", "#14b8a6"];

const tooltipStyle = {
  backgroundColor: "rgba(255,255,255,0.96)",
  border: "1px solid #bfdbfe",
  borderRadius: 14,
  boxShadow: "0 16px 40px rgba(37, 99, 235, 0.14)",
};

type Props = {
  sessionId?: string;
  months?: number;
};

export function CampusInchargeCollectionChart({ sessionId, months = 12 }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["campus-incharge-collection", sessionId ?? "all", months],
    queryFn: () => fetchCampusInchargeMonthlyCollection(sessionId, months),
  });

  const incharges = data?.incharges ?? [];
  const chartRows = data?.chartRows ?? [];
  const totals = data?.totals ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Campus incharge collection
        </CardTitle>
        <CardDescription>
          Fee received per month from students in each incharge&apos;s assigned sections (last {months} months).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading chart…</p>
        ) : error ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Could not load chart"}
          </p>
        ) : !incharges.length ? (
          <p className="text-sm text-muted-foreground">
            No campus incharges with section assignments yet. Assign sections in User Management.
          </p>
        ) : !chartRows.some((row) => incharges.some((ic) => Number(row[ic.id] ?? 0) > 0)) ? (
          <p className="text-sm text-muted-foreground">No payments recorded for assigned sections in this period.</p>
        ) : (
          <>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} barGap={4} barCategoryGap="18%">
                  <CartesianGrid stroke="#dbeafe" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  {incharges.map((incharge, index) => (
                    <Bar
                      key={incharge.id}
                      dataKey={incharge.id}
                      name={`${incharge.name} (${incharge.sectionCount} sec.)`}
                      fill={INCHARGE_COLORS[index % INCHARGE_COLORS.length]}
                      radius={[8, 8, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campus incharge</TableHead>
                  <TableHead>Sections</TableHead>
                  <TableHead className="text-right">Total collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {totals.map((row) => {
                  const incharge = incharges.find((ic) => ic.id === row.id);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{incharge?.sectionCount ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(row.amount)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
