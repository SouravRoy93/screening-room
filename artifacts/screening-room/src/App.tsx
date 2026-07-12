import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { ErrorBoundary } from "@/components/error-boundary";
import Auth from "@/pages/auth";
import Hub from "@/pages/hub";
import Films from "@/pages/films";
import MediaDetailPage from "@/pages/media-detail-page";
import Dining from "@/pages/dining";
import DiningDetailPage from "@/pages/dining-detail-page";
import Places from "@/pages/places";
import PlaceDetailPage from "@/pages/place-detail-page";
import Social from "@/pages/social";
import ResetPassword from "@/pages/reset-password";
import Privacy from "@/pages/privacy";
import PublicProfilePage from "@/pages/public-profile";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function AppRouter() {
  const { loading } = useAuth();
  const [, nav] = useLocation();

  // When the user arrives from a password-reset email, Supabase emits
  // PASSWORD_RECOVERY — route them to the new-password form.
  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") nav("/reset");
    });
    return () => subscription.unsubscribe();
  }, [nav]);

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

  // Public browse: anyone can explore the catalogs; tracking prompts sign-in.
  return (
    <Switch>
      <Route path="/" component={Hub} />
      <Route path="/auth" component={Auth} />
      <Route path="/reset" component={ResetPassword} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/u/:id" component={PublicProfilePage} />
      <Route path="/films" component={Films} />
      <Route path="/films/:type/:id" component={MediaDetailPage} />
      <Route path="/dining" component={Dining} />
      <Route path="/dining/live" component={DiningDetailPage} />
      <Route path="/dining/:id" component={DiningDetailPage} />
      <Route path="/places" component={Places} />
      <Route path="/places/:id" component={PlaceDetailPage} />
      <Route path="/social" component={Social} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
