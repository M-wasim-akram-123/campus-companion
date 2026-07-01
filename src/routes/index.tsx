import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GraduationCap, Users, ClipboardList, Wallet } from "lucide-react";
import { CAMPUS_NAME } from "@/lib/campus";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="app-page-shell min-h-screen">
      <header className="glass-panel sticky top-0 z-40 border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="font-bold">{CAMPUS_NAME}</span>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="ghost"><Link to="/login">Sign in</Link></Button>
            <Button asChild><Link to="/signup">Sign up</Link></Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="bg-gradient-to-r from-foreground via-primary to-cyan-500 bg-clip-text text-5xl font-black tracking-tight text-transparent">
            Modern College Management System
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Manage inquiries, admissions, students, fees and payments for Intermediate
            and BS programs — all in one place.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg"><Link to="/signup">Get started</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/login">Sign in</Link></Button>
          </div>
        </div>

        <div className="mx-auto mt-20 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ClipboardList, title: "Inquiries", desc: "Track prospective students from first contact to admission." },
            { icon: Users, title: "Admissions", desc: "Roll numbers, class & section assignment, guardian info." },
            { icon: GraduationCap, title: "Students", desc: "Complete profiles with documents and academic history." },
            { icon: Wallet, title: "Finance", desc: "Fee vouchers, payments and revenue reports (coming soon)." },
          ].map((f) => (
            <div key={f.title} className="glass-panel rounded-3xl p-6 transition-all hover:-translate-y-1 hover:shadow-2xl">
              <f.icon className="h-8 w-8 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
