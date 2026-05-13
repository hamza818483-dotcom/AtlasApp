import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://btezborkuiqfogykrjrn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0ZXpib3JrdWlxZm9neWtyanJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NTIyNzUsImV4cCI6MjA5NDIyODI3NX0.G4C7YTmk-AEvhWXnx-phMjTh9pxbdhCiapYVDpSVsEw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper function for database operations
export const db = {
  // Auth methods
  auth: {
    signup: async (phone, password, userData) => {
      const { data, error } = await supabase.auth.signUp({
        email: `${phone}@atlas.local`,
        password: password,
      });
      
      if (!error && data.user) {
        // Store user data in profiles table
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{
            user_id: data.user.id,
            phone,
            ...userData,
          }]);
        
        return { data, error: profileError };
      }
      return { data, error };
    },

    login: async (phone, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: `${phone}@atlas.local`,
        password: password,
      });
      
      if (!error && data.user) {
        // Check and update session
        const { error: updateError } = await supabase
          .from('sessions')
          .upsert([{
            user_id: data.user.id,
            last_login: new Date(),
            active: true,
          }]);
      }
      
      return { data, error };
    },

    logout: async (userId) => {
      await supabase
        .from('sessions')
        .update({ active: false })
        .eq('user_id', userId);
      
      return await supabase.auth.signOut();
    },

    resetPassword: async (phone, newPassword) => {
      const { data: user, error: fetchError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('phone', phone)
        .single();
      
      if (!fetchError && user) {
        const { error } = await supabase.auth.admin.updateUserById(
          user.user_id,
          { password: newPassword }
        );
        return { error };
      }
      return { error: fetchError };
    },
  },

  // Exam methods
  exams: {
    getAll: async (filters = {}) => {
      let query = supabase.from('exams').select('*');
      
      if (filters.subject) query = query.eq('subject', filters.subject);
      if (filters.chapter) query = query.eq('chapter', filters.chapter);
      if (filters.type) query = query.eq('exam_type', filters.type);
      
      return await query.order('created_at', { ascending: false });
    },

    getById: async (examId) => {
      return await supabase.from('exams').select('*').eq('id', examId).single();
    },

    create: async (examData) => {
      return await supabase.from('exams').insert([examData]).select();
    },

    update: async (examId, updates) => {
      return await supabase.from('exams').update(updates).eq('id', examId);
    },

    delete: async (examId) => {
      return await supabase.from('exams').delete().eq('id', examId);
    },
  },

  // Questions methods
  questions: {
    getByExam: async (examId) => {
      return await supabase
        .from('questions')
        .select('*')
        .eq('exam_id', examId)
        .order('question_number');
    },

    create: async (questionData) => {
      return await supabase.from('questions').insert([questionData]);
    },

    bulkInsert: async (questions) => {
      return await supabase.from('questions').insert(questions);
    },
  },

  // Results methods
  results: {
    save: async (examId, userId, resultData) => {
      return await supabase.from('results').insert([{
        exam_id: examId,
        user_id: userId,
        ...resultData,
        created_at: new Date(),
      }]);
    },

    getByUser: async (userId) => {
      return await supabase
        .from('results')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    },

    getByExam: async (examId, userId) => {
      return await supabase
        .from('results')
        .select('*')
        .eq('exam_id', examId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    },
  },

  // Profile methods
  profiles: {
    get: async (userId) => {
      return await supabase.from('profiles').select('*').eq('user_id', userId).single();
    },

    update: async (userId, updates) => {
      return await supabase.from('profiles').update(updates).eq('user_id', userId);
    },
  },

  // Admin methods
  admin: {
    isAdmin: async (userId) => {
      const { data } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', userId)
        .single();
      return data?.is_admin || false;
    },

    grantAccess: async (phone) => {
      const { data: user } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('phone', phone)
        .single();
      
      if (user) {
        return await supabase
          .from('profiles')
          .update({ can_add_content: true })
          .eq('user_id', user.user_id);
      }
    },
  },
};

export default supabase;
