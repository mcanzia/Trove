import { Routes, Route } from 'react-router-dom'
import HomePage from '@/pages/HomePage'
import CategoryPage from '@/pages/CategoryPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/category/:slug" element={<CategoryPage />} />
    </Routes>
  )
}
