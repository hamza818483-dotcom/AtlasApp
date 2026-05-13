// home.js - Home Page Specific Logic

async function loadHomeData() {
    // Show Admin/Profile buttons based on login state
    const user = JSON.parse(localStorage.getItem('atlas_user'));
    if(user) {
        document.getElementById('profile-btn').style.display = 'block';
        if(user.role === 'admin' || user.role === 'sub-admin') {
            document.getElementById('admin-btn').style.display = 'block';
        }
    }

    // Fetch App Settings for Countdown
    const { data, error } = await _supabase
        .from('app_settings')
        .select('*')
        .eq('id', 1)
        .single();

    if (data) {
        document.getElementById('cd-topic').innerText = data.countdown_topic;
        document.getElementById('cd-subtopic').innerText = data.countdown_subtopic;
        
        if(data.countdown_end) {
            startCountdown(new Date(data.countdown_end).getTime());
        } else {
            document.getElementById('countdown-timer').innerHTML = "No upcoming events.";
        }
    }
}

function startCountdown(endTime) {
    const timer = setInterval(() => {
        const now = new Date().getTime();
        const distance = endTime - now;

        if (distance < 0) {
            clearInterval(timer);
            document.getElementById('countdown-timer').innerHTML = "EXPIRED";
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        document.getElementById('days').innerText = days + "d";
        document.getElementById('hours').innerText = hours + "h";
        document.getElementById('mins').innerText = minutes + "m";
        document.getElementById('secs').innerText = seconds + "s";
    }, 1000);
}

// Initialize
loadHomeData();
