/* ======================================================
   UTILITY FUNCTIONS
====================================================== */

/**
 * Convert date string to Bengali date and time format
 * @param {string} s - ISO date string
 * @returns {string} Bengali formatted date and time
 */
function toBanglaDateTime(s) {
    try {
        const d = new Date(s);
        return d.toLocaleString('bn-BD', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } catch (e) {
        return s;
    }
}

/**
 * Convert date string to Bengali date only
 * @param {string} s - ISO date string
 * @returns {string} Bengali formatted date
 */
function toBanglaDate(s) {
    try {
        const d = new Date(s);
        return d.toLocaleDateString('bn-BD', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) {
        return s;
    }
}

/**
 * Convert number to Bengali numerals
 * @param {number} num - Number to convert
 * @returns {string} Bengali numeral string
 */
function toBanglaNum(num) {
    const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(num).split('').map(d => banglaDigits[parseInt(d)] || d).join('');
}

/**
 * Format time duration to Bengali
 * @param {number} seconds - Duration in seconds
 * @returns {string} Bengali formatted duration
 */
function toBanglaDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    if (mins > 0) {
        return `${toBanglaNum(mins)} মিনিট ${toBanglaNum(secs)} সেকেন্ড`;
    }
    return `${toBanglaNum(secs)} সেকেন্ড`;
}

/**
 * Get relative time in Bengali
 * @param {string} dateStr - ISO date string
 * @returns {string} Relative time in Bengali
 */
function getRelativeTimeBangla(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'এখনই';
    if (diffMins < 60) return `${toBanglaNum(diffMins)} মিনিট আগে`;
    if (diffHours < 24) return `${toBanglaNum(diffHours)} ঘন্টা আগে`;
    if (diffDays === 1) return 'গতকাল';
    if (diffDays < 7) return `${toBanglaNum(diffDays)} দিন আগে`;
    
    return toBanglaDate(dateStr);
}

/* ======================================================
   GROQ AI INTEGRATION
====================================================== */

/**
 * Call Groq API for AI explanations
 * @param {string} question - Question text
 * @param {string} answer - Correct answer
 * @param {string} userAnswer - User's answer
 * @param {string} subject - Subject name
 * @returns {Promise<string>} AI generated explanation
 */
async function getAIExplanation(question, answer, userAnswer, subject = '') {
    try {
        const prompt = `তুমি একজন শিক্ষক। নিচের MCQ প্রশ্নের উত্তর ব্যাখ্যা করো (বাংলায়):

প্রশ্ন: ${question}
সঠিক উত্তর: ${answer}
শিক্ষার্থীর উত্তর: ${userAnswer}
${subject ? `বিষয়: ${subject}` : ''}

সংক্ষিপ্ত এবং স্পষ্ট ব্যাখ্যা দাও। কেন সঠিক উত্তরটি সঠিক এবং অন্যটি ভুল তা ব্যাখ্যা করো।`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${window.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'mixtral-8x7b-32768',
                messages: [
                    { role: 'system', content: 'তুমি একজন দক্ষ শিক্ষক যিনি বাংলায় সহজভাবে ব্যাখ্যা করেন।' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 500
            })
        });

        const data = await response.json();
        return data.choices[0]?.message?.content || 'ব্যাখ্যা পাওয়া যায়নি।';
    } catch (error) {
        console.error('Groq API Error:', error);
        return 'ব্যাখ্যা লোড করতে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।';
    }
}

/**
 * Call Groq API for custom queries
 * @param {string} query - User query
 * @param {string} context - Optional context
 * @returns {Promise<string>} AI response
 */
async function askGroqAI(query, context = '') {
    try {
        const messages = [
            { role: 'system', content: 'তুমি একজন সহায়ক AI সহকারী যিনি বাংলায় উত্তর দেন।' }
        ];
        
        if (context) {
            messages.push({ role: 'system', content: `Context: ${context}` });
        }
        
        messages.push({ role: 'user', content: query });

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${window.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'mixtral-8x7b-32768',
                messages: messages,
                temperature: 0.8,
                max_tokens: 800
            })
        });

        const data = await response.json();
        return data.choices[0]?.message?.content || 'উত্তর পাওয়া যায়নি।';
    } catch (error) {
        console.error('Groq API Error:', error);
        return 'সার্ভার সমস্যা। পরে আবার চেষ্টা করুন।';
    }
}

/* ======================================================
   SUPABASE HELPERS
====================================================== */

