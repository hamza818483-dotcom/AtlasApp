// ============================================
// FLUTTER_READY: API Layer
// Convert: Dart Supabase Client
// ============================================

const SUPABASE_URL  = 'https://atlas-ai-proxy.hamza818483.workers.dev';
const SUPABASE_KEY  = 'mb_d1_9f2a7c6e1b4d8305';

// FLUTTER_READY: Convert to Dart class
const API = {
    // Generic Fetch
    async fetchTable(table, query = '', method = 'GET', body = null) {
        const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
        const opts = {
            method,
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        };
        if (body) opts.body = JSON.stringify(body);

        const _ctrl = new AbortController();
        const _timeoutId = setTimeout(() => _ctrl.abort(), 8000);
        opts.signal = _ctrl.signal;

        try {
            let res;
            try {
                res = await fetch(url, opts);
            } finally {
                clearTimeout(_timeoutId);
            }
            const text = await res.text();
            if (!text?.trim()) return [];
            const data = JSON.parse(text);
            if (!res.ok) throw new Error(data.message || 'API Error');
            return data;
        } catch(e) {
            if (e.name === 'AbortError') {
                console.error('API Error: request timed out (8s)');
                throw new Error('নেটওয়ার্ক ধীর — অনুরোধ টাইমআউট হয়েছে, আবার চেষ্টা করুন');
            }
            console.error('API Error:', e.message);
            throw e;
        }
    },

    // Users
    users: {
        getByPhone: (phone) => API.fetchTable('users', `?phone=eq.${phone}&select=*`),
        create: (data) => API.fetchTable('users', '', 'POST', data),
        update: (phone, data) => API.fetchTable('users', `?phone=eq.${phone}`, 'PATCH', data),
        list: (limit = 50) => API.fetchTable('users', `?select=*&order=created_at.desc&limit=${limit}`)
    },

    // Exams
    exams: {
        list: (limit = 100) => API.fetchTable('exams', `?select=*&order=sort_order.asc,created_at.desc&limit=${limit}`),
        getById: (id) => API.fetchTable('exams', `?id=eq.${id}&select=*`),
        getByType: (type) => API.fetchTable('exams', `?exam_type=eq.${type}&select=*&order=sort_order.asc`),
        create: (data) => API.fetchTable('exams', '', 'POST', data),
        update: (id, data) => API.fetchTable('exams', `?id=eq.${id}`, 'PATCH', data),
        delete: (id) => API.fetchTable('exams', `?id=eq.${id}`, 'DELETE')
    },

    // Questions
    questions: {
        getByExam: (examId) => API.fetchTable('questions', `?exam_id=eq.${examId}&select=*`),
        create: (data) => API.fetchTable('questions', '', 'POST', data),
        createBatch: async (questions) => {
            for (const q of questions) {
                await API.fetchTable('questions', '', 'POST', q);
            }
        },
        update: (id, data) => API.fetchTable('questions', `?id=eq.${id}`, 'PATCH', data),
        deleteByExam: (examId) => API.fetchTable('questions', `?exam_id=eq.${examId}`, 'DELETE')
    },

    // Results
    results: {
        getByPhone: (phone) => API.fetchTable('exam_results', `?phone=eq.${phone}&select=*&order=submitted_at.desc&limit=30`),
        create: (data) => API.fetchTable('exam_results', '', 'POST', data),
        delete: (id) => API.fetchTable('exam_results', `?id=eq.${id}`, 'DELETE')
    },

    // Classes
    classes: {
        list: (limit = 100) => API.fetchTable('classes', `?select=*&order=sort_order.asc&limit=${limit}`),
        create: (data) => API.fetchTable('classes', '', 'POST', data),
        update: (id, data) => API.fetchTable('classes', `?id=eq.${id}`, 'PATCH', data),
        delete: (id) => API.fetchTable('classes', `?id=eq.${id}`, 'DELETE')
    },

    // Mock Questions
    mock: {
        list: () => API.fetchTable('mock_questions', `?select=*&order=sort_order.asc`),
        create: (data) => API.fetchTable('mock_questions', '', 'POST', data),
        delete: (id) => API.fetchTable('mock_questions', `?id=eq.${id}`, 'DELETE')
    },

    // Social Links
    social: {
        list: () => API.fetchTable('social_links', `?select=*&order=sort_order.asc&limit=20`),
        create: (data) => API.fetchTable('social_links', '', 'POST', data),
        update: (id, data) => API.fetchTable('social_links', `?id=eq.${id}`, 'PATCH', data),
        delete: (id) => API.fetchTable('social_links', `?id=eq.${id}`, 'DELETE')
    },

    // Notifications
    notifications: {
        getByPhone: (phone) => API.fetchTable('notifications', `?phone=eq.${phone}&select=*&order=created_at.desc&limit=20`),
        create: (data) => API.fetchTable('notifications', '', 'POST', data),
        markRead: (id) => API.fetchTable('notifications', `?id=eq.${id}`, 'PATCH', {is_read: true}),
        delete: (id) => API.fetchTable('notifications', `?id=eq.${id}`, 'DELETE')
    },

    // Reports
    reports: {
        list: () => API.fetchTable('question_reports', `?select=*&order=created_at.desc&limit=30`),
        create: (data) => API.fetchTable('question_reports', '', 'POST', data),
        update: (id, data) => API.fetchTable('question_reports', `?id=eq.${id}`, 'PATCH', data),
        delete: (id) => API.fetchTable('question_reports', `?id=eq.${id}`, 'DELETE')
    },

    // Countdowns
    countdowns: {
        list: () => API.fetchTable('countdowns', `?select=*&order=sort_order.asc&limit=5`),
        create: (data) => API.fetchTable('countdowns', '', 'POST', data),
        update: (id, data) => API.fetchTable('countdowns', `?id=eq.${id}`, 'PATCH', data),
        delete: (id) => API.fetchTable('countdowns', `?id=eq.${id}`, 'DELETE')
    },

    // Mentors
    mentors: {
        list: () => API.fetchTable('mentors', `?select=*&order=sort_order.asc&limit=6`),
        create: (data) => API.fetchTable('mentors', '', 'POST', data),
        update: (id, data) => API.fetchTable('mentors', `?id=eq.${id}`, 'PATCH', data),
        delete: (id) => API.fetchTable('mentors', `?id=eq.${id}`, 'DELETE')
    },

    // Special Cards
    specialCards: {
        list: () => API.fetchTable('special_cards', `?select=*&order=sort_order.asc&limit=1`),
        create: (data) => API.fetchTable('special_cards', '', 'POST', data),
        update: (id, data) => API.fetchTable('special_cards', `?id=eq.${id}`, 'PATCH', data),
        delete: (id) => API.fetchTable('special_cards', `?id=eq.${id}`, 'DELETE')
    },

    // Model Tests
    modelTests: {
        list: () => API.fetchTable('model_tests', `?select=*&order=sort_order.asc`),
        create: (data) => API.fetchTable('model_tests', '', 'POST', data),
        delete: (id) => API.fetchTable('model_tests', `?id=eq.${id}`, 'DELETE')
    },

    // Ka Kha CQ
    kaKhaCQ: {
        list: () => API.fetchTable('ka_kha_cq', `?select=*&order=sort_order.asc`),
        create: (data) => API.fetchTable('ka_kha_cq', '', 'POST', data),
        update: (id, data) => API.fetchTable('ka_kha_cq', `?id=eq.${id}`, 'PATCH', data),
        delete: (id) => API.fetchTable('ka_kha_cq', `?id=eq.${id}`, 'DELETE')
    }
};