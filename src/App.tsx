import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

function App() {
  return (
    <div className="app">
      <h1>VibeCheck</h1>
      <p>Project initialized successfully!</p>
      <p>Supabase configured: {supabaseUrl ? 'Yes' : 'No'}</p>
    </div>
  )
}

export default App
