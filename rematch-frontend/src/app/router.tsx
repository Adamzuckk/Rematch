import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { DashboardPage } from '../pages/DashboardPage'
import { DecisionExplorerPage } from '../pages/DecisionExplorerPage'
import { InsightsPage } from '../pages/InsightsPage'
import { MatchAnalysisPage } from '../pages/MatchAnalysisPage'
import { MetricsPage } from '../pages/MetricsPage'
import { PickYourPassPage } from '../pages/PickYourPassPage'

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
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
  )
}
