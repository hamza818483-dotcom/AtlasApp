// profile.js

async function loadProfile() {
    const user = JSON.parse(localStorage.getItem('atlas_user'));
    if(!user) return window.location.href = "auth.html";

    // Basic Info
    document.getElementById('p-name').innerText = user.name;
    document.getElementById('p-batch-college').innerText = `${user.hsc_batch} | ${user.college}`;
    document.getElementById('p-phone').innerText = user.phone;
    document.getElementById('p-pass').innerText = user.password;
    document.getElementById('p-ssc').innerText = user.ssc_gpa;
    document.getElementById('p-hsc').innerText = user.hsc_gpa;
    document.getElementById('p-timer').innerText = user.timer_status;

    // Load Exam History
    const { data: history } = await _supabase
        .from('exam_results')
        .select('*, exams(title, subject)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    const hList = document.getElementById('history-list');
    hList.innerHTML = '';
    if(history && history.length > 0) {
        history.forEach(h => {
            hList.innerHTML += `
                <div class="history-card">
                    <h4>${h.exams.title} (${h.exams.subject})</h4>
                    <p>স্কোর: ${h.score_without_gpa} | ভুল: <span style="color:#EF4444">${h.wrong_count}</span></p>
                    <a href="result.html?result_id=${h.id}" style="color: #3B82F6; text-decoration: none; font-weight: bold;">বিস্তারিত দেখুন</a>
                </div>
            `;
        });
    } else {
        hList.innerHTML = "<p>আপনি এখনো কোনো পরীক্ষা দেননি।</p>";
    }
}

function togglePassBlur() {
    const passEl = document.getElementById('p-pass');
    if (passEl.style.filter === 'blur(4px)') {
        passEl.style.filter = 'none';
    } else {
        passEl.style.filter = 'blur(4px)';
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.target.classList.add('active');
}

loadProfile();