/**
 * Report a question to Supabase
 * @param {string} questionId - Question ID
 * @param {string} examId - Exam ID
 * @param {string} reason - Report reason
 * @param {string} phone - User phone
 * @returns {Promise<boolean>} Success status
 */
async function reportQuestion(questionId, examId, reason, phone) {
    try {
        const response = await fetch(`${window.SUPABASE_URL}/rest/v1/question_reports`, {
            method: 'POST',
            headers: {
                'apikey': window.SUPABASE_KEY,
                'Authorization': `Bearer ${window.SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                question_id: questionId,
                exam_id: examId,
                reason: reason,
                phone: phone,
                reported_at: new Date().toISOString()
            })
        });

        return response.ok;
    } catch (error) {
        console.error('Report Error:', error);
        return false;
    }
}

/**
 * Add bookmark to Supabase
 * @param {object} bookmark - Bookmark data
 * @returns {Promise<boolean>} Success status
 */
async function addBookmark(bookmark) {
    try {
        const response = await fetch(`${window.SUPABASE_URL}/rest/v1/bookmarks`, {
            method: 'POST',
            headers: {
                'apikey': window.SUPABASE_KEY,
                'Authorization': `Bearer ${window.SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(bookmark)
        });

        return response.ok;
    } catch (error) {
        console.error('Bookmark Error:', error);
        return false;
    }
}

/**
 * Remove bookmark from Supabase
 * @param {string} bookmarkId - Bookmark ID
 * @returns {Promise<boolean>} Success status
 */
async function removeBookmark(bookmarkId) {
    try {
        const response = await fetch(`${window.SUPABASE_URL}/rest/v1/bookmarks?id=eq.${bookmarkId}`, {
            method: 'DELETE',
            headers: {
                'apikey': window.SUPABASE_KEY,
                'Authorization': `Bearer ${window.SUPABASE_KEY}`
            }
        });

        return response.ok;
    } catch (error) {
        console.error('Remove Bookmark Error:', error);
        return false;
    }
}

/* ======================================================
   LOCAL STORAGE HELPERS
====================================================== */

/**
 * Save data to localStorage with user prefix
 * @param {string} key - Storage key
 * @param {any} data - Data to save
 * @param {string} phone - User phone
 */
function saveToStorage(key, data, phone) {
    try {
        const storageKey = `${key}_${phone}`;
        localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (error) {
        console.error('Storage Save Error:', error);
    }
}

/**
 * Load data from localStorage with user prefix
 * @param {string} key - Storage key
 * @param {string} phone - User phone
 * @returns {any} Parsed data or null
 */
function loadFromStorage(key, phone) {
    try {
        const storageKey = `${key}_${phone}`;
        const data = localStorage.getItem(storageKey);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Storage Load Error:', error);
        return null;
    }
}

/**
 * Clear specific storage key
 * @param {string} key - Storage key
 * @param {string} phone - User phone
 */
function clearStorage(key, phone) {
    try {
        const storageKey = `${key}_${phone}`;
        localStorage.removeItem(storageKey);
    } catch (error) {
        console.error('Storage Clear Error:', error);
    }
}

/* ======================================================
   NOTIFICATION HELPERS
====================================================== */

/**
 * Send browser notification
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {string} icon - Icon URL
 */
function sendNotification(title, body, icon = '/icon.png') {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: icon,
            badge: icon
        });
    }
}

/**
 * Request notification permission
 * @returns {Promise<string>} Permission status
 */
async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        return await Notification.requestPermission();
    }
    return Notification.permission;
}

/* ======================================================
   VALIDATION HELPERS
====================================================== */

/**
 * Validate Bangladesh phone number
 * @param {string} phone - Phone number
 * @returns {boolean} Valid status
 */
function isValidBDPhone(phone) {
    const pattern = /^01[3-9]\d{8}$/;
    return pattern.test(phone);
}

/**
 * Validate email address
 * @param {string} email - Email address
 * @returns {boolean} Valid status
 */
function isValidEmail(email) {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email);
}

/**
 * Sanitize HTML string
 * @param {string} html - HTML string
 * @returns {string} Sanitized string
 */
function sanitizeHTML(html) {
    const temp = document.createElement('div');
    temp.textContent = html;
    return temp.innerHTML;
}

/* ======================================================
   MATH/CALCULATION HELPERS
====================================================== */

/**
 * Calculate percentage
 * @param {number} value - Value
 * @param {number} total - Total
 * @returns {number} Percentage
 */
