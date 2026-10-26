import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'

const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const DecisionExplorerPage = lazy(() =>
  import('../pages/DecisionExplorerPage').then((m) => ({
    default: m.DecisionExplorerPage,
  })),
)
const InsightsPage = lazy(() =>
  import('../pages/InsightsPage').then((m) => ({ default: m.InsightsPage })),
)
const JudgeModePage = lazy(() =>
  import('../pages/JudgeModePage').then((m) => ({ default: m.JudgeModePage })),
)
const MatchAnalysisPage = lazy(() =>
  import('../pages/MatchAnalysisPage').then((m) => ({
    default: m.MatchAnalysisPage,
  })),
)
const MetricsPage = lazy(() =>
  import('../pages/MetricsPage').then((m) => ({ default: m.MetricsPage })),
)
const PickYourPassPage = lazy(() =>
  import('../pages/PickYourPassPage').then((m) => ({
    default: m.PickYourPassPage,
  })),
)
const TableStatsPage = lazy(() =>
  import('../pages/TableStatsPage').then((m) => ({
    default: m.TableStatsPage,
  })),
)

function RouteFallback() {
  return (
    <p role="status" aria-live="polite" style={{ margin: 0, padding: '1rem 0' }}>
      Loading…
    </p>
  )
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="table-stats" element={<TableStatsPage />} />
          <Route path="judge" element={<JudgeModePage />} />
          <Route path="matches/:matchId" element={<MatchAnalysisPage />} />
          <Route
            path="matches/:matchId/decisions/:eventId"
            element={<DecisionExplorerPage />}
          />
          <Route
            path="matches/:matchId/decisions/:eventId/pick-your-pass"
            element={<PickYourPassPage />}
          />
          <Route path="matches/:matchId/insights" element={<InsightsPage />} />
          <Route path="metrics" element={<MetricsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
