// exam.js - Live Exam Logic
let currentQuestions = [];
let userAnswers = {};
let examDuration = 0; // in seconds
let timerInterval;

async function loadExamInfo() {
    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');
    if(!examId) return alert("কোনো এক্সাম সিলেক্ট করা হয়নি!");

    // Fetch Exam Details
    const { data: exam } = await _supabase.from('exams').select('*').eq('id', examId).single();
    // Fetch Questions
    const { data: questions } = await _supabase.from('questions').select('*').eq('exam_id', examId);
    
    currentQuestions = questions;
    examDuration = questions.length * 60; // Default 1 min per question (Admin can set this later)

    document.getElementById('exam-title').innerText = exam.title || "ATLAS Exam";
    document.getElementById('exam-subject').innerText = exam.subject;
    document.getElementById('exam-chapter').innerText = exam.chapter;
    document.getElementById('exam-total-q').innerText = questions.length;
}

function startExam() {
    document.getElementById('pre-exam-screen').style.display = 'none';
    document.getElementById('live-exam-screen').style.display = 'block';
    renderQuestions();
    startTimer();
}

function renderQuestions() {
    const qContainer = document.getElementById('questions-container');
    const navContainer = document.getElementById('nav-boxes');
    qContainer.innerHTML = ''; navContainer.innerHTML = '';

    currentQuestions.forEach((q, index) => {
        const qNum = index + 1;
        // Navigation Box
        navContainer.innerHTML += `<div class="nav-box" id="nav-${q.id}" onclick="scrollToQ('${q.id}')">${qNum}</div>`;
        
        // Question Box
        let optionsHtml = '';
        for(let i=1; i<=5; i++) {
            if(q[`option${i}`]) {
                optionsHtml += `
                    <label class="option-label" id="lbl-${q.id}-${i}" onclick="selectOption('${q.id}', ${i})">
                        <input type="radio" name="q-${q.id}" value="${i}"> 
                        ${q[`option${i}`]}
                    </label>`;
            }
        }

        qContainer.innerHTML += `
            <div class="q-box" id="qbox-${q.id}">
                <h4>${qNum}. ${q.question_text}</h4>
                ${optionsHtml}
            </div>
        `;
    });
}

function selectOption(qId, selectedOption) {
    if(userAnswers[qId]) return; // One-Time Selection (Lock)

    userAnswers[qId] = selectedOption;
    
    // UI Update
    document.getElementById(`lbl-${qId}-${selectedOption}`).classList.add('selected');
    document.getElementById(`nav-${qId}`).classList.add('answered');

    // Lock all options for this question
    for(let i=1; i<=5; i++) {
        let lbl = document.getElementById(`lbl-${qId}-${i}`);
        if(lbl) {
            lbl.classList.add('locked');
            if(i === selectedOption) lbl.innerHTML += '<span class="lock-icon">🔒</span>';
        }
    }
}

function scrollToQ(qId) {
    document.getElementById(`qbox-${qId}`).scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function startTimer() {
    let timeLeft = examDuration;
    timerInterval = setInterval(() => {
        if(timeLeft <= 0) { clearInterval(timerInterval); submitExam(); }
        
        let m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        let s = (timeLeft % 60).toString().padStart(2, '0');
        document.getElementById('live-timer').innerText = `${m}:${s}`;
        timeLeft--;
    }, 1000);
}

async function submitExam() {
    clearInterval(timerInterval);
    document.getElementById('submit-exam-btn').innerText = "সাবমিট হচ্ছে...";
    document.getElementById('submit-exam-btn').disabled = true;

    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');
    const user = JSON.parse(localStorage.getItem('atlas_user'));
    
    // Evaluation Logic
    let correct = 0, wrong = 0, skipped = 0;
    currentQuestions.forEach(q => {
        let ans = userAnswers[q.id];
        if(!ans) skipped++;
        else if(ans === q.answer) correct++;
        else wrong++;
    });

    const negativeMarks = wrong * 0.25; // Standard MCQ negative marking
    let mainScore = correct - negativeMarks;

    // 2nd Timer Deduction Logic
    if(user && user.timer_status === 'Second Timer') {
        if(currentQuestions.length <= 50) mainScore -= 1.5;
        else mainScore -= 5;
    }

    // GPA Logic
    let gpaScore = 0;
    if(user) {
        gpaScore = (parseFloat(user.ssc_gpa) * 8) + (parseFloat(user.hsc_gpa) * 12);
    }
    const scoreWithGpa = mainScore + gpaScore;

    // Save to DB
    const resultData = {
        user_id: user ? user.id : null,
        exam_id: examId,
        total_questions: currentQuestions.length,
        correct_count: correct,
        wrong_count: wrong,
        skipped_count: skipped,
        negative_marks: negativeMarks,
        score_without_gpa: mainScore,
        score_with_gpa: scoreWithGpa,
        user_answers: userAnswers
    };

    const { data, error } = await _supabase.from('exam_results').insert([resultData]).select();
    
    if(!error && data) {
        window.location.href = `result.html?result_id=${data[0].id}`;
    } else {
        alert("রেজাল্ট সেভ করতে সমস্যা হয়েছে!");
    }
}

loadExamInfo();
