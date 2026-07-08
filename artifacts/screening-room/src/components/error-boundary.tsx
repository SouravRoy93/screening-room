import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Unhandled UI error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6">
          <div className="text-center max-w-sm">
            <div
              className="w-12 h-12 mx-auto mb-4 rounded-2xl"
              style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
            />
            <h1 className="text-lg font-bold text-foreground mb-2">Something went wrong</h1>
            <p className="text-sm text-muted-foreground mb-5">
              An unexpected error interrupted the app. Reloading usually fixes it.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
