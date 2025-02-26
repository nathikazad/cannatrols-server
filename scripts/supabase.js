const { createClient } = require('@supabase/supabase-js');
require('dotenv').config()
// Initialize the Supabase client
const supabaseUrl = process.env.SUPBASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey);

async function getMachine() {
  try {
    // Query the machines table for the first row where machine_id = "xxxx"
    const { data, error } = await supabase
      .from('machines')
      .select('*')
      .eq('machine_id', 'xxxx')
      .limit(1)
      .single();
    
    if (error) {
      console.error('Error fetching machine:', error);
      return null;
    }
    
    if (!data) {
      console.log('No machine found with machine_id "xxxx"');
      return null;
    }
    
    console.log('Machine found:', data);
    return data;
  } catch (err) {
    console.error('Unexpected error:', err);
    return null;
  }
}

// Execute the function
getMachine();