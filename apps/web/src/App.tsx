import { Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/shell/AppShell'
import HomePage from '@/pages/HomePage'
import CategoryPage from '@/pages/CategoryPage'
import RecipePage from '@/pages/RecipePage'
import MalCallback from '@/pages/MalCallback'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/category/:slug" element={<CategoryPage />} />
        <Route path="/category/:slug/recipe/:postId" element={<RecipePage />} />
      </Route>
      <Route path="/mal-callback" element={<MalCallback />} />
    </Routes>
  )
}
