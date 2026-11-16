import React from "react";
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AcceptInvitePage, LoginPage } from "@/auth/AuthPages";
import { api, SIGNED_OUT_EVENT, unwrap, type Me } from "@/lib/api";
import { Spinner } from "@/lib/hooks";
import { AnalyticsPage } from "@/pages/analytics/AnalyticsPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { InventoryDetailPage } from "@/pages/inventory/InventoryDetailPage";
import { InventoryPage } from "@/pages/inventory/InventoryPage";
import { ProspectDetailPage } from "@/pages/prospects/ProspectDetailPage";
import { ProspectsPage } from "@/pages/prospects/ProspectsPage";
import { TouchesPage } from "@/pages/prospects/TouchesPage";
import { TasksPage } from "@/pages/tasks/TasksPage";
import { UsersPage } from "@/pages/users/UsersPage";
import { ListingEditorPage } from "@/pages/website/ListingEditorPage";
import { WebsitePage } from "@/pages/website/WebsitePage";
import { SessionProvider } from "@/session";
import { Shell } from "@/shell/Shell";

type Auth = { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; user: Me };

// A data router so pages can block navigation (useBlocker); the routes themselves depend on auth below.
const router = createBrowserRouter([{ path: "*", element: <Root /> }]);

export function App() {
  return <RouterProvider router={router} />;
}

function Root() {
  const [auth, setAuth] = React.useState<Auth>({ status: "loading" });

  const load = React.useCallback(() => {
    unwrap(api.me.$get()).then(
      ({ user }) => setAuth({ status: "signed-in", user }),
      () => setAuth({ status: "signed-out" }),
    );
  }, []);

  React.useEffect(() => {
    load();
    const signedOut = () => setAuth({ status: "signed-out" });
    window.addEventListener(SIGNED_OUT_EVENT, signedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, signedOut);
  }, [load]);

  const signOut = React.useCallback(() => {
    void api.auth.logout.$post().finally(() => setAuth({ status: "signed-out" }));
  }, []);

  return (
    <>
      <Toaster richColors position="top-right" />
      {auth.status === "loading" && <Spinner className="py-32" />}
      {auth.status === "signed-out" && (
        <Routes>
          <Route path="/accept-invite" element={<AcceptInvitePage onSignedIn={load} />} />
          <Route path="*" element={<LoginPage onSignedIn={load} />} />
        </Routes>
      )}
      {auth.status === "signed-in" && (
        <SessionProvider value={{ user: auth.user, signOut }}>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<DashboardPage />} />
              <Route path="prospects" element={<ProspectsPage />} />
              <Route path="prospects/:prospectId" element={<ProspectDetailPage />} />
              <Route path="touches" element={<TouchesPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="inventory/:inventoryId" element={<InventoryDetailPage />} />
              <Route path="website" element={<WebsitePage />} />
              <Route path="website/listings/:listingId" element={<ListingEditorPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="users" element={auth.user.role === "admin" ? <UsersPage /> : <Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </SessionProvider>
      )}
    </>
  );
}
