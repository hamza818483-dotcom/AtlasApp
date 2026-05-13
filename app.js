// app.js - Global Logic & Session Management

// 1. Theme Toggle Logic
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
}

// Load saved theme on startup
window.onload = () => {
    const savedTheme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
    checkSession(); // Check security on load
};

// 2. Single Session Rule Validation
async function checkSession() {
    const user = JSON.parse(localStorage.getItem('atlas_user'));
    const localSession = localStorage.getItem('atlas_session');

    if (!user || !localSession) {
        // Not logged in. Redirect to auth if not on home/auth page.
        if(!window.location.href.includes('auth.html') && !window.location.href.includes('index.html')) {
            window.location.href = "auth.html";
        }
        return;
    }

    // Check DB to see if session matches
    const { data, error } = await _supabase
        .from('users')
        .select('active_session_id')
        .eq('id', user.id)
        .single();

    if (data && data.active_session_id !== localSession) {
        // Someone logged in from elsewhere
        alert("আপনার অ্যাকাউন্ট অন্য ডিভাইস থেকে লগইন করা হয়েছে। আপনাকে লগআউট করা হচ্ছে।");
        localStorage.removeItem('atlas_user');
        localStorage.removeItem('atlas_session');
        window.location.href = "auth.html";
    }
}
