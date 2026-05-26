import { Routes, Route } from 'react-router-dom'
import HomePage from '@/pages/HomePage'
import CategoryPage from '@/pages/CategoryPage'
import MalCallback from '@/pages/MalCallback'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/category/:slug" element={<CategoryPage />} />
      <Route path="/mal-callback" element={<MalCallback />} />
    </Routes>
  )
}
