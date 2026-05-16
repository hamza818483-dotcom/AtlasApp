// ============================================
// FLUTTER_READY: Storage Layer
// Convert: SharedPreferences in Dart
// ============================================

const Storage = {
    // Session
    getSession() {
        try {
            return JSON.parse(localStorage.getItem('atlas-session'));
        } catch(e) {
            return null;
        }
    },
    
    saveSession(data) {
        localStorage.setItem('atlas-session', JSON.stringify(data));
    },
    
    clearSession() {
        localStorage.removeItem('atlas-session');
    },
    
    isLoggedIn() {
        return !!this.getSession();
    },
    
    getPhone() {
        const session = this.getSession();
        return session?.phone || null;
    },
    
    isAdmin() {
        const session = this.getSession();
        return session?.role === 'admin' || session?.phone === '01754365403';
    },
    
    isSubAdmin() {
        const session = this.getSession();
        return session?.role === 'sub_admin';
    },

    // Theme
    getTheme() {
        return localStorage.getItem('atlas-theme') || 'dark';
    },
    
    saveTheme(theme) {
        localStorage.setItem('atlas-theme', theme);
    },

    // Bookmarks
    getBookmarks() {
        const phone = this.getPhone();
        if (!phone) return {};
        try {
            return JSON.parse(localStorage.getItem('bookmarks_' + phone) || '{}');
        } catch(e) {
            return {};
        }
    },
    
    saveBookmark(qid, data) {
        const phone = this.getPhone();
        if (!phone) return;
        const bookmarks = this.getBookmarks();
        bookmarks[qid] = data;
        localStorage.setItem('bookmarks_' + phone, JSON.stringify(bookmarks));
    },
    
    removeBookmark(qid) {
        const phone = this.getPhone();
        if (!phone) return;
        const bookmarks = this.getBookmarks();
        delete bookmarks[qid];
        localStorage.setItem('bookmarks_' + phone, JSON.stringify(bookmarks));
    },

    // Class History
    getClassHistory() {
        const phone = this.getPhone();
        if (!phone) return [];
        try {
            return JSON.parse(localStorage.getItem('class_history_' + phone) || '[]');
        } catch(e) {
            return [];
        }
    },
    
    saveClassHistory(subject, chapter, part) {
        const phone = this.getPhone();
        if (!phone) return;
        const history = this.getClassHistory();
        history.push({subject, chapter, part, time: new Date().toISOString()});
        if (history.length > 50) history.splice(0, history.length - 50);
        localStorage.setItem('class_history_' + phone, JSON.stringify(history));
    },

    // AI Chat
    getChatHistory() {
        try {
            return JSON.parse(localStorage.getItem('atlas-chat') || '[]');
        } catch(e) {
            return [];
        }
    },
    
    saveChatHistory(history) {
        if (history.length > 50) history = history.slice(-50);
        localStorage.setItem('atlas-chat', JSON.stringify(history));
    },
    
    clearChatHistory() {
        localStorage.removeItem('atlas-chat');
    },

    // Avatar
    getAvatar(phone) {
        return localStorage.getItem('avatar_' + phone);
    },
    
    saveAvatar(phone, data) {
        localStorage.setItem('avatar_' + phone, data);
    },

    // Owner
    getOwner() {
        return {
            name: localStorage.getItem('owner_name') || 'ATLAS APP',
            info: localStorage.getItem('owner_info') || '',
            photo: localStorage.getItem('owner_photo') || ''
        };
    },
    
    saveOwner(name, info, photo) {
        localStorage.setItem('owner_name', name);
        localStorage.setItem('owner_info', info);
        if (photo) localStorage.setItem('owner_photo', photo);
    }
};