function calculatePercentage(value, total) {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
}

/**
 * Calculate average
 * @param {number[]} numbers - Array of numbers
 * @returns {number} Average
 */
function calculateAverage(numbers) {
    if (!numbers.length) return 0;
    const sum = numbers.reduce((a, b) => a + b, 0);
    return sum / numbers.length;
}

/**
 * Get grade from percentage
 * @param {number} percentage - Percentage score
 * @returns {string} Grade letter
 */
function getGrade(percentage) {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B';
    if (percentage >= 60) return 'C';
    if (percentage >= 50) return 'D';
    return 'F';
}

/**
 * Get performance emoji
 * @param {number} percentage - Percentage score
 * @returns {string} Emoji
 */
function getPerformanceEmoji(percentage) {
    if (percentage >= 90) return '🌟';
    if (percentage >= 80) return '🎉';
    if (percentage >= 70) return '👍';
    if (percentage >= 60) return '✅';
    if (percentage >= 50) return '📚';
    return '💪';
}

/* ======================================================
   ARRAY/DATA HELPERS
====================================================== */

/**
 * Shuffle array randomly
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Group array by key
 * @param {Array} array - Array to group
 * @param {string} key - Key to group by
 * @returns {Object} Grouped object
 */
function groupBy(array, key) {
    return array.reduce((result, item) => {
        const group = item[key];
        if (!result[group]) result[group] = [];
        result[group].push(item);
        return result;
    }, {});
}

/**
 * Remove duplicates from array
 * @param {Array} array - Array with duplicates
 * @param {string} key - Optional key for objects
 * @returns {Array} Array without duplicates
 */
function removeDuplicates(array, key = null) {
    if (key) {
        return array.filter((item, index, self) => 
            index === self.findIndex(t => t[key] === item[key])
        );
    }
    return [...new Set(array)];
}

/* ======================================================
   DATE/TIME HELPERS
====================================================== */

/**
 * Get today's date in YYYY-MM-DD format
 * @returns {string} Today's date
 */
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Get date N days ago
 * @param {number} days - Number of days
 * @returns {Date} Date object
 */
function getDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
}

/**
 * Format seconds to MM:SS
 * @param {number} seconds - Total seconds
 * @returns {string} Formatted time
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Check if date is today
 * @param {string|Date} date - Date to check
 * @returns {boolean} Is today
 */
function isToday(date) {
    const today = new Date();
    const check = new Date(date);
    return today.toDateString() === check.toDateString();
}

/* ======================================================
   UI HELPERS
====================================================== */

/**
 * Smooth scroll to element
 * @param {string} elementId - Element ID
 */
function smoothScrollTo(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
            return true;
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        }
    } catch (error) {
        console.error('Copy Error:', error);
        return false;
    }
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function} Throttled function
 */
function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/* ======================================================
   EXPORT FOR GLOBAL USE
====================================================== */

// Make functions globally available
window.toBanglaDateTime = toBanglaDateTime;
window.toBanglaDate = toBanglaDate;
window.toBanglaNum = toBanglaNum;
window.toBanglaDuration = toBanglaDuration;
window.getRelativeTimeBangla = getRelativeTimeBangla;
window.getAIExplanation = getAIExplanation;
window.askGroqAI = askGroqAI;
window.reportQuestion = reportQuestion;
window.addBookmark = addBookmark;
window.removeBookmark = removeBookmark;
window.saveToStorage = saveToStorage;
window.loadFromStorage = loadFromStorage;
window.clearStorage = clearStorage;
window.sendNotification = sendNotification;
window.requestNotificationPermission = requestNotificationPermission;
window.isValidBDPhone = isValidBDPhone;
window.isValidEmail = isValidEmail;
window.sanitizeHTML = sanitizeHTML;
window.calculatePercentage = calculatePercentage;
window.calculateAverage = calculateAverage;
window.getGrade = getGrade;
window.getPerformanceEmoji = getPerformanceEmoji;
window.shuffleArray = shuffleArray;
window.groupBy = groupBy;
window.removeDuplicates = removeDuplicates;
window.getTodayDate = getTodayDate;
window.getDaysAgo = getDaysAgo;
window.formatTime = formatTime;
window.isToday = isToday;
window.smoothScrollTo = smoothScrollTo;
window.copyToClipboard = copyToClipboard;
window.debounce = debounce;
window.throttle = throttle;
