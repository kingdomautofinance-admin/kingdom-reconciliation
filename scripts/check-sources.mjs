import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkSources() {
  const { data, error } = await supabase
    .from('transactions')
    .select('source')
    .limit(100);

  if (error) {
    console.error(error);
    return;
  }

  const sources = new Set(data.map(d => d.source));
  console.log('Sources:', Array.from(sources));
}

checkSources();
