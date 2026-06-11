import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import Auth from "@/pages/auth";
import Hub from "@/pages/hub";
import Films from "@/pages/films";
import MediaDetailPage from "@/pages/media-detail-page";
import Dining from "@/pages/dining";
import DiningDetailPage from "@/pages/dining-detail-page";
import Places from "@/pages/places";
import Social from "@/pages/social";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl animate-pulse"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
          />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <Switch>
      <Route path="/" component={Hub} />
      <Route path="/films" component={Films} />
      <Route path="/films/:type/:id" component={MediaDetailPage} />
      <Route path="/dining" component={Dining} />
      <Route path="/dining/live" component={DiningDetailPage} />
      <Route path="/dining/:id" component={DiningDetailPage} />
      <Route path="/places" component={Places} />
      <Route path="/social" component={Social} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
