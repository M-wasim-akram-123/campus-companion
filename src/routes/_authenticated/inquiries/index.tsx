import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/inquiries/")({ component: InquiriesList });

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500",
  follow_up: "bg-amber-500",
  interested: "bg-purple-500",
  converted: "bg-green-500",
  lost: "bg-gray-500",
};

function InquiriesList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

  const { data: inquiries, isLoading } = useQuery({
    queryKey: ["inquiries", status],
    queryFn: async () => {
      let q = supabase.from("inquiries").select("*, programs(name)").order("created_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status as any);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const filtered = inquiries?.filter((i) =>
    !search || i.full_name.toLowerCase().includes(search.toLowerCase()) || i.phone.includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inquiries</h1>
          <p className="text-muted-foreground">Prospective student inquiries</p>
        </div>
        <Button asChild><Link to="/inquiries/new"><Plus className="mr-2 h-4 w-4" />New Inquiry</Link></Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="follow_up">Follow up</SelectItem>
            <SelectItem value="interested">Interested</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : !filtered?.length ? (
          <div className="p-8 text-center text-muted-foreground">No inquiries yet</div>
        ) : (
          <div className="divide-y">
            {filtered.map((i) => (
              <Link key={i.id} to="/inquiries/$id" params={{ id: i.id }}
                className="flex items-center justify-between p-4 hover:bg-accent">
                <div>
                  <div className="font-medium">{i.full_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {i.phone} {i.programs ? `• ${(i.programs as any).name}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={STATUS_COLORS[i.status]}>{i.status.replace("_", " ")}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(i.created_at).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
