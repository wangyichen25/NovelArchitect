
import ProjectDashboard from "@/components/project-dashboard";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-6 md:p-24 relative overflow-hidden bg-background selection:bg-primary/20">

      {/* Hero Background Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-secondary/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      <div className="z-10 w-full max-w-6xl flex flex-col items-center mb-16 text-center">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight font-sans mb-4 text-foreground/90">
          NovelArchitect
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground font-light tracking-wide max-w-2xl">
          Distraction-free environment for your next masterpiece.
        </p>
      </div>

      <div className="w-full max-w-6xl z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <ProjectDashboard />
      </div>
    </main>
  );
}
