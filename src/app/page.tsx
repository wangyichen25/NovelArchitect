
import ProjectDashboard from "@/components/project-dashboard";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-24 bg-background text-foreground">
      <div className="z-10 w-full max-w-5xl items-center justify-between text-sm lg:flex mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl font-serif">
          NovelArchitect
        </h1>
        <p className="text-muted-foreground mt-4 lg:mt-0">
          Local-First, AI-Augmented IDE
        </p>
      </div>

      <div className="w-full max-w-5xl">
        <ProjectDashboard />
      </div>
    </main>
  );
}
