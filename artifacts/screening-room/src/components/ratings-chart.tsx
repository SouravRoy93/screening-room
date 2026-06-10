import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, PieChart, Pie, Legend
} from "recharts";
import type { TrackedItem } from "@/types";

interface Props {
  items: TrackedItem[];
}

export function RatingsBarChart({ items }: Props) {
  const data = useMemo(() => {
    const counts = Array.from({ length: 10 }, (_, i) => ({ rating: String(i + 1), count: 0 }));
    items.forEach(it => {
      if (it.rating) counts[it.rating - 1].count++;
    });
    return counts;
  }, [items]);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="rating" tick={{ fill: "#9ca3af", fontSize: 11 }} />
        <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: "#14141d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
          labelStyle={{ color: "#ffd36b" }}
          itemStyle={{ color: "#e5e7eb" }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={`hsl(${260 + i * 8}, 80%, 65%)`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WatchedOverTimeChart({ items }: Props) {
  const data = useMemo(() => {
    const byMonth: Record<string, number> = {};
    items
      .filter(it => it.rated_at || it.updated_at)
      .forEach(it => {
        const d = new Date(it.rated_at || it.updated_at!);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        byMonth[key] = (byMonth[key] || 0) + 1;
      });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, count]) => ({ month: month.slice(5), count }));
  }, [items]);

  if (data.length < 2) return <p className="text-sm text-muted-foreground text-center py-8">Not enough data yet.</p>;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
        <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: "#14141d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
          labelStyle={{ color: "#ffd36b" }}
          itemStyle={{ color: "#e5e7eb" }}
        />
        <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: "#8b5cf6" }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GenrePieChart({ items }: Props) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(it => {
      it.genres?.forEach(g => { counts[g] = (counts[g] || 0) + 1; });
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }));
  }, [items]);

  const COLORS = ["#8b5cf6", "#ec4899", "#ffd36b", "#3bc9db", "#69db7c", "#f06595"];

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" outerRadius={70} dataKey="value">
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
        <Tooltip
          contentStyle={{ background: "#14141d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
          labelStyle={{ color: "#ffd36b" }}
          itemStyle={{ color: "#e5e7eb" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
