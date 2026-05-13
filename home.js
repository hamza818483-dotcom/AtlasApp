// home.js - Home Page Specific Logic

// 🟢 FIX: Ensure _supabase is available and define it
const _supabase = window._supabase || window.supabase;

// 🟢 FIX: Function to update countdown display based on database
async function loadCountdownFromDB() {
    try {
        // First try to get from countdowns table (newest first)
        const { data: countdownData, error: countdownError } = await _supabase
            .from('countdowns')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1);

        if (!countdownError && countdownData && countdownData.length > 0) {
            const cd = countdownData[0];
            const mainTopicEl = document.getElementById('cd-main-topic');
            const subTopicEl = document.getElementById('cd-sub-topic');
            
            if (mainTopicEl) mainTopicEl.innerText = cd.main_topic || 'HSC পরীক্ষা ২০২৫';
            if (subTopicEl) subTopicEl.innerText = cd.sub_topic || '';
            
            if (cd.end_time) {
                startCountdown(new Date(cd.end_time).getTime());
                return;
            }
        }
        
        // Fallback to settings table
        const { data: settingsData, error: settingsError } = await _supabase
            .from('settings')
            .select('*')
            .eq('id', 1)
            .single();

        if (!settingsError && settingsData) {
            const mainTopicEl = document.getElementById('cd-main-topic');
            const subTopicEl = document.getElementById('cd-sub-topic');
            
            if (mainTopicEl) mainTopicEl.innerText = settingsData.countdown_topic || 'HSC পরীক্ষা ২০২৫';
            if (subTopicEl) subTopicEl.innerText = settingsData.countdown_sub || '';
            
            if (settingsData.countdown_date) {
                startCountdown(new Date(settingsData.countdown_date).getTime());
                return;
            }
        }
        
        // Default fallback
        const defaultDate = new Date('2025-12-01T09:00:00');
        startCountdown(defaultDate.getTime());
        
    } catch (err) {
        console.error('Error loading countdown:', err);
        // Default fallback on error
        const defaultDate = new Date('2025-12-01T09:00:00');
        startCountdown(defaultDate.getTime());
    }
}

// 🟢 FIX: Main loadHomeData function
async function loadHomeData() {
    // Show Admin/Profile buttons based on login state
    const user = JSON.parse(localStorage.getItem('atlas_user'));
    
    // 🟢 FIX: Update admin button visibility using correct IDs
    const adminControlBtn = document.getElementById('admin-control-btn');
    const navAuthBtn = document.getElementById('navAuthBtn');
    
    if (user) {
        if (navAuthBtn) navAuthBtn.innerText = user.name || 'প্রোফাইল';
        if (adminControlBtn) {
            adminControlBtn.style.display = (user.role === 'admin' || user.role === 'sub-admin') ? 'block' : 'none';
        }
    } else {
        if (navAuthBtn) navAuthBtn.innerText = 'লগইন';
        if (adminControlBtn) adminControlBtn.style.display = 'none';
    }

    // Load countdown from database
    await loadCountdownFromDB();
}

// 🟢 FIX: Improved startCountdown function that updates the correct elements
function startCountdown(endTime) {
    // Clear any existing timer
    if (window.countdownInterval) {
        clearInterval(window.countdownInterval);
    }
    
    const timer = setInterval(() => {
        const now = new Date().getTime();
        const distance = endTime - now;

        const daysEl = document.getElementById('cd-days');
        const hoursEl = document.getElementById('cd-hours');
        const minsEl = document.getElementById('cd-mins');
        const secsEl = document.getElementById('cd-secs');

        if (distance < 0) {
            clearInterval(timer);
            if (daysEl) daysEl.innerText = '00';
            if (hoursEl) hoursEl.innerText = '00';
            if (minsEl) minsEl.innerText = '00';
            if (secsEl) secsEl.innerText = '00';
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        if (daysEl) daysEl.innerText = String(days).padStart(2, '0');
        if (hoursEl) hoursEl.innerText = String(hours).padStart(2, '0');
        if (minsEl) minsEl.innerText = String(minutes).padStart(2, '0');
        if (secsEl) secsEl.innerText = String(seconds).padStart(2, '0');
    }, 1000);
    
    window.countdownInterval = timer;
}

// 🟢 FIX: Export functions to window for global access
window.loadHomeData = loadHomeData;
window.startCountdown = startCountdown;
window.loadCountdownFromDB = loadCountdownFromDB;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadHomeData();
    });
} else {
    loadHomeData();
}

// 🟢 FIX: Also reload countdown when page becomes visible again
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        loadCountdownFromDB();
    }
});