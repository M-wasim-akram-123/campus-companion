import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/students/")({ component: StudentsList });

function StudentsList() {
  const [search, setSearch] = useState("");
  const { data: students, isLoading } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, programs(name), classes(name), sections(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = students?.filter((s) =>
    !search || s.full_name.toLowerCase().includes(search.toLowerCase()) || s.roll_number.includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-muted-foreground">All admitted students</p>
        </div>
        <Button asChild><Link to="/admissions/new"><Plus className="mr-2 h-4 w-4" />New Admission</Link></Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name or roll number..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : !filtered?.length ? (
          <div className="p-8 text-center text-muted-foreground">No students yet</div>
        ) : (
          <div className="divide-y">
            {filtered.map((s) => (
              <Link key={s.id} to="/students/$id" params={{ id: s.id }}
                className="flex items-center justify-between p-4 hover:bg-accent">
                <div>
                  <div className="font-medium">{s.full_name}</div>
                  <div className="text-sm text-muted-foreground">
                    Roll: {s.roll_number}
                    {s.programs ? ` • ${(s.programs as any).name}` : ""}
                    {s.classes ? ` • ${(s.classes as any).name}` : ""}
                    {s.sections ? ` (${(s.sections as any).name})` : ""}
                  </div>
                </div>
                <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
