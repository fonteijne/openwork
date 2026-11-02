import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { App } from "./app";
import { BackendProvider } from "./backend/context";
import { createBackend } from "./backend/select";
import { ToastProvider } from "./components/ui/toast";
import { watchErrors } from "./lib/recent-errors";
import { applyTheme, watchSystemTheme } from "./lib/theme";
// Variable Manrope, split by unicode range: only the Latin file downloads.
import "@fontsource-variable/manrope/wght.css";
import "./styles.css";

watchErrors();
applyTheme();
watchSystemTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

void createBackend().then(
  (backend) => {
    createRoot(root).render(
      <StrictMode>
        <BackendProvider backend={backend}>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <App />
            </ToastProvider>
          </QueryClientProvider>
        </BackendProvider>
      </StrictMode>,
    );
  },
  (failure: unknown) => {
    root.textContent = failure instanceof Error ? failure.message : String(failure);
  },
);